/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

async function identifyTeacherClientSide(
  capturedPhotoBase64: string,
  teachers: { id: string, name: string, photoUrl: string }[],
  options: { matchThreshold?: number, livenessSensitivity?: number } = {},
  apiKey: string
) {
  const extractBase64 = (dataUrl: string) => {
    if (!dataUrl || typeof dataUrl !== 'string') return "";
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

  const isDirty = (s: string) => s.includes("data:") || s.includes("base64") || s.includes(",");

  let cleanCapture = extractBase64(capturedPhotoBase64);
  
  if (!cleanCapture || cleanCapture.length < 50 || isDirty(cleanCapture)) {
    if (cleanCapture) {
      const parts = cleanCapture.split(',');
      cleanCapture = parts[parts.length - 1].trim().replace(/^base64,/, "").replace(/^data:image\/[a-z]+;base64,/, "");
    }
    
    if (!cleanCapture || cleanCapture.length < 50 || isDirty(cleanCapture)) {
      const chunks = capturedPhotoBase64.split(/[;,]/);
      const longestChunk = chunks.reduce((a: string, b: string) => a.length > b.length ? a : b, "");
      if (longestChunk.length > 50 && !isDirty(longestChunk)) {
        cleanCapture = longestChunk;
      } else {
        throw new Error("Invalid or empty image data captured. Please ensure your camera is working properly.");
      }
    }
  }

  const matchThreshold = options?.matchThreshold ?? 0.6;
  const livenessSensitivity = options?.livenessSensitivity ?? 0.5;

  const captureMatch = capturedPhotoBase64.match(/^data:([^;]+);base64,/);
  const captureMimeType = captureMatch ? captureMatch[1] : "image/jpeg";

  let livenessInstruction = "Check if CAPTURED PHOTO is a live human or a spoof (screen, photo-of-photo).";
  if (livenessSensitivity > 0.8) {
    livenessInstruction += " CRITICAL: Be EXTREMELY strict. Any hint of moiré, glare, or unnatural texture must be marked as isLivePerson=false.";
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

  const imageParts: any[] = [
    { text: prompt },
    { text: "--- BEGIN CAPTURED PHOTO ---" },
    { inlineData: { mimeType: captureMimeType, data: cleanCapture } },
    { text: "--- END CAPTURED PHOTO ---" },
    { text: "--- BEGIN REFERENCE GALLERY ---" }
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

  // Call the official Google Gemini API directly from the browser (e.g., statically hosted on Netlify, etc.)
  const models = [
    "gemini-2.5-flash",
    "gemini-1.5-flash",
    "gemini-1.5-flash-8b",
    "gemini-2.5-flash-lite",
    "gemini-3.5-flash",
    "gemini-3.1-flash-lite",
    "gemini-flash-latest"
  ];
  
  let lastErrorMsg = "Gemini API failed";
  let responseText = "";
  
  for (const modelName of models) {
    try {
      console.log(`[Client API] Attempting direct browser call with model: ${modelName}`);
      const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${apiKey}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: imageParts }],
          generationConfig: {
            responseMimeType: "application/json",
            responseSchema: {
              type: "OBJECT",
              properties: {
                isLivePerson: { type: "BOOLEAN" },
                isMatch: { type: "BOOLEAN" },
                matchedId: { type: "STRING" },
                confidence: { type: "NUMBER" },
                name: { type: "STRING" },
                reason: { type: "STRING" }
              },
              required: ["isLivePerson", "isMatch", "matchedId", "confidence", "name", "reason"]
            }
          }
        })
      });

      if (!response.ok) {
        let errorMsg = `Model ${modelName} failed`;
        try {
          const errorJson = await response.json();
          errorMsg = errorJson.error?.message || errorMsg;
        } catch (_) {}
        console.warn(`[Client API] Model ${modelName} failed direct call: ${errorMsg}`);
        lastErrorMsg = errorMsg;
        continue; // Try next model on fallback list
      }

      const resultData = await response.json();
      responseText = resultData.candidates?.[0]?.content?.parts?.[0]?.text;
      if (responseText) {
        console.log(`[Client API] Successfully verified via browser client directly with model ${modelName}`);
        break;
      }
    } catch (err: any) {
      console.warn(`[Client API] Client request exception for model ${modelName}:`, err);
      lastErrorMsg = err?.message || String(err);
    }
  }

  if (!responseText) {
    throw new Error(lastErrorMsg);
  }

  return JSON.parse(responseText);
}

export async function identifyTeacher(
  capturedPhotoBase64: string, 
  teachers: { id: string, name: string, photoUrl: string }[],
  options: { matchThreshold?: number, livenessSensitivity?: number } = {}
) {
  try {
    const clientApiKey = 
      localStorage.getItem("VITE_GEMINI_API_KEY") || 
      localStorage.getItem("GEMINI_API_KEY");

    const headers: Record<string, string> = { 
      "Content-Type": "application/json" 
    };

    if (clientApiKey) {
      headers["x-user-gemini-api-key"] = clientApiKey;
    }

    const response = await fetch("/api/identify", {
      method: "POST",
      headers,
      body: JSON.stringify({ capturedPhotoBase64, teachers, options })
    });

    if (!response.ok) {
      let serverErrorMsg = `Server returned status code ${response.status}`;
      try {
        const errorJson = await response.json();
        if (errorJson?.error) {
          serverErrorMsg = errorJson.error;
        }
      } catch (_) {}
      
      const serverErrObj = new Error(serverErrorMsg);
      (serverErrObj as any).status = response.status;
      throw serverErrObj;
    }

    const contentType = response.headers.get("content-type") || "";
    if (!contentType.includes("application/json")) {
      throw new Error("Local server didn't respond with JSON (likely static server route redirect).");
    }

    const result = await response.json();
    
    if (typeof result !== "object" || result === null || !("isLivePerson" in result)) {
      throw new Error("Invalid response format from server.");
    }
    
    return {
      isLivePerson: result.isLivePerson === true,
      isMatch: result.isMatch === true && result.isLivePerson === true,
      matchedId: result.matchedId || null,
      confidence: result.confidence || 0,
      name: result.name || null,
      reason: result.reason || "No reason provided"
    };
  } catch (error: any) {
    console.warn("Server-side identify request failed:", error);

    // Retrieve API key from environment variables or local storage for client-side use
    const apiKey = 
      (import.meta as any).env?.VITE_GEMINI_API_KEY || 
      localStorage.getItem("VITE_GEMINI_API_KEY") || 
      localStorage.getItem("GEMINI_API_KEY") ||
      (window as any).__GEMINI_API_KEY__;

    if (!apiKey) {
      // If no local client-side key is stored, rethrow the backend error (e.g. 429 quota error)
      // to let the UI react appropriately!
      throw error;
    }

    try {
      const result = await identifyTeacherClientSide(capturedPhotoBase64, teachers, options, apiKey);
      return {
        isLivePerson: result.isLivePerson === true,
        isMatch: result.isMatch === true && result.isLivePerson === true,
        matchedId: result.matchedId || null,
        confidence: result.confidence || 0,
        name: result.name || null,
        reason: result.reason || "No reason provided"
      };
    } catch (clientError: any) {
      console.error("Direct browser Gemini API verification failed:", clientError);
      throw new Error(`Client Face Recognition Failed: ${clientError.message || clientError}`);
    }
  }
}

