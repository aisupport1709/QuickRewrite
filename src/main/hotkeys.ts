import { globalShortcut } from "electron";
import { RewriteAction } from "./config";

export interface HotkeyRegistrationResult {
  ok: boolean;
  failed: string[]; // action ids that failed to register (conflict with another app)
}

let registeredAccelerators: string[] = [];

export function unregisterAllHotkeys(): void {
  for (const accel of registeredAccelerators) {
    globalShortcut.unregister(accel);
  }
  registeredAccelerators = [];
}

export function registerHotkeys(
  actions: RewriteAction[],
  onTrigger: (action: RewriteAction) => void
): HotkeyRegistrationResult {
  unregisterAllHotkeys();
  const failed: string[] = [];

  for (const action of actions) {
    const success = globalShortcut.register(action.hotkey, () => onTrigger(action));
    if (success) {
      registeredAccelerators.push(action.hotkey);
    } else {
      failed.push(action.id);
    }
  }

  return { ok: failed.length === 0, failed };
}

/** Dry-run: checks if an accelerator string can be registered without keeping it registered. */
export function isAcceleratorAvailable(accelerator: string): boolean {
  if (!accelerator) return false;
  if (globalShortcut.isRegistered(accelerator)) {
    // Already registered by us — treat as available for the same slot.
    return registeredAccelerators.includes(accelerator);
  }
  const success = globalShortcut.register(accelerator, () => {});
  if (success) {
    globalShortcut.unregister(accelerator);
  }
  return success;
}
