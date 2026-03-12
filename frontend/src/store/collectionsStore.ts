import { create } from 'zustand';
import { Collection } from '../types/collection';
import { CreateCollection, DeleteCollection, ListCollections, RenameCollection } from '../wailsjs/go/main/App';

interface CollectionsState {
  collections: Collection[];
  loading: boolean;
  error: string | null;

  /** Fetch all collections from the backend and populate the store. */
  fetchCollections: () => Promise<void>;

  /** Create a new collection. Returns the created collection or throws. */
  createCollection: (name: string) => Promise<Collection>;

  /** Rename an existing collection by id. Throws on empty name or backend error. */
  renameCollection: (id: string, name: string) => Promise<void>;

  /** Delete a collection by id. Throws on backend error. */
  deleteCollection: (id: string) => Promise<void>;
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

  renameCollection: async (id: string, name: string) => {
    const trimmed = name.trim();
    if (!trimmed) {
      throw new Error('Collection name cannot be empty.');
    }
    await RenameCollection(id, trimmed);
    set((state) => ({
      collections: state.collections.map((c) =>
        c.id === id ? { ...c, name: trimmed } : c
      ),
    }));
  },

  deleteCollection: async (id: string) => {
    await DeleteCollection(id);
    set((state) => ({
      collections: state.collections.filter((c) => c.id !== id),
    }));
  },
}));
