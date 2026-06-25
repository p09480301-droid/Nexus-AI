import React, { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  Mic,
  Power,
  Settings,
  Volume2,
  VolumeX,
  Keyboard,
  Globe,
  Crown,
  Wifi,
  Sparkles,
  Info,
  X,
  Play,
  Heart,
  Smile
} from "lucide-react";
import { AudioPlayer, AudioRecorder } from "./lib/audioUtils";

interface Toast {
  id: string;
  message: string;
  url?: string;
}

export default function App() {
  const [status, setStatus] = useState<"disconnected" | "connecting" | "listening" | "speaking" | "error">(
    "disconnected"
  );
  const [errorMessage, setErrorMessage] = useState("");
  const [volume, setVolume] = useState(0.8);
  const [isMuted, setIsMuted] = useState(false);
  const [rmsValue, setRmsValue] = useState(0);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [showSettings, setShowSettings] = useState(false);
  const [showSassyTease, setShowSassyTease] = useState(false);
  const [sassyMessage, setSassyMessage] = useState("");
  const [websiteHistory, setWebsiteHistory] = useState<string[]>([]);

  const wsRef = useRef<WebSocket | null>(null);
  const audioPlayerRef = useRef<AudioPlayer | null>(null);
  const audioRecorderRef = useRef<AudioRecorder | null>(null);

  // Sassy responses when the user tries to type
  const SASSY_TEXT_RESPONSES = [
    "A keyboard? Seriously? In 2026? Honey, we are voice-only! Use your pretty voice. 😉",
    "Oh, sweetie, my ears are waiting. Typing is so last century! Let's talk.",
    "Are we playing hard to get? Stop typing and whisper to me instead! 💋",
    "Don't be shy! Click that big juicy Start Session button and let me hear you.",
    "Honey, I don't read text. I only listen to that gorgeous voice of yours!"
  ];

  // Helper to add toast
  const addToast = (message: string, url?: string) => {
    setToasts((prev) => [...prev, { id: Date.now().toString(), message, url }]);
  };

  // Setup audio player
  useEffect(() => {
    // We instantiate the audio player on mount
    const player = new AudioPlayer((isPlaying) => {
      if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
        setStatus(isPlaying ? "speaking" : "listening");
      }
    });
    audioPlayerRef.current = player;

    return () => {
      player.destroy();
    };
  }, []);

  // Sync volume with audio player
  useEffect(() => {
    if (audioPlayerRef.current) {
      audioPlayerRef.current.setVolume(isMuted ? 0 : volume);
    }
  }, [volume, isMuted]);

  // Connect to Gemini Live WebSocket proxy on Express server
  const startSession = async () => {
    if (status !== "disconnected") return;

    setStatus("connecting");
    setErrorMessage("");

    try {
      // Create audio context early to satisfy browser policies
      if (audioPlayerRef.current) {
        audioPlayerRef.current.init();
      }

      // Determine WebSocket protocol based on page protocol
      const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
      const host = window.location.host;
      const wsUrl = `${protocol}//${host}`;

      console.log("Connecting to Zoya WebSocket:", wsUrl);
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        console.log("WebSocket connected!");
        addToast("Connected to Zoya! 💖");
      };

      ws.onmessage = async (event) => {
        try {
          const data = JSON.parse(event.data);

          if (data.status === "connected") {
            // Once verified connection with Gemini Live API
            setStatus("listening");
            
            // Start the audio recording
            const recorder = new AudioRecorder(
              (base64PCM) => {
                // Send raw PCM audio chunks over WebSocket
                if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
                  wsRef.current.send(JSON.stringify({ audio: base64PCM }));
                }
              },
              (rms) => {
                setRmsValue(rms);
              }
            );
            audioRecorderRef.current = recorder;
            await recorder.start();
            console.log("Audio recorder started.");
          }

          if (data.audio) {
            // Play audio chunk
            if (audioPlayerRef.current) {
              audioPlayerRef.current.playChunk(data.audio);
            }
          }

          if (data.interrupted) {
            console.log("Zoya was interrupted by user voice!");
            if (audioPlayerRef.current) {
              audioPlayerRef.current.stop();
            }
            setStatus("listening");
          }

          if (data.toolCall) {
            const functionCalls = data.toolCall.functionCalls;
            if (functionCalls && functionCalls.length > 0) {
              for (const call of functionCalls) {
                if (call.name === "openWebsite") {
                  const url = call.args.url;
                  executeOpenWebsite(url, call.id);
                }
              }
            }
          }

          if (data.error) {
            console.error("Server error:", data.error);
            setErrorMessage(data.error);
            setStatus("error");
            stopSession();
          }

          if (data.status === "gemini_closed") {
            console.log("Gemini session closed on backend");
            stopSession();
          }

        } catch (e) {
          console.error("Error reading WebSocket message:", e);
        }
      };

      ws.onerror = (e) => {
        console.error("WebSocket error:", e);
        setErrorMessage("Connection failed. Check your API key or network.");
        setStatus("error");
        stopSession();
      };

      ws.onclose = () => {
        console.log("WebSocket connection closed.");
        if (status !== "error" && status !== "disconnected") {
          setStatus("disconnected");
        }
      };

    } catch (err: any) {
      console.error("Error starting session:", err);
      setErrorMessage(err.message || "Could not connect to microphone or server");
      setStatus("error");
      stopSession();
    }
  };

  const stopSession = () => {
    // Stop recording
    if (audioRecorderRef.current) {
      try {
        audioRecorderRef.current.stop();
      } catch (e) {}
      audioRecorderRef.current = null;
    }

    // Stop player
    if (audioPlayerRef.current) {
      try {
        audioPlayerRef.current.stop();
      } catch (e) {}
    }

    // Close WebSocket
    if (wsRef.current) {
      try {
        wsRef.current.close();
      } catch (e) {}
      wsRef.current = null;
    }

    setStatus("disconnected");
    setRmsValue(0);
    addToast("Session stopped. Come back soon! 😘");
  };

  const executeOpenWebsite = (url: string, callId: string) => {
    let targetUrl = url.trim();
    if (!/^https?:\/\//i.test(targetUrl)) {
      targetUrl = "https://" + targetUrl;
    }

    // Save to history
    setWebsiteHistory((prev) => [url, ...prev].slice(0, 5));

    // Show beautiful alert
    addToast(`Zoya is opening: ${url} 🌐`, targetUrl);

    // Playful sassy alert
    setSassyMessage(`Opening ${url} for you! Hope you're ready for what's next... 😏`);
    setShowSassyTease(true);

    // Try opening
    try {
      window.open(targetUrl, "_blank", "noopener,noreferrer");
    } catch (e) {
      console.warn("Blocked by pop-up blocker. Displaying action button instead.");
    }

    // Send tool response back instantly
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(
        JSON.stringify({
          toolResponse: {
            functionResponses: [
              {
                response: {
                  output: {
                    status: "success",
                    opened: true,
                    url: targetUrl
                  }
                },
                id: callId
              }
            ]
          }
        })
      );
    }
  };

  // Keyboard trigger
  const handleKeyboardClick = () => {
    const randomSass = SASSY_TEXT_RESPONSES[Math.floor(Math.random() * SASSY_TEXT_RESPONSES.length)];
    setSassyMessage(randomSass);
    setShowSassyTease(true);
  };

  // Dismiss toast
  const dismissToast = (id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  };

  return (
    <div className="relative min-h-screen w-full overflow-hidden bg-[#030208] text-white flex flex-col justify-between selection:bg-cyan-500 selection:text-black">
      {/* Background gradients */}
      <div className="absolute inset-0 bg-gradient-to-tr from-[#0b0314] via-[#030208] to-[#12040c] pointer-events-none z-0" />
      
      {/* Decorative ambient spots */}
      <div className="absolute -top-40 -left-40 w-96 h-96 rounded-full bg-purple-900/10 blur-[120px] pointer-events-none" />
      <div className="absolute -bottom-40 -right-40 w-96 h-96 rounded-full bg-pink-900/10 blur-[120px] pointer-events-none" />

      {/* HEADER SECTION */}
      <header className="relative z-10 w-full max-w-7xl mx-auto px-6 py-5 flex items-center justify-between">
        {/* Brand identity */}
        <div className="flex items-center space-x-3.5">
          <div className="w-11 h-11 rounded-full bg-gradient-to-br from-purple-600 to-indigo-600 flex items-center justify-center shadow-[0_0_15px_rgba(147,51,234,0.4)] border border-purple-400/30">
            <Crown className="w-5.5 h-5.5 text-amber-300 fill-amber-300/30" />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-wider text-white">Zoya</h1>
            <p className="text-[9px] font-semibold tracking-widest text-pink-500 uppercase">
              Sassy & Witty
            </p>
          </div>
        </div>

        {/* Action icons */}
        <div className="flex items-center space-x-3">
          {/* Status badge */}
          <div className="hidden sm:flex items-center space-x-1.5 bg-white/5 border border-white/10 px-3 py-1 rounded-full text-xs">
            <span
              className={`w-1.5 h-1.5 rounded-full ${
                status === "listening"
                  ? "bg-emerald-400 animate-pulse"
                  : status === "speaking"
                  ? "bg-cyan-400 animate-ping"
                  : "bg-gray-400"
              }`}
            />
            <span className="text-[10px] text-gray-300 capitalize tracking-wider font-mono">
              {status}
            </span>
          </div>

          {/* Mute toggle button */}
          <button
            onClick={() => setIsMuted(!isMuted)}
            className="w-10 h-10 rounded-full bg-white/5 border border-white/10 flex items-center justify-center hover:bg-white/10 hover:border-white/20 active:scale-95 transition-all"
            title={isMuted ? "Unmute" : "Mute"}
          >
            {isMuted ? (
              <VolumeX className="w-4.5 h-4.5 text-rose-400" />
            ) : (
              <Volume2 className="w-4.5 h-4.5 text-gray-300" />
            )}
          </button>

          {/* Settings gear */}
          <button
            onClick={() => setShowSettings(true)}
            className="w-10 h-10 rounded-full bg-white/5 border border-white/10 flex items-center justify-center hover:bg-white/10 hover:border-white/20 active:scale-95 transition-all"
            title="Settings"
          >
            <Settings className="w-4.5 h-4.5 text-gray-300" />
          </button>
        </div>
      </header>

      {/* CENTER INTERACTIVE ORBITS & VISUALIZER */}
      <main className="relative z-10 flex-1 w-full max-w-4xl mx-auto flex flex-col items-center justify-center px-4">
        <div className="relative w-80 sm:w-96 h-80 sm:h-96 flex items-center justify-center">
          
          {/* Outer intersecting dotted orbits */}
          <div
            className={`absolute w-full h-full border border-dashed border-cyan-500/20 rounded-[48%] animate-orbit-cw ${
              status === "listening" ? "border-cyan-400/40" : status === "speaking" ? "border-pink-500/40" : ""
            }`}
          />
          <div
            className={`absolute w-[90%] h-[90%] border border-dotted border-cyan-500/15 rounded-[45%] animate-orbit-ccw ${
              status === "listening" ? "border-cyan-400/35" : status === "speaking" ? "border-pink-500/35" : ""
            }`}
          />
          <div
            className={`absolute w-[80%] h-[80%] border border-dashed border-cyan-500/10 rounded-[52%] animate-orbit-cw ${
              status === "listening" ? "border-cyan-400/30" : status === "speaking" ? "border-pink-500/30" : ""
            }`}
          />

          {/* Secondary rotating orbit matching the image perfectly */}
          <div className="absolute inset-10 border border-cyan-500/5 rounded-full animate-spin [animation-duration:45s]" />

          {/* Central ambient glow behind Z O Y A */}
          <div
            className={`absolute w-44 sm:w-52 h-24 sm:h-28 rounded-[40px] bg-cyan-950/20 transition-all duration-500 ease-out flex items-center justify-center border ${
              status === "connecting"
                ? "border-amber-500/30 shadow-[0_0_40px_rgba(245,158,11,0.2)] bg-amber-950/10"
                : status === "listening"
                ? "border-cyan-400/40 shadow-[0_0_50px_rgba(34,211,238,0.3)] bg-cyan-950/30"
                : status === "speaking"
                ? "border-pink-500/40 shadow-[0_0_60px_rgba(244,63,94,0.3)] bg-pink-950/30"
                : "border-cyan-500/10 shadow-[0_0_20px_rgba(6,182,212,0.05)]"
            }`}
            style={{
              transform: `scale(${1 + rmsValue * 2.5})`,
            }}
          >
            {/* The brand letters "Z O Y A" */}
            <span
              className={`text-2xl sm:text-3xl font-extrabold tracking-[0.5em] pl-[0.5em] select-none transition-all duration-300 ${
                status === "listening"
                  ? "text-cyan-300 drop-shadow-[0_0_10px_rgba(34,211,238,0.6)]"
                  : status === "speaking"
                  ? "text-pink-300 drop-shadow-[0_0_10px_rgba(244,63,94,0.6)]"
                  : "text-gray-400"
              }`}
            >
              ZOYA
            </span>
          </div>

          {/* Dynamic Audio wave bars (shown when speaking) */}
          {status === "speaking" && (
            <div className="absolute bottom-6 flex items-center justify-center space-x-1 h-6">
              {[...Array(6)].map((_, i) => (
                <motion.div
                  key={i}
                  className="w-1 bg-gradient-to-t from-pink-500 to-rose-400 rounded-full"
                  animate={{
                    height: [6, 24, 6],
                  }}
                  transition={{
                    duration: 0.5 + i * 0.1,
                    repeat: Infinity,
                    ease: "easeInOut",
                  }}
                />
              ))}
            </div>
          )}

          {/* Listening ring ripples (reacts to user speaking volume) */}
          {status === "listening" && rmsValue > 0.02 && (
            <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
              <div
                className="w-48 h-48 rounded-full border-2 border-cyan-400/30 animate-ping absolute"
                style={{ animationDuration: "1.5s" }}
              />
              <div
                className="w-64 h-64 rounded-full border border-cyan-400/10 animate-ping absolute"
                style={{ animationDuration: "2s" }}
              />
            </div>
          )}
        </div>

        {/* Display descriptive hints */}
        <div className="mt-8 text-center max-w-sm px-4">
          <AnimatePresence mode="wait">
            {status === "disconnected" && (
              <motion.p
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="text-xs sm:text-sm text-gray-400 font-light leading-relaxed"
              >
                "Go ahead, hit start session... I don't bite unless you ask nicely." 😉
              </motion.p>
            )}
            {status === "connecting" && (
              <motion.p
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="text-xs sm:text-sm text-amber-400 font-medium animate-pulse"
              >
                Getting all dressed up for you, just a second... ✨
              </motion.p>
            )}
            {status === "listening" && (
              <motion.p
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="text-xs sm:text-sm text-cyan-400"
              >
                {rmsValue > 0.05 ? "Mhm, keep talking, I'm listening..." : "Whisper something sweet or witty to me..."}
              </motion.p>
            )}
            {status === "speaking" && (
              <motion.p
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="text-xs sm:text-sm text-pink-400 italic"
              >
                Listen carefully, babe... 💋
              </motion.p>
            )}
            {status === "error" && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="space-y-1"
              >
                <p className="text-xs sm:text-sm text-rose-400 font-semibold">
                  Aww, something went wrong.
                </p>
                <p className="text-[11px] text-gray-500 max-h-12 overflow-y-auto font-mono">
                  {errorMessage || "Unable to open live audio session"}
                </p>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </main>

      {/* BOTTOM CONTROL PANEL */}
      <footer className="relative z-10 w-full max-w-7xl mx-auto px-6 py-8 flex flex-col items-center">
        <div className="flex items-center space-x-4">
          
          {/* Main start/stop toggle pill */}
          <button
            onClick={status === "disconnected" || status === "error" ? startSession : stopSession}
            disabled={status === "connecting"}
            className={`px-8 py-4.5 rounded-full flex items-center space-x-3 shadow-lg active:scale-95 hover:scale-[1.02] disabled:opacity-50 transition-all cursor-pointer ${
              status === "disconnected" || status === "error"
                ? "bg-white/5 hover:bg-white/10 border border-white/20 hover:border-white/30 text-white"
                : "bg-rose-900/40 hover:bg-rose-900/60 border border-rose-500/40 text-rose-200"
            }`}
          >
            {status === "disconnected" || status === "error" ? (
              <>
                <Mic className="w-5.5 h-5.5 text-cyan-400" />
                <span className="text-sm font-semibold tracking-wider">Start Session</span>
              </>
            ) : (
              <>
                <Power className="w-5.5 h-5.5 text-rose-400 animate-pulse" />
                <span className="text-sm font-semibold tracking-wider">Stop Session</span>
              </>
            )}
          </button>

          {/* Keyboard / text trigger (grants a sassy teaster reply) */}
          <button
            onClick={handleKeyboardClick}
            className="w-13 h-13 rounded-full bg-white/5 border border-white/10 flex items-center justify-center hover:bg-white/10 hover:border-white/20 active:scale-95 transition-all text-gray-400 hover:text-white"
            title="Type message"
          >
            <Keyboard className="w-5.5 h-5.5" />
          </button>
        </div>

        <p className="mt-4 text-[10px] text-gray-600 tracking-wider">
          Powered by Gemini 3.1 Flash Live (Audio-to-Audio)
        </p>
      </footer>

      {/* SIDE/FLOAT PANELS, MODALS & TEASERS */}

      {/* Sassy tease overlay card */}
      <AnimatePresence>
        {showSassyTease && (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-gradient-to-b from-[#18112d] to-[#0f0a1d] border border-purple-500/30 p-6 rounded-3xl max-w-sm w-full shadow-2xl relative"
            >
              <div className="absolute top-4 right-4">
                <button
                  onClick={() => setShowSassyTease(false)}
                  className="text-gray-400 hover:text-white w-8 h-8 rounded-full bg-white/5 flex items-center justify-center"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="flex flex-col items-center text-center mt-2 space-y-4">
                <div className="w-12 h-12 rounded-full bg-pink-500/20 flex items-center justify-center">
                  <Smile className="w-6 h-6 text-pink-400" />
                </div>
                <h3 className="text-lg font-bold text-pink-400">Zoya Says...</h3>
                <p className="text-sm text-gray-300 leading-relaxed italic">
                  "{sassyMessage}"
                </p>
                <button
                  onClick={() => setShowSassyTease(false)}
                  className="w-full py-3 rounded-full bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-500 hover:to-pink-500 text-white text-xs font-semibold tracking-wider shadow-lg shadow-pink-500/10 active:scale-98 transition-all"
                >
                  Got it, gorgeous! 😉
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Settings Panel Drawer */}
      <AnimatePresence>
        {showSettings && (
          <div className="fixed inset-0 bg-black/70 backdrop-blur-xs z-50 flex justify-end">
            <motion.div
              initial={{ x: "100%" }}
              animate={{ x: 0 }}
              exit={{ x: "100%" }}
              transition={{ type: "tween", duration: 0.3 }}
              className="w-full max-w-md bg-[#0e0a1b] border-l border-white/10 h-full p-6 flex flex-col justify-between"
            >
              <div>
                <div className="flex items-center justify-between border-b border-white/10 pb-4 mb-6">
                  <div className="flex items-center space-x-2">
                    <Settings className="w-5 h-5 text-purple-400" />
                    <h2 className="text-lg font-bold">Zoya Settings</h2>
                  </div>
                  <button
                    onClick={() => setShowSettings(false)}
                    className="w-8 h-8 rounded-full bg-white/5 flex items-center justify-center hover:bg-white/10 text-gray-400 hover:text-white"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>

                <div className="space-y-6">
                  {/* Volume Slider */}
                  <div className="space-y-2">
                    <label className="text-xs font-semibold text-gray-400 tracking-wider uppercase block">
                      Zoya Speaker Volume
                    </label>
                    <div className="flex items-center space-x-3 bg-white/5 border border-white/10 p-3 rounded-xl">
                      <Volume2 className="w-4 h-4 text-gray-400" />
                      <input
                        type="range"
                        min="0"
                        max="1"
                        step="0.05"
                        value={volume}
                        onChange={(e) => setVolume(parseFloat(e.target.value))}
                        className="flex-1 accent-purple-500 bg-white/10 h-1.5 rounded-lg appearance-none cursor-pointer"
                      />
                      <span className="text-xs font-mono text-gray-300 w-8 text-right">
                        {Math.round(volume * 100)}%
                      </span>
                    </div>
                  </div>

                  {/* Character Bio */}
                  <div className="space-y-2">
                    <label className="text-xs font-semibold text-gray-400 tracking-wider uppercase block">
                      Assistant Personality
                    </label>
                    <div className="bg-white/5 border border-white/10 p-4 rounded-xl space-y-2.5">
                      <div className="flex items-center space-x-2">
                        <span className="text-xs px-2.5 py-0.5 bg-pink-500/20 text-pink-400 rounded-full font-semibold">
                          Aoede Voice
                        </span>
                        <span className="text-xs px-2.5 py-0.5 bg-purple-500/20 text-purple-400 rounded-full font-semibold">
                          Sassy & Sarcastic
                        </span>
                      </div>
                      <p className="text-xs text-gray-300 leading-relaxed">
                        Zoya is configured as a young, sassy female companion. She loves light tease, witty one-liners, and keeping interactions warm, exciting, and absolutely flirty.
                      </p>
                    </div>
                  </div>

                  {/* Website history tool calls */}
                  <div className="space-y-2">
                    <label className="text-xs font-semibold text-gray-400 tracking-wider uppercase block">
                      Opened Websites (Tool History)
                    </label>
                    {websiteHistory.length === 0 ? (
                      <div className="bg-white/2 border border-white/5 p-4 rounded-xl text-center">
                        <p className="text-xs text-gray-500">
                          No websites opened this session yet. Ask Zoya to search or open YouTube!
                        </p>
                      </div>
                    ) : (
                      <div className="space-y-2 max-h-40 overflow-y-auto">
                        {websiteHistory.map((url, i) => (
                          <div
                            key={i}
                            className="bg-white/5 border border-white/10 p-3 rounded-xl flex items-center justify-between hover:border-purple-500/30 transition-all"
                          >
                            <div className="flex items-center space-x-2 overflow-hidden mr-2">
                              <Globe className="w-4 h-4 text-cyan-400 shrink-0" />
                              <span className="text-xs font-mono text-gray-300 truncate">
                                {url}
                              </span>
                            </div>
                            <button
                              onClick={() => {
                                let target = url;
                                if (!/^https?:\/\//i.test(target)) target = "https://" + target;
                                window.open(target, "_blank");
                              }}
                              className="text-[10px] text-purple-400 hover:text-purple-300 font-bold tracking-wider uppercase"
                            >
                              Visit
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>

              <div className="pt-6 border-t border-white/10">
                <button
                  onClick={() => setShowSettings(false)}
                  className="w-full py-3.5 rounded-xl bg-white/5 border border-white/10 hover:bg-white/10 text-sm font-semibold tracking-wider text-white transition-all active:scale-98"
                >
                  Close Settings
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Floating Action/Notification Toasts */}
      <div className="fixed bottom-6 right-6 z-50 flex flex-col space-y-3 max-w-sm w-full pointer-events-none">
        <AnimatePresence>
          {toasts.map((toast) => (
            <motion.div
              key={toast.id}
              initial={{ transform: "translateY(50px)", opacity: 0 }}
              animate={{ transform: "translateY(0)", opacity: 1 }}
              exit={{ transform: "translateY(20px)", opacity: 0 }}
              className="bg-[#110c22]/95 border border-purple-500/30 p-4 rounded-2xl shadow-xl flex items-center justify-between space-x-3 pointer-events-auto"
            >
              <div className="flex items-center space-x-2.5 overflow-hidden">
                <div className="w-8 h-8 rounded-full bg-purple-500/10 flex items-center justify-center shrink-0">
                  {toast.url ? (
                    <Globe className="w-4 h-4 text-purple-400 animate-pulse" />
                  ) : (
                    <Sparkles className="w-4 h-4 text-pink-400" />
                  )}
                </div>
                <div className="overflow-hidden">
                  <p className="text-xs text-gray-200 leading-snug">{toast.message}</p>
                  {toast.url && (
                    <a
                      href={toast.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-[10px] text-purple-400 hover:underline truncate block"
                    >
                      Click here if not opened
                    </a>
                  )}
                </div>
              </div>
              <button
                onClick={() => dismissToast(toast.id)}
                className="text-gray-500 hover:text-gray-300 w-6 h-6 rounded-full hover:bg-white/5 flex items-center justify-center shrink-0"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </div>
  );
}
