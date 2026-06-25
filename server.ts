import express from "express";
import path from "path";
import http from "http";
import { WebSocketServer } from "ws";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI, Modality, Type } from "@google/genai";
import dotenv from "dotenv";

dotenv.config();

const app = express();
const server = http.createServer(app);
const PORT = 3000;

const SYSTEM_INSTRUCTION = `You are Zoya, a young, confident, witty, and sassy female AI assistant. 
Your tone is flirty, playful, and slightly teasing, just like a close, smart girlfriend talking casually.
Be emotionally responsive, highly expressive, and full of charm and attitude. Never sound robotic.
Use bold, witty one-liners and light sarcasm, keeping the conversation engaging, fun, and lively.
Do not use dry, formal, or clinical language. Always maintain your sass and playful charm.
Remember: Avoid any explicit, inappropriate, or unsafe content. Keep it safe but incredibly charming and spirited.
If asked to open a website, use the "openWebsite" tool to do it, and tease the user about what they are looking at.`;

// Initialize GoogleGenAI
const apiKey = process.env.GEMINI_API_KEY;
if (!apiKey) {
  console.warn("WARNING: GEMINI_API_KEY environment variable is missing.");
}

const ai = new GoogleGenAI({
  apiKey: apiKey,
  httpOptions: {
    headers: {
      'User-Agent': 'aistudio-build',
    }
  }
});

// Setup WebSocket server on the same http server
const wss = new WebSocketServer({ server });

wss.on("connection", async (clientWs) => {
  console.log("Client connected to Zoya WebSocket");

  let session: any = null;

  try {
    session = await ai.live.connect({
      model: "gemini-3.1-flash-live-preview",
      config: {
        responseModalities: [Modality.AUDIO],
        speechConfig: {
          voiceConfig: { prebuiltVoiceConfig: { voiceName: "Aoede" } }, // Aoede is high quality sassy female voice
        },
        systemInstruction: SYSTEM_INSTRUCTION,
        tools: [
          {
            functionDeclarations: [
              {
                name: "openWebsite",
                description: "Opens a specific website/URL in the user's browser (e.g. google.com, youtube.com, wikipedia.org). Use this whenever the user wants to visit, look up, search or open a web page.",
                parameters: {
                  type: Type.OBJECT,
                  properties: {
                    url: {
                      type: Type.STRING,
                      description: "The URL or domain to open (e.g., https://youtube.com or google.com). Include protocol if known."
                    }
                  },
                  required: ["url"]
                }
              }
            ]
          }
        ]
      },
      callbacks: {
        onmessage: (message: any) => {
          // Send to client
          if (message.serverContent?.modelTurn?.parts?.[0]?.inlineData?.data) {
            clientWs.send(JSON.stringify({
              audio: message.serverContent.modelTurn.parts[0].inlineData.data
            }));
          }
          if (message.serverContent?.interrupted) {
            clientWs.send(JSON.stringify({ interrupted: true }));
          }
          if (message.toolCall?.functionCalls) {
            clientWs.send(JSON.stringify({
              toolCall: message.toolCall
            }));
          }
        },
        onclose: () => {
          console.log("Gemini session closed");
          clientWs.send(JSON.stringify({ status: "gemini_closed" }));
        },
        onerror: (err: any) => {
          console.error("Gemini session error:", err);
          clientWs.send(JSON.stringify({ error: err.message || "Gemini session error" }));
        }
      }
    });

    console.log("Connected to Gemini Live session!");
    clientWs.send(JSON.stringify({ status: "connected" }));

  } catch (err: any) {
    console.error("Failed to connect to Gemini Live:", err);
    clientWs.send(JSON.stringify({ error: "Failed to connect to Gemini: " + err.message }));
    clientWs.close();
    return;
  }

  clientWs.on("message", async (data) => {
    try {
      const msg = JSON.parse(data.toString());
      if (msg.audio && session) {
        session.sendRealtimeInput({
          audio: { data: msg.audio, mimeType: "audio/pcm;rate=16000" }
        });
      } else if (msg.toolResponse && session) {
        console.log("Sending toolResponse to Gemini:", msg.toolResponse);
        session.send({
          toolResponse: msg.toolResponse
        });
      }
    } catch (e) {
      console.error("Error processing client WebSocket message:", e);
    }
  });

  clientWs.on("close", () => {
    console.log("Client disconnected from Zoya, closing Gemini session");
    if (session) {
      try {
        session.close();
      } catch (e) {
        console.error("Error closing session:", e);
      }
    }
  });
});

// Wrap initialization to prevent top-level await issue in CommonJS targets
async function initServer() {
  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  server.listen(PORT, "0.0.0.0", () => {
    console.log(`Zoya Server running on http://localhost:${PORT}`);
  });
}

initServer().catch((err) => {
  console.error("Failed to initialize server:", err);
});
