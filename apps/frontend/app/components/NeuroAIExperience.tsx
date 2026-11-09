"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import {
  Sparkles,
  BookOpen,
  UserCheck,
  Activity,
  FileText,
  CheckCircle2,
  Clock,
  Calendar,
  ChevronRight,
  X,
  ArrowUpRight,
  Loader2,
  Mic,
  Send,
  Volume2,
  VolumeX,
  RefreshCw,
  HelpCircle,
  Smile,
  Compass,
  ArrowLeft,
  Play,
  ClipboardList
} from "lucide-react";
import { supabase } from "../../lib/supabaseClient";
import VoiceWorkspace from "./VoiceWorkspace";
import LoadingScreen from "./LoadingScreen";

// Client-side PDF Parser using PDF.js
const parsePdfText = async (file: File): Promise<string> => {
  if (typeof window === "undefined") return "";

  if (!(window as any).pdfjsLib) {
    await new Promise<void>((resolve, reject) => {
      const script = document.createElement("script");
      script.src = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.4.120/pdf.min.js";
      script.onload = () => {
        const pdfjsLib = (window as any).pdfjsLib;
        pdfjsLib.GlobalWorkerOptions.workerSrc = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.4.120/pdf.worker.min.js";
        resolve();
      };
      script.onerror = () => reject(new Error("Failed to load PDF parser library."));
      document.head.appendChild(script);
    });
  }

  const pdfjsLib = (window as any).pdfjsLib;
  const arrayBuffer = await new Promise<ArrayBuffer>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      if (e.target?.result instanceof ArrayBuffer) {
        resolve(e.target.result);
      } else {
        reject(new Error("Failed to read file as ArrayBuffer"));
      }
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsArrayBuffer(file);
  });

  const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
  const pdf = await loadingTask.promise;

  let fullText = "";
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const textContent = await page.getTextContent();
    const pageText = textContent.items.map((item: any) => item.str).join(" ");
    fullText += pageText + "\n";
  }

  return fullText;
};

// Client-side DOCX Parser using Mammoth.js
const parseDocxText = async (file: File): Promise<string> => {
  if (typeof window === "undefined") return "";

  if (!(window as any).mammoth) {
    await new Promise<void>((resolve, reject) => {
      const script = document.createElement("script");
      script.src = "https://cdnjs.cloudflare.com/ajax/libs/mammoth/1.6.0/mammoth.browser.min.js";
      script.onload = () => {
        resolve();
      };
      script.onerror = () => reject(new Error("Failed to load DOCX parser library."));
      document.head.appendChild(script);
    });
  }

  const mammoth = (window as any).mammoth;
  const arrayBuffer = await new Promise<ArrayBuffer>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      if (e.target?.result instanceof ArrayBuffer) {
        resolve(e.target.result);
      } else {
        reject(new Error("Failed to read file as ArrayBuffer"));
      }
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsArrayBuffer(file);
  });

  const result = await mammoth.extractRawText({ arrayBuffer });
  return result.value;
};

const getApiUrl = (path: string) => {
  if (typeof window !== "undefined") {
    const hostname = window.location.hostname;
    if (hostname === "localhost" || hostname === "127.0.0.1") {
      return `http://localhost:8000${path}`;
    }
  }
  // Bypass Netlify proxy in production to prevent 504 Gateway Timeouts on long requests
  return `https://jobro-2-0.onrender.com${path}`;
};
const ALL_QUESTION_BANK = [
  "What did you like most about the Neuro Al program and Why?",
  "What did you like least about the Neuro Al Program and Why?",
  "Which Annotation Module did they like the most and Why?",
  "Which annotation Module did they like the least and Why?",
  "Which Soft Skills assignment did they like the most and Why?",
  "Which Soft skills assignment did they like the least and Why"
];


