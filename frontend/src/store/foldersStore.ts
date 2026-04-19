import { create } from 'zustand';
import { Folder } from '../types/folder';
import { Request } from '../types/request';
import {
  CreateFolder,
  RenameFolder,
  DeleteFolder,
  ListFolders,
  CreateRequestInFolder,
  MoveRequest,
  MoveRequestToCollection,
} from '../wailsjs/go/main/App';
import { useRequestsStore } from './requestsStore';

interface FoldersState {
  /** Map of collectionId -> folders array */
  foldersByCollection: Record<string, Folder[]>;

  /** Fetch all folders for a collection. */
  fetchFolders: (collectionId: string) => Promise<void>;

  /** Create a new folder inside a collection. Pass parentFolderId="" for root. */
  createFolder: (collectionId: string, parentFolderId: string, name: string) => Promise<Folder>;

  /** Rename a folder. */
  renameFolder: (id: string, name: string) => Promise<void>;

  /**
   * Delete a folder. Requests inside are moved to root.
   * collectionId is needed to refresh the requests store.
   */
  deleteFolder: (id: string, collectionId: string) => Promise<void>;

  /** Create a request inside a folder and add it to the requestsStore. */
  createRequestInFolder: (collectionId: string, folderId: string, name: string) => Promise<Request>;

  /**
   * Move a request to a different folder (or root if folderId="").
   * Refreshes the requests store for the collection.
   */
  moveRequest: (requestId: string, collectionId: string, folderId: string) => Promise<void>;

  /**
   * Move a request to a different collection (and optionally folder).
   * Removes from source collection and adds to target collection.
   */
  moveRequestToCollection: (requestId: string, sourceCollectionId: string, targetCollectionId: string, targetFolderId: string) => Promise<void>;
}

export const useFoldersStore = create<FoldersState>((set) => ({
  foldersByCollection: {},

  fetchFolders: async (collectionId: string) => {
    const folders = await ListFolders(collectionId);
    set((state) => ({
      foldersByCollection: {
        ...state.foldersByCollection,
        [collectionId]: folders ?? [],
      },
    }));
  },

  createFolder: async (collectionId: string, parentFolderId: string, name: string) => {
    const trimmed = name.trim();
    if (!trimmed) throw new Error('Folder name cannot be empty.');
    const folder = await CreateFolder(collectionId, parentFolderId, trimmed);
    set((state) => ({
      foldersByCollection: {
        ...state.foldersByCollection,
        [collectionId]: [...(state.foldersByCollection[collectionId] ?? []), folder],
      },
    }));
    return folder;
  },

  renameFolder: async (id: string, name: string) => {
    await RenameFolder(id, name);
    set((state) => {
      const updated: Record<string, Folder[]> = {};
      for (const [colId, folders] of Object.entries(state.foldersByCollection)) {
        updated[colId] = folders.map((f) => (f.id === id ? { ...f, name } : f));
      }
      return { foldersByCollection: updated };
    });
  },

  deleteFolder: async (id: string, collectionId: string) => {
    await DeleteFolder(id);
    // Remove the folder (and its children) from the store.
    set((state) => {
      const folders = state.foldersByCollection[collectionId] ?? [];
      // Remove the folder and all its descendants.
      const idsToRemove = collectDescendantIds(folders, id);
      idsToRemove.add(id);
      return {
        foldersByCollection: {
          ...state.foldersByCollection,
          [collectionId]: folders.filter((f) => !idsToRemove.has(f.id)),
        },
      };
    });
    // Refresh requests so that moved-to-root requests show up correctly.
    await useRequestsStore.getState().fetchRequests(collectionId);
  },

  createRequestInFolder: async (collectionId: string, folderId: string, name: string) => {
    const trimmed = name.trim();
    if (!trimmed) throw new Error('Request name cannot be empty.');
    const req = await CreateRequestInFolder(collectionId, folderId, trimmed);
    // Add to requestsStore under the collection.
    useRequestsStore.setState((state) => ({
      requestsByCollection: {
        ...state.requestsByCollection,
        [collectionId]: [...(state.requestsByCollection[collectionId] ?? []), req],
      },
    }));
    return req;
  },

  moveRequest: async (requestId: string, collectionId: string, folderId: string) => {
    await MoveRequest(requestId, folderId);
    // Update the request's folder_id in the requestsStore.
    useRequestsStore.setState((state) => {
      const list = state.requestsByCollection[collectionId] ?? [];
      return {
        requestsByCollection: {
          ...state.requestsByCollection,
          [collectionId]: list.map((r) =>
            r.id === requestId ? { ...r, folder_id: folderId || null } : r
          ),
        },
      };
    });
  },

  moveRequestToCollection: async (requestId: string, sourceCollectionId: string, targetCollectionId: string, targetFolderId: string) => {
    await MoveRequestToCollection(requestId, targetCollectionId, targetFolderId);
    // Remove from source collection and add to target collection in the store.
    useRequestsStore.setState((state) => {
      const sourceList = state.requestsByCollection[sourceCollectionId] ?? [];
      const targetList = state.requestsByCollection[targetCollectionId] ?? [];
      const movedRequest = sourceList.find((r) => r.id === requestId);
      return {
        requestsByCollection: {
          ...state.requestsByCollection,
          [sourceCollectionId]: sourceList.filter((r) => r.id !== requestId),
          [targetCollectionId]: movedRequest
            ? [...targetList, { ...movedRequest, collection_id: targetCollectionId, folder_id: targetFolderId || null }]
            : targetList,
        },
      };
    });
  },
}));

/** Collect all descendant folder IDs starting from parentId. */
function collectDescendantIds(folders: Folder[], parentId: string): Set<string> {
  const result = new Set<string>();
  const children = folders.filter((f) => f.parent_folder_id === parentId);
  for (const child of children) {
    result.add(child.id);
    for (const desc of collectDescendantIds(folders, child.id)) {
      result.add(desc);
    }
  }
  return result;
}
