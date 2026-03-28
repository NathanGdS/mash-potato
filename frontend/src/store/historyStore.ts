import { create } from 'zustand';
import { HistoryEntry, GetHistory, ClearHistory } from '../wailsjs/go/main/App';

export type { HistoryEntry };

interface HistoryState {
  entries: HistoryEntry[];
  loading: boolean;
  error: string | null;

  /** Up to 2 entries selected for diffing. */
  diffSelection: HistoryEntry[];

  /** Fetch the last 100 history entries from the backend. */
  fetchHistory: () => Promise<void>;

  /** Clear all history entries. */
  clearHistory: () => Promise<void>;

  /**
   * Toggle an entry in/out of diffSelection (max 2).
   * If already selected: removes it.
   * If not selected and fewer than 2: adds it.
   * If not selected and already 2: FIFO — drops the oldest, appends the new one.
   */
  toggleDiffSelection: (entry: HistoryEntry) => void;

  /** Reset diffSelection to []. */
  clearDiffSelection: () => void;
}

export const useHistoryStore = create<HistoryState>((set, get) => ({
  entries: [],
  loading: false,
  error: null,
  diffSelection: [],

  fetchHistory: async () => {
    set({ loading: true, error: null });
    try {
      const entries = await GetHistory();
      set({ entries: entries ?? [], loading: false });
    } catch (err) {
      set({ error: String(err), loading: false });
    }
  },

  clearHistory: async () => {
    await ClearHistory();
    set({ entries: [] });
  },

  toggleDiffSelection: (entry: HistoryEntry) => {
    const { diffSelection } = get();
    const alreadySelected = diffSelection.some((e) => e.id === entry.id);

    if (alreadySelected) {
      set({ diffSelection: diffSelection.filter((e) => e.id !== entry.id) });
      return;
    }

    if (diffSelection.length < 2) {
      set({ diffSelection: [...diffSelection, entry] });
      return;
    }

    // FIFO: drop oldest (index 0), append new entry
    set({ diffSelection: [diffSelection[1], entry] });
  },

  clearDiffSelection: () => {
    set({ diffSelection: [] });
  },
}));
