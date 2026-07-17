import type { SettingsBridge } from "../../preload/settings";
import type { AppConfig, ProviderId, RewriteAction } from "../../main/config";

declare global {
  interface Window {
    quickrewrite: SettingsBridge;
  }
}

const bridge = window.quickrewrite;

const DEFAULT_MODEL_HINT: Record<ProviderId, string> = {
  anthropic: "claude-opus-4-8",
  openai: "gpt-4o-mini",
  gemini: "gemini-2.0-flash",
  openrouter: "openai/gpt-4o-mini",
};

const providerSelect = document.getElementById("provider") as HTMLSelectElement;
const modelInput = document.getElementById("model") as HTMLInputElement;
const apiKeyInput = document.getElementById("apiKey") as HTMLInputElement;
const saveKeyBtn = document.getElementById("saveKey") as HTMLButtonElement;
const testKeyBtn = document.getElementById("testKey") as HTMLButtonElement;
const keyStatus = document.getElementById("keyStatus") as HTMLDivElement;
const testStatus = document.getElementById("testStatus") as HTMLDivElement;
const actionsList = document.getElementById("actionsList") as HTMLDivElement;
const addActionBtn = document.getElementById("addAction") as HTMLButtonElement;
const launchAtLoginInput = document.getElementById("launchAtLogin") as HTMLInputElement;
const actionRowTemplate = document.getElementById("actionRowTemplate") as HTMLTemplateElement;

let currentConfig: AppConfig & { keySet: Record<ProviderId, boolean> };

async function init(): Promise<void> {
  currentConfig = await bridge.getConfig();

  providerSelect.value = currentConfig.provider;
  modelInput.value = currentConfig.model;
  modelInput.placeholder = DEFAULT_MODEL_HINT[currentConfig.provider];
  launchAtLoginInput.checked = currentConfig.launchAtLogin;
  updateKeyStatus();
  renderActions(currentConfig.actions);

  providerSelect.addEventListener("change", onProviderChange);
  modelInput.addEventListener("blur", saveProviderAndModel);
  saveKeyBtn.addEventListener("click", saveApiKey);
  testKeyBtn.addEventListener("click", testApiKey);
  addActionBtn.addEventListener("click", addAction);
  launchAtLoginInput.addEventListener("change", async () => {
    const desired = launchAtLoginInput.checked;
    const result = await bridge.setLaunchAtLogin(desired);
    if (!result.ok) {
      launchAtLoginInput.checked = !desired;
      alert(result.error || "Failed to update login item setting.");
    }
  });
}

async function onProviderChange(): Promise<void> {
  const provider = providerSelect.value as ProviderId;
  modelInput.placeholder = DEFAULT_MODEL_HINT[provider];
  currentConfig = await bridge.getConfig();
  updateKeyStatus();
  await saveProviderAndModel();
}

async function saveProviderAndModel(): Promise<void> {
  const provider = providerSelect.value as ProviderId;
  const model = modelInput.value.trim() || DEFAULT_MODEL_HINT[provider];
  await bridge.setProviderAndModel(provider, model);
}

function updateKeyStatus(): void {
  const provider = providerSelect.value as ProviderId;
  const has = currentConfig.keySet[provider];
  keyStatus.textContent = has ? "API key is set." : "No API key set for this provider.";
  keyStatus.className = `status ${has ? "ok" : ""}`;
  apiKeyInput.value = "";
  testStatus.textContent = "";
  testStatus.className = "status";
}

async function saveApiKey(): Promise<void> {
  const provider = providerSelect.value as ProviderId;
  const key = apiKeyInput.value;
  if (!key) return;
  await bridge.setApiKey(provider, key);
  currentConfig = await bridge.getConfig();
  updateKeyStatus();
  keyStatus.textContent = "API key saved.";
  keyStatus.className = "status ok";
}

async function testApiKey(): Promise<void> {
  const provider = providerSelect.value as ProviderId;
  const model = modelInput.value.trim() || DEFAULT_MODEL_HINT[provider];
  const key = apiKeyInput.value;
  if (!key) {
    testStatus.textContent = "Enter an API key to test.";
    testStatus.className = "status error";
    return;
  }
  testStatus.textContent = "Testing…";
  testStatus.className = "status";
  const result = await bridge.testApiKey(provider, model, key);
  testStatus.textContent = result.message;
  testStatus.className = `status ${result.ok ? "ok" : "error"}`;
}

