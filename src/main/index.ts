import { app } from "electron";
import { getConfig } from "./config";
import { watchClipboard } from "./clipboard";
import { TrayController } from "./tray";
import { registerHotkeys, unregisterAllHotkeys } from "./hotkeys";
import { runRewriteAction } from "./rewrite";
import { openSettingsWindow } from "./settingsWindow";

// Single-instance lock — only one tray icon should ever run.
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on("second-instance", () => {
    // Another launch attempt happened; nothing to focus (no main window) —
    // settings can be reopened from the tray.
  });

  app.whenReady().then(main);
}

function main(): void {
  if (process.platform === "darwin") {
    app.dock?.hide();
  }

  const tray = new TrayController({
    actions: getConfig().actions,
    onActionClick: (action) => runRewriteAction(action, tray),
    onOpenSettings: () => openSettingsWindow(tray),
  });

  // Sync login-item state with stored preference on startup (handles cases
  // where the OS setting drifted, e.g. user removed it manually). Only
  // touch it when enabled — and never let a native OS error (e.g. macOS
  // rejecting registration for an unsigned/dev-mode app) block startup.
  const config = getConfig();
  if (config.launchAtLogin) {
    try {
      app.setLoginItemSettings({ openAtLogin: true });
    } catch (err) {
      console.error("Failed to sync login item setting:", err);
    }
  }

  registerHotkeys(config.actions, (action) => runRewriteAction(action, tray));

  watchClipboard((state) => {
    // Don't clobber processing/done/error states with a plain clipboard-poll update.
    const current = tray.getState();
    if (current === "processing" || current === "done" || current === "error") return;
    tray.setState(state === "text" ? "ready" : "empty");
  });

  app.on("window-all-closed", () => {
    // Tray app — never quit when the settings window closes.
  });
}

app.on("before-quit", () => {
  (app as unknown as { isQuitting: boolean }).isQuitting = true;
  unregisterAllHotkeys();
});
