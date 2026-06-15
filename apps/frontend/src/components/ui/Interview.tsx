import { useState, useEffect, useRef } from "react";
import { useParams, useNavigate } from "react-router";
import axios from "axios";
import { BACKEND_URL } from "@/lib/config";
import { Button } from "./button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "./card";
import { 
  Mic, MicOff, Volume2, VolumeX, AlertCircle, Play, Square, Sparkles, 
  ArrowLeft, CheckCircle2, User, Bot, Loader2, Send, RotateCcw
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
  const [status, setStatus] = useState<"idle" | "greeting" | "listening" | "processing" | "speaking" | "completed">("idle");
  const [history, setHistory] = useState<QuestionLog[]>([]);
  const [transcript, setTranscript] = useState("");
  const [isMuted, setIsMuted] = useState(false);
  const [speechSupported, setSpeechSupported] = useState(true);
  const [errorText, setErrorText] = useState("");
  const [manualInput, setManualInput] = useState("");

  // Refs for speech recognition and synthesis
  const recognitionRef = useRef<any>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const currentUtteranceRef = useRef<SpeechSynthesisUtterance | null>(null);

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
    };
  }, []);

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
        message: fullPrompt
      });

      const nextQuestion = response.data.text || "Thank you for that explanation. Can you elaborate on how you handled performance scaling or testing in that project?";

      // Save the question & answer to database in background
      try {
        const lastQuestion = updatedHistory.filter(h => h.role === "assistant").pop()?.text || "";
        await axios.post(`${BACKEND_URL}/api/v1/interview/${id}/question`, {
          question: lastQuestion,
          answer: finalAnswerText,
          feedback: "Saved interaction"
        });
      } catch (dbErr) {
        console.warn("Could not save conversation to DB:", dbErr);
      }

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
      setStatus("listening");
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
    setStatus("completed");
    toast.success("Interview completed successfully!");
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

  if (loading) {
    return (
      <div className="h-screen w-screen bg-[#030014] flex flex-col justify-center items-center text-white relative">
        <div className="absolute inset-0 bg-grid-pattern opacity-60 pointer-events-none" />
        <Loader2 className="h-12 w-12 animate-spin text-purple-500 mb-4 z-10" />
        <p className="text-slate-400 text-sm font-semibold animate-pulse z-10">Analyzing GitHub portfolio and initializing sandbox...</p>
      </div>
    );
  }

  return (
    <div className="relative min-h-screen bg-[#030014] text-slate-100 flex flex-col items-center p-4 md:p-8 selection:bg-purple-600 selection:text-white overflow-hidden">
      {/* Background Grids & Orbs */}
      <div className="absolute inset-0 bg-grid-pattern opacity-100 pointer-events-none z-0" />
      <div className="glow-orb animate-pulse-glow w-[500px] h-[500px] bg-purple-900/10 top-[-100px] left-[10%] pointer-events-none" />
      <div className="glow-orb animate-pulse-glow w-[600px] h-[600px] bg-indigo-900/5 top-[30%] right-[5%] pointer-events-none" style={{ animationDelay: "2s" }} />

      {/* Header */}
      <header className="w-full max-w-5xl flex justify-between items-center mb-6 z-10 relative">
        <Button 
          variant="ghost" 
          onClick={() => navigate("/")}
          className="text-slate-400 hover:text-white hover:bg-purple-950/40 border border-transparent hover:border-purple-800/30 gap-2 rounded-xl transition-all"
        >
          <ArrowLeft className="h-4 w-4" />
          Leave Interview
        </Button>
        
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5 bg-[#0b081b] border border-purple-950/60 px-3 py-1.5 rounded-full text-xs font-semibold text-slate-400">
            <span className={`h-2.5 w-2.5 rounded-full ${status === 'listening' ? 'bg-red-500 animate-pulse' : 'bg-purple-500'}`} />
            Status: {status.toUpperCase()}
          </div>

          <Button 
            variant="outline" 
            size="icon" 
            onClick={toggleMute}
            className="rounded-xl border-purple-950/60 hover:bg-purple-950/30 text-slate-300"
          >
            {isMuted ? <VolumeX className="h-4 w-4 text-red-400" /> : <Volume2 className="h-4 w-4 text-emerald-400" />}
          </Button>
        </div>
      </header>

      {/* Main Container */}
      <main className="w-full max-w-5xl grid grid-cols-1 lg:grid-cols-3 gap-6 z-10 flex-1 relative">
        
        {/* Left Panel: GitHub Info & Interactive State */}
        <section className="lg:col-span-1 flex flex-col gap-6">
          
          {/* GitHub Metadata Card */}
          <Card className="bg-[#0b081b]/70 border-purple-950/70 border-glow-violet backdrop-blur-xl rounded-2xl shadow-2xl flex-1 flex flex-col">
            <CardHeader className="border-b border-purple-950/40">
              <CardTitle className="text-lg font-bold text-white flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-purple-400" />
                Candidate Profile
              </CardTitle>
              <CardDescription className="text-slate-400">Customized interview criteria</CardDescription>
            </CardHeader>
            <CardContent className="py-6 flex-1 flex flex-col justify-between">
              {githubData ? (
                <div className="space-y-4">
                  <div className="flex items-center gap-3">
                    {githubData.avatarUrl ? (
                      <img src={githubData.avatarUrl} alt="Avatar" className="h-12 w-12 rounded-full border border-purple-950 object-cover" />
                    ) : (
                      <div className="h-12 w-12 rounded-full bg-purple-900/30 flex items-center justify-center border border-purple-700/50 text-purple-300 font-bold">
                        {githubData.login ? githubData.login.substring(0,2).toUpperCase() : "GH"}
                      </div>
                    )}
                    <div>
                      <h3 className="font-semibold text-white">{githubData.name || githubData.login || "Developer"}</h3>
                      <p className="text-xs text-slate-450">@{githubData.login || "github"}</p>
                    </div>
                  </div>

                  <div className="border-t border-purple-950/40 pt-4 space-y-2.5">
                    {githubData.bio && (
                      <p className="text-xs text-slate-400 italic">"{githubData.bio}"</p>
                    )}
                    {githubData.publicRepos !== undefined && (
                      <div className="flex justify-between text-xs text-slate-355">
                        <span>Public Repos:</span>
                        <span className="font-semibold text-white">{githubData.publicRepos}</span>
                      </div>
                    )}
                    {githubData.followers !== undefined && (
                      <div className="flex justify-between text-xs text-slate-355">
                        <span>Followers:</span>
                        <span className="font-semibold text-white">{githubData.followers}</span>
                      </div>
                    )}
                  </div>

                  {githubData.pinnedRepos && githubData.pinnedRepos.length > 0 && (
                    <div className="border-t border-purple-950/40 pt-4">
                      <p className="text-xs font-semibold text-slate-300 mb-2">Top Repositories:</p>
                      <div className="space-y-2">
                        {githubData.pinnedRepos.slice(0, 3).map((repo: any, index: number) => (
                          <div key={index} className="text-xs bg-[#04010b] border border-purple-950/60 p-2.5 rounded-lg">
                            <p className="font-medium text-purple-300">{repo.name}</p>
                            {repo.language && <p className="text-[10px] text-slate-500 mt-1">● {repo.language}</p>}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <div className="h-full flex flex-col justify-center items-center text-slate-500 text-sm">
                  <AlertCircle className="h-8 w-8 mb-2 text-slate-600" />
                  No profile metadata loaded.
                </div>
              )}

              {/* Status wave at bottom of left panel */}
              {status !== "idle" && status !== "completed" && (
                <div className="mt-8 border-t border-purple-950/40 pt-6 flex flex-col items-center">
                  <p className="text-xs text-slate-500 font-semibold mb-4 uppercase tracking-wider">Sound Wave</p>
                  <div className="flex items-center gap-1.5 h-10">
                    {[1, 2, 3, 4, 5, 6, 7, 8].map((bar) => {
                      let animClass = "";
                      if (status === "listening") animClass = "animate-pulse bg-red-500";
                      else if (status === "speaking") animClass = "animate-pulse bg-emerald-500";
                      else if (status === "processing") animClass = "animate-pulse bg-purple-500";
                      
                      // Alternate heights for visual variety
                      const height = bar % 3 === 0 ? "h-8" : bar % 2 === 0 ? "h-6" : "h-4";
                      const delay = `animation-delay-${bar * 150}`;
                      return (
                        <span 
                          key={bar} 
                          className={`w-1 rounded-full bg-purple-950 transition-all ${height} ${animClass} ${delay}`} 
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
        </section>

        {/* Right Panel: Voice Interface Orb & Chat Log */}
        <section className="lg:col-span-2 flex flex-col gap-6 min-h-[500px]">
          
          {/* Main Visualizer or Chat Card */}
          <Card className="bg-[#0b081b]/70 border-purple-950/70 border-glow-violet backdrop-blur-xl rounded-2xl flex-1 flex flex-col overflow-hidden shadow-2xl">
            
            {status === "idle" && (
              <div className="flex-1 flex flex-col items-center justify-center p-8 text-center bg-[radial-gradient(circle_at_center,rgba(168,85,247,0.08)_0,transparent_70%)]">
                <div className="relative mb-6">
                  {/* Glowing rings */}
                  <div className="absolute -inset-4 rounded-full bg-purple-500/10 animate-ping pointer-events-none" />
                  <div className="absolute -inset-1 rounded-full bg-purple-500/20 blur-sm pointer-events-none" />
                  <div className="h-24 w-24 bg-gradient-to-tr from-purple-500 to-indigo-600 rounded-full flex items-center justify-center text-white border-2 border-purple-400 shadow-2xl relative">
                    <Sparkles className="h-10 w-10 text-white animate-pulse" />
                  </div>
                </div>
                
                <h2 className="text-2xl font-extrabold text-white tracking-tight mb-2">Are you ready to begin?</h2>
                <p className="text-slate-400 text-sm max-w-md mb-8">
                  This mock session simulates a live engineering interview. Make sure your microphone is enabled, you are in a quiet room, and your sound is on.
                </p>

                {!speechSupported && (
                  <div className="flex items-center gap-2 bg-red-955/50 border border-red-900/50 p-4 rounded-xl text-red-300 text-xs text-left max-w-md mb-6">
                    <AlertCircle className="h-5 w-5 text-red-400 shrink-0" />
                    <p>Web Speech API is not supported in this browser. You can still participate in the interview by typing your answers using the text override block below.</p>
                  </div>
                )}

                <Button 
                  size="lg" 
                  onClick={startInterview}
                  className="bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white shadow-lg shadow-purple-600/30 rounded-xl px-8 py-6 text-base font-bold flex items-center gap-2 hover:scale-[1.02] active:scale-[0.98] transition-all"
                >
                  <Play className="h-5 w-5 fill-current" />
                  Start Voice Interview
                </Button>
              </div>
            )}

            {status !== "idle" && (
              <div className="flex-1 flex flex-col overflow-hidden">
                {/* Scrolling Chat history */}
                <div className="flex-1 p-6 overflow-y-auto space-y-4 max-h-[380px]">
                  {history.map((msg, index) => (
                    <div 
                      key={index}
                      className={`flex gap-3 max-w-[85%] ${msg.role === 'user' ? 'ml-auto flex-row-reverse' : 'mr-auto'}`}
                    >
                      <div className={`h-8 w-8 rounded-full shrink-0 flex items-center justify-center border ${
                        msg.role === 'user' 
                          ? 'bg-slate-800 border-slate-700 text-slate-300' 
                          : 'bg-purple-955/80 border-purple-800 text-purple-300'
                      }`}>
                        {msg.role === 'user' ? <User className="h-4 w-4" /> : <Bot className="h-4 w-4" />}
                      </div>
                      <div className={`p-4 rounded-2xl text-sm shadow-sm ${
                        msg.role === 'user'
                          ? 'bg-gradient-to-r from-purple-600 to-indigo-600 text-white rounded-tr-none'
                          : 'bg-[#0f0a21]/60 border border-purple-950/50 text-slate-200 rounded-tl-none'
                      }`}>
                        <p className="leading-relaxed whitespace-pre-wrap">{msg.text}</p>
                      </div>
                    </div>
                  ))}
                  
                  {/* Local visualizer for active voice input */}
                  {status === "listening" && transcript && (
                    <div className="flex gap-3 max-w-[85%] ml-auto flex-row-reverse animate-fade-in">
                      <div className="h-8 w-8 rounded-full shrink-0 flex items-center justify-center bg-red-955/50 border border-red-800/50 text-red-400">
                        <Mic className="h-4 w-4 animate-pulse" />
                      </div>
                      <div className="p-4 rounded-2xl text-sm bg-red-955/20 border border-red-900/30 text-red-200 rounded-tr-none italic font-medium">
                        {transcript}
                      </div>
                    </div>
                  )}

                  {/* Processing animation */}
                  {status === "processing" && (
                    <div className="flex gap-3 max-w-[80%] mr-auto items-center">
                      <div className="h-8 w-8 rounded-full shrink-0 flex items-center justify-center bg-purple-955/80 border border-purple-800 text-purple-300">
                        <Bot className="h-4 w-4" />
                      </div>
                      <div className="flex items-center gap-2 px-4 py-3 bg-[#0f0a21]/60 border border-purple-950/50 rounded-2xl rounded-tl-none">
                        <Loader2 className="h-4 w-4 animate-spin text-purple-400" />
                        <span className="text-xs text-slate-405 font-medium">Interviewer is thinking...</span>
                      </div>
                    </div>
                  )}

                  <div ref={chatEndRef} />
                </div>

                {/* Microphone / controls center */}
                <div className="bg-[#05030f]/60 border-t border-purple-950/20 p-6 flex flex-col items-center justify-center gap-4">
                  {errorText && (
                    <div className="w-full flex items-center gap-2 text-red-400 bg-red-955/20 border border-red-900/20 px-3 py-2 rounded-xl text-xs">
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
                            className="rounded-full h-11 w-11 border-purple-950/60 text-slate-400 hover:text-white"
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
                              <div className="absolute -inset-3 rounded-full bg-red-550/10 animate-ping" />
                              <div className="absolute -inset-1.5 rounded-full bg-red-555/20 blur-xs" />
                            </>
                          )}
                          {status === "speaking" && (
                            <>
                              <div className="absolute -inset-3 rounded-full bg-emerald-555/10 animate-pulse" />
                            </>
                          )}

                          <Button
                            size="icon"
                            onClick={status === "listening" ? () => submitAnswer() : startListening}
                            disabled={status === "processing"}
                            className={`rounded-full h-16 w-16 shadow-lg border-2 text-white transition-all scale-[1.05] hover:scale-[1.1] active:scale-[0.95] ${
                              status === "listening"
                                ? "bg-red-600 border-red-400 hover:bg-red-500"
                                : status === "speaking"
                                ? "bg-emerald-600 border-emerald-400 hover:bg-emerald-500"
                                : "bg-purple-600 border-purple-400 hover:bg-purple-500"
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
                          className="rounded-full h-11 w-11 border-purple-950/60 text-red-400 hover:text-red-300 hover:bg-red-955/20"
                          title="Finish & Save Interview"
                        >
                          <Square className="h-4 w-4 fill-current text-red-500" />
                        </Button>
                      </div>

                      {/* Informational Subtitle */}
                      <p className="text-xs text-slate-500 font-medium">
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
                      <div className="w-full flex gap-2 border-t border-purple-955/25 pt-4 mt-2">
                        <input
                          type="text"
                          value={manualInput}
                          onChange={(e) => setManualInput(e.target.value)}
                          placeholder="Or type your response here instead..."
                          className="flex-1 bg-[#060312] border border-purple-900/35 rounded-xl px-4 py-2 text-xs text-slate-200 focus:outline-none focus:border-purple-500 focus:ring-1 focus:ring-purple-500"
                          onKeyDown={(e) => {
                            if (e.key === "Enter") {
                              submitAnswer(manualInput);
                            }
                          }}
                        />
                        <Button
                          size="sm"
                          onClick={() => submitAnswer(manualInput)}
                          className="bg-purple-650 hover:bg-purple-500 rounded-xl text-xs gap-1.5"
                        >
                          <Send className="h-3 w-3" />
                          Send
                        </Button>
                      </div>
                    </div>
                  ) : (
                    // Completed View
                    <div className="text-center py-4 flex flex-col items-center">
                      <CheckCircle2 className="h-12 w-12 text-emerald-400 mb-2" />
                      <h3 className="font-bold text-white text-lg">Interview Completed!</h3>
                      <p className="text-xs text-slate-400 mt-1 max-w-sm mb-4">Your answers have been stored and processed successfully.</p>
                      <Button 
                        onClick={() => navigate("/")}
                        className="px-6 py-2.5 text-xs font-semibold rounded-xl bg-purple-900/40 border border-purple-500/30 hover:bg-purple-950/60 hover:border-purple-500/50 text-purple-300 transition-all shadow-md shadow-purple-550/10"
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