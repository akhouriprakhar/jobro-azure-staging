import asyncio
import sys
import os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from app.ai.azure_openai import AzureOpenAIClient

async def main():
    client = AzureOpenAIClient()
    print("Testing generate_options_for_question:")
    try:
        res = await client.generate_options_for_question("Hello, how are you?", interview_mode="NeuroAI Prep: Career Exploration")
        print(res)
    except Exception as e:
        print(f"Error: {e}")

    print("Testing generate_neuroai_feedback:")
    try:
        messages = [{"role": "user", "content": "I am fine"}]
        res2 = await client.generate_neuroai_feedback(messages=messages, track="Career Exploration", persona="Geethanjali")
        print(res2)
    except Exception as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    asyncio.run(main())
