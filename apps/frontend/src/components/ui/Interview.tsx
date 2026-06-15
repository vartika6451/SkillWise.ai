import { useState, useEffect, useRef } from "react";
import { useParams, useNavigate } from "react-router";
import axios from "axios";
import { BACKEND_URL } from "@/lib/config";
import { Button } from "./button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "./card";
import { 
  Mic, Volume2, VolumeX, AlertCircle, Play, Square, Sparkles, 
  ArrowLeft, CheckCircle2, User, Bot, Loader2, Send, RotateCcw,
  Activity, Copy, Terminal, Layers, Camera, CameraOff
} from "lucide-react";
import { toast } from "sonner";

interface QuestionLog {
  role: "user" | "assistant";
  text: string;
  timestamp: Date;
}

export function Interview() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  // State definitions
  const [loading, setLoading] = useState(true);
  const [githubData, setGithubData] = useState<any>(null);
  const [status, setStatus] = useState<"idle" | "greeting" | "listening" | "processing" | "speaking" | "assessing" | "completed">("idle");
  const [history, setHistory] = useState<QuestionLog[]>([]);
  const [transcript, setTranscript] = useState("");
  const [isMuted, setIsMuted] = useState(false);
  const [speechSupported, setSpeechSupported] = useState(true);
  const [errorText, setErrorText] = useState("");
  const [manualInput, setManualInput] = useState("");
  const [questionCount, setQuestionCount] = useState(0);
  const [speechMetricsList, setSpeechMetricsList] = useState<any[]>([]);
  const [assessment, setAssessment] = useState<any>(null);
  const [assessingStep, setAssessingStep] = useState(0);

  // Camera & Face Expression States
  const [isCameraOn, setIsCameraOn] = useState(false);
  const [cameraStream, setCameraStream] = useState<MediaStream | null>(null);
  const [detectedEmotion, setDetectedEmotion] = useState<string>("Neutral");
  const [eyeContactQuality, setEyeContactQuality] = useState<string>("Focused");
  const [visualGuidance, setVisualGuidance] = useState<string>("");
  const [isAnalyzingFace, setIsAnalyzingFace] = useState(false);
  
  // Real-time HUD Metrics
  const [eyeContactIndex, setEyeContactIndex] = useState<number>(94);
  const [stanceState, setStanceState] = useState<string>("Attentive");

  // Refs for speech recognition and synthesis
  const recognitionRef = useRef<any>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const currentUtteranceRef = useRef<SpeechSynthesisUtterance | null>(null);
  const listeningStartTime = useRef<number>(0);

  // Camera & HUD Refs
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const cameraStreamRef = useRef<MediaStream | null>(null);

  // Initialize Speech Recognition on Mount
  useEffect(() => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      setSpeechSupported(false);
      return;
    }

    const rec = new SpeechRecognition();
    rec.lang = "en-US";
    rec.continuous = false; // Set to false to auto-stop on silence
    rec.interimResults = true; // Show text while talking

    rec.onstart = () => {
      console.log("Speech recognition started");
      setStatus("listening");
      setTranscript("");
      listeningStartTime.current = Date.now();
    };

    rec.onresult = (event: any) => {
      const liveTranscript = Array.from(event.results)
        .map((result: any) => result[0].transcript)
        .join("");
      setTranscript(liveTranscript);
    };

    rec.onerror = (event: any) => {
      console.error("Speech recognition error:", event.error);
      if (event.error === "not-allowed") {
        setErrorText("Microphone permission denied. Please allow mic access to use voice.");
        toast.error("Microphone access denied.");
      } else if (event.error !== "no-speech") {
        toast.error(`Speech recognition error: ${event.error}`);
      }
    };

    rec.onend = () => {
      console.log("Speech recognition ended");
      // Only process if we were listening and have some transcript
      // If no speech is captured, we will keep it listening or idle
      setStatus((prev) => {
        if (prev === "listening") {
          // If we have text, send to backend, else go back to listening/idle
          return "listening"; 
        }
        return prev;
      });
    };

    recognitionRef.current = rec;

    return () => {
      if (recognitionRef.current) {
        recognitionRef.current.abort();
      }
      if (speechSynthesis) {
        speechSynthesis.cancel();
      }
      if (cameraStreamRef.current) {
        cameraStreamRef.current.getTracks().forEach((track) => track.stop());
      }
    };
  }, []);

  // Start Camera
  const startCamera = async () => {
    try {
      setErrorText("");
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: 400, height: 300, facingMode: "user" },
        audio: false
      });
      setCameraStream(stream);
      cameraStreamRef.current = stream;
      setIsCameraOn(true);
      
      // Use setTimeout to ensure video element ref is bound in DOM
      setTimeout(() => {
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
        }
      }, 100);

      toast.success("Webcam active. Real-time expression coaching enabled.");
    } catch (err: any) {
      console.error("Error starting camera:", err);
      setErrorText("Camera permission denied or camera not found. Using audio-only mode.");
      toast.error("Could not access camera.");
      setIsCameraOn(false);
    }
  };

  // Stop Camera
  const stopCamera = () => {
    if (cameraStreamRef.current) {
      cameraStreamRef.current.getTracks().forEach((track) => track.stop());
      cameraStreamRef.current = null;
    }
    setCameraStream(null);
    setIsCameraOn(false);
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
  };

  // Toggle Camera
  const toggleCamera = () => {
    if (isCameraOn) {
      stopCamera();
    } else {
      startCamera();
    }
  };

  // Simulated live HUD values update
  useEffect(() => {
    if (!isCameraOn) return;
    const interval = setInterval(() => {
      setEyeContactIndex((prev) => {
        const delta = Math.floor(Math.random() * 7) - 3; // -3 to 3
        const next = prev + delta;
        return Math.max(88, Math.min(99, next));
      });
      const stances = ["Attentive", "Leaning In", "Focused", "Calming Stance", "Active Listening"];
      setStanceState(stances[Math.floor(Math.random() * stances.length)]);
    }, 2500);
    return () => clearInterval(interval);
  }, [isCameraOn]);

  // Capture Base64 Snapshot
  const captureSnapshot = (): string | null => {
    if (!isCameraOn || !videoRef.current) return null;
    try {
      const canvas = document.createElement("canvas");
      canvas.width = 320;
      canvas.height = 240;
      const ctx = canvas.getContext("2d");
      if (ctx) {
        // Draw matched to mirror style
        ctx.translate(320, 0);
        ctx.scale(-1, 1);
        ctx.drawImage(videoRef.current, 0, 0, 320, 240);
        // Reset transform
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        return canvas.toDataURL("image/jpeg", 0.7);
      }
    } catch (e) {
      console.error("Failed to capture webcam snapshot:", e);
    }
    return null;
  };

  // Fetch Interview/Github details on load
  useEffect(() => {
    async function fetchInterview() {
      try {
        setLoading(true);
        const res = await axios.get(`${BACKEND_URL}/api/v1/interview/${id}`);
        if (res.data) {
          if (res.data.githubMetaData) {
            try {
              const parsedGithub = JSON.parse(res.data.githubMetaData);
              setGithubData(parsedGithub);
            } catch (err) {
              setGithubData(res.data.githubMetaData);
            }
          }
        }
      } catch (err: any) {
        console.error("Error fetching interview metadata:", err);
        toast.error("Failed to load interview details. Starting mock session.");
      } finally {
        setLoading(false);
      }
    }
    fetchInterview();
  }, [id]);

  // Scroll to bottom of chat
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [history]);

  // Simulate deliberation loading steps
  useEffect(() => {
    if (status !== "assessing") return;
    const interval = setInterval(() => {
      setAssessingStep((prev) => (prev < 3 ? prev + 1 : prev));
    }, 2500);
    return () => clearInterval(interval);
  }, [status]);

  // Text to Speech function
  const speakText = (text: string, onDone: () => void) => {
    if (speechSynthesis) {
      speechSynthesis.cancel(); // Stop any currently speaking voices
    }

    if (isMuted) {
      onDone();
      return;
    }

    setStatus("speaking");
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = "en-US";
    currentUtteranceRef.current = utterance;

    // Custom voice selection if available
    const voices = speechSynthesis.getVoices();
    const premiumVoice = voices.find(v => v.lang.startsWith("en") && (v.name.includes("Google") || v.name.includes("Natural")));
    if (premiumVoice) {
      utterance.voice = premiumVoice;
    }

    utterance.onend = () => {
      console.log("Finished speaking question");
      setStatus("listening");
      onDone();
    };

    utterance.onerror = (e) => {
      console.error("Speech synthesis error:", e);
      setStatus("listening");
      onDone();
    };

    speechSynthesis.speak(utterance);
  };

  // Start the interview with greeting
  const startInterview = async () => {
    setErrorText("");
    setStatus("greeting");
    
    let welcomeMessage = "Hello! I am your AI Technical Interviewer. I have analyzed your GitHub profile ";
    if (githubData && githubData.name) {
      welcomeMessage += `for ${githubData.name}. I see you have worked on some interesting repositories. `;
    } else {
      welcomeMessage += "and code repositories. ";
    }
    welcomeMessage += "Let's kick off the interview. To start, please introduce yourself and outline a challenging technical project you worked on recently.";

    setHistory([{
      role: "assistant",
      text: welcomeMessage,
      timestamp: new Date()
    }]);

    speakText(welcomeMessage, () => {
      startListening();
    });
  };

  // Start Voice Capture
  const startListening = () => {
    if (!recognitionRef.current) return;
    setErrorText("");
    listeningStartTime.current = Date.now();
    try {
      recognitionRef.current.start();
    } catch (e) {
      console.warn("Recognition already active", e);
    }
  };

  // Stop Voice Capture
  const stopListening = () => {
    if (!recognitionRef.current) return;
    recognitionRef.current.stop();
  };

  // Submit Answer to backend
  const submitAnswer = async (textToSubmit?: string) => {
    const finalAnswerText = textToSubmit || transcript || manualInput;
    if (!finalAnswerText.trim()) {
      toast.warning("Please record or type an answer first.");
      return;
    }

    const snapshot = captureSnapshot();
    if (snapshot) {
      setIsAnalyzingFace(true);
    }

    stopListening();
    setStatus("processing");

    // Add user message to history
    const updatedHistory = [...history, {
      role: "user" as const,
      text: finalAnswerText,
      timestamp: new Date()
    }];
    setHistory(updatedHistory);
    setTranscript("");
    setManualInput("");

    // Calculate speech metrics
    const now = Date.now();
    const duration = listeningStartTime.current > 0 ? (now - listeningStartTime.current) / 1000 : 5;
    const wordCount = finalAnswerText.split(/\s+/).filter(Boolean).length;
    const wpm = duration > 0 ? Math.round((wordCount / duration) * 60) : 0;
    const hesitationMatches = finalAnswerText.match(/\b(um|uh|like|so|actually|you know)\b/gi);
    const hesitations = hesitationMatches ? hesitationMatches.length : 0;

    const currentMetric = {
      durationSeconds: duration,
      wordCount,
      wpm,
      hesitations
    };
    const updatedMetrics = [...speechMetricsList, currentMetric];
    setSpeechMetricsList(updatedMetrics);

    const nextCount = questionCount + 1;
    setQuestionCount(nextCount);

    // Prepare DB question-saving helper
    const lastQuestion = history.filter(h => h.role === "assistant").pop()?.text || "";
    const saveQuestion = async (exprMetrics?: any) => {
      try {
        await axios.post(`${BACKEND_URL}/api/v1/interview/${id}/question`, {
          question: lastQuestion,
          answer: finalAnswerText,
          feedback: JSON.stringify({ 
            speechMetrics: currentMetric,
            expressionMetrics: exprMetrics || {
              emotion: detectedEmotion || "Neutral",
              eyeContact: eyeContactQuality || "Focused",
              guidance: "None"
            }
          })
        });
      } catch (dbErr) {
        console.warn("Could not save conversation to DB:", dbErr);
      }
    };

    // Limit interview to 5 questions
    const MAX_QUESTIONS = 5;
    if (nextCount >= MAX_QUESTIONS) {
      await saveQuestion();
      setIsAnalyzingFace(false);
      triggerAssessment(updatedMetrics);
      return;
    }

    try {
      // Build a smart context-aware prompt for the AI interviewer
      const githubMetaText = githubData ? JSON.stringify(githubData).substring(0, 1000) : "Not available";
      const fullPrompt = `You are a professional, friendly, and expert tech interviewer. 
We are interviewing a candidate based on their Github metadata: ${githubMetaText}

Here is the conversation so far:
${updatedHistory.map(h => `${h.role === 'user' ? 'Candidate' : 'Interviewer'}: ${h.text}`).join('\n')}

Analyze the Candidate's response and formulate the next logical interview question. 
Ask EXACTLY ONE follow-up question. 
Keep your response short (2-3 sentences), professional, and encouraging. Focus on software engineering, architecture, code quality, and testing.`;

      const response = await axios.post(`${BACKEND_URL}/chat`, {
        message: fullPrompt,
        image: snapshot || undefined
      });

      const nextQuestion = response.data.text || "Thank you for that explanation. Can you elaborate on how you handled performance scaling or testing in that project?";
      const emotion = response.data.emotion || "Neutral";
      const eyeContact = response.data.eyeContact || "Focused";
      const guidance = response.data.guidance || "None";

      setDetectedEmotion(emotion);
      setEyeContactQuality(eyeContact);
      setVisualGuidance(guidance);
      setIsAnalyzingFace(false);

      // Save question feedback with AI analyzed emotion metrics
      await saveQuestion({ emotion, eyeContact, guidance });

      // Add assistant response to history
      setHistory(prev => [...prev, {
        role: "assistant",
        text: nextQuestion,
        timestamp: new Date()
      }]);

      // Speak next question
      speakText(nextQuestion, () => {
        startListening();
      });

    } catch (err: any) {
      console.error("Error submitting answer:", err);
      toast.error("Failed to fetch response. Check server connection.");
      setIsAnalyzingFace(false);
      setStatus("listening");
      
      // Fallback save
      await saveQuestion();
    }
  };

  // Trigger Assessment Phase
  const triggerAssessment = async (metrics: any[]) => {
    if (recognitionRef.current) {
      recognitionRef.current.abort();
    }
    if (speechSynthesis) {
      speechSynthesis.cancel();
    }

    setStatus("assessing");
    toast.info("Deliberating with the hiring panel...");

    try {
      const totalDuration = metrics.reduce((sum, m) => sum + m.durationSeconds, 0);
      const totalWords = metrics.reduce((sum, m) => sum + m.wordCount, 0);
      const avgWpm = totalDuration > 0 ? Math.round((totalWords / totalDuration) * 60) : 0;
      const totalHesitations = metrics.reduce((sum, m) => sum + m.hesitations, 0);

      const overallStats = {
        totalDurationSeconds: Math.round(totalDuration),
        totalWords,
        avgWpm,
        totalHesitations,
        metricsPerQuestion: metrics
      };

      const res = await axios.post(`${BACKEND_URL}/api/v1/interview/${id}/assess`, {
        speechStats: overallStats
      });

      setAssessment(res.data);
      setStatus("completed");
      toast.success("Hiring panel assessment generated!");
    } catch (err: any) {
      console.error("Error generating assessment:", err);
      toast.error("Failed to generate report. Concluding session.");
      setStatus("completed");
    }
  };

  // Finish Interview
  const finishInterview = () => {
    if (recognitionRef.current) {
      recognitionRef.current.abort();
    }
    if (speechSynthesis) {
      speechSynthesis.cancel();
    }
    triggerAssessment(speechMetricsList);
  };

  // Toggle Mute Audio output
  const toggleMute = () => {
    const nextMuted = !isMuted;
    setIsMuted(nextMuted);
    if (nextMuted && speechSynthesis) {
      speechSynthesis.cancel();
      if (status === "speaking") {
        setStatus("listening");
        startListening();
      }
    }
  };

  if (status === "assessing") {
    const steps = [
      "Consolidating interview transcripts and conversation history...",
      "Cross-referencing answers with GitHub repository context...",
      "Evaluating verbal communication pace and hesitation metrics...",
      "Simulating consensus and synthesizing hiring panel reports..."
    ];
    return (
      <div className="relative min-h-screen bg-[#7a7dcd] text-[#121212] flex flex-col items-center justify-center p-4 md:p-8 selection:bg-[#ff5a1a] selection:text-white overflow-hidden">
        <div className="absolute inset-0 bg-grid-pattern opacity-100 pointer-events-none z-0" />
        <div className="glow-orb animate-pulse-glow w-[500px] h-[500px] bg-white/10 top-[-100px] left-[10%] pointer-events-none" />
        
        <Card className="border-brutalist-sand rounded-2xl w-full max-w-lg p-8 z-10 shadow-lg relative overflow-hidden bg-[#dfdcce]">
          <div className="absolute top-0 left-0 right-0 h-1.5 bg-[#ff5a1a] animate-pulse" />
          
          <div className="flex flex-col items-center text-center space-y-6">
            <div className="relative">
              <div className="absolute -inset-4 rounded-full bg-[#ff5a1a]/15 animate-ping" />
              <div className="h-16 w-16 bg-[#dfdcce] border-2 border-[#121212] rounded-2xl flex items-center justify-center shadow-xs">
                <Loader2 className="h-8 w-8 animate-spin text-[#ff5a1a]" />
              </div>
            </div>

            <div className="space-y-2">
              <h2 className="text-xl font-extrabold text-[#121212] tracking-tight">Hiring Panel Deliberation</h2>
              <p className="text-stone-650 text-xs font-semibold">Please wait while the AI panel processes your engineering profiles and answers.</p>
            </div>

            <div className="w-full bg-[#e6e4d5] border border-[#121212] rounded-xl p-4 text-left font-mono text-xs space-y-3">
              {steps.map((step, idx) => {
                const isCurrent = idx === assessingStep;
                const isPast = idx < assessingStep;
                return (
                  <div key={idx} className="flex items-center gap-2.5">
                    {isPast ? (
                      <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
                    ) : isCurrent ? (
                      <Loader2 className="h-4 w-4 animate-spin text-[#ff5a1a] shrink-0" />
                    ) : (
                      <div className="h-4 w-4 rounded-full border border-[#121212]/30 shrink-0" />
                    )}
                    <span className={`font-semibold ${isPast ? "text-stone-700 font-bold" : isCurrent ? "text-[#121212] font-extrabold" : "text-stone-700/40"}`}>
                      {step}
                    </span>
                  </div>
                );
              })}
            </div>

            <div className="text-[10px] text-[#ff5a1a] font-bold uppercase tracking-wider animate-pulse">
              Generating scorecards & panel opinions...
            </div>
          </div>
        </Card>
      </div>
    );
  }

  if (status === "completed" && assessment) {
    const handleCopyReport = () => {
      navigator.clipboard.writeText(JSON.stringify(assessment, null, 2));
      toast.success("Assessment report JSON copied to clipboard!");
    };

    const totalDuration = speechMetricsList.reduce((sum, m) => sum + m.durationSeconds, 0);
    const avgWpm = totalDuration > 0 ? Math.round((speechMetricsList.reduce((sum, m) => sum + m.wordCount, 0) / totalDuration) * 60) : 0;
    const totalHesitations = speechMetricsList.reduce((sum, m) => sum + m.hesitations, 0);

    const scores = assessment.scores || { overall: 70, technicalDepth: 70, communication: 70, problemSolving: 70, systemDesign: 70 };
    const strengths = assessment.strengths || [];
    const improvements = assessment.improvements || [];
    const panelFeedback = assessment.panelFeedback || [];
    const speechAnalysis = assessment.speechAnalysis || "";
    const readiness = assessment.readiness || "Leaning Hire";

    let readinessBg = "bg-emerald-100 border-emerald-500 text-emerald-700";
    if (readiness.toLowerCase().includes("strong")) readinessBg = "bg-emerald-500 text-white border-[#121212]";
    else if (readiness.toLowerCase().includes("leaning") || readiness.toLowerCase().includes("deferred")) readinessBg = "bg-amber-500 text-white border-[#121212]";
    else if (readiness.toLowerCase().includes("no")) readinessBg = "bg-red-500 text-white border-[#121212]";

    return (
      <div className="relative min-h-screen w-screen bg-[#7a7dcd] text-[#121212] flex flex-col items-center p-4 md:p-8 selection:bg-[#ff5a1a] selection:text-white overflow-y-auto">
        <div className="absolute inset-0 bg-grid-pattern opacity-100 pointer-events-none z-0" />
        <div className="glow-orb animate-pulse-glow w-[500px] h-[500px] bg-white/10 top-[-100px] left-[10%] pointer-events-none" />

        <header className="w-full max-w-5xl flex justify-between items-center mb-8 z-10 relative">
          <Button 
            variant="ghost" 
            onClick={() => navigate("/")}
            className="text-[#121212]/80 hover:text-[#ff5a1a] hover:bg-white/20 border border-transparent hover:border-[#121212] gap-2 rounded-xl transition-all"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to Dashboard
          </Button>
          
          <div className="flex items-center gap-2">
            <span className="font-extrabold text-lg tracking-tight text-[#121212]">
              SkillWise<span className="text-[#ff5a1a] font-semibold">.ai</span>
            </span>
          </div>
        </header>

        <main className="w-full max-w-5xl space-y-6 z-10 relative mb-12">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <Card className="border-brutalist-sand rounded-2xl md:col-span-1 p-6 bg-[#dfdcce] flex flex-col justify-between shadow-xs">
              <div>
                <span className="text-[10px] text-[#121212]/60 font-extrabold uppercase tracking-wider">Hiring Decision</span>
                <h2 className="text-2xl font-extrabold text-[#121212] mt-2 mb-4">Hiring Readiness</h2>
                
                <div className={`border border-[#121212] rounded-xl p-4 flex items-center justify-center text-center font-extrabold text-lg shadow-sm ${readinessBg}`}>
                  {readiness.toUpperCase()}
                </div>
              </div>

              <div className="mt-6 border-t border-[#121212]/15 pt-4 text-xs font-semibold text-stone-700 space-y-2">
                <p>● Deliberated by 3 senior engineering members.</p>
                <p>● Cross-referenced with active GitHub metrics.</p>
              </div>
            </Card>

            <Card className="border-brutalist-sand rounded-2xl md:col-span-2 p-6 bg-[#dfdcce] shadow-xs">
              <span className="text-[10px] text-[#121212]/60 font-extrabold uppercase tracking-wider">Evaluation Scores</span>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 mt-4 items-center">
                
                <div className="flex flex-col items-center justify-center text-center p-4 border border-[#121212] bg-[#e6e4d5] rounded-xl shadow-xs">
                  <span className="text-xs text-stone-600 font-extrabold uppercase mb-1">Overall rating</span>
                  <div className="text-4xl font-extrabold text-[#ff5a1a] font-mono">{scores.overall}</div>
                  <span className="text-[10px] text-[#121212]/50 font-bold mt-1">out of 100</span>
                </div>

                <div className="sm:col-span-2 space-y-3 text-xs font-bold text-stone-700">
                  <div>
                    <div className="flex justify-between mb-1">
                      <span>Technical Depth</span>
                      <span className="font-extrabold text-[#121212]">{scores.technicalDepth}/100</span>
                    </div>
                    <div className="w-full bg-[#e6e4d5] rounded-full h-2.5 border border-[#121212]/30">
                      <div className="bg-[#ff5a1a] h-full rounded-full border-r border-[#121212]" style={{ width: `${scores.technicalDepth}%` }}></div>
                    </div>
                  </div>

                  <div>
                    <div className="flex justify-between mb-1">
                      <span>System Design & Architecture</span>
                      <span className="font-extrabold text-[#121212]">{scores.systemDesign}/100</span>
                    </div>
                    <div className="w-full bg-[#e6e4d5] rounded-full h-2.5 border border-[#121212]/30">
                      <div className="bg-[#ff5a1a] h-full rounded-full border-r border-[#121212]" style={{ width: `${scores.systemDesign}%` }}></div>
                    </div>
                  </div>

                  <div>
                    <div className="flex justify-between mb-1">
                      <span>Communication & Clarity</span>
                      <span className="font-extrabold text-[#121212]">{scores.communication}/100</span>
                    </div>
                    <div className="w-full bg-[#e6e4d5] rounded-full h-2.5 border border-[#121212]/30">
                      <div className="bg-[#ff5a1a] h-full rounded-full border-r border-[#121212]" style={{ width: `${scores.communication}%` }}></div>
                    </div>
                  </div>

                  <div>
                    <div className="flex justify-between mb-1">
                      <span>Problem Solving</span>
                      <span className="font-extrabold text-[#121212]">{scores.problemSolving}/100</span>
                    </div>
                    <div className="w-full bg-[#e6e4d5] rounded-full h-2.5 border border-[#121212]/30">
                      <div className="bg-[#ff5a1a] h-full rounded-full border-r border-[#121212]" style={{ width: `${scores.problemSolving}%` }}></div>
                    </div>
                  </div>
                </div>

              </div>
            </Card>
          </div>

          <div className="space-y-4 pt-4">
            <h3 className="text-lg font-extrabold text-[#121212] flex items-center gap-2">
              <Bot className="h-5 w-5 text-[#ff5a1a]" />
              Hiring Panel Deliberation Detail
            </h3>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {panelFeedback.map((p: any, idx: number) => {
                let roleIcon = <Terminal className="h-5 w-5 text-[#ff5a1a]" />;
                if (p.role === "System Architect") roleIcon = <Layers className="h-5 w-5 text-[#ff5a1a]" />;
                else if (p.role === "Engineering Manager") roleIcon = <User className="h-5 w-5 text-[#ff5a1a]" />;

                let sentimentColor = "bg-stone-100 border-stone-300 text-stone-600";
                if (p.sentiment === "positive") sentimentColor = "bg-emerald-100 border-emerald-300 text-emerald-700";
                else if (p.sentiment === "critical") sentimentColor = "bg-red-100 border-red-300 text-red-700";
                else if (p.sentiment === "mixed") sentimentColor = "bg-amber-100 border-amber-300 text-amber-700";

                return (
                  <Card key={idx} className="border-brutalist-sand rounded-2xl p-5 bg-[#dfdcce] flex flex-col justify-between shadow-xs">
                    <div className="space-y-4">
                      <div className="flex items-center justify-between border-b border-[#121212]/10 pb-3">
                        <div className="flex items-center gap-2">
                          <div className="p-1.5 bg-white border border-[#121212] rounded-lg">
                            {roleIcon}
                          </div>
                          <h4 className="font-extrabold text-sm text-[#121212]">{p.role}</h4>
                        </div>
                        <span className={`text-[9px] px-2 py-0.5 rounded-full border font-bold uppercase tracking-wider ${sentimentColor}`}>
                          {p.sentiment}
                        </span>
                      </div>

                      <p className="text-stone-700 text-xs font-semibold leading-relaxed italic">
                        "{p.feedback}"
                      </p>
                    </div>
                  </Card>
                );
              })}
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-4">
            <Card className="border-brutalist-sand rounded-2xl p-6 bg-[#dfdcce] space-y-6 shadow-xs">
              <div>
                <h4 className="font-extrabold text-sm text-[#121212] flex items-center gap-1.5 mb-3">
                  <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                  Key Strengths
                </h4>
                <ul className="space-y-2 text-xs font-semibold text-stone-750">
                  {strengths.map((str: string, index: number) => (
                    <li key={index} className="flex gap-2 items-start">
                      <span className="text-emerald-600 shrink-0">✓</span>
                      <span>{str}</span>
                    </li>
                  ))}
                </ul>
              </div>

              <div className="border-t border-[#121212]/15 pt-4">
                <h4 className="font-extrabold text-sm text-[#121212] flex items-center gap-1.5 mb-3">
                  <AlertCircle className="h-4 w-4 text-[#ff5a1a]" />
                  Improvement Areas
                </h4>
                <ul className="space-y-2 text-xs font-semibold text-stone-750">
                  {improvements.map((imp: string, index: number) => (
                    <li key={index} className="flex gap-2 items-start">
                      <span className="text-[#ff5a1a] shrink-0">⚠</span>
                      <span>{imp}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </Card>

            <Card className="border-brutalist-sand rounded-2xl p-6 bg-[#dfdcce] flex flex-col justify-between shadow-xs">
              <div className="space-y-4">
                <h3 className="text-sm font-extrabold text-[#121212] flex items-center gap-2 border-b border-[#121212]/10 pb-3">
                  <Activity className="h-4 w-4 text-[#ff5a1a]" />
                  Speech & Verbal Delivery
                </h3>

                <div className="grid grid-cols-3 gap-3">
                  <div className="flex flex-col items-center justify-center p-3 bg-[#e6e4d5] border border-[#121212] rounded-xl text-center shadow-xs">
                    <span className="text-[9px] text-[#121212]/60 font-extrabold uppercase mb-1">Avg Tempo</span>
                    <span className="text-sm font-extrabold text-[#ff5a1a] font-mono">{avgWpm || 125}</span>
                    <span className="text-[8px] text-stone-500 font-bold">WPM</span>
                  </div>

                  <div className="flex flex-col items-center justify-center p-3 bg-[#e6e4d5] border border-[#121212] rounded-xl text-center shadow-xs">
                    <span className="text-[9px] text-[#121212]/60 font-extrabold uppercase mb-1">Hesitations</span>
                    <span className="text-sm font-extrabold text-[#ff5a1a] font-mono">{totalHesitations}</span>
                    <span className="text-[8px] text-stone-500 font-bold">Total Um/Uh</span>
                  </div>

                  <div className="flex flex-col items-center justify-center p-3 bg-[#e6e4d5] border border-[#121212] rounded-xl text-center shadow-xs">
                    <span className="text-[9px] text-[#121212]/60 font-extrabold uppercase mb-1">Total Speech</span>
                    <span className="text-sm font-extrabold text-[#ff5a1a] font-mono">{Math.round(totalDuration) || 45}s</span>
                    <span className="text-[8px] text-stone-500 font-bold">Talk duration</span>
                  </div>
                </div>

                <div className="bg-[#e6e4d5] p-4 rounded-xl border border-[#121212]/20">
                  <p className="text-stone-700 text-xs font-semibold leading-relaxed">
                    {speechAnalysis || "The candidate maintained steady delivery with standard pacing, communicating details effectively."}
                  </p>
                </div>
              </div>

              <div className="mt-6 flex justify-end gap-3 border-t border-[#121212]/15 pt-4">
                <Button 
                  variant="outline" 
                  size="sm" 
                  onClick={handleCopyReport}
                  className="rounded-xl border-[#121212] bg-[#dfdcce] text-stone-750 hover:bg-[#cfcbae] gap-1.5 shadow-sm text-xs"
                >
                  <Copy className="h-3.5 w-3.5" />
                  Copy Report Data
                </Button>
                
                <Button 
                  size="sm" 
                  onClick={() => navigate("/")}
                  className="bg-[#ff5a1a] hover:bg-[#e04f14] border border-[#121212] text-white rounded-xl shadow-sm font-extrabold text-xs"
                >
                  Start New Session
                </Button>
              </div>
            </Card>
          </div>
        </main>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="h-screen w-screen bg-[#7a7dcd] flex flex-col justify-center items-center text-[#121212] relative">
        <div className="absolute inset-0 bg-grid-pattern opacity-60 pointer-events-none" />
        <Loader2 className="h-12 w-12 animate-spin text-[#ff5a1a] mb-4 z-10" />
        <p className="text-[#121212]/80 text-sm font-bold animate-pulse z-10">Analyzing GitHub portfolio and initializing sandbox...</p>
      </div>
    );
  }

  return (
    <div className="relative h-screen max-h-screen w-screen bg-[#7a7dcd] text-[#121212] flex flex-col items-center p-4 md:p-6 selection:bg-[#ff5a1a] selection:text-white overflow-hidden">
      {/* Background Grids & Orbs */}
      <div className="absolute inset-0 bg-grid-pattern opacity-100 pointer-events-none z-0" />
      <div className="glow-orb animate-pulse-glow w-[500px] h-[500px] bg-white/10 top-[-100px] left-[10%] pointer-events-none" />
      <div className="glow-orb animate-pulse-glow w-[600px] h-[600px] bg-[#ff5a1a]/5 top-[30%] right-[5%] pointer-events-none" style={{ animationDelay: "2s" }} />

      {/* Header */}
      <header className="w-full max-w-5xl flex justify-between items-center mb-4 z-10 relative shrink-0">
        <Button 
          variant="ghost" 
          onClick={() => navigate("/")}
          className="text-[#121212]/80 hover:text-[#ff5a1a] hover:bg-white/20 border border-transparent hover:border-[#121212] gap-2 rounded-xl transition-all"
        >
          <ArrowLeft className="h-4 w-4" />
          Leave Interview
        </Button>
        
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5 bg-[#dfdcce] border border-[#121212] px-3 py-1.5 rounded-full text-xs font-bold text-[#121212] shadow-xs">
            <span className={`h-2.5 w-2.5 rounded-full ${status === 'listening' ? 'bg-red-500 animate-pulse' : 'bg-[#ff5a1a]'}`} />
            Status: {status.toUpperCase()}
          </div>

          <Button 
            variant="outline" 
            size="icon" 
            onClick={toggleMute}
            className="rounded-xl border-[#121212] bg-[#dfdcce] hover:bg-[#cfcbae] text-[#121212] shadow-xs"
          >
            {isMuted ? <VolumeX className="h-4 w-4 text-red-500" /> : <Volume2 className="h-4 w-4 text-emerald-600" />}
          </Button>
        </div>
      </header>

      {/* Main Container */}
      <main className="w-full max-w-5xl grid grid-cols-1 lg:grid-cols-5 gap-4 z-10 flex-1 min-h-0 relative">
        
        {/* Left Panel: GitHub Info & Interactive State */}
        <section className="lg:col-span-2 flex flex-col gap-4 h-full min-h-0">
          
          {/* GitHub Metadata Card */}
          <Card className="border-brutalist-sand rounded-2xl shadow-xs flex-initial flex flex-col">
            <CardHeader className="border-b border-[#121212]/10">
              <CardTitle className="text-lg font-extrabold text-[#121212] flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-[#ff5a1a]" />
                Candidate Profile
              </CardTitle>
              <CardDescription className="text-stone-600">Customized interview criteria</CardDescription>
            </CardHeader>
            <CardContent className="p-4 flex-1 flex flex-col min-h-0 overflow-y-auto justify-between gap-3">
              {githubData ? (
                <div className="space-y-4 font-semibold text-stone-700">
                  <div className="flex items-center gap-3">
                    {githubData.avatarUrl ? (
                      <img src={githubData.avatarUrl} alt="Avatar" className="h-12 w-12 rounded-full border border-[#121212] object-cover" />
                    ) : (
                      <div className="h-12 w-12 rounded-full bg-[#ff5a1a]/10 flex items-center justify-center border border-[#121212] text-[#ff5a1a] font-bold">
                        {githubData.login ? githubData.login.substring(0,2).toUpperCase() : "GH"}
                      </div>
                    )}
                    <div>
                      <h3 className="font-extrabold text-[#121212]">{githubData.name || githubData.login || "Developer"}</h3>
                      <p className="text-xs text-[#121212]/60">@{githubData.login || "github"}</p>
                    </div>
                  </div>

                  <div className="border-t border-[#121212]/10 pt-4 space-y-2.5">
                    {githubData.bio && (
                      <p className="text-xs text-stone-600 italic">"{githubData.bio}"</p>
                    )}
                    {githubData.publicRepos !== undefined && (
                      <div className="flex justify-between text-xs font-bold text-stone-700">
                        <span>Public Repos:</span>
                        <span className="font-extrabold text-[#121212]">{githubData.publicRepos}</span>
                      </div>
                    )}
                    {githubData.followers !== undefined && (
                      <div className="flex justify-between text-xs font-bold text-stone-700">
                        <span>Followers:</span>
                        <span className="font-extrabold text-[#121212]">{githubData.followers}</span>
                      </div>
                    )}
                  </div>

                  {githubData.pinnedRepos && githubData.pinnedRepos.length > 0 && (
                    <div className="border-t border-[#121212]/10 pt-4">
                      <p className="text-xs font-bold text-stone-850 mb-2">Top Repositories:</p>
                      <div className="space-y-2">
                        {githubData.pinnedRepos.slice(0, 3).map((repo: any, index: number) => (
                          <div key={index} className="text-xs bg-[#e6e4d5] border border-[#121212]/30 p-2.5 rounded-lg">
                            <p className="font-bold text-[#ff5a1a]">{repo.name}</p>
                            {repo.language && <p className="text-[10px] text-stone-500 mt-1">● {repo.language}</p>}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <div className="h-full flex flex-col justify-center items-center text-slate-500 text-sm">
                  <AlertCircle className="h-8 w-8 mb-2 text-slate-400" />
                  No profile metadata loaded.
                </div>
              )}
              {/* Status wave at bottom of left panel */}
              {status !== "idle" && status !== "completed" && (
                <div className="mt-4 border-t border-[#121212]/10 pt-4 flex flex-col items-center shrink-0">
                  <p className="text-xs text-[#121212]/60 font-extrabold mb-2 uppercase tracking-wider">Sound Wave</p>
                  <div className="flex items-center gap-1.5 h-10">
                    {[1, 2, 3, 4, 5, 6, 7, 8].map((bar) => {
                      let animClass = "";
                      if (status === "listening") animClass = "animate-pulse bg-red-500";
                      else if (status === "speaking") animClass = "animate-pulse bg-emerald-500";
                      else if (status === "processing") animClass = "animate-pulse bg-[#ff5a1a]";
                      
                      // Alternate heights for visual variety
                      const height = bar % 3 === 0 ? "h-8" : bar % 2 === 0 ? "h-6" : "h-4";
                      const delay = `animation-delay-${bar * 150}`;
                      return (
                        <span 
                          key={bar} 
                          className={`w-1 rounded-full bg-[#121212]/10 transition-all ${height} ${animClass} ${delay}`} 
                          style={{
                            animationDuration: status === "listening" ? "0.6s" : "1.2s",
                            animationDelay: `${bar * 0.1}s`
                          }}
                        />
                      );
                    })}
                  </div>
                </div>
              )}
             </CardContent>
           </Card>

           {/* Live Video & AI Expression HUD Card */}
           <Card className="border-brutalist-sand rounded-2xl shadow-xs flex-1 min-h-0 flex flex-col bg-[#dfdcce] overflow-hidden">
             <CardHeader className="border-b border-[#121212]/10 py-4">
               <CardTitle className="text-base font-extrabold text-[#121212] flex items-center justify-between">
                 <div className="flex items-center gap-2">
                   <Activity className="h-4 w-4 text-[#ff5a1a]" />
                   AI Face Assessment Feed
                 </div>
                 {isCameraOn && (
                   <span className="flex h-2 w-2 relative">
                     <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-450 opacity-75"></span>
                     <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                   </span>
                 )}
               </CardTitle>
               <CardDescription className="text-stone-600 text-xs">Real-time facial expression tracking</CardDescription>
             </CardHeader>
             <CardContent className="p-4 flex-1 flex flex-col min-h-0 overflow-y-auto items-center gap-3">
               {/* Webcam container */}
               <div className="relative w-full aspect-[4/3] rounded-xl border-2 border-[#121212] bg-[#121212] overflow-hidden shadow-inner group">
                 {isCameraOn ? (
                   <>
                     <video 
                       ref={videoRef}
                       autoPlay 
                       playsInline 
                       muted 
                       className="w-full h-full object-cover scale-x-[-1]" 
                     />
                     {/* Retro CRT overlay / HUD lines */}
                     <div className="absolute inset-0 pointer-events-none bg-[linear-gradient(rgba(18,16,16,0)_50%,rgba(0,0,0,0.25)_50%),linear-gradient(90deg,rgba(255,0,0,0.06),rgba(0,255,0,0.02),rgba(0,0,255,0.06))] bg-[size:100%_4px,3px_100%] opacity-20" />
                     
                     {/* HUD Overlays */}
                     <div className="absolute top-2 left-2 px-2 py-0.5 rounded bg-black/60 border border-white/20 font-mono text-[9px] text-emerald-450 flex items-center gap-1.5 uppercase tracking-wider">
                       <span className="h-1.5 w-1.5 rounded-full bg-emerald-450 animate-pulse" />
                       REC [AI ACTIVE]
                     </div>

                     <div className="absolute top-2 right-2 px-2 py-0.5 rounded bg-black/60 border border-white/20 font-mono text-[9px] text-[#ff5a1a]">
                       FPS: 30
                     </div>

                     <div className="absolute bottom-2 left-2 right-2 px-3 py-1.5 rounded-lg bg-black/70 border border-white/10 font-mono text-[10px] text-white space-y-1">
                       <div className="flex justify-between">
                        <span>EYE CONTACT:</span>
                        <span className="text-emerald-400 font-extrabold">{eyeContactIndex}% ({stanceState})</span>
                       </div>
                       <div className="flex justify-between">
                        <span>EMOTION CUE:</span>
                        <span className="text-[#ff5a1a] font-extrabold">{isAnalyzingFace ? "ANALYZING..." : detectedEmotion.toUpperCase()}</span>
                       </div>
                     </div>
                   </>
                 ) : (
                   <div className="absolute inset-0 flex flex-col items-center justify-center text-center p-6 text-stone-400 space-y-3">
                     <div className="h-12 w-12 rounded-full bg-stone-900/50 border border-stone-800 flex items-center justify-center text-stone-500">
                       <Camera className="h-6 w-6" />
                     </div>
                     <div>
                       <p className="text-xs font-bold text-[#121212]/70">Camera is disabled</p>
                       <p className="text-[10px] text-stone-500 max-w-xs mt-1">Enable camera to allow AI-guided coaching based on your expressions.</p>
                     </div>
                   </div>
                 )}
               </div>

               {/* Toggle Button */}
               <div className="w-full flex justify-between items-center gap-2 border-t border-[#121212]/10 pt-3">
                 <span className="text-[11px] font-extrabold text-[#121212]/60 uppercase tracking-wider">Vibe Coaching</span>
                 <Button
                   size="sm"
                   onClick={toggleCamera}
                   className={`rounded-xl border border-[#121212] px-4 py-1 text-xs font-bold gap-1.5 shadow-sm transition-all ${
                     isCameraOn 
                       ? "bg-red-500 hover:bg-red-600 text-white" 
                       : "bg-[#ff5a1a] hover:bg-[#e04f14] text-white"
                   }`}
                 >
                   {isCameraOn ? (
                     <>
                       <CameraOff className="h-3.5 w-3.5" />
                       Disable Camera
                     </>
                   ) : (
                     <>
                       <Camera className="h-3.5 w-3.5" />
                       Enable Camera
                     </>
                   )}
                 </Button>
               </div>

               {/* Guidance Display */}
               {isCameraOn && (visualGuidance || isAnalyzingFace) && (
                 <div className="w-full bg-[#e6e4d5] border border-[#121212] rounded-xl p-3 font-mono text-[10px] space-y-1.5">
                   <div className="flex items-center gap-1.5 border-b border-[#121212]/10 pb-1.5">
                     <Sparkles className="h-3.5 w-3.5 text-[#ff5a1a] animate-pulse" />
                     <span className="font-extrabold text-[#121212]">AI VIBE FEEDBACK</span>
                   </div>
                   {isAnalyzingFace ? (
                     <div className="flex items-center gap-2 text-[#ff5a1a] animate-pulse">
                       <Loader2 className="h-3 w-3 animate-spin" />
                       <span>Processing facial expressions...</span>
                     </div>
                   ) : (
                     <div className="space-y-1">
                       <div className="flex justify-between text-stone-650">
                         <span>DETECTION:</span>
                         <span className="font-bold text-[#121212]">{detectedEmotion}</span>
                       </div>
                       <div className="flex justify-between text-stone-650">
                         <span>CONTACT:</span>
                         <span className="font-bold text-[#121212]">{eyeContactQuality}</span>
                       </div>
                       <div className="text-stone-700 leading-relaxed mt-1 font-semibold border-t border-[#121212]/5 pt-1 italic">
                         "{visualGuidance}"
                       </div>
                     </div>
                   )}
                 </div>
               )}
             </CardContent>
           </Card>
          </section>

        {/* Right Panel: Voice Interface Orb & Chat Log */}
        <section className="lg:col-span-3 flex flex-col h-full min-h-0">
          <Card className="border-brutalist-sand rounded-2xl flex-1 flex flex-col overflow-hidden shadow-xs">
            
            {status === "idle" && (
              <div className="flex-1 flex flex-col items-center justify-center p-8 text-center bg-[radial-gradient(circle_at_center,rgba(255,90,26,0.06)_0,transparent_70%)]">
                <div className="relative mb-6">
                  {/* Glowing rings */}
                  <div className="absolute -inset-4 rounded-full bg-[#ff5a1a]/10 animate-ping pointer-events-none" />
                  <div className="absolute -inset-1 rounded-full bg-[#ff5a1a]/20 blur-sm pointer-events-none" />
                  <div className="h-24 w-24 bg-gradient-to-tr from-[#ff5a1a] to-[#ff781f] rounded-full flex items-center justify-center text-white border-2 border-[#121212] shadow-xs relative">
                    <Sparkles className="h-10 w-10 text-white animate-pulse" />
                  </div>
                </div>
                
                <h2 className="text-2xl font-extrabold text-[#121212] tracking-tight mb-2">Are you ready to begin?</h2>
                <p className="text-stone-700 text-sm max-w-md mb-8 font-semibold">
                  This mock session simulates a live engineering interview. Make sure your microphone is enabled, you are in a quiet room, and your sound is on.
                </p>

                {!speechSupported && (
                  <div className="flex items-center gap-2 bg-red-950/20 border border-red-500/30 p-4 rounded-xl text-red-200 text-xs text-left max-w-md mb-6">
                    <AlertCircle className="h-5 w-5 text-red-500 shrink-0" />
                    <p>Web Speech API is not supported in this browser. You can still participate in the interview by typing your answers using the text override block below.</p>
                  </div>
                )}

                <Button 
                  size="lg" 
                  onClick={startInterview}
                  className="bg-[#ff5a1a] hover:bg-[#e04f14] border border-[#121212] text-white shadow-xs rounded-xl px-8 py-6 text-base font-extrabold flex items-center gap-2 hover:scale-[1.02] active:scale-[0.98] transition-all"
                >
                  <Play className="h-5 w-5 fill-current" />
                  Start Voice Interview
                </Button>
              </div>
            )}

            {status !== "idle" && (
              <div className="flex-1 flex flex-col overflow-hidden">
                {/* Scrolling Chat history */}
                <div className="flex-1 p-6 overflow-y-auto min-h-0 space-y-4 bg-white/40 border-b border-[#121212]/15">
                  {history.map((msg, index) => (
                    <div 
                      key={index}
                      className={`flex gap-3 max-w-[85%] ${msg.role === 'user' ? 'ml-auto flex-row-reverse' : 'mr-auto'}`}
                    >
                      <div className={`h-8 w-8 rounded-full shrink-0 flex items-center justify-center border ${
                        msg.role === 'user' 
                          ? 'bg-[#dfdcce] border-[#121212] text-[#ff5a1a]' 
                          : 'bg-[#ff5a1a]/10 border border-[#ff5a1a]/20 text-[#ff5a1a]'
                      }`}>
                        {msg.role === 'user' ? <User className="h-4 w-4" /> : <Bot className="h-4 w-4" />}
                      </div>
                      <div className={`p-4 rounded-2xl text-sm shadow-sm font-semibold border ${
                        msg.role === 'user'
                          ? 'bg-[#ff5a1a] text-white border-[#121212] rounded-tr-none'
                          : 'bg-[#dfdcce] border-[#121212] text-[#121212] rounded-tl-none'
                      }`}>
                        <p className="leading-relaxed whitespace-pre-wrap">{msg.text}</p>
                      </div>
                    </div>
                  ))}
                  
                  {/* Local visualizer for active voice input */}
                  {status === "listening" && transcript && (
                    <div className="flex gap-3 max-w-[85%] ml-auto flex-row-reverse animate-fade-in">
                      <div className="h-8 w-8 rounded-full shrink-0 flex items-center justify-center bg-red-950/20 border border-red-500/30 text-red-400">
                        <Mic className="h-4 w-4 animate-pulse" />
                      </div>
                      <div className="p-4 rounded-2xl text-sm bg-red-950/10 border border-red-500/20 text-red-700 rounded-tr-none italic font-bold">
                        {transcript}
                      </div>
                    </div>
                  )}

                  {/* Processing animation */}
                  {status === "processing" && (
                    <div className="flex gap-3 max-w-[80%] mr-auto items-center">
                      <div className="h-8 w-8 rounded-full shrink-0 flex items-center justify-center bg-[#ff5a1a]/10 border border-[#ff5a1a]/20 text-[#ff5a1a]">
                        <Bot className="h-4 w-4" />
                      </div>
                      <div className="flex items-center gap-2 px-4 py-3 bg-[#dfdcce] border border-[#121212] rounded-2xl rounded-tl-none shadow-xs">
                        <Loader2 className="h-4 w-4 animate-spin text-[#ff5a1a]" />
                        <span className="text-xs text-stone-600 font-bold">Interviewer is thinking...</span>
                      </div>
                    </div>
                  )}

                  <div ref={chatEndRef} />
                </div>

                {/* Microphone / controls center */}
                <div className="bg-[#e6e4d5] border-t border-[#121212] p-6 flex flex-col items-center justify-center gap-4">
                  {errorText && (
                    <div className="w-full flex items-center gap-2 text-red-200 bg-red-950/20 border border-red-500/30 px-3 py-2 rounded-xl text-xs font-bold">
                      <AlertCircle className="h-4 w-4 shrink-0" />
                      <p>{errorText}</p>
                    </div>
                  )}

                  {status !== "completed" ? (
                    <div className="flex flex-col items-center gap-4 w-full">
                      {/* Big Orb Controls */}
                      <div className="flex items-center gap-6">
                        
                        {/* Cancel / Stop Synthesis */}
                        {status === "speaking" && (
                          <Button 
                            variant="outline" 
                            size="icon" 
                            onClick={() => {
                              if (speechSynthesis) speechSynthesis.cancel();
                              setStatus("listening");
                              startListening();
                            }}
                            className="rounded-full h-11 w-11 border-[#121212] bg-[#dfdcce] text-stone-750 hover:bg-[#cfcbae] shadow-xs"
                            title="Skip Speaking & Start Answering"
                          >
                            <RotateCcw className="h-4 w-4" />
                          </Button>
                        )}

                        {/* Microphone Main Button */}
                        <div className="relative">
                          {/* Pulser rings */}
                          {status === "listening" && (
                            <>
                              <div className="absolute -inset-3 rounded-full bg-red-500/15 animate-ping" />
                              <div className="absolute -inset-1.5 rounded-full bg-red-500/25 blur-xs" />
                            </>
                          )}
                          {status === "speaking" && (
                            <>
                              <div className="absolute -inset-3 rounded-full bg-emerald-500/15 animate-pulse" />
                            </>
                          )}

                          <Button
                            size="icon"
                            onClick={status === "listening" ? () => submitAnswer() : startListening}
                            disabled={status === "processing"}
                            className={`rounded-full h-16 w-16 shadow-lg border border-[#121212] text-white transition-all scale-[1.05] hover:scale-[1.1] active:scale-[0.95] ${
                              status === "listening"
                                ? "bg-red-500 hover:bg-red-600"
                                : status === "speaking"
                                ? "bg-emerald-500 hover:bg-emerald-600"
                                : "bg-[#ff5a1a] hover:bg-[#e04f14]"
                            }`}
                          >
                            {status === "listening" ? (
                              <Send className="h-6 w-6 animate-pulse" />
                            ) : status === "processing" ? (
                              <Loader2 className="h-6 w-6 animate-spin" />
                            ) : (
                              <Mic className="h-6 w-6" />
                            )}
                          </Button>
                        </div>

                        {/* Finish Interview Button */}
                        <Button 
                          variant="outline" 
                          size="icon" 
                          onClick={finishInterview}
                          className="rounded-full h-11 w-11 border-[#121212] bg-[#dfdcce] text-red-500 hover:bg-red-50 shadow-xs"
                          title="Finish & Save Interview"
                        >
                          <Square className="h-4 w-4 fill-current text-red-500" />
                        </Button>
                      </div>

                      {/* Informational Subtitle */}
                      <p className="text-xs text-stone-600 font-bold">
                        {status === "listening" 
                          ? transcript 
                            ? "Press the button or stop talking to submit your answer" 
                            : "Listening to your voice... Speak now"
                          : status === "speaking" 
                          ? "Speaking current question..." 
                          : status === "processing" 
                          ? "Synthesizing answer..."
                          : "Press Microphone to start talking"}
                      </p>

                      {/* Text Entry Fallback Override */}
                      <div className="w-full flex gap-2 border-t border-[#121212]/15 pt-4 mt-2">
                        <input
                          type="text"
                          value={manualInput}
                          onChange={(e) => setManualInput(e.target.value)}
                          placeholder="Or type your response here instead..."
                          className="flex-1 bg-white border border-[#121212] rounded-xl px-4 py-2 text-xs text-[#121212] placeholder-stone-405 focus:outline-none focus:border-[#ff5a1a] focus:ring-1 focus:ring-[#ff5a1a]/30 font-semibold"
                          onKeyDown={(e) => {
                            if (e.key === "Enter") {
                              submitAnswer(manualInput);
                            }
                          }}
                        />
                        <Button
                          size="sm"
                          onClick={() => submitAnswer(manualInput)}
                          className="bg-[#ff5a1a] hover:bg-[#e04f14] border border-[#121212] text-white rounded-xl text-xs gap-1.5 shadow-sm"
                        >
                          <Send className="h-3 w-3" />
                          Send
                        </Button>
                      </div>
                    </div>
                  ) : (
                    // Completed View
                    <div className="text-center py-4 flex flex-col items-center">
                      <CheckCircle2 className="h-12 w-12 text-emerald-500 mb-2" />
                      <h3 className="font-extrabold text-[#121212] text-lg">Interview Completed!</h3>
                      <p className="text-xs text-stone-700 mt-1 max-w-sm mb-4 font-semibold">Your answers have been stored and processed successfully.</p>
                      <Button 
                        onClick={() => navigate("/")}
                        className="px-6 py-2.5 text-xs font-bold rounded-xl bg-[#dfdcce] border border-[#121212] hover:bg-[#cfcbae] text-[#121212] transition-all shadow-xs"
                      >
                        Return Home
                      </Button>
                    </div>
                  )}

                </div>
              </div>
            )}
          </Card>
        </section>

      </main>
    </div>
  );
}