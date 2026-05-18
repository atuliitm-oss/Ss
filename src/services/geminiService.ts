/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export async function identifyTeacher(
  capturedPhotoBase64: string, 
  teachers: { id: string, name: string, photoUrl: string }[],
  options: { matchThreshold?: number, livenessSensitivity?: number } = {}
) {
  try {
    const response = await fetch("/api/identify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ capturedPhotoBase64, teachers, options })
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error || "Failed to identify teacher");
    }

    const result = await response.json();
    
    return {
      isLivePerson: result.isLivePerson === true,
      isMatch: result.isMatch === true && result.isLivePerson === true,
      matchedId: result.matchedId || null,
      confidence: result.confidence || 0,
      name: result.name || null,
      reason: result.reason || "No reason provided"
    };
  } catch (error: any) {
    console.error("Client API Error:", error);
    throw error;
  }
}
