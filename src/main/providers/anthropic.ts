import Anthropic from "@anthropic-ai/sdk";
import { Provider, RewriteOptions, buildSystemPrompt, RewriteError } from "./index";

export const anthropicProvider: Provider = {
  id: "anthropic",
  async rewrite({ apiKey, model, instruction, text, signal }: RewriteOptions): Promise<string> {
    if (!apiKey) throw new RewriteError("No Anthropic API key configured");

    const client = new Anthropic({ apiKey });

    let response;
    try {
      response = await client.messages.create(
        {
          model,
          max_tokens: 8192,
          system: buildSystemPrompt(instruction),
          messages: [{ role: "user", content: text }],
        },
        { signal }
      );
    } catch (err: unknown) {
      throw new RewriteError(mapAnthropicError(err));
    }

    const block = response.content.find((b) => b.type === "text");
    if (!block || block.type !== "text" || !block.text.trim()) {
      throw new RewriteError("Anthropic returned an empty response");
    }
    return block.text.trim();
  },
};

function mapAnthropicError(err: unknown): string {
  if (err instanceof Anthropic.AuthenticationError) return "Invalid API key";
  if (err instanceof Anthropic.RateLimitError) return "Rate limited — try again shortly";
  if (err instanceof Anthropic.APIConnectionError) return "Network error contacting Anthropic";
  if (err instanceof Anthropic.APIError) return `Anthropic error: ${err.message}`;
  return err instanceof Error ? err.message : "Unknown Anthropic error";
}
