/**
 * Wails runtime re-export shim.
 * The real runtime is injected by Wails at startup as /wails/runtime.js.
 * This stub lets TypeScript resolve the module during `tsc --noEmit`.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const EventsOn = (window as any)?.runtime?.EventsOn ?? (() => {});
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const EventsOff = (window as any)?.runtime?.EventsOff ?? (() => {});
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const EventsEmit = (window as any)?.runtime?.EventsEmit ?? (() => {});
