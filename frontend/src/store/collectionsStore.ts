import { create } from 'zustand';
import { Collection } from '../types/collection';
import { CreateCollection, ListCollections } from '../wailsjs/go/main/App';

interface CollectionsState {
  collections: Collection[];
  loading: boolean;
  error: string | null;

  /** Fetch all collections from the backend and populate the store. */
  fetchCollections: () => Promise<void>;

  /** Create a new collection. Returns the created collection or throws. */
  createCollection: (name: string) => Promise<Collection>;
}

export const useCollectionsStore = create<CollectionsState>((set) => ({
  collections: [],
  loading: false,
  error: null,

  fetchCollections: async () => {
    set({ loading: true, error: null });
    try {
      const cols = await ListCollections();
      set({ collections: cols ?? [], loading: false });
    } catch (err) {
      set({ error: String(err), loading: false });
    }
  },

  createCollection: async (name: string) => {
    const trimmed = name.trim();
    if (!trimmed) {
      throw new Error('Collection name cannot be empty.');
    }
    const col = await CreateCollection(trimmed);
    set((state) => ({ collections: [...state.collections, col] }));
    return col;
  },
}));
