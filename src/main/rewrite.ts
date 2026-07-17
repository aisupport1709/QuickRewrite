import { Notification } from "electron";
import { RewriteAction, getConfig, getApiKey } from "./config";
import { clipboardHasRewritableText, readClipboardText, writeClipboardText } from "./clipboard";
import { getProvider, RewriteError } from "./providers/index";
import { TrayController } from "./tray";

const REQUEST_TIMEOUT_MS = 60_000;

let inFlight = false;

export async function runRewriteAction(action: RewriteAction, tray: TrayController): Promise<void> {
  if (inFlight) return; // ignore hotkeys while a request is running

  if (!clipboardHasRewritableText()) {
    tray.setError("No text in clipboard");
    return;
  }

  const text = readClipboardText();
  const config = getConfig();
  const apiKey = getApiKey(config.provider);

  if (!apiKey) {
    tray.setError(`No API key set for ${config.provider}`);
    return;
  }

  inFlight = true;
  tray.setState("processing");

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const provider = getProvider(config.provider);
    const result = await provider.rewrite({
      apiKey,
      model: config.model,
      instruction: action.instruction,
      text,
      signal: controller.signal,
    });

    writeClipboardText(result);
    tray.setState("done");
    notify("QuickRewrite", `Rewritten with "${action.name}" — press Ctrl/Cmd+V to paste`);
  } catch (err) {
    const message = err instanceof RewriteError ? err.message : "Unexpected error during rewrite";
    tray.setError(message);
    notify("QuickRewrite — Error", message);
  } finally {
    clearTimeout(timeout);
    inFlight = false;
  }
}

function notify(title: string, body: string): void {
  if (!Notification.isSupported()) return;
  new Notification({ title, body }).show();
}
