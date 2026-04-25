/**
 * Wails runtime re-export shim.
 * The real runtime is injected by Wails at startup as /wails/runtime.js.
 * This stub lets TypeScript resolve the module during `tsc --noEmit`.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const rt = (window as any)?.runtime;

export const EventsOn: (eventName: string, ...args: any[]) => void =
  rt?.EventsOn ?? (() => {});
export const EventsOff: (eventName: string) => void =
  rt?.EventsOff ?? (() => {});
export const EventsEmit: (eventName: string, ...args: any[]) => void =
  rt?.EventsEmit ?? (() => {});

/**
 * Registers a callback for Wails drag-and-drop file events.
 * When useDropTarget is true, Wails adds/removes the CSS class
 * "wails-drop-target-active" on elements under the cursor that have
 * the CSS property --wails-drop-target: drop.
 */
export const OnFileDrop: (
  callback: (x: number, y: number, paths: string[]) => void,
  useDropTarget?: boolean,
) => void = rt?.OnFileDrop ?? (() => {});

/** Removes all registered drag-and-drop listeners. */
export const OnFileDropOff: () => void = rt?.OnFileDropOff ?? (() => {});