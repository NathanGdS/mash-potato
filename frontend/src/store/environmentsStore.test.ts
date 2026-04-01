import { beforeEach, describe, expect, it, vi } from 'vitest';

// Mock the Wails bindings before importing the store
vi.mock('../wailsjs/go/main/App', () => ({
  CreateEnvironment: vi.fn(),
  ListEnvironments: vi.fn(),
  RenameEnvironment: vi.fn(),
  DeleteEnvironment: vi.fn(),
  GetVariables: vi.fn(),
  SetVariable: vi.fn(),
  DeleteVariable: vi.fn(),
  GetActiveEnvironment: vi.fn(),
  SetActiveEnvironment: vi.fn(),
  GetGlobalEnvironmentID: vi.fn(),
  ToggleVariableSecret: vi.fn(),
}));

import * as App from '../wailsjs/go/main/App';
import { useEnvironmentsStore } from './environmentsStore';

const mockEnv = { id: 'env-1', name: 'Development', created_at: '2024-01-01T00:00:00Z', is_global: false };
const mockVar = { id: 1, environment_id: 'env-1', key: 'API_KEY', value: 'secret', is_secret: false };

beforeEach(() => {
  vi.clearAllMocks();
  // Reset store state between tests
  useEnvironmentsStore.setState({ environments: [], loading: false, error: null, variables: {} });
});

describe('fetchEnvironments', () => {
  it('populates environments on success', async () => {
    vi.mocked(App.ListEnvironments).mockResolvedValue([mockEnv]);
    vi.mocked(App.GetGlobalEnvironmentID).mockResolvedValue('__global__');
    await useEnvironmentsStore.getState().fetchEnvironments();
    expect(useEnvironmentsStore.getState().environments).toEqual([mockEnv]);
    expect(useEnvironmentsStore.getState().loading).toBe(false);
    expect(useEnvironmentsStore.getState().error).toBeNull();
  });

  it('sets error on failure', async () => {
    vi.mocked(App.ListEnvironments).mockRejectedValue(new Error('network error'));
    await useEnvironmentsStore.getState().fetchEnvironments();
    expect(useEnvironmentsStore.getState().error).toMatch('network error');
    expect(useEnvironmentsStore.getState().loading).toBe(false);
  });
});

describe('createEnvironment', () => {
  it('appends the new environment to the list', async () => {
    vi.mocked(App.CreateEnvironment).mockResolvedValue(mockEnv);
    const result = await useEnvironmentsStore.getState().createEnvironment('Development');
    expect(result).toEqual(mockEnv);
    expect(useEnvironmentsStore.getState().environments).toContainEqual(mockEnv);
  });

  it('throws when name is empty', async () => {
    await expect(
      useEnvironmentsStore.getState().createEnvironment('   ')
    ).rejects.toThrow('Environment name cannot be empty.');
    expect(App.CreateEnvironment).not.toHaveBeenCalled();
  });

  it('calls CreateEnvironment with trimmed name', async () => {
    vi.mocked(App.CreateEnvironment).mockResolvedValue(mockEnv);
    await useEnvironmentsStore.getState().createEnvironment('  Development  ');
    expect(App.CreateEnvironment).toHaveBeenCalledWith('Development');
  });
});

describe('renameEnvironment', () => {
  it('updates name in state after rename', async () => {
    useEnvironmentsStore.setState({ environments: [mockEnv] });
    vi.mocked(App.RenameEnvironment).mockResolvedValue(undefined);
    await useEnvironmentsStore.getState().renameEnvironment('env-1', 'Staging');
    expect(useEnvironmentsStore.getState().environments[0].name).toBe('Staging');
  });

  it('throws when name is empty', async () => {
    await expect(
      useEnvironmentsStore.getState().renameEnvironment('env-1', '')
    ).rejects.toThrow('Environment name cannot be empty.');
    expect(App.RenameEnvironment).not.toHaveBeenCalled();
  });
});

describe('deleteEnvironment', () => {
  it('removes environment from state', async () => {
    useEnvironmentsStore.setState({ environments: [mockEnv] });
    vi.mocked(App.DeleteEnvironment).mockResolvedValue(undefined);
    await useEnvironmentsStore.getState().deleteEnvironment('env-1');
    expect(useEnvironmentsStore.getState().environments).toHaveLength(0);
  });

  it('removes variables for the deleted environment', async () => {
    useEnvironmentsStore.setState({
      environments: [mockEnv],
      variables: { 'env-1': [mockVar] },
    });
    vi.mocked(App.DeleteEnvironment).mockResolvedValue(undefined);
    await useEnvironmentsStore.getState().deleteEnvironment('env-1');
    expect(useEnvironmentsStore.getState().variables['env-1']).toBeUndefined();
  });
});

