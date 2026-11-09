import os
import json
import pandas as pd
from supabase import create_client, Client
from app.ai.azure_openai import AzureOpenAIClient
from app.core.config import settings

# Setup clients
supabase_client: Client = create_client(settings.SUPABASE_URL, settings.SUPABASE_KEY)
openai_client = AzureOpenAIClient()

# System Prompt to perform dual Anonymization and Profile Extraction
ANONYMIZE_EXTRACT_PROMPT = """
You are a secure data processing assistant. You are given a raw transcript of an interview.
Your task is to perform two steps:

1. ANONYMIZE: Remove all PII (Personally Identifiable Information).
   - Replace candidate names with "Candidate" (or "Candidate X").
   - Replace specific email addresses, phone numbers, and addresses with "[REDACTED]".
   - Replace specific school names, colleges, and employer names with generic placeholders (e.g., "Tech University", "E-Commerce Firm").

2. EXTRACT CHARACTER PROFILE: Compile the candidate's traits into the following structured JSON schema:
{
  "education": "Generic education placeholder (e.g. B.S. Software Engineering at State College)",
  "background": "Brief anonymous background description",
  "internship_interests": ["Data Annotation", "Research"],
  "technical_strengths": ["Python", "Excel"],
  "transferable_strengths": ["Attention to detail", "Patience"],
  "behavioral_strengths": ["Receptive to instructions", "Independent worker"],
  "communication_preferences": ["Prefers visual tasks", "Written checklist summaries"],
  "working_style_preferences": ["Structured routines", "Asynchronous tasks"],
  "environment_preferences": ["Quiet remote setting"],
  "rephrasing_requirements": "Requires simpler sentences when terminology is abstract.",
  "processing_time_preferences": "Responds best with 5-10s processing time.",
  "example_based_learning_preferences": "Highly responsive to concrete examples.",
  "accommodation_needs": ["Extended processing time", "Clear written guidelines"],
  "career_interests": ["Data Annotation", "Technical QA"],
  "role_alignment": "Strong fit for detailed data indexing tasks.",
  "industry_preferences": ["IT Services"],
  "long_term_aspirations": "Wants to specialize in artificial intelligence annotation."
}

Do not include any normal chat text. Return ONLY the JSON object matching this schema.
"""

def redact_name(text: str, name: str) -> str:
    if not name or not isinstance(name, str) or not name.strip():
        return text
    import re
    # Clean name
    name = name.strip()
    # Replace full name first
    pattern = re.compile(re.escape(name), re.IGNORECASE)
    text = pattern.sub("[CANDIDATE]", text)
    
    # Split by spaces/hyphens and replace individual parts (e.g., first/last name)
    parts = re.split(r'[\s\-]+', name)
    for part in parts:
        part = part.strip()
        if len(part) > 2 and part.lower() not in ["the", "and", "mr.", "ms.", "mrs.", "dr."]:
            part_pattern = re.compile(r'\b' + re.escape(part) + r'\b', re.IGNORECASE)
            text = part_pattern.sub("[CANDIDATE]", text)
    return text

async def process_single_row(transcript_text: str, candidate_name: str = None):
    """Anonymizes raw text, compiles profile, generates embedding, and returns upload payload."""
    # Programmatically redact candidate name if present to guarantee no name is passed to gpt-4o
    if candidate_name:
        transcript_text = redact_name(transcript_text, candidate_name)

    # 1. Ask OpenAI to anonymize & extract JSON
    payload = {
        "messages": [
            {"role": "system", "content": ANONYMIZE_EXTRACT_PROMPT},
            {"role": "user", "content": f"### RAW TRANSCRIPT:\n{transcript_text}"}
        ],
        "max_tokens": 1200,
        "temperature": 0.2,
        "response_format": {"type": "json_object"}
    }
    
    url, headers, final_payload = openai_client._get_endpoint_details(payload)
    
    # We call the OpenAI client completions endpoint
    import httpx
    async with httpx.AsyncClient(timeout=45.0) as client:
        response = await client.post(url, json=final_payload, headers=headers)
        response.raise_for_status()
        res_data = response.json()
        
    raw_content = res_data["choices"][0]["message"]["content"].strip()
    profile_data = json.loads(raw_content)
    
    # 2. Generate descriptive summary and compute vector embedding
    profile_summary = openai_client.generate_character_summary(profile_data)
    embedding = await openai_client.create_embeddings(profile_summary)
    
    return {
        "profile_text": profile_summary,
        "embedding": embedding,
        "metadata": {
            "interests": profile_data.get("internship_interests", []),
            "strengths": profile_data.get("technical_strengths", []),
            "accommodation_needs": profile_data.get("accommodation_needs", [])
        }
    }