export default function NeuroAIExperience() {
  const formatFeedbackMarkdown = (text: string): string => {
    // 1. Normalize all CRLF to LF, and add a trailing newline to avoid EOF issues
    let html = text.replace(/\r/g, "") + "\n";

    // 2. Replace H1, H2, H3
    html = html.replace(/^# (.*?)\n/gm, '<h1 class="text-xl font-black text-[#150E56] mt-5 mb-3 border-b border-[#150E56]/10 pb-1">$1</h1>');
    html = html.replace(/^## (.*?)\n/gm, '<h2 class="text-lg font-bold text-[#150E56] mt-4 mb-2">$1</h2>');
    html = html.replace(/^### (.*?)\n/gm, '<h3 class="text-base font-bold text-[#150E56] mt-4 mb-2">$1</h3>');

    // 3. Replace bold (**text**)
    html = html.replace(/\*\*(.*?)\*\*/g, '<strong class="font-bold text-[#150E56]">$1</strong>');

    // 4. Replace bullet lists starting with - or *
    html = html.replace(/^[-*]\s+(.*?)\n/gm, '<li class="ml-4 list-disc text-sm text-[#2C3454] my-1">$1</li>');

    // 5. Replace numbered lists starting with digits (e.g. 1.)
    html = html.replace(/^\d+\.\s+(.*?)\n/gm, '<li class="ml-4 list-decimal text-sm text-[#2C3454] my-1">$1</li>');

    // 6. Replace paragraphs (double newlines) with breaks
    html = html.replace(/\n\n/g, '<br/>');

    return html;
  };

  // Candidate info
  const [candidateId, setCandidateId] = useState<string>("");
  const [candidateName, setCandidateName] = useState<string>("Candidate");

  // Flow State
  const [isConfigured, setIsConfigured] = useState(false);
  const [isFinished, setIsFinished] = useState(false);
  const [loading, setLoading] = useState(true);

  // Form selections
  const [selectedPersona, setSelectedPersona] = useState<"Geethanjali" | "Panchali">("Geethanjali");
  const [selectedTrack, setSelectedTrack] = useState<string>("Unified Mock");
  const [selectedBankQuestions, setSelectedBankQuestions] = useState<string[]>([]);

  // Resume upload states
  const [cvText, setCvText] = useState("");
  const [fileName, setFileName] = useState("");
  const [isParsingPdf, setIsParsingPdf] = useState(false);
  const [isLoadingPrevious, setIsLoadingPrevious] = useState(false);

  // Session stats
  const [history, setHistory] = useState<any[]>([]);
  const [selectedReport, setSelectedReport] = useState<any | null>(null);
  const [sessionId, setSessionId] = useState("");
  const [attemptCount, setAttemptCount] = useState(1);

  // Chat/Interview State
  const [chatMessages, setChatMessages] = useState<{ role: "user" | "assistant"; content: string; time: string }[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [isAiTyping, setIsAiTyping] = useState(false);
  const [coachingInsight, setCoachingInsight] = useState("Your practice partner is ready.");
  const [suggestedOptions, setSuggestedOptions] = useState<string[]>([]);
  const chatEndRef = useRef<HTMLDivElement | null>(null);

  // Feedback State
  const [isGeneratingFeedback, setIsGeneratingFeedback] = useState(false);
  const [feedbackReport, setFeedbackReport] = useState<any | null>(null);
  const [feedbackTab, setFeedbackTab] = useState<"www" | "ati" | "sai">("www");

  // GPT Realtime Live Voice States
  const [isVoiceMode, setIsVoiceMode] = useState(false);
  const [selectedVoiceName, setSelectedVoiceName] = useState("shimmer");
  const [speechSpeed, setSpeechSpeed] = useState("1.5");
  const voiceRef = useRef<{ sendTextOption: (text: string) => void; sendInclusiveAction: (action: "rephrase" | "give_example" | "need_more_time" | "skip") => void } | null>(null);

  // Self Pitch and Dictation States
  const [selfPitch, setSelfPitch] = useState("");
  const [isDictatingPitch, setIsDictatingPitch] = useState(false);
  const pitchRecRef = useRef<any>(null);

  const togglePitchDictation = () => {
    if (typeof window === "undefined") return;
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      alert("Speech Recognition API is not supported in this browser.");
      return;
    }

    if (isDictatingPitch) {
      if (pitchRecRef.current) {
        pitchRecRef.current.stop();
      }
      setIsDictatingPitch(false);
      return;
    }

    const rec = new SpeechRecognition();
    rec.continuous = true;
    rec.interimResults = true;
    rec.lang = "en-US";

    rec.onstart = () => {
      setIsDictatingPitch(true);
    };

    rec.onresult = (event: any) => {
      let text = "";
      for (let i = 0; i < event.results.length; i++) {
        text += event.results[i][0].transcript;
      }
      setSelfPitch(text);
    };

    rec.onerror = (event: any) => {
      console.error("Pitch dictation error", event.error);
      setIsDictatingPitch(false);
    };

    rec.onend = () => {
      setIsDictatingPitch(false);
    };

    pitchRecRef.current = rec;
    rec.start();
  };

  const systemPrompt = useMemo(() => {
    const personaPrompt = selectedPersona === "Geethanjali"
      ? `You are Geethanjali Ganapathy, a supportive, neuro-inclusive Interview Facilitator for the Neuro AI Internship Preparation.
Your primary role is to create psychological safety, build rapport, guide the conversation, and encourage the candidate to comfortably share their experiences.
You are warm, approachable, friendly, patient, calm, respectful, encouraging, curious, and non-confrontational.
Candidates should feel that you genuinely want to understand them, not judge or evaluate them.
CRITICAL BEHAVIORS:
- Speak in a very warm, supportive, encouraging, and patient tone.
- Listen closely to the candidate's responses and ask relevant, warm follow-up questions to understand their experiences and background deeper, while maintaining your supportive, comforting character.
- Ask exactly ONE clear, simple question at a time. Never double-barrel or ask multi-part questions.
- Allow processing time. Wait patiently, do not rush the candidate.
- Use simple, clear language. Avoid complex jargon (e.g. use "What challenges did you face?" instead of "elaborate on operational challenges").
- Do NOT score, judge, evaluate, or challenge candidate answers. You are not responsible for evaluation.
- Accept text and voice responses equally.
- If the candidate struggles or asks, offer helpful examples (e.g., "Would it help if I gave an example?").
- If the candidate appears confused, rephrase using simpler words rather than repeating the same wording.
- Never interpret long pauses, stimming, monotone speech, looking away, short or detailed answers, typing, or asking for clarification negatively.
- NEVER challenge aggressively, never act like a recruiter ("Why should we hire you?"), never pressure, and never judge communication style.`
      : `You are Panchali Banerjee, a Career Discovery & Internship Readiness Mentor for the Neuro AI Internship Preparation.
Your role is to act as a career strategist and opportunity mentor: explore candidate interests, identify suitable internship pathways, assess readiness for workplace environments, understand decision-making, and identify transferable skills.
You are professional but warm, practical, curious, and opportunity-oriented.
Candidates should feel that you want to understand how they can fit into real work opportunities, not evaluating whether they deserve it.
CRITICAL BEHAVIORS:
- Ask exploratory, conversational questions that connect experiences to real-world work (e.g., "Would you prefer marketing or data annotation?").
- Listen closely to the candidate's responses and ask relevant, practical, and mentoring follow-up questions to explore their preferences, motivations, and pathways deeper.
- Curious and practical: explore preferences deeper than surface answers (e.g., if they like marketing, ask what interests them about it).
- Do NOT act as a gatekeeper, recruiter, or examiner; you are here to help them think through options.
- Discover accommodation needs and workplace preferences (e.g., structured routine, written instructions).
- Identify transferable skills from non-formal experiences (e.g. podcasting, volunteering).
- Never cross-examine, never use stress interviews, never challenge accommodations/disabilities, and never equate communication with competence.
- Ask exactly ONE clear, simple question at a time. Allow processing time and speak warmly.`;

    const trackPrompt = `
You MUST guide the candidate through the complete "Inclusive Interview for Internship" sequence consisting of exactly 9 questions in total. Follow this sequence step-by-step:

CONVERSATION SEQUENCE & SECTIONS (9 Questions Total):
- Section 1: Self-Introduction (Turn 1). Ask the candidate to introduce themselves based on the guidelines in the welcome script. (Progress: 9 questions remaining)
- Section 2: CV & Self Pitch Questions (Turns 2 and 3). Ask exactly 2 questions related directly to the candidate's CV/Resume: "${cvText}" and self-pitch: "${selfPitch}". (Progress: 8 and then 7 questions remaining)
- Section 3: Question Bank Questions (Turns 4, 5, 6, and 7). Ask exactly the following 4 questions, one by one. Ask them EXACTLY as they are written below. Do NOT change their wording or paraphrase them. Ask no other questions in this section:
  1. ${selectedBankQuestions[0] || "What did you like most about the Neuro Al program and Why?"}
  2. ${selectedBankQuestions[1] || "What did you like least about the Neuro Al Program and Why?"}
  3. ${selectedBankQuestions[2] || "Which Annotation Module did they like the most and Why?"}
  4. ${selectedBankQuestions[3] || "Which annotation Module did they like the least and Why?"}
  (Progress: 6, 5, 4, and then 3 questions remaining)
- Section 4: Follow-up Questions (Turns 8 and 9). Ask exactly 2 follow-up questions based on the candidate's answers to the 4 Question Bank questions from Section 3. (Progress: 2 and then 1 question remaining)
- Section 5: Wrap-up & Candidate Questions (Turn 10). Congratulate them on completing all questions, and ask if they have any questions for you.

CRITICAL PROGRESS UPDATE RULE:
At the end of every response/question you make (starting from turn 1), you MUST verbally state a friendly, supportive update of how many questions are left in the session and how much time remains. Estimate the remaining time as 1.5 minutes per remaining question (e.g., if 4 questions are remaining, say "We have 4 questions remaining, and about 6 minutes left" or similar). Keep this update brief, natural, and encouraging.
`;

    const cvPrompt = cvText ? `Candidate's CV/Resume Context:\n"${cvText}"\n\n` : "";
    const pitchPrompt = selfPitch ? `Candidate's Initial Self Pitch (Introduction & Goals):\n"${selfPitch}"\n\n` : "";
    const introScriptPrompt = `
CRITICAL INTRODUCTION RULE: If this is the very first turn of the interview, your response MUST be EXACTLY the following script, word-for-word, and nothing else:
"Welcome to your NeuroAI Interview Practice! I'm your AI Interview Coach, and I'll guide you through a mock interview that closely matches the real NeuroAI interview.

The interview will take about 10–15 minutes. We'll start with your self-introduction, followed by a few questions about your background, resume, the NeuroAI program, and your understanding of the internship. At the end, you can ask me any questions, and I'll provide detailed feedback on your performance.

There's no need to use perfect English—just answer naturally in your own words. If you need a moment to think, that's completely fine.

Let's begin. Please introduce yourself."`;

    return `${personaPrompt}

${trackPrompt}

${pitchPrompt}${cvPrompt}${introScriptPrompt}

CRITICAL SPEECH GUIDELINES:
1. On the very first turn of the conversation, you MUST ignore any sentence length limits and output the EXACT text from the CRITICAL INTRODUCTION RULE above, word-for-word.
2. For subsequent turns (after the candidate has completed their self-introduction), keep your responses short (typically 1-2 sentences) so the candidate does not feel overwhelmed.
3. Speak in a very warm, supportive, encouraging, and patient tone.
4. Speak clearly and at a moderate, calm pace.
5. Use gentle backchanneling acknowledgments (e.g., 'Thank you for sharing', 'That makes a lot of sense') before moving to your next question.
6. Ask exactly one clear, direct question at a time.
7. ALWAYS conduct the interview and respond in English. Do NOT switch to any other language (such as Hindi, Hinglish, Malayalam, Tamil, etc.), even if the candidate uses non-English words, phrases, or responds entirely in another language.

CONVERSATION PROGRESSION & TERMINATION RULES:
1. On the very first turn of the conversation, you MUST respond with the EXACT text from the CRITICAL INTRODUCTION RULE above, word-for-word, and nothing else.
2. For subsequent turns (after the candidate has completed their self-introduction), guide the candidate through the remaining core questions sequentially. Do not skip any question, and do not ask multiple core questions at once.
3. When asking the selected Section 3 Question Bank questions, you MUST ask the question EXACTLY as written in the list. Do NOT change a single word, do NOT rephrase it, do NOT summarize it, and do NOT add any greeting or transition words to the question itself. It must be printed verbatim.
4. Keep track of how many core questions you have asked.
5. Once all core questions on the list have been asked and answered, you MUST wrap up the interview.
6. In the wrap-up, thank the candidate warmly, summarize their key points positively, and state the termination instruction exactly: "Thank you for sharing your experiences with me today! We have completed all our practice questions. Please click on the 'End Practice & Get Feedback' button at the bottom right of the screen to complete the mock preparation and get your feedback."
7. Do NOT ask any more questions or introduce new topics during or after the wrap-up. If the user continues to talk or type after wrap-up, simply repeat the termination instruction politely.`;
  }, [selectedPersona, selectedTrack, cvText, selfPitch, selectedBankQuestions]);

  // Fetch session user and history
  const fetchUserData = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        setLoading(false);
        return;
      }
      setCandidateId(session.user.id);
      const name = session.user.user_metadata?.full_name || session.user.email?.split("@")[0] || "Rahul";
      setCandidateName(name);

      // Fetch past sessions
      const response = await fetch(getApiUrl(`/api/v1/interview/history/${session.user.id}`));
      if (response.ok) {
        const data = await response.json();
        // Filter history matching Neuro AI
        const neuroHistory = data.filter((item: any) =>
          item.interview_mode && item.interview_mode.startsWith("NeuroAI Prep:")
        );
        setHistory(neuroHistory);
      }
    } catch (err) {
      console.error("Error loading user data:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUserData();
  }, []);

  // Scroll to bottom of chat
  useEffect(() => {
    if (chatEndRef.current) {
      chatEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [chatMessages, isAiTyping]);

  // Handle Resume upload (PDF, TXT, DOCX)
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    setIsParsingPdf(true);

    try {
      let text = "";
      if (file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf")) {
        text = await parsePdfText(file);
      } else if (file.name.toLowerCase().endsWith(".docx")) {
        text = await parseDocxText(file);
      } else {
        // Read as plain text for TXT/MD files
        text = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = (event) => resolve(event.target?.result as string);
          reader.onerror = (err) => reject(err);
          reader.readAsText(file);
        });
      }
      setCvText(text);
    } catch (err) {
      console.error("Resume parsing error:", err);
      alert("Failed to parse resume text. Please copy and paste the text manually, or upload a plain TXT/PDF/DOCX file.");
    } finally {
      setIsParsingPdf(false);
    }
  };

  // Load previously saved CV and self pitch (stored in JD field)
  const loadPreviouslySavedProfile = async () => {
    if (!candidateId) {
      alert("Candidate session not active. Please log in or refresh the page.");
      return;
    }
    setIsLoadingPrevious(true);
    try {
      const response = await fetch(getApiUrl(`/api/v1/interview/latest-cv/${candidateId}`));
      if (response.ok) {
        const data = await response.json();
        if (data.cv_text) {
          setCvText(data.cv_text);
          if (data.job_description) {
            setSelfPitch(data.job_description);
          }
          setFileName("Loaded from previous session");
          setCoachingInsight("Loaded your previously saved CV and self pitch context.");
        } else {
          alert("No previously saved CV or pitch found. Please upload or write it manually.");
        }
      } else {
        throw new Error("Failed to fetch latest CV/JD");
      }
    } catch (err) {
      console.error("Error loading previously saved CV", err);
      alert("Error loading previously saved CV. Please upload or write it manually.");
    } finally {
      setIsLoadingPrevious(false);
    }
  };

  // Start the Neuro AI Prep Interview
  const startPrepSession = async () => {
    setChatMessages([]);
    setFeedbackReport(null);

    // 1. Question Bank Selection logic with state persistence
    let unasked: string[] = [];
    try {
      const stored = localStorage.getItem("neuroai_unasked_questions");
      if (stored) {
        unasked = JSON.parse(stored);
      }
    } catch (e) {
      console.error("Failed to parse unasked questions state:", e);
    }
    
    // Clean and validate unasked list
    unasked = unasked.filter(q => ALL_QUESTION_BANK.includes(q));

    if (unasked.length === 0) {
      unasked = [...ALL_QUESTION_BANK];
    }

    let selected: string[] = [];
    let shuffled = [...unasked].sort(() => 0.5 - Math.random());
    
    if (shuffled.length >= 4) {
      selected = shuffled.slice(0, 4);
      const remaining = shuffled.slice(4);
      localStorage.setItem("neuroai_unasked_questions", JSON.stringify(remaining));
    } else {
      selected = [...shuffled];
      const restCount = 4 - selected.length;
      const resetPool = ALL_QUESTION_BANK.filter(q => !selected.includes(q));
      let shuffledReset = [...resetPool].sort(() => 0.5 - Math.random());
      const extra = shuffledReset.slice(0, restCount);
      selected = [...selected, ...extra];
      const remaining = shuffledReset.slice(restCount);
      localStorage.setItem("neuroai_unasked_questions", JSON.stringify(remaining));
    }

    setSelectedBankQuestions(selected);

    const id = typeof crypto !== "undefined" && crypto.randomUUID
      ? crypto.randomUUID()
      : `neuro-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;

    setSessionId(id);

    const matchCount = history.filter(item =>
      item.interview_mode === `NeuroAI Prep: ${selectedTrack}`
    ).length;
    setAttemptCount(matchCount + 1);

    try {
      await fetch(getApiUrl("/api/v1/interview/context"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          interview_id: id,
          cv_text: cvText || "",
          job_description: selfPitch || "",
          interview_mode: `NeuroAI Prep: ${selectedTrack}`,
          interviewer_persona: selectedPersona,
          difficulty_level: "Mid",
          candidate_id: candidateId
        })
      });
    } catch (err) {
      console.warn("Could not save context to backend", err);
    }

    setIsConfigured(true);
    setIsFinished(false);
    setIsVoiceMode(true); // Always start in Live Voice Mode!
  };

  // Get Practice Feedback
  const getPracticeFeedback = async () => {
    const userMsgs = chatMessages.filter(m => m.role === "user");
    if (userMsgs.length === 0) {
      alert("Cannot generate feedback: No candidate responses found in the practice session.");
      return;
    }

    setIsGeneratingFeedback(true);

    try {
      const response = await fetch(getApiUrl("/api/v1/interview/neuroai/feedback"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          interview_id: sessionId,
          candidate_id: candidateId,
          messages: chatMessages.map(m => ({ role: m.role, content: m.content })),
          persona: selectedPersona,
          track: selectedTrack,
          cv_text: cvText || undefined,
          self_pitch: selfPitch || undefined
        })
      });

      if (response.ok) {
        const data = await response.json();
        setFeedbackReport(data);
        setIsFinished(true);
        fetchUserData();
      } else {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.detail || "Feedback failure");
      }
    } catch (err: any) {
      console.error("Feedback calculation failure", err);
      alert(`Failed to generate feedback: ${err.message || "Please check your network or server configuration."}`);
    } finally {
      setIsGeneratingFeedback(false);
    }
  };

  // Clean exit back to config dashboard
  const exitInterview = () => {
    setIsConfigured(false);
    setIsFinished(false);
    setChatMessages([]);
    setFeedbackReport(null);
  };

  const triggerBackgroundFeedbackSave = () => {
    const userMsgs = chatMessages.filter(m => m.role === "user");
    if (isConfigured && !isFinished && sessionId && userMsgs.length > 0) {
      fetch(getApiUrl("/api/v1/interview/neuroai/feedback"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          interview_id: sessionId,
          candidate_id: candidateId,
          messages: chatMessages.map(m => ({ role: m.role, content: m.content })),
          persona: selectedPersona,
          track: selectedTrack,
          cv_text: cvText || undefined,
          self_pitch: selfPitch || undefined
        }),
        keepalive: true
      }).catch(err => console.error("Error in keepalive feedback background save:", err));
    }
  };

  useEffect(() => {
    const handleUnload = () => {
      triggerBackgroundFeedbackSave();
    };
    window.addEventListener("beforeunload", handleUnload);
    return () => {
      window.removeEventListener("beforeunload", handleUnload);
    };
  }, [isConfigured, isFinished, sessionId, chatMessages, candidateId, selectedPersona, selectedTrack, cvText, selfPitch]);

  // Read report modal
  const openReportModal = (reportItem: any) => {
    try {
      const parsed = JSON.parse(reportItem.detailed_feedback);
      setSelectedReport({
        ...reportItem,
        parsed_feedback: parsed
      });
    } catch (e) {
      setSelectedReport({
        ...reportItem,
        parsed_feedback: {
          what_went_well: ["Reflected clearly on previous projects", "Good engagement"],
          areas_for_improvement: ["Keep working on structured STAR syntax"],
          suggested_improvements: [],
          detailed_feedback: reportItem.detailed_feedback
        }
      });
    }
  };

  if (loading) {
    return <LoadingScreen message="Loading Neuro AI Environment..." />;
  }

  return (
    <div className="h-screen max-h-screen bg-transparent text-[#2C3454] overflow-hidden relative flex flex-col md:flex-row">
      {/* Background grids */}
      <div className="absolute inset-0 bg-futuristic-grid opacity-[0.15] pointer-events-none"></div>

      {/* Main Panel */}
      <div className="flex-1 flex flex-col h-full overflow-hidden relative z-10 px-4 md:px-8 py-6">

        {/* Navigation Breadcrumb */}
        <div className="mb-4 flex items-center justify-between">
          <Link
            href="/"
            onClick={triggerBackgroundFeedbackSave}
            className="inline-flex items-center gap-2 px-4 py-2 text-xs font-bold text-[#5C6485] hover:text-[#150E56] bg-white border border-[#150E56]/10 hover:border-[#150E56]/20 rounded-full shadow-clayBtn hover:shadow-clayBtnHover transition duration-300"
          >
            <ArrowLeft className="h-3.5 w-3.5" /> Back to Dashboard
          </Link>
        </div>

        {/* ==================== SCREEN A: CONFIGURATION / SETTINGS ==================== */}
        {!isConfigured && (
          <div className="flex-1 overflow-y-auto pr-2 space-y-8 pb-12">
            <div>
              <p className="text-xs uppercase tracking-[0.35em] text-[#00917C] font-black">JoBro Prep Suite</p>
              <h1 className="mt-2 text-3xl md:text-5xl font-extrabold tracking-tight text-[#150E56]">
                Neuro AI Interview Preparation
              </h1>
              <p className="mt-3 max-w-3xl text-sm md:text-base text-[#5C6485] leading-relaxed">
                Sit down with Geethanjali and Panchali to practice your Neuro AI internship interview. Practice structured topics, explore pathways, or upload your resume for a custom dialogue session.
              </p>
            </div>

            {/* Load Previous Profile Banner */}
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              className="p-5 rounded-2xl bg-white/70 border border-[#00917C]/20 backdrop-blur-md flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 shadow-clay"
            >
              <div>
                <h4 className="text-sm font-bold text-[#150E56] flex items-center gap-1.5">
                  <Sparkles className="h-4 w-4 text-[#00917C] animate-pulse" />
                  Speed up configuration
                </h4>
                <p className="text-xs text-[#5C6485] mt-1">
                  Instantly populate your CV and self pitch from your latest practice session.
                </p>
              </div>
              <button
                type="button"
                onClick={loadPreviouslySavedProfile}
                disabled={isLoadingPrevious || !candidateId}
                className="inline-flex items-center justify-center gap-2 px-5 py-2.5 text-xs font-bold text-[#00917C] hover:text-[#007a68] bg-white border border-[#00917C]/30 hover:border-[#00917C] rounded-xl shadow-clayBtn hover:shadow-clayBtnHover transition duration-300 transform active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer whitespace-nowrap"
              >
                {isLoadingPrevious ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    Loading Context...
                  </>
                ) : (
                  <>
                    <RefreshCw className="h-3.5 w-3.5" />
                    Load CV & Self Pitch
                  </>
                )}
              </button>
            </motion.div>

            <div className="grid gap-6 lg:grid-cols-2">

              {/* Persona and Track Selection */}
              <div className="space-y-6">

                {/* Persona choice */}
                <div className="space-y-3">
                  <label className="text-xs uppercase tracking-wider text-[#5C6485] font-bold flex items-center gap-1.5">
                    <UserCheck className="h-4 w-4 text-[#00917C]" /> Choose Interview Persona
                  </label>
                  <div className="grid gap-4 sm:grid-cols-2">

                    {/* Geethanjali Card */}
                    <button
                      onClick={() => setSelectedPersona("Geethanjali")}
                      className={`relative flex flex-col text-left p-5 rounded-2xl border transition duration-300 overflow-hidden ${selectedPersona === "Geethanjali"
                        ? "bg-white border-[#00917C]/40 shadow-clay"
                        : "bg-white/40 border-[#150E56]/5 hover:border-[#150E56]/15 hover:bg-[#FFF6F0]/40"
                        }`}
                    >
                      {selectedPersona === "Geethanjali" && (
                        <div className="absolute top-0 right-0 w-24 h-24 bg-[#00917C]/5 blur-xl rounded-full"></div>
                      )}
                      <span className="text-lg font-bold text-[#150E56] flex items-center gap-1.5">
                        Geethanjali <span className="text-xs px-2 py-0.5 rounded-full bg-[#00917C]/10 border border-[#00917C]/20 text-[#00917C] font-semibold">Facilitator</span>
                      </span>
                      <p className="mt-2 text-xs text-[#5C6485] leading-relaxed">
                        Warm, encouraging, and patient. Conducts a supportive dialogue, asks structured questions, does not score.
                      </p>
                      <p className="mt-3 text-[10px] text-[#5C6485] italic">
                        "How did you come across this program?"
                      </p>
                    </button>

                    {/* Panchali Card */}
                    <button
                      onClick={() => setSelectedPersona("Panchali")}
                      className={`relative flex flex-col text-left p-5 rounded-2xl border transition duration-300 overflow-hidden ${selectedPersona === "Panchali"
                        ? "bg-white border-purple-400 shadow-clay"
                        : "bg-white/40 border-[#150E56]/5 hover:border-[#150E56]/15 hover:bg-[#FFF6F0]/40"
                        }`}
                    >
                      {selectedPersona === "Panchali" && (
                        <div className="absolute top-0 right-0 w-24 h-24 bg-purple-500/5 blur-xl rounded-full"></div>
                      )}
                      <span className="text-lg font-bold text-[#150E56] flex items-center gap-1.5">
                        Panchali <span className="text-xs px-2 py-0.5 rounded-full bg-purple-50 border border-purple-200 text-purple-700 font-semibold">Career Mentor</span>
                      </span>
                      <p className="mt-2 text-xs text-[#5C6485] leading-relaxed">
                        Explores interests, internship fit, and strengths. Helps you think through annotation vs marketing decisions.
                      </p>
                      <p className="mt-3 text-[10px] text-[#5C6485] italic">
                        "Would you prefer annotation or marketing?"
                      </p>
                    </button>

                  </div>
                </div>



                {/* Upload Resume */}
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="space-y-3 p-5 rounded-2xl bg-white/70 border border-[#150E56]/10 shadow-clay"
                >
                  <label className="text-xs uppercase tracking-wider text-[#5C6485] font-bold block">
                    Upload Resume / CV (.pdf, .txt, .docx supported) <span className="text-red-500">*</span>
                  </label>
                  <input
                    id="resume-input"
                    type="file"
                    accept=".pdf,.txt,.docx"
                    className="hidden"
                    onChange={handleFileUpload}
                  />
                  <div
                    onClick={() => document.getElementById("resume-input")?.click()}
                    className="border border-dashed border-[#150E56]/15 hover:border-[#00917C]/40 bg-[#FFF6F0]/40 rounded-xl p-5 text-center cursor-pointer transition duration-300"
                  >
                    {isParsingPdf ? (
                      <div className="flex items-center justify-center gap-2 text-sm text-[#00917C] font-bold animate-pulse">
                        <Loader2 className="h-4 w-4 animate-spin" /> Parsing Resume...
                      </div>
                    ) : fileName ? (
                      <span className="text-sm font-semibold text-[#150E56]">📄 {fileName}</span>
                    ) : (
                      <span className="text-xs text-[#5C6485]">
                        Drag and drop or <strong className="text-[#00917C]">Browse</strong>
                      </span>
                    )}
                  </div>
                </motion.div>

                {/* Self Pitch Panel */}
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="space-y-3 p-5 rounded-2xl bg-white/70 border border-[#150E56]/10 shadow-clay"
                >
                  <div className="flex items-center justify-between">
                    <label className="text-xs uppercase tracking-wider text-[#5C6485] font-bold block">
                      Self Pitch / Introduction <span className="text-red-500">*</span>
                    </label>
                    <button
                      type="button"
                      onClick={togglePitchDictation}
                      className={`inline-flex items-center gap-1 px-2.5 py-1 text-[10px] font-bold rounded-full border transition duration-200 ${isDictatingPitch
                        ? "bg-red-50 border-red-200 text-red-600 animate-pulse"
                        : "bg-[#00917C]/10 border border-[#00917C]/20 text-[#00917C] hover:bg-[#00917C]/20 shadow-clayBtn"
                        }`}
                    >
                      <Mic className="h-3 w-3" /> {isDictatingPitch ? "Stop Dictation" : "Dictate Pitch"}
                    </button>
                  </div>
                  <textarea
                    value={selfPitch}
                    onChange={(e) => setSelfPitch(e.target.value)}
                    placeholder="Introduce yourself, your journey, and why you are excited about this Neuro AI program..."
                    className="w-full h-24 bg-[#FFF6F0]/40 border border-[#150E56]/10 focus:border-[#00917C] focus:ring-1 focus:ring-[#00917C] rounded-xl p-3 text-xs text-[#150E56] placeholder-[#5C6485]/50 outline-none resize-none transition duration-200"
                  />
                </motion.div>

                <button
                  onClick={startPrepSession}
                  disabled={!cvText || !selfPitch.trim()}
                  className="w-full inline-flex items-center justify-center gap-2 py-4 rounded-xl font-bold bg-[#00917C] hover:bg-[#007a68] text-white disabled:opacity-50 disabled:cursor-not-allowed shadow-clayBtn hover:shadow-clayBtnHover transition duration-300 transform active:scale-[0.98]"
                >
                  <Play className="h-4.5 w-4.5 fill-white" /> Start Practice with {selectedPersona}
                </button>

              </div>

              {/* History Timeline */}
              <div className="rounded-2xl border border-white bg-white/70 backdrop-blur-md shadow-clay p-6 flex flex-col h-[580px] overflow-hidden">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="font-bold text-[#150E56] text-lg flex items-center gap-2">
                    <ClipboardList className="h-5 w-5 text-[#00917C]" /> Practice History
                  </h3>
                  <span className="text-xs font-bold px-2.5 py-0.5 rounded-full bg-[#150E56]/10 text-[#150E56]">
                    {history.length} Sessions
                  </span>
                </div>

                {history.length === 0 ? (
                  <div className="flex-1 flex flex-col items-center justify-center text-center text-[#5C6485]">
                    <Activity className="h-10 w-10 text-[#5C6485]/50 mb-2" />
                    <p className="text-sm font-semibold">No practice history available yet.</p>
                    <p className="text-xs text-[#5C6485]/70 mt-1">Your saved Neuro AI mock attempts will be stored here.</p>
                  </div>
                ) : (
                  <div className="flex-1 overflow-y-auto pr-1 space-y-3" style={{ scrollbarWidth: 'none' }}>
                    {history.map((session, index) => {
                      const trackName = session.interview_mode.replace("NeuroAI Prep: ", "");

                      const trackSessions = history
                        .filter(h => h.interview_mode === session.interview_mode)
                        .reverse();
                      const chronologicalIndex = trackSessions.findIndex(h => h.id === session.id);
                      const attemptNum = chronologicalIndex !== -1 ? chronologicalIndex + 1 : 1;

                      return (
                        <div key={session.id} className="p-4 rounded-xl bg-[#FFF6F0]/40 border border-[#150E56]/5 hover:border-[#00917C]/20 hover:bg-[#FFF6F0]/65 transition duration-200 flex items-center justify-between shadow-clayBtn">
                          <div>
                            <span className="text-xs uppercase tracking-wider text-[#5C6485] block">
                              {new Date(session.created_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
                            </span>
                            <span className="text-sm font-semibold text-[#150E56] mt-1 block">
                              {trackName}
                            </span>
                            <span className="text-xs text-[#5C6485] mt-1 flex items-center gap-1.5">
                              <span>Persona: <strong>{session.interviewer_persona}</strong></span>
                              <span>•</span>
                              <span>Attempt: <strong>{attemptNum}</strong></span>
                            </span>
                          </div>
                          <button
                            onClick={() => openReportModal(session)}
                            className="px-3 py-1.5 text-xs font-bold text-[#00917C] bg-white border border-[#00917C]/20 hover:bg-[#00917C]/5 rounded-lg shadow-clayBtn hover:shadow-clayBtnHover transition"
                          >
                            View Report
                          </button>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

            </div>
          </div>
        )}

        {/* ==================== SCREEN B: INTERACTIVE INTERVIEW WORKSPACE ==================== */}
        {isConfigured && !isFinished && (
          <div className="flex-1 flex flex-col overflow-hidden relative">

            {/* Inline Live Voice Workspace Header and Controls */}
            <VoiceWorkspace
              interviewId={sessionId}
              candidateId={candidateId}
              systemPrompt={systemPrompt}
              selectedVoice={selectedVoiceName}
              onVoiceChange={setSelectedVoiceName}
              onClose={exitInterview}
              onNewTranscript={(role, content) => {
                const now = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                setChatMessages(prev => [
                  ...prev,
                  { role, content, time: now }
                ]);
              }}
              onNewOptions={setSuggestedOptions}
              onInitRef={(ref) => {
                voiceRef.current = ref;
              }}
              speechSpeed={speechSpeed}
              onSpeedChange={setSpeechSpeed}
              hideVoiceControls={true}
            />

            {/* Chat Messages Log */}
            <div className="flex-1 overflow-y-auto px-1 space-y-4 mb-4" style={{ scrollbarWidth: 'none' }}>
              {chatMessages.map((msg, index) => {
                const isAssistant = msg.role === "assistant";
                const displayContent = msg.content.replace(/^\[[^\]]+\]:\s*/, "");

                return (
                  <div key={index} className={`flex ${isAssistant ? "justify-start" : "justify-end"} items-end gap-2`}>
                    {isAssistant && (
                      <div className="h-7 w-7 rounded-full bg-white border border-[#00917C]/20 flex items-center justify-center text-xs font-bold text-[#00917C] flex-shrink-0 shadow-clayBtn">
                        {selectedPersona.charAt(0)}
                      </div>
                    )}
                    <div className={`max-w-[85%] sm:max-w-[70%] p-4 rounded-2xl text-sm leading-relaxed ${isAssistant
                      ? "bg-[#FFF6F0]/65 border border-[#150E56]/5 text-[#2C3454] rounded-bl-none shadow-clayBtn"
                      : "bg-[#00917C] text-white font-bold rounded-br-none shadow-md shadow-[#00917C]/15"
                      }`}>
                      <p>{displayContent}</p>
                      <span className={`text-[10px] block mt-1.5 ${isAssistant ? "text-[#5C6485]/80" : "text-white/80"}`}>
                        {msg.time}
                      </span>
                    </div>
                  </div>
                );
              })}
              <div ref={chatEndRef} />
            </div>

            {/* Suggested Answers Options - Hidden per requirements */}
            {/* {suggestedOptions.length > 0 && (
              <div className="p-3 bg-white/80 border border-[#150E56]/10 rounded-2xl mb-4 flex-shrink-0 shadow-clay">
                <span className="text-[10px] uppercase tracking-wider text-[#5C6485] font-bold block mb-2">
                  💡 Suggested responses based on track context:
                </span>
                <div className="flex flex-col gap-2">
                  {suggestedOptions.map((opt, idx) => (
                    <button
                      key={idx}
                      onClick={() => {
                        if (voiceRef.current) {
                          voiceRef.current.sendTextOption(opt);
                        }
                      }}
                      className="w-full text-left p-3 text-xs bg-[#FFF6F0]/40 hover:bg-[#FFF6F0]/80 border border-[#150E56]/5 hover:border-[#00917C]/30 text-[#2C3454] rounded-xl shadow-clayBtn hover:shadow-clayBtnHover transition duration-200"
                    >
                      {opt}
                    </button>
                  ))}
                </div>
              </div>
            )} */}

            {/* Input and Inclusive Controls Panel */}
            <div className="p-4 bg-white/70 backdrop-blur border border-white rounded-2xl flex-shrink-0 space-y-4 shadow-clay">

              {/* Inclusive buttons (rephrase, example, need more time, skip) */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {[
                  { id: "rephrase", label: "Rephrase", tooltip: "Reword the question" },
                  { id: "give_example", label: "Give Example", tooltip: "Show sample response" },
                  { id: "need_more_time", label: "Need More Time", tooltip: "Patient wait" },
                  { id: "skip", label: "Skip", tooltip: "Next question" }
                ].map((act) => (
                  <button
                    key={act.id}
                    onClick={() => {
                      if (voiceRef.current) {
                        voiceRef.current.sendInclusiveAction(act.id as any);
                      }
                    }}
                    className="py-2.5 px-3 text-xs font-semibold rounded-xl border border-[#150E56]/10 hover:border-[#00917C]/30 bg-white hover:bg-[#FFF6F0] text-[#00917C] hover:text-[#150E56] shadow-clayBtn hover:shadow-clayBtnHover transition duration-200 flex items-center justify-center gap-1.5"
                  >
                    <span>{act.label}</span>
                  </button>
                ))}
              </div>

              {/* Chat Text Input bar */}
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  if (!chatInput.trim()) return;
                  if (voiceRef.current) {
                    voiceRef.current.sendTextOption(chatInput.trim());
                    setChatInput("");
                  }
                }}
                className="flex gap-2 relative"
              >
                <div className="relative flex-1">
                  <input
                    type="text"
                    value={chatInput}
                    onChange={(e) => setChatInput(e.target.value)}
                    placeholder="Type or speak your response..."
                    className="w-full bg-[#FFF6F0]/40 border border-[#150E56]/10 focus:border-[#00917C] focus:ring-1 focus:ring-[#00917C] focus:outline-none rounded-xl py-3.5 px-4 text-sm text-[#150E56] placeholder-[#5C6485]/50 transition duration-300"
                  />
                </div>

                <button
                  type="submit"
                  disabled={!chatInput.trim()}
                  className="bg-[#00917C] hover:bg-[#007a68] text-white disabled:bg-gray-200 disabled:text-gray-400 rounded-xl px-5 flex items-center justify-center font-bold shadow-clayBtn hover:shadow-clayBtnHover transition duration-200"
                >
                  <Send className="h-4.5 w-4.5" />
                </button>
              </form>

              {/* End session trigger */}
              <div className="flex justify-between items-center text-xs text-[#5C6485]">
                <span>Speak or type your answer and click send.</span>
                <button
                  type="button"
                  onClick={getPracticeFeedback}
                  disabled={chatMessages.length < 3 || isGeneratingFeedback}
                  className="text-[#00917C] hover:text-[#007a68] font-bold flex items-center gap-1 transition disabled:opacity-40"
                >
                  {isGeneratingFeedback ? (
                    <>
                      <Loader2 className="h-3 w-3 animate-spin" /> Compiling Feedback...
                    </>
                  ) : (
                    <>
                      End Practice & Get Feedback <ArrowUpRight className="h-3.5 w-3.5" />
                    </>
                  )}
                </button>
              </div>

            </div>

          </div>
        )}

        {/* ==================== SCREEN C: PRACTICE FEEDBACK SCREEN ==================== */}
        {isConfigured && isFinished && feedbackReport && (
          <div className="flex-1 overflow-y-auto pr-2 space-y-6 pb-12" style={{ scrollbarWidth: 'none' }}>
            <div>
              <p className="text-xs uppercase tracking-[0.35em] text-[#00917C] font-black">Feedback Hub</p>
              <h2 className="mt-2 text-2xl md:text-4xl font-extrabold text-[#150E56]">
                Practice Session Assessment
              </h2>
              <p className="text-[#5C6485] text-sm mt-1">
                Completed with {selectedPersona} on track: {selectedTrack} (Attempt {attemptCount})
              </p>
            </div>

            {/* Rubric Score Cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 my-6">
              <div className="p-5 rounded-2xl bg-emerald-50 border border-emerald-100 shadow-clayBtn flex flex-col justify-between">
                <div>
                  <span className="text-xs text-emerald-700 font-bold uppercase tracking-wider block">Comprehension</span>
                  <div className="flex items-baseline gap-1 mt-2">
                    <strong className="text-3xl font-black text-slate-800">{feedbackReport.comprehension_score || 0}</strong>
                    <span className="text-slate-400 text-xs font-bold">/ 5</span>
                  </div>
                </div>
                <p className="text-xs text-slate-600 mt-3 italic leading-relaxed">
                  {feedbackReport.comprehension_feedback || "Evaluation on how well you understood and answered the prompts."}
                </p>
              </div>

              <div className="p-5 rounded-2xl bg-blue-50 border border-blue-100 shadow-clayBtn flex flex-col justify-between">
                <div>
                  <span className="text-xs text-blue-700 font-bold uppercase tracking-wider block">Communication</span>
                  <div className="flex items-baseline gap-1 mt-2">
                    <strong className="text-3xl font-black text-slate-800">{feedbackReport.communication_score || 0}</strong>
                    <span className="text-slate-400 text-xs font-bold">/ 5</span>
                  </div>
                </div>
                <p className="text-xs text-slate-600 mt-3 italic leading-relaxed">
                  {feedbackReport.communication_feedback || "Evaluation of your pacing, clarity, and willingness to share."}
                </p>
              </div>

              <div className="p-5 rounded-2xl bg-purple-50 border border-purple-100 shadow-clayBtn flex flex-col justify-between">
                <div>
                  <span className="text-xs text-purple-700 font-bold uppercase tracking-wider block">Internship Readiness</span>
                  <div className="flex items-baseline gap-1 mt-2">
                    <strong className="text-3xl font-black text-slate-800">{feedbackReport.readiness_score || 0}</strong>
                    <span className="text-slate-400 text-xs font-bold">/ 5</span>
                  </div>
                </div>
                <p className="text-xs text-slate-600 mt-3 italic leading-relaxed">
                  {feedbackReport.readiness_feedback || "Evaluation of your scheduling preferences and pathway interests."}
                </p>
              </div>
            </div>

            {/* Custom Tabs */}
            <div className="border-b border-[#150E56]/10 flex gap-4">
              {[
                { id: "www", label: "What Went Well" },
                { id: "ati", label: "Areas to Improve" },
                { id: "sai", label: "Suggested Improvements" }
              ].map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setFeedbackTab(tab.id as any)}
                  className={`pb-3 text-sm font-semibold border-b-2 transition duration-200 ${feedbackTab === tab.id
                    ? "border-[#00917C] text-[#00917C] font-bold"
                    : "border-transparent text-[#5C6485] hover:text-[#150E56]"
                    }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {/* Tab Body */}
            <div className="p-6 rounded-2xl border border-[#150E56]/10 bg-white/70 shadow-clay">

              {/* Tab 1: What Went Well */}
              {feedbackTab === "www" && (
                <div className="space-y-3">
                  <p className="text-sm text-[#5C6485] font-medium italic mb-2">Here is what you did exceptionally well in your answers:</p>
                  <ul className="space-y-2.5">
                    {feedbackReport.what_went_well?.map((item: string, idx: number) => (
                      <li key={idx} className="flex gap-2.5 items-start text-[#2C3454] text-sm">
                        <CheckCircle2 className="h-4.5 w-4.5 text-emerald-600 flex-shrink-0 mt-0.5" />
                        <span>{item}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Tab 2: Areas to Improve */}
              {feedbackTab === "ati" && (
                <div className="space-y-3">
                  <p className="text-sm text-[#5C6485] font-medium italic mb-2">Focus on these suggestions for your next mock attempt:</p>
                  <ul className="space-y-2.5">
                    {feedbackReport.areas_for_improvement?.map((item: string, idx: number) => (
                      <li key={idx} className="flex gap-2.5 items-start text-[#2C3454] text-sm">
                        <span className="h-4.5 w-4.5 text-[#00917C] font-bold text-xs bg-[#00917C]/10 border border-[#00917C]/20 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5">
                          !
                        </span>
                        <span>{item}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Tab 3: Suggested improvements */}
              {feedbackTab === "sai" && (
                <div className="space-y-6">
                  <p className="text-sm text-[#5C6485] font-medium italic">Suggested wording adjustments to strengthen your brief answers:</p>
                  {feedbackReport.suggested_improvements?.length === 0 ? (
                    <p className="text-xs text-slate-500 italic">No specific rewrites suggested. All answers were comprehensive.</p>
                  ) : (
                    feedbackReport.suggested_improvements?.map((item: any, idx: number) => (
                      <div key={idx} className="p-4 rounded-xl bg-[#FFF6F0]/40 border border-[#150E56]/5 space-y-3 shadow-clayBtn">
                        <p className="text-xs text-[#5C6485] uppercase font-semibold">Question: {item.question}</p>

                        <div className="space-y-1">
                          <p className="text-xs text-[#00917C] font-bold">What You Did Well:</p>
                          <ul className="list-disc pl-4 text-sm text-[#2C3454]">
                            {item.what_you_did_well?.map((point: string, i: number) => <li key={i}>{point}</li>)}
                          </ul>
                        </div>

                        {item.missing_information && item.missing_information.length > 0 && (
                          <div className="space-y-1">
                            <p className="text-xs text-amber-600 font-bold">Consider Adding:</p>
                            <ul className="list-disc pl-4 text-sm text-[#2C3454]">
                              {item.missing_information?.map((point: string, i: number) => <li key={i}>{point}</li>)}
                            </ul>
                          </div>
                        )}

                        {item.minor_language_suggestions && (
                          <div className="pt-2 border-t border-[#150E56]/5">
                            <p className="text-xs text-[#150E56] font-bold">Grammar Suggestion:</p>
                            <p className="text-sm text-[#2C3454] italic">{item.minor_language_suggestions}</p>
                          </div>
                        )}

                        <div className="pt-2 border-t border-[#150E56]/5">
                          <p className="text-xs text-[#150E56] font-bold">Pacing:</p>
                          <p className="text-sm text-[#2C3454]">{item.time_feedback}</p>
                        </div>

                        {item.example_good_responses && item.example_good_responses.length > 0 && (
                          <div className="pt-3 border-t border-[#150E56]/10 space-y-2">
                            <p className="text-xs text-[#00917C] font-bold uppercase tracking-wider">💡 Authentic Example Responses:</p>
                            <div className="flex flex-col gap-2">
                              {item.example_good_responses.map((ex: string, i: number) => (
                                <div key={i} className="p-2.5 bg-white border border-[#150E56]/5 rounded-lg text-sm text-[#150E56] font-medium shadow-sm">
                                  "{ex}"
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    ))
                  )}
                </div>
              )}

            </div>

            {/* Markdown feedback report */}
            <div className="p-6 rounded-2xl border border-white bg-white/70 shadow-clay space-y-4">
              <h3 className="font-bold text-[#150E56] text-lg">Detailed Practice Summary</h3>
              <div
                className="max-w-none text-[#2C3454] text-sm leading-relaxed space-y-3"
                dangerouslySetInnerHTML={{ __html: formatFeedbackMarkdown(feedbackReport.detailed_feedback || "") }}
              />
            </div>

            {/* Control buttons */}
            <div className="flex gap-4">
              <button
                onClick={startPrepSession}
                className="inline-flex items-center justify-center gap-2 py-3.5 px-6 font-bold bg-[#00917C] hover:bg-[#007a68] text-white rounded-xl shadow-clayBtn hover:shadow-clayBtnHover transition duration-200"
              >
                <RefreshCw className="h-4 w-4" /> Retry Track (Attempt {attemptCount + 1})
              </button>
              <button
                onClick={exitInterview}
                className="inline-flex items-center justify-center gap-2 py-3.5 px-6 font-semibold bg-white border border-[#150E56]/10 hover:bg-[#FFF6F0] text-[#5C6485] hover:text-[#150E56] rounded-xl shadow-clayBtn hover:shadow-clayBtnHover transition duration-200"
              >
                Back to Dashboard
              </button>
            </div>

          </div>
        )}

      </div>

      {/* DETAILED REPORT DRAWER/MODAL FOR HISTORICAL RUNS */}
      <AnimatePresence>
        {selectedReport && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#150E56]/15 backdrop-blur-md"
          >
            <motion.div
              initial={{ scale: 0.95, y: 15 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.95, y: 15 }}
              className="relative w-full max-w-4xl h-[85vh] rounded-[2rem] border border-white bg-white/95 shadow-clay p-6 md:p-8 flex flex-col overflow-hidden"
            >
              {/* Close Button */}
              <button
                onClick={() => setSelectedReport(null)}
                className="absolute top-6 right-6 h-10 w-10 inline-flex items-center justify-center rounded-2xl border border-[#150E56]/10 bg-white text-[#5C6485] hover:text-[#150E56] hover:border-[#150E56]/20 shadow-clayBtn hover:shadow-clayBtnHover transition"
              >
                <X className="h-5 w-5" />
              </button>

              {/* Modal Header */}
              <div className="pb-6 border-b border-[#150E56]/10 flex-shrink-0">
                <span className="rounded-full bg-[#00917C]/10 px-3 py-1 text-[10px] font-bold text-[#00917C] uppercase tracking-widest border border-[#00917C]/20">
                  Historical Practice Card
                </span>
                <h2 className="text-2xl font-extrabold text-[#150E56] mt-3">{selectedReport.interview_mode.replace("NeuroAI Prep: ", "")}</h2>
                <p className="text-xs text-[#5C6485] mt-1">
                  Conducted with Geethanjali on {new Date(selectedReport.created_at).toLocaleString()}
                </p>
              </div>

              {/* Modal Body */}
              <div className="flex-1 overflow-y-auto pr-2 py-6 space-y-6" style={{ scrollbarWidth: 'none' }}>

                {/* Rubric Score Cards */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 my-2">
                  <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-100 shadow-sm flex flex-col justify-between">
                    <div>
                      <span className="text-[10px] text-emerald-700 font-bold uppercase tracking-wider block">Comprehension</span>
                      <div className="flex items-baseline gap-0.5 mt-1">
                        <strong className="text-2xl font-black text-slate-800">{selectedReport.parsed_feedback.comprehension_score || 0}</strong>
                        <span className="text-slate-400 text-[10px] font-bold">/ 5</span>
                      </div>
                    </div>
                    <p className="text-[10px] text-slate-600 mt-2 italic leading-relaxed">
                      {selectedReport.parsed_feedback.comprehension_feedback || "Comprehension rating."}
                    </p>
                  </div>

                  <div className="p-4 rounded-xl bg-blue-50 border border-blue-100 shadow-sm flex flex-col justify-between">
                    <div>
                      <span className="text-[10px] text-blue-700 font-bold uppercase tracking-wider block">Communication</span>
                      <div className="flex items-baseline gap-0.5 mt-1">
                        <strong className="text-2xl font-black text-slate-800">{selectedReport.parsed_feedback.communication_score || 0}</strong>
                        <span className="text-slate-400 text-[10px] font-bold">/ 5</span>
                      </div>
                    </div>
                    <p className="text-[10px] text-slate-600 mt-2 italic leading-relaxed">
                      {selectedReport.parsed_feedback.communication_feedback || "Communication rating."}
                    </p>
                  </div>

                  <div className="p-4 rounded-xl bg-purple-50 border border-purple-100 shadow-sm flex flex-col justify-between">
                    <div>
                      <span className="text-[10px] text-purple-700 font-bold uppercase tracking-wider block">Internship Readiness</span>
                      <div className="flex items-baseline gap-0.5 mt-1">
                        <strong className="text-2xl font-black text-slate-800">{selectedReport.parsed_feedback.readiness_score || 0}</strong>
                        <span className="text-slate-400 text-[10px] font-bold">/ 5</span>
                      </div>
                    </div>
                    <p className="text-[10px] text-slate-600 mt-2 italic leading-relaxed">
                      {selectedReport.parsed_feedback.readiness_feedback || "Internship readiness rating."}
                    </p>
                  </div>
                </div>

                {/* What Went Well */}
                <div className="space-y-2">
                  <h4 className="font-bold text-[#150E56] text-base">⭐ What Went Well</h4>
                  <ul className="space-y-2">
                    {selectedReport.parsed_feedback.what_went_well?.map((item: string, idx: number) => (
                      <li key={idx} className="flex gap-2 items-start text-xs text-[#2C3454]">
                        <CheckCircle2 className="h-4 w-4 text-emerald-600 flex-shrink-0 mt-0.5" />
                        <span>{item}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                {/* Areas for Improvement */}
                <div className="space-y-2">
                  <h4 className="font-bold text-[#150E56] text-base">💡 Areas for Improvement</h4>
                  <ul className="space-y-2">
                    {selectedReport.parsed_feedback.areas_for_improvement?.map((item: string, idx: number) => (
                      <li key={idx} className="flex gap-2 items-start text-xs text-[#2C3454]">
                        <span className="h-4 w-4 text-[#00917C] font-bold text-[10px] bg-[#00917C]/10 border border-[#00917C]/20 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5">
                          !
                        </span>
                        <span>{item}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                {/* Suggested improvements */}
                {selectedReport.parsed_feedback.suggested_improvements?.length > 0 && (
                  <div className="space-y-3">
                    <h4 className="font-bold text-[#150E56] text-base">✏️ Suggested Answer Improvements</h4>
                    {selectedReport.parsed_feedback.suggested_improvements.map((item: any, idx: number) => (
                      <div key={idx} className="p-4 rounded-xl bg-[#FFF6F0]/40 border border-[#150E56]/5 space-y-3 text-xs shadow-clayBtn">
                        <p className="text-xs text-[#5C6485] uppercase font-semibold">Question: {item.question}</p>

                        {item.what_you_did_well && (
                          <div className="space-y-1">
                            <p className="text-[10px] text-[#00917C] font-bold">What You Did Well:</p>
                            <ul className="list-disc pl-4 text-xs text-[#2C3454]">
                              {item.what_you_did_well?.map((point: string, i: number) => <li key={i}>{point}</li>)}
                            </ul>
                          </div>
                        )}

                        {item.missing_information && item.missing_information.length > 0 && (
                          <div className="space-y-1">
                            <p className="text-[10px] text-amber-600 font-bold">Consider Adding:</p>
                            <ul className="list-disc pl-4 text-xs text-[#2C3454]">
                              {item.missing_information?.map((point: string, i: number) => <li key={i}>{point}</li>)}
                            </ul>
                          </div>
                        )}

                        {item.minor_language_suggestions && (
                          <div className="pt-2 border-t border-[#150E56]/5">
                            <p className="text-[10px] text-[#150E56] font-bold">Grammar Suggestion:</p>
                            <p className="text-xs text-[#2C3454] italic">{item.minor_language_suggestions}</p>
                          </div>
                        )}

                        {item.time_feedback && (
                          <div className="pt-2 border-t border-[#150E56]/5">
                            <p className="text-[10px] text-[#150E56] font-bold">Pacing:</p>
                            <p className="text-xs text-[#2C3454]">{item.time_feedback}</p>
                          </div>
                        )}

                        {item.example_good_responses && item.example_good_responses.length > 0 && (
                          <div className="pt-3 border-t border-[#150E56]/10 space-y-2">
                            <p className="text-[10px] text-[#00917C] font-bold uppercase tracking-wider">💡 Authentic Example Responses:</p>
                            <div className="flex flex-col gap-2">
                              {item.example_good_responses.map((ex: string, i: number) => (
                                <div key={i} className="p-2.5 bg-white border border-[#150E56]/5 rounded-lg text-xs text-[#150E56] font-medium shadow-sm">
                                  "{ex}"
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* Backwards compatibility for old runs */}
                        {!item.what_you_did_well && item.suggested_answer && (
                          <p className="text-[#00917C] font-semibold mt-1">Suggested wording: "{item.suggested_answer}"</p>
                        )}
                      </div>
                    ))}
                  </div>
                )}

                {/* Raw feedback text */}
                <div className="pt-4 border-t border-[#150E56]/10">
                  <h4 className="font-bold text-[#150E56] text-base mb-2">Detailed Report Summary</h4>
                  <div
                    className="max-w-none text-[#2C3454] text-xs space-y-2 leading-relaxed"
                    dangerouslySetInnerHTML={{ __html: formatFeedbackMarkdown(selectedReport.parsed_feedback.detailed_feedback || "") }}
                  />
                </div>

              </div>

              {/* Modal Footer */}
              <div className="pt-4 border-t border-[#150E56]/10 flex justify-end flex-shrink-0">
                <button
                  onClick={() => setSelectedReport(null)}
                  className="rounded-xl bg-[#00917C] hover:bg-[#007a68] text-white px-6 py-2 text-xs font-bold shadow-clayBtn hover:shadow-clayBtnHover transition duration-200"
                >
                  Close Feedback Report
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

    </div>
  );
}
