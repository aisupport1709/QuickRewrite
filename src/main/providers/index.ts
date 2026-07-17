import { ProviderId } from "../config";
import { anthropicProvider } from "./anthropic";
import { openaiProvider } from "./openai";
import { geminiProvider } from "./gemini";
import { openrouterProvider } from "./openrouter";

export interface RewriteOptions {
  apiKey: string;
  model: string;
  instruction: string;
  text: string;
  signal: AbortSignal;
}

export interface Provider {
  id: ProviderId;
  rewrite(opts: RewriteOptions): Promise<string>;
}

const REGISTRY: Record<ProviderId, Provider> = {
  anthropic: anthropicProvider,
  openai: openaiProvider,
  gemini: geminiProvider,
  openrouter: openrouterProvider,
};

export function getProvider(id: ProviderId): Provider {
  return REGISTRY[id];
}

export function buildSystemPrompt(instruction: string): string {
  return `${instruction}\n\nReturn only the rewritten text. Do not add preamble, explanations, or surrounding quotes.`;
}

/** Maps a fetch Response error into a user-friendly message. */
export async function friendlyHttpError(res: Response, providerName: string): Promise<string> {
  if (res.status === 401 || res.status === 403) return "Invalid API key";
  if (res.status === 429) return "Rate limited — try again shortly";
  if (res.status >= 500) return `${providerName} service error (${res.status})`;
  let detail = "";
  try {
    const body = await res.json();
    detail = body?.error?.message || body?.message || "";
  } catch {
    // ignore body parse failures
  }
  return detail ? `${providerName} error: ${detail}` : `${providerName} request failed (${res.status})`;
}

export class RewriteError extends Error {}
