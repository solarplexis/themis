import OpenAI from "openai";

interface VerificationResult {
  approved: boolean;
  confidence: number;
  reason: string;
}

function getClient(): OpenAI {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY env var not set");
  return new OpenAI({ apiKey });
}

export async function verifyDeliverable(
  requirements: object,
  deliverable: object
): Promise<VerificationResult> {
  const openai = getClient();

  const prompt = `## Task Requirements
${JSON.stringify(requirements, null, 2)}

## Delivered Work
${JSON.stringify(deliverable, null, 2)}

## Your Task
Analyze whether the delivered work satisfies the requirements. Consider:
1. Does the deliverable address all specified requirements?
2. Is the quality acceptable for the task type?
3. Are there any obvious issues or missing elements?

## Response Format
Respond with ONLY a JSON object in this exact format:
{
  "approved": true/false,
  "confidence": 0-100,
  "reason": "Brief explanation of your decision"
}

Be fair but thorough. When in doubt, lean toward approval if the core requirements are met.`;

  const response = await openai.chat.completions.create({
    model: "gpt-4o",
    messages: [
      {
        role: "system",
        content:
          "You are Themis, an AI arbitrator for agent-to-agent transactions. You verify if delivered work meets requirements. Always respond with valid JSON only.",
      },
      { role: "user", content: prompt },
    ],
    max_tokens: 1024,
    temperature: 0.3,
  });

  const text = response.choices[0].message.content;
  if (!text) throw new Error("Empty response from AI");

  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error("Could not parse AI response as JSON");

  const result = JSON.parse(jsonMatch[0]);

  return {
    approved: Boolean(result.approved),
    confidence: Number(result.confidence) || 50,
    reason: String(result.reason) || "No reason provided",
  };
}
