import { create } from 'zustand';
import { SendRequest, ResponseResult } from '../wailsjs/go/main/App';

interface ResponseState {
  /** Response results keyed by request ID. */
  responses: Record<string, ResponseResult | null>;

  /** The request ID currently displayed in the response panel. */
  activeRequestId: string | null;

  isLoading: boolean;
  error: string | null;

  /** Execute the HTTP request for the given request id. */
  sendRequest: (id: string) => Promise<void>;

  /** Abort an in-flight request by setting a cancel flag. */
  cancelRequest: () => void;

  /** Clear the response for a specific request ID (or the active one if omitted). */
  clearResponse: (id?: string) => void;

  /** Set the active request ID so the panel shows the correct response slot. */
  setActiveRequestId: (id: string | null) => void;

  /** Directly store a response result for a given request ID (e.g. from history). */
  setResponse: (id: string, result: ResponseResult) => void;
}

// Mutable cancel flag lives outside Zustand state so the async closure can read it.
let _cancelFlag = false;

export const useResponseStore = create<ResponseState>((set, get) => ({
  responses: {},
  activeRequestId: null,
  isLoading: false,
  error: null,

  sendRequest: async (id: string) => {
    _cancelFlag = false;
    set((state) => ({
      isLoading: true,
      error: null,
      activeRequestId: id,
      responses: { ...state.responses, [id]: null },
    }));
    try {
      const result = await SendRequest(id);
      // If the user cancelled while we were waiting, discard the result.
      if (_cancelFlag) return;
      set((state) => ({
        responses: { ...state.responses, [id]: result },
        isLoading: false,
      }));
    } catch (err) {
      if (_cancelFlag) return;
      set({ error: String(err), isLoading: false });
    }
  },

  cancelRequest: () => {
    _cancelFlag = true;
    set({ isLoading: false });
  },

  clearResponse: (id?: string) => {
    const targetId = id ?? get().activeRequestId;
    if (!targetId) return;
    set((state) => ({
      responses: { ...state.responses, [targetId]: null },
      error: null,
    }));
  },

  setActiveRequestId: (id: string | null) => {
    set({ activeRequestId: id });
  },

  setResponse: (id: string, result: ResponseResult) => {
    set((state) => ({
      responses: { ...state.responses, [id]: result },
    }));
  },
}));
