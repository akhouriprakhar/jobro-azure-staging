import asyncio
import os
import sys

# Add apps/backend to sys.path so we can import app
sys.path.append(os.path.join(os.path.dirname(__file__), "apps", "backend"))

# Set working directory to backend to ensure config resolves env_file correctly
os.chdir(os.path.join(os.path.dirname(__file__), "apps", "backend"))

from app.ai.azure_openai import AzureOpenAIClient

async def main():
    client = AzureOpenAIClient()
    print("Endpoint:", client.endpoint)
    print("Has key:", bool(client.key))
    print("Deployment:", client.deployment)
    
    mock_messages = [
        {"role": "assistant", "content": "[Geethanjali]: Welcome! How did you hear about our Neuro AI program?"},
        {"role": "user", "content": "I heard about it from my college senior who told me it is very good."},
        {"role": "assistant", "content": "[Geethanjali]: Which module or assignment did you enjoy the most during your time with us?"},
        {"role": "user", "content": "I liked data annotation. It was interesting to label images."},
        {"role": "assistant", "content": "[Geethanjali]: What was the most difficult or challenging part of the program for you?"},
        {"role": "user", "content": "I struggled with coding sometimes because the instructions were not very clear."}
    ]
    
    try:
        feedback = await client.generate_neuroai_feedback(
            messages=mock_messages,
            cv_text="Geethanjali. Python, Data Entry, Annotation.",
            track="Program Reflection",
            persona="Geethanjali",
            self_pitch="I want to work in data annotation and grow."
        )
        print("Success! Feedback received:")
        import pprint
        pprint.pprint(feedback)
    except Exception as e:
        print("Error encountered:")
        import traceback
        traceback.print_exc()

if __name__ == "__main__":
    asyncio.run(main())
