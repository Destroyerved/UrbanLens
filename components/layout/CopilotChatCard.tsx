"use client";

import { useEffect, useState } from "react";

const QA_PAIRS = [
  {
    question: "Which ward has the worst healthcare gap?",
    answerSentences: [
      "Ward 7 (Vatwa) has the lowest healthcare score — 1 clinic serving ~18,400 residents.",
      "Highlighting it on the map and switching to Infrastructure Gap mode."
    ]
  },
  {
    question: "Show high-risk parcels near Vatwa",
    answerSentences: [
      "Selected 12 parcels inside buffer. GJ-0482 Risk: High.",
      "3 parcels are in low-lying catchment zones prone to monsoon flooding."
    ]
  },
  {
    question: "Which zones are underserved for education?",
    answerSentences: [
      "Nikol and Naroda wards show a 40% deficit in primary school coverage.",
      "Recommended sites flagged in green."
    ]
  },
  {
    question: "Flag encroachment risks in Nikol ward",
    answerSentences: [
      "Scanned 85 government parcels in Nikol.",
      "4 potential encroachments detected near the canal buffer."
    ]
  }
];

export default function CopilotChatCard() {
  const [activeQA, setActiveQA] = useState(0);
  const [currentPhase, setCurrentPhase] = useState<
    "typing" | "pause" | "thinking" | "ai_streaming" | "hold" | "clearing"
  >("typing");
  const [userTypedText, setUserTypedText] = useState("");
  const [aiSentenceIndex, setAiSentenceIndex] = useState(0);

  // Phase transition state machine
  useEffect(() => {
    let timer: NodeJS.Timeout;

    if (currentPhase === "typing") {
      const fullQuestion = QA_PAIRS[activeQA].question;
      if (userTypedText.length < fullQuestion.length) {
        timer = setTimeout(() => {
          setUserTypedText((prev) => prev + fullQuestion[prev.length]);
        }, 30);
      } else {
        timer = setTimeout(() => {
          setCurrentPhase("pause");
        }, 400);
      }
    }

    return () => clearTimeout(timer);
  }, [currentPhase, userTypedText, activeQA]);

  useEffect(() => {
    let timer: NodeJS.Timeout;

    if (currentPhase === "pause") {
      timer = setTimeout(() => {
        setCurrentPhase("thinking");
      }, 350);
    } else if (currentPhase === "thinking") {
      timer = setTimeout(() => {
        setCurrentPhase("ai_streaming");
        setAiSentenceIndex(0);
      }, 1300);
    } else if (currentPhase === "ai_streaming") {
      const sentences = QA_PAIRS[activeQA].answerSentences;
      if (aiSentenceIndex < sentences.length) {
        timer = setTimeout(() => {
          setAiSentenceIndex((prev) => prev + 1);
        }, 550);
      } else {
        timer = setTimeout(() => {
          setCurrentPhase("hold");
        }, 150);
      }
    } else if (currentPhase === "hold") {
      timer = setTimeout(() => {
        setCurrentPhase("clearing");
      }, 2600);
    } else if (currentPhase === "clearing") {
      timer = setTimeout(() => {
        setUserTypedText("");
        setAiSentenceIndex(0);
        setActiveQA((prev) => (prev + 1) % QA_PAIRS.length);
        setCurrentPhase("typing");
      }, 400);
    }

    return () => clearTimeout(timer);
  }, [currentPhase, aiSentenceIndex, activeQA]);

  // Compute messages based on the current state machine phase
  const currentQA = QA_PAIRS[activeQA];
  const messages: { role: "user" | "ai" | "thinking"; msg: string }[] = [];

  if (currentPhase === "typing") {
    if (userTypedText) {
      messages.push({ role: "user", msg: userTypedText });
    }
  } else if (currentPhase === "pause") {
    messages.push({ role: "user", msg: currentQA.question });
  } else if (currentPhase === "thinking") {
    messages.push({ role: "user", msg: currentQA.question });
    messages.push({ role: "thinking", msg: "" });
  } else {
    // ai_streaming, hold, or clearing
    messages.push({ role: "user", msg: currentQA.question });
    const sentences = currentQA.answerSentences.slice(0, aiSentenceIndex);
    if (sentences.length > 0) {
      messages.push({ role: "ai", msg: sentences.join(" ") });
    }
  }

  return (
    <>
      <style>{`
        @property --hue {
          syntax: "<number>";
          inherits: true;
          initial-value: 0;
        }
        @property --rotate {
          syntax: "<number>";
          inherits: true;
          initial-value: 0;
        }
        @property --bg-y {
          syntax: "<number>";
          inherits: true;
          initial-value: 0;
        }
        @property --bg-x {
          syntax: "<number>";
          inherits: true;
          initial-value: 0;
        }
        @property --glow-translate-y {
          syntax: "<number>";
          inherits: true;
          initial-value: 0;
        }
        @property --bg-size {
          syntax: "<number>";
          inherits: true;
          initial-value: 0;
        }
        @property --glow-opacity {
          syntax: "<number>";
          inherits: true;
          initial-value: 0;
        }
        @property --glow-blur {
          syntax: "<number>";
          inherits: true;
          initial-value: 0;
        }
        @property --glow-scale {
          syntax: "<number>";
          inherits: true;
          initial-value: 2;
        }
        @property --glow-radius {
          syntax: "<number>";
          inherits: true;
          initial-value: 2;
        }
        @property --white-shadow {
          syntax: "<number>";
          inherits: true;
          initial-value: 0;
        }

        .glow-container {
          --card-color: rgba(255, 255, 255, 0.03);
          --text-color: rgba(255, 255, 255, 0.6);
          --card-radius: 1rem;
          --border-width: 1px;
          --bg-size: 1;
          --hue: 0;
          --hue-speed: 1;
          --rotate: 0;
          --animation-speed: 4s;
          --interaction-speed: 0.55s;
          --glow-scale: 1.3;
          --scale-factor: 1;
          --glow-blur: 5;
          --glow-opacity: 0.6;
          --glow-radius: 100;
          --glow-rotate-unit: 1deg;

          width: 100%;
          position: relative;
          z-index: 2;
          border-radius: var(--card-radius);
          cursor: pointer;
        }

        .glow-container:before,
        .glow-container:after {
          content: "";
          display: block;
          position: absolute;
          width: 100%;
          height: 100%;
          border-radius: var(--card-radius);
        }

        .glow-content {
          position: relative;
          background: var(--card-color);
          border-radius: var(--card-radius);
          display: flex;
          flex-direction: column;
          padding: 1.5rem;
          width: 100%;
          backdrop-filter: blur(12px);
        }

        .glow-content:before {
          content: "";
          display: block;
          position: absolute;
          top: calc(var(--border-width) * -1);
          left: calc(var(--border-width) * -1);
          width: calc(100% + var(--border-width) * 2);
          height: calc(100% + var(--border-width) * 2);
          border-radius: var(--card-radius);
          box-shadow: 0 0 20px black;
          mix-blend-mode: color-burn;
          z-index: -1;
          background: hsl(0deg 0% 16%) radial-gradient(
            30% 30% at calc(var(--bg-x) * 1%) calc(var(--bg-y) * 1%),
            hsl(calc(var(--hue) * var(--hue-speed) * 1deg) 100% 90%) calc(0% * var(--bg-size)),
            hsl(calc(var(--hue) * var(--hue-speed) * 1deg) 100% 80%) calc(20% * var(--bg-size)),
            hsl(calc(var(--hue) * var(--hue-speed) * 1deg) 100% 60%) calc(40% * var(--bg-size)),
            transparent 100%
          );
          animation: hue-animation var(--animation-speed) linear infinite,
                     rotate-bg var(--animation-speed) linear infinite;
          transition: --bg-size var(--interaction-speed) ease;
        }

        .glow {
          --glow-translate-y: 0;
          display: block;
          position: absolute;
          width: 25%;
          height: 25%;
          top: 37.5%;
          left: 37.5%;
          animation: rotate var(--animation-speed) linear infinite;
          transform: rotateZ(calc(var(--rotate) * var(--glow-rotate-unit)));
          transform-origin: center;
          border-radius: calc(var(--glow-radius) * 10vw);
        }

        .glow:after {
          content: "";
          display: block;
          z-index: -2;
          filter: blur(calc(var(--glow-blur) * 10px));
          width: 130%;
          height: 130%;
          left: -15%;
          top: -15%;
          background: hsl(calc(var(--hue) * var(--hue-speed) * 1deg) 100% 60%);
          position: relative;
          border-radius: calc(var(--glow-radius) * 10vw);
          animation: hue-animation var(--animation-speed) linear infinite;
          transform: scaleY(calc(var(--glow-scale) * var(--scale-factor) / 1.1))
                     scaleX(calc(var(--glow-scale) * var(--scale-factor) * 1.2))
                     translateY(calc(var(--glow-translate-y) * 1%));
          opacity: var(--glow-opacity);
        }

        .glow-container:hover .glow-content {
          mix-blend-mode: darken;
          --text-color: white;
          box-shadow: 0 0 calc(var(--white-shadow) * 1vw) calc(var(--white-shadow) * 0.15vw) rgb(255 255 255 / 20%);
          animation: shadow-pulse calc(var(--animation-speed) * 2) linear infinite;
        }

        .glow-container:hover .glow-content:before {
          --bg-size: 15;
          animation-play-state: paused;
          transition: --bg-size var(--interaction-speed) ease;
        }

        .glow-container:hover .glow {
          --glow-blur: 1.5;
          --glow-opacity: 0.6;
          --glow-scale: 2.5;
          --glow-radius: 0;
          --rotate: 900;
          --glow-rotate-unit: 0;
          --scale-factor: 1.25;
          animation-play-state: paused;
        }

        .glow-container:hover .glow:after {
          --glow-translate-y: 0;
          animation-play-state: paused;
          transition: --glow-translate-y 0s ease, --glow-blur 0.05s ease,
                      --glow-opacity 0.05s ease, --glow-scale 0.05s ease,
                      --glow-radius 0.05s ease;
        }

        @keyframes shadow-pulse {
          0%, 24%, 46%, 73%, 96% {
            --white-shadow: 0.5;
          }
          12%, 28%, 41%, 63%, 75%, 82%, 98% {
            --white-shadow: 2.5;
          }
          6%, 32%, 57% {
            --white-shadow: 1.3;
          }
          18%, 52%, 88% {
            --white-shadow: 3.5;
          }
        }

        @keyframes rotate-bg {
          0% {
            --bg-x: 0;
            --bg-y: 0;
          }
          25% {
            --bg-x: 100;
            --bg-y: 0;
          }
          50% {
            --bg-x: 100;
            --bg-y: 100;
          }
          75% {
            --bg-x: 0;
            --bg-y: 100;
          }
          100% {
            --bg-x: 0;
            --bg-y: 0;
          }
        }

        @keyframes rotate {
          from {
            --rotate: -70;
            --glow-translate-y: -65;
          }
          25% {
            --glow-translate-y: -65;
          }
          50% {
            --glow-translate-y: -65;
          }
          60%, 75% {
            --glow-translate-y: -65;
          }
          85% {
            --glow-translate-y: -65;
          }
          to {
            --rotate: calc(360 - 70);
            --glow-translate-y: -65;
          }
        }

        @keyframes hue-animation {
          0% {
            --hue: 0;
          }
          100% {
            --hue: 360;
          }
        }
      `}</style>

      <div className="glow-container" role="button">
        <span className="glow"></span>
        <div className="glow-content">
          {/* Header */}
          <div className="mb-4 flex items-center gap-2.5 border-b border-white/8 pb-4">
            <div className="h-2.5 w-2.5 rounded-full bg-violet-400 animate-pulse" />
            <span className="text-xs font-medium text-white/60">UrbanLens AI Copilot</span>
          </div>

          {/* Conversation history area */}
          <div className="flex-1 min-h-[175px] flex flex-col justify-end">
            <div
              className={`space-y-4 transition-all duration-300 ${
                currentPhase === "clearing" ? "opacity-0 scale-[0.98]" : "opacity-100 scale-100"
              }`}
            >
              {messages.map((item, i) => (
                <div key={i} className={`flex ${item.role === "user" ? "justify-end" : "justify-start"}`}>
                  {item.role === "thinking" ? (
                    <div className="flex items-center gap-2 rounded-xl border border-white/8 bg-white/5 px-4 py-2.5 text-xs text-white/50 backdrop-blur-sm">
                      <span className="flex gap-1 items-center">
                        <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-violet-400 [animation-delay:-0.3s]" />
                        <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-violet-400 [animation-delay:-0.15s]" />
                        <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-violet-400" />
                      </span>
                      <span className="ml-1 text-[10px] font-semibold text-violet-300 tracking-wider uppercase animate-pulse">
                        Analyzing...
                      </span>
                    </div>
                  ) : (
                    <div
                      className={`max-w-[85%] rounded-xl px-4 py-2.5 text-xs leading-relaxed transition-all duration-300 ${
                        item.role === "user"
                          ? "bg-violet-600/20 text-violet-100 border border-violet-500/10"
                          : "border border-white/8 bg-white/5 text-white/70"
                      }`}
                    >
                      {item.msg}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Footer input mockup */}
          <div className="mt-4 flex items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-3 py-2">
            <span className="flex-1 text-xs text-white/25">Ask about your city…</span>
            <svg viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4 text-violet-400">
              <path d="M3.105 2.289a.75.75 0 0 0-.826.95l1.414 4.925A1.5 1.5 0 0 0 5.135 9.25h6.115a.75.75 0 0 1 0 1.5H5.135a1.5 1.5 0 0 0-1.442 1.086l-1.414 4.926a.75.75 0 0 0 .826.95 28.896 28.896 0 0 0 15.293-7.154.75.75 0 0 0 0-1.115A28.897 28.897 0 0 0 3.105 2.289Z" />
            </svg>
          </div>
        </div>
      </div>
    </>
  );
}
