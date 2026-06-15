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
      <div className="h-screen w-screen bg-[#fcf8f6] flex flex-col justify-center items-center text-[#292524] relative">
        <div className="absolute inset-0 bg-grid-pattern opacity-60 pointer-events-none" />
        <Loader2 className="h-12 w-12 animate-spin text-rose-500 mb-4 z-10" />
        <p className="text-stone-500 text-sm font-bold animate-pulse z-10">Analyzing GitHub portfolio and initializing sandbox...</p>
      </div>
    );
  }

  return (
    <div className="relative min-h-screen bg-[#fcf8f6] text-[#292524] flex flex-col items-center p-4 md:p-8 selection:bg-rose-200 selection:text-rose-900 overflow-hidden">
      {/* Background Grids & Orbs */}
      <div className="absolute inset-0 bg-grid-pattern opacity-100 pointer-events-none z-0" />
      <div className="glow-orb animate-pulse-glow w-[500px] h-[500px] bg-rose-200/30 top-[-100px] left-[10%] pointer-events-none" />
      <div className="glow-orb animate-pulse-glow w-[600px] h-[600px] bg-pink-100/20 top-[30%] right-[5%] pointer-events-none" style={{ animationDelay: "2s" }} />

      {/* Header */}
      <header className="w-full max-w-5xl flex justify-between items-center mb-6 z-10 relative">
        <Button 
          variant="ghost" 
          onClick={() => navigate("/")}
          className="text-stone-500 hover:text-stone-900 hover:bg-rose-100/40 border border-transparent hover:border-rose-200/50 gap-2 rounded-xl transition-all"
        >
          <ArrowLeft className="h-4 w-4" />
          Leave Interview
        </Button>
        
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5 bg-[#fefaf8] border border-rose-100/60 px-3 py-1.5 rounded-full text-xs font-semibold text-stone-550 shadow-xs">
            <span className={`h-2.5 w-2.5 rounded-full ${status === 'listening' ? 'bg-red-500 animate-pulse' : 'bg-rose-500'}`} />
            Status: {status.toUpperCase()}
          </div>

          <Button 
            variant="outline" 
            size="icon" 
            onClick={toggleMute}
            className="rounded-xl border-rose-200 hover:bg-rose-50 text-stone-600 shadow-xs"
          >
            {isMuted ? <VolumeX className="h-4 w-4 text-red-500" /> : <Volume2 className="h-4 w-4 text-emerald-500" />}
          </Button>
        </div>
      </header>

      {/* Main Container */}
      <main className="w-full max-w-5xl grid grid-cols-1 lg:grid-cols-3 gap-6 z-10 flex-1 relative">
        
        {/* Left Panel: GitHub Info & Interactive State */}
        <section className="lg:col-span-1 flex flex-col gap-6">
          
          {/* GitHub Metadata Card */}
          <Card className="bg-white border border-rose-100/60 border-glow-rose backdrop-blur-xl rounded-2xl shadow-xl flex-1 flex flex-col">
            <CardHeader className="border-b border-rose-100/40">
              <CardTitle className="text-lg font-extrabold text-[#1c1917] flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-rose-500" />
                Candidate Profile
              </CardTitle>
              <CardDescription className="text-stone-500">Customized interview criteria</CardDescription>
            </CardHeader>
            <CardContent className="py-6 flex-1 flex flex-col justify-between">
              {githubData ? (
                <div className="space-y-4">
                  <div className="flex items-center gap-3">
                    {githubData.avatarUrl ? (
                      <img src={githubData.avatarUrl} alt="Avatar" className="h-12 w-12 rounded-full border border-rose-100 object-cover" />
                    ) : (
                      <div className="h-12 w-12 rounded-full bg-rose-550/10 flex items-center justify-center border border-rose-200/50 text-rose-600 font-bold">
                        {githubData.login ? githubData.login.substring(0,2).toUpperCase() : "GH"}
                      </div>
                    )}
                    <div>
                      <h3 className="font-bold text-stone-850">{githubData.name || githubData.login || "Developer"}</h3>
                      <p className="text-xs text-stone-400">@{githubData.login || "github"}</p>
                    </div>
                  </div>

                  <div className="border-t border-rose-100/40 pt-4 space-y-2.5">
                    {githubData.bio && (
                      <p className="text-xs text-stone-500 italic">"{githubData.bio}"</p>
                    )}
                    {githubData.publicRepos !== undefined && (
                      <div className="flex justify-between text-xs text-stone-600 font-semibold">
                        <span>Public Repos:</span>
                        <span className="font-bold text-stone-900">{githubData.publicRepos}</span>
                      </div>
                    )}
                    {githubData.followers !== undefined && (
                      <div className="flex justify-between text-xs text-stone-600 font-semibold">
                        <span>Followers:</span>
                        <span className="font-bold text-stone-900">{githubData.followers}</span>
                      </div>
                    )}
                  </div>

                  {githubData.pinnedRepos && githubData.pinnedRepos.length > 0 && (
                    <div className="border-t border-rose-100/40 pt-4">
                      <p className="text-xs font-bold text-stone-700 mb-2">Top Repositories:</p>
                      <div className="space-y-2">
                        {githubData.pinnedRepos.slice(0, 3).map((repo: any, index: number) => (
                          <div key={index} className="text-xs bg-[#faf6f3] border border-rose-100/30 p-2.5 rounded-lg">
                            <p className="font-bold text-rose-600">{repo.name}</p>
                            {repo.language && <p className="text-[10px] text-stone-500 mt-1">● {repo.language}</p>}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <div className="h-full flex flex-col justify-center items-center text-stone-400 text-sm">
                  <AlertCircle className="h-8 w-8 mb-2 text-stone-300" />
                  No profile metadata loaded.
                </div>
              )}

              {/* Status wave at bottom of left panel */}
              {status !== "idle" && status !== "completed" && (
                <div className="mt-8 border-t border-rose-100/40 pt-6 flex flex-col items-center">
                  <p className="text-xs text-stone-400 font-extrabold mb-4 uppercase tracking-wider">Sound Wave</p>
                  <div className="flex items-center gap-1.5 h-10">
                    {[1, 2, 3, 4, 5, 6, 7, 8].map((bar) => {
                      let animClass = "";
                      if (status === "listening") animClass = "animate-pulse bg-red-500";
                      else if (status === "speaking") animClass = "animate-pulse bg-emerald-500";
                      else if (status === "processing") animClass = "animate-pulse bg-rose-500";
                      
                      // Alternate heights for visual variety
                      const height = bar % 3 === 0 ? "h-8" : bar % 2 === 0 ? "h-6" : "h-4";
                      const delay = `animation-delay-${bar * 150}`;
                      return (
                        <span 
                          key={bar} 
                          className={`w-1 rounded-full bg-rose-100 transition-all ${height} ${animClass} ${delay}`} 
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
          <Card className="bg-white border border-rose-100/60 border-glow-rose backdrop-blur-xl rounded-2xl flex-1 flex flex-col overflow-hidden shadow-2xl">
            
            {status === "idle" && (
              <div className="flex-1 flex flex-col items-center justify-center p-8 text-center bg-[radial-gradient(circle_at_center,rgba(244,63,94,0.04)_0,transparent_70%)]">
                <div className="relative mb-6">
                  {/* Glowing rings */}
                  <div className="absolute -inset-4 rounded-full bg-rose-500/10 animate-ping pointer-events-none" />
                  <div className="absolute -inset-1 rounded-full bg-rose-500/20 blur-sm pointer-events-none" />
                  <div className="h-24 w-24 bg-gradient-to-tr from-rose-500 to-pink-500 rounded-full flex items-center justify-center text-white border-2 border-rose-400 shadow-xl relative">
                    <Sparkles className="h-10 w-10 text-white animate-pulse" />
                  </div>
                </div>
                
                <h2 className="text-2xl font-extrabold text-stone-900 tracking-tight mb-2">Are you ready to begin?</h2>
                <p className="text-stone-600 text-sm max-w-md mb-8">
                  This mock session simulates a live engineering interview. Make sure your microphone is enabled, you are in a quiet room, and your sound is on.
                </p>

                {!speechSupported && (
                  <div className="flex items-center gap-2 bg-red-50 border border-red-200 p-4 rounded-xl text-red-800 text-xs text-left max-w-md mb-6">
                    <AlertCircle className="h-5 w-5 text-red-500 shrink-0" />
                    <p>Web Speech API is not supported in this browser. You can still participate in the interview by typing your answers using the text override block below.</p>
                  </div>
                )}

                <Button 
                  size="lg" 
                  onClick={startInterview}
                  className="bg-gradient-to-r from-rose-500 to-pink-500 hover:from-rose-450 hover:to-pink-455 text-white shadow-lg shadow-rose-250/20 rounded-xl px-8 py-6 text-base font-bold flex items-center gap-2 hover:scale-[1.02] active:scale-[0.98] transition-all"
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
                          ? 'bg-stone-100 border-stone-200 text-stone-600' 
                          : 'bg-rose-50 border border-rose-200 text-rose-600'
                      }`}>
                        {msg.role === 'user' ? <User className="h-4 w-4" /> : <Bot className="h-4 w-4" />}
                      </div>
                      <div className={`p-4 rounded-2xl text-sm shadow-sm font-medium ${
                        msg.role === 'user'
                          ? 'bg-gradient-to-r from-rose-500 to-pink-500 text-white rounded-tr-none'
                          : 'bg-[#faf6f3] border border-rose-100/35 text-stone-850 rounded-tl-none'
                      }`}>
                        <p className="leading-relaxed whitespace-pre-wrap">{msg.text}</p>
                      </div>
                    </div>
                  ))}
                  
                  {/* Local visualizer for active voice input */}
                  {status === "listening" && transcript && (
                    <div className="flex gap-3 max-w-[85%] ml-auto flex-row-reverse animate-fade-in">
                      <div className="h-8 w-8 rounded-full shrink-0 flex items-center justify-center bg-red-50 border border-red-200 text-red-500">
                        <Mic className="h-4 w-4 animate-pulse" />
                      </div>
                      <div className="p-4 rounded-2xl text-sm bg-red-50 border border-red-200 text-red-700 rounded-tr-none italic font-bold">
                        {transcript}
                      </div>
                    </div>
                  )}

                  {/* Processing animation */}
                  {status === "processing" && (
                    <div className="flex gap-3 max-w-[80%] mr-auto items-center">
                      <div className="h-8 w-8 rounded-full shrink-0 flex items-center justify-center bg-rose-50 border border-rose-200 text-rose-600">
                        <Bot className="h-4 w-4" />
                      </div>
                      <div className="flex items-center gap-2 px-4 py-3 bg-[#faf6f3] border border-rose-100/25 rounded-2xl rounded-tl-none shadow-xs">
                        <Loader2 className="h-4 w-4 animate-spin text-rose-500" />
                        <span className="text-xs text-stone-500 font-bold">Interviewer is thinking...</span>
                      </div>
                    </div>
                  )}

                  <div ref={chatEndRef} />
                </div>

                {/* Microphone / controls center */}
                <div className="bg-stone-50/80 border-t border-rose-100/40 p-6 flex flex-col items-center justify-center gap-4">
                  {errorText && (
                    <div className="w-full flex items-center gap-2 text-red-700 bg-red-50 border border-red-200 px-3 py-2 rounded-xl text-xs font-bold">
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
                            className="rounded-full h-11 w-11 border-rose-200 text-stone-550 hover:bg-stone-100 shadow-xs"
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
                              <div className="absolute -inset-3 rounded-full bg-red-500/10 animate-ping" />
                              <div className="absolute -inset-1.5 rounded-full bg-red-500/20 blur-xs" />
                            </>
                          )}
                          {status === "speaking" && (
                            <>
                              <div className="absolute -inset-3 rounded-full bg-emerald-500/10 animate-pulse" />
                            </>
                          )}

                          <Button
                            size="icon"
                            onClick={status === "listening" ? () => submitAnswer() : startListening}
                            disabled={status === "processing"}
                            className={`rounded-full h-16 w-16 shadow-lg border-2 text-white transition-all scale-[1.05] hover:scale-[1.1] active:scale-[0.95] ${
                              status === "listening"
                                ? "bg-red-500 border-red-400 hover:bg-red-650"
                                : status === "speaking"
                                ? "bg-emerald-500 border-emerald-400 hover:bg-emerald-650"
                                : "bg-rose-500 border-rose-400 hover:bg-rose-600"
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
                          className="rounded-full h-11 w-11 border-rose-200 text-red-500 hover:bg-red-50 shadow-xs"
                          title="Finish & Save Interview"
                        >
                          <Square className="h-4 w-4 fill-current text-red-500" />
                        </Button>
                      </div>

                      {/* Informational Subtitle */}
                      <p className="text-xs text-stone-500 font-bold">
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
                      <div className="w-full flex gap-2 border-t border-rose-200/50 pt-4 mt-2">
                        <input
                          type="text"
                          value={manualInput}
                          onChange={(e) => setManualInput(e.target.value)}
                          placeholder="Or type your response here instead..."
                          className="flex-1 bg-stone-50 border border-rose-200/65 rounded-xl px-4 py-2 text-xs text-stone-800 placeholder-stone-400 focus:outline-none focus:border-rose-400 focus:ring-1 focus:ring-rose-400"
                          onKeyDown={(e) => {
                            if (e.key === "Enter") {
                              submitAnswer(manualInput);
                            }
                          }}
                        />
                        <Button
                          size="sm"
                          onClick={() => submitAnswer(manualInput)}
                          className="bg-rose-500 hover:bg-rose-600 text-white rounded-xl text-xs gap-1.5 shadow-sm"
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
                      <h3 className="font-extrabold text-stone-900 text-lg">Interview Completed!</h3>
                      <p className="text-xs text-stone-600 mt-1 max-w-sm mb-4 font-semibold">Your answers have been stored and processed successfully.</p>
                      <Button 
                        onClick={() => navigate("/")}
                        className="px-6 py-2.5 text-xs font-bold rounded-xl bg-rose-50 border border-rose-200/60 hover:bg-rose-100 text-rose-600 transition-all shadow-sm"
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