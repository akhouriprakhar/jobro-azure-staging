-- Database migration script for IUE (Intern Understanding Engine)
-- Enables vector extensions and creates tables for persistent profiling

-- Enable the pgvector extension for similarity search support
CREATE EXTENSION IF NOT EXISTS vector;

-- Table for persistent Intern Profiles
CREATE TABLE IF NOT EXISTS public.intern_profiles (
    candidate_id UUID PRIMARY KEY,
    education TEXT,
    background TEXT,
    internship_interests TEXT[],
    learning_history JSONB DEFAULT '[]'::jsonb,
    
    -- Strength Layer
    technical_strengths TEXT[],
    transferable_strengths TEXT[],
    behavioral_strengths TEXT[],
    
    -- Preference Layer
    communication_preferences TEXT[],
    working_style_preferences TEXT[],
    environment_preferences TEXT[],
    
    -- Support Layer
    rephrasing_requirements TEXT,
    processing_time_preferences TEXT,
    example_based_learning_preferences TEXT,
    accommodation_needs TEXT[],
    
    -- Career Layer
    career_interests TEXT[],
    role_alignment TEXT,
    industry_preferences TEXT[],
    long_term_aspirations TEXT,
    
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Table for tracking longitudinal candidate growth metrics across practice sessions
CREATE TABLE IF NOT EXISTS public.intern_growth_timelines (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    candidate_id UUID REFERENCES public.intern_profiles(candidate_id) ON DELETE CASCADE,
    session_id UUID,
    confidence_score INTEGER CHECK (confidence_score >= 0 AND confidence_score <= 100),
    career_clarity_score INTEGER CHECK (career_clarity_score >= 0 AND career_clarity_score <= 100),
    self_expression_score INTEGER CHECK (self_expression_score >= 0 AND self_expression_score <= 100),
    recorded_at TIMESTAMPTZ DEFAULT NOW()
);

-- Table for storing candidate character profiles, strategy metadata, and embeddings (RAG knowledge base)
CREATE TABLE IF NOT EXISTS public.intern_character_embeddings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    candidate_id UUID, -- NULL for the 60 initial baseline character records
    session_id UUID,   -- NULL for the initial baseline records
    profile_text TEXT NOT NULL,
    embedding vector(1536) NOT NULL, -- Matched to OpenAI text-embedding-3-small (1536 dimensions)
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS (Row Level Security) and Policies for Tenant Isolation
ALTER TABLE public.intern_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.intern_growth_timelines ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.intern_character_embeddings ENABLE ROW LEVEL SECURITY;

-- Candidates can view/modify only their own profile data
CREATE POLICY candidate_profile_isolation ON public.intern_profiles
    FOR ALL
    USING (auth.uid() = candidate_id)
    WITH CHECK (auth.uid() = candidate_id);

CREATE POLICY candidate_timeline_isolation ON public.intern_growth_timelines
    FOR ALL
    USING (auth.uid() = candidate_id)
    WITH CHECK (auth.uid() = candidate_id);

-- System admin/founders can query/modify everything, while candidates can query public character records
CREATE POLICY candidate_vector_isolation ON public.intern_character_embeddings
    FOR SELECT
    USING (candidate_id IS NULL OR auth.uid() = candidate_id);

-- Indexes for similarity queries and lookups
CREATE INDEX IF NOT EXISTS intern_character_embeddings_cosine_idx ON public.intern_character_embeddings USING hnsw (embedding vector_cosine_ops);
CREATE INDEX IF NOT EXISTS intern_growth_timelines_candidate_idx ON public.intern_growth_timelines (candidate_id);

-- PL/pgSQL function to query cosine similarity distance against vector embeddings
CREATE OR REPLACE FUNCTION public.match_character_embeddings(
  query_embedding vector(1536),
  match_threshold float,
  match_count int
)
RETURNS TABLE (
  id UUID,
  candidate_id UUID,
  session_id UUID,
  profile_text TEXT,
  metadata JSONB,
  similarity float
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT
    ice.id,
    ice.candidate_id,
    ice.session_id,
    ice.profile_text,
    ice.metadata,
    (1 - (ice.embedding <=> query_embedding))::float AS similarity
  FROM public.intern_character_embeddings ice
  WHERE (1 - (ice.embedding <=> query_embedding)) > match_threshold
  ORDER BY ice.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;

