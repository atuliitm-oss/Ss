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

export async function identifyTeacher(capturedPhotoBase64: string, teachers: { id: string, name: string, photoUrl: string }[]) {
  const captureMatch = capturedPhotoBase64.match(/^data:(image\/[a-z]+);base64,/);
  const captureMimeType = captureMatch ? captureMatch[1] : "image/jpeg";
  const cleanCapture = (capturedPhotoBase64.split(',')[1] || capturedPhotoBase64).trim();
  
  if (cleanCapture.length < 100) {
    throw new Error("Unable to capture clear image. Please ensure camera is not blocked and try again.");
  }
  
  const prompt = `Task: Identification. 
Gallery: Teacher references.
Goal: Match "CAPTURED PHOTO" face to one gallery entry.
Strictness: isMatch=true ONLY if confidence > 0.8.
Output: JSON only.

{
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

  // Add teacher photos to the request (Reduced to 10 for speed)
  teachers.slice(0, 10).forEach((t) => {
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
            isMatch: { type: Type.BOOLEAN },
            matchedId: { type: Type.STRING },
            confidence: { type: Type.NUMBER },
            name: { type: Type.STRING },
            reason: { type: Type.STRING }
          },
          required: ["isMatch", "matchedId", "confidence", "name", "reason"]
        }
      }
    }));

    const result = JSON.parse(response.text || "{}");
    // Standardize result values
    return {
      isMatch: result.isMatch === true,
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
