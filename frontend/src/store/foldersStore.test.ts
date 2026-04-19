import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../wailsjs/go/main/App', () => ({
  CreateFolder: vi.fn(),
  RenameFolder: vi.fn(),
  DeleteFolder: vi.fn(),
  ListFolders: vi.fn(),
  CreateRequestInFolder: vi.fn(),
  MoveRequest: vi.fn(),
  MoveRequestToCollection: vi.fn(),
}));

import * as App from '../wailsjs/go/main/App';
import { useFoldersStore } from './foldersStore';
import { useRequestsStore } from './requestsStore';

const mockRequest = {
  id: 'req-1',
  collection_id: 'col-src',
  folder_id: null,
  name: 'Test Request',
  method: 'GET',
  url: '',
  headers: '[]',
  params: '[]',
  body_type: 'none',
  body: '',
  auth_type: 'none',
  auth_config: '{}',
  timeout_seconds: 30,
  tests: '',
  pre_script: '',
  post_script: '',
  sort_order: 0,
  created_at: '2024-01-01T00:00:00Z',
};

const mockFolder = {
  id: 'folder-1',
  collection_id: 'col-dest',
  parent_folder_id: null,
  name: 'Target Folder',
  created_at: '2024-01-01T00:00:00Z',
};

beforeEach(() => {
  vi.clearAllMocks();
  useFoldersStore.setState({ foldersByCollection: {} });
  useRequestsStore.setState({ requestsByCollection: {} });
});

describe('moveRequest', () => {
  it('calls MoveRequest with correct arguments', async () => {
    vi.mocked(App.MoveRequest).mockResolvedValue(undefined);
    useRequestsStore.setState({
      requestsByCollection: { 'col-1': [mockRequest] },
    });
    await useFoldersStore.getState().moveRequest('req-1', 'col-1', 'folder-1');
    expect(App.MoveRequest).toHaveBeenCalledWith('req-1', 'folder-1');
  });

  it('updates folder_id in requestsStore', async () => {
    vi.mocked(App.MoveRequest).mockResolvedValue(undefined);
    useRequestsStore.setState({
      requestsByCollection: { 'col-1': [mockRequest] },
    });
    await useFoldersStore.getState().moveRequest('req-1', 'col-1', 'folder-1');
    const reqs = useRequestsStore.getState().requestsByCollection['col-1'];
    expect(reqs[0].folder_id).toBe('folder-1');
  });

  it('sets folder_id to null when moving to root', async () => {
    vi.mocked(App.MoveRequest).mockResolvedValue(undefined);
    const reqInFolder = { ...mockRequest, folder_id: 'folder-old' };
    useRequestsStore.setState({
      requestsByCollection: { 'col-1': [reqInFolder] },
    });
    await useFoldersStore.getState().moveRequest('req-1', 'col-1', '');
    const reqs = useRequestsStore.getState().requestsByCollection['col-1'];
    expect(reqs[0].folder_id).toBeNull();
  });
});

