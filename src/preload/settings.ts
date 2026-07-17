import { contextBridge, ipcRenderer } from "electron";
import type { AppConfig, ProviderId, RewriteAction } from "../main/config";

export interface SettingsBridge {
  getConfig(): Promise<AppConfig & { keySet: Record<ProviderId, boolean> }>;
  setProviderAndModel(provider: ProviderId, model: string): Promise<void>;
  setApiKey(provider: ProviderId, key: string): Promise<void>;
  testApiKey(provider: ProviderId, model: string, key: string): Promise<{ ok: boolean; message: string }>;
  setLaunchAtLogin(value: boolean): Promise<{ ok: boolean; error?: string }>;
  addAction(action: Omit<RewriteAction, "id">): Promise<{ ok: boolean; error?: string }>;
  updateAction(action: RewriteAction): Promise<{ ok: boolean; error?: string }>;
  deleteAction(id: string): Promise<void>;
  checkHotkeyAvailable(hotkey: string, ignoreActionId?: string): Promise<boolean>;
}

const bridge: SettingsBridge = {
  getConfig: () => ipcRenderer.invoke("settings:getConfig"),
  setProviderAndModel: (provider, model) => ipcRenderer.invoke("settings:setProviderAndModel", provider, model),
  setApiKey: (provider, key) => ipcRenderer.invoke("settings:setApiKey", provider, key),
  testApiKey: (provider, model, key) => ipcRenderer.invoke("settings:testApiKey", provider, model, key),
  setLaunchAtLogin: (value) => ipcRenderer.invoke("settings:setLaunchAtLogin", value),
  addAction: (action) => ipcRenderer.invoke("settings:addAction", action),
  updateAction: (action) => ipcRenderer.invoke("settings:updateAction", action),
  deleteAction: (id) => ipcRenderer.invoke("settings:deleteAction", id),
  checkHotkeyAvailable: (hotkey, ignoreActionId) =>
    ipcRenderer.invoke("settings:checkHotkeyAvailable", hotkey, ignoreActionId),
};

contextBridge.exposeInMainWorld("quickrewrite", bridge);
