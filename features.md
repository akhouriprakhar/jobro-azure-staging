# JoBro 2.0 Platform Features Documentation

This document provides a comprehensive, detailed inventory of the features, systems, and capabilities implemented on the **JoBro 2.0 Mock Interview & Assessment Platform**.

---

## 1. Frontend Architecture & Responsive Layout

* **Modern Stack & UI Library**: Built on Next.js 13 App Router, styled with Tailwind CSS, and enriched with Framer Motion transitions for smooth, glassmorphic micro-animations.
* **Fixed App Layout & Scrolling**:
  - Implements a viewport height lock (`h-screen max-h-screen overflow-hidden`) across all primary shells (such as the [DashboardShell](file:///c:/Users/Rahul/Documents/GitHub/Jobro%202.0/apps/frontend/app/components/dashboard/DashboardShell.tsx)).
  - Viewport scrolling is locked to the main content panel (`overflow-y-auto`), while the top navigation headers and left sidebars remain completely static and anchored.
* **Responsive Sidebar Drawer ([Sidebar.tsx](file:///c:/Users/Rahul/Documents/GitHub/Jobro%202.0/apps/frontend/app/components/dashboard/Sidebar.tsx))**:
  - **Desktop View**: Collapses/expands dynamically between `280px` (with full labels and active role card) and `88px` (centered icon badges with the role card hidden to prevent text truncation).
  - **Mobile View (Screens < 768px)**: Automatically defaults to a collapsed, off-screen layout (`width: 0`, translated `-280px` left). Clicking the navbar toggle slides the sidebar in as a `280px` absolute-positioned overlay drawer complete with a top close button (`X`).
  - **Dynamic Sidebar Link Filtering**: Links are filtered based on the authenticated user's role. For example, Student accounts are restricted to the `Dashboard` and `Interview AI` tabs, completely hiding `Analytics`, `Permissions`, and `Users` pages.

---

## 2. Interactive Mock Interview Workspace ([InterviewExperience.tsx](file:///c:/Users/Rahul/Documents/GitHub/Jobro%202.0/apps/frontend/app/components/InterviewExperience.tsx))

* **Interview Setup & Parameter Selection**:
  - **Persona Selector**: Choose from 6 different professional hiring manager personas.
  - **Difficulty Level Selector**: Allows candidates to select from **Easy**, **Medium**, or **Hard** difficulty levels. This dynamically shifts the AI's grading standards, complexity of scenarios, and critical follow-up questions.
  - **CV Upload / Input**: Provides both a manual text input area and a PDF upload zone to customize the interview context.
* **Client-Side PDF CV Parser**:
  - Integrates on-demand PDF parsing using PDF.js CDN workers. 
  - Uploaded binary PDF resumes are parsed page-by-page directly in the browser using an `ArrayBuffer` pipeline.
  - Extracted text automatically populates the CV context field, accompanied by loading indicators (`⏳ Parsing PDF resume text...`), eliminating the need for server-side PDF processing.
* **Multimodal Workspace**:
  - **Webcam & Audio Indicators**: Supports camera preview and real-time mic volume bars for mock presentation training.
  - **Speech-to-Text (STT)**: Employs standard browser Web Speech APIs to allow candidates to speak their answers.
  - **Text-to-Speech (TTS)**: Features speech synthesis read-back controls (`🔊`/`⏹️`) to read out individual interviewer statements or play back the conversation. It automatically scans for and prioritizes the highest quality natural/female English voices available (such as Microsoft Edge Online Natural voices like Aria/Jenny/Sonia, Google US English, and macOS Samantha) and displays a dropdown voice selector in the workspace to customize the voice persona.
  - **Live Speech-to-Speech Mode (Azure Speech Voice Live API)**:
    - **Unified Live Pipeline**: Chains real-time voice capture, streaming LLM inference, and lifelike neural voice synthesis into a single sub-second latency pipeline.
    - **Glassmorphic Voice UI ([VoiceWorkspace.tsx](file:///c:/Users/Rahul/Documents/GitHub/Jobro%202.0/apps/frontend/app/components/VoiceWorkspace.tsx))**: Switches the chat panel to a premium speech-practicing dashboard featuring an animated pulsing halo indicator matching speech activity (Idle, Listening, Thinking, Speaking) and real-time volume meters.
    - **Dynamic Audio Streaming**: Employs browser `AudioContext` and script processors to capture mono PCM 16kHz microphone audio and stream it over WebSockets. Buffered, chunk-scheduled playback guarantees gapless voice answers.
    - **Semantic Interruption Handling**: Instantly cancels active AI speech and updates local history lists when the user begins speaking.

---

## 3. Advanced AI Orchestration Layer ([azure_openai.py](file:///c:/Users/Rahul/Documents/GitHub/Jobro%202.0/apps/backend/app/ai/azure_openai.py))

* **6 Hiring Manager Personas**:
  - **Senior Software Engineer**: Direct engineering manager. Probes system design decisions, technical debt trade-offs, and codebase reviews.
  - **AI Architect**: Principal architect. Focuses on vector scaling, model compute costs, pipeline latency, data drift, and AI safety boundaries.
  - **Delivery Manager**: Agile delivery leader. Probes milestone predictability, timeline risks, scope adjustments, and team bottleneck resolutions.
  - **Product Manager**: Director of product. Tests MVP scoping, PM-Engineering alignment, and resolving user feedback conflicts.
  - **HR Recruiter**: Behavioral lead. Checks career transitions, collaboration, and feedback receptivity.
  - **AI Strategy Consultant**: Partner consulting advisor. Probes AI opportunity assessments, client ROI mapping, build-vs-buy decisions, and governance compliance.
* **70/20/10 Case Mix Protocol**:
  - **70% Case/Scenario-Based**: Real-world crises (e.g. system outages, stakeholder conflicts, budget limits).
  - **20% CV Deep Dive**: Specifically probes achievements, technologies, and metrics listed on the candidate's uploaded resume.
  - **10% Pure Theory**: Briefly checks fundamentals.
* **Challenge Escalation Logic**:
  - Analyzes the candidate's last answer. If the response is strong, the AI dynamically escalates complexity (e.g. 10x traffic spikes, new regulatory constraints, stakeholder conflicts). If the response is weak, the AI guides them back referencing CV details.
* **Difficulty-Aware Prompts**:
  - **Easy**: Uses constructive and encouraging language. Focuses on straightforward scenarios and guides candidates who struggle.
  - **Medium**: Evaluates standard professional competencies, pushes for trade-offs, and introduces moderate complexities.
  - **Hard**: Acts as an intense stakeholder or senior leader. Demands deep architectural, quantitative, and cost-benefit trade-offs, pushing back aggressively on weak reasoning.
* **Context Budgeting**:
  - Manages a sliding ~6,000 token context window, pruning older messages from the middle of history while keeping the welcome greeting and the most recent messages to protect API limits.

---

## 4. Assessment Reports & Evaluation Pipelines

* **Detailed Performance Analytics**:
  - Completing the mock interview triggers the AI assessment endpoint to evaluate candidate performance across 5 key dimensions:
    - **Technical Depth**
    - **Problem Solving**
    - **Communication**
    - **Leadership**
    - **Confidence**
* **Detailed Report Generator**:
  - Compiles an in-depth markdown analysis outlining:
    - **Key Accomplishments & Strengths**
    - **Technical Capabilities & Resume Alignment**
    - **Areas for Improvement & Actionable Advice**
    - **Communication & Pacing Analysis**

---

## 5. Role-Based Access Control (RBAC) Dashboards

The homepage layout dynamically alters templates based on user authorization roles fetched from Supabase sessions:
* **Admin Command Center (Role = `Admin`)**:
  - Displays database-driven active metrics cards (Active Users, Mock Sessions, Compliance levels).
  - Handles audit feeds showing real-time platform logins and evaluations.
  - Links to the **User Privilege portal** allowing admins to review and edit user roles (e.g. upgrade Student accounts to Admin).
* **Student Learning Portal (Role = `Student`)**:
  - Displays session progress tallies and average overall ratings.
  - **Competency Breakdown**: Renders animated, color-coded progress bars displaying averages across technical depth, communication, and problem-solving.
  - **Course Progressions**: Tracks progress across interactive study pathways (Masterclass, GenAI Strategy, Cloud Scale).
  - **Timeline Log**: Lists all completed mock interviews.
  - **Glassmorphic Report Viewer**: Launches a detailed modal parsing markdown reports, metrics, and targeted advice for past sessions.

---

## 6. Security, Data Isolation, & Resiliency

* **Database Resilience**:
  - Integrates progressive error-recovery fallback chains during database upserts and selects. 
  - If `difficulty_level` or metric columns do not yet exist in the user's Supabase tables, the repository catches the error, logs a warning, and falls back to base column updates, ensuring zero system crashes.
* **Candidate Data Isolation**:
  - Filters resume downloads and saved profile queries strictly against the active candidate's UUID. This protects user privacy and prevents cross-user document leakages.
* **UUID Enforcement**:
  - Generates deterministic UUIDs from candidate credentials using DNS namespaces to prevent syntax type mismatches in PostgreSQL queries.

---

## 7. Platform Styling, Loading & Branding

* **Custom Branding Logo**:
  - Features the official logo `JoBro-colorful.png` integrated into the sidebar layouts, loading pages, and dashboards.
* **Premium Loading Screen**:
  - Embeds a premium loading page featuring:
    - Centered branding logo with dynamic pulse and breathing animations.
    - Smooth circular dash ring rotation indicators.
    - Moving gradient progress bars with fading text indicators (`Loading user workspace...`).
* **Glassmorphic Back Buttons**:
  - Integrates "Back to Dashboard" shortcuts on services sub-pages.

---

## 8. Founder Interview Intelligence & Insights Dashboard

* **Access Restrictions & Sidebar Routing**:
  - Restricts access to the "Interview Intelligence" module to `Founder`, `Admin`, and `Program Manager` roles.
  - Dynamically renders the sidebar navigation:
    ```text
    Founder Dashboard
    ├── Users
    ├── Programs
    ├── Pathways
    ├── Interview Intelligence
    ├── Analytics
    ├── Reports
    └── Settings
    ```
* **Interview Intelligence Home (CRM + ATS + AI Insights)**:
  - **Overview Cards**: Displays quick metrics such as Total Completed (e.g., 247), Auto-Routed (e.g., 192), Human Review Required (e.g., 31), Corporate Leads (e.g., 12), Caregiver Leads (e.g., 8), and High-Potential Candidates (e.g., 4).
  - **Candidate Intelligence Table**: Displays a list of candidate sessions with attributes: Candidate Name, Type (Candidate, Caregiver, Corporate), Recommended Pathway, Confidence score, and Status (Auto Routed, Founder Review, Review Required).
* **Candidate Intelligence Report Profile**:
  - **AI-Generated Summary**: Shows demographics (Age Group, Location), Education, Current Status, Experience, Primary Goal, Challenges, and Suggested Support.
  - **AI Recommendation**: Displays Primary Pathway, Secondary Pathway, Priority, and Founder Attention flags.
  - **Interview Highlights**: Quick bullet points of Key Strengths and Concerns, saving review time.
  - **Skill Map**: Dynamic visual radar chart evaluating Communication, Technical Skill, Portfolio, Job Readiness, and Confidence (scale 1-10).
  - **Interview Timeline**: Key chronological event flags (e.g., Intro, Education, Portfolio, Search Challenges, Action Recommendations) with direct-jump timestamps.
* **AI-Generated Tags & Search**:
  - Automatically extracts tags (e.g., `#VideoEditing`, `#EmploymentSupport`, `#NeuroAI`, etc.) based on transcript topics.
  - Enables powerful query filters for founders to search candidates (e.g., "interested in AI", "caregivers", "corporate leads").
* **Proactive Founder Alerts**:a
  - Flagging systems with callouts:
    - **High Potential Candidate**: Candidate appears highly employable; recommends review.
    - **Corporate Lead**: Detects corporate representatives; flags workshop opportunities.
    - **NeuroAI Interest**: Identifies interest in upcoming cohorts and routes to waitlists.
* **Organization-Level Interview Analytics**:
  - **Demand Trends**: Visual distribution of candidate interest (e.g., Employment Support, NeuroAI Program, Caregiver Support, DE&I).
  - **Common Challenges**: AI-driven clustering of key obstacles (e.g., Portfolio Building, Interview Skills, LinkedIn Optimization, Networking, Resume Writing) to inform future Orchvate programs.
* **Transcript Intelligence Relational Architecture**:
  - Moves beyond raw text files to a fully queryable database schema using Supabase PostgreSQL:
    - `interview_sessions`: Stores session context, status, and metadata.
    - `interview_transcripts`: Houses raw conversational text with timestamps.
    - `interview_insights`: Holds generated summaries, strengths, concerns, and timeline flags.
    - `interview_recommendations`: Stores primary/secondary pathways, priority levels, and confidence scores.
    - `interview_tags`: Indexes search tags mapped to sessions.
    - `interview_actions`: Tracks alerts and pending founder review tasks.
* **Decision-Making Dashboard Principle**:
  - The transcript serves as raw material, while the dashboard prioritizes immediate decision-making. It answers five core questions at a glance:
    1. *WHO is this person?*
    2. *WHY did they come?*
    3. *WHAT do they need?*
    4. *WHICH pathway should they enter?*
    5. *DOES a founder need to intervene?*
  - Designed to convert a 45-minute screening call review into a 2-minute decision-making process.
