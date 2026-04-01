import { create } from 'zustand';
import { Environment } from '../types/environment';
import {
  CreateEnvironment,
  DeleteEnvironment,
  DeleteVariable,
  EnvironmentVariable,
  GetActiveEnvironment,
  GetGlobalEnvironmentID,
  GetVariables,
  ListEnvironments,
  RenameEnvironment,
  SetActiveEnvironment,
  SetSecretVariable,
  SetVariable,
  ToggleVariableSecret,
} from '../wailsjs/go/main/App';

interface EnvironmentsState {
  environments: Environment[];
  loading: boolean;
  error: string | null;
  activeEnvironmentId: string;
  /** ID of the built-in Global environment (never changes after first load). */
  globalEnvironmentId: string;

  /** Variables keyed by environment id. */
  variables: Record<string, EnvironmentVariable[]>;

  /** Fetch all environments from the backend and populate the store. */
  fetchEnvironments: () => Promise<void>;

  /** Create a new environment. Returns the created environment or throws. */
  createEnvironment: (name: string) => Promise<Environment>;

  /** Rename an existing environment by id. Throws on empty name or backend error. */
  renameEnvironment: (id: string, name: string) => Promise<void>;

  /** Delete an environment by id. Throws on backend error. */
  deleteEnvironment: (id: string) => Promise<void>;

  /** Load the active environment id from the backend into the store. */
  fetchActiveEnvironment: () => Promise<void>;

  /** Persist a new active environment id. Pass empty string to deselect. */
  setActiveEnvironment: (id: string) => Promise<void>;

  /** Fetch all variables for the given environment and store them. */
  fetchVariables: (environmentId: string) => Promise<void>;

  /** Upsert a variable for the given environment. Updates local state on success. */
  setVariable: (environmentId: string, key: string, value: string, isSecret?: boolean) => Promise<EnvironmentVariable>;

  /** Delete a variable by its numeric id. Updates local state on success. */
  deleteVariable: (environmentId: string, variableId: number) => Promise<void>;

  /**
   * Toggle the secret flag for the given variable.
   * Calls ToggleVariableSecret then re-fetches the variable list for the
   * current environment so that masked/unmasked values are in sync.
   */
  toggleVariableSecret: (environmentId: string, varId: number, isSecret: boolean) => Promise<void>;

  /**
   * Re-encrypt a broken secret variable with a new plaintext value.
   * Calls SetSecretVariable then re-fetches the variable list so the broken
   * flag is cleared for the recovered variable.
   */
  setSecretVariable: (environmentId: string, key: string, value: string) => Promise<void>;
}

export const useEnvironmentsStore = create<EnvironmentsState>((set) => ({
  environments: [],
  loading: false,
  error: null,
  activeEnvironmentId: '',
  globalEnvironmentId: '',
  variables: {},

  fetchEnvironments: async () => {
    set({ loading: true, error: null });
    try {
      const [envs, globalId] = await Promise.all([
        ListEnvironments(),
        GetGlobalEnvironmentID(),
      ]);
      set({ environments: envs ?? [], globalEnvironmentId: globalId ?? '', loading: false });
    } catch (err) {
      set({ error: String(err), loading: false });
    }
  },

  createEnvironment: async (name: string) => {
    const trimmed = name.trim();
    if (!trimmed) {
      throw new Error('Environment name cannot be empty.');
    }
    const env = await CreateEnvironment(trimmed);
    set((state) => ({ environments: [...state.environments, env] }));
    return env;
  },

  renameEnvironment: async (id: string, name: string) => {
    const trimmed = name.trim();
    if (!trimmed) {
      throw new Error('Environment name cannot be empty.');
    }
    await RenameEnvironment(id, trimmed);
    set((state) => ({
      environments: state.environments.map((e) =>
        e.id === id ? { ...e, name: trimmed } : e
      ),
    }));
  },

  deleteEnvironment: async (id: string) => {
    await DeleteEnvironment(id);
    set((state) => {
      const { [id]: _, ...rest } = state.variables;
      return {
        environments: state.environments.filter((e) => e.id !== id),
        variables: rest,
      };
    });
  },

  fetchActiveEnvironment: async () => {
    try {
      const id = await GetActiveEnvironment();
      set({ activeEnvironmentId: id ?? '' });
    } catch (err) {
      set({ error: String(err) });
    }
  },

  setActiveEnvironment: async (id: string) => {
    await SetActiveEnvironment(id);
    set({ activeEnvironmentId: id });
  },

  fetchVariables: async (environmentId: string) => {
    const vars = await GetVariables(environmentId);
    set((state) => ({
      variables: { ...state.variables, [environmentId]: vars ?? [] },
    }));
  },

  setVariable: async (environmentId: string, key: string, value: string, isSecret = false) => {
    const v = await SetVariable(environmentId, key, value, isSecret);
    // Re-fetch all variables to ensure local state is fully in sync
    const vars = await GetVariables(environmentId);
    set((state) => ({
      variables: { ...state.variables, [environmentId]: vars ?? [] },
    }));
    return v;
  },

  deleteVariable: async (environmentId: string, variableId: number) => {
    await DeleteVariable(variableId);
    set((state) => ({
      variables: {
        ...state.variables,
        [environmentId]: (state.variables[environmentId] ?? []).filter(
          (v) => v.id !== variableId
        ),
      },
    }));
  },

  toggleVariableSecret: async (environmentId: string, varId: number, isSecret: boolean) => {
    await ToggleVariableSecret(varId, isSecret);
    const vars = await GetVariables(environmentId);
    set((state) => ({
      variables: { ...state.variables, [environmentId]: vars ?? [] },
    }));
  },

  setSecretVariable: async (environmentId: string, key: string, value: string) => {
    await SetSecretVariable(environmentId, key, value);
    const vars = await GetVariables(environmentId);
    set((state) => ({
      variables: { ...state.variables, [environmentId]: vars ?? [] },
    }));
  },
}));
