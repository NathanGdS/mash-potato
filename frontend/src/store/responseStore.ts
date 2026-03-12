import { create } from 'zustand';
import { SendRequest, ResponseResult } from '../wailsjs/go/main/App';

interface ResponseState {
  response: ResponseResult | null;
  isLoading: boolean;
  error: string | null;

  /** Execute the HTTP request for the given request id. */
  sendRequest: (id: string) => Promise<void>;

  /** Abort an in-flight request by setting a cancel flag. */
  cancelRequest: () => void;

  /** Clear previous response and error. */
  clearResponse: () => void;
}

// Mutable cancel flag lives outside Zustand state so the async closure can read it.
let _cancelFlag = false;

export const useResponseStore = create<ResponseState>((set) => ({
  response: null,
  isLoading: false,
  error: null,

  sendRequest: async (id: string) => {
    _cancelFlag = false;
    set({ isLoading: true, error: null, response: null });
    try {
      const result = await SendRequest(id);
      // If the user cancelled while we were waiting, discard the result.
      if (_cancelFlag) return;
      set({ response: result, isLoading: false });
    } catch (err) {
      if (_cancelFlag) return;
      set({ error: String(err), isLoading: false });
    }
  },

  cancelRequest: () => {
    _cancelFlag = true;
    set({ isLoading: false });
  },

  clearResponse: () => {
    set({ response: null, error: null });
  },
}));
