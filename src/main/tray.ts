import { Tray, Menu, nativeImage, app } from "electron";
import path from "node:path";
import { RewriteAction } from "./config";

export type TrayState = "empty" | "ready" | "processing" | "done" | "error";

const STATE_LABELS: Record<TrayState, string> = {
  empty: "Clipboard empty",
  ready: "Ready to rewrite",
  processing: "Rewriting…",
  done: "Rewritten — press Ctrl/Cmd+V to paste",
  error: "Error",
};

const DONE_REVERT_MS = 3000;
const ERROR_REVERT_MS = 5000;

function iconPath(state: TrayState): string {
  // In dev, assets are copied to dist/assets by esbuild.config.mjs.
  const base = path.join(__dirname, "..", "assets", "icons");
  const file = process.platform === "darwin" ? `tray-${state}Template.png` : `tray-${state}.png`;
  return path.join(base, file);
}

export class TrayController {
  private tray: Tray;
  private state: TrayState = "empty";
  private preErrorState: TrayState = "empty";
  private lastError: string | null = null;
  private revertTimer: NodeJS.Timeout | null = null;

  private actions: RewriteAction[] = [];
  private onActionClick: (action: RewriteAction) => void;
  private onOpenSettings: () => void;

  constructor(opts: {
    actions: RewriteAction[];
    onActionClick: (action: RewriteAction) => void;
    onOpenSettings: () => void;
  }) {
    this.actions = opts.actions;
    this.onActionClick = opts.onActionClick;
    this.onOpenSettings = opts.onOpenSettings;

    const img = nativeImage.createFromPath(iconPath("empty"));
    this.tray = new Tray(img.isEmpty() ? nativeImage.createEmpty() : img);
    if (process.platform === "darwin") this.tray.setImage(this.loadImage("empty"));
    this.render();
  }

  updateActions(actions: RewriteAction[]): void {
    this.actions = actions;
    this.render();
  }

  setState(state: TrayState): void {
    if (this.revertTimer) {
      clearTimeout(this.revertTimer);
      this.revertTimer = null;
    }
    if (state !== "error" && state !== "done") {
      this.preErrorState = state;
    }
    this.state = state;
    this.applyIcon();
    this.render();

    if (state === "done") {
      this.revertTimer = setTimeout(() => this.setState(this.preErrorState), DONE_REVERT_MS);
    } else if (state === "error") {
      this.revertTimer = setTimeout(() => this.setState(this.preErrorState), ERROR_REVERT_MS);
    }
  }

  setError(message: string): void {
    this.lastError = message;
    this.setState("error");
  }

  getState(): TrayState {
    return this.state;
  }

  private loadImage(state: TrayState) {
    const img = nativeImage.createFromPath(iconPath(state));
    if (process.platform === "darwin") img.setTemplateImage(true);
    return img;
  }

  private applyIcon(): void {
    const img = this.loadImage(this.state);
    this.tray.setImage(img.isEmpty() ? nativeImage.createEmpty() : img);
  }

  private render(): void {
    const statusLabel = this.state === "error" && this.lastError
      ? `Error: ${this.lastError}`
      : STATE_LABELS[this.state];

    this.tray.setToolTip(`QuickRewrite — ${statusLabel}`);

    const actionItems = this.actions.map((action) => ({
      label: `${action.name}  (${formatAccelerator(action.hotkey)})`,
      click: () => this.onActionClick(action),
    }));

    const menu = Menu.buildFromTemplate([
      { label: statusLabel, enabled: false },
      { type: "separator" },
      ...actionItems,
      { type: "separator" },
      { label: "Settings…", click: () => this.onOpenSettings() },
      { label: "Quit", click: () => app.quit() },
    ]);

    this.tray.setContextMenu(menu);
  }
}

function formatAccelerator(accelerator: string): string {
  const isMac = process.platform === "darwin";
  return accelerator
    .replace("CommandOrControl", isMac ? "Cmd" : "Ctrl")
    .replace(/\+/g, isMac ? "" : "+");
}