describe('moveRequestToCollection', () => {
  it('calls MoveRequestToCollection with correct arguments', async () => {
    vi.mocked(App.MoveRequestToCollection).mockResolvedValue(undefined);
    useRequestsStore.setState({
      requestsByCollection: { 'col-src': [mockRequest], 'col-dest': [] },
    });
    await useFoldersStore.getState().moveRequestToCollection('req-1', 'col-src', 'col-dest', '');
    expect(App.MoveRequestToCollection).toHaveBeenCalledWith('req-1', 'col-dest', '');
  });

  it('removes request from source collection', async () => {
    vi.mocked(App.MoveRequestToCollection).mockResolvedValue(undefined);
    useRequestsStore.setState({
      requestsByCollection: { 'col-src': [mockRequest], 'col-dest': [] },
    });
    await useFoldersStore.getState().moveRequestToCollection('req-1', 'col-src', 'col-dest', '');
    const srcReqs = useRequestsStore.getState().requestsByCollection['col-src'];
    expect(srcReqs).toHaveLength(0);
  });

  it('adds request to target collection', async () => {
    vi.mocked(App.MoveRequestToCollection).mockResolvedValue(undefined);
    useRequestsStore.setState({
      requestsByCollection: { 'col-src': [mockRequest], 'col-dest': [] },
    });
    await useFoldersStore.getState().moveRequestToCollection('req-1', 'col-src', 'col-dest', '');
    const destReqs = useRequestsStore.getState().requestsByCollection['col-dest'];
    expect(destReqs).toHaveLength(1);
    expect(destReqs[0].id).toBe('req-1');
  });

  it('updates collection_id on the moved request', async () => {
    vi.mocked(App.MoveRequestToCollection).mockResolvedValue(undefined);
    useRequestsStore.setState({
      requestsByCollection: { 'col-src': [mockRequest], 'col-dest': [] },
    });
    await useFoldersStore.getState().moveRequestToCollection('req-1', 'col-src', 'col-dest', '');
    const destReqs = useRequestsStore.getState().requestsByCollection['col-dest'];
    expect(destReqs[0].collection_id).toBe('col-dest');
  });

  it('sets folder_id when moving to a folder', async () => {
    vi.mocked(App.MoveRequestToCollection).mockResolvedValue(undefined);
    useRequestsStore.setState({
      requestsByCollection: { 'col-src': [mockRequest], 'col-dest': [] },
    });
    await useFoldersStore.getState().moveRequestToCollection('req-1', 'col-src', 'col-dest', 'folder-1');
    const destReqs = useRequestsStore.getState().requestsByCollection['col-dest'];
    expect(destReqs[0].folder_id).toBe('folder-1');
  });

  it('sets folder_id to null when moving to root', async () => {
    vi.mocked(App.MoveRequestToCollection).mockResolvedValue(undefined);
    const reqInFolder = { ...mockRequest, folder_id: 'folder-old' };
    useRequestsStore.setState({
      requestsByCollection: { 'col-src': [reqInFolder], 'col-dest': [] },
    });
    await useFoldersStore.getState().moveRequestToCollection('req-1', 'col-src', 'col-dest', '');
    const destReqs = useRequestsStore.getState().requestsByCollection['col-dest'];
    expect(destReqs[0].folder_id).toBeNull();
  });

  it('preserves other requests in source collection', async () => {
    vi.mocked(App.MoveRequestToCollection).mockResolvedValue(undefined);
    const otherReq = { ...mockRequest, id: 'req-other' };
    useRequestsStore.setState({
      requestsByCollection: { 'col-src': [mockRequest, otherReq], 'col-dest': [] },
    });
    await useFoldersStore.getState().moveRequestToCollection('req-1', 'col-src', 'col-dest', '');
    const srcReqs = useRequestsStore.getState().requestsByCollection['col-src'];
    expect(srcReqs).toHaveLength(1);
    expect(srcReqs[0].id).toBe('req-other');
  });

  it('preserves existing requests in target collection', async () => {
    vi.mocked(App.MoveRequestToCollection).mockResolvedValue(undefined);
    const existingReq = { ...mockRequest, id: 'req-existing', collection_id: 'col-dest' };
    useRequestsStore.setState({
      requestsByCollection: { 'col-src': [mockRequest], 'col-dest': [existingReq] },
    });
    await useFoldersStore.getState().moveRequestToCollection('req-1', 'col-src', 'col-dest', '');
    const destReqs = useRequestsStore.getState().requestsByCollection['col-dest'];
    expect(destReqs).toHaveLength(2);
    expect(destReqs.map((r) => r.id)).toContain('req-existing');
    expect(destReqs.map((r) => r.id)).toContain('req-1');
  });

  it('preserves all request fields when moving', async () => {
    vi.mocked(App.MoveRequestToCollection).mockResolvedValue(undefined);
    const fullReq = {
      ...mockRequest,
      method: 'POST',
      url: 'https://api.example.com',
      body_type: 'json',
      body: '{"key":"value"}',
    };
    useRequestsStore.setState({
      requestsByCollection: { 'col-src': [fullReq], 'col-dest': [] },
    });
    await useFoldersStore.getState().moveRequestToCollection('req-1', 'col-src', 'col-dest', '');
    const destReqs = useRequestsStore.getState().requestsByCollection['col-dest'];
    expect(destReqs[0].method).toBe('POST');
    expect(destReqs[0].url).toBe('https://api.example.com');
    expect(destReqs[0].body_type).toBe('json');
    expect(destReqs[0].body).toBe('{"key":"value"}');
  });
});

describe('fetchFolders', () => {
  it('populates folders for a collection', async () => {
    vi.mocked(App.ListFolders).mockResolvedValue([mockFolder]);
    await useFoldersStore.getState().fetchFolders('col-dest');
    expect(useFoldersStore.getState().foldersByCollection['col-dest']).toEqual([mockFolder]);
  });

  it('sets empty array on no folders', async () => {
    vi.mocked(App.ListFolders).mockResolvedValue([]);
    await useFoldersStore.getState().fetchFolders('col-empty');
    expect(useFoldersStore.getState().foldersByCollection['col-empty']).toEqual([]);
  });
});

describe('createFolder', () => {
  it('appends the new folder to the collection', async () => {
    vi.mocked(App.CreateFolder).mockResolvedValue(mockFolder);
    const result = await useFoldersStore.getState().createFolder('col-dest', '', 'Target Folder');
    expect(result).toEqual(mockFolder);
    expect(useFoldersStore.getState().foldersByCollection['col-dest']).toContainEqual(mockFolder);
  });

  it('throws when name is empty', async () => {
    await expect(
      useFoldersStore.getState().createFolder('col-dest', '', '   ')
    ).rejects.toThrow('Folder name cannot be empty.');
    expect(App.CreateFolder).not.toHaveBeenCalled();
  });
});

describe('renameFolder', () => {
  it('updates name in state', async () => {
    useFoldersStore.setState({ foldersByCollection: { 'col-1': [mockFolder] } });
    vi.mocked(App.RenameFolder).mockResolvedValue(undefined);
    await useFoldersStore.getState().renameFolder('folder-1', 'Renamed Folder');
    const folders = useFoldersStore.getState().foldersByCollection['col-1'];
    expect(folders[0].name).toBe('Renamed Folder');
  });
});

describe('deleteFolder', () => {
  it('removes folder from state', async () => {
    useFoldersStore.setState({ foldersByCollection: { 'col-1': [mockFolder] } });
    vi.mocked(App.DeleteFolder).mockResolvedValue(undefined);
    await useFoldersStore.getState().deleteFolder('folder-1', 'col-1');
    expect(useFoldersStore.getState().foldersByCollection['col-1']).toHaveLength(0);
  });

  it('removes descendant folders', async () => {
    const childFolder = {
      id: 'folder-child',
      collection_id: 'col-1',
      parent_folder_id: 'folder-1',
      name: 'Child',
      created_at: '2024-01-01T00:00:00Z',
    };
    useFoldersStore.setState({ foldersByCollection: { 'col-1': [mockFolder, childFolder] } });
    vi.mocked(App.DeleteFolder).mockResolvedValue(undefined);
    await useFoldersStore.getState().deleteFolder('folder-1', 'col-1');
    expect(useFoldersStore.getState().foldersByCollection['col-1']).toHaveLength(0);
  });
});
