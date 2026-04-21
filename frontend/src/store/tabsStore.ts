import { create } from 'zustand';
import { GetRequest, GetSetting, SetSetting } from '../wailsjs/go/main/App';
import { useRequestsStore } from './requestsStore';
import { useResponseStore } from './responseStore';

export interface RequestTab {
  requestId: string;
  requestName: string;
  method: string;
}

/** Shape stored in the `open_tabs` settings key. */
interface PersistedTabState {
  tabs: string[];
  activeId: string | null;
}

const SETTINGS_KEY = 'open_tabs';

// Debounce handle for persistence writes.
let _saveTimer: ReturnType<typeof setTimeout> | null = null;

function scheduleSave(tabs: RequestTab[], activeTabId: string | null): void {
  if (_saveTimer !== null) clearTimeout(_saveTimer);
  _saveTimer = setTimeout(() => {
    _saveTimer = null;
    const payload: PersistedTabState = {
      tabs: tabs.map((t) => t.requestId),
      activeId: activeTabId,
    };
    SetSetting(SETTINGS_KEY, JSON.stringify(payload)).catch(() => {
      // Best-effort — ignore write failures silently.
    });
  }, 300);
}

interface TabsState {
  openTabs: RequestTab[];
  activeTabId: string | null;
  /** Set of requestIds that have unsaved local edits. */
  dirtyTabs: Set<string>;

  /** Open a tab for the given request; if already open, just focus it. */
  openTab: (request: RequestTab) => void;

  /** Close a tab by requestId. */
  closeTab: (requestId: string) => void;

  /** Set the active tab. Pass null to indicate no tab is focused (e.g. when viewing history). */
  setActiveTab: (requestId: string | null) => void;

  /** Update tab metadata (name/method) when a request changes. */
  updateTab: (requestId: string, updates: Partial<Pick<RequestTab, 'requestName' | 'method'>>) => void;

  /** Mark a tab as having unsaved changes. */
  markDirty: (requestId: string) => void;

  /** Mark a tab as clean (changes saved). */
  markClean: (requestId: string) => void;

  /** Close all tabs. */
  closeAll: () => void;

  /** Close all tabs except the one with the given requestId. */
  closeOthers: (requestId: string) => void;

  /** Close all tabs to the right of the given requestId. */
  closeToRight: (requestId: string) => void;

  /** Close all tabs to the left of the given requestId. */
  closeToLeft: (requestId: string) => void;

  /**
   * Read persisted tab state from SQLite settings, validate each requestId
   * against the DB, and hydrate the store. Silently drops IDs that no longer exist.
   */
  restoreTabs: () => Promise<void>;
}

