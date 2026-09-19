import { AnthropicClient, OpenAiCompatibleClient, type LlmClient } from "../vendor/llm.js";

/**
 * The model the desk judges a written rationale with and writes an answer's paragraph
 * with, or null when no key is set, which is a normal state: the note is then left
 * ungraded and the evidence table writes the paragraph itself.
 *
 * Qwen first. It is the sponsor's model, it is the one Kaaval's record runs on, and
 * Bitget's hackathon endpoint carries it, so the desk keeps answering on a host whose
 * Anthropic credit has run out. Claude is the fallback for a host with no Qwen key.
 * Neither can change a grade: grades, patterns and the checklist are code.
 */
export function deskModel(): LlmClient | null {
  if (process.env["QWEN_API_KEY"]) return new OpenAiCompatibleClient();
  if (process.env["ANTHROPIC_API_KEY"]) return new AnthropicClient();
  return null;
}
