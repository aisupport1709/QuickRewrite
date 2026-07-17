import Store from "electron-store";
import { safeStorage } from "electron";
import { randomUUID } from "node:crypto";

export type ProviderId = "openai" | "gemini" | "anthropic" | "openrouter";

export interface RewriteAction {
  id: string;
  name: string;
  hotkey: string;
  instruction: string;
}

export interface AppConfig {
  provider: ProviderId;
  model: string;
  apiKeys: Partial<Record<ProviderId, string>>; // encrypted, base64-encoded at rest
  launchAtLogin: boolean;
  actions: RewriteAction[];
}

export const DEFAULT_MODELS: Record<ProviderId, string> = {
  anthropic: "claude-opus-4-8",
  openai: "gpt-4o-mini",
  gemini: "gemini-2.0-flash",
  openrouter: "openai/gpt-4o-mini",
};

const DEFAULT_ACTIONS: RewriteAction[] = [
  {
    id: "fix-grammar",
    name: "Fix grammar",
    hotkey: "CommandOrControl+Alt+1",
    instruction: "Fix spelling and grammar. Keep the original tone and language.",
  },
  {
    id: "professional",
    name: "Professional",
    hotkey: "CommandOrControl+Alt+2",
    instruction: "Rewrite in a professional, polite business tone.",
  },
  {
    id: "shorten",
    name: "Shorten",
    hotkey: "CommandOrControl+Alt+3",
    instruction: "Rewrite more concisely while keeping all key information.",
  },
];

const DEFAULTS: AppConfig = {
  provider: "anthropic",
  model: DEFAULT_MODELS.anthropic,
  apiKeys: {},
  launchAtLogin: false,
  actions: DEFAULT_ACTIONS,
};

const store = new Store<AppConfig>({
  name: "config",
  defaults: DEFAULTS,
});

export function getConfig(): AppConfig {
  return {
    provider: store.get("provider"),
    model: store.get("model"),
    apiKeys: store.get("apiKeys"),
    launchAtLogin: store.get("launchAtLogin"),
    actions: store.get("actions"),
  };
}

export function setProviderAndModel(provider: ProviderId, model: string): void {
  store.set("provider", provider);
  store.set("model", model);
}

export function setLaunchAtLogin(value: boolean): void {
  store.set("launchAtLogin", value);
}

export function setActions(actions: RewriteAction[]): void {
  store.set("actions", actions);
}

export function createAction(partial: Omit<RewriteAction, "id">): RewriteAction {
  const action: RewriteAction = { id: randomUUID(), ...partial };
  const actions = [...getConfig().actions, action];
  setActions(actions);
  return action;
}

/** Encrypts and stores an API key for a provider. Pass an empty string to clear it. */
export function setApiKey(provider: ProviderId, plaintextKey: string): void {
  const apiKeys = { ...getConfig().apiKeys };
  if (!plaintextKey) {
    delete apiKeys[provider];
  } else if (safeStorage.isEncryptionAvailable()) {
    apiKeys[provider] = safeStorage.encryptString(plaintextKey).toString("base64");
  } else {
    // Fallback: store as plaintext if OS-level encryption is unavailable.
    apiKeys[provider] = plaintextKey;
  }
  store.set("apiKeys", apiKeys);
}

/** Decrypts and returns the plaintext API key for a provider, or undefined if unset. */
export function getApiKey(provider: ProviderId): string | undefined {
  const encoded = getConfig().apiKeys[provider];
  if (!encoded) return undefined;
  if (!safeStorage.isEncryptionAvailable()) return encoded;
  try {
    return safeStorage.decryptString(Buffer.from(encoded, "base64"));
  } catch {
    // Value was stored as plaintext fallback (encryption unavailable at write time).
    return encoded;
  }
}

/** Whether a key is configured for a provider, without decrypting it. */
export function hasApiKey(provider: ProviderId): boolean {
  return Boolean(getConfig().apiKeys[provider]);
}
