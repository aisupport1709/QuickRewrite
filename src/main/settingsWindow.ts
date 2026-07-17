import { BrowserWindow, ipcMain, app } from "electron";
import path from "node:path";
import {
  getConfig,
  setProviderAndModel,
  setApiKey,
  getApiKey,
  setLaunchAtLogin,
  createAction,
  setActions,
  ProviderId,
  RewriteAction,
} from "./config";
import { getProvider } from "./providers/index";
import { isAcceleratorAvailable, registerHotkeys } from "./hotkeys";
import { TrayController } from "./tray";
import { runRewriteAction } from "./rewrite";

let win: BrowserWindow | null = null;
let handlersRegistered = false;

export function openSettingsWindow(tray: TrayController): void {
  if (win) {
    win.show();
    win.focus();
    return;
  }

  registerIpcHandlers(tray);

  win = new BrowserWindow({
    width: 640,
    height: 720,
    title: "QuickRewrite Settings",
    resizable: true,
    webPreferences: {
      preload: path.join(__dirname, "..", "preload", "settings.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  win.setMenuBarVisibility(false);
  win.loadFile(path.join(__dirname, "..", "renderer", "settings", "index.html"));

  win.on("close", (e) => {
    // Hide instead of destroy — tray app has no other window to reopen from.
    if (!(app as unknown as { isQuitting?: boolean }).isQuitting) {
      e.preventDefault();
      win?.hide();
    }
  });

  win.on("closed", () => {
    win = null;
  });
}

function registerIpcHandlers(tray: TrayController): void {
  if (handlersRegistered) return;
  handlersRegistered = true;

  ipcMain.handle("settings:getConfig", () => {
    const config = getConfig();
    const providers: ProviderId[] = ["anthropic", "openai", "gemini", "openrouter"];
    const keySet = Object.fromEntries(
      providers.map((p) => [p, Boolean(getApiKey(p))])
    ) as Record<ProviderId, boolean>;
    return { ...config, keySet };
  });

  ipcMain.handle("settings:setProviderAndModel", (_e, provider: ProviderId, model: string) => {
    setProviderAndModel(provider, model);
  });

  ipcMain.handle("settings:setApiKey", (_e, provider: ProviderId, key: string) => {
    setApiKey(provider, key);
  });

  ipcMain.handle(
    "settings:testApiKey",
    async (_e, provider: ProviderId, model: string, key: string) => {
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 15_000);
        try {
          await getProvider(provider).rewrite({
            apiKey: key,
            model,
            instruction: "Reply with the single word: ok",
            text: "test",
            signal: controller.signal,
          });
        } finally {
          clearTimeout(timeout);
        }
        return { ok: true, message: "Connection successful" };
      } catch (err) {
        return { ok: false, message: err instanceof Error ? err.message : "Test failed" };
      }
    }
  );

  ipcMain.handle("settings:setLaunchAtLogin", (_e, value: boolean) => {
    setLaunchAtLogin(value);
    app.setLoginItemSettings({ openAtLogin: value });
  });

  ipcMain.handle("settings:addAction", (_e, action: Omit<RewriteAction, "id">) => {
    if (!isAcceleratorAvailable(action.hotkey)) {
      return { ok: false, error: "Hotkey is already in use by another application" };
    }
    const created = createAction(action);
    reRegisterHotkeys(tray);
    return { ok: true, action: created };
  });

  ipcMain.handle("settings:updateAction", (_e, updated: RewriteAction) => {
    const actions = getConfig().actions;
    const existing = actions.find((a) => a.id === updated.id);
    const hotkeyChanged = existing && existing.hotkey !== updated.hotkey;

    if (hotkeyChanged && !isAcceleratorAvailable(updated.hotkey)) {
      return { ok: false, error: "Hotkey is already in use by another application" };
    }

    const next = actions.map((a) => (a.id === updated.id ? updated : a));
    setActions(next);
    reRegisterHotkeys(tray);
    return { ok: true };
  });

  ipcMain.handle("settings:deleteAction", (_e, id: string) => {
    const next = getConfig().actions.filter((a) => a.id !== id);
    setActions(next);
    reRegisterHotkeys(tray);
  });

  ipcMain.handle(
    "settings:checkHotkeyAvailable",
    (_e, hotkey: string, ignoreActionId?: string) => {
      const actions = getConfig().actions;
      const owner = actions.find((a) => a.hotkey === hotkey);
      if (owner && owner.id !== ignoreActionId) return false;
      return isAcceleratorAvailable(hotkey);
    }
  );

  function reRegisterHotkeys(tray: TrayController): void {
    const actions = getConfig().actions;
    registerHotkeys(actions, (action) => runRewriteAction(action, tray));
    tray.updateActions(actions);
  }
}
