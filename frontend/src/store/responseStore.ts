import { create } from 'zustand';
import { SendRequest, ResponseResult } from '../wailsjs/go/main/App';

interface ResponseState {
  response: ResponseResult | null;
  isLoading: boolean;
  error: string | null;

  /** Execute the HTTP request for the given request id. */
  sendRequest: (id: string) => Promise<void>;

  /** Clear previous response and error. */
  clearResponse: () => void;
}

export const useResponseStore = create<ResponseState>((set) => ({
  response: null,
  isLoading: false,
  error: null,

  sendRequest: async (id: string) => {
    set({ isLoading: true, error: null, response: null });
    try {
      const result = await SendRequest(id);
      set({ response: result, isLoading: false });
    } catch (err) {
      set({ error: String(err), isLoading: false });
    }
  },

  clearResponse: () => {
    set({ response: null, error: null });
  },
}));
