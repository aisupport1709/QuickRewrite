import { Provider, RewriteOptions, buildSystemPrompt, friendlyHttpError, RewriteError } from "./index";
import { networkErrorMessage } from "./openai";

export const geminiProvider: Provider = {
  id: "gemini",
  async rewrite({ apiKey, model, instruction, text, signal }: RewriteOptions): Promise<string> {
    if (!apiKey) throw new RewriteError("No Gemini API key configured");

    const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
      model
    )}:generateContent?key=${encodeURIComponent(apiKey)}`;

    let res: Response;
    try {
      res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: buildSystemPrompt(instruction) }] },
          contents: [{ role: "user", parts: [{ text }] }],
        }),
        signal,
      });
    } catch (err) {
      throw new RewriteError(networkErrorMessage(err, "Gemini"));
    }

    if (!res.ok) {
      throw new RewriteError(await friendlyHttpError(res, "Gemini"));
    }

    const data = await res.json();
    const parts = data?.candidates?.[0]?.content?.parts;
    const content: string | undefined = Array.isArray(parts)
      ? parts.map((p: { text?: string }) => p.text ?? "").join("")
      : undefined;

    if (!content || !content.trim()) {
      throw new RewriteError("Gemini returned an empty response");
    }
    return content.trim();
  },
};
