"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import styles from "../InterviewExperience.module.css";
import { supabase } from "../../lib/supabaseClient";
import Link from 'next/link';
import VoiceWorkspace from "./VoiceWorkspace";

const parsePdfText = async (file: File): Promise<string> => {
  if (typeof window === "undefined") return "";

  // 1. Ensure pdfjsLib is loaded from CDN
  if (!(window as any).pdfjsLib) {
    await new Promise<void>((resolve, reject) => {
      const script = document.createElement("script");
      script.src = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.4.120/pdf.min.js";
      script.onload = () => {
        const pdfjsLib = (window as any).pdfjsLib;
        // Configure worker
        pdfjsLib.GlobalWorkerOptions.workerSrc = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.4.120/pdf.worker.min.js";
        resolve();
      };
      script.onerror = () => reject(new Error("Failed to load PDF parser library."));
      document.head.appendChild(script);
    });
  }

  const pdfjsLib = (window as any).pdfjsLib;

  // 2. Read file as array buffer
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

  // 3. Load PDF document
  const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
  const pdf = await loadingTask.promise;

  let fullText = "";
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const textContent = await page.getTextContent();
    const pageText = textContent.items
      .map((item: any) => item.str)
      .join(" ");
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

const questions = [
  "Tell me about a time you led a technical project.",
  "How do you handle unexpected changes during an interview assignment?",
  "Describe a situation when you collaborated with cross-functional stakeholders.",
  "What would you do if a candidate delivered incomplete work under time pressure?",
];

const buildWebSocketUrl = () => {
  if (typeof window === "undefined") return "";
  const protocol = window.location.protocol === "https:" ? "wss" : "ws";
  return `${protocol}://${window.location.host}/api/v1/live`;
};

const getApiUrl = (path: string) => {
  if (typeof window !== "undefined") {
    const hostname = window.location.hostname;
    if (hostname === "localhost" || hostname === "127.0.0.1") {
      return `http://localhost:8000${path}`;
    }
  }
  return path;
};

const selectBestDefaultVoice = (voices: SpeechSynthesisVoice[]): SpeechSynthesisVoice | null => {
  const englishVoices = voices.filter(v => v.lang.toLowerCase().startsWith("en"));
  if (englishVoices.length === 0) return null;

  // Priority order for natural-sounding female voices
  const priorities = [
    "aria",      // Edge online natural (female)
    "jenny",     // Edge online natural (female)
    "sonia",     // Edge online natural (female)
    "google us english", // Chrome high quality (female)
    "samantha",  // Safari/macOS (female)
    "victoria",  // macOS (female)
    "zira",      // Windows offline (female)
    "hazel",     // Windows offline UK (female)
    "susan",     // Windows offline (female)
    "female"     // Any containing female
  ];

  for (const prio of priorities) {
    const match = englishVoices.find(v => v.name.toLowerCase().includes(prio));
    if (match) return match;
  }

  return englishVoices[0];
};

export default function InterviewExperience() {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [candidateId, setCandidateId] = useState<string>("cand-user-999");

  useEffect(() => {
    const fetchSession = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (session?.user?.id) {
          setCandidateId(session.user.id);
        }
      } catch (err) {
        console.warn("Could not retrieve active session", err);
      }
    };
    fetchSession();
  }, []);

  const [mediaStream, setMediaStream] = useState<MediaStream | null>(null);
  const [isStreaming, setIsStreaming] = useState(false);
  const [transcript, setTranscript] = useState<string[]>([]);
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [coachingInsights, setCoachingInsights] = useState<string[]>([
    "Jobro AI insights appear here after you start the interview.",
  ]);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [isLiveConnected, setIsLiveConnected] = useState(false);
  const [wsMessage, setWsMessage] = useState<string>("");
  const socketRef = useRef<WebSocket | null>(null);
  const voiceRef = useRef<{ sendTextOption: (text: string) => void } | null>(null);
  const [isCapturing, setIsCapturing] = useState(false);
  const [audioEnabled, setAudioEnabled] = useState(true);
  const [videoEnabled, setVideoEnabled] = useState(true);
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const [screenStream, setScreenStream] = useState<MediaStream | null>(null);
  const [shareType, setShareType] = useState<"screen" | "window" | "browserTab">("screen");
  const [inputEvents, setInputEvents] = useState<string[]>([]);
  const lastMouseRecord = useRef(0);

  const [activeMode, setActiveMode] = useState<"stream" | "copilot">("copilot");
  const [chatMessages, setChatMessages] = useState<{ role: "user" | "assistant"; content: string; time: string }[]>([
    {
      role: "assistant",
      content: "Hello! I am Jobro AI. I'm excited to learn more about you today. Shall we begin the behavioral and technical assessment?",
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    }
  ]);
  const [chatInput, setChatInput] = useState("");
  const [isCopilotTyping, setIsCopilotTyping] = useState(false);
  const chatEndRef = useRef<HTMLDivElement | null>(null);

  // Unique session ID generated once per interview session
  const [sessionId] = useState(() => {
    if (typeof crypto !== "undefined" && crypto.randomUUID) {
      return crypto.randomUUID();
    }
    // Fallback for environments without crypto.randomUUID
    return `session-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
  });

  // Speech States (TTS and STT)
  const [selectedVoiceName, setSelectedVoiceName] = useState<string>("shimmer");
  const [speechSpeed, setSpeechSpeed] = useState<string>("1.5");
  const [isListening, setIsListening] = useState(false);
  const recognitionRef = useRef<any>(null);

  const toggleSpeechRecognition = () => {
    if (typeof window === "undefined") return;
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      alert("Speech Recognition API is not supported in this browser. Please try Chrome, Edge, or Safari.");
      return;
    }

    if (isListening) {
      if (recognitionRef.current) {
        recognitionRef.current.stop();
      }
      setIsListening(false);
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = "en-US";

    recognition.onstart = () => {
      setIsListening(true);
    };

    recognition.onresult = (event: any) => {
      let resultText = "";
      for (let i = 0; i < event.results.length; i++) {
        resultText += event.results[i][0].transcript;
      }
      setChatInput(resultText);
    };

    recognition.onerror = (event: any) => {
      console.error("Speech recognition error", event.error);
      setIsListening(false);
    };

    recognition.onend = () => {
      setIsListening(false);
    };

    recognitionRef.current = recognition;
    recognition.start();
  };


  // Personalized Setup States
  const [isCopilotInitialized, setIsCopilotInitialized] = useState(false);
  const [cvText, setCvText] = useState("");
  const [jobDescription, setJobDescription] = useState("");
  const [fileName, setFileName] = useState("");
  const [currentOptions, setCurrentOptions] = useState<string[]>([]);
  const [interviewMode, setInterviewMode] = useState("Technical Interview");
  const [interviewerPersona, setInterviewerPersona] = useState("Senior Software Engineer");
  const [difficultyLevel, setDifficultyLevel] = useState("Senior");
  const [yearsOfExperience, setYearsOfExperience] = useState("3 years");
  const [generatedSystemPrompt, setGeneratedSystemPrompt] = useState("");
  const [feedbackTab, setFeedbackTab] = useState<"www" | "ati" | "sai">("www");
  const [whatWentWell, setWhatWentWell] = useState<string[]>([]);
  const [suggestedImprovements, setSuggestedImprovements] = useState<any[]>([]);
  const [isLoadingPrevious, setIsLoadingPrevious] = useState(false);
  const [isParsingPdf, setIsParsingPdf] = useState(false);
  const [isVoiceMode, setIsVoiceMode] = useState(false);
  const [showSidebar, setShowSidebar] = useState(true);
  const [sessionLength, setSessionLength] = useState("5 mins");
  const [timeLeft, setTimeLeft] = useState<number | null>(null);

  const loadPreviouslySavedProfile = async () => {
    setIsLoadingPrevious(true);
    try {
      const response = await fetch(getApiUrl(`/api/v1/interview/latest-cv/${candidateId}`));
      if (response.ok) {
        const data = await response.json();
        if (data.cv_text) {
          setCvText(data.cv_text);
          if (data.job_description) {
            setJobDescription(data.job_description);
          }
          if (data.interview_mode) {
            setInterviewMode(data.interview_mode);
          }
          if (data.interviewer_persona) {
            setInterviewerPersona(data.interviewer_persona);
          }
          if (data.difficulty_level) {
            setDifficultyLevel(data.difficulty_level);
          }
          if (data.years_of_experience) {
            setYearsOfExperience(data.years_of_experience);
          }
          setFileName("Loaded from previous session");
          setCoachingInsights(prev => ["Successfully loaded your previously saved CV and settings!", ...prev]);
        } else {
          alert("No previously saved CV found. Please upload one or paste it below.");
        }
      } else {
        throw new Error("Failed to fetch latest CV");
      }
    } catch (err) {
      console.warn("Could not load previous CV", err);
      alert("Error loading previously saved CV. Please upload or paste it.");
    } finally {
      setIsLoadingPrevious(false);
    }
  };



  // Feedback/Evaluation States

  const [isInterviewFinished, setIsInterviewFinished] = useState(false);
  const [isGeneratingFeedback, setIsGeneratingFeedback] = useState(false);
  const [detailedReport, setDetailedReport] = useState<string | null>(null);
  const [evaluationScores, setEvaluationScores] = useState<{
    technical_depth: number;
    communication: number;
    leadership: number;
    problem_solving: number;
    confidence: number;
  } | null>(null);
  const [areasForImprovement, setAreasForImprovement] = useState<string[]>([]);

  const endInterviewAndGetFeedback = async () => {
    setIsGeneratingFeedback(true);
    setWsMessage("Generating detailed feedback with AI Recruiter...");

    try {
      const response = await fetch(getApiUrl("/api/v1/interview/feedback"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          interview_id: sessionId,
          candidate_id: candidateId,
          messages: chatMessages.map(m => ({ role: m.role, content: m.content })),
          cv_text: cvText || undefined,
          job_description: jobDescription || undefined,
          interview_mode: interviewMode,
          interviewer_persona: interviewerPersona,
          difficulty_level: difficultyLevel,
          years_of_experience: yearsOfExperience
        })
      });

      if (response.ok) {
        const data = await response.json();
        setDetailedReport(data.detailed_feedback);
        setEvaluationScores({
          technical_depth: data.technical_depth_score,
          communication: data.communication_score,
          leadership: data.leadership_score,
          problem_solving: data.problem_solving_score,
          confidence: data.confidence_score
        });
        setAreasForImprovement(data.areas_for_improvement || []);
        setWhatWentWell(data.what_went_well || []);
        setSuggestedImprovements(data.suggested_improvements || []);
        setIsInterviewFinished(true);
        setCoachingInsights(prev => ["Interview successfully evaluated! Review your dashboard report below.", ...prev]);
        setWsMessage("Detailed feedback generated successfully.");
      } else {
        throw new Error("Feedback API failed");
      }
    } catch (err) {
      console.warn("Simulation feedback fallback", err);
      setTimeout(() => {
        // Dynamic simulated fallback using exact conversation transcript!
        const parsedImprovements: any[] = [];
        const parsedWhatWentWell: string[] = [];
        const parsedAreas: string[] = [];

        // Parse user messages and matching assistant questions
        for (let i = 0; i < chatMessages.length; i++) {
          const msg = chatMessages[i];
          if (msg.role === "user" && i > 0) {
            const question = chatMessages[i - 1].content;
            const answer = msg.content;

            let rating = "Good";
            let mistakes = "Response lacked specific business metrics or architectural trade-offs.";
            let suggestions = "State clearly how your actions impacted performance or cost (STAR method).";
            let suggestedWording = answer;

            const qLower = question.toLowerCase();
            if (qLower.includes("introduce") || qLower.includes("background") || qLower.includes("yourself") || qLower.includes("welcome") || qLower.includes("join")) {
              rating = answer.length >= 50 ? "Good" : "Needs Improvement";
              mistakes = "Lacked a structured professional timeline and didn't mention specific quantifiable metrics or target technology highlights.";
              suggestions = "Structure your response with: years of experience, core technical stack (e.g. React/FastAPI), a signature project highlight, and direct alignment to the target job description.";
              suggestedWording = "I am a Full Stack Software Engineer with over 3 years of experience specializing in building high-performance systems with React, Node.js, and Python. In my previous role at Orchvate, I led the development of a real-time multimodal AI interview coaching platform, which scaled to handle thousands of candidate sessions. By optimizing connection pools and using caching, I improved overall server reliability by 30%. I'm excited to apply my background in real-time streaming and robust API design to deliver developer-friendly enterprise solutions here.";
            } else if (qLower.includes("project") || qLower.includes("architecture") || qLower.includes("technical") || qLower.includes("stack") || qLower.includes("deep dive") || qLower.includes("design")) {
              rating = answer.length >= 70 ? "Good" : "Needs Improvement";
              mistakes = "Focused on tool names without explaining system bottlenecks, scaling limitations, or database design decisions.";
              suggestions = "Use the STAR method. Describe the before/after state, outline technical trade-offs (e.g., SQL vs NoSQL, polling vs websockets), and detail latency/throughput gains.";
              suggestedWording = "In my last technical project, we faced a major API write bottleneck on our Postgres database when throughput reached 2,000 requests per second. I redesigned the database layer by implementing connection pooling, write-optimized indexing, and a Redis caching cluster in front of high-traffic endpoints. This reduced average page load latency from 450ms to 90ms and scaled our user capacity by 3x. I also structured our CI/CD pipelines to run automated bench testing, reducing deployment regressions by 40%.";
            } else if (qLower.includes("collaborate") || qLower.includes("stakeholder") || qLower.includes("conflict") || qLower.includes("opinion") || qLower.includes("alignment") || qLower.includes("unexpected")) {
              rating = answer.length >= 60 ? "Good" : "Needs Improvement";
              mistakes = "Did not demonstrate empathy or structured compromise. Lacked details on how technical trade-offs were explained to business teams.";
              suggestions = "Describe a specific disagreement, focus on how you gathered objective benchmarks, and explain how you aligned product objectives with engineering timelines.";
              suggestedWording = "When our design and product teams requested a major scope pivot mid-sprint to add real-time features, our engineering team was concerned about timeline risks. I organized a cross-functional alignment session. I mapped out the feature's technical complexity and presented three MVP options with concrete timelines. We agreed on a phased release plan: launching the core interface first, followed by incremental sync features. This kept the team motivated and allowed us to deliver on time with high quality.";
            } else if (qLower.includes("spike") || qLower.includes("traffic") || qLower.includes("outage") || qLower.includes("outages") || qLower.includes("availability") || qLower.includes("mitigation") || qLower.includes("circuit breaker") || qLower.includes("safety")) {
              rating = answer.length >= 60 ? "Good" : "Needs Improvement";
              mistakes = "Lacked specific system recovery patterns or failover architecture mechanisms.";
              suggestions = "Incorporate robust patterns like circuit breakers, rate limiting, message queues (SQS/RabbitMQ), and database read replicas.";
              suggestedWording = "To handle a sudden 10x traffic surge or service outage, my architecture utilizes an API Gateway with active rate-limiting and a token-bucket algorithm to throttle abusive requests. Downstream, I implement the Circuit Breaker pattern using a library like Resilience4j to fail fast and serve cached fallbacks during database load spikes. For heavy asynchronous jobs, we offload processing to an Amazon SQS queue, allowing workers to scale out horizontally via Auto Scaling Groups based on queue depth.";
            } else {
              rating = answer.length >= 50 ? "Good" : "Needs Improvement";
              mistakes = "Response lacked quantitative metrics or specific architectural design patterns.";
              suggestions = "Structure your answer with the STAR framework (Situation, Task, Action, Result) and state clear quantitative results.";
              suggestedWording = "To address this scenario, I conducted benchmark testing to compare resource usage. I set up database connection pooling to optimize queries and introduced a Redis cache. As a result, throughput increased by 25%, resource utilization dropped by 15%, and we successfully met our release timeline.";
            }

            parsedImprovements.push({
              question: question.replace(/\[System Note:.*?\]/g, "").trim(),
              candidate_answer: answer,
              rating: rating,
              mistakes: mistakes,
              suggestions: suggestions,
              suggested_answer: suggestedWording
            });
          }
        }

        // Calculate dynamic scores for simulation mode
        const userAnswers = chatMessages.filter(m => m.role === "user");
        const numAnswers = userAnswers.length;

        let baseTech = 85;
        let baseComm = 80;
        let baseLead = 75;
        let baseProb = 82;
        let baseConf = 80;

        // Apply relevance/brevity deductions
        userAnswers.forEach(ans => {
          const content = ans.content.trim();
          if (content.length < 30) {
            baseTech -= 15;
            baseComm -= 10;
            baseProb -= 15;
            baseConf -= 10;
          } else if (content.toLowerCase().includes("skip") || content.toLowerCase().includes("don't know") || content.toLowerCase().includes("no idea") || content.toLowerCase().includes("pass")) {
            baseTech -= 20;
            baseProb -= 20;
            baseConf -= 15;
          }
        });

        // Ensure scores don't drop below a minimum threshold before scaling
        baseTech = Math.max(30, baseTech);
        baseComm = Math.max(30, baseComm);
        baseLead = Math.max(30, baseLead);
        baseProb = Math.max(30, baseProb);
        baseConf = Math.max(30, baseConf);

        // Apply completion rate scaling (assumes 5 questions is a full interview)
        const completionRate = Math.min(1.0, Math.max(0.2, numAnswers / 5));
        const finalTech = Math.round(baseTech * completionRate);
        const finalComm = Math.round(baseComm * completionRate);
        const finalLead = Math.round(baseLead * completionRate);
        const finalProb = Math.round(baseProb * completionRate);
        const finalConf = Math.round(baseConf * completionRate);

        // Achievements/improvements fallback heuristics
        if (parsedImprovements.length > 0) {
          parsedWhatWentWell.push("Clear description of project stacks and ownership details.");
          parsedWhatWentWell.push("Direct interaction and responsiveness to all core questions.");
          parsedAreas.push("Refine the depth of system design scaling scenarios.");
          parsedAreas.push("Keep practicing structured metric descriptions for impact.");
        } else {
          parsedImprovements.push({
            question: "Can you walk me through your background?",
            candidate_answer: "I worked as a full stack engineer on several react apps.",
            rating: "Needs Improvement",
            mistakes: "Lacked structure and didn't mention specific projects or impact metrics.",
            suggestions: "Introduce yourself, state your total years of experience, name 1-2 major projects, and highlight tech stacks used.",
            suggested_answer: "I'm a Full Stack Engineer with over 3 years of experience. I specialize in React, Node.js, and FastAPI. In my previous role, I designed several high-throughput platforms and optimized SQL queries, improving overall loading speeds by 30%."
          });
          parsedWhatWentWell.push("Friendly greeting and clear introduction format.");
          parsedAreas.push("Detail your project contributions with metrics.");
        }

        if (numAnswers < 5) {
          parsedAreas.push(`Complete all questions. The interview was ended early (only ${numAnswers}/5 questions answered), which reduced your score.`);
        }

        let earlyExitMarkdown = "";
        if (numAnswers < 5) {
          earlyExitMarkdown = `* **Warning**: You ended the interview early after completing only ${numAnswers} out of 5 questions. Scoring has been scaled down proportionally to reflect an incomplete session.\n\n`;
        }

        setDetailedReport(
          "### 1. Key Achievements & Strengths (highlighting achievements during the interview)\n" +
          "- Successfully walked through core project architectures from your CV.\n" +
          "- Demonstrated deep domain familiarity in your target technology framework.\n\n" +
          "### 2. Gaps & Suggestions on Corrections (focusing on mistakes and corrections)\n" +
          earlyExitMarkdown +
          "- **Turn Structure**: Ensure you provide specific outcomes instead of generic project details.\n" +
          "- **Mistakes**: A few responses lacked direct answers to edge-case scaling details.\n\n" +
          "### 3. Communication & Pacing Analysis\n" +
          "- Highly professional cadence. Direct, structured, and confident delivery."
        );
        setEvaluationScores({
          technical_depth: finalTech,
          communication: finalComm,
          leadership: finalLead,
          problem_solving: finalProb,
          confidence: finalConf
        });
        setAreasForImprovement(parsedAreas);
        setWhatWentWell(parsedWhatWentWell);
        setSuggestedImprovements(parsedImprovements);
        setIsInterviewFinished(true);
        setCoachingInsights(prev => [
          numAnswers < 5
            ? `Interview evaluated (Simulation Mode - Incomplete ${numAnswers}/5). Review report below.`
            : "Interview evaluated (Simulation Mode). Review your dashboard report below.",
          ...prev
        ]);
        setWsMessage("Detailed feedback generated successfully.");
      }, 1500);
    } finally {
      setIsGeneratingFeedback(false);
    }
  };

  const formatTimeLeft = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
  };

  useEffect(() => {
    if (!isCopilotInitialized || isInterviewFinished || timeLeft === null) return;

    if (timeLeft <= 0) {
      endInterviewAndGetFeedback();
      return;
    }

    const timer = setInterval(() => {
      setTimeLeft(prev => (prev !== null ? prev - 1 : null));
    }, 1000);

    return () => clearInterval(timer);
  }, [isCopilotInitialized, isInterviewFinished, timeLeft]);

  const restartInterview = () => {
    setIsCopilotInitialized(false);
    setIsInterviewFinished(false);
    setTimeLeft(null);
    setChatMessages([
      {
        role: "assistant",
        content: "Hello! I am Jobro AI. I'm excited to learn more about you today. Shall we begin the behavioral and technical assessment?",
        time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      }
    ]);
    setDetailedReport(null);
    setEvaluationScores(null);
    setWhatWentWell([]);
    setSuggestedImprovements([]);
    setCvText("");
    setJobDescription("");
    setFileName("");
    setCurrentOptions([]);
    setShowSidebar(true);
  };

  const formatFeedbackMarkdown = (text: string): string => {
    let html = text;
    // Replace headers
    html = html.replace(/### (.*?)\n/g, '<h3>$1</h3>');
    // Replace bullet lists
    html = html.replace(/- (.*?)\n/g, '<li>$1</li>');
    html = html.replace(/(<li>.*?<\/li>)/gs, '<ul>$1</ul>');
    // Clean up double ul tags
    html = html.replace(/<\/ul>\s*<ul>/g, '');
    // Replace bold
    html = html.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
    // Replace paragraphs
    html = html.replace(/\n\n/g, '<br/>');
    return html;
  };


  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);

    if (file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf")) {
      setIsParsingPdf(true);
      setCoachingInsights(prev => ["Parsing PDF resume text. Please wait...", ...prev]);
      try {
        const text = await parsePdfText(file);
        setCvText(text);
        setCoachingInsights(prev => [`Successfully extracted text from PDF resume: ${file.name}.`, ...prev]);
      } catch (err) {
        console.error("PDF parsing error:", err);
        alert("Failed to parse PDF resume text. Please copy and paste the text manually, or upload a TXT/MD/DOCX file.");
        setCoachingInsights(prev => ["Failed to parse PDF resume. Please retry or paste manually.", ...prev]);
      } finally {
        setIsParsingPdf(false);
      }
    } else if (file.name.toLowerCase().endsWith(".docx")) {
      setIsParsingPdf(true);
      setCoachingInsights(prev => ["Parsing DOCX resume text. Please wait...", ...prev]);
      try {
        const text = await parseDocxText(file);
        setCvText(text);
        setCoachingInsights(prev => [`Successfully extracted text from DOCX resume: ${file.name}.`, ...prev]);
      } catch (err) {
        console.error("DOCX parsing error:", err);
        alert("Failed to parse DOCX resume text. Please copy and paste the text manually, or upload a TXT/MD/PDF file.");
        setCoachingInsights(prev => ["Failed to parse DOCX resume. Please retry or paste manually.", ...prev]);
      } finally {
        setIsParsingPdf(false);
      }
    } else {
      const reader = new FileReader();
      reader.onload = (event) => {
        const text = event.target?.result as string;
        setCvText(text);
        setCoachingInsights(prev => [`Successfully loaded resume file: ${file.name}. Click 'Begin' to start.`, ...prev]);
      };
      reader.readAsText(file);
    }
  };

  const initializeMockInterview = async () => {
    setIsCopilotInitialized(true);
    setIsCopilotTyping(true);
    setIsVoiceMode(true);
    const minutes = parseInt(sessionLength) || 5;
    setTimeLeft(minutes * 60);
    const initialWelcome = "Connecting to voice server and preparing questions based on your CV...";
    setChatMessages([
      {
        role: "assistant",
        content: initialWelcome,
        time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      }
    ]);

    try {
      // Save CV and JD context to the backend for Copilot Studio / custom connector access
      await fetch(getApiUrl("/api/v1/interview/context"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          interview_id: sessionId,
          cv_text: cvText || "",
          job_description: jobDescription || "",
          interview_mode: interviewMode,
          interviewer_persona: interviewerPersona,
          difficulty_level: difficultyLevel,
          years_of_experience: yearsOfExperience,
          candidate_id: candidateId
        })
      }).catch(err => console.warn("Could not save context", err));

      const response = await fetch(getApiUrl("/api/v1/interview/chat"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          interview_id: sessionId,
          candidate_id: candidateId,
          messages: [{ role: "user", content: "I am ready to begin my personalized mock interview." }],
          cv_text: cvText || undefined,
          job_description: jobDescription || undefined,
          interview_mode: interviewMode,
          interviewer_persona: interviewerPersona,
          difficulty_level: difficultyLevel,
          years_of_experience: yearsOfExperience
        })
      });


      if (response.ok) {
        const data = await response.json();
        setChatMessages([
          {
            role: "assistant",
            content: data.response,
            time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
          }
        ]);
        if (data.options) {
          setCurrentOptions(data.options);
        }
        if (data.coaching_insight) {
          setCoachingInsights(prev => [data.coaching_insight, ...prev]);
        }
        if (data.system_prompt) {
          setGeneratedSystemPrompt(data.system_prompt);
        }
      } else {
        throw new Error("Welcome prompt failed");
      }
    } catch (err) {
      console.warn("Simulation welcome fallback", err);
      setTimeout(() => {
        setChatMessages([
          {
            role: "assistant",
            content: `Welcome to your personalized mock interview preparation! Based on your target job and profile, let's start with a core technical question. Can you walk me through a major engineering project you led?`,
            time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
          }
        ]);
        setCurrentOptions([
          "Sure! I recently led a major platform migration using React and Node.js to enhance scalability.",
          "I designed a distributed streaming backend with Python and FastAPI, handling 5k requests per second.",
          "I spearheaded a complete CI/CD automation workflow that reduced deployment times by 40%."
        ]);
        setCoachingInsights(prev => [
          "Let's focus on structured, metric-driven highlights.",
          ...prev
        ]);
      }, 1000);
    } finally {
      setTimeout(() => setIsCopilotTyping(false), 1000);
    }
  };


  useEffect(() => {
    if (chatEndRef.current) {
      chatEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [chatMessages, isCopilotTyping]);

  const sendChatMessage = async (e?: React.FormEvent, customText?: string) => {
    if (e) e.preventDefault();
    const userText = customText !== undefined ? customText : chatInput.trim();
    if (!userText || isCopilotTyping) return;

    if (isListening && recognitionRef.current) {
      recognitionRef.current.stop();
      setIsListening(false);
    }
    if (typeof window !== "undefined" && window.speechSynthesis) {
      window.speechSynthesis.cancel();
    }

    if (customText === undefined) {
      setChatInput("");
    }
    // Clear options immediately on choice selection
    setCurrentOptions([]);

    const now = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const updatedMessages = [
      ...chatMessages,
      { role: "user" as const, content: userText, time: now }
    ];
    setChatMessages(updatedMessages);
    setIsCopilotTyping(true);

    try {
      const response = await fetch(getApiUrl("/api/v1/interview/chat"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          interview_id: sessionId,
          candidate_id: candidateId,
          messages: updatedMessages.map(m => ({ role: m.role, content: m.content })),
          cv_text: cvText || undefined,
          job_description: jobDescription || undefined,
          interview_mode: interviewMode,
          interviewer_persona: interviewerPersona,
          difficulty_level: difficultyLevel,
          years_of_experience: yearsOfExperience
        })
      });


      if (!response.ok) {
        throw new Error("API not fully integrated");
      }

      const data = await response.json();
      setChatMessages(prev => [
        ...prev,
        { role: "assistant" as const, content: data.response, time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) }
      ]);

      if (data.options) {
        setCurrentOptions(data.options);
      }
      if (data.coaching_insight) {
        setCoachingInsights(prev => [data.coaching_insight, ...prev]);
      }
      if (data.system_prompt) {
        setGeneratedSystemPrompt(data.system_prompt);
      }
      setWsMessage(`Jobro AI event: Answer processed successfully`);
    } catch (err) {
      console.warn("Fallback to simulation mode", err);
      // Fallback simulating responses if backend is unreachable
      setTimeout(() => {
        let reply = "Thank you for sharing that experience! Can you elaborate on the business metrics or quantitative impact of your actions?";
        let insight = "Consider clarifying your role in the team explicitly.";
        let nextOpts = [
          "Our optimizations led to a 35% decrease in infrastructure costs and boosted page load speed.",
          "We observed a 20% increase in active user engagement and eliminated data consistency bugs.",
          "I directly managed a team of 4 engineers and delivered the key milestones 2 weeks early."
        ];

        if (userText.toLowerCase().includes("hello") || userText.toLowerCase().includes("hi")) {
          reply = "Welcome! Let's get started. Tell me about a challenging engineering scenario you managed recently.";
          insight = "Be ready to outline clear milestones and hurdles.";
          nextOpts = [
            "I resolved a major downstream API bottleneck by implementing redis cache and robust retry layers.",
            "I mediated a deep architectural disagreement on Vue vs React by delivering concrete benchmarks.",
            "I led our team's response during a sudden production outage, recovering services in under 15 minutes."
          ];
        } else if (userText.length < 30) {
          reply = "I see. To give me a clearer picture, could you expand on that with some more concrete details and technical challenges?";
          insight = "Try to avoid brief, one-sentence responses to make a strong impression.";
          nextOpts = [
            "Certainly. The major challenge was a severe write bottleneck on PostgreSQL, which I optimized using connection pooling.",
            "We were dealing with untyped legacy payload structures, which I migrated smoothly to robust TypeScript interfaces.",
            "We faced a strict deadline constraint with changing requirements, necessitating focused daily standups."
          ];
        } else if (["star", "led", "solved", "result", "impact", "metric"].some(w => userText.toLowerCase().includes(w))) {
          reply = "That's an excellent showcase of execution! How did you coordinate with other teams or non-technical stakeholders to deliver this?";
          insight = "Excellent highlighting of direct impact and metrics.";
          nextOpts = [
            "I set up weekly syncs and presented milestone demos using visual flow charts to align everyone.",
            "I translated technical trade-offs into commercial value, ensuring product management aligned with engineering.",
            "I organized collaborative cross-team brainstorming sessions to resolve scope dependencies quickly."
          ];
        }

        setChatMessages(prev => [
          ...prev,
          { role: "assistant" as const, content: reply, time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) }
        ]);
        setCurrentOptions(nextOpts);
        setCoachingInsights(prev => [insight, ...prev]);
        setWsMessage(`Jobro AI event: Answer analyzed`);
      }, 1200);
    } finally {
      setTimeout(() => setIsCopilotTyping(false), 1200);
    }
  };

  const currentQuestion = useMemo(
    () => questions[currentQuestionIndex] ?? questions[0],
    [currentQuestionIndex]
  );

  useEffect(() => {
    let timer: NodeJS.Timeout;
    if (isCapturing) {
      timer = setInterval(() => setElapsedSeconds((prev) => prev + 1), 1000);
    }
    return () => {
      if (timer) clearInterval(timer);
    };
  }, [isCapturing]);

  useEffect(() => {
    if (!mediaStream || !videoRef.current) return;
    videoRef.current.srcObject = mediaStream;
  }, [mediaStream]);

  useEffect(() => {
    return () => {
      stopCapture();
      disconnectSocket();
      if (typeof window !== "undefined" && window.speechSynthesis) {
        window.speechSynthesis.cancel();
      }
      if (recognitionRef.current) {
        try {
          recognitionRef.current.stop();
        } catch (e) { }
      }
    };
  }, []);

  const formatClock = (seconds: number) => {
    const m = Math.floor(seconds / 60)
      .toString()
      .padStart(2, "0");
    const s = (seconds % 60).toString().padStart(2, "0");
    return `${m}:${s}`;
  };

  const startCapture = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: videoEnabled,
        audio: audioEnabled,
      });
      setMediaStream(stream);
      setIsCapturing(true);
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
      setCoachingInsights((prev) => [
        "Interview session started. Focus on clarity and structure.",
        ...prev,
      ]);
    } catch (error) {
      console.error("Media capture failed", error);
      setCoachingInsights((prev) => [
        "Cannot access camera or microphone. Check permissions and retry.",
        ...prev,
      ]);
    }
  };

  const startScreenShare = async () => {
    try {
      // We request display media and let the browser prompt the user to choose.
      // The user can then select entire screen, an application window, or a browser tab.
      const stream = await (navigator.mediaDevices as any).getDisplayMedia({
        video: true,
        audio: false,
      });
      setScreenStream(stream as MediaStream);
      setIsScreenSharing(true);

      // If there's a video element, mix streams or replace — here we prioritize webcam in main view,
      // but keep the screen stream separate for sending over network.
      setCoachingInsights((prev) => [
        `Screen sharing started (${shareType}).`,
        ...prev,
      ]);

      // When screen sharing stops (user pressed stop in browser UI), clean up state
      const [track] = stream.getVideoTracks();
      track.onended = () => {
        setIsScreenSharing(false);
        setScreenStream(null);
        setCoachingInsights((prev) => ["Screen sharing stopped.", ...prev]);
      };
    } catch (err) {
      console.error("Screen share failed", err);
      setCoachingInsights((prev) => ["Unable to start screen share.", ...prev]);
    }
  };

  const stopScreenShare = () => {
    if (!screenStream) return;
    screenStream.getTracks().forEach((t) => t.stop());
    setScreenStream(null);
    setIsScreenSharing(false);
  };

  const stopCapture = () => {
    if (!mediaStream) return;
    mediaStream.getTracks().forEach((track) => track.stop());
    setMediaStream(null);
    setIsCapturing(false);
    setElapsedSeconds(0);
  };

  const connectSocket = () => {
    if (socketRef.current) return;
    const wsUrl = buildWebSocketUrl();
    const socket = new WebSocket(wsUrl);

    socket.onopen = () => {
      setIsLiveConnected(true);
      setCoachingInsights((prev) => [
        "Realtime pipeline connected. AI verdicts will arrive as you stream.",
        ...prev,
      ]);
    };

    socket.onmessage = (event) => {
      setWsMessage(event.data);
      setTranscript((prev) => [...prev, `AI: ${event.data}`]);
    };

    socket.onclose = () => {
      setIsLiveConnected(false);
      socketRef.current = null;
    };

    socket.onerror = () => {
      setCoachingInsights((prev) => [
        "Realtime websocket stream encountered an issue.",
        ...prev,
      ]);
    };

    socketRef.current = socket;
  };

  const disconnectSocket = () => {
    socketRef.current?.close();
    socketRef.current = null;
    setIsLiveConnected(false);
  };

  const pushTranscript = () => {
    const sample = `Candidate response to question ${currentQuestionIndex + 1}: ${currentQuestion}`;
    setTranscript((prev) => [...prev, sample]);
    setCoachingInsights((prev) => [
      `Great start. Add a specific accomplishment to strengthen your answer.`,
      ...prev,
    ]);
    if (socketRef.current?.readyState === WebSocket.OPEN) {
      socketRef.current.send(JSON.stringify({ event: "transcript", text: sample }));
    }
  };

  // Input tracking (mouse + keyboard)
  useEffect(() => {
    const handleMouse = (e: MouseEvent) => {
      const now = Date.now();
      // throttle to 100ms
      if (now - lastMouseRecord.current < 100) return;
      lastMouseRecord.current = now;
      const ev = `mouse:${e.type}:${Math.round(e.clientX)},${Math.round(e.clientY)}`;
      setInputEvents((prev) => [ev, ...prev].slice(0, 200));
      if (socketRef.current?.readyState === WebSocket.OPEN) {
        socketRef.current.send(JSON.stringify({ event: "input", type: "mouse", detail: ev }));
      }
    };

    const handleKey = (e: KeyboardEvent) => {
      const ev = `key:${e.type}:${e.key}`;
      setInputEvents((prev) => [ev, ...prev].slice(0, 200));
      if (socketRef.current?.readyState === WebSocket.OPEN) {
        socketRef.current.send(JSON.stringify({ event: "input", type: "key", detail: ev }));
      }
    };

    if (isCapturing || isScreenSharing) {
      window.addEventListener("mousemove", handleMouse);
      window.addEventListener("mousedown", handleMouse);
      window.addEventListener("mouseup", handleMouse);
      window.addEventListener("keydown", handleKey);
      window.addEventListener("keyup", handleKey);
    }

    return () => {
      window.removeEventListener("mousemove", handleMouse);
      window.removeEventListener("mousedown", handleMouse);
      window.removeEventListener("mouseup", handleMouse);
      window.removeEventListener("keydown", handleKey);
      window.removeEventListener("keyup", handleKey);
    };
  }, [isCapturing, isScreenSharing]);

  const goNextQuestion = () => {
    setCurrentQuestionIndex((prev) => (prev + 1) % questions.length);
    setTranscript([]);
  };

  return (
    <section className={styles.shell}>
      <div style={{ marginBottom: '16px', display: 'flex' }}>
        <Link
          href="/"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '8px',
            padding: '8px 16px',
            fontSize: '0.85rem',
            fontWeight: 600,
            color: '#5C6485',
            backgroundColor: 'rgba(255, 255, 255, 0.8)',
            border: '1px solid rgba(21, 14, 86, 0.1)',
            borderRadius: '9999px',
            textDecoration: 'none',
            transition: 'all 0.2s',
            cursor: 'pointer',
            boxShadow: '6px 6px 12px rgba(180, 160, 150, 0.12), -5px -5px 10px rgba(255, 255, 255, 0.95)'
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.color = '#150E56';
            e.currentTarget.style.borderColor = 'rgba(21, 14, 86, 0.25)';
            e.currentTarget.style.backgroundColor = 'rgba(255, 246, 240, 0.8)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.color = '#5C6485';
            e.currentTarget.style.borderColor = 'rgba(21, 14, 86, 0.1)';
            e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.8)';
          }}
        >
          ← Back to Dashboard
        </Link>
      </div>

      <div className={styles.headerPanel}>
        <div>
          <p className={styles.kicker}>JOBRO Interview Interface</p>

        </div>
        {activeMode === "stream" && (
          <div className={styles.actionRow}>
            <button className={styles.primaryButton} onClick={startCapture} disabled={isCapturing}>
              Start session
            </button>
            <button className={styles.secondaryButton} onClick={stopCapture} disabled={!isCapturing}>
              Stop session
            </button>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <select value={shareType} onChange={(e) => setShareType(e.target.value as any)}>
                <option value="screen">Entire screen</option>
                <option value="window">Window</option>
                <option value="browserTab">Browser tab</option>
              </select>
              {!isScreenSharing ? (
                <button className={styles.tertiaryButton} onClick={startScreenShare}>
                  Share screen
                </button>
              ) : (
                <button className={styles.tertiaryButton} onClick={stopScreenShare}>
                  Stop share
                </button>
              )}
            </div>
          </div>
        )}
      </div>

      <div className={styles.gridArea} style={(isCopilotInitialized && !isInterviewFinished && !showSidebar) ? { gridTemplateColumns: '1fr' } : {}}>
        <section className={styles.mainPanel} aria-labelledby="interview-panel-title">
          {false ? (
            <>
              <div className={styles.videoFrame}>
                <video
                  ref={videoRef}
                  className={styles.videoPlayer}
                  autoPlay
                  muted={!audioEnabled}
                  playsInline
                  aria-label="Live interview feed"
                />
                {isCapturing ? (
                  <div className={styles.avatarOverlay}>
                    <div className={styles.avatarCard}>
                      <div className={styles.avatarPortrait}>
                        <div className={styles.avatarFace}>
                          <div className={styles.avatarHair} />
                          <div className={styles.avatarEyes}>
                            <span className={styles.avatarEye} />
                            <span className={styles.avatarEye} />
                          </div>
                          <div className={styles.avatarMouth} />
                        </div>
                        <div className={styles.avatarGlow} />
                      </div>
                      <div className={styles.avatarDetails}>
                        <p className={styles.avatarTitle}>Jobro AI</p>
                        <p className={styles.avatarSubtitle}>Human-like animated assistant</p>
                        <p className={styles.avatarStatus}>Listening, reacting, and coaching live</p>
                      </div>
                    </div>
                  </div>
                ) : null}
                <div className={styles.videoStatus}>
                  <span>{videoEnabled ? "Webcam enabled" : "Webcam disabled"}</span>
                  <span>{audioEnabled ? "Mic enabled" : "Mic disabled"}</span>
                </div>
              </div>

              <div className={styles.statusCards}>
                <div className={styles.statusCard}>
                  <span className={styles.statusLabel}>Session timer</span>
                  <strong>{formatClock(elapsedSeconds)}</strong>
                </div>
                <div className={styles.statusCard}>
                  <span className={styles.statusLabel}>Realtime connection</span>
                  <strong>{isLiveConnected ? "Connected" : "Disconnected"}</strong>
                </div>
              </div>

              <div className={styles.panelSection}>
                <div className={styles.panelHeader}>
                  <div>
                    <p className={styles.panelTitle}>Adaptive question</p>
                    <p className={styles.panelSubtitle}>{currentQuestion}</p>
                  </div>
                  <button className={styles.tertiaryButton} onClick={goNextQuestion}>
                    Next question
                  </button>
                </div>

                <div className={styles.transcriptPane}>
                  <div className={styles.transcriptHeader}>
                    <h2 className={styles.sectionTitle}>Live transcript</h2>
                    <button className={styles.tertiaryButton} onClick={pushTranscript} disabled={!isCapturing}>
                      Add transcript
                    </button>
                  </div>
                  <ol className={styles.transcriptList} aria-live="polite">
                    {transcript.length === 0 ? (
                      <li className={styles.transcriptEmpty}>No transcript yet. Speak and capture your response.</li>
                    ) : (
                      transcript.map((line, index) => (
                        <li key={index} className={styles.transcriptItem}>
                          {line}
                        </li>
                      ))
                    )}
                  </ol>
                </div>
              </div>
            </>
          ) : !isCopilotInitialized ? (
            <div className={styles.setupContainer}>
              <div>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "10px", marginBottom: "8px" }}>
                  <h2 className={styles.setupTitle} style={{ margin: 0 }}>Personalized Mock Interview Setup</h2>
                  <button
                    type="button"
                    className={styles.tertiaryButton}
                    onClick={loadPreviouslySavedProfile}
                    disabled={isLoadingPrevious}
                    style={{ fontSize: "0.85rem", padding: "6px 12px", border: "1px solid rgba(21,14,86,0.15)", borderRadius: "6px", cursor: "pointer" }}
                  >
                    {isLoadingPrevious ? "Loading..." : "📋 Load Previously Saved CV & JD"}
                  </button>
                </div>
                <p className={styles.setupSubtitle}>
                  Provide your target Job Description and upload your CV/Resume to start off a customized interview preparation session with Jobro AI.
                </p>
              </div>

              <div className={styles.formGroup}>
                <label className={styles.formLabel}>Target Job Description</label>
                <textarea
                  className={styles.textareaField}
                  rows={4}
                  placeholder="Paste the target job description here..."
                  value={jobDescription}
                  onChange={(e) => setJobDescription(e.target.value)}
                />
              </div>

              <div className={styles.formGroup}>
                <label className={styles.formLabel}>CV / Resume Context</label>
                <textarea
                  className={styles.textareaField}
                  rows={4}
                  placeholder="Paste your CV text here, or use the file upload below..."
                  value={cvText}
                  onChange={(e) => setCvText(e.target.value)}
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '16px' }}>
                <div className={styles.formGroup}>
                  <label className={styles.formLabel}>Interview Mode</label>
                  <input
                    type="text"
                    className={styles.selectField}
                    value={interviewMode}
                    onChange={(e) => setInterviewMode(e.target.value)}
                    placeholder="e.g. Technical Interview"
                  />
                </div>

                <div className={styles.formGroup}>
                  <label className={styles.formLabel}>Interviewer Persona</label>
                  <input
                    type="text"
                    className={styles.selectField}
                    value={interviewerPersona}
                    onChange={(e) => setInterviewerPersona(e.target.value)}
                    placeholder="e.g. Senior Software Engineer"
                  />
                </div>

                <div className={styles.formGroup}>
                  <label className={styles.formLabel}>Difficulty Level</label>
                  <input
                    type="text"
                    className={styles.selectField}
                    value={difficultyLevel}
                    onChange={(e) => setDifficultyLevel(e.target.value)}
                    placeholder="e.g. Senior"
                  />
                </div>

                <div className={styles.formGroup}>
                  <label className={styles.formLabel}>Years of Experience</label>
                  <input
                    type="text"
                    className={styles.selectField}
                    value={yearsOfExperience}
                    onChange={(e) => setYearsOfExperience(e.target.value)}
                    placeholder="e.g. 3 years"
                  />
                </div>

                <div className={styles.formGroup}>
                  <label className={styles.formLabel}>AI Voice Accent</label>
                  <select
                    className={styles.selectField}
                    value={selectedVoiceName}
                    onChange={(e) => setSelectedVoiceName(e.target.value)}
                  >
                    <option value="shimmer">Shimmer (Female)</option>
                    <option value="alloy">Alloy (Neutral)</option>
                    <option value="echo">Echo (Male)</option>
                    <option value="fable">Fable (Neutral)</option>
                    <option value="onyx">Onyx (Male)</option>
                    <option value="nova">Nova (Female)</option>
                  </select>
                </div>

                <div className={styles.formGroup}>
                  <label className={styles.formLabel}>Voice Speed</label>
                  <select
                    className={styles.selectField}
                    value={speechSpeed}
                    onChange={(e) => setSpeechSpeed(e.target.value)}
                  >
                    <option value="0.8">0.8x (Slow)</option>
                    <option value="1.0">1.0x (Normal)</option>
                    <option value="1.15">1.15x</option>
                    <option value="1.3">1.3x (Fast)</option>
                    <option value="1.5">1.5x (Very Fast)</option>
                  </select>
                </div>

                <div className={styles.formGroup}>
                  <label className={styles.formLabel}>Session Length</label>
                  <select
                    className={styles.selectField}
                    value={sessionLength}
                    onChange={(e) => setSessionLength(e.target.value)}
                  >
                    <option value="5 mins">5 mins</option>
                    <option value="10 mins">10 mins</option>
                    <option value="15 mins">15 mins</option>
                    <option value="20 mins">20 mins</option>
                  </select>
                </div>
              </div>


              <div className={styles.formGroup}>
                <input
                  id="cv-file-input"
                  type="file"
                  accept=".txt,.md,.pdf,.docx"
                  style={{ display: "none" }}
                  onChange={handleFileUpload}
                />
                <div
                  className={styles.fileDropZone}
                  onClick={() => document.getElementById("cv-file-input")?.click()}
                >
                  {isParsingPdf ? (
                    <div className={styles.fileSelectedText}>
                      ⏳ Parsing resume text...
                    </div>
                  ) : fileName ? (
                    <div className={styles.fileSelectedText}>
                      📄 {fileName}
                    </div>
                  ) : (
                    <span className={styles.fileDropLabel}>
                      Drag and drop your CV file here, or <strong>Click to Browse</strong> (.txt, .md, .pdf, .docx files supported)
                    </span>
                  )}
                </div>
              </div>

              <button
                className={styles.beginButton}
                onClick={initializeMockInterview}
                disabled={!jobDescription.trim() && !cvText.trim()}
              >
                Begin Tailored Mock Prep Flow
              </button>
            </div>
          ) : isInterviewFinished ? (
            <div className={styles.feedbackDashboard}>
              <div className={styles.dashboardHeader}>
                <div>
                  <h2 className={styles.setupTitle}>Tailored Interview Evaluation</h2>
                  <p className={styles.setupSubtitle}>Actionable feedback based on target criteria and resume alignment.</p>
                </div>
                <button className={styles.restartButton} onClick={restartInterview}>
                  Start New Mock Session
                </button>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px', marginBottom: '32px' }}>
                <div className={styles.scoreCard} style={{ background: 'rgba(0, 145, 124, 0.08)', color: '#00917C', border: '1px solid rgba(0, 145, 124, 0.2)' }}>
                  <span className={styles.scoreLabel} style={{ color: '#00917C' }}>Technical Depth</span>
                  <strong className={styles.scoreValue} style={{ color: '#150E56' }}>{evaluationScores?.technical_depth}%</strong>
                </div>
                <div className={styles.scoreCard} style={{ background: 'rgba(21, 14, 86, 0.05)', color: '#150E56', border: '1px solid rgba(21, 14, 86, 0.1)' }}>
                  <span className={styles.scoreLabel} style={{ color: '#150E56' }}>Problem Solving</span>
                  <strong className={styles.scoreValue} style={{ color: '#150E56' }}>{evaluationScores?.problem_solving}%</strong>
                </div>
                <div className={styles.scoreCard} style={{ background: 'rgba(255, 122, 89, 0.1)', color: '#FF7A59', border: '1px solid rgba(255, 122, 89, 0.2)' }}>
                  <span className={styles.scoreLabel} style={{ color: '#FF7A59' }}>Communication</span>
                  <strong className={styles.scoreValue} style={{ color: '#150E56' }}>{evaluationScores?.communication}%</strong>
                </div>
                <div className={styles.scoreCard}>
                  <span className={styles.scoreLabel}>Leadership</span>
                  <strong className={styles.scoreValue}>{evaluationScores?.leadership}%</strong>
                </div>
                <div className={styles.scoreCard}>
                  <span className={styles.scoreLabel}>Confidence</span>
                  <strong className={styles.scoreValue}>{evaluationScores?.confidence}%</strong>
                </div>
              </div>

              {/* Custom Feedback Tabs */}
              <div className="flex gap-4 border-b border-[#150E56]/10 mb-6 pb-2">
                {[
                  { id: "www", label: "What Went Well" },
                  { id: "ati", label: "Areas to Improve" },
                  { id: "sai", label: "Suggested Wording" }
                ].map((tab) => (
                  <button
                    key={tab.id}
                    onClick={() => setFeedbackTab(tab.id as any)}
                    className={`pb-3 text-sm font-semibold border-b-2 transition duration-200 ${feedbackTab === tab.id
                        ? "border-[#00917C] text-[#00917C] font-bold"
                        : "border-transparent text-[#5C6485] hover:text-[#150E56]"
                      }`}
                    style={{ background: 'transparent', cursor: 'pointer', borderTop: 'none', borderLeft: 'none', borderRight: 'none' }}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>

              {/* Tab Content Box */}
              <div className="p-6 rounded-2xl border border-[#150E56]/10 bg-white/70 shadow-clay mb-6">
                {feedbackTab === "www" && (
                  <div>
                    <p className="text-sm text-[#5C6485] font-medium italic mb-4">Here is what you did exceptionally well in your answers:</p>
                    <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
                      {whatWentWell.length === 0 ? (
                        <li className="text-sm text-slate-500 italic">No specific achievements highlighted.</li>
                      ) : (
                        whatWentWell.map((item, idx) => (
                          <li key={idx} className="flex gap-2 items-start text-[#2C3454] text-sm mb-3">
                            <span style={{ color: '#00917C', fontWeight: 'bold', marginRight: '8px' }}>✓</span>
                            <span>{item}</span>
                          </li>
                        ))
                      )}
                    </ul>
                  </div>
                )}

                {feedbackTab === "ati" && (
                  <div>
                    <p className="text-sm text-[#5C6485] font-medium italic mb-4">Focus on these suggestions for your next mock attempt:</p>
                    <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
                      {areasForImprovement.length === 0 ? (
                        <li className="text-sm text-slate-500 italic">No critical improvement areas highlighted.</li>
                      ) : (
                        areasForImprovement.map((item, idx) => (
                          <li key={idx} className="flex gap-2 items-start text-[#2C3454] text-sm mb-3">
                            <span style={{ color: '#ef4444', fontWeight: 'bold', marginRight: '8px' }}>!</span>
                            <span>{item}</span>
                          </li>
                        ))
                      )}
                    </ul>
                  </div>
                )}

                {feedbackTab === "sai" && (
                  <div>
                    <p className="text-sm text-[#5C6485] font-medium italic mb-4">Suggested wording adjustments, mistakes, and corrections to strengthen your answers:</p>
                    {suggestedImprovements.length === 0 ? (
                      <p className="text-xs text-slate-500 italic">No specific rewrites suggested. All answers were comprehensive.</p>
                    ) : (
                      suggestedImprovements.map((item, idx) => (
                        <div key={idx} className="p-4 rounded-xl bg-[#FFF6F0]/40 border border-[#150E56]/5 space-y-3 shadow-clayBtn mb-4" style={{ marginBottom: '1.25rem', padding: '1.25rem' }}>
                          <p className="text-xs text-[#5C6485] uppercase font-semibold">Question: {item.question}</p>
                          <p className="text-xs text-red-600/80 line-through">Your Answer: "{item.candidate_answer}"</p>

                          {item.rating && (
                            <div className="flex items-center gap-2 my-2">
                              <span className="text-[10px] uppercase font-bold text-slate-400">Verdict:</span>
                              <span className={`text-xs font-bold px-2 py-0.5 rounded border ${item.rating === 'Excellent' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' :
                                  item.rating === 'Good' ? 'bg-blue-50 text-blue-700 border-blue-200' :
                                    'bg-amber-50 text-amber-700 border-amber-200'
                                }`}>
                                {item.rating}
                              </span>
                            </div>
                          )}

                          {item.mistakes && (
                            <div className="text-xs text-[#b91c1c] font-semibold bg-red-50/50 p-2.5 rounded border border-red-100/50 my-2">
                              <span className="font-bold text-red-700">Mistakes / Gaps:</span> {item.mistakes}
                            </div>
                          )}

                          {item.suggestions && (
                            <div className="text-xs text-[#d97706] font-semibold bg-amber-50/50 p-2.5 rounded border border-amber-100/50 my-2">
                              <span className="font-bold text-amber-700">Corrections:</span> {item.suggestions}
                            </div>
                          )}

                          <div className="pt-3 border-t border-[#150E56]/5 flex flex-col gap-1.5">
                            <span className="text-xs text-[#00917C] font-bold bg-[#00917C]/10 px-2 py-0.5 rounded border border-[#00917C]/20 w-fit">Suggested Wording</span>
                            <p className="text-sm text-[#150E56] font-semibold">"{item.suggested_answer}"</p>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                )}
              </div>

              <div className={styles.feedbackReport}>
                <div dangerouslySetInnerHTML={{ __html: formatFeedbackMarkdown(detailedReport || "") }} />
              </div>
            </div>
          ) : isVoiceMode ? (
            <div className="space-y-6">
              <VoiceWorkspace
                interviewId={sessionId}
                candidateId={candidateId}
                systemPrompt={generatedSystemPrompt || `You are conducting a friendly, conversational mock interview for the role: ${interviewMode}. Selected Persona: ${interviewerPersona}. Selected Difficulty: ${difficultyLevel}. CV Text: ${cvText}. Job Description: ${jobDescription}. Use dynamic prompt escalation, and speak in the tone of the selected persona. Follow these strict phases: (1) Warmly welcome the candidate, introduce yourself, and invite them to introduce themselves or talk about their background. (2) Briefly reference a key highlight or project from their CV and how it aligns with the Job Description to make the welcome feel highly tailored and custom. (3) Ease into the interview questions naturally. Do NOT start immediately with technical grilling, scenario questions or case studies. Make them feel welcomed first.`}
                selectedVoice={selectedVoiceName}
                onVoiceChange={setSelectedVoiceName}
                onClose={() => {
                  setIsVoiceMode(false);
                  setCurrentOptions([]);
                }}
                onNewTranscript={(role, content) => {
                  const now = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                  setChatMessages(prev => [
                    ...prev,
                    { role, content, time: now }
                  ]);
                }}
                onNewOptions={setCurrentOptions}
                onInitRef={(ref) => {
                  voiceRef.current = ref;
                }}
                speechSpeed={speechSpeed}
                onSpeedChange={setSpeechSpeed}
                showSidebar={showSidebar}
                onToggleSidebar={() => setShowSidebar(prev => !prev)}
              />

              {/* Read-Only Transcript List and End Session Button */}
              <div className="p-6 rounded-2xl border border-[#150E56]/10 bg-white/70 shadow-clay flex flex-col gap-4">
                <div className="flex justify-between items-center border-b border-[#150E56]/10 pb-3 flex-wrap gap-2">
                  <div className="flex items-center gap-3">
                    <h3 className="font-bold text-[#150E56] text-base">Live Conversation Transcript</h3>
                    {timeLeft !== null && (
                      <span className="text-xs font-bold bg-[#150E56]/5 text-[#150E56] px-3 py-1 rounded-full border border-[#150E56]/10">
                        ⏱️ Time Remaining: {formatTimeLeft(timeLeft)}
                      </span>
                    )}
                  </div>
                  <button
                    className={styles.endSessionButton}
                    onClick={endInterviewAndGetFeedback}
                    disabled={chatMessages.length < 2 || isGeneratingFeedback}
                    style={{ margin: 0 }}
                  >
                    {isGeneratingFeedback ? "Generating Report..." : "End Interview & Get Feedback"}
                  </button>
                </div>

                <div className="max-h-[300px] overflow-y-auto space-y-4 pr-2" style={{ scrollbarWidth: 'thin' }}>
                  {chatMessages.length <= 1 ? (
                    <p className="text-xs text-slate-500 italic text-center py-4">Preparing questions based on your CV... Speak to begin!</p>
                  ) : (
                    chatMessages.slice(1).map((msg, index) => (
                      <div key={index} className={`flex flex-col gap-1 p-3 rounded-xl border ${msg.role === 'user' ? 'bg-[#00917C]/5 border-[#00917C]/10 ml-8' : 'bg-[#150E56]/5 border-[#150E56]/10 mr-8'}`}>
                        <div className="flex justify-between text-[10px] font-bold text-[#5C6485]">
                          <span>{msg.role === 'user' ? 'Candidate' : 'Jobro AI'}</span>
                          <span>{msg.time}</span>
                        </div>
                        <p className="text-xs text-[#2C3454] leading-relaxed">{msg.content}</p>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          ) : (
            <div className={styles.chatWorkspace}>
              <div className={styles.chatInputArea} style={{ borderBottom: '1px solid rgba(21, 14, 86, 0.08)', borderTop: 'none', background: 'rgba(255, 246, 240, 0.5)', justifyContent: 'space-between' }}>
                <div className="flex items-center gap-3">
                  <span className={styles.formLabel} style={{ margin: 0, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Tailored Mock Prep Session</span>
                  {timeLeft !== null && (
                    <span className="text-xs font-bold bg-[#150E56]/5 text-[#150E56] px-3 py-1 rounded-full border border-[#150E56]/10">
                      ⏱️ Time Remaining: {formatTimeLeft(timeLeft)}
                    </span>
                  )}
                </div>
                <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                  <button
                    type="button"
                    onClick={() => setShowSidebar(prev => !prev)}
                    title={showSidebar ? "Hide Jobro AI Sidebar" : "Show Jobro AI Sidebar"}
                    style={{
                      background: showSidebar ? 'rgba(21, 14, 86, 0.05)' : 'rgba(0, 145, 124, 0.1)',
                      border: showSidebar ? '1px solid rgba(21, 14, 86, 0.1)' : '1px solid rgba(0, 145, 124, 0.25)',
                      color: showSidebar ? '#5C6485' : '#00917C',
                      borderRadius: '0.5rem',
                      padding: '0.4rem 0.8rem',
                      fontSize: '0.85rem',
                      fontWeight: '700',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px',
                      transition: 'all 0.2s'
                    }}
                  >
                    <span>👁️</span>
                    <span>{showSidebar ? "Hide Sidebar" : "Show Sidebar"}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      if (typeof window !== "undefined" && window.speechSynthesis) {
                        window.speechSynthesis.cancel();
                      }
                      setCurrentOptions([]);
                      setIsVoiceMode(true);
                    }}
                    title="Enable Live Speech-to-Speech Mode"
                    style={{
                      background: 'rgba(0, 145, 124, 0.1)',
                      border: '1px solid rgba(0, 145, 124, 0.25)',
                      color: '#00917C',
                      borderRadius: '0.5rem',
                      padding: '0.4rem 0.8rem',
                      fontSize: '0.85rem',
                      fontWeight: '700',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px',
                      transition: 'all 0.2s'
                    }}
                  >
                    <span>🎙️</span>
                    <span>Live Voice Mode</span>
                  </button>
                  <select
                    value={selectedVoiceName}
                    onChange={(e) => setSelectedVoiceName(e.target.value)}
                    title="Select AI Voice Accent/Persona"
                    style={{
                      background: 'rgba(255, 246, 240, 0.5)',
                      border: '1px solid rgba(21, 14, 86, 0.1)',
                      color: '#150E56',
                      fontWeight: '600',
                      borderRadius: '0.5rem',
                      padding: '0.4rem 0.6rem',
                      fontSize: '0.8rem',
                      cursor: 'pointer',
                      outline: 'none',
                      transition: 'all 0.2s',
                      maxWidth: '180px'
                    }}
                  >
                    <option value="shimmer" style={{ background: 'white', color: '#2C3454' }}>Shimmer (Female)</option>
                    <option value="alloy" style={{ background: 'white', color: '#2C3454' }}>Alloy (Neutral)</option>
                    <option value="echo" style={{ background: 'white', color: '#2C3454' }}>Echo (Male)</option>
                    <option value="fable" style={{ background: 'white', color: '#2C3454' }}>Fable (Neutral)</option>
                    <option value="onyx" style={{ background: 'white', color: '#2C3454' }}>Onyx (Male)</option>
                    <option value="nova" style={{ background: 'white', color: '#2C3454' }}>Nova (Female)</option>
                  </select>
                  <select
                    value={speechSpeed}
                    onChange={(e) => setSpeechSpeed(e.target.value)}
                    title="Select AI Voice Speed"
                    style={{
                      background: 'rgba(255, 246, 240, 0.5)',
                      border: '1px solid rgba(21, 14, 86, 0.1)',
                      color: '#150E56',
                      fontWeight: '600',
                      borderRadius: '0.5rem',
                      padding: '0.4rem 0.6rem',
                      fontSize: '0.8rem',
                      cursor: 'pointer',
                      outline: 'none',
                      transition: 'all 0.2s',
                      maxWidth: '120px'
                    }}
                  >
                    <option value="0.8" style={{ background: 'white', color: '#2C3454' }}>0.8x (Slow)</option>
                    <option value="1.0" style={{ background: 'white', color: '#2C3454' }}>1.0x (Normal)</option>
                    <option value="1.15" style={{ background: 'white', color: '#2C3454' }}>1.15x</option>
                    <option value="1.3" style={{ background: 'white', color: '#2C3454' }}>1.3x (Fast)</option>
                    <option value="1.5" style={{ background: 'white', color: '#2C3454' }}>1.5x (Very Fast)</option>
                  </select>
                  <button
                    className={styles.endSessionButton}
                    onClick={endInterviewAndGetFeedback}
                    disabled={chatMessages.length < 3 || isGeneratingFeedback}
                  >
                    {isGeneratingFeedback ? "Generating Report..." : "End Interview & Get Feedback"}
                  </button>
                </div>
              </div>

              <div className={styles.chatMessages}>
                {chatMessages.map((msg, index) => (
                  <div key={index} className={`${styles.chatBubble} ${msg.role === "user" ? styles.userBubble : styles.agentBubble}`}>
                    <div className={`${styles.bubbleHeader} ${msg.role === "user" ? styles.userHeader : styles.agentHeader}`}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <span>{msg.role === "user" ? "Candidate" : "Jobro AI"}</span>
                      </div>
                      <span>{msg.time}</span>
                    </div>
                    <div className={`${styles.bubbleBody} ${msg.role === "user" ? styles.userBody : styles.agentBody}`}>
                      {msg.content}
                    </div>
                  </div>
                ))}
                {isCopilotTyping && (
                  <div className={`${styles.chatBubble} ${styles.agentBubble}`}>
                    <div className={`${styles.bubbleHeader} ${styles.agentHeader}`}>
                      <span>Jobro AI</span>
                      <span>Typing...</span>
                    </div>
                    <div className={`${styles.bubbleBody} ${styles.agentBody}`}>
                      <div className={styles.typing}>
                        <span className={styles.typingDot}></span>
                        <span className={styles.typingDot}></span>
                        <span className={styles.typingDot}></span>
                      </div>
                    </div>
                  </div>
                )}
                <div ref={chatEndRef} />
              </div>
              <form onSubmit={sendChatMessage} className={styles.chatInputArea}>
                <div className={styles.inputWrapper}>
                  <input
                    type="text"
                    value={chatInput}
                    onChange={(e) => setChatInput(e.target.value)}
                    placeholder={isListening ? "Listening... Speak now." : "Type your response to Jobro AI..."}
                    className={styles.chatInputField}
                    disabled={isCopilotTyping}
                  />
                  <button
                    type="button"
                    onClick={toggleSpeechRecognition}
                    disabled={isCopilotTyping}
                    className={`${styles.micButton} ${isListening ? styles.micListening : ""}`}
                    title={isListening ? "Stop listening" : "Speak response (Speech to Text)"}
                  >
                    🎤
                  </button>
                </div>
                <button
                  type="submit"
                  disabled={!chatInput.trim() || isCopilotTyping}
                  className={styles.chatSendButton}
                >
                  Send
                </button>
              </form>
            </div>
          )}
        </section>

        {(!(isCopilotInitialized && !isInterviewFinished) || showSidebar) && (
          <aside className={styles.sidebar} aria-labelledby="coaching-sidebar-title">
            <div className={styles.sidebarHeader}>
              <h2 id="coaching-sidebar-title" className={styles.sectionTitle}>
                Jobro AI sidebar
              </h2>
              <p className={styles.sidebarDescription}>
                Actionable recommendations based on candidate answer flow, clarity, and execution.
              </p>
            </div>
            {currentOptions && currentOptions.length > 0 && !isCopilotTyping && (
              <div className={styles.sidebarOptionsContainer}>
                <p className={styles.sidebarOptionsLabel}>💡 Select a response based on your CV:</p>
                <div className={styles.sidebarOptionsGrid}>
                  {currentOptions.map((opt, idx) => (
                    <button
                      key={idx}
                      type="button"
                      className={styles.sidebarOptionButton}
                      onClick={() => {
                        if (isVoiceMode && voiceRef.current) {
                          voiceRef.current.sendTextOption(opt);
                        } else {
                          sendChatMessage(undefined, opt);
                        }
                      }}
                    >
                      {opt}
                    </button>
                  ))}
                </div>
              </div>
            )}
            <ul className={styles.coachingList}>
              {coachingInsights.map((item, index) => (
                <li key={index} className={styles.coachingItem}>
                  {item}
                </li>
              ))}
            </ul>
            <div className={styles.terminalCard}>
              <h3 className={styles.smallTitle}>Live AI event</h3>
              <p className={styles.terminalText}>{wsMessage || "Waiting for AI pipeline events..."}</p>
            </div>
            <div className={styles.terminalCard}>
              <h3 className={styles.smallTitle}>Recent inputs</h3>
              {inputEvents.length === 0 ? (
                <p className={styles.terminalText}>No input events yet.</p>
              ) : (
                <ol className={styles.transcriptList} style={{ maxHeight: 160, overflow: 'auto' }}>
                  {inputEvents.slice(0, 50).map((ev, i) => (
                    <li key={i} className={styles.transcriptItem}>{ev}</li>
                  ))}
                </ol>
              )}
            </div>
          </aside>
        )}
      </div>
    </section>
  );
}
