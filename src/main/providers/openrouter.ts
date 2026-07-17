import { Provider, RewriteOptions, buildSystemPrompt, friendlyHttpError, RewriteError } from "./index";
import { networkErrorMessage } from "./openai";

export const openrouterProvider: Provider = {
  id: "openrouter",
  async rewrite({ apiKey, model, instruction, text, signal }: RewriteOptions): Promise<string> {
    if (!apiKey) throw new RewriteError("No OpenRouter API key configured");

    let res: Response;
    try {
      res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
          "HTTP-Referer": "https://github.com/quickrewrite",
          "X-Title": "QuickRewrite",
        },
        body: JSON.stringify({
          model,
          messages: [
            { role: "system", content: buildSystemPrompt(instruction) },
            { role: "user", content: text },
          ],
        }),
        signal,
      });
    } catch (err) {
      throw new RewriteError(networkErrorMessage(err, "OpenRouter"));
    }

    if (!res.ok) {
      throw new RewriteError(await friendlyHttpError(res, "OpenRouter"));
    }

    const data = await res.json();
    const content: string | undefined = data?.choices?.[0]?.message?.content;
    if (!content || !content.trim()) {
      throw new RewriteError("OpenRouter returned an empty response");
    }
    return content.trim();
  },
};
