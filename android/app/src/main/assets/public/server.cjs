var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));

// server.ts
var import_express = __toESM(require("express"), 1);
var import_path = __toESM(require("path"), 1);
var import_genai = require("@google/genai");
var import_dotenv = __toESM(require("dotenv"), 1);
import_dotenv.default.config();
async function startServer() {
  const app = (0, import_express.default)();
  const PORT = 3e3;
  app.use(import_express.default.json({ limit: "50mb" }));
  const getAi = (customKey) => {
    const key = customKey || process.env.GEMINI_API_KEY;
    if (!key) {
      console.error("[API] GEMINI_API_KEY is missing!");
      throw new Error("API Key for AI service is not configured. Please add GEMINI_API_KEY to your app settings or enter it in Register > Config.");
    }
    return new import_genai.GoogleGenAI({
      apiKey: key,
      httpOptions: {
        headers: {
          "User-Agent": "aistudio-build"
        }
      }
    });
  };
  app.post("/api/identify", async (req, res) => {
    try {
      const { capturedPhotoBase64, teachers, options } = req.body;
      const clientProvidedKey = req.headers["x-user-gemini-api-key"] || req.headers["x-gemini-api-key"];
      const actualClientKey = typeof clientProvidedKey === "string" ? clientProvidedKey.trim() : void 0;
      const apiKeyExists = !!(actualClientKey || process.env.GEMINI_API_KEY);
      console.log(`[API] Identify request: PhotoLen=${capturedPhotoBase64?.length}, Teachers=${teachers?.length}, CustomKeyInHeader=${!!actualClientKey}, KeyExists=${apiKeyExists}`);
      if (!capturedPhotoBase64) {
        return res.status(400).json({ error: "No image data provided. Please capture a photo." });
      }
      const ai = getAi(actualClientKey);
      const extractBase64 = (dataUrl) => {
        if (!dataUrl || typeof dataUrl !== "string") return "";
        const commaIndex = dataUrl.indexOf(",");
        if (commaIndex !== -1) {
          const possibleBase64 = dataUrl.substring(commaIndex + 1).trim();
          return possibleBase64.replace(/^base64,/, "");
        }
        if (dataUrl.includes(";base64,")) {
          return dataUrl.split(";base64,")[1].trim();
        }
        return dataUrl.trim();
      };
      let cleanCapture = extractBase64(capturedPhotoBase64);
      const isDirty = (s) => s.includes("data:") || s.includes("base64") || s.includes(",");
      if (!cleanCapture || cleanCapture.length < 50 || isDirty(cleanCapture)) {
        console.error(`[API] Invalid capture sequence. Initial Length: ${capturedPhotoBase64?.length}, Extracted Length: ${cleanCapture?.length}`);
        if (cleanCapture) {
          const parts = cleanCapture.split(",");
          cleanCapture = parts[parts.length - 1].trim().replace(/^base64,/, "").replace(/^data:image\/[a-z]+;base64,/, "");
        }
        if (!cleanCapture || cleanCapture.length < 50 || isDirty(cleanCapture)) {
          const chunks = capturedPhotoBase64.split(/[;,]/);
          const longestChunk = chunks.reduce((a, b) => a.length > b.length ? a : b, "");
          if (longestChunk.length > 50 && !isDirty(longestChunk)) {
            cleanCapture = longestChunk;
          } else {
            console.error(`[API] Aborting. Final CleanCapture Len: ${cleanCapture?.length}`);
            return res.status(400).json({ error: "Invalid or empty image data captured. Please ensure your camera is working properly and providing a clear image." });
          }
        }
      }
      const matchThreshold = options?.matchThreshold ?? 0.6;
      const livenessSensitivity = options?.livenessSensitivity ?? 0.5;
      const captureMatch = capturedPhotoBase64.match(/^data:([^;]+);base64,/);
      const captureMimeType = captureMatch ? captureMatch[1] : "image/jpeg";
      console.log(`[API] Processing: Mime=${captureMimeType}, CaptureLen=${cleanCapture.length}, Threshold=${matchThreshold}`);
      let livenessInstruction = "Check if CAPTURED PHOTO is a live human or a spoof (screen, photo-of-photo).";
      if (livenessSensitivity > 0.8) {
        livenessInstruction += " CRITICAL: Be EXTREMELY strict. Any hint of moir\xE9, glare, or unnatural texture must be marked as isLivePerson=false.";
      } else if (livenessSensitivity < 0.3) {
        livenessInstruction += " Be lenient. Only flag obvious screens or paper borders. High graininess is okay.";
      }
      const prompt = `Task: Facial Identification & Liveness Verification.

Context: 
- "CAPTURED PHOTO" is a live capture from an attendance kiosk.
- "REFERENCE GALLERY" contains known staff member photos.

Rules:
1. Liveness: ${livenessInstruction}
2. Identity: Find the single person in the GALLERY that matches the person in the CAPTURED PHOTO.
3. Scoring: 
   - isLivePerson: Boolean. False if spoofing detected.
   - isMatch: Boolean. True ONLY if isLivePerson=true AND match confidence > ${matchThreshold}.
   - matchedId: The "ID" string from the gallery exactly as provided. Return "none" if no match.
   - confidence: 0.0 to 1.0.
   - name: The "Name" string from the gallery.
   - reason: Short explanation (e.g., "Matched Staff ID 123 with high confidence" or "Non-live person detected due to screen glare").

Output Format: JSON only.
{
  "isLivePerson": boolean,
  "isMatch": boolean,
  "matchedId": string, 
  "confidence": number, 
  "name": string, 
  "reason": string
}`;
      const imageParts = [
        { text: prompt },
        { text: "--- BEGIN CAPTURED PHOTO ---" },
        { inlineData: { mimeType: captureMimeType, data: cleanCapture } },
        { text: "--- END CAPTURED PHOTO ---" },
        { text: "--- BEGIN REFERENCE GALLERY ---" }
      ];
      teachers.slice(0, 50).forEach((t) => {
        const rawPhoto = t.photoUrl || "";
        const cleanRef = extractBase64(rawPhoto);
        if (cleanRef && cleanRef.length > 100 && !isDirty(cleanRef)) {
          const refMatch = rawPhoto.match(/^data:([^;]+);base64,/);
          const refMimeType = refMatch ? refMatch[1] : "image/jpeg";
          imageParts.push({ text: `ID: ${t.id} Name: ${t.name}` });
          imageParts.push({ inlineData: { mimeType: refMimeType, data: cleanRef } });
        }
      });
      const callAiWithRetry = async (parts, maxRetries = 2) => {
        let lastError = null;
        const models = [
          "gemini-2.5-flash",
          "gemini-1.5-flash",
          "gemini-1.5-flash-8b",
          "gemini-2.5-flash-lite",
          "gemini-3.5-flash",
          "gemini-3.1-flash-lite",
          "gemini-flash-latest"
        ];
        for (let attempt = 0; attempt <= maxRetries; attempt++) {
          for (const modelName of models) {
            try {
              console.log(`[API] Attempting model: ${modelName} (Attempt ${attempt + 1})`);
              const result2 = await ai.models.generateContent({
                model: modelName,
                contents: [{ role: "user", parts }],
                config: {
                  responseMimeType: "application/json",
                  responseSchema: {
                    type: import_genai.Type.OBJECT,
                    properties: {
                      isLivePerson: { type: import_genai.Type.BOOLEAN },
                      isMatch: { type: import_genai.Type.BOOLEAN },
                      matchedId: { type: import_genai.Type.STRING },
                      confidence: { type: import_genai.Type.NUMBER },
                      name: { type: import_genai.Type.STRING },
                      reason: { type: import_genai.Type.STRING }
                    },
                    required: ["isLivePerson", "isMatch", "matchedId", "confidence", "name", "reason"]
                  }
                }
              });
              if (result2 && result2.text) {
                return result2;
              }
              throw new Error("Empty response from AI model");
            } catch (err) {
              lastError = err;
              const status = err?.status || err?.code || err?.error?.code;
              const message = err?.message || "";
              const isQuotaError = status === 429 || status === "RESOURCE_EXHAUSTED" || message.toLowerCase().includes("quota");
              console.warn(`[API] ${modelName} failed (${status}): ${message.substring(0, 120)}...`);
              if (status === 404 || status === "NOT_FOUND" || status === 501 || message.includes("not found")) {
                continue;
              }
              if (isQuotaError || status === 503) {
                console.warn(`[API] ${modelName} busy or limit reached. Trying next model...`);
                if (isQuotaError) await new Promise((resolve) => setTimeout(resolve, 500));
                continue;
              }
              if (status === 400 && !message.includes("quota")) {
                console.error(`[API] Fatal request error with ${modelName}`);
                continue;
              }
            }
          }
          if (attempt < maxRetries) {
            const delay = 3e3 * (attempt + 1);
            console.log(`[API] All models busy/exhausted, waiting ${delay}ms before next cycle...`);
            await new Promise((resolve) => setTimeout(resolve, delay));
          }
        }
        if (lastError?.message?.toLowerCase().includes("quota") || lastError?.status === 429) {
          const quotaErr = new Error("Daily AI Quota Exceeded. Please try again after some time or check your Gemini API limits.");
          quotaErr.status = 429;
          throw quotaErr;
        }
        throw lastError || new Error("AI service unavailable after multiple retries.");
      };
      const result = await callAiWithRetry(imageParts);
      const responseText = result.text;
      console.log(`[API] AI Result: ${responseText?.substring(0, 100)}...`);
      res.json(JSON.parse(responseText || "{}"));
    } catch (error) {
      console.error("Server API Error Details:", error);
      const status = error.status || 500;
      res.status(status).json({ error: error.message || "Face recognition service failed. Please check your internet and API key settings." });
    }
  });
  if (process.env.NODE_ENV !== "production") {
    const { createServer: createViteServer } = await import("vite");
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa"
    });
    app.use(vite.middlewares);
  } else {
    const distPath = import_path.default.join(process.cwd(), "dist");
    app.use(import_express.default.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(import_path.default.join(distPath, "index.html"));
    });
  }
  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}
startServer().catch((err) => {
  console.error("Critical Server Startup Error:", err);
});
//# sourceMappingURL=server.cjs.map
