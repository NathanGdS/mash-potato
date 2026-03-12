import { create } from 'zustand';
import { Request } from '../types/request';
import { CreateRequest, ListRequests } from '../wailsjs/go/main/App';

interface RequestsState {
  /** Map of collectionId -> requests array */
  requestsByCollection: Record<string, Request[]>;
  loadingFor: Record<string, boolean>;
  errorFor: Record<string, string | null>;

  /** Fetch all requests for a collection and populate the store. */
  fetchRequests: (collectionId: string) => Promise<void>;

  /** Create a new request inside a collection. Returns the created request or throws. */
  createRequest: (collectionId: string, name: string) => Promise<Request>;
}

export const useRequestsStore = create<RequestsState>((set) => ({
  requestsByCollection: {},
  loadingFor: {},
  errorFor: {},

  fetchRequests: async (collectionId: string) => {
    set((state) => ({
      loadingFor: { ...state.loadingFor, [collectionId]: true },
      errorFor: { ...state.errorFor, [collectionId]: null },
    }));
    try {
      const reqs = await ListRequests(collectionId);
      set((state) => ({
        requestsByCollection: {
          ...state.requestsByCollection,
          [collectionId]: reqs ?? [],
        },
        loadingFor: { ...state.loadingFor, [collectionId]: false },
      }));
    } catch (err) {
      set((state) => ({
        errorFor: { ...state.errorFor, [collectionId]: String(err) },
        loadingFor: { ...state.loadingFor, [collectionId]: false },
      }));
    }
  },

  createRequest: async (collectionId: string, name: string) => {
    const trimmed = name.trim();
    if (!trimmed) {
      throw new Error('Request name cannot be empty.');
    }
    const req = await CreateRequest(collectionId, trimmed);
    set((state) => ({
      requestsByCollection: {
        ...state.requestsByCollection,
        [collectionId]: [...(state.requestsByCollection[collectionId] ?? []), req],
      },
    }));
    return req;
  },
}));
