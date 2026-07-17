import { clipboard } from "electron";

const POLL_INTERVAL_MS = 1000;

export type ClipboardState = "empty" | "text";

/**
 * True when the clipboard holds only plain text (no files/images), which is
 * the only content this app can rewrite.
 */
export function clipboardHasRewritableText(): boolean {
  const formats = clipboard.availableFormats();
  if (formats.length === 0) return false;
  // Reject non-text payloads (files, images) even if a text representation
  // happens to be present alongside them.
  if (formats.some((f) => f.startsWith("image/") || f === "FileNameW" || f === "public.file-url")) {
    return false;
  }
  const text = clipboard.readText();
  return text.trim().length > 0;
}

export function readClipboardText(): string {
  return clipboard.readText();
}

export function writeClipboardText(text: string): void {
  clipboard.writeText(text);
}

/**
 * Polls the clipboard on an interval and invokes the callback whenever the
 * rewritable-text state changes. Electron has no native clipboard-change
 * event, so polling is the standard approach.
 */
export function watchClipboard(onChange: (state: ClipboardState) => void): () => void {
  let lastState: ClipboardState | null = null;

  const tick = () => {
    const state: ClipboardState = clipboardHasRewritableText() ? "text" : "empty";
    if (state !== lastState) {
      lastState = state;
      onChange(state);
    }
  };

  tick(); // emit initial state immediately
  const interval = setInterval(tick, POLL_INTERVAL_MS);
  return () => clearInterval(interval);
}
