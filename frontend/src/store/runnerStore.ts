import { create } from 'zustand';

export interface RunnerRequest {
  id: string;
  name: string;
  method: string;
}

export interface RunnerScope {
  scopeName: string;
  collectionId: string;
  folderId: string | null;
  requests: RunnerRequest[];
}

interface RunnerState {
  open: boolean;
  scope: RunnerScope | null;

  /** Open the runner modal with the given scope. */
  openRunner: (scope: RunnerScope) => void;

  /** Close the runner modal. */
  closeRunner: () => void;
}

export const useRunnerStore = create<RunnerState>((set) => ({
  open: false,
  scope: null,

  openRunner: (scope: RunnerScope) => {
    set({ open: true, scope });
  },

  closeRunner: () => {
    set({ open: false, scope: null });
  },
}));