describe('setVariable', () => {
  it('appends a new variable to the environment variables list', async () => {
    vi.mocked(App.SetVariable).mockResolvedValue(mockVar);
    vi.mocked(App.GetVariables).mockResolvedValue([mockVar]);
    const result = await useEnvironmentsStore.getState().setVariable('env-1', 'API_KEY', 'secret');
    expect(result).toEqual(mockVar);
    expect(useEnvironmentsStore.getState().variables['env-1']).toContainEqual(mockVar);
  });

  it('updates an existing variable in the list by id', async () => {
    const updated = { ...mockVar, value: 'new-secret' };
    useEnvironmentsStore.setState({ variables: { 'env-1': [mockVar] } });
    vi.mocked(App.SetVariable).mockResolvedValue(updated);
    vi.mocked(App.GetVariables).mockResolvedValue([updated]);
    await useEnvironmentsStore.getState().setVariable('env-1', 'API_KEY', 'new-secret');
    const vars = useEnvironmentsStore.getState().variables['env-1'];
    expect(vars).toHaveLength(1);
    expect(vars[0].value).toBe('new-secret');
  });

  it('calls SetVariable with correct arguments', async () => {
    vi.mocked(App.SetVariable).mockResolvedValue(mockVar);
    await useEnvironmentsStore.getState().setVariable('env-1', 'API_KEY', 'secret');
    expect(App.SetVariable).toHaveBeenCalledWith('env-1', 'API_KEY', 'secret', false);
  });
});

describe('deleteVariable', () => {
  it('removes the variable from state by id', async () => {
    useEnvironmentsStore.setState({ variables: { 'env-1': [mockVar] } });
    vi.mocked(App.DeleteVariable).mockResolvedValue(undefined);
    await useEnvironmentsStore.getState().deleteVariable('env-1', mockVar.id);
    expect(useEnvironmentsStore.getState().variables['env-1']).toHaveLength(0);
  });

  it('calls DeleteVariable with the correct id', async () => {
    useEnvironmentsStore.setState({ variables: { 'env-1': [mockVar] } });
    vi.mocked(App.DeleteVariable).mockResolvedValue(undefined);
    await useEnvironmentsStore.getState().deleteVariable('env-1', mockVar.id);
    expect(App.DeleteVariable).toHaveBeenCalledWith(mockVar.id);
  });
});

describe('toggleVariableSecret', () => {
  const secretVar = { id: 1, environment_id: 'env-1', key: 'API_KEY', value: '***', is_secret: true };

  it('calls ToggleVariableSecret with the correct varId and isSecret flag', async () => {
    vi.mocked(App.ToggleVariableSecret).mockResolvedValue(undefined);
    vi.mocked(App.GetVariables).mockResolvedValue([secretVar]);
    await useEnvironmentsStore.getState().toggleVariableSecret('env-1', mockVar.id, true);
    expect(App.ToggleVariableSecret).toHaveBeenCalledWith(mockVar.id, true);
  });

  it('re-fetches variables after toggling and updates store', async () => {
    useEnvironmentsStore.setState({ variables: { 'env-1': [mockVar] } });
    vi.mocked(App.ToggleVariableSecret).mockResolvedValue(undefined);
    vi.mocked(App.GetVariables).mockResolvedValue([secretVar]);
    await useEnvironmentsStore.getState().toggleVariableSecret('env-1', mockVar.id, true);
    expect(App.GetVariables).toHaveBeenCalledWith('env-1');
    expect(useEnvironmentsStore.getState().variables['env-1']).toEqual([secretVar]);
  });

  it('can toggle a variable back to non-secret', async () => {
    const plainVar = { id: 1, environment_id: 'env-1', key: 'API_KEY', value: 'plaintext', is_secret: false };
    useEnvironmentsStore.setState({ variables: { 'env-1': [secretVar] } });
    vi.mocked(App.ToggleVariableSecret).mockResolvedValue(undefined);
    vi.mocked(App.GetVariables).mockResolvedValue([plainVar]);
    await useEnvironmentsStore.getState().toggleVariableSecret('env-1', secretVar.id, false);
    expect(App.ToggleVariableSecret).toHaveBeenCalledWith(secretVar.id, false);
    expect(useEnvironmentsStore.getState().variables['env-1']).toEqual([plainVar]);
  });

  it('propagates errors thrown by ToggleVariableSecret', async () => {
    vi.mocked(App.ToggleVariableSecret).mockRejectedValue(new Error('backend error'));
    await expect(
      useEnvironmentsStore.getState().toggleVariableSecret('env-1', mockVar.id, true)
    ).rejects.toThrow('backend error');
  });

  it('does not mutate other environments when re-fetching', async () => {
    const otherVar = { id: 2, environment_id: 'env-2', key: 'OTHER', value: 'val', is_secret: false };
    useEnvironmentsStore.setState({ variables: { 'env-1': [mockVar], 'env-2': [otherVar] } });
    vi.mocked(App.ToggleVariableSecret).mockResolvedValue(undefined);
    vi.mocked(App.GetVariables).mockResolvedValue([secretVar]);
    await useEnvironmentsStore.getState().toggleVariableSecret('env-1', mockVar.id, true);
    expect(useEnvironmentsStore.getState().variables['env-2']).toEqual([otherVar]);
  });
});
