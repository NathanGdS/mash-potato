import { create } from 'zustand';
import { HistoryEntry, GetHistory, ClearHistory } from '../wailsjs/go/main/App';

export type { HistoryEntry };

interface HistoryState {
  entries: HistoryEntry[];
  loading: boolean;
  error: string | null;

  /** Fetch the last 100 history entries from the backend. */
  fetchHistory: () => Promise<void>;

  /** Clear all history entries. */
  clearHistory: () => Promise<void>;
}

export const useHistoryStore = create<HistoryState>((set) => ({
  entries: [],
  loading: false,
  error: null,

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
}));
