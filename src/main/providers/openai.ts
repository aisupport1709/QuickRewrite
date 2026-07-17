import { Provider, RewriteOptions, buildSystemPrompt, friendlyHttpError, RewriteError } from "./index";

export const openaiProvider: Provider = {
  id: "openai",
  async rewrite({ apiKey, model, instruction, text, signal }: RewriteOptions): Promise<string> {
    if (!apiKey) throw new RewriteError("No OpenAI API key configured");

    let res: Response;
    try {
      res = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
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
      throw new RewriteError(networkErrorMessage(err, "OpenAI"));
    }

    if (!res.ok) {
      throw new RewriteError(await friendlyHttpError(res, "OpenAI"));
    }

    const data = await res.json();
    const content: string | undefined = data?.choices?.[0]?.message?.content;
    if (!content || !content.trim()) {
      throw new RewriteError("OpenAI returned an empty response");
    }
    return content.trim();
  },
};

export function networkErrorMessage(err: unknown, providerName: string): string {
  if (err instanceof Error && err.name === "AbortError") return `${providerName} request timed out`;
  return `Network error contacting ${providerName}`;
}
