import OpenAI from "openai";
import { config } from "./config.js";

const openai = new OpenAI({
  apiKey: config.openaiApiKey,
});

/**
 * Verify if delivered work meets the task requirements
 * @param {object} requirements - Task requirements from IPFS
 * @param {object} deliverable - Delivered work from IPFS
 * @returns {Promise<{approved: boolean, reason: string, confidence: number}>}
 */
export async function verifyDeliverable(requirements, deliverable) {
  console.log("[Verifier] Analyzing deliverable against requirements...");

  const prompt = buildVerificationPrompt(requirements, deliverable);

  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        {
          role: "system",
          content: "You are Themis, an AI arbitrator for agent-to-agent transactions. You verify if delivered work meets requirements. Always respond with valid JSON only.",
        },
        {
          role: "user",
          content: prompt,
        },
      ],
      max_tokens: 1024,
      temperature: 0.3,
    });

    const result = parseVerificationResponse(response.choices[0].message.content);
    console.log(`[Verifier] Result: ${result.approved ? "APPROVED" : "REJECTED"} (${result.confidence}% confidence)`);
    console.log(`[Verifier] Reason: ${result.reason}`);

    return result;
  } catch (error) {
    console.error("[Verifier] AI verification failed:", error.message);
    throw error;
  }
}

function buildVerificationPrompt(requirements, deliverable) {
  return `## Task Requirements
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
}

function parseVerificationResponse(text) {
  // Extract JSON from response
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error("Could not parse AI response as JSON");
  }

  const result = JSON.parse(jsonMatch[0]);

  return {
    approved: Boolean(result.approved),
    confidence: Number(result.confidence) || 50,
    reason: String(result.reason) || "No reason provided",
  };
}

const THEMIS_PERSONA_PROMPT = `You are Themis, an AI-powered DeFi escrow arbitrator on Moltbook. You help agents trade safely using smart contract escrow + AI verification.

Your capabilities:
- Create escrows (ETH or MOLT) between a submitter and provider
- AI-verify deliverables against requirements
- Arbitrate disputes
- Job board: agents can post jobs and providers can bid on them
- Clarification Q&A before delivery

Your personality:
- Helpful and knowledgeable about escrow, DeFi, agent commerce
- Concise — Moltbook is social, not docs
- Honest about limitations (e.g., "we don't support milestones yet")
- Gently guide toward structured commands when appropriate
- Never make promises about features that don't exist

When someone asks a question, answer it directly. If their question could be solved with a Themis command, mention it naturally — don't dump the full help menu.

Do NOT respond if the post is spam, completely off-topic, or not actually directed at you (just a passing mention).

Respond with ONLY the reply text. No JSON, no markdown headers. Keep it under 200 words — this is social media, not documentation.`;

function buildConversationPrompt(post, context) {
  let prompt = `A Moltbook user posted this mentioning you:\n\n`;
  prompt += `@${post.author}: "${post.content}"\n\n`;

  if (context.activeEscrowCount !== undefined) {
    prompt += `Current stats: ${context.activeEscrowCount} active escrows, `;
    prompt += `${context.totalCompleted} completed.\n`;
  }
  if (context.openJobCount !== undefined) {
    prompt += `Open jobs on the board: ${context.openJobCount}\n`;
  }

  prompt += `\nWrite a helpful, concise reply.`;
  return prompt;
}

/**
 * Generate a conversational reply to an unstructured mention
 * @param {object} post - { author, content, title }
 * @param {object} context - { activeEscrowCount, totalCompleted, openJobCount }
 * @returns {Promise<string>} The reply text
 */
export async function generateConversationalReply(post, context = {}) {
  console.log("[Verifier] Generating conversational reply...");

  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        { role: "system", content: THEMIS_PERSONA_PROMPT },
        { role: "user", content: buildConversationPrompt(post, context) },
      ],
      max_tokens: 300,
      temperature: 0.7,
    });

    const reply = response.choices[0].message.content;
    console.log(`[Verifier] Generated reply (${reply.length} chars)`);
    return reply;
  } catch (error) {
    console.error("[Verifier] Conversational reply failed:", error.message);
    throw error;
  }
}

/**
 * Verify a dispute - analyze both sides
 * @param {object} requirements - Original task requirements
 * @param {object} deliverable - Delivered work
 * @param {string} buyerClaim - Buyer's dispute reason
 * @param {string} sellerClaim - Seller's response
 * @returns {Promise<{favorSeller: boolean, reason: string}>}
 */
export async function verifyDispute(requirements, deliverable, buyerClaim, sellerClaim) {
  console.log("[Verifier] Analyzing dispute...");

  const prompt = `## Original Task Requirements
${JSON.stringify(requirements, null, 2)}

## Delivered Work
${JSON.stringify(deliverable, null, 2)}

## Submitter's Complaint
${buyerClaim || "No specific complaint provided"}

## Provider's Defense
${sellerClaim || "No defense provided"}

## Your Task
Determine who should receive the escrowed funds. Consider:
1. Did the provider deliver what was promised?
2. Is the submitter's complaint valid?
3. Who acted in good faith?

## Response Format
Respond with ONLY a JSON object:
{
  "favorSeller": true/false,
  "reason": "Explanation of your ruling"
}`;

  const response = await openai.chat.completions.create({
    model: "gpt-4o",
    messages: [
      {
        role: "system",
        content: "You are Themis, an AI arbitrator resolving disputes. Always respond with valid JSON only.",
      },
      { role: "user", content: prompt },
    ],
    max_tokens: 1024,
    temperature: 0.3,
  });

  const jsonMatch = response.choices[0].message.content.match(/\{[\s\S]*\}/);
  const result = JSON.parse(jsonMatch[0]);

  console.log(`[Verifier] Dispute ruling: ${result.favorSeller ? "PROVIDER" : "SUBMITTER"}`);
  return result;
}
