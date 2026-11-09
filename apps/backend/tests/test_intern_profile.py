import asyncio
import unittest
from unittest.mock import AsyncMock, MagicMock, patch
from app.schemas.intern_profile import InternProfileResponse, GrowthTimelineResponse
from app.services.intern_understanding_service import InternUnderstandingService


# Helper to run async tests in standard unittest
def async_test(coro):
    def wrapper(*args, **kwargs):
        loop = asyncio.get_event_loop()
        return loop.run_until_complete(coro(*args, **kwargs))
    return wrapper


class TestInternProfileFeatures(unittest.TestCase):
    
    # 1. Verify Pydantic Schemas Instantiation
    def test_pydantic_schemas_instantiation(self):
        profile_dict = {
            "candidate_id": "8746261c-a870-4af1-9956-8e94a28b9929",
            "education": "BS Computer Science",
            "background": "Software Engineering intern candidate",
            "internship_interests": ["Data Annotation", "Research"],
            "learning_history": [],
            "technical_strengths": ["Python", "SQL"],
            "transferable_strengths": ["Detail-oriented"],
            "behavioral_strengths": ["Collaborative"],
            "communication_preferences": ["Written"],
            "working_style_preferences": ["Structured"],
            "environment_preferences": ["Quiet"],
            "rephrasing_requirements": "Requires simple phrasing",
            "processing_time_preferences": "Standard buffer",
            "example_based_learning_preferences": "Responsive to example guides",
            "accommodation_needs": ["Visual outlines"],
            "career_interests": ["AI Development"],
            "role_alignment": "High alignment",
            "industry_preferences": ["Tech"],
            "long_term_aspirations": "Lead architect"
        }
        profile_resp = InternProfileResponse(**profile_dict)
        self.assertEqual(profile_resp.candidate_id, "8746261c-a870-4af1-9956-8e94a28b9929")
        self.assertEqual(profile_resp.education, "BS Computer Science")
        self.assertIn("Data Annotation", profile_resp.internship_interests)

    # 2. Test IUE Service Profile Rebuilding
    @patch("app.services.intern_understanding_service.InternRepository")
    @patch("app.services.intern_understanding_service.InterviewRepository")
    @patch("app.services.intern_understanding_service.AzureOpenAIClient")
    @async_test
    async def test_iue_profile_rebuild(self, mock_openai, mock_interview_repo, mock_intern_repo):
        # Setup mock instances
        mock_intern_inst = mock_intern_repo.return_value
        mock_interview_inst = mock_interview_repo.return_value
        mock_openai_inst = mock_openai.return_value

        # Setup return values
        mock_interview_inst.get_latest_cv_and_jd = AsyncMock(return_value={
            "cv_text": "Sample CV text",
            "job_description": "Sample Self Pitch"
        })
        mock_interview_inst.get_candidate_history = AsyncMock(return_value=[])
        
        mock_openai_inst.extract_intern_profile = AsyncMock(return_value={
            "education": "BA Film Making",
            "background": "Sample background description",
            "internship_interests": ["Digital Marketing"]
        })
        mock_openai_inst.generate_character_summary = MagicMock(return_value="Serialized profile text summary")
        mock_openai_inst.create_embeddings = AsyncMock(return_value=[0.1] * 1536)

        mock_intern_inst.upsert_profile = AsyncMock(return_value={
            "candidate_id": "candidate-uuid",
            "education": "BA Film Making",
            "background": "Sample background description",
            "internship_interests": ["Digital Marketing"]
        })
        mock_intern_inst.add_character_embedding = AsyncMock(return_value={})

        # Instantiate service and rebuild
        iue_service = InternUnderstandingService()
        profile = await iue_service.rebuild_profile(
            candidate_id="candidate-uuid",
            cv_text="Sample CV text",
            self_pitch="Sample Self Pitch",
            session_id="session-uuid"
        )

        # Verify calls and structures
        self.assertEqual(profile["education"], "BA Film Making")
        self.assertIn("Digital Marketing", profile["internship_interests"])
        mock_openai_inst.extract_intern_profile.assert_called_once()
        mock_intern_inst.upsert_profile.assert_called_once()
        mock_intern_inst.add_character_embedding.assert_called_once()


if __name__ == "__main__":
    unittest.main()