export const useTabsStore = create<TabsState>((set, get) => ({
  openTabs: [],
  activeTabId: null,
  dirtyTabs: new Set<string>(),

  openTab: (request: RequestTab) => {
    const { openTabs } = get();
    const exists = openTabs.find((t) => t.requestId === request.requestId);
    let nextTabs: RequestTab[];
    let nextActiveId: string;
    if (exists) {
      nextTabs = openTabs;
      nextActiveId = request.requestId;
      set({ activeTabId: nextActiveId });
    } else {
      nextTabs = [...openTabs, request];
      nextActiveId = request.requestId;
      set({ openTabs: nextTabs, activeTabId: nextActiveId });
    }
    scheduleSave(nextTabs, nextActiveId);
  },

  closeTab: (requestId: string) => {
    const { openTabs, activeTabId } = get();
    const idx = openTabs.findIndex((t) => t.requestId === requestId);
    const newTabs = openTabs.filter((t) => t.requestId !== requestId);

    let newActiveId = activeTabId;
    if (activeTabId === requestId) {
      // Pick the tab to the left, or the next one, or null
      if (newTabs.length === 0) {
        newActiveId = null;
      } else if (idx > 0) {
        newActiveId = newTabs[idx - 1].requestId;
      } else {
        newActiveId = newTabs[0].requestId;
      }
    }

    set((state) => {
      const nextDirty = new Set(state.dirtyTabs);
      nextDirty.delete(requestId);
      return { openTabs: newTabs, activeTabId: newActiveId, dirtyTabs: nextDirty };
    });
    scheduleSave(newTabs, newActiveId);
  },

  setActiveTab: (requestId: string | null) => {
    set({ activeTabId: requestId });
    scheduleSave(get().openTabs, requestId);
    useResponseStore.getState().setActiveRequestId(requestId);
  },

  updateTab: (requestId: string, updates) => {
    set((state) => ({
      openTabs: state.openTabs.map((t) =>
        t.requestId === requestId ? { ...t, ...updates } : t
      ),
    }));
    // No need to persist here — tab metadata changes don't affect the ID list.
  },

  markDirty: (requestId: string) => {
    set((state) => {
      if (state.dirtyTabs.has(requestId)) return {};
      const nextDirty = new Set(state.dirtyTabs);
      nextDirty.add(requestId);
      return { dirtyTabs: nextDirty };
    });
  },

  markClean: (requestId: string) => {
    set((state) => {
      if (!state.dirtyTabs.has(requestId)) return {};
      const nextDirty = new Set(state.dirtyTabs);
      nextDirty.delete(requestId);
      return { dirtyTabs: nextDirty };
    });
  },

  closeAll: () => {
    set({
      openTabs: [],
      activeTabId: null,
      dirtyTabs: new Set<string>(),
    });
    scheduleSave([], null);
  },

  closeOthers: (requestId: string) => {
    const { openTabs } = get();
    const newTabs = openTabs.filter((t) => t.requestId === requestId);
    const newActiveId = newTabs.length > 0 ? newTabs[0].requestId : null;
    set((state) => {
      const nextDirty = new Set<string>();
      if (state.dirtyTabs.has(requestId)) nextDirty.add(requestId);
      return { openTabs: newTabs, activeTabId: newActiveId, dirtyTabs: nextDirty };
    });
    scheduleSave(newTabs, newActiveId);
  },

  closeToRight: (requestId: string) => {
    const { openTabs } = get();
    const idx = openTabs.findIndex((t) => t.requestId === requestId);
    const newTabs = idx === -1 ? openTabs : openTabs.slice(0, idx + 1);
    const { activeTabId } = get();
    const newActiveId = newTabs.some((t) => t.requestId === activeTabId)
      ? activeTabId
      : newTabs.length > 0
      ? newTabs[newTabs.length - 1].requestId
      : null;
    set((state) => {
      const keepIds = new Set(newTabs.map((t) => t.requestId));
      const nextDirty = new Set<string>(
        [...state.dirtyTabs].filter((id) => keepIds.has(id))
      );
      return { openTabs: newTabs, activeTabId: newActiveId, dirtyTabs: nextDirty };
    });
    scheduleSave(newTabs, newActiveId);
  },

  closeToLeft: (requestId: string) => {
    const { openTabs } = get();
    const idx = openTabs.findIndex((t) => t.requestId === requestId);
    const newTabs = idx === -1 ? openTabs : openTabs.slice(idx);
    const { activeTabId } = get();
    const newActiveId = newTabs.some((t) => t.requestId === activeTabId)
      ? activeTabId
      : newTabs.length > 0
      ? newTabs[0].requestId
      : null;
    set((state) => {
      const keepIds = new Set(newTabs.map((t) => t.requestId));
      const nextDirty = new Set<string>(
        [...state.dirtyTabs].filter((id) => keepIds.has(id))
      );
      return { openTabs: newTabs, activeTabId: newActiveId, dirtyTabs: nextDirty };
    });
    scheduleSave(newTabs, newActiveId);
  },

  restoreTabs: async () => {
    let raw: string;
    try {
      raw = await GetSetting(SETTINGS_KEY);
    } catch {
      return; // If the call fails, start with no tabs.
    }
    if (!raw) return;

    let persisted: PersistedTabState;
    try {
      persisted = JSON.parse(raw) as PersistedTabState;
    } catch {
      return; // Corrupted JSON — start fresh.
    }

    if (!Array.isArray(persisted.tabs) || persisted.tabs.length === 0) return;

    // Validate each ID against the DB; silently drop missing ones.
    const validated: RequestTab[] = [];
    for (const id of persisted.tabs) {
      try {
        const req = await GetRequest(id);
        validated.push({ requestId: req.id, requestName: req.name, method: req.method });
      } catch {
        // Request no longer exists — skip it.
      }
    }

    if (validated.length === 0) return;

    const activeId = persisted.activeId && validated.some((t) => t.requestId === persisted.activeId)
      ? persisted.activeId
      : validated[0].requestId;

    set({ openTabs: validated, activeTabId: activeId });

    // Hydrate the active request in requestsStore (also sets active response slot).
    if (activeId) {
      useRequestsStore.getState().openRequest(activeId).catch(() => {
        // Best-effort — if it fails, the editor will just be empty.
      });
    }
  },
}));
