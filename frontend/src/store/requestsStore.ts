import { create } from 'zustand';
import { Request } from '../types/request';
import { CreateRequest, GetRequest, ListRequests, UpdateRequest, RequestPayload } from '../wailsjs/go/main/App';

interface RequestsState {
  /** Map of collectionId -> requests array */
  requestsByCollection: Record<string, Request[]>;
  loadingFor: Record<string, boolean>;
  errorFor: Record<string, string | null>;

  /** Currently active (open) request in the editor. */
  activeRequest: Request | null;

  /** Fetch all requests for a collection and populate the store. */
  fetchRequests: (collectionId: string) => Promise<void>;

  /** Create a new request inside a collection. Returns the created request or throws. */
  createRequest: (collectionId: string, name: string) => Promise<Request>;

  /** Set the active request by loading it from the backend. */
  openRequest: (id: string) => Promise<void>;

  /** Update request fields in SQLite and refresh the active request. */
  updateRequest: (payload: RequestPayload) => Promise<void>;
}

export const useRequestsStore = create<RequestsState>((set, get) => ({
  requestsByCollection: {},
  loadingFor: {},
  errorFor: {},
  activeRequest: null,

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

  openRequest: async (id: string) => {
    const req = await GetRequest(id);
    set({ activeRequest: req });
  },

  updateRequest: async (payload: RequestPayload) => {
    await UpdateRequest(payload);
    // Refresh active request from store fields (optimistic update)
    const current = get().activeRequest;
    if (current && current.id === payload.id) {
      set({
        activeRequest: {
          ...current,
          method: payload.method,
          url: payload.url,
          headers: payload.headers,
          params: payload.params,
          body_type: payload.body_type,
          body: payload.body,
        },
      });
    }
    // Also update the request in requestsByCollection if present
    set((state) => {
      const collId = current?.collection_id;
      if (!collId) return {};
      const list = state.requestsByCollection[collId];
      if (!list) return {};
      return {
        requestsByCollection: {
          ...state.requestsByCollection,
          [collId]: list.map((r) =>
            r.id === payload.id
              ? { ...r, method: payload.method, url: payload.url, headers: payload.headers, params: payload.params, body_type: payload.body_type, body: payload.body }
              : r
          ),
        },
      };
    });
  },
}));
