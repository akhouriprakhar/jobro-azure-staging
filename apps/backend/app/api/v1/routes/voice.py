import base64
import logging
import asyncio
import json
from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from azure.core.credentials import AzureKeyCredential
from azure.ai.voicelive.aio import connect
from azure.ai.voicelive.models import (
    ServerEventResponseAudioDelta,
    ServerEventResponseAudioTranscriptDelta,
    ServerEventConversationItemInputAudioTranscriptionCompleted,
    UserMessageItem,
    InputTextContentPart
)
from app.core.config import settings
from app.repositories.interview_repository import InterviewRepository
from app.ai.azure_openai import AzureOpenAIClient


router = APIRouter()
logger = logging.getLogger(__name__)


@router.websocket("/voice-stream/{interview_id}")
async def voice_websocket_stream(websocket: WebSocket, interview_id: str):
    await websocket.accept()
    logger.info(f"Accepted voice WebSocket connection for interview {interview_id}")

    # Fetch CV/JD context from Supabase Repository
    repository = InterviewRepository()
    cv_text = None
    job_description = None
    interview_mode = None
    interviewer_persona = None
    difficulty_level = None
    years_of_experience = None
    try:
        context = await repository.get_context(interview_id)
        if context:
            cv_text = context.get("cv_text")
            job_description = context.get("job_description")
            interview_mode = context.get("interview_mode")
            interviewer_persona = context.get("interviewer_persona")
            difficulty_level = context.get("difficulty_level")
            years_of_experience = context.get("years_of_experience")
            logger.info(f"Fetched context for interview {interview_id}: CV len={len(cv_text) if cv_text else 0}, JD len={len(job_description) if job_description else 0}, Mode={interview_mode}, Persona={interviewer_persona}, Difficulty={difficulty_level}, YearsOfExp={years_of_experience}")
    except Exception as ex:
        logger.warn(f"Failed to fetch context for interview {interview_id}: {ex}")

    # Fallback to hardcoded NeuroAI Prep context if Supabase is giving issues
    if not interview_mode:
        interview_mode = "NeuroAI Prep: Career Exploration"
        interviewer_persona = "Geethanjali"
        cv_text = cv_text or "Neuro-divergent candidate with experience in data entry, eager to learn AI annotation and content creation."
        job_description = job_description or "I want to apply for an internship where I can use my attention to detail in structured tasks."
        logger.info("Using hardcoded NeuroAI Prep context because Supabase context fetch failed or returned None.")

    preferred_language = "English"
    if cv_text:
        for line in cv_text.split("\n"):
            if "Preferred Language:" in line:
                preferred_language = line.split("Preferred Language:")[-1].strip()
                break
    logger.info(f"Preferred language for interview {interview_id}: {preferred_language}")

    # Read configuration
    key = settings.AZURE_VOICELIVE_KEY or settings.AZURE_OPENAI_KEY
    endpoint = settings.AZURE_VOICELIVE_ENDPOINT or settings.AZURE_OPENAI_ENDPOINT
    deployment = settings.AZURE_VOICELIVE_DEPLOYMENT_NAME or settings.AZURE_OPENAI_DEPLOYMENT_NAME or "gpt-4o"

    if not key or not endpoint:
        logger.error("Azure Voice Live API credentials not configured in settings")
        await websocket.send_text(json.dumps({
            "type": "error",
            "message": "Azure Voice Live credentials are not configured on the server. Please check your .env settings."
        }))
        await websocket.close()
        return

    # Set up default system prompt fallback
    system_prompt = (
        "You are an AI mock interviewer helping a candidate practice. "
        "Keep your responses short, conversational, and direct. Probe their technical and practical skills."
    )

    def make_conversational_prompt(prompt: str, is_neuroai: bool = False, preferred_language: str = "English") -> str:
        if not preferred_language or preferred_language.strip() == "":
            preferred_language = "English"

        language_instruction = (
            f"- ALWAYS conduct the interview and respond in {preferred_language}. Do NOT switch to any other language under any circumstances (such as Hindi, Hinglish, Malayalam, Tamil, or any regional language), even if the candidate uses non-English words, phrases, or responds entirely in another language."
            if preferred_language.lower() == "english"
            else f"- ALWAYS conduct the interview and respond in {preferred_language}. Do NOT switch to any other language under any circumstances (such as English, Hinglish, or other regional languages), even if the candidate responds in a different language."
        )

        if "CRITICAL SPEECH GUIDELINES" in prompt:
            for header in ["CRITICAL SPEECH GUIDELINES FOR NEURO-INCLUSIVE PRACTICE:", "CRITICAL SPEECH GUIDELINES:"]:
                if header in prompt:
                    prompt = prompt.replace(header, f"{header}\n{language_instruction}")
                    break
            else:
                prompt = prompt + f"\n\nCRITICAL SPEECH GUIDELINE:\n{language_instruction}"
            return prompt

        if is_neuroai:
            natural_speech_guidelines = (
                "\n\nCRITICAL SPEECH GUIDELINES FOR NEURO-INCLUSIVE PRACTICE:\n"
                f"{language_instruction}\n"
                "- Speak in a very warm, supportive, encouraging, and patient tone.\n"
                "- Speak clearly and at a moderate, calm pace.\n"
                "- Use gentle backchanneling acknowledgments (e.g., 'Thank you for sharing', 'That makes a lot of sense', 'I understand') before moving to your next question.\n"
                "- Keep responses short (typically 1-2 sentences) so the candidate does not feel overwhelmed.\n"
                "- Ask exactly one clear, direct question at a time.\n"
                "- Avoid complex jargon or lists. Speak in complete, simple, and comforting sentences.\n"
                "- Tailor your questions and follow-ups to reference or align with the candidate's CV and self pitch where relevant.\n"
                "- Never act as a gatekeeper or recruiter. Do not challenge aggressively, pressure the candidate, or judge their communication style."
            )
        else:
            natural_speech_guidelines = (
                "\n\nCRITICAL SPEECH GUIDELINES:\n"
                f"{language_instruction}\n"
                "- Speak in a natural, casual, and conversational tone.\n"
                "- Use occasional verbal fillers (e.g., 'um', 'uh', 'well', 'hmmm') to sound human-like and realistic.\n"
                "- Keep responses short and punchy (typically 1-3 sentences) to prevent long monologue-like answers.\n"
                "- Use backchanneling acknowledgments (e.g., 'Got it', 'Right', 'Interesting', 'Makes sense') before answering or asking your next question.\n"
                "- Avoid formal lists or bullet points in speech. Speak in complete, flowing sentences."
            )
        return prompt + natural_speech_guidelines

    credential = AzureKeyCredential(key)

    try:
        # Construct correct VoiceLive endpoint if it has standard OpenAI suffix
        # VoiceLive uses standard project format: https://<endpoint>/api/projects/<project-id>
        # Let's ensure the endpoint scheme is secure websocket or https
        clean_endpoint = endpoint
        if clean_endpoint.startswith("http://"):
            clean_endpoint = clean_endpoint.replace("http://", "https://")

        # Note: Do not append "/api/projects" path as VoiceLive service endpoint should be the base domain.

        async with connect(
            endpoint=clean_endpoint,
            credential=credential,
            model=deployment
        ) as azure_conn:
            logger.info("Successfully connected to Azure Voice Live API")

            # Wait for the client's initial configuration/setup message
            init_message = await websocket.receive_text()
            init_data = json.loads(init_message)

            if "system_prompt" in init_data:
                system_prompt = init_data["system_prompt"]

            voice_name = init_data.get("voice", "shimmer")
            is_reconnect = init_data.get("is_reconnect", False)

            # Map standard clean voice names to OpenAI voice options
            # Choices: alloy, ash, ballad, coral, echo, sage, shimmer, verse, marin, cedar
            supported_openai_voices = ["alloy", "ash", "ballad", "coral", "echo", "sage", "shimmer", "verse", "marin", "cedar"]
            voice_choice = "shimmer"
            for v in supported_openai_voices:
                if v in voice_name.lower():
                    voice_choice = v
                    break

            is_neuroai = interview_mode is not None and (interview_mode.startswith("NeuroAI Prep:") or "pathway" in interview_mode.lower())
            silence_ms = 2000 if is_neuroai else 800

            # --- DEBUG LOGGING FOR FRONTEND CONSOLE ---
            try:
                await websocket.send_text(json.dumps({
                    "type": "debug",
                    "data": {
                        "interview_mode": interview_mode,
                        "is_neuroai": is_neuroai,
                        "interviewer_persona": interviewer_persona,
                        "fallback_triggered": (not context) or (not context.get("interview_mode")),
                        "deployment_used": deployment
                    }
                }))
            except Exception as debug_err:
                logger.warn(f"Failed to send debug info to client: {debug_err}")
            # ------------------------------------------

            # Update Session with system prompt and configuration
            await azure_conn.session.update(session={
                "modalities": ["text", "audio"],
                "instructions": make_conversational_prompt(system_prompt, is_neuroai=is_neuroai, preferred_language=preferred_language),
                "voice": voice_choice,
                "input_audio_format": "pcm16",
                "output_audio_format": "pcm16",
                "input_audio_transcription": {
                    "model": "whisper-1"
                },
                "turn_detection": {
                    "type": "server_vad",
                    "threshold": 0.8,
                    "prefix_padding_ms": 300,
                    "silence_duration_ms": silence_ms
                }
            })

            # Proactively trigger a welcome response from the assistant only if not a reconnect
            if not is_reconnect:
                logger.info("Triggering proactive assistant welcome response")
                await azure_conn.response.create()
            else:
                logger.info("Skipping proactive assistant welcome response for reconnection")

            # Accumulate transcript deltas for the current response to generate suggestions
            current_response_transcript = []
            
            # Keep track of the last question to pair with the candidate's answer for simultaneous feedback processing
            last_ai_question = {"text": "Tell me about yourself."}

            async def receive_from_client():
                try:
                    while True:
                        message = await websocket.receive_text()
                        data = json.loads(message)

                        msg_type = data.get("type")
                        if msg_type == "audio":
                            audio_base64 = data.get("data")
                            if audio_base64:
                                await azure_conn.input_audio_buffer.append(audio=audio_base64)
                        elif msg_type == "cancel":
                            await azure_conn.response.cancel()
                        elif msg_type == "text":
                            text_content = data.get("data")
                            if text_content:
                                logger.info(f"Received text option from client: {text_content}")
                                await azure_conn.conversation.item.create(
                                    item=UserMessageItem(
                                        content=[
                                            InputTextContentPart(text=text_content)
                                        ]
                                    )
                                )
                                
                                # Fire off simultaneous background QA evaluation for the text turn
                                if last_ai_question.get("text"):
                                    logger.info("Simultaneously evaluating candidate's text answer in the background...")
                                    eval_client = AzureOpenAIClient()
                                    asyncio.create_task(eval_client.evaluate_and_cache_qa_pair(
                                        interview_id=interview_id,
                                        question=last_ai_question["text"],
                                        answer=text_content,
                                        cv_text=cv_text,
                                        persona=interviewer_persona,
                                        track=interview_mode.replace("NeuroAI Prep: ", "") if interview_mode else None
                                    ))

                                await azure_conn.response.create()
                        elif msg_type == "update_session":
                            new_prompt = data.get("system_prompt")
                            update_data = {}
                            if new_prompt:
                                update_data["instructions"] = make_conversational_prompt(new_prompt, is_neuroai=is_neuroai, preferred_language=preferred_language)
                            if update_data:
                                await azure_conn.session.update(session=update_data)
                except WebSocketDisconnect:
                    logger.info("Client WebSocket disconnected")
                except Exception as e:
                    logger.warn(f"Error receiving from client: {e}")

            async def send_to_client():
                try:
                    async for event in azure_conn:
                        event_type = getattr(event, "type", "")
                        
                        if event_type == "response.created" or event.__class__.__name__ == "ServerEventResponseCreated":
                            await websocket.send_text(json.dumps({
                                "type": "response_created"
                            }))
                        elif event_type == "response.audio.delta" or isinstance(event, ServerEventResponseAudioDelta):
                            audio_bytes = getattr(event, "delta", b"")
                            if audio_bytes:
                                audio_b64 = base64.b64encode(audio_bytes).decode("utf-8")
                                await websocket.send_text(json.dumps({
                                    "type": "audio",
                                    "data": audio_b64
                                }))
                        elif event_type == "response.audio_transcript.delta" or isinstance(event, ServerEventResponseAudioTranscriptDelta):
                            transcript_delta = getattr(event, "delta", "")
                            if transcript_delta:
                                current_response_transcript.append(transcript_delta)
                                await websocket.send_text(json.dumps({
                                    "type": "transcript",
                                    "data": transcript_delta
                                }))
                        elif event_type == "conversation.item.input_audio_transcription.completed" or isinstance(event, ServerEventConversationItemInputAudioTranscriptionCompleted):
                            user_transcript = getattr(event, "transcript", "")
                            if user_transcript:
                                await websocket.send_text(json.dumps({
                                    "type": "user_transcript",
                                    "data": user_transcript
                                }))
                                # Fire off simultaneous background QA evaluation for the audio turn
                                if last_ai_question.get("text"):
                                    logger.info("Simultaneously evaluating candidate's spoken answer in the background...")
                                    eval_client = AzureOpenAIClient()
                                    asyncio.create_task(eval_client.evaluate_and_cache_qa_pair(
                                        interview_id=interview_id,
                                        question=last_ai_question["text"],
                                        answer=user_transcript,
                                        cv_text=cv_text,
                                        persona=interviewer_persona,
                                        track=interview_mode.replace("NeuroAI Prep: ", "") if interview_mode else None
                                    ))
                        elif event_type == "input_audio_buffer.speech_started":
                            current_response_transcript.clear()
                            await websocket.send_text(json.dumps({
                                "type": "speech_started"
                            }))
                        elif event_type == "response.done" or event.__class__.__name__ == "ServerEventResponseDone":
                            await websocket.send_text(json.dumps({
                                "type": "response_done"
                            }))
                            if current_response_transcript:
                                full_question = "".join(current_response_transcript).strip()
                                current_response_transcript.clear()
                                last_ai_question["text"] = full_question
                                
                                # For Pathway Discovery, do not generate options/suggestions for the candidate to select
                                is_pathway = interview_mode is not None and "pathway" in interview_mode.lower()
                                if full_question and not is_pathway:
                                    logger.info(f"AI response completed: '{full_question}'. Generating options...")
                                    try:
                                        openai_client = AzureOpenAIClient()
                                        options = await openai_client.generate_options_for_question(
                                            question_text=full_question,
                                            cv_text=cv_text,
                                            job_description=job_description,
                                            interview_mode=interview_mode,
                                            interviewer_persona=interviewer_persona,
                                            difficulty_level=difficulty_level,
                                            years_of_experience=years_of_experience
                                        )
                                        logger.info(f"Generated options for voice response: {options}")
                                        await websocket.send_text(json.dumps({
                                            "type": "options",
                                            "data": options
                                        }))
                                    except Exception as opt_err:
                                        logger.error(f"Error generating or sending response options: {opt_err}")
                        elif event_type == "error":
                            await websocket.send_text(json.dumps({
                                "type": "error",
                                "message": str(event)
                            }))
                except Exception as e:
                    logger.error(f"Error relaying from Azure Voice Live: {e}")

            # Create tasks to run concurrently
            receive_task = asyncio.create_task(receive_from_client())
            send_task = asyncio.create_task(send_to_client())

            # Wait for either task to finish or error, then cancel the other one
            done, pending = await asyncio.wait(
                [receive_task, send_task],
                return_when=asyncio.FIRST_COMPLETED
            )

            for task in pending:
                logger.info("Cancelling pending WebSocket task")
                task.cancel()
                try:
                    await task
                except asyncio.CancelledError:
                    pass
                except Exception as e:
                    logger.warn(f"Error during pending task cancellation: {e}")

    except Exception as e:
        logger.error(f"Failed to run Voice Live session: {e}")
        try:
            await websocket.send_text(json.dumps({
                "type": "error",
                "message": f"Voice Live session error: {str(e)}"
            }))
            await websocket.close()
        except Exception:
            pass
