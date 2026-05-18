import express from "express";
import path from "path";
import { GoogleGenAI, Type } from "@google/genai";
import dotenv from "dotenv";

dotenv.config();

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json({ limit: '50mb' }));

  // Gemini SDK Setup - Initialized lazily or inside the function
  const getAi = () => {
    const key = process.env.GEMINI_API_KEY;
    if (!key) {
      console.error("[API] GEMINI_API_KEY is missing from environment variables!");
      throw new Error("API Key for AI service is not configured. Please add GEMINI_API_KEY to your app settings.");
    }
    return new GoogleGenAI({ apiKey: key });
  };

  // API routes
  app.post("/api/identify", async (req, res) => {
    try {
      const { capturedPhotoBase64, teachers, options } = req.body;
      
      const apiKeyExists = !!process.env.GEMINI_API_KEY;
      console.log(`[API] Identify request: PhotoLen=${capturedPhotoBase64?.length}, Teachers=${teachers?.length}, KeyExists=${apiKeyExists}`);

      if (!capturedPhotoBase64) {
        return res.status(400).json({ error: "No image data provided. Please capture a photo." });
      }

      const ai = getAi();

      // Robust base64 cleaning helper
      const extractBase64 = (dataUrl: string | any) => {
        if (!dataUrl || typeof dataUrl !== 'string') return "";
        
        // Remove ANY common data URL prefixes found in various libraries
        // Format: data:image/jpeg;base64,.....
        const commaIndex = dataUrl.indexOf(",");
        if (commaIndex !== -1) {
          const possibleBase64 = dataUrl.substring(commaIndex + 1).trim();
          // Sometimes the prefix is just "base64," if already processed partially
          return possibleBase64.replace(/^base64,/, "");
        }
        
        // Fallback: search for common keywords and take everything after
        if (dataUrl.includes(";base64,")) {
          return dataUrl.split(";base64,")[1].trim();
        }
        
        return dataUrl.trim();
      };

      let cleanCapture = extractBase64(capturedPhotoBase64);
      
      // Secondary check: if it still contains "data:" or "base64", it's malformed for the API
      const isDirty = (s: string) => s.includes("data:") || s.includes("base64") || s.includes(",");
      
      if (!cleanCapture || cleanCapture.length < 50 || isDirty(cleanCapture)) {
        console.error(`[API] Invalid capture sequence. Initial Length: ${capturedPhotoBase64?.length}, Extracted Length: ${cleanCapture?.length}`);
        
        // Final aggressive cleanup
        if (cleanCapture) {
          const parts = cleanCapture.split(',');
          cleanCapture = parts[parts.length - 1].trim().replace(/^base64,/, "");
        }
        
        if (!cleanCapture || cleanCapture.length < 50 || isDirty(cleanCapture)) {
          console.error(`[API] Aborting. Final CleanCapture Len: ${cleanCapture?.length}`);
          return res.status(400).json({ error: "Invalid or empty image data captured. Please ensure your camera is working properly and providing a clear image." });
        }
      }

      const matchThreshold = options?.matchThreshold ?? 0.8;
      const livenessSensitivity = options?.livenessSensitivity ?? 0.5;

      const captureMatch = capturedPhotoBase64.match(/^data:([^;]+);base64,/);
      const captureMimeType = captureMatch ? captureMatch[1] : "image/jpeg";
      
      console.log(`[API] Processing with Mime: ${captureMimeType}, CaptureLen: ${cleanCapture.length}`);
      
      let livenessInstruction = "Check if CAPTURED PHOTO is a picture of a screen (phone, monitor), a physical photo, or a printout.";
      if (livenessSensitivity > 0.8) {
        livenessInstruction += " Be EXTREMELY strict. Any hint of graininess, moiré patterns, or non-natural lighting must be flagged as non-live.";
      } else if (livenessSensitivity < 0.3) {
        livenessInstruction += " Focus only on obvious screen borders or massive glare. Allow slightly grainy images if features are clear.";
      }
      
      const prompt = `Task: Identification & Liveness Detection. 
  Gallery: Teacher references.
  Goal: Match "CAPTURED PHOTO" face to one gallery entry ONLY if it is a LIVE human being.

  Liveness Rules:
  1. Detect Spoofing: ${livenessInstruction}
  2. Look for artifacts: Screen glare, moiré patterns, screen borders, flat perspective, or graininess typical of re-photographing.
  3. If it looks like a spoof/non-live, set "isLivePerson" to false.

  Matching Rules:
  1. If isLivePerson is false, do not attempt to match.
  2. If isLivePerson is true, match face to gallery.
  3. Strictness: isMatch=true ONLY if confidence > ${matchThreshold} AND isLivePerson=true.

  Output: JSON only.
  {
    "isLivePerson": boolean,
    "isMatch": boolean,
    "matchedId": string, 
    "confidence": number, 
    "name": string, 
    "reason": string
  }`;

      const imageParts: any[] = [
        { text: prompt },
        { text: "--- CAPTURED PHOTO ---" },
        { inlineData: { mimeType: captureMimeType, data: cleanCapture } },
        { text: "--- REFERENCE GALLERY ---" }
      ];

      teachers.slice(0, 50).forEach((t: any) => {
        const rawPhoto = t.photoUrl || "";
        const cleanRef = extractBase64(rawPhoto);
        
        if (cleanRef && cleanRef.length > 100 && !isDirty(cleanRef)) {
          const refMatch = rawPhoto.match(/^data:([^;]+);base64,/);
          const refMimeType = refMatch ? refMatch[1] : "image/jpeg";
          imageParts.push({ text: `ID: ${t.id} Name: ${t.name}` });
          imageParts.push({ inlineData: { mimeType: refMimeType, data: cleanRef } });
        }
      });

      const modelName = "gemini-1.5-flash";
      const result = await ai.models.generateContent({
        model: modelName,
        contents: [{ role: "user", parts: imageParts }],
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              isLivePerson: { type: Type.BOOLEAN },
              isMatch: { type: Type.BOOLEAN },
              matchedId: { type: Type.STRING },
              confidence: { type: Type.NUMBER },
              name: { type: Type.STRING },
              reason: { type: Type.STRING }
            },
            required: ["isLivePerson", "isMatch", "matchedId", "confidence", "name", "reason"]
          }
        }
      });

      const responseText = result.text;
      console.log(`[API] AI Result: ${responseText?.substring(0, 100)}...`);
      res.json(JSON.parse(responseText || "{}"));
    } catch (error: any) {
      console.error("Server API Error Details:", error);
      res.status(500).json({ error: error.message || "Face recognition service failed. Please check your internet and API key settings." });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    // Dynamic import to avoid bundling vite in production
    const { createServer: createViteServer } = await import("vite");
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req: any, res: any) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer().catch(err => {
  console.error("Critical Server Startup Error:", err);
});
