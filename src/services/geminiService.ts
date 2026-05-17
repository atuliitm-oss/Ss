/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { GoogleGenAI, Type } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

async function withRetry<T>(fn: () => Promise<T>, retries = 3, delay = 2000): Promise<T> {
  try {
    return await fn();
  } catch (error: any) {
    const isRetryable = error?.message?.includes("429") || error?.status === 429 || error?.code === 429 || error?.message?.includes("quota");
    if (isRetryable && retries > 0) {
      console.warn(`Gemini API 429 error. Retrying in ${delay}ms... (${retries} retries left)`);
      await new Promise(resolve => setTimeout(resolve, delay));
      return withRetry(fn, retries - 1, delay * 2.5);
    }
    throw error;
  }
}

export async function identifyTeacher(
  capturedPhotoBase64: string, 
  teachers: { id: string, name: string, photoUrl: string }[],
  options: { matchThreshold?: number, livenessSensitivity?: number } = {}
) {
  const { matchThreshold = 0.8, livenessSensitivity = 0.5 } = options;
  const captureMatch = capturedPhotoBase64.match(/^data:(image\/[a-z]+);base64,/);
  const captureMimeType = captureMatch ? captureMatch[1] : "image/jpeg";
  const cleanCapture = (capturedPhotoBase64.split(',')[1] || capturedPhotoBase64).trim();
  
  if (cleanCapture.length < 100) {
    throw new Error("Unable to capture clear image. Please ensure camera is not blocked and try again.");
  }

  // Map livenessSensitivity 0-1 to a descriptive instruction
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

  // Add teacher photos to the request (Increased to 50 for larger school coverage)
  teachers.slice(0, 50).forEach((t) => {
    const refMatch = t.photoUrl.match(/^data:(image\/[a-z]+);base64,/);
    const refMimeType = refMatch ? refMatch[1] : "image/jpeg";
    const cleanRef = (t.photoUrl.split(',')[1] || t.photoUrl).trim();
    
    if (cleanRef && cleanRef.length > 100) {
      imageParts.push({ text: `ID: ${t.id} Name: ${t.name}` });
      imageParts.push({ inlineData: { mimeType: refMimeType, data: cleanRef } });
    }
  });

  try {
    const modelName = "gemini-3-flash-preview";
    console.log(`Calling Gemini API with model: ${modelName}`);
    const response = await withRetry(() => ai.models.generateContent({
      model: modelName,
      contents: { parts: imageParts },
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
    }));

    const result = JSON.parse(response.text || "{}");
    // Standardize result values
    return {
      isLivePerson: result.isLivePerson === true,
      isMatch: result.isMatch === true && result.isLivePerson === true,
      matchedId: result.matchedId || null,
      confidence: result.confidence || 0,
      name: result.name || null,
      reason: result.reason || "No reason provided"
    };
  } catch (error: any) {
    if (error?.message?.includes("429") || error?.status === 429) {
      console.error("Gemini Quota Exceeded:", error);
      throw new Error("Gemini API quota exceeded. Auto-scan paused for 2 minutes to allow quota reset.");
    }
    console.error("Gemini Identification Error:", error);
    throw error;
  }
}
