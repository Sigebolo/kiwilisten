import express from "express";
import path from "path";
import dotenv from "dotenv";
import { GoogleGenAI, Type } from "@google/genai";
import { createServer as createViteServer } from "vite";

dotenv.config();

const app = express();
const PORT = 3000;

// Initialize Gemini API
const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
  httpOptions: {
    headers: {
      "User-Agent": "aistudio-build",
    },
  },
});

app.use(express.json());

// Helper function to append a WAV header to raw 24kHz Mono 16-bit PCM data
function pcmToWav(pcmBuffer: Buffer, sampleRate: number = 24000): Buffer {
  const header = Buffer.alloc(44);
  const blockAlign = 2; // 16-bit, 1 channel (mono) = 2 bytes per sample
  const byteRate = sampleRate * blockAlign;
  const dataSize = pcmBuffer.length;
  const chunkSize = 36 + dataSize;

  // RIFF identifier
  header.write("RIFF", 0);
  header.writeUInt32LE(chunkSize, 4);
  header.write("WAVE", 8);

  // Format chunk
  header.write("fmt ", 12);
  header.writeUInt32LE(16, 16); // Chunk size (16)
  header.writeUInt16LE(1, 20);  // Audio format (1 = PCM)
  header.writeUInt16LE(1, 22);  // Channels (1 = Mono)
  header.writeUInt32LE(sampleRate, 24); // Sample rate
  header.writeUInt32LE(byteRate, 28);   // Byte rate
  header.writeUInt16LE(blockAlign, 32);  // Block align
  header.writeUInt16LE(16, 34); // Bits per sample (16)

  // Data chunk
  header.write("data", 36);
  header.writeUInt32LE(dataSize, 40);

  return Buffer.concat([header, pcmBuffer]);
}

// Helper to call generateContent with retry on 503 / UNAVAILABLE / High Demand / 429 / Rate Limit errors
async function generateContentWithRetry(options: any, maxRetries = 3) {
  let attempt = 0;
  while (attempt < maxRetries) {
    try {
      return await ai.models.generateContent(options);
    } catch (error: any) {
      attempt++;
      console.warn(`[AI TTS] Attempt ${attempt} failed: ${error?.message || error}`);
      
      const errMsg = String(error?.message || "").toUpperCase();
      const isUnavailable = errMsg.includes("503") || 
                            errMsg.includes("UNAVAILABLE") || 
                            errMsg.includes("HIGH DEMAND") ||
                            errMsg.includes("TEMP") ||
                            errMsg.includes("429") ||
                            errMsg.includes("RESOURCE_EXHAUSTED") ||
                            errMsg.includes("QUOTA") ||
                            error?.status === 503 ||
                            error?.status === 429 ||
                            error?.status === 403;
                            
      if (isUnavailable && attempt < maxRetries) {
        // Use exponential backoff: 2s, 4s, 8s
        const delay = Math.pow(2, attempt) * 1000;
        console.log(`[AI TTS] Rate limit, high demand, or unavailable. Retrying in ${delay}ms (attempt ${attempt}/${maxRetries})...`);
        await new Promise((resolve) => setTimeout(resolve, delay));
      } else {
        throw error;
      }
    }
  }
  throw new Error("Failed after maximum retries");
}

// Endpoint 1: Text to Speech via Gemini TTS (gemini-3.1-flash-tts-preview)
app.post("/api/tts", async (req, res) => {
  try {
    const { text, voice } = req.body;
    if (!text) {
      res.status(400).json({ error: "Text is required for speech synthesis" });
      return;
    }

    const selectedVoice = voice || "Kore"; // Prebuilt voices: 'Kore', 'Puck', 'Charon', 'Fenrir', 'Zephyr'
    
    // Call Gemini TTS with retry mechanism
    const response = await generateContentWithRetry({
      model: "gemini-3.1-flash-tts-preview",
      contents: [{ parts: [{ text: text }] }],
      config: {
        responseModalities: ["AUDIO"],
        speechConfig: {
          voiceConfig: {
            prebuiltVoiceConfig: { voiceName: selectedVoice },
          },
        },
      },
    });

    const part = response.candidates?.[0]?.content?.parts?.[0];
    const mimeType = part?.inlineData?.mimeType || "audio/wav";
    const base64Audio = part?.inlineData?.data;
    if (!base64Audio) {
      throw new Error("No audio data returned from Gemini TTS");
    }

    console.log(`Received TTS audio with mimeType: ${mimeType}, data length: ${base64Audio.length}`);

    const audioBuffer = Buffer.from(base64Audio, "base64");
    let finalBuffer = audioBuffer;
    let finalMimeType = mimeType;

    if (mimeType.toLowerCase().includes("pcm")) {
      finalBuffer = pcmToWav(audioBuffer, 24000);
      finalMimeType = "audio/wav";
    }

    res.setHeader("Content-Type", finalMimeType);
    res.setHeader("Content-Length", finalBuffer.length);
    res.end(finalBuffer);
  } catch (error: any) {
    console.error("TTS generation failed:", error);
    res.status(500).json({ error: error.message || "Failed to generate speech" });
  }
});

