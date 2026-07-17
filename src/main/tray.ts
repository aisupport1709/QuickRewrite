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

// Standard macOS menu bar icon size (in points). Source PNGs are rendered
// at 2x this (44px) for Retina crispness; we always resize down to this
// point-size explicitly rather than relying on filename-based @2x
// detection, so the icon renders correctly regardless of source resolution.
const MACOS_TRAY_ICON_SIZE = 22;

// Must match PROCESSING_FRAME_COUNT in scripts/generate-icons.mjs.
const PROCESSING_FRAME_COUNT = 8;
const PROCESSING_FRAME_INTERVAL_MS = 120;

function iconPath(state: TrayState, processingFrame?: number): string {
  // In dev, assets are copied to dist/assets by esbuild.config.mjs.
  const base = path.join(__dirname, "..", "assets", "icons");
  const isMac = process.platform === "darwin";
  if (state === "processing" && processingFrame !== undefined) {
    const file = isMac ? `tray-processing-${processingFrame}Template.png` : `tray-processing-${processingFrame}.png`;
    return path.join(base, file);
  }
  const file = isMac ? `tray-${state}Template.png` : `tray-${state}.png`;
  return path.join(base, file);
}

export class TrayController {
  private tray: Tray;
  private state: TrayState = "empty";
  private preErrorState: TrayState = "empty";
  private lastError: string | null = null;
  private revertTimer: NodeJS.Timeout | null = null;
  private animationTimer: NodeJS.Timeout | null = null;
  private animationFrame = 0;

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

    const initialImage = this.loadImage("empty");
    this.tray = new Tray(initialImage.isEmpty() ? nativeImage.createEmpty() : initialImage);
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
    this.stopAnimation();

    if (state !== "error" && state !== "done") {
      this.preErrorState = state;
    }
    this.state = state;

    if (state === "processing") {
      this.startAnimation();
    } else {
      this.applyIcon();
    }
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

  destroy(): void {
    if (this.revertTimer) clearTimeout(this.revertTimer);
    this.stopAnimation();
  }

  private loadImage(state: TrayState, processingFrame?: number) {
    let img = nativeImage.createFromPath(iconPath(state, processingFrame));
    if (process.platform === "darwin") {
      // Explicitly resize to the correct menu bar point-size — the source
      // PNG is drawn larger (44px) for Retina sharpness, but without this
      // resize Electron has no way to know the intended display size and
      // renders it at full pixel size (i.e. oversized in the menu bar).
      img = img.resize({ width: MACOS_TRAY_ICON_SIZE, height: MACOS_TRAY_ICON_SIZE });
      img.setTemplateImage(true);
    }
    return img;
  }

  private applyIcon(processingFrame?: number): void {
    const img = this.loadImage(this.state, processingFrame);
    this.tray.setImage(img.isEmpty() ? nativeImage.createEmpty() : img);
  }

  private startAnimation(): void {
    this.animationFrame = 0;
    this.applyIcon(this.animationFrame);
    this.animationTimer = setInterval(() => {
      this.animationFrame = (this.animationFrame + 1) % PROCESSING_FRAME_COUNT;
      this.applyIcon(this.animationFrame);
    }, PROCESSING_FRAME_INTERVAL_MS);
  }

  private stopAnimation(): void {
    if (this.animationTimer) {
      clearInterval(this.animationTimer);
      this.animationTimer = null;
    }
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