function renderActions(actions: RewriteAction[]): void {
  actionsList.innerHTML = "";
  for (const action of actions) {
    actionsList.appendChild(buildActionRow(action));
  }
}

function buildActionRow(action: RewriteAction): HTMLElement {
  const fragment = actionRowTemplate.content.cloneNode(true) as DocumentFragment;
  const row = fragment.querySelector(".action-row") as HTMLDivElement;
  row.dataset.id = action.id;

  const nameInput = row.querySelector(".action-name") as HTMLInputElement;
  const hotkeyInput = row.querySelector(".action-hotkey") as HTMLInputElement;
  const instructionInput = row.querySelector(".action-instruction") as HTMLTextAreaElement;
  const saveBtn = row.querySelector(".action-save") as HTMLButtonElement;
  const deleteBtn = row.querySelector(".action-delete") as HTMLButtonElement;
  const status = row.querySelector(".action-status") as HTMLDivElement;

  nameInput.value = action.name;
  hotkeyInput.value = formatAccelerator(action.hotkey);
  hotkeyInput.dataset.raw = action.hotkey;
  instructionInput.value = action.instruction;

  hotkeyInput.addEventListener("click", () => startRecording(hotkeyInput));

  saveBtn.addEventListener("click", async () => {
    const updated: RewriteAction = {
      id: action.id,
      name: nameInput.value.trim() || "Untitled",
      hotkey: hotkeyInput.dataset.raw || action.hotkey,
      instruction: instructionInput.value.trim(),
    };
    const result = await bridge.updateAction(updated);
    if (result.ok) {
      action.name = updated.name;
      action.hotkey = updated.hotkey;
      action.instruction = updated.instruction;
      status.textContent = "Saved.";
      status.className = "status ok";
    } else {
      status.textContent = result.error || "Failed to save.";
      status.className = "status error";
    }
  });

  deleteBtn.addEventListener("click", async () => {
    await bridge.deleteAction(action.id);
    row.remove();
  });

  return row;
}

function startRecording(input: HTMLInputElement): void {
  const original = input.value;
  input.value = "Press keys…";
  input.classList.add("recording");

  const handler = (e: KeyboardEvent) => {
    e.preventDefault();
    if (e.key === "Escape") {
      cleanup();
      input.value = original;
      return;
    }
    if (["Control", "Alt", "Shift", "Meta"].includes(e.key)) return;

    const parts: string[] = [];
    if (e.ctrlKey || e.metaKey) parts.push("CommandOrControl");
    if (e.altKey) parts.push("Alt");
    if (e.shiftKey) parts.push("Shift");
    parts.push(normalizeKey(e.key));

    const accelerator = parts.join("+");
    cleanup();
    input.value = formatAccelerator(accelerator);
    input.dataset.raw = accelerator;
  };

  const cleanup = () => {
    window.removeEventListener("keydown", handler, true);
    input.classList.remove("recording");
  };

  window.addEventListener("keydown", handler, true);
}

function normalizeKey(key: string): string {
  if (/^[a-z]$/i.test(key)) return key.toUpperCase();
  if (/^[0-9]$/.test(key)) return key;
  const map: Record<string, string> = {
    " ": "Space",
    ArrowUp: "Up",
    ArrowDown: "Down",
    ArrowLeft: "Left",
    ArrowRight: "Right",
  };
  return map[key] || key;
}

function formatAccelerator(accelerator: string): string {
  const isMac = navigator.platform.toLowerCase().includes("mac");
  return accelerator
    .split("+")
    .map((part) => (part === "CommandOrControl" ? (isMac ? "Cmd" : "Ctrl") : part))
    .join(isMac ? "" : "+");
}

async function addAction(): Promise<void> {
  const result = await bridge.addAction({
    name: "New action",
    hotkey: "",
    instruction: "",
  });
  if (result.ok && "action" in result) {
    const row = buildActionRow((result as { action: RewriteAction }).action);
    actionsList.appendChild(row);
  }
}

init();
