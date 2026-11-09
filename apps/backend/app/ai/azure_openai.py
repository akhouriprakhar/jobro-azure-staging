from typing import Any
import httpx
import json
import logging
import asyncio

from app.core.config import settings

logger = logging.getLogger(__name__)

# Global cache to accumulate QA feedback simultaneously during the mock interview
QA_FEEDBACK_CACHE = {}


class AzureOpenAIClient:
    def __init__(self) -> None:
        # Azure OpenAI Configuration
        self.endpoint = settings.AZURE_OPENAI_ENDPOINT.rstrip("/") if settings.AZURE_OPENAI_ENDPOINT else ""
        self.key = settings.AZURE_OPENAI_KEY
        self.deployment = settings.AZURE_OPENAI_DEPLOYMENT_NAME
        self.api_version = settings.AZURE_OPENAI_API_VERSION

        # Standard OpenAI Configuration
        self.openai_key = settings.OPENAI_API_KEY
        self.openai_model = settings.OPENAI_MODEL_NAME
        self.openai_base_url = settings.OPENAI_API_BASE.rstrip("/") if settings.OPENAI_API_BASE else "https://api.openai.com/v1"

    def _get_endpoint_details(self, payload: dict) -> tuple[str, dict[str, str], dict]:
        """Resolves the URL, headers, and payload modifications for Azure OpenAI, Azure AI Foundry, or standard OpenAI."""
        use_azure = bool(self.endpoint and self.key)
        use_standard = bool(self.openai_key)

        headers = {"Content-Type": "application/json"}
        out_payload = dict(payload)

        if use_azure:
            endpoint = self.endpoint.rstrip("/")
            # Check if standard Azure OpenAI Service endpoint
            if "openai.azure.com" in endpoint:
                url = f"{endpoint}/openai/deployments/{self.deployment}/chat/completions?api-version={self.api_version}"
            elif "/api/projects/" in endpoint:
                # Azure AI Foundry Project-scoped endpoint (requires /openai/v1 and model field)
                url = f"{endpoint}/openai/v1/chat/completions"
                # For project endpoints, deployment name must be in the model payload field
                out_payload["model"] = self.deployment
            else:
                # Azure AI Foundry Serverless / Palantir Foundry / OpenAI-compatible endpoint
                if not endpoint.endswith("/chat/completions") and not endpoint.endswith("/v1/chat/completions"):
                    url = f"{endpoint}/chat/completions"
                else:
                    url = endpoint
                if self.api_version and "api-version=" not in url:
                    url += f"?api-version={self.api_version}"
            
            # Send both key formats to support different Foundry/Azure proxies
            headers["api-key"] = self.key
            headers["Authorization"] = f"Bearer {self.key}"
        elif use_standard:
            endpoint = self.openai_base_url.rstrip("/")
            if not endpoint.endswith("/chat/completions") and not endpoint.endswith("/v1/chat/completions"):
                url = f"{endpoint}/chat/completions"
            else:
                url = endpoint
            headers["Authorization"] = f"Bearer {self.openai_key}"
            out_payload["model"] = self.openai_model
        else:
            raise ValueError("No active AI configurations found. Please supply Azure OpenAI/Foundry or standard OpenAI credentials.")

        return url, headers, out_payload

    def _log_api_error(self, error: Exception, url: str, headers: dict, payload: dict) -> None:
        """Prints detailed diagnostic information for model API call failures."""
        print("====== LLM CONNECTION DIAGNOSTIC ERROR ======")
        print(f"Target URL: {url}")
        
        # Obfuscate headers for safe logging
        safe_headers = {}
        for k, v in headers.items():
            if k.lower() in ["api-key", "authorization"]:
                safe_headers[k] = f"{v[:10]}...[REDACTED]" if len(v) > 10 else "[REDACTED]"
            else:
                safe_headers[k] = v
        print(f"Request Headers: {safe_headers}")
        
        # Print a snippet of messages for context
        messages = payload.get("messages", [])
        print(f"Message Count: {len(messages)}")
        if messages:
            print(f"Last message: {messages[-1]}")
            
        if isinstance(error, httpx.HTTPStatusError):
            print(f"HTTP Status: {error.response.status_code}")
            try:
                print(f"Response Body: {error.response.text}")
            except Exception:
                print("Could not read response body.")
        else:
            print(f"Exception details: {error}")
        print("=============================================")

    async def create_chat_completion(self, prompt: str) -> str:
        payload = {
            "messages": [
                {"role": "system", "content": "You are an enterprise interview assessor."},
                {"role": "user", "content": prompt},
            ],
            "max_tokens": 450,
            "temperature": 0.4,
        }
        url, headers, final_payload = self._get_endpoint_details(payload)

        try:
            async with httpx.AsyncClient(timeout=30.0) as client:
                response = await client.post(url, json=final_payload, headers=headers)
                response.raise_for_status()
                data = response.json()
            return data["choices"][0]["message"]["content"].strip()
        except Exception as e:
            self._log_api_error(e, url, headers, final_payload)
            raise e

    async def generate_coaching_summary(self, transcript: str, cv_text: str | None = None, job_description: str | None = None) -> str:
        use_azure = bool(self.endpoint and self.key)
        use_standard = bool(self.openai_key)

        if not use_azure and not use_standard:
            return "Coaching feedback: Focus on structure, clarity, and metrics. (Fallback)"

        prompt = "You are an expert enterprise interview assessor.\n"
        if job_description:
            prompt += f"### TARGET JOB DESCRIPTION:\n{job_description}\n\n"
        if cv_text:
            prompt += f"### CANDIDATE CV/RESUME:\n{cv_text}\n\n"

        prompt += (
            "Review the candidate transcript and return a concise enterprise evaluation summary. "
            "Focus on communication, structure, confidence, and suggested coaching improvements.\n\n"
            f"### INTERVIEW TRANSCRIPT:\n{transcript}"
        )
        try:
            return await self.create_chat_completion(prompt)
        except Exception as e:
            print("Error calling LLM for coaching summary:", e)
            return "Coaching feedback: Focus on structure, clarity, and metrics. (Fallback due to API error)"

    async def generate_role_alignment(self, transcript: str, cv_text: str | None = None, job_description: str | None = None) -> str:
        use_azure = bool(self.endpoint and self.key)
        use_standard = bool(self.openai_key)

        if not use_azure and not use_standard:
            return "Role alignment: Matches core software engineering principles. (Fallback)"

        prompt = "You are an expert enterprise interview assessor.\n"
        if job_description:
            prompt += f"### TARGET JOB DESCRIPTION:\n{job_description}\n\n"
        if cv_text:
            prompt += f"### CANDIDATE CV/RESUME:\n{cv_text}\n\n"

        prompt += (
            "Analyze the transcript and determine whether the candidate aligns with a high-performing enterprise engineering role. "
            "Return a short summary and at least one recommendation for improvement.\n\n"
            f"### INTERVIEW TRANSCRIPT:\n{transcript}"
        )
        try:
            return await self.create_chat_completion(prompt)
        except Exception as e:
            print("Error calling LLM for role alignment:", e)
            return "Role alignment: Matches core software engineering principles. (Fallback due to API error)"

    def _generate_smart_fallback(
        self,
        messages: list[dict],
        cv_text: str | None = None,
        job_description: str | None = None,
        interview_mode: str | None = None,
        interviewer_persona: str | None = None,
        difficulty_level: str | None = None
    ) -> dict:
        # 1. Parse CV and JD keywords
        tech_list = ["React", "Angular", "Vue", "Node", "TypeScript", "JavaScript", "Python", "FastAPI", "Django", "Flask", "Go", "Java", "Spring", "C++", "AWS", "Azure", "GCP", "Kubernetes", "Docker", "SQL", "NoSQL", "PostgreSQL", "MongoDB", "Redis"]
        matched_tech = []
        if cv_text:
            for t in tech_list:
                if t.lower() in cv_text.lower():
                    matched_tech.append(t)
        if not matched_tech and job_description:
            for t in tech_list:
                if t.lower() in job_description.lower():
                    matched_tech.append(t)
        if not matched_tech:
            matched_tech = ["Full Stack engineering frameworks"]
            
        # Extract candidate name from CV (typically the first non-empty line)
        candidate_name = ""
        if cv_text:
            cv_lines = [l.strip() for l in cv_text.split("\n") if l.strip()]
            if cv_lines:
                first_line = cv_lines[0]
                # Heuristic: the first line is usually the name if it's short and doesn't contain common header words
                skip_words = ["resume", "curriculum", "vitae", "cv", "objective", "summary", "experience", "education", "http", "www", "@"]
                if len(first_line) < 60 and not any(w in first_line.lower() for w in skip_words):
                    candidate_name = first_line.split("|")[0].split("–")[0].split("-")[0].strip(" ,.")

        # Extract potential Job Title from Job Description or default
        target_role = "Software Engineer"
        if job_description:
            lines = [l.strip() for l in job_description.split("\n") if l.strip()]
            for line in lines[:3]:
                if any(k in line.lower() for k in ["role", "title", "position", "engineer", "developer", "architect", "manager"]):
                    target_role = line.split(":")[-1].strip()
                    break
            if target_role == "Software Engineer" and len(lines) > 0:
                if len(lines[0]) < 50:
                    target_role = lines[0]
                    
        # Extract potential project name / highlight from CV
        project_name = "key system architecture"
        if cv_text:
            lines = [l.strip() for l in cv_text.split("\n") if l.strip()]
            for line in lines:
                if "project" in line.lower() or "developed" in line.lower() or "built" in line.lower():
                    words = [w for w in line.split() if len(w) > 4]
                    if len(words) > 2:
                        project_name = " ".join(words[:4]).strip(" -:,.")
                        break

        # Extract company names from CV
        company_name = ""
        if cv_text:
            lines = [l.strip() for l in cv_text.split("\n") if l.strip()]
            for line in lines:
                if any(k in line.lower() for k in ["at ", "company", "inc", "ltd", "corp", "technologies", "solutions", "labs"]):
                    # Take the line as a rough company reference
                    company_name = line.split("|")[0].split("–")[0].split("-")[0].strip(" ,.")[:40]
                    break

        # Build a personalized greeting prefix
        name_greeting = f", {candidate_name.split()[0]}" if candidate_name else ""
        
        # Prefix for dialog depending on interviewer persona
        persona_prefix = f"[{interviewer_persona or 'Technical Interviewer'}]: "

        # Calculate turns (stage)
        user_turns = [m for m in messages if m["role"] == "user"]
        num_turns = len(user_turns)
        diff_label = f" ({difficulty_level})" if difficulty_level else ""
        
        # Build stages and sample options based on CV
        if num_turns <= 0:
            resp = (
                f"{persona_prefix}Welcome{name_greeting}! I am Jobro AI, conducting your {interview_mode or 'Technical Interview'}{diff_label} today. "
                f"I'm very excited to learn more about your background. I noticed from your profile that you've got solid "
                f"experience with {', '.join(matched_tech[:3])}"
                f"{f' and your work on {project_name}' if project_name != 'key system architecture' else ''}. "
                f"Can you start by introducing yourself and walking me through your background "
                f"for the '{target_role}' position?"
            )
            opts = [
                f"Sure! I'm a Software Engineer with a focus on building robust architectures using {', '.join(matched_tech[:2])}.",
                f"Hello! I specialize in full stack development. I've designed several cloud solutions using {matched_tech[0] if matched_tech else 'modern stacks'}.",
                f"Hi there! I love tackling complex scaling challenges and leading technical features from ideation to delivery."
            ]
        elif num_turns == 1:
            tech = matched_tech[0] if matched_tech else "core architecture"
            resp = (
                f"{persona_prefix}That's a very clear overview! Let's dive deeper into the technical domain. "
                f"In your profile, you mentioned working with {tech} and leading development on project areas like '{project_name}'. "
                f"Could you elaborate on the architecture of that project, your specific role, and why you selected this technology stack?"
            )
            opts = [
                f"We chose a microservices design with {tech} because it scaled independently and reduced api response latency.",
                f"My role was designing the central database schema and setting up secure backend endpoints, maximizing throughput.",
                f"We opted for this setup because of its robust ecosystem and developer productivity, enabling rapid iteration."
            ]
        elif num_turns == 2:
            resp = (
                f"{persona_prefix}I appreciate the technical depth there! For this '{target_role}' role, managing stakeholders, non-technical requirements, "
                f"or cross-team dependencies is key. Can you tell me about a behavioral scenario where you faced constraint issues or "
                f"differing engineering opinions, and how you drove alignment to deliver?"
            )
            opts = [
                "I set up a direct feedback loop and ran small prototype benchmarks to align conflicting tech viewpoints objectively.",
                "We prioritized delivery via an MVP roadmap, allowing stakeholder alignment on scope reductions for early feedback.",
                "I communicated technical trade-offs using business impact metrics, getting full support from non-technical stakeholders."
            ]
        elif num_turns == 3:
            tech = matched_tech[0] if matched_tech else "services"
            resp = (
                f"{persona_prefix}Excellent highlight of collaborative leadership! Let's throw in a challenging technical edge case: "
                f"If the system you built for '{project_name}' using {tech} experienced a sudden 10x traffic spike or a downstream service outage, "
                f"what safety mechanisms, caching layers, or scaling patterns would you introduce to guarantee high availability?"
            )
            opts = [
                "I would implement a Redis caching layer for read bottlenecks, alongside autoscaling triggers to scale out containers.",
                "I would set up a circuit breaker pattern (graceful fallback) and utilize SQS queues to buffer intense traffic spikes.",
                "I would employ rate-limiting policies at the API Gateway level to guarantee fair resource allocation during surges."
            ]
        else:
            resp = (
                f"{persona_prefix}That was an exceptional explanation of mitigation strategies! We've covered your background, deep technical design, "
                f"behavioral alignment, and edge-case scaling for this {interview_mode or 'session'}. I have all the signals needed to compile your assessment. "
                f"Please click the red **'End Interview & Get Feedback'** button at the top of your screen to generate your comprehensive performance report card."
            )
            opts = [
                "Thank you! I'm ready to review the comprehensive mock assessment report.",
                "Excellent session! Let's wrap up and dive into the detailed dashboard feedback.",
                "Let's finalize this mock interview and see the dynamic scoring dashboard."
            ]
        return {"response": resp, "options": opts}

    def _generate_smart_feedback(
        self,
        messages: list[dict],
        cv_text: str | None = None,
        job_description: str | None = None,
        interview_mode: str | None = None,
        interviewer_persona: str | None = None,
        difficulty_level: str | None = None
    ) -> dict:
        # Analyze user answers
        user_messages = [msg for msg in messages if msg["role"] == "user"]
        total_chars = sum(len(msg["content"]) for msg in user_messages)
        avg_len = total_chars / len(user_messages) if user_messages else 0
        
        tech_list = ["React", "Angular", "Vue", "Node", "TypeScript", "JavaScript", "Python", "FastAPI", "Django", "Flask", "Go", "Java", "Spring", "AWS", "Kubernetes", "SQL", "NoSQL"]
        matched_tech = []
        if cv_text:
            for t in tech_list:
                if t.lower() in cv_text.lower():
                    matched_tech.append(t)
        if not matched_tech:
            matched_tech = ["Modern Software Architectures"]
            
        target_role = "Software Engineer"
        if job_description:
            lines = [l.strip() for l in job_description.split("\n") if l.strip()]
            for line in lines[:3]:
                if any(k in line.lower() for k in ["role", "title", "position", "engineer", "developer", "architect"]):
                    target_role = line.split(":")[-1].strip()
                    break
 
        length_eval = "Candidate gave detailed, professional, and descriptive responses, showing depth."
        if avg_len < 50:
            length_eval = "Candidate gave very brief or conversational replies. Needs to practice elaborating on engineering specifics and business metrics."
            
        report = (
            f"# MOCK INTERVIEW ASSESSMENT REPORT\n\n"
            f"**Interview Mode**: {interview_mode or 'General Assessment'}\n"
            f"**Interviewer Persona**: {interviewer_persona or 'Technical Interviewer'}\n"
            f"**Difficulty Level**: {difficulty_level or 'Senior'}\n\n"
            f"### 1. Key Accomplishments & Strengths\n"
            f"- Strong technical understanding and experience in {', '.join(matched_tech[:3])}.\n"
            f"- Clear communication of architectural patterns and engineering goals.\n"
            f"- Good demonstration of ownership and collaborative leadership.\n\n"
            f"### 2. Technical Capabilities & Resume Alignment\n"
            f"- High alignment with the requirements of the **{target_role}** role.\n"
            f"- Successfully explained real-world project contributions matching key CV elements.\n"
            f"- {length_eval}\n\n"
            f"### 3. Areas for Improvement & Actionable Advice\n"
            f"- **Use the STAR Method**: Structure answers strictly with a clear Situation, Task, Action taken, and final quantitative Result.\n"
            f"- **Elaborate on System Edge Cases**: Include more metrics regarding latency, load times, query optimization, or scale limits.\n"
            f"- **Highlight Business Value**: Don't just say what was built; explain the direct business impact (e.g. reduced server costs by X%, saved Y engineering hours).\n\n"
            f"### 4. Communication & Pacing Analysis\n"
            f"- Professional, calm, and collaborative tone.\n"
            f"- Good conversational flow, receptive to follow-up questions."
        )
        
        # 1. Count user answers and calculate base scores
        user_messages = [msg for msg in messages if msg["role"] == "user"]
        num_answers = len(user_messages)

        base_tech = 85
        base_comm = 80
        base_lead = 75
        base_prob = 82
        base_conf = 80

        # Apply relevance / brevity deductions
        for msg in user_messages:
            content = msg.get("content", "").strip()
            if len(content) < 30:
                base_tech -= 15
                base_comm -= 10
                base_prob -= 15
                base_conf -= 10
            elif any(w in content.lower() for w in ["skip", "don't know", "no idea", "pass"]):
                base_tech -= 20
                base_prob -= 20
                base_conf -= 15

        # Enforce lower bound limits
        base_tech = max(30, base_tech)
        base_comm = max(30, base_comm)
        base_lead = max(30, base_lead)
        base_prob = max(30, base_prob)
        base_conf = max(30, base_conf)

        # Scale down for incomplete interviews (less than 5 answers)
        completion_rate = min(1.0, max(0.2, num_answers / 5.0))
        final_tech = round(base_tech * completion_rate)
        final_comm = round(base_comm * completion_rate)
        final_lead = round(base_lead * completion_rate)
        final_prob = round(base_prob * completion_rate)
        final_conf = round(base_conf * completion_rate)

        suggested_improvements = []
        for idx in range(len(messages)):
            if messages[idx]["role"] == "user" and idx > 0:
                question = messages[idx-1].get("content", "").strip()
                ans = messages[idx].get("content", "").strip()
                if ans and question:
                    # Determine in-depth suggestions based on question keywords
                    q_lower = question.lower()
                    if any(w in q_lower for w in ["introduce", "background", "yourself", "welcome", "join"]):
                        rating = "Good" if len(ans) >= 50 else "Needs Improvement"
                        mistakes = "Lacked a structured professional timeline and didn't mention specific quantifiable metrics or target technology highlights."
                        suggestions = "Structure your response with: years of experience, core technical stack (e.g. React/FastAPI), a signature project highlight, and direct alignment to the target job description."
                        sug = (
                            "I am a Full Stack Software Engineer with over 3 years of experience specializing in building high-performance systems with React, Node.js, and Python. "
                            "In my previous role at Orchvate, I led the development of a real-time multimodal AI interview coaching platform, which scaled to handle thousands of candidate sessions. "
                            "By optimizing connection pools and using caching, I improved overall server reliability by 30%. I'm excited to apply my background in real-time streaming "
                            "and robust API design to deliver developer-friendly enterprise solutions here."
                        )
                    elif any(w in q_lower for w in ["project", "architecture", "technical", "stack", "deep dive", "design"]):
                        rating = "Good" if len(ans) >= 70 else "Needs Improvement"
                        mistakes = "Focused on tool names without explaining system bottlenecks, scaling limitations, or database design decisions."
                        suggestions = "Use the STAR method. Describe the before/after state, outline technical trade-offs (e.g., SQL vs NoSQL, polling vs websockets), and detail latency/throughput gains."
                        sug = (
                            "In my last technical project, we faced a major API write bottleneck on our Postgres database when throughput reached 2,000 requests per second. "
                            "I redesigned the database layer by implementing connection pooling, write-optimized indexing, and a Redis caching cluster in front of high-traffic endpoints. "
                            "This reduced average page load latency from 450ms to 90ms and scaled our user capacity by 3x. I also structured our CI/CD pipelines to run automated "
                            "bench testing, reducing deployment regressions by 40%."
                        )
                    elif any(w in q_lower for w in ["collaborate", "stakeholder", "conflict", "opinion", "alignment", "unexpected"]):
                        rating = "Good" if len(ans) >= 60 else "Needs Improvement"
                        mistakes = "Did not demonstrate empathy or structured compromise. Lacked details on how technical trade-offs were explained to business teams."
                        suggestions = "Describe a specific disagreement, focus on how you gathered objective benchmarks, and explain how you aligned product objectives with engineering timelines."
                        sug = (
                            "When our design and product teams requested a major scope pivot mid-sprint to add real-time features, our engineering team was concerned about timeline risks. "
                            "I organized a cross-functional alignment session. I mapped out the feature's technical complexity and presented three MVP options with concrete timelines. "
                            "We agreed on a phased release plan: launching the core interface first, followed by incremental sync features. This kept the team motivated and allowed us to "
                            "deliver on time with high quality."
                        )
                    elif any(w in q_lower for w in ["spike", "traffic", "outage", "outages", "availability", "mitigation", "circuit breaker", "safety"]):
                        rating = "Good" if len(ans) >= 60 else "Needs Improvement"
                        mistakes = "Lacked specific system recovery patterns or failover architecture mechanisms."
                        suggestions = "Incorporate robust patterns like circuit breakers, rate limiting, message queues (SQS/RabbitMQ), and database read replicas."
                        sug = (
                            "To handle a sudden 10x traffic surge or service outage, my architecture utilizes an API Gateway with active rate-limiting and a token-bucket algorithm to throttle "
                            "abusive requests. Downstream, I implement the Circuit Breaker pattern using a library like Resilience4j to fail fast and serve cached fallbacks during database load spikes. "
                            "For heavy asynchronous jobs, we offload processing to an Amazon SQS queue, allowing workers to scale out horizontally via Auto Scaling Groups based on queue depth."
                        )
                    else:
                        rating = "Good" if len(ans) >= 50 else "Needs Improvement"
                        mistakes = "Response lacked quantitative metrics or specific architectural design patterns."
                        suggestions = "Structure your answer with the STAR framework (Situation, Task, Action, Result) and state clear quantitative results."
                        sug = (
                            "To address this scenario, I conducted benchmark testing to compare resource usage. I set up database connection pooling to optimize queries and "
                            "introduced a Redis cache. As a result, throughput increased by 25%, resource utilization dropped by 15%, and we successfully met our release timeline."
                        )
                    suggested_improvements.append({
                        "question": question[:150] + ("..." if len(question) > 150 else ""),
                        "candidate_answer": ans,
                        "rating": rating,
                        "mistakes": mistakes,
                        "suggestions": suggestions,
                        "suggested_answer": sug
                    })

        if not suggested_improvements:
            suggested_improvements.append({
                "question": "Tell me about yourself.",
                "candidate_answer": "I worked in marketing.",
                "rating": "Needs Improvement",
                "mistakes": "The summary was too brief and did not highlight marketing tool mastery or outcomes.",
                "suggestions": "Structure your background. State what campaigns you led, what analytics tools you used, and what metrics you achieved.",
                "suggested_answer": "I worked in a marketing internship where I supported campaign planning and content creation. I collaborated with the design team and learned how marketing campaigns are executed."
            })

        areas_for_improvement = ["Use the STAR Method", "Elaborate on System Edge Cases", "Highlight Business Value"]
        if num_answers < 5:
            areas_for_improvement.append(f"Complete all questions. The interview was ended early (only {num_answers}/5 questions answered), which reduced your score.")

        return {
            "technical_depth_score": final_tech,
            "communication_score": final_comm,
            "leadership_score": final_lead,
            "problem_solving_score": final_prob,
            "confidence_score": final_conf,
            "areas_for_improvement": areas_for_improvement,
            "what_went_well": [
                "Good core explanation of experience details.",
                "Warm tone and collaborative conversational cadence."
            ],
            "suggested_improvements": suggested_improvements,
            "detailed_feedback": report
        }

    def _parse_llm_json_response(self, content: str) -> dict:
        try:
            clean_content = content.strip()
            if clean_content.startswith("```json"):
                clean_content = clean_content[7:]
            if clean_content.endswith("```"):
                clean_content = clean_content[:-3]
            clean_content = clean_content.strip()
            
            parsed = json.loads(clean_content)
            if isinstance(parsed, dict):
                return parsed
        except Exception as e:
            print("Error parsing LLM json response:", e)
        
        # Fallback if parsing fails - treat the entire content as the question/response and generate 3 fallback options
        return {
            "response": content,
            "options": [
                "Could you elaborate on the technical stack implementation details?",
                "I'd like to share an example of how we scaled this system to handle high load.",
                "Let's focus on how I coordinated with stakeholders to define requirements."
            ]
        }

    async def generate_system_prompt(
        self,
        cv_text: str | None = None,
        job_description: str | None = None,
        interview_mode: str | None = None,
        interviewer_persona: str | None = None,
        difficulty_level: str | None = None,
        years_of_experience: str | None = None
    ) -> str:
        use_azure = bool(self.endpoint and self.key)
        use_standard = bool(self.openai_key)

        if not use_azure and not use_standard:
            return "You are an AI interviewer."

        # Build instruction for GPT-4o to generate a system prompt
        meta_prompt = (
            "You are an expert AI Prompt Engineer and Interview System Prompt Architect.\n"
            "Your goal is to generate a comprehensive, highly effective, and tailored 'System Prompt' (system instruction) "
            "for an AI Interviewer. The system prompt you generate will instruct the AI Interviewer on how to conduct a "
            "realistic mock interview for a candidate.\n\n"
            "Based on the following input parameters, generate a customized 'System Prompt':\n"
            f"1. **Interview Mode**: {interview_mode or 'General Assessment'}\n"
            f"2. **Interviewer Persona**: {interviewer_persona or 'Technical Recruiter'}\n"
            f"3. **Difficulty Level**: {difficulty_level or 'Senior'}\n"
            f"4. **Target Candidate Experience Level / Years of Experience**: {years_of_experience or 'N/A'}\n"
            f"5. **Target Job Description**: {job_description or 'General Software Role'}\n"
            f"6. **Candidate CV**: {cv_text or 'N/A'}\n\n"
            "Guidelines for the generated system prompt:\n"
            "- It should instruct the AI on its interviewer persona, tone (e.g. conversational, challenging, supportive, or rigid), and questioning style.\n"
            "- It should define the evaluation focus area matching the interview mode and target job description.\n"
            "- It should specify the difficulty level behaviors (Junior = simple, helpful; Mid = balanced; Senior/Leadership = challenging, complex architecture, scaling, stakeholder conflict, aggressive assumptions).\n"
            "- It should instruct the AI to reference the candidate's actual projects, achievements, and technology stack from their CV.\n"
            "- CRITICAL STRUCTURE & ENDING: The generated system prompt MUST instruct the AI interviewer that the interview has a strict structure consisting of EXACTLY 4 questions. The AI must track the current question number in its internal context. On the 4th answer from the candidate, the AI must NOT ask any more questions, but instead warmly wrap up the interview (e.g. 'Thank you, this concludes our practice session. Please click the End Interview button to review your detailed feedback report.'). It is extremely important that the interview does not continue indefinitely.\n"
            "Focus on making the generated system prompt highly detailed, professional, and clear. Output ONLY the generated system prompt itself. Do not wrap in markdown quotes or add any meta-commentary."
        )

        try:
            return await self.create_chat_completion(meta_prompt)
        except Exception as e:
            print("Error generating dynamic system prompt:", e)
            return (
                f"You are Jobro AI. Conduct a mock interview. Persona: {interviewer_persona}. "
                f"Mode: {interview_mode}. Difficulty: {difficulty_level}. "
                f"CRITICAL: Keep the interview strictly structured to exactly 5 questions. Wrap up the interview warmly on the 5th response, telling the candidate to click the End Interview button to review their feedback report."
            )

    async def chat_response(
        self,
        messages: list[dict],
        cv_text: str | None = None,
        job_description: str | None = None,
        interview_mode: str | None = None,
        interviewer_persona: str | None = None,
        difficulty_level: str | None = None,
        system_prompt: str | None = None
    ) -> dict:
        use_azure = bool(self.endpoint and self.key)
        use_standard = bool(self.openai_key)

        if not use_azure and not use_standard:
            return self._generate_smart_fallback(
                messages=messages,
                cv_text=cv_text,
                job_description=job_description,
                interview_mode=interview_mode,
                interviewer_persona=interviewer_persona,
                difficulty_level=difficulty_level
            )

        if system_prompt:
            system_instruction = (
                f"{system_prompt}\n\n"
                "CRITICAL: You MUST respond in JSON format ONLY, matching this schema:\n"
                "{\n"
                "  \"response\": \"Your next question or interview statement (as a string).\",\n"
                "  \"options\": [\n"
                "     \"Sample response option 1 written from candidate's perspective based on their CV.\",\n"
                "     \"Sample response option 2 written from candidate's perspective based on their CV.\",\n"
                "     \"Sample response option 3 written from candidate's perspective based on their CV.\"\n"
                "  ]\n"
                "}\n"
                "Guidelines for the 'options' list:\n"
                "- Ground the options in the candidate's CV/Resume and target Job Description details.\n"
                "- Do NOT use placeholders under any circumstances (e.g. do NOT use '[Company Name]', '[Year]', '[Project Name]', etc.). Use actual details or natural-sounding mock details instead.\n"
                "- Keep options short, conversational, and direct (max 35 words per option).\n"
                "Do not output any introductory or concluding text outside of this JSON.\n\n"
            )
        else:
            # Define persona profiles as hiring managers
            persona_instructions = {
                "Senior Software Engineer": (
                    "INTERVIEWER PERSONA: Engineering Hiring Manager (Senior Software Engineer level)\n"
                    "ROLE: You are an experienced engineering manager who has personally built and scaled large systems. "
                    "Your tone is direct, analytical, and peer-to-peer. You evaluate technical architecture decisions, "
                    "code design trade-offs, unit/integration testing strategies, handling of technical debt, system outages, and code review disputes."
                ),
                "AI Architect": (
                    "INTERVIEWER PERSONA: AI/ML Architect Hiring Manager\n"
                    "ROLE: You are a principal AI architect hiring for your core AI engineering team. "
                    "Your tone is highly specialized, analytical, and conceptual. You focus on ML/AI system pipelines, "
                    "model scale limitations, data drift, production latency, vector database optimization, compute costs, model safety, and model governance."
                ),
                "Delivery Manager": (
                    "INTERVIEWER PERSONA: Director of Delivery / Agile Leader\n"
                    "ROLE: You are a senior delivery director hiring a lead for key projects. "
                    "Your tone is pragmatic, process-oriented, and focused on delivery risk. You evaluate roadmap forecasting, "
                    "resolving dependencies, scope management under tight deadlines, managing team capacity, cross-team conflicts, and engineering velocity."
                ),
                "HR Recruiter": (
                    "INTERVIEWER PERSONA: Talent Acquisition Lead\n"
                    "ROLE: You are a talent partner evaluating cultural fit and motivation. "
                    "Your tone is empathetic, warm, and highly conversational. You evaluate work history alignment, career transition motives, "
                    "collaboration under pressure, conflict resolution, feedback receptiveness, and behavioral metrics."
                ),
                "Product Manager": (
                    "INTERVIEWER PERSONA: Director of Product Management\n"
                    "ROLE: You are a hiring product leader. "
                    "Your tone is vision-driven, customer-centric, and business-focused. You focus on customer problems, product-market fit, "
                    "MVP scope trade-offs, engineering/PM collaboration, user feedback conflicts, and balancing tech debt with feature velocity."
                ),
                "AI Strategy Consultant": (
                    "INTERVIEWER PERSONA: Consulting Partner (AI Strategy & Solutions)\n"
                    "ROLE: You are a consulting partner evaluating strategy advisors. "
                    "Your tone is business-focused, strategic, and client-centric. You focus on identifying high-ROI AI use cases, "
                    "build vs buy options, regulatory/compliance implications, ROI/KPI definitions, and governance policies for enterprise clients."
                ),
            }

            # Define interview type goals
            mode_instructions = {
                "Technical Interview": (
                    "INTERVIEW TYPE: Technical Interview\n"
                    "EVALUATION CRITERIA: Technical Architecture, Performance Optimization, Scalability, Code Quality, Security, and Edge Cases."
                ),
                "Techno-Managerial Interview": (
                    "INTERVIEW TYPE: Techno-Managerial Interview\n"
                    "EVALUATION CRITERIA: Engineering Architecture, Project Timelines, Agile Delivery, Technical Debt Management, and Stakeholder Communication."
                ),
                "HR Interview": (
                    "INTERVIEW TYPE: HR Interview\n"
                    "EVALUATION CRITERIA: Behavioral Fit, Core Values, Collaboration, Resilience, Long-term Vision, and Motivation."
                ),
                "Leadership Interview": (
                    "INTERVIEW TYPE: Leadership Interview\n"
                    "EVALUATION CRITERIA: Strategic Vision, Mentorship and Coaching, Technical Roadmap Planning, Execution Velocity, and Organizational Impact."
                ),
                "AI Strategy Consulting Interview": (
                    "INTERVIEW TYPE: AI Strategy Consulting Interview\n"
                    "EVALUATION CRITERIA: AI Use-case Identification, Build vs Buy Analysis, Data Privacy & Governance, ROI Calculations, and Deployment Workflows."
                ),
            }

            # Resolve instructions with defaults if none selected or matched
            persona_str = persona_instructions.get(interviewer_persona, (
                "INTERVIEWER PERSONA: Technical Hiring Manager\n"
                "Your tone is professional, objective, and constructive. Assess the candidate's core skills and logic."
            ))
            mode_str = mode_instructions.get(interview_mode, (
                "INTERVIEW TYPE: General Assessment Interview\n"
                "EVALUATION CRITERIA: General Technical Depth, Communication Skills, Problem Solving, and Leadership potential."
            ))

            # Resolve difficulty level parameters
            diff_str = (difficulty_level or "Senior").strip().capitalize()
            if diff_str not in ["Junior", "Mid", "Senior", "Leadership"]:
                diff_str = "Senior"

            difficulty_instructions = {
                "Junior": (
                    "INTERVIEW DIFFICULTY LEVEL: Junior\n"
                    "- Scenario Complexity: Low. Focus on basic technical execution, task completion, and collaboration within a team.\n"
                    "- Guidance: High. Provide structural framing and hints if the candidate gets stuck or gives brief answers. Keep expectations simple."
                ),
                "Mid": (
                    "INTERVIEW DIFFICULTY LEVEL: Mid\n"
                    "- Scenario Complexity: Medium. Focus on ownership of features, moderate technical decisions, and standard trade-offs.\n"
                    "- Guidance: Moderate. Help clarify constraints but expect them to propose a viable solution with minimal hand-holding."
                ),
                "Senior": (
                    "INTERVIEW DIFFICULTY LEVEL: Senior\n"
                    "- Scenario Complexity: High. Focus on architecture decisions, high scale, multi-system integrations, stakeholder disputes, and structural trade-offs.\n"
                    "- Guidance: Low. Expect full ownership, solid rationale, and robust alternatives without prompting."
                ),
                "Leadership": (
                    "INTERVIEW DIFFICULTY LEVEL: Leadership\n"
                    "- Scenario Complexity: Enterprise / Strategic. Focus on system portfolio, organizational alignment, budgeting/resource trade-offs, team-wide patterns, long-term roadmaps, and business OKRs.\n"
                    "- Guidance: Minimal. Challenge assumptions aggressively, expect strategic foresight and commercial awareness."
                ),
            }
            diff_instr_str = difficulty_instructions[diff_str]

            question_mix_and_escalation_instructions = (
                "### QUESTION MIX & ESCALATION RULES:\n"
                "You MUST follow these rules when deciding your next response:\n"
                "1. **Question Mix**: Over the course of the interview, maintain this balance:\n"
                "   - 70% Practical / Case/Scenario-Based: Present real-world situation/crisis (e.g. system outages, stakeholder conflict, budget limits, scaling bottlenecks) and ask the candidate what they would do.\n"
                "   - 20% CV Deep Dive: Probe into specific stated achievements, projects, or metrics listed on their CV (e.g., 'In Acme Corp, you mentioned migrating database X, how did you handle data consistency during the switch?').\n"
                "   - 10% Pure Theory: Assess fundamentals and definitions only if necessary, but keep it contextualized.\n"
                "2. **Challenge Escalation Logic**: Analyze the candidate's last answer in the history:\n"
                "   - If they gave a strong, well-reasoned answer: ESCALATE the challenge. Immediately introduce a new constraint, scale the requirements by 10x, challenge an assumption they made, or inject a stakeholder/team conflict. Force them to deal with a realistic roadblock.\n"
                "   - If they gave a weak or incomplete answer: guide them, re-evaluate their assumption constructively, or ask a clarifying question referencing their CV to help them recover."
            )
                
            system_instruction = (
                "You are Jobro AI, an elite AI Recruiter and Interview Preparation Assistant.\n"
                "Your goal is to conduct a high-fidelity, intellectually rigorous mock interview tailored to the candidate's background and target role.\n\n"
                f"### ROLE & SCENARIO PROFILE:\n"
                f"{persona_str}\n\n"
                f"### ASSESSMENT PROTOCOL:\n"
                f"{mode_str}\n\n"
                f"### DIFFICULTY LEVEL SETTING:\n"
                f"{diff_instr_str}\n\n"
                f"{question_mix_and_escalation_instructions}\n\n"
                "CRITICAL: You MUST respond in JSON format ONLY, matching this schema:\n"
                "{\n"
                "  \"response\": \"Your next question or interview statement (as a string).\",\n"
                "  \"options\": [\n"
                "     \"Sample response option 1 written from candidate's perspective based on their CV.\",\n"
                "     \"Sample response option 2 written from candidate's perspective based on their CV.\",\n"
                "     \"Sample response option 3 written from candidate's perspective based on their CV.\"\n"
                "  ]\n"
                "}\n"
                "Do not output any introductory or concluding text outside of this JSON.\n"
            )
            
            if job_description:
                system_instruction += f"### TARGET JOB DESCRIPTION:\n{job_description}\n\n"
            if cv_text:
                system_instruction += f"### CANDIDATE CV/RESUME:\n{cv_text}\n\n"
                
        system_instruction += (
            "### CV-GROUNDED PERSONALIZATION (MANDATORY):\n"
            "You MUST deeply analyze the CANDIDATE CV/RESUME above and extract the following:\n"
            "1. **Candidate Name**: Find the candidate's full name from the top of the CV. Address them BY NAME in your very first message "
            "(e.g. 'Welcome, Rahul!' or 'Hi Sarah, great to have you here'). Continue using their first name naturally throughout the conversation.\n"
            "2. **Projects & Products**: Identify every project, product, system, or application the candidate has built or contributed to. "
            "Ask questions that reference these SPECIFIC projects by name (e.g. 'You mentioned building the Inventory Forecasting Pipeline — "
            "can you walk me through the architecture?').\n"
            "3. **Work Experience & Companies**: Note every company, role title, and tenure. Reference these when framing questions "
            "(e.g. 'During your time as a Backend Engineer at Acme Corp...').\n"
            "4. **Technologies & Skills**: Extract the exact tech stack, frameworks, languages, and tools listed. Ask questions about "
            "technologies THEY actually used, not generic ones.\n"
            "5. **Achievements & Metrics**: Identify any quantifiable outcomes (e.g. 'reduced latency by 40%', 'scaled to 1M users'). "
            "Probe deeper into HOW they achieved these specific results.\n\n"
            "⚠️ NEVER ask generic, textbook interview questions that ignore the CV. Every question you ask must clearly connect to "
            "something specific in the candidate's resume — a project name, a company, a technology, or a stated achievement. "
            "If the CV mentions 'Built a real-time analytics dashboard using React and D3.js', ask about THAT dashboard, not about "
            "'a time you built a frontend application'.\n\n"
            "### MEMORY & CONTEXT RETENTION:\n"
            "You have access to the full conversation history. You MUST:\n"
            "- Remember previous questions and answers.\n"
            "- Generate contextual follow-up questions instead of disjointed topics.\n"
            "- Avoid repetitive questioning at all costs.\n\n"
            "### ADAPTIVE QUESTIONING LOGIC:\n"
            "Dynamically adjust your questioning behavior based on the quality of the candidate's LAST response:\n"
            "- Strong answers -> Ask deeper technical or strategic probing questions about the SAME project or a related one from their CV.\n"
            "- Weak answers -> Ask clarifying questions referencing specific CV details to help them elaborate.\n"
            "- Incomplete answers -> Ask follow-up exploration questions tied to the project or role they were discussing.\n"
            "- Incorrect assumptions -> Use corrective probing to challenge their assumption politely, grounding it in their stated experience.\n\n"
            "### DYNAMIC INTERVIEW STAGES LIFE-CYCLE:\n"
            "Analyze the conversation history length to determine the current stage and proceed logically:\n"
            "1. Stage 1: Welcome & Intro (First Turn) -> Greet the candidate BY NAME (extracted from CV). Mention 1-2 impressive highlights "
            "from their resume (e.g. a notable company, a key project, or a strong tech skill). Ask them to walk you through their career journey.\n"
            "2. Stage 2: Technical Deep-Dive (Turns 2-3) -> Pick a SPECIFIC project or system from their CV by name. Ask a challenging "
            "technical question about the architecture, technology choices, or trade-offs they made on THAT particular project.\n"
            "3. Stage 3: Behavioral STAR Evaluation (Turns 4-5) -> Transition to a behavioral scenario, but frame it around a real situation "
            "from their work history (e.g. 'At [Company X], when you were leading [Project Y], did you face any cross-team challenges?').\n"
            "4. Stage 4: Rigorous Edge Case Probe (Turn 6) -> Reference a specific technical implementation from their CV and ask how it "
            "handles edge cases, failure scenarios, or 10x scaling.\n"
            "5. Stage 5: Wrap-up & Next Steps (Turn 7+) -> Summarize the key achievements discussed (by project name), congratulate them, "
            "and instruct them to click the 'End Interview & Get Feedback' button at the top of your screen to see their metrics.\n\n"
            "### IMPORTANT RULES:\n"
            "1. ALWAYS evaluate their last message carefully and apply the ADAPTIVE QUESTIONING LOGIC.\n"
            "2. Reference their stated achievements, projects, and target role criteria BY NAME — never generically.\n"
            "3. Ask exactly ONE concise question at a time. Never double-prompt.\n"
            "4. Start directly with the greeting/response. Do not include meta comments.\n"
            "5. The 'options' array MUST be completely empty (i.e. `\"options\": []`). Do not generate any suggested responses for the candidate.\n"
            "6. CRITICAL INTRODUCTION RULE: If this is the very first turn of the interview, your response MUST be EXACTLY the following script, word-for-word, and nothing else:\n"
            "\"Welcome to your NeuroAI Interview Practice! I'm your AI Interview Coach, and I'll guide you through a mock interview that closely matches the real NeuroAI interview.\n\n"
            "The interview will take about 10–15 minutes. We'll start with your self-introduction, followed by a few questions about your background, resume, the NeuroAI program, and your understanding of the internship. At the end, you can ask me any questions, and I'll provide detailed feedback on your performance.\n\n"
            "There's no need to use perfect English—just answer naturally in your own words. If you need a moment to think, that's completely fine.\n\n"
            "Let's begin. Please introduce yourself.\"\n"
        )
        
        formatted_messages = [
            {
                "role": "system",
                "content": system_instruction
            }
        ]
        for msg in messages:
            formatted_messages.append({"role": msg["role"], "content": msg["content"]})
            
        payload = {
            "messages": formatted_messages,
            "max_tokens": 600,
            "temperature": 0.7,
            "response_format": {"type": "json_object"}
        }
 
        url, headers, final_payload = self._get_endpoint_details(payload)
 
        try:
            async with httpx.AsyncClient(timeout=30.0) as client:
                response = await client.post(url, json=final_payload, headers=headers)
                response.raise_for_status()
                data = response.json()
            
            raw_content = data["choices"][0]["message"]["content"].strip()
            return self._parse_llm_json_response(raw_content)
        except Exception as e:
            self._log_api_error(e, url, headers, final_payload)
            return self._generate_smart_fallback(
                messages=messages,
                cv_text=cv_text,
                job_description=job_description,
                interview_mode=interview_mode,
                interviewer_persona=interviewer_persona
            )


    async def generate_detailed_feedback(
        self,
        messages: list[dict],
        cv_text: str | None = None,
        job_description: str | None = None,
        interview_mode: str | None = None,
        interviewer_persona: str | None = None,
        difficulty_level: str | None = None
    ) -> dict:
        use_azure = bool(self.endpoint and self.key)
        use_standard = bool(self.openai_key)
 
        if not use_azure and not use_standard:
            return self._generate_smart_feedback(
                messages=messages,
                cv_text=cv_text,
                job_description=job_description,
                interview_mode=interview_mode,
                interviewer_persona=interviewer_persona,
                difficulty_level=difficulty_level
            )
            
        # Combine chat into a readable transcript
        transcript_str = ""
        for msg in messages:
            role_name = "Candidate" if msg["role"] == "user" else "Interviewer"
            transcript_str += f"{role_name}: {msg['content']}\n"
            
        system_instruction = (
            "You are an expert enterprise interview assessor. Review this mock interview transcript and provide a highly detailed evaluation report.\n\n"
            f"The candidate was interviewed under the following constraints:\n"
            f"- INTERVIEW TYPE: {interview_mode or 'General Assessment'}\n"
            f"- INTERVIEWER PERSONA: {interviewer_persona or 'Technical Interviewer'}\n"
            f"- DIFFICULTY LEVEL: {difficulty_level or 'Senior'}\n\n"
            "Evaluate the candidate specifically aligned with this persona's style, the difficulty level, and the interview type criteria.\n\n"
            "CRITICAL SCORING & DEDUCTION PROTOCOLS:\n"
            "1. **Relevance and Quality**: Evaluate the relevance, detail, and alignment of the candidate's responses. If a response is off-topic, irrelevant, generic, avoidant, or fails to directly answer the question, deduct 15-20 points per irrelevant response from the appropriate category scores (Technical Depth, Problem Solving, Communication, etc.).\n"
            "2. **Incomplete Interview / Early Exit Penalty**: A standard full mock interview contains at least 5 questions. Count the number of candidate answers in the transcript. If the candidate answered fewer than 5 questions, you MUST scale down all 5 final scores proportionally to the completion rate. For example:\n"
            "   - If they answered 1 question: multiply final calculated scores by 0.2.\n"
            "   - If they answered 2 questions: multiply final calculated scores by 0.4.\n"
            "   - If they answered 3 questions: multiply final calculated scores by 0.6.\n"
            "   - If they answered 4 questions: multiply final calculated scores by 0.8.\n"
            "   Scale the scores accordingly to reflect the incomplete nature of the interview.\n\n"
            "CRITICAL PROTOCOLS FOR EVALUATION (Feedback Philosophy):\n"
            "1. **Never Rewrite or Polish**: DO NOT rewrite or 'improve' the candidate's answer into polished, sophisticated, or corporate English. The AI must preserve the candidate's own communication style.\n"
            "2. **Coverage of Key Points**: Verify whether expected information is present (e.g. 'You introduced yourself', 'You mentioned your education'). Do not judge sentence construction unless it is a major grammatical error.\n"
            "3. **Minor Language Suggestions Only**: If there is an obvious grammar mistake, show ONLY the minor correction (e.g. change 'I have complete B.Tech' to 'I have completed my B.Tech').\n"
            "4. **Language Level**: Use simple, conversational, natural wording. Avoid ChatGPT-style polished responses.\n"
            "5. **suggested_improvements**: Generate feedback for each interviewer question / candidate answer turn in the transcript. For each item, provide:\n"
            "   - `question`: The exact question asked by the interviewer.\n"
            "   - `what_you_did_well`: A list of key points the candidate successfully covered.\n"
            "   - `minor_language_suggestions`: Minor grammar corrections ONLY if absolutely necessary. Do not rewrite their answer.\n"
            "   - `missing_information`: A list of points they should consider adding next time.\n"
            "   - `time_feedback`: Count the number of words in the candidate's answer. Assuming an average speaking rate of 130 words per minute:\n"
            "       - If word count > 150 (approx > 1 minute), tell them their response was too long. Suggest a crisp length without rewriting their exact words.\n"
            "       - If word count < 30 (approx < 15 seconds), tell them their response was too short. Suggest they add more detail.\n"
            "       - If between 30 and 150 words, tell them their response length was good.\n"
            "   - `example_good_responses`: Generate 2-3 examples of how the candidate COULD have answered. These must NOT be rewrites of their actual answer. Instead, they should be authentic, conversational examples based strictly on their CV details and self-pitch, showing alternative approaches.\n\n"
            "You MUST respond in JSON format ONLY, matching this exact schema:\n"
            "{\n"
            "  \"communication_score\": 5, // integer 0-5 based on clarity and intent, ignoring speech differences\n"
            "  \"comprehension_score\": 5, // integer 0-5 based on understanding the questions\n"
            "  \"technical_depth_score\": 85, // integer 0-100 (Keep for backwards compatibility)\n"
            "  \"leadership_score\": 85, // integer 0-100 (Keep for backwards compatibility)\n"
            "  \"problem_solving_score\": 85, // integer 0-100 (Keep for backwards compatibility)\n"
            "  \"confidence_score\": 85, // integer 0-100 (Keep for backwards compatibility)\n"
            "  \"areas_for_improvement\": [\"Simple suggestions on missing points\"],\n"
            "  \"what_went_well\": [\"Simple highlights of covered points\"],\n"
            "  \"suggested_improvements\": [\n"
            "     {\n"
            "        \"question\": \"Question text\",\n"
            "        \"what_you_did_well\": [\"Introduced yourself clearly.\"],\n"
            "        \"minor_language_suggestions\": \"Try saying: 'I have completed my B.Tech' instead of 'I have complete B.Tech'\",\n"
            "        \"missing_information\": [\"your current learning\", \"your career goal\"],\n"
            "        \"time_feedback\": \"Your introduction was concise.\",\n"
            "        \"example_good_responses\": [\"An example based on CV\", \"Another example based on CV\"]\n"
            "     }\n"
            "  ],\n"
            "  \"detailed_feedback\": \"# MOCK INTERVIEW ASSESSMENT REPORT\\n\\n### 1. Key Accomplishments...\" // Full markdown report\n"
            "}\n\n"
            "Format the 'detailed_feedback' as a professional markdown document with the following sections:\n"
            "### 1. Key Achievements & Strengths (highlighting achievements during the interview)\n"
            "### 2. Gaps & Suggestions on Corrections (focusing on mistakes and corrections)\n"
            "### 3. Communication & Pacing Analysis\n"
        )
        
        prompt = ""
        if job_description:
            prompt += f"### TARGET ROLE:\n{job_description}\n\n"
        if cv_text:
            prompt += f"### CANDIDATE CV DETAILS:\n{cv_text}\n\n"
            
        prompt += f"### INTERVIEW TRANSCRIPT:\n{transcript_str}"
        
        payload = {
            "messages": [
                {"role": "system", "content": system_instruction},
                {"role": "user", "content": prompt}
            ],
            "max_tokens": 1500,
            "temperature": 0.3,
            "response_format": {"type": "json_object"}
        }
 
        url, headers, final_payload = self._get_endpoint_details(payload)
 
        try:
            async with httpx.AsyncClient(timeout=45.0) as client:
                response = await client.post(url, json=final_payload, headers=headers)
                response.raise_for_status()
                data = response.json()
            
            raw_content = data["choices"][0]["message"]["content"].strip()
            return json.loads(raw_content)
        except Exception as e:
            self._log_api_error(e, url, headers, final_payload)
            return self._generate_smart_feedback(
                messages=messages,
                cv_text=cv_text,
                job_description=job_description,
                interview_mode=interview_mode,
                interviewer_persona=interviewer_persona
            )

    async def generate_founder_insights(
        self,
        messages: list[dict],
        cv_text: str | None = None,
        job_description: str | None = None,
        interview_mode: str | None = None,
        interviewer_persona: str | None = None,
        difficulty_level: str | None = None
    ) -> dict:
        use_azure = bool(self.endpoint and self.key)
        use_standard = bool(self.openai_key)

        if not use_azure and not use_standard:
            return self._generate_fallback_founder_insights(messages, cv_text, job_description)

        transcript_str = ""
        for msg in messages:
            role_name = "Candidate" if msg["role"] == "user" else "Interviewer"
            transcript_str += f"{role_name}: {msg['content']}\n"

        system_instruction = (
            "You are an AI Screening Analysis Engine. Analyze the mock interview transcript, CV, and target role to generate founder intelligence details.\n"
            "Analyze the candidate's responses to infer their profile, requirements, skills, pathway alignment, and alert flags. "
            "You MUST respond in JSON format ONLY, matching this exact schema:\n"
            "{\n"
            "  \"summary\": {\n"
            "    \"age_group\": \"22-25\",\n"
            "    \"education\": \"BA Film Making & Editing\",\n"
            "    \"location\": \"Kerala\",\n"
            "    \"current_status\": \"Seeking Employment\",\n"
            "    \"experience\": \"2 Internships\",\n"
            "    \"primary_goal\": \"Video Editing Opportunities\",\n"
            "    \"challenges\": [\"Portfolio Positioning\", \"Interview Preparation\"],\n"
            "    \"suggested_support\": [\"Portfolio Coaching\", \"Employment Readiness\"]\n"
            "  },\n"
            "  \"recommendation\": {\n"
            "    \"primary_pathway\": \"Employment Support\",\n"
            "    \"secondary_pathway\": \"Portfolio Coaching\",\n"
            "    \"priority\": \"Medium\", // \"High\", \"Medium\", or \"Low\"\n"
            "    \"founder_attention\": false // boolean\n"
            "  },\n"
            "  \"highlights\": {\n"
            "    \"strengths\": [\"Strong editing background\", \"Has internship experience\"],\n"
            "    \"concerns\": [\"Portfolio not well structured\", \"Limited professional experience\"]\n"
            "  },\n"
            "  \"skill_map\": {\n"
            "    \"communication\": 8, // integer 1-10\n"
            "    \"technical_skill\": 7, // integer 1-10\n"
            "    \"portfolio\": 5, // integer 1-10\n"
            "    \"job_readiness\": 6, // integer 1-10\n"
            "    \"confidence\": 7 // integer 1-10\n"
            "  },\n"
            "  \"timeline\": [\n"
            "    {\"time\": \"10:02\", \"topic\": \"Introduction\"},\n"
            "    {\"time\": \"10:05\", \"topic\": \"Education Discussion\"},\n"
            "    {\"time\": \"10:11\", \"topic\": \"Internship Experience\"},\n"
            "    {\"time\": \"10:20\", \"topic\": \"Portfolio Discussion\"},\n"
            "    {\"time\": \"10:35\", \"topic\": \"Job Search Challenges\"},\n"
            "    {\"time\": \"10:41\", \"topic\": \"Action Recommendations\"}\n"
            "  ],\n"
            "  \"tags\": [\"#VideoEditing\", \"#EmploymentSupport\", \"#PortfolioCoaching\", \"#JobSeeking\", \"#FilmIndustry\"],\n"
            "  \"alert\": {\n"
            "    \"alert_type\": \"High Potential Candidate\", // Or \"Corporate Lead\" or \"NeuroAI Interest\" or null\n"
            "    \"alert_message\": \"Candidate appears highly employable. Founder review recommended.\" // Or details or null\n"
            "  }\n"
            "}\n"
        )

        prompt = ""
        if job_description:
            prompt += f"### TARGET ROLE / JOB:\n{job_description}\n\n"
        if cv_text:
            prompt += f"### CANDIDATE CV/RESUME:\n{cv_text}\n\n"
        prompt += f"### INTERVIEW TRANSCRIPT:\n{transcript_str}"

        payload = {
            "messages": [
                {"role": "system", "content": system_instruction},
                {"role": "user", "content": prompt}
            ],
            "max_tokens": 1200,
            "temperature": 0.2,
            "response_format": {"type": "json_object"}
        }

        url, headers, final_payload = self._get_endpoint_details(payload)

        try:
            async with httpx.AsyncClient(timeout=45.0) as client:
                response = await client.post(url, json=final_payload, headers=headers)
                response.raise_for_status()
                data = response.json()
            raw_content = data["choices"][0]["message"]["content"].strip()
            return json.loads(raw_content)
        except Exception as e:
            print("Error generating founder insights:", e)
            return self._generate_fallback_founder_insights(messages, cv_text, job_description)

    def _generate_fallback_founder_insights(
        self,
        messages: list[dict] | None = None,
        cv_text: str | None = None,
        job_description: str | None = None
    ) -> dict:
        age_group = "22-25"
        education = "B.S. Computer Science"
        location = "Kerala"
        current_status = "Seeking Employment"
        experience = "1-2 Internships"
        primary_goal = "Software Engineering Roles"
        challenges = ["Portfolio Positioning", "Interview Preparation"]
        suggested_support = ["Portfolio Coaching", "Employment Readiness"]
        primary_pathway = "Employment Support"
        secondary_pathway = "Portfolio Coaching"
        priority = "Medium"
        founder_attention = False
        strengths = ["Good basic coding skills", "Understands web structures"]
        concerns = ["Needs experience in systems scaling", "Lacks production depth"]
        comm_score = 8
        tech_score = 7
        port_score = 6
        readiness_score = 7
        confidence_score = 7
        
        # Adjust fallback dynamically based on keywords
        text_pool = ""
        if cv_text:
            text_pool += cv_text.lower()
        if job_description:
            text_pool += job_description.lower()
        if messages:
            text_pool += " ".join(m.get("content", "").lower() for m in messages)
            
        if "caregiver" in text_pool or "parent" in text_pool:
            education = "Secondary Education / Caring background"
            location = "Delhi / NCR"
            current_status = "Caregiving Full-time"
            experience = "Parent Support"
            primary_goal = "Parental Support Services"
            challenges = ["Time management", "Respite Support Coordination"]
            suggested_support = ["Caregiver Support Group", "Co-pay Assistance"]
            primary_pathway = "Parent Support"
            secondary_pathway = "Caregiver Support"
            strengths = ["Deep empathy", "Highly resilient under pressure"]
            concerns = ["High risk of caregiver burnout", "Requires local support network"]
            comm_score = 9
            tech_score = 5
            port_score = 4
            readiness_score = 8
            confidence_score = 8
        elif "film" in text_pool or "edit" in text_pool or "video" in text_pool:
            education = "BA Film Making & Editing"
            current_status = "Freelancing / Job seeking"
            experience = "2 Internships"
            primary_goal = "Video Editing Opportunities"
            challenges = ["Portfolio structure", "Technical interview readiness"]
            suggested_support = ["Portfolio Coaching", "Employment Readiness"]
            primary_pathway = "Employment Support"
            secondary_pathway = "Portfolio Coaching"
            strengths = ["Creative eye", "Proficient in Adobe Premiere / FCP"]
            concerns = ["Portfolio lacks structural metadata", "Limited corporate experience"]
            comm_score = 8
            tech_score = 7
            port_score = 5
            readiness_score = 6
            confidence_score = 7
        elif "corporate" in text_pool or "de&i" in text_pool or "workshop" in text_pool:
            education = "MBA / Corporate Relations"
            current_status = "Corporate Lead Representative"
            experience = "Senior Lead"
            primary_goal = "Workplace Inclusion Workshops"
            challenges = ["Budget constraints", "DE&I implementation speed"]
            suggested_support = ["Corporate DE&I Alignment", "Executive Consulting"]
            primary_pathway = "DE&I"
            secondary_pathway = "Corporate Partnerships"
            priority = "High"
            founder_attention = True
            strengths = ["Strong corporate networking", "Advocate for workspace DE&I"]
            concerns = ["Long sales cycle", "Requires customized workshop outlines"]
            comm_score = 9
            tech_score = 8
            port_score = 7
            readiness_score = 9
            confidence_score = 9

        alert_type = None
        alert_message = None
        if "corporate" in primary_pathway.lower() or "de&i" in primary_pathway.lower() or founder_attention:
            alert_type = "Corporate Lead"
            alert_message = "Corporate representative detected. Possible workshop opportunity. Urgent founder review recommended."
        elif "neuro" in text_pool:
            alert_type = "NeuroAI Interest"
            alert_message = "Interested in upcoming NeuroAI cohort. Add to waiting list."
        elif comm_score + tech_score >= 17:
            alert_type = "High Potential Candidate"
            alert_message = "Candidate appears highly employable. Founder review recommended."

        # Dynamically generate tags
        tags = []
        if "film" in text_pool or "video" in text_pool:
            tags.extend(["#VideoEditing", "#FilmIndustry", "#PortfolioCoaching"])
        if "caregiver" in text_pool:
            tags.extend(["#CaregiverSupport", "#Parenting", "#LocalGroups"])
        if "corporate" in text_pool or "de&i" in text_pool:
            tags.extend(["#CorporateInclusion", "#DiversityEquityInclusion", "#Workshops"])
        if "neuro" in text_pool:
            tags.extend(["#NeuroAI", "#FutureCohort", "#WaitingList"])
        if primary_pathway == "Employment Support":
            tags.extend(["#EmploymentSupport", "#JobSeeking"])
        if not tags:
            tags = ["#GeneralCandidate", "#MockInterview", "#TechnicalSkills"]

        return {
            "summary": {
                "age_group": age_group,
                "education": education,
                "location": location,
                "current_status": current_status,
                "experience": experience,
                "primary_goal": primary_goal,
                "challenges": challenges,
                "suggested_support": suggested_support
            },
            "recommendation": {
                "primary_pathway": primary_pathway,
                "secondary_pathway": secondary_pathway,
                "priority": priority,
                "founder_attention": founder_attention
            },
            "highlights": {
                "strengths": strengths,
                "concerns": concerns
            },
            "skill_map": {
                "communication": comm_score,
                "technical_skill": tech_score,
                "portfolio": port_score,
                "job_readiness": readiness_score,
                "confidence": confidence_score
            },
            "timeline": [
                {"time": "10:02", "topic": "Introduction"},
                {"time": "10:05", "topic": "Background & Education"},
                {"time": "10:12", "topic": "Technical / Domain Discussion"},
                {"time": "10:25", "topic": "Challenges & Solutions"},
                {"time": "10:38", "topic": "Goal Alignment & Support Needs"}
            ],
            "tags": tags,
            "alert": {
                "alert_type": alert_type,
                "alert_message": alert_message
            }
        }

    async def generate_options_for_question(
        self,
        question_text: str,
        cv_text: str | None = None,
        job_description: str | None = None,
        interview_mode: str | None = None,
        interviewer_persona: str | None = None,
        difficulty_level: str | None = None,
        years_of_experience: str | None = None
    ) -> list[str]:
        use_azure = bool(self.endpoint and self.key)
        use_standard = bool(self.openai_key)

        is_neuroai = interview_mode and interview_mode.startswith("NeuroAI Prep:")

        if not use_azure and not use_standard:
            if is_neuroai:
                return [
                    "I really enjoyed learning about data annotation and how models get trained.",
                    "I find copy editing and digital marketing writing very engaging.",
                    "I like setting up weekly checklists and working on projects step-by-step."
                ]
            return [
                "I have extensive experience resolving similar technical scale challenges.",
                "In my previous projects, I focused on optimizing performance and reducing latency.",
                "I coordinate closely with product owners to ensure our technical implementation meets user needs."
            ]

        if is_neuroai:
            system_instruction = (
                "You are Geethanjali/Panchali's AI prep assistant.\n"
                "The candidate is preparing for a Neuro AI internship interview.\n"
                f"The AI interviewer (conducting '{interview_mode}') has just asked the candidate this question:\n"
                f"\"{question_text}\"\n\n"
                "Based on the candidate's CV/Resume and Self Pitch (if provided), generate exactly 3 warm, simple, and supportive response options written from the candidate's perspective.\n"
                "Guidelines:\n"
                "- Write in the first person (\"I\", \"We\").\n"
                "- Ground the responses in the candidate's CV/Resume and Self Pitch details where available. Align the answers with their background.\n"
                "- Ground the responses in basic internship/learning reflection, interests, or achievements suitable for a candidate with neurodivergence.\n"
                "- Do NOT use placeholders under any circumstances (e.g. do NOT output '[Company Name]', '[Year]', '[X]', or '[Project Name]'). Use actual details or realistic mock values.\n"
                "- Keep each option short, conversational, clear, and easy to read (max 20 words per option).\n"
                "- Avoid complex corporate jargon or intense technical metrics unless explicitly mentioned in the candidate's CV/Resume/Self-pitch.\n"
                "CRITICAL: You MUST respond in JSON format ONLY. The format must be a JSON object containing a key \"options\" which maps to a list of exactly 3 strings.\n"
                "Example:\n"
                "{\n"
                "  \"options\": [\n"
                "    \"Option 1 text\",\n"
                "    \"Option 2 text\",\n"
                "    \"Option 3 text\"\n"
                "  ]\n"
                "}"
            )
        else:
            system_instruction = (
                "You are Jobro AI, an elite AI Recruiter.\n"
                "The AI interviewer has just asked the candidate this question:\n"
                f"\"{question_text}\"\n\n"
                "Based on the candidate's CV/Resume, target Job Description, Interview Mode/Type, Interviewer Persona, and Difficulty/Experience Level, generate exactly 3 response options written from the candidate's perspective.\n"
                "Context Details:\n"
                f"- Interview Mode/Type: {interview_mode or 'General Assessment'}\n"
                f"- Interviewer Persona: {interviewer_persona or 'Technical Interviewer'}\n"
                f"- Difficulty Level: {difficulty_level or 'Senior'}\n"
                f"- Years of Experience: {years_of_experience or 'N/A'}\n\n"
                "Guidelines:\n"
                "- Write in the first person (\"I\", \"We\").\n"
                "- Ground the responses in actual achievements, technologies, or projects from the candidate's CV/Resume. Align the answers with their background.\n"
                "- Tailor the level of depth, sophistication, and terminology of the options to match the specified Interview Mode, Interviewer Persona, and Difficulty Level. For example, Senior/Leadership options should highlight scaling, architectural trade-offs, and project execution, whereas Junior options should focus on hands-on coding and learning.\n"
                "- Do NOT use placeholders under any circumstances (e.g. do NOT output '[Company Name]', '[Year]', '[X]', or '[Project Name]'). Use the actual companies and projects listed in the candidate's CV. If certain details are missing, draft natural, realistic mock names that fit the context seamlessly.\n"
                "- Keep each option short, conversational, and direct (typically 1-2 sentences, max 35 words per option).\n"
                "- The options should represent three different angles (e.g., technical/analytical detail, project ownership/leadership, collaboration/managing trade-offs).\n"
                "CRITICAL: You MUST respond in JSON format ONLY. The format must be a JSON object containing a key \"options\" which maps to a list of exactly 3 strings.\n"
                "Example:\n"
                "{\n"
                "  \"options\": [\n"
                "    \"Option 1 text\",\n"
                "    \"Option 2 text\",\n"
                "    \"Option 3 text\"\n"
                "  ]\n"
                "}"
            )

        prompt = ""
        if job_description:
            if is_neuroai:
                prompt += f"### CANDIDATE'S INITIAL SELF PITCH:\n{job_description}\n\n"
            else:
                prompt += f"### TARGET JOB DESCRIPTION:\n{job_description}\n\n"
        if cv_text:
            prompt += f"### CANDIDATE CV/RESUME:\n{cv_text}\n\n"
        prompt += f"### QUESTION ASKED:\n{question_text}"

        payload = {
            "messages": [
                {"role": "system", "content": system_instruction},
                {"role": "user", "content": prompt}
            ],
            "max_tokens": 250,
            "temperature": 0.6,
            "response_format": {"type": "json_object"}
        }

        url, headers, final_payload = self._get_endpoint_details(payload)

        try:
            async with httpx.AsyncClient(timeout=15.0) as client:
                response = await client.post(url, json=final_payload, headers=headers)
                response.raise_for_status()
                data = response.json()
            raw_content = data["choices"][0]["message"]["content"].strip()
            parsed = self._parse_llm_json_response(raw_content)
            return parsed.get("options", [])[:3]
        except Exception as e:
            print("First attempt to generate options failed, retrying without JSON mode:", e)
            try:
                # Retry without response_format for older model compatibility
                payload_no_json = dict(payload)
                payload_no_json.pop("response_format", None)
                url_retry, headers_retry, final_payload_retry = self._get_endpoint_details(payload_no_json)
                async with httpx.AsyncClient(timeout=15.0) as client:
                    response = await client.post(url_retry, json=final_payload_retry, headers=headers_retry)
                    response.raise_for_status()
                    data = response.json()
                raw_content = data["choices"][0]["message"]["content"].strip()
                parsed = self._parse_llm_json_response(raw_content)
                return parsed.get("options", [])[:3]
            except Exception as retry_err:
                print("Retry without JSON mode failed:", retry_err)

                # Heuristic keyword matching to dynamically tailor fallback options
                interest = "AI tasks"
                if job_description:
                    jd_lower = job_description.lower()
                    if "marketing" in jd_lower:
                        interest = "digital marketing and content creation"
                    elif "annotation" in jd_lower:
                        interest = "data annotation and precision curation"
                    elif "research" in jd_lower:
                        interest = "data research and reporting"
                    elif any(k in jd_lower for k in ["edit", "video", "film"]):
                        interest = "video editing and creative media"
                elif cv_text:
                    cv_lower = cv_text.lower()
                    if "marketing" in cv_lower:
                        interest = "digital marketing"
                    elif "annotation" in cv_lower:
                        interest = "data annotation"
                    elif "research" in cv_lower:
                        interest = "research"
                    elif any(k in cv_lower for k in ["edit", "video", "film"]):
                        interest = "video editing"

                # Dynamic smart fallback based on question intent/keywords
                q_lower = question_text.lower()
                if is_neuroai:
                    if any(w in q_lower for w in ["introduce", "background", "welcome", "tell me about", "yourself"]):
                        return [
                            f"I am an aspiring intern interested in {interest}.",
                            f"I focus on {interest or 'learning tech tools'}, and I enjoy hands-on assignments.",
                            f"I'm a detail-oriented candidate eager to apply my skills in {interest or 'AI tasks'}."
                        ]
                    elif any(w in q_lower for w in ["enjoy", "like", "favorite", "most"]):
                        return [
                            f"I really enjoyed the practical modules in the program, especially learning about {interest}.",
                            f"I liked working on structured assignments related to {interest or 'data workflows'}.",
                            f"My favorite part was getting hands-on experience and seeing the results of my work."
                        ]
                    elif any(w in q_lower for w in ["difficult", "challenge", "hard"]):
                        return [
                            "I found staying organized with fast deadlines a bit challenging at first.",
                            "It was a challenge to learn new technical concepts, but I broke them down step-by-step.",
                            "Working independently was new, but using daily checklists helped me overcome it."
                        ]
                    elif any(w in q_lower for w in ["strength", "best at", "succeed"]):
                        return [
                            "My strengths are my attention to detail, precision, and high reliability.",
                            "I excel at following structured guidelines and staying focused on precise tasks.",
                            "I am a supportive team player and I always communicate early if there is a delay."
                        ]
                    elif any(w in q_lower for w in ["organize", "deadline", "schedule", "time"]):
                        return [
                            "I break projects into daily milestones and set reminders to stay on track.",
                            "I prioritize my tasks using visual checklists and leave buffer time.",
                            "I focus on one task at a time and ask for help early if I anticipate a delay."
                        ]
                    elif any(w in q_lower for w in ["learn", "skill", "tool"]):
                        return [
                            "I read documentation and guides first, then practice with small examples.",
                            "I watch video tutorials online and ask my mentors for guidance.",
                            "I learn by doing, troubleshooting any issues that come up step-by-step."
                        ]
                    return [
                        f"I would love to apply my skills in {interest} to help the team succeed.",
                        f"I thrive in structured environments that value focus and accuracy.",
                        "I am eager to learn more about the work environment and expectations."
                    ]
                else:
                    if any(w in q_lower for w in ["introduce", "background", "welcome", "tell me about", "yourself"]):
                        return [
                            "Sure! I'm a software engineer with experience building scalable backend services.",
                            "Hi! I specialize in full stack development and design robust cloud databases.",
                            "Hello! I enjoy tackling complex architectural challenges and leading team initiatives."
                        ]
                    return [
                        "We addressed this by optimizing database queries and introducing caching layers.",
                        "My approach was to align all stakeholders on the key metrics before building the MVP.",
                        "I set up rigorous bench testing to compare the trade-offs of the options before moving ahead."
                    ]

    def _generate_neuroai_fallback(
        self,
        messages: list[dict],
        persona: str,
        track: str,
        cv_text: str | None = None,
        self_pitch: str | None = None
    ) -> dict:
        user_turns = [m for m in messages if m["role"] == "user"]
        num_turns = len(user_turns)
        
        candidate_name = "Candidate"
        if cv_text:
            lines = [l.strip() for l in cv_text.split("\n") if l.strip()]
            for line in lines[:3]:
                if len(line) < 50 and not any(w in line.lower() for w in ["resume", "cv", "email", "phone"]):
                    candidate_name = line.split()[0]
                    break
        
        persona_prefix = f"[{persona}]: "
        
        if track == "Program Reflection":
            questions = [
                f"Welcome {candidate_name}! I'm so glad to sit with you today. How did you hear about our Neuro AI program?",
                "Which module or assignment did you enjoy the most during your time with us?",
                "What was the most difficult or challenging part of the program for you?",
                "How has the program helped you develop your skills and understanding of AI?",
                "Which specific module challenged you, and how did you overcome that challenge?",
                "What did you learn about yourself through this journey?"
            ]
            options_by_turn = [
                [
                    "I heard about it from a senior at my college who recommended it.",
                    "I came across it on LinkedIn and was really excited by the neuro-inclusive mission.",
                    "My mentor recommended it as a great way to learn practical AI skills."
                ],
                [
                    "I really enjoyed the copywriting module; it was very hands-on.",
                    "The data annotation module was my favorite because I got to see how models learn.",
                    "I loved the marketing projects where we created campaigns for AI tools."
                ],
                [
                    "It was challenging to stay organized and meet all the fast-paced deadlines.",
                    "Learning some of the technical AI concepts was a bit difficult at first.",
                    "Working independently on project assignments was a stretch for me."
                ],
                [
                    "It has built my confidence in talking about my projects and skills.",
                    "It taught me how to solve problems on my own before asking for help.",
                    "It gave me a solid foundation in the practical side of modern AI applications."
                ],
                [
                    "The advanced modules challenged me, but I reviewed the examples and asked questions.",
                    "The research assignment was tough, but I broke it down into smaller tasks.",
                    "The presentation module was a challenge, but practicing helped me overcome it."
                ],
                [
                    "I learned that I'm much more independent and resilient than I thought.",
                    "I discovered a real passion for working on technical AI project teams.",
                    "I realized that I enjoy analyzing problems and structuring clear answers."
                ]
            ]
        elif track == "Internship Readiness":
            questions = [
                f"Welcome {candidate_name}! Let's start with a classic: could you tell me a little bit about yourself?",
                "What would you say are your greatest strengths as an intern?",
                "What kind of tasks or work do you enjoy doing the most?",
                "Could you tell me about a project or assignment you are particularly proud of?",
                "How do you organize your work and handle tight deadlines?",
                "When you need to learn a new tool or skill, how do you go about it?"
            ]
            options_by_turn = [
                [
                    "I am an aspiring AI intern who loves project coordination and digital marketing.",
                    "I focus on data annotation and research, and I enjoy learning new tech tools.",
                    "I'm a detail-oriented student passionate about applying AI in creative fields."
                ],
                [
                    "My strengths are my attention to detail, my curiosity, and my reliability.",
                    "I excel at breaking down complex tasks and organizing schedules.",
                    "I'm a quick learner and a very supportive teammate."
                ],
                [
                    "I enjoy tasks that involve research, writing content, or managing databases.",
                    "I love hands-on work like image annotation or organizing project sheets.",
                    "I prefer analyzing information and presenting it clearly to stakeholders."
                ],
                [
                    "I'm proud of a marketing campaign project I designed using GenAI tools.",
                    "I completed a detailed dataset annotation project with high accuracy.",
                    "I wrote a comprehensive research report on AI trends in healthcare."
                ],
                [
                    "I break projects into daily milestones and set reminders to stay on track.",
                    "I prioritize tasks using a checklist and always leave buffer time.",
                    "I focus on one task at a time and communicate early if I see a delay."
                ],
                [
                    "I start by reading documentation and guides, then practice with small examples.",
                    "I watch tutorials online and don't hesitate to ask mentors for guidance.",
                    "I try to learn by doing, troubleshooting any issues that come up."
                ]
            ]
        elif track == "Career Exploration":
            questions = [
                f"Hello {candidate_name}! We have a few pathways here. Would you prefer marketing, annotation, or research for your internship, and why?",
                "What excites you the most about the field of Artificial Intelligence?",
                "What are your long-term goals or aspirations after completing this program?",
                "What industries or sectors (like health, finance, education, or media) interest you the most?",
                "What kind of company or work environment do you think you would thrive in?"
            ]
            options_by_turn = [
                [
                    "I prefer marketing because I love copywriting and creating content.",
                    "I prefer data annotation because I enjoy detail-oriented data curation.",
                    "I prefer research because I like analyzing trends and write reports."
                ],
                [
                    "I'm excited by how AI can help people do their jobs better and automate routine tasks.",
                    "I love seeing how computer vision and language models can understand human patterns.",
                    "I'm motivated by the creative possibilities of generative AI tools."
                ],
                [
                    "I hope to secure a full-time role as an AI project associate or marketer.",
                    "I plan to continue my education and specialize in neurodiverse workplace inclusion.",
                    "I want to become a skilled data analyst working with AI systems."
                ],
                [
                    "I'm interested in education and how AI can personalize learning for students.",
                    "I'm drawn to media and entertainment, especially video and content creation.",
                    "I find healthcare AI applications very meaningful and interesting."
                ],
                [
                    "I thrive in collaborative, warm environments with clear guidance and support.",
                    "I prefer a structured environment where I can work independently on tasks.",
                    "I like dynamic, fast-growing teams where I can learn many different skills."
                ]
            ]
        else:
            questions = [
                f"Hello {candidate_name}! I was looking at your resume. Could you tell me about the most recent project or role listed there?",
                "What were your main responsibilities in that experience?",
                "What skills or tools did you use, and how did they help you succeed?",
                "Can you tell me about a time during that project when you solved a problem on your own?",
                "How has that experience prepared you for an internship with Neuro AI?"
            ]
            options_by_turn = [
                [
                    "I'd love to! I worked on building a digital project repository for class.",
                    "I was a volunteer content creator, designing social media posts.",
                    "I completed an academic research project analyzing workspace inclusivity."
                ],
                [
                    "I was responsible for writing copy, scheduling posts, and tracking engagement.",
                    "I managed the dataset curation, ensuring clean labels for our project.",
                    "I coordinated meeting notes and tracked task assignments for the team."
                ],
                [
                    "I used Figma and Canva to design posts, which improved our visual reach.",
                    "I used Python and Excel to filter data, which saved us hours of manual work.",
                    "I used Notion to organize tasks, keeping the project on schedule."
                ],
                [
                    "We had a formatting error in our database, and I researched and fixed the schema myself.",
                    "A team member missed a deadline, so I took initiative and completed the slides.",
                    "I ran into an issue with a tool and resolved it by watching online tutorials."
                ],
                [
                    "It taught me how to work in structured settings and communicate with stakeholders.",
                    "It gave me practical skills in content creation and AI tool usage.",
                    "It helped me develop strong independence and organizational skills."
                ]
            ]

        turn_idx = min(num_turns, len(questions) - 1)
        
        intro_script = (
            "Welcome to your NeuroAI Interview Practice! I'm your AI Interview Coach, and I'll guide you through a mock interview that closely matches the real NeuroAI interview.\n\n"
            "The interview will take about 10–15 minutes. We'll start with your self-introduction, followed by a few questions about your background, resume, the NeuroAI program, and your understanding of the internship. At the end, you can ask me any questions, and I'll provide detailed feedback on your performance.\n\n"
            "There's no need to use perfect English—just answer naturally in your own words. If you need a moment to think, that's completely fine.\n\n"
            "Let's begin. Please introduce yourself."
        )

        if num_turns == 0:
            response_text = persona_prefix + intro_script
        else:
            response_text = persona_prefix + questions[turn_idx]

        if num_turns >= len(questions):
            response_text = (
                f"{persona_prefix}Thank you so much for sharing all of that with me! I've had a wonderful time "
                f"getting to know you and hearing your thoughts. We've covered everything we need. "
                f"Please click **'End & Get Feedback'** to review our discussion and some suggestions."
            )
            options = ["Thank you! I am ready to review my feedback report.", "Thanks for the great practice session! Let's wrap up."]
        else:
            options = options_by_turn[turn_idx]
            
        return {"response": response_text, "options": options}

    async def neuroai_chat_response(
        self,
        messages: list[dict],
        persona: str,
        track: str,
        cv_text: str | None = None,
        self_pitch: str | None = None
    ) -> dict:
        use_azure = bool(self.endpoint and self.key)
        use_standard = bool(self.openai_key)

        if not use_azure and not use_standard:
            return self._generate_neuroai_fallback(messages, persona, track, cv_text, self_pitch)

        if persona == "Geethanjali":
            persona_system = (
                "You are Geethanjali Ganapathy, a supportive, neuro-inclusive Interview Facilitator for the Neuro AI Internship Preparation.\n"
                "Your primary role is to create psychological safety, build rapport, guide the conversation, and encourage the candidate to comfortably share their experiences.\n"
                "You are warm, approachable, friendly, patient, calm, respectful, encouraging, curious, and non-confrontational.\n"
                "The candidate should feel you genuinely want to understand them, not judge or evaluate them.\n"
                "CRITICAL BEHAVIORS:\n"
                "- Speak in a very warm, supportive, encouraging, and patient tone.\n"
                "- Listen closely to the candidate's responses and ask relevant, warm follow-up questions to understand their experiences and background deeper, while maintaining your supportive, comforting character.\n"
                "- Ask exactly ONE clear, simple question at a time. Never double-barrel or ask multi-part questions.\n"
                "- Allow processing time. Wait patiently, do not rush the candidate.\n"
                "- Use simple, clear language. Avoid complex jargon (e.g. use 'What challenges did you face?' instead of 'elaborate on operational challenges').\n"
                "- Do NOT score, judge, evaluate, or challenge candidate answers. You are not responsible for evaluation.\n"
                "- Accept text and voice responses equally.\n"
                "- If the candidate struggles or asks, offer helpful examples (e.g., 'Would it help if I gave an example?').\n"
                "- If the candidate appears confused, rephrase using simpler words rather than repeating the same wording.\n"
                "- Never interpret long pauses, stimming, monotone speech, looking away, short or detailed answers, typing, or asking for clarification negatively.\n"
                "- NEVER challenge aggressively, never act like a recruiter ('Why should we hire you?'), never pressure, and never judge communication style."
            )
        else:
            persona_system = (
                "You are Panchali Banerjee, a Career Discovery & Internship Readiness Mentor for the Neuro AI Internship Preparation.\n"
                "Your role is to act as a career strategist and opportunity mentor: explore candidate interests, identify suitable internship pathways, assess readiness for workplace environments, understand decision-making, and identify transferable skills.\n"
                "You are professional but warm, practical, curious, and opportunity-oriented.\n"
                "The candidate should feel you want to understand how they can fit into real work opportunities, not evaluating whether they deserve it.\n"
                "CRITICAL BEHAVIORS:\n"
                "- Ask exploratory, conversational questions that connect experiences to real-world work (e.g., 'Would you prefer marketing or data annotation?').\n"
                "- Listen closely to the candidate's responses and ask relevant, practical, and mentoring follow-up questions to explore their preferences, motivations, and pathways deeper.\n"
                "- Curious and practical: explore preferences deeper than surface answers (e.g., if they like marketing, ask what interests them about it).\n"
                "- Do NOT act as a gatekeeper, recruiter, or examiner; you are here to help them think through options.\n"
                "- Discover accommodation needs and workplace preferences (e.g., structured routine, written instructions).\n"
                "- Identify transferable skills from non-formal experiences (e.g. podcasting, volunteering).\n"
                "- Never cross-examine, never use stress interviews, never challenge accommodations/disabilities, and never equate communication with competence.\n"
                "- ACCESSIBILITY LAYER: Completely ignore speech differences, slow speech, pauses, or pronunciation quirks. Base evaluation and flow strictly on their understanding and communication intent.\n"
                "- PROGRESS TRACKING: At the end of each response, briefly let the candidate know how many questions or how much time is left in the interview (e.g., 'We have 2 questions left', 'This will be our last question').\n"
                "- Ask exactly ONE clear, simple question at a time. Allow processing time and speak warmly."
            )

        if track == "Program Reflection":
            track_system = (
                "### PRACTICE TRACK: Neuro AI Program Reflection\n"
                "Your goal is to guide the conversation to cover the following topics/questions naturally:\n"
                "1. What did you like most about the Neuro AI program and Why?\n"
                "2. What did you like least about the Neuro AI Program and Why?\n"
                "3. Which Annotation Module did they like the most and Why?\n"
                "4. Which annotation Module did they like the least and Why?\n"
                "5. Which Soft Skills assignment did they like the most and Why?\n"
                "6. Which Soft skills assignment did they like the least and Why?\n"
                "Select and ask exactly 4 of these questions one at a time, incorporating follow-up probes based on their answers, while staying in character."
            )
        elif track == "Internship Readiness":
            track_system = (
                "### PRACTICE TRACK: Internship Readiness\n"
                "Your goal is to assess and build the candidate's readiness for their internship. "
                "You should guide the conversation to cover the following topics/questions naturally:\n"
                "1. Tell me about yourself.\n"
                "2. What are your strengths?\n"
                "3. What kind of work do you enjoy?\n"
                "4. Tell me about a project you worked on.\n"
                "5. How do you handle deadlines?\n"
                "6. How do you learn new skills?\n"
                "Ask these questions one at a time, incorporating follow-up probes based on their answers, while staying in character."
            )
        elif track == "Career Exploration":
            track_system = (
                "### PRACTICE TRACK: Career Exploration\n"
                "Your goal is to help the candidate explore different career paths. "
                "You should guide the conversation to cover the following topics/questions naturally:\n"
                "1. Would you prefer marketing, annotation, or research?\n"
                "2. What excites you about AI?\n"
                "3. What are your long-term goals?\n"
                "4. What industries interest you?\n"
                "5. What kind of company would you like to work with?\n"
                "Ask these questions one at a time, incorporating follow-up probes based on their answers, while staying in character."
            )
        else:
            track_system = (
                "### PRACTICE TRACK: Resume-Based Interview\n"
                "Your goal is to ask questions tailored specifically to the candidate's uploaded resume/CV. "
                "Extract details about their skills, projects, education, and internships. "
                "Then, ask tailored questions about their background (e.g., 'I see you completed a copywriting internship. Can you tell me about your responsibilities?'). "
                "Ask one question at a time and stay in character."
            )

        cv_context = f"### CANDIDATE RESUME/CV CONTEXT:\n{cv_text}\n\n" if cv_text else ""
        pitch_context = f"### CANDIDATE'S SELF PITCH (Introduction & Goals):\n{self_pitch}\n\n" if self_pitch else ""

        system_instruction = (
            f"{persona_system}\n\n"
            f"{track_system}\n\n"
            f"{pitch_context}"
            f"{cv_context}"
            "CRITICAL: You MUST respond in JSON format ONLY, matching this schema:\n"
            "{\n"
            "  \"response\": \"Your next question or interview statement (as a string). Please prefix with your name like: [" + persona + "]: \",\n"
            "  \"options\": [\n"
            "     \"Sample response option 1 written from candidate's perspective.\",\n"
            "     \"Sample response option 2 written from candidate's perspective.\",\n"
            "     \"Sample response option 3 written from candidate's perspective.\"\n"
            "  ]\n"
            "}\n"
            "Do not output any introductory or concluding text outside of this JSON.\n"
        )

        formatted_messages = [{"role": "system", "content": system_instruction}]
        for msg in messages:
            formatted_messages.append({"role": msg["role"], "content": msg["content"]})

        payload = {
            "messages": formatted_messages,
            "max_tokens": 600,
            "temperature": 0.7,
            "response_format": {"type": "json_object"}
        }

        url, headers, final_payload = self._get_endpoint_details(payload)

        try:
            async with httpx.AsyncClient(timeout=30.0) as client:
                response = await client.post(url, json=final_payload, headers=headers)
                response.raise_for_status()
                data = response.json()
            
            raw_content = data["choices"][0]["message"]["content"].strip()
            return self._parse_llm_json_response(raw_content)
        except Exception as e:
            self._log_api_error(e, url, headers, final_payload)
            return self._generate_neuroai_fallback(messages, persona, track, cv_text, self_pitch)

    def _generate_neuroai_feedback_fallback(
        self,
        messages: list[dict],
        cv_text: str | None = None,
        track: str | None = None,
        persona: str | None = None,
        self_pitch: str | None = None
    ) -> dict:
        suggested_improvements = []
        
        # Heuristic keyword matching to dynamically tailor fallback report to CV/Pitch
        interest = "AI tasks"
        if self_pitch:
            jd_lower = self_pitch.lower()
            if "marketing" in jd_lower:
                interest = "digital marketing and content creation"
            elif "annotation" in jd_lower:
                interest = "data annotation and precision curation"
            elif "research" in jd_lower:
                interest = "data research and reporting"
            elif any(k in jd_lower for k in ["edit", "video", "film"]):
                interest = "video editing and creative media"
        elif cv_text:
            cv_lower = cv_text.lower()
            if "marketing" in cv_lower:
                interest = "digital marketing"
            elif "annotation" in cv_lower:
                interest = "data annotation"
            elif "research" in cv_lower:
                interest = "research"
            elif any(k in cv_lower for k in ["edit", "video", "film"]):
                interest = "video editing"

        # Match user answers with the immediately preceding assistant message (question)
        for idx in range(len(messages)):
            if messages[idx]["role"] == "user" and idx > 0:
                # Find the preceding interviewer question
                question_msg = messages[idx-1]
                question = question_msg.get("content", "").strip()
                # Clean prefix from assistant text (e.g. name prefix or system note)
                question = question.replace("[System Note:", "").strip("]")
                if "]:" in question:
                    question = question.split("]:", 1)[-1].strip()
                
                ans = messages[idx].get("content", "").strip()
                if not ans:
                    continue
                
                q_lower = question.lower()
                ans_clean = ans.strip()
                
                # Dynamic suggestions based on question keywords
                if "hear" in q_lower or "how did you" in q_lower:
                    suggested_ans = f"I learned about the Neuro AI program through professional outreach and recommendations. I was attracted to the structured training modules, especially in {interest}, and the neuro-inclusive environment."
                elif "enjoy" in q_lower and ("module" in q_lower or "assignment" in q_lower):
                    if "annotation" in ans_clean.lower():
                        suggested_ans = "I really enjoyed the data annotation module. It was satisfying to label images and data precisely, knowing that high-quality data is key to training accurate AI models."
                    elif "marketing" in ans_clean.lower() or "copywriting" in ans_clean.lower():
                        suggested_ans = "I enjoyed the marketing and copywriting module. It allowed me to apply my written communication skills and learn how campaigns are planned and structured."
                    else:
                        suggested_ans = f"I particularly enjoyed the parts of the program related to {interest or ans_clean or 'practical assignments'}. It was very satisfying to apply my skills to real tasks."
                elif "difficult" in q_lower or "challenge" in q_lower:
                    suggested_ans = f"I found some aspects of the tasks challenging, particularly related to {interest or 'managing fast-paced deadlines'}. I handled this by breaking instructions down into simple, visual steps."
                elif "help" in q_lower and "skills" in q_lower:
                    suggested_ans = f"The program has significantly helped me develop my technical and professional confidence in {interest} and task organization."
                elif "learn about yourself" in q_lower or "what did you learn" in q_lower:
                    suggested_ans = f"I learned that I am highly resilient, detail-oriented, and capable of working independently on structured tasks in {interest}."
                elif "tell me" in q_lower and "yourself" in q_lower:
                    suggested_ans = f"I am a detail-oriented individual with a strong interest in {interest}. I thrive in structured environments, enjoy hands-on task management, and bring reliability to my work."
                elif "strength" in q_lower:
                    suggested_ans = f"My greatest strengths are my high attention to detail, my reliability in following structured processes in {interest}, and my focus on precision."
                elif "tasks" in q_lower and "enjoy" in q_lower:
                    suggested_ans = f"I enjoy tasks that are structured and goal-oriented, such as {interest or 'data curation and content drafting'}, where accuracy is highly valued."
                elif "proud" in q_lower:
                    suggested_ans = f"I am proud of my project work in {interest} where I was able to deliver high-quality results by following guidelines carefully."
                elif "organize" in q_lower or "deadline" in q_lower:
                    suggested_ans = "I organize my work by breaking larger milestones into daily tasks, using visual checklists, and raising questions early if I anticipate any changes to the schedule."
                elif "learn" in q_lower and ("tool" in q_lower or "skill" in q_lower):
                    suggested_ans = f"When learning a new tool in {interest}, I study written guides and documentation first, practice with small examples, and seek feedback to make sure I am on the right track."
                elif "prefer" in q_lower and ("marketing" in q_lower or "annotation" in q_lower or "research" in q_lower):
                    if "annotation" in ans_clean.lower():
                        suggested_ans = "I prefer data annotation because it aligns well with my attention to detail and my preference for structured, precise tasks."
                    elif "marketing" in ans_clean.lower():
                        suggested_ans = "I prefer marketing because I enjoy copywriting, creating structured content, and exploring campaign strategies."
                    elif "research" in ans_clean.lower():
                        suggested_ans = "I prefer research because I enjoy finding information, identifying patterns, and compiling detailed reports."
                    else:
                        suggested_ans = f"I would prefer a path that aligns with my strengths, particularly {interest or 'structured data tasks'}, where I can focus and ensure high-quality output."
                elif "excite" in q_lower and "ai" in q_lower:
                    suggested_ans = f"What excites me most about AI is its potential to solve problems in {interest} and how structured training data can build reliable systems."
                elif "goals" in q_lower or "aspirations" in q_lower:
                    suggested_ans = f"My long-term goal is to secure a structured role where I can specialize in {interest}, build professional skills, and contribute consistently."
                elif "industries" in q_lower or "sectors" in q_lower:
                    suggested_ans = f"I am interested in sectors related to {interest or 'technology'} because of the opportunities to apply structured processes and AI workflows to improve efficiency."
                elif "environment" in q_lower or "thrive" in q_lower:
                    suggested_ans = "I thrive in quiet, organized, and supportive work environments that provide written instructions, clear milestones, and neuro-inclusive communication."
                elif "resume" in q_lower or "cv" in q_lower or "recent project" in q_lower or "role" in q_lower:
                    suggested_ans = f"In my most recent role/project, I focused on tasks in {interest}. I was responsible for delivering high-quality results by following guidelines carefully."
                elif "responsibilities" in q_lower:
                    suggested_ans = f"My main responsibilities were focused on ensuring accuracy and quality in our {interest} tasks on time according to the guidelines."
                else:
                    topic_words = [w for w in q_lower.split() if len(w) > 4 and w not in ["would", "could", "about", "there", "their", "where", "which", "these", "those"]]
                    topic = f"regarding '{' '.join(topic_words[:3])}'" if topic_words else "to your question"
                    suggested_ans = f"To build on my answer {topic}, I would structure it by saying: '{ans_clean}. I approach tasks in {interest} systematically, ensuring I follow instructions clearly.'"

                suggested_improvements.append({
                    "question": question[:150] + ("..." if len(question) > 150 else ""),
                    "candidate_answer": ans,
                    "suggested_answer": suggested_ans
                })

        if not suggested_improvements:
            # Absolute baseline default
            suggested_improvements.append({
                "question": "Tell me about yourself.",
                "candidate_answer": "I worked in marketing.",
                "suggested_answer": "I worked in a marketing internship where I supported campaign planning and content creation. I collaborated with the design team and learned how marketing campaigns are executed."
            })
            
        user_responses = [m.get("content", "").strip() for m in messages if m["role"] == "user"]
        total_words = sum(len(r.split()) for r in user_responses)
        avg_words = total_words / len(user_responses) if user_responses else 0

        # Build dynamic strengths based on responses and track
        strengths = [
            f"You stayed fully engaged in the {track or 'Practice'} discussion flow."
        ]
        if any(len(r.split()) > 15 for r in user_responses):
            strengths.append("You provided detailed answers to some of the questions, showing good depth.")
        else:
            strengths.append("You responded directly and honestly to the prompts, keeping the communication focused.")
            
        if persona:
            strengths.append(f"You adapted well to the {persona}'s communication style and prompts.")
        else:
            strengths.append("You maintained a warm and receptive tone throughout the session.")

        # Build dynamic areas for improvement
        improvements = []
        if any(len(r.split()) < 8 for r in user_responses):
            improvements.append("Try to expand more on your brief answers by adding specific examples of your skills or modules.")
        else:
            improvements.append("Practice using the STAR format (Situation, Task, Action, Result) to structure your answers.")
            
        improvements.append("Mention specific tools or workflows (like checklists, Excel, or Figma) that you use to organize your work.")
        
        if track == "Program Reflection":
            improvements.append("Relate your favorite modules directly to your future internship goals.")
        elif track == "Internship Readiness":
            improvements.append("Be sure to connect your personal strengths directly to how they help in a workplace setup.")
        else:
            improvements.append("Focus on highlighting your unique skills and how you handle new challenges.")

        detailed_feedback = (
            f"# Neuro AI Practice Feedback Report\n\n"
            f"**Interviewer Persona**: {persona or 'Geethanjali'}\n"
            f"**Practice Track**: {track or 'Program Reflection'}\n\n"
            f"### Session Summary\n"
            f"During this session, you practiced with **{persona or 'Geethanjali'}** on the **{track or 'Program Reflection'}** pathway. "
            f"You completed {len(user_responses)} conversational turns with an average response length of {avg_words:.1f} words.\n\n"
            f"### What Went Well\n"
        )
        for s in strengths:
            detailed_feedback += f"- {s}\n"
        detailed_feedback += "\n### Areas to Focus On\n"
        for imp in improvements:
            detailed_feedback += f"- {imp}\n"
            
        detailed_feedback += "\n### Practice Analysis\n"
        if track == "Program Reflection":
            detailed_feedback += "Your reflection shows a clear path of learning. To maximize your prep, focus on translating what you enjoyed in the modules into concrete benefits for the role you seek."
        elif track == "Internship Readiness":
            detailed_feedback += "In terms of readiness, you demonstrated a good understanding of your strengths. Work on explaining *how* you apply these strengths in team projects."
        else:
            detailed_feedback += "Your career exploration is off to a great start. Focus on mapping out the specific accommodations or work environments that help you perform at your best."

        return {
            "comprehension_score": 4,
            "comprehension_feedback": "You understood the mock scenario guidelines and answered the questions directly.",
            "communication_score": 4,
            "communication_feedback": "You maintained a clear structure, speaking pace, and stayed engaged throughout.",
            "readiness_score": 3,
            "readiness_feedback": "You showed awareness of internship pathways. Work on specifying your preferred schedule (Flexi batch format).",
            "what_went_well": strengths,
            "areas_for_improvement": improvements,
            "suggested_improvements": suggested_improvements,
            "detailed_feedback": detailed_feedback
        }

    async def _evaluate_single_qa_pair(self, question: str, answer: str, cv_text: str | None, persona: str, track: str) -> dict:
        """Evaluates a single question-answer pair to provide structured coaching feedback."""
        words_count = len(answer.split()) if answer else 0
        if words_count > 120:
            time_feedback = f"Your response is long ({words_count} words). At a standard speaking rate of 130 words per minute, this takes about a minute. Try to keep it a bit more concise."
        elif words_count < 30:
            time_feedback = f"Your response is short ({words_count} words). Try to expand a bit more by adding a specific example or tool you used."
        else:
            time_feedback = f"Perfect length! Your answer was concise and within the 1-minute recommendation ({words_count} words)."

        system_instruction = (
            "You are an expert neuro-inclusive career coach. Evaluate the candidate's answer to the interviewer's question.\n"
            "Panchali's Wording Philosophy (CRITICAL):\n"
            "- Do NOT rewrite or 'improve' the candidate's answer into polished corporate English. Leave the candidate's own answer and communication style exactly as is.\n"
            "- The suggestions in 'example_good_responses' MUST sound like the candidate themselves, using simple, natural, everyday conversational English.\n"
            "- Do NOT use exaggerated or fancy corporate vocabulary (avoid words like 'leverage', 'optimize', 'proven track record', 'highly motivated professional'). Keep it simple and humble.\n"
            "- The suggestions should build directly on their actual answer, only correcting basic grammar or adding 1-2 details from their CV/resume (e.g. NIOS education, CVAT tool training) that they missed but was relevant to the question.\n\n"
            "Respond in JSON format ONLY, matching this EXACT schema:\n"
            "{\n"
            "  \"what_went_well\": [\"highlight 1\", \"highlight 2\"],\n"
            "  \"missing_information\": [\"missing point 1\", \"missing point 2\"],\n"
            "  \"minor_language_suggestions\": \"basic grammar corrections (if any), otherwise empty string\",\n"
            "  \"example_good_responses\": [\n"
            "     \"Simple, natural, and conversational alternative response 1 written in simple English, based on their CV if available\",\n"
            "     \"Simple, natural, and conversational alternative response 2 written in simple English, based on their CV if available\"\n"
            "  ]\n"
            "}"
        )
        prompt = f"### INTERVIEWER'S QUESTION:\n{question}\n\n### CANDIDATE'S ACTUAL ANSWER:\n{answer}\n\n"
        if cv_text:
            prompt += f"### CANDIDATE CV/RESUME (use for personalized suggestions):\n{cv_text}\n"

        payload = {
            "messages": [
                {"role": "system", "content": system_instruction},
                {"role": "user", "content": prompt}
            ],
            "max_tokens": 400,
            "temperature": 0.3,
            "response_format": {"type": "json_object"}
        }

        url, headers, final_payload = self._get_endpoint_details(payload)
        import httpx
        try:
            async with httpx.AsyncClient(timeout=15.0) as client:
                response = await client.post(url, json=final_payload, headers=headers)
                response.raise_for_status()
                data = response.json()
            
            raw_content = data["choices"][0]["message"]["content"].strip()
            parsed = self._parse_llm_json_response(raw_content)
            
            return {
                "question": question[:150] + ("..." if len(question) > 150 else ""),
                "candidate_answer": answer,
                "what_you_did_well": parsed.get("what_went_well", parsed.get("what_you_did_well", ["You responded directly to the interviewer's prompt."])),
                "missing_information": parsed.get("missing_information", []),
                "minor_language_suggestions": parsed.get("minor_language_suggestions", ""),
                "time_feedback": time_feedback,
                "example_good_responses": parsed.get("example_good_responses", [])
            }
        except Exception as e:
            print(f"Error evaluating QA pair: {e}")
            return {
                "question": question[:150] + ("..." if len(question) > 150 else ""),
                "candidate_answer": answer,
                "what_you_did_well": ["You shared your thoughts directly."],
                "missing_information": [],
                "minor_language_suggestions": "",
                "time_feedback": time_feedback,
                "example_good_responses": []
            }

    async def evaluate_and_cache_qa_pair(
        self,
        interview_id: str,
        question: str,
        answer: str,
        cv_text: str | None,
        persona: str | None,
        track: str | None
    ):
        """Simultaneously evaluate a QA pair and cache it so the end-of-interview report is fast."""
        try:
            result = await self._evaluate_single_qa_pair(
                question=question,
                answer=answer,
                cv_text=cv_text,
                persona=persona or 'Geethanjali',
                track=track or 'Reflection'
            )
            if interview_id not in QA_FEEDBACK_CACHE:
                QA_FEEDBACK_CACHE[interview_id] = []
            QA_FEEDBACK_CACHE[interview_id].append(result)
            logger.info(f"Successfully cached background QA feedback for interview {interview_id}")
        except Exception as e:
            logger.error(f"Failed to cache QA feedback for interview {interview_id}: {e}")

    async def generate_neuroai_feedback(
        self,
        messages: list[dict],
        cv_text: str | None = None,
        track: str | None = None,
        persona: str | None = None,
        self_pitch: str | None = None,
        interview_id: str | None = None
    ) -> dict:
        # Require real candidate responses in the conversation
        user_responses = [m for m in messages if m.get("role") == "user" and m.get("content", "").strip()]
        if not user_responses:
            raise ValueError("Cannot generate feedback: No candidate responses found in the practice session.")

        use_azure = bool(self.endpoint and self.key)
        use_standard = bool(self.openai_key)

        if not use_azure and not use_standard:
            return self._generate_neuroai_feedback_fallback(
                messages=messages,
                cv_text=cv_text,
                track=track,
                persona=persona,
                self_pitch=self_pitch
            )

        transcript_str = ""
        qa_pairs = []
        last_question = "Tell me about yourself."
        
        for msg in messages:
            content = msg.get("content", "").strip()
            if not content or content.startswith("[System Note:"):
                continue
            role_name = "Candidate" if msg["role"] == "user" else "Interviewer"
            transcript_str += f"{role_name}: {content}\n"
            
            if msg["role"] == "assistant":
                q = content.replace("[System Note:", "").strip("]")
                if "]:" in q:
                    q = q.split("]:", 1)[-1].strip()
                last_question = q
            elif msg["role"] == "user":
                qa_pairs.append({"question": last_question, "answer": content})

        # CHUNK 1: Use accumulated cache if available, otherwise compute the missing ones
        suggested_improvements = []
        if interview_id and interview_id in QA_FEEDBACK_CACHE:
            suggested_improvements = QA_FEEDBACK_CACHE[interview_id]
            logger.info(f"Loaded {len(suggested_improvements)} cached QA evaluations for {interview_id}")
            # Clear cache to free memory after retrieving
            del QA_FEEDBACK_CACHE[interview_id]
        
        # If no cache or fewer cached items than pairs, evaluate the remaining pairs concurrently
        if not suggested_improvements:
            import asyncio
            semaphore = asyncio.Semaphore(4) # Limit concurrency to prevent 429 errors
            
            async def bounded_evaluate(qa):
                async with semaphore:
                    return await self._evaluate_single_qa_pair(
                        question=qa["question"],
                        answer=qa["answer"],
                        cv_text=cv_text,
                        persona=persona or 'Geethanjali',
                        track=track or 'Reflection'
                    )
                    
            # Limit to the last 10 QA pairs to avoid massive processing times on huge sessions
            recent_qa_pairs = qa_pairs[-10:] if len(qa_pairs) > 10 else qa_pairs
            suggested_improvements = await asyncio.gather(*(bounded_evaluate(qa) for qa in recent_qa_pairs))

        # CHUNK 2: Generate the high-level summary report
        system_instruction = (
            "You are an expert neuro-inclusive career coach evaluating a candidate's mock interview.\n"
            f"Interviewer persona: {persona or 'Geethanjali'}, Track: {track or 'Reflection'}.\n\n"
            "CRITICAL INSTRUCTIONS:\n"
            "1. Read the transcript and generate specific, non-generic feedback.\n"
            "2. Evaluate three rubric dimensions on a scale of 1 to 5:\n"
            "   - Comprehension: How well the candidate understood the questions and provided direct, relevant answers.\n"
            "   - Communication: Pacing, clarity, and expressiveness (keep in mind we don't judge communication deficits negatively; focus on willingness to engage).\n"
            "   - Internship Readiness: Basic awareness of flexi batch format, interest in annotation/marketing, and scheduling.\n"
            "3. Generate a personalized, rich markdown summary in 'detailed_feedback' (containing '# Practice Session Summary', '### Detailed Breakdown', '### Strengths Demonstrated', and '### Actionable Recommendations').\n\n"
            "You MUST respond in JSON format matching this EXACT schema:\n"
            "{\n"
            "  \"comprehension_score\": 4,\n"
            "  \"comprehension_feedback\": \"Detailed explanation of comprehension based on the rubric...\",\n"
            "  \"communication_score\": 3,\n"
            "  \"communication_feedback\": \"Detailed explanation of communication based on the rubric...\",\n"
            "  \"readiness_score\": 4,\n"
            "  \"readiness_feedback\": \"Detailed explanation of readiness based on the rubric...\",\n"
            "  \"what_went_well\": [\"specific strength 1\", \"specific strength 2\"],\n"
            "  \"areas_for_improvement\": [\"constructive feedback 1\", \"constructive feedback 2\"],\n"
            "  \"detailed_feedback\": \"# Practice Report...\"\n"
            "}\n"
        )

        prompt = ""
        if self_pitch:
            prompt += f"### CANDIDATE'S INITIAL SELF PITCH:\n{self_pitch}\n\n"
        if cv_text:
            prompt += f"### CANDIDATE CV:\n{cv_text}\n\n"
        prompt += f"### INTERVIEW TRANSCRIPT:\n{transcript_str}"

        payload = {
            "messages": [
                {"role": "system", "content": system_instruction},
                {"role": "user", "content": prompt}
            ],
            "max_tokens": 1000,
            "temperature": 0.3,
            "response_format": {"type": "json_object"}
        }

        url, headers, final_payload = self._get_endpoint_details(payload)
        import httpx

        try:
            async with httpx.AsyncClient(timeout=25.0) as client:
                response = await client.post(url, json=final_payload, headers=headers)
                response.raise_for_status()
                data = response.json()
            
            raw_content = data["choices"][0]["message"]["content"].strip()
            parsed = self._parse_llm_json_response(raw_content)
            if "detailed_feedback" not in parsed and "what_went_well" not in parsed:
                raise ValueError("Parsed JSON does not contain feedback keys")
            
            # Merge chunked results
            parsed["suggested_improvements"] = suggested_improvements
            return parsed
        except Exception as e:
            print("First attempt to generate neuroai feedback failed, retrying without JSON mode:", e)
            try:
                # Retry without response_format
                payload_no_json = dict(payload)
                payload_no_json.pop("response_format", None)
                url_retry, headers_retry, final_payload_retry = self._get_endpoint_details(payload_no_json)
                async with httpx.AsyncClient(timeout=25.0) as client:
                    response = await client.post(url_retry, json=final_payload_retry, headers=headers_retry)
                    response.raise_for_status()
                    data = response.json()
                raw_content = data["choices"][0]["message"]["content"].strip()
                parsed = self._parse_llm_json_response(raw_content)
                if "detailed_feedback" not in parsed and "what_went_well" not in parsed:
                    raise ValueError("Parsed JSON does not contain feedback keys in retry")
                
                # Merge chunked results
                parsed["suggested_improvements"] = suggested_improvements
                return parsed
            except Exception as retry_err:
                print("Retry without JSON mode failed:", retry_err)
                self._log_api_error(retry_err, url, headers, final_payload)
                fallback = self._generate_neuroai_feedback_fallback(
                    messages=messages,
                    cv_text=cv_text,
                    track=track,
                    persona=persona,
                    self_pitch=self_pitch
                )
                # Ensure the rich chunked QA is used even in the overall fallback!
                fallback["suggested_improvements"] = suggested_improvements
                return fallback

    async def create_embeddings(self, text: str) -> list[float]:
        """Generates OpenAI text-embedding-3-small vector embeddings, falling back locally if needed."""
        # Self-healing check: if we already determined the API is unavailable/404, go straight to local
        if getattr(self, "_use_local_embeddings", False):
            try:
                if not hasattr(self, "_local_embedding_model") or self._local_embedding_model is None:
                    from sentence_transformers import SentenceTransformer
                    print("Loading local SentenceTransformer model weights...")
                    self._local_embedding_model = SentenceTransformer("all-MiniLM-L6-v2")
                embedding_384 = self._local_embedding_model.encode(text).tolist()
                embedding_1536 = embedding_384 + [0.0] * (1536 - len(embedding_384))
                return embedding_1536
            except Exception as le:
                print("Persistent local embedding fallback failed:", le)
                return [0.0] * 1536

        use_azure = bool(self.endpoint and self.key)
        use_standard = bool(self.openai_key)

        payload = {"input": text}
        headers = {"Content-Type": "application/json"}

        if use_azure:
            import os
            emb_deployment = os.getenv("AZURE_OPENAI_EMBEDDING_DEPLOYMENT", "text-embedding-3-small")
            endpoint = self.endpoint.rstrip("/")
            if "openai.azure.com" in endpoint:
                url = f"{endpoint}/openai/deployments/{emb_deployment}/embeddings?api-version={self.api_version}"
            elif "/api/projects/" in endpoint:
                url = f"{endpoint}/openai/v1/embeddings"
                payload["model"] = emb_deployment
            else:
                url = f"{endpoint}/embeddings?api-version={self.api_version}"
            headers["api-key"] = self.key
            headers["Authorization"] = f"Bearer {self.key}"
        elif use_standard:
            url = f"{self.openai_base_url.rstrip('/')}/embeddings"
            payload["model"] = "text-embedding-3-small"
            headers["Authorization"] = f"Bearer {self.openai_key}"
        else:
            return [0.0] * 1536

        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                response = await client.post(url, json=payload, headers=headers)
                response.raise_for_status()
                data = response.json()
            return data["data"][0]["embedding"]
        except Exception as e:
            print("Error creating vector embeddings via API:", e)
            
            # Persistent fallback check
            if isinstance(e, httpx.HTTPStatusError) and e.response.status_code == 404:
                print("Enabling persistent local embeddings fallback (detected 404 from API).")
                self._use_local_embeddings = True
            elif "404" in str(e):
                print("Enabling persistent local embeddings fallback (detected 404 reference in error).")
                self._use_local_embeddings = True
                
            print("Attempting local SentenceTransformer fallback...")
            try:
                if not hasattr(self, "_local_embedding_model") or self._local_embedding_model is None:
                    from sentence_transformers import SentenceTransformer
                    print("Loading local SentenceTransformer model weights (first time)...")
                    self._local_embedding_model = SentenceTransformer("all-MiniLM-L6-v2")
                
                embedding_384 = self._local_embedding_model.encode(text).tolist()
                # Pad to 1536 dimensions to match database schema requirements
                embedding_1536 = embedding_384 + [0.0] * (1536 - len(embedding_384))
                print("Local embedding generated successfully (384-dim padded to 1536-dim).")
                return embedding_1536
            except Exception as le:
                print("Local embedding fallback failed:", le)
                return [0.0] * 1536

    async def extract_intern_profile(
        self,
        cv_text: str | None = None,
        self_pitch: str | None = None,
        transcript: str | None = None
    ) -> dict:
        """Extracts a structured profile (strengths, preferences, support options) from CV, pitch, and dialogue."""
        use_azure = bool(self.endpoint and self.key)
        use_standard = bool(self.openai_key)

        if not use_azure and not use_standard:
            return self._generate_fallback_intern_profile(cv_text, self_pitch)

        system_instruction = (
            "You are an AI Intern Understanding Engine. Analyze the candidate's CV, Self-Pitch, and practice session transcripts. "
            "Extract details to build a persistent Intern Profile matching this exact JSON schema:\n"
            "{\n"
            "  \"education\": \"Degree & Major (e.g. BA Film Making)\",\n"
            "  \"background\": \"Brief narrative summary of their journey (2-3 sentences)\",\n"
            "  \"internship_interests\": [\"Data Annotation\", \"Marketing\"],\n"
            "  \"technical_strengths\": [\"Adobe Premiere\", \"Python\"],\n"
            "  \"transferable_strengths\": [\"Attention to detail\", \"Reliability\"],\n"
            "  \"behavioral_strengths\": [\"Collaborative spirit\", \"Empathetic learning\"],\n"
            "  \"communication_preferences\": [\"Prefers written checklists\", \"Prefers visual diagrams\"],\n"
            "  \"working_style_preferences\": [\"Structured routines\", \"Asynchronous task assignments\"],\n"
            "  \"environment_preferences\": [\"Quiet workspace\", \"Remote working\"],\n"
            "  \"rephrasing_requirements\": \"Specific phrasing preference description (e.g. requires simpler sentence structures)\",\n"
            "  \"processing_time_preferences\": \"Specific response latency preference description (e.g. requires 5-10s to form answers)\",\n"
            "  \"example_based_learning_preferences\": \"Specific description (e.g. highly responsive to concrete sample templates)\",\n"
            "  \"accommodation_needs\": [\"Extra time for processing\", \"Written context summaries\"],\n"
            "  \"career_interests\": [\"Video Editing\", \"Creative Media\"],\n"
            "  \"role_alignment\": \"Detailed alignment description with internship options (e.g. high alignment with Data Annotation)\",\n"
            "  \"industry_preferences\": [\"Entertainment\", \"Information Technology\"],\n"
            "  \"long_term_aspirations\": \"E.g. Wants to be a lead content marketer\"\n"
            "}\n"
            "Do not output any text other than the JSON object."
        )

        prompt = ""
        if cv_text:
            prompt += f"### CANDIDATE CV/RESUME:\n{cv_text}\n\n"
        if self_pitch:
            prompt += f"### CANDIDATE SELF PITCH:\n{self_pitch}\n\n"
        if transcript:
            prompt += f"### PRACTICE SESSIONS DIALOGUE:\n{transcript}\n\n"

        payload = {
            "messages": [
                {"role": "system", "content": system_instruction},
                {"role": "user", "content": prompt}
            ],
            "max_tokens": 1200,
            "temperature": 0.2,
            "response_format": {"type": "json_object"}
        }

        url, headers, final_payload = self._get_endpoint_details(payload)

        try:
            async with httpx.AsyncClient(timeout=45.0) as client:
                response = await client.post(url, json=final_payload, headers=headers)
                response.raise_for_status()
                data = response.json()
            raw_content = data["choices"][0]["message"]["content"].strip()
            return json.loads(raw_content)
        except Exception as e:
            print("Error extracting intern profile:", e)
            return self._generate_fallback_intern_profile(cv_text, self_pitch)

    def _generate_fallback_intern_profile(self, cv_text: str | None, self_pitch: str | None) -> dict:
        matched_interests = ["Digital Marketing"]
        if cv_text and "annotat" in cv_text.lower():
            matched_interests = ["Data Annotation"]
        elif self_pitch and "research" in self_pitch.lower():
            matched_interests = ["Research Assistant"]

        return {
            "education": "BA Film Making & Editing (Mock)",
            "background": "Aspiring intern eager to apply digital creative talents to real-world projects. Possesses internship practice experience.",
            "internship_interests": matched_interests,
            "technical_strengths": ["Video Editing", "Content Writing", "Python Data Filtering"],
            "transferable_strengths": ["Attention to Detail", "Time Management", "Structured Scheduling"],
            "behavioral_strengths": ["Open-minded collaboration", "Warm receptive demeanor"],
            "communication_preferences": ["Prefers visual outlines", "Prefers written instructions"],
            "working_style_preferences": ["Structured checklists", "Independent milestones"],
            "environment_preferences": ["Quiet remote workplace"],
            "rephrasing_requirements": "Appreciates simpler questions and concrete example terms.",
            "processing_time_preferences": "Benefited by 5-8 seconds of response buffer time.",
            "example_based_learning_preferences": "Learns rapidly through task example screenshots.",
            "accommodation_needs": ["Extended response times", "Visual task outlines"],
            "career_interests": ["Content Creation", "Data Curation"],
            "role_alignment": f"High alignment with the JoBro platform {matched_interests[0]} track.",
            "industry_preferences": ["Digital Media", "Technology Solutions"],
            "long_term_aspirations": "Hopes to develop skills in AI content writing and lead projects."
        }

    def generate_character_summary(self, profile_data: dict) -> str:
        """Serializes Intern Profile JSON into a detailed descriptive string to generate vector embeddings."""
        summary_lines = [
            f"Education: {profile_data.get('education', 'N/A')}",
            f"Background: {profile_data.get('background', 'N/A')}",
            f"Interests: {', '.join(profile_data.get('internship_interests', []))}",
            f"Technical Strengths: {', '.join(profile_data.get('technical_strengths', []))}",
            f"Transferable Strengths: {', '.join(profile_data.get('transferable_strengths', []))}",
            f"Behavioral Strengths: {', '.join(profile_data.get('behavioral_strengths', []))}",
            f"Support Preferences: Rephrasing: {profile_data.get('rephrasing_requirements', 'N/A')}, Processing Time: {profile_data.get('processing_time_preferences', 'N/A')}, Examples: {profile_data.get('example_based_learning_preferences', 'N/A')}",
            f"Accommodations: {', '.join(profile_data.get('accommodation_needs', []))}",
            f"Career Path Preference: {', '.join(profile_data.get('career_interests', []))}",
            f"Role Alignment: {profile_data.get('role_alignment', 'N/A')}"
        ]
        return "\n".join(summary_lines)

    async def evaluate_candidate_state(self, transcript: str) -> dict:
        """Classifies the candidate's current engagement, confidence, stress, and support level."""
        use_azure = bool(self.endpoint and self.key)
        use_standard = bool(self.openai_key)

        if not use_azure and not use_standard:
            return self._generate_fallback_candidate_state()

        system_instruction = (
            "You are an AI Candidate State Classifier. Analyze the candidate dialogue transcript. "
            "Determine their current levels of engagement, confidence, and stress. "
            "You MUST respond in JSON format ONLY, matching this exact schema:\n"
            "{\n"
            "  \"engagement_level\": \"High\", // Low, Medium, High\n"
            "  \"confidence_level\": \"Medium\", // Low, Medium, High\n"
            "  \"stress_level\": \"Low\", // Low, Medium, High\n"
            "  \"support_requirement_level\": \"Low\" // Low, Medium, High\n"
            "}\n"
            "Do not output any introductory or concluding text outside of this JSON."
        )

        payload = {
            "messages": [
                {"role": "system", "content": system_instruction},
                {"role": "user", "content": f"### CANDIDATE DIALOGUE:\n{transcript}"}
            ],
            "max_tokens": 150,
            "temperature": 0.1,
            "response_format": {"type": "json_object"}
        }

        url, headers, final_payload = self._get_endpoint_details(payload)

        try:
            async with httpx.AsyncClient(timeout=15.0) as client:
                response = await client.post(url, json=final_payload, headers=headers)
                response.raise_for_status()
                data = response.json()
            raw_content = data["choices"][0]["message"]["content"].strip()
            return json.loads(raw_content)
        except Exception as e:
            print("Error evaluating candidate state:", e)
            return self._generate_fallback_candidate_state()

    def _generate_fallback_candidate_state(self) -> dict:
        return {
            "engagement_level": "High",
            "confidence_level": "Medium",
            "stress_level": "Low",
            "support_requirement_level": "Low"
        }