async def run_ingestion(excel_file_path: str, transcript_column: str):
    """Main execution block to read Excel rows and populate vector DB."""
    print(f"Reading profiles from: {excel_file_path}...")
    # Load sheet
    df = pd.read_excel(excel_file_path)
    
    success_count = 0
    
    for idx, row in df.iterrows():
        raw_transcript = row.get(transcript_column)
        if not raw_transcript or not isinstance(raw_transcript, str) or len(raw_transcript.strip()) < 50:
            print(f"Row {idx}: Skipping empty or invalid transcript.")
            continue
            
        # Extract candidate name if available to redact it before API execution
        candidate_name = None
        for col in ["CandidateName", "Candidate Name", "Name", "name", "candidatename"]:
            if col in row:
                val = row.get(col)
                if val and not pd.isna(val):
                    candidate_name = str(val)
                break
                
        print(f"Row {idx}: Ingesting and anonymizing candidate profile...")
        try:
            # Run LLM extraction
            upload_payload = await process_single_row(raw_transcript, candidate_name)
            
            # Save into vector database (Supabase)
            supabase_client.table("intern_character_embeddings").insert(upload_payload).execute()
            
            print(f"Row {idx}: Successfully registered in Vector Knowledge Base!")
            success_count += 1
        except Exception as e:
            print(f"Row {idx}: Ingestion failed with error: {e}")
            
    print(f"\nIngestion Finished! Successfully processed {success_count} profiles.")

def extract_text_from_docx(file_path: str) -> str:
    """Extracts paragraphs and tables from a docx file."""
    import docx
    doc = docx.Document(file_path)
    full_text = []
    
    # 1. Extract paragraph text
    for para in doc.paragraphs:
        if para.text.strip():
            full_text.append(para.text)
            
    # 2. Extract table cell texts (useful if dialogue is formatted as speaker grids)
    for table in doc.tables:
        for row in table.rows:
            row_text = []
            for cell in row.cells:
                cell_val = cell.text.strip()
                # Deduplicate repeated cell merges in rows
                if cell_val and cell_val not in row_text:
                    row_text.append(cell_val)
            if row_text:
                full_text.append(" | ".join(row_text))
                
    return "\n".join(full_text)

async def run_directory_ingestion(directory_path: str):
    """Reads all txt and docx files from a local directory, processes their contents, and populates vector DB."""
    print(f"Reading transcripts from directory: {directory_path}...")
    if not os.path.exists(directory_path):
        print(f"Error: Directory does not exist: {directory_path}")
        return
        
    files = [f for f in os.listdir(directory_path) if f.endswith(".txt") or f.endswith(".docx")]
    if not files:
        print("No .txt or .docx files found in the directory.")
        return
        
    success_count = 0
    for idx, filename in enumerate(files):
        file_path = os.path.join(directory_path, filename)
        print(f"File {idx+1}/{len(files)}: Processing {filename}...")
        try:
            if filename.endswith(".docx"):
                raw_transcript = extract_text_from_docx(file_path)
            else:
                with open(file_path, "r", encoding="utf-8") as f:
                    raw_transcript = f.read()
                
            if len(raw_transcript.strip()) < 50:
                print(f"File {filename}: Skipping short or empty file.")
                continue
                
            # Attempt to deduce candidate name/reference from filename for optional redaction
            # e.g., if filename is "Rahul_Rajesh.docx" or "transcript Rahul Rajesh.docx"
            candidate_name = None
            base_name = os.path.splitext(filename)[0]
            
            # Normalize and remove standard prefixes
            name_part = base_name.lower()
            for prefix in ["transcript ", "transcript_", "transcipt ", "transcipt_"]:
                if name_part.startswith(prefix):
                    name_part = name_part[len(prefix):]
                    break
            
            # If the filename contains digits (like transcript 1, transcript 12), avoid using it as a candidate name
            if name_part.strip().isdigit() or name_part.strip() == "":
                candidate_name = None
            else:
                candidate_name = name_part.replace("_", " ").replace("-", " ").title().strip()
                
            # Run LLM extraction
            upload_payload = await process_single_row(raw_transcript, candidate_name)
            
            # Save into vector database (Supabase)
            supabase_client.table("intern_character_embeddings").insert(upload_payload).execute()
            
            print(f"File {filename}: Successfully registered in Vector Knowledge Base!")
            success_count += 1
        except Exception as e:
            print(f"File {filename}: Ingestion failed with error: {e}")
            
    print(f"\nDirectory Ingestion Finished! Successfully processed {success_count} profiles.")

if __name__ == "__main__":
    # To run this script:
    # 1. Install dependencies: pip install pandas openpyxl python-docx
    # 2. Select your INGESTION_MODE below ("excel" or "directory")
    # 3. Configure paths and run: python -m app.scripts.ingest_excel_profiles
    import asyncio
    import sys
    
    # Configuration
    INGESTION_MODE = "directory"   # Choose: "excel" or "directory"
    
    # Path settings (Excel mode)
    excel_path = "C:/path/to/your/interns_recordings.xlsx"
    column_name = "TranscriptText"
    
    # Path settings (Directory mode)
    directory_path = "C:/Users/Rahul/Documents/GitHub/Jobro 2.0/interview transcripts"
    
    if INGESTION_MODE == "excel":
        if not os.path.exists(excel_path):
            print(f"Warning: Excel file not found at: {excel_path}. Please update config.")
            sys.exit(1)
        asyncio.run(run_ingestion(excel_path, column_name))
    elif INGESTION_MODE == "directory":
        if not os.path.exists(directory_path):
            print(f"Warning: Directory not found at: {directory_path}. Please update config.")
            sys.exit(1)
        asyncio.run(run_directory_ingestion(directory_path))
    else:
        print("Invalid INGESTION_MODE specified. Choose 'excel' or 'directory'.")