// Endpoint 2: Context-aware Word Dictionary Explanation via Gemini 3.5 Flash
app.post("/api/explain-word", async (req, res) => {
  try {
    const { word, sentence } = req.body;
    if (!word) {
      res.status(400).json({ error: "Word is required" });
      return;
    }

    const prompt = `Analyze the English word "${word}" in the context of the sentence: "${sentence || ""}".
Provide a JSON response containing its translation, phonetic symbol (IPA), New Zealand pronunciation/vowel shift tips, definition, and cultural Kiwi slang notes if applicable.`;

    const response = await ai.models.generateContent({
      model: "gemini-3.5-flash",
      contents: prompt,
      config: {
        systemInstruction: "You are an expert linguist specializing in New Zealand English (NZ/Kiwi accent, Māori influences, vowel shifts, and regional vocabulary). Provide accurate linguistic explanations, localized vowel-shift pronunciation tips (e.g., how the short 'e' shifts to 'i' or 'i' to 'u' in NZ), and precise Chinese translations for Chinese learners.",
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            word: { type: Type.STRING },
            phonetic: { type: Type.STRING, description: "Phonetic IPA symbol, e.g. /kiːwi/" },
            translation: { type: Type.STRING, description: "Direct clear Chinese translation of this word in context" },
            definition: { type: Type.STRING, description: "Contextual English definition of the word in this sentence" },
            kiwiPronunciation: { type: Type.STRING, description: "Tips on Kiwi accent pronunciation or vowel shifts for this word, if any" },
            isKiwiSlang: { type: Type.BOOLEAN, description: "True if it is a specific Kiwi slang, colloquialism, or Māori term" },
            kiwiContext: { type: Type.STRING, description: "Cultural or linguistic context about New Zealand if applicable (especially for Māori terms like Kia ora or local slang)" },
            examples: {
              type: Type.ARRAY,
              items: { type: Type.STRING },
              description: "2 simple example sentences showing how to use the word",
            },
          },
          required: ["word", "phonetic", "translation", "definition", "isKiwiSlang"],
        },
      },
    });

    const text = response.text;
    if (!text) {
      throw new Error("Empty response from Gemini API");
    }

    res.json(JSON.parse(text));
  } catch (error: any) {
    console.error("Word explanation failed:", error);
    res.status(500).json({ error: error.message || "Failed to explain word" });
  }
});

// Endpoint 3: Generate Custom New Zealand Listening Lesson
app.post("/api/generate-lesson", async (req, res) => {
  try {
    const { prompt } = req.body;
    const userPrompt = prompt || "A topic about beautiful landscapes in New Zealand";

    const aiPrompt = `Write an engaging, clear English listening story about New Zealand focusing on: "${userPrompt}".
The story should be around 100-150 words. It must contain some unique New Zealand vocabulary, spelling, or concepts (such as Māori culture, geography, Auckland, Southern Alps, kiwi, flat white, marae, etc.).
Split the text cleanly into a list of complete sentences. Include difficulty level and helpful cultural notes.`;

    const response = await ai.models.generateContent({
      model: "gemini-3.5-flash",
      contents: aiPrompt,
      config: {
        systemInstruction: "You are a professional educational curriculum developer designing listening lessons for English learners. Your stories must be authentic to New Zealand (Aotearoa), clear, grammatically flawless, and categorized correctly by difficulty. Return a structured JSON response.",
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            title: { type: Type.STRING, description: "Engaging title of the story" },
            text: { type: Type.STRING, description: "The complete story text in full paragraphs" },
            sentences: {
              type: Type.ARRAY,
              items: { type: Type.STRING },
              description: "The complete story text, split cleanly into individual sentences for repetitive playback"
            },
            difficulty: { type: Type.STRING, description: "Difficulty level: Beginner, Intermediate, or Advanced" },
            culturalNotes: { type: Type.STRING, description: "Interesting cultural or historical background about New Zealand concepts in this text" }
          },
          required: ["title", "text", "sentences", "difficulty", "culturalNotes"]
        }
      }
    });

    const text = response.text;
    if (!text) {
      throw new Error("Empty response from Gemini API");
    }

    res.json(JSON.parse(text));
  } catch (error: any) {
    console.error("Lesson generation failed:", error);
    res.status(500).json({ error: error.message || "Failed to generate lesson" });
  }
});

// API health route
app.get("/api/health", (req, res) => {
  res.json({ status: "healthy", timestamp: new Date().toISOString() });
});

// Setup static files or Vite dev server based on environment
async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    // Development mode with Vite dev server middleware
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
    console.log("Vite middleware mounted in development mode.");
  } else {
    // Production mode serving compiled files
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
    console.log("Serving static production build from dist.");
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on port ${PORT} in ${process.env.NODE_ENV || "development"} mode`);
  });
}

startServer();
