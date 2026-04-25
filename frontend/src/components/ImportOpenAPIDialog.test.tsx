import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import ImportOpenAPIDialog from './ImportOpenAPIDialog';

vi.mock('../wailsjs/go/main/App', () => ({
  ImportOpenAPISpec: vi.fn(),
  ImportOpenAPISpecWithResolution: vi.fn(),
  PickOpenAPIFile: vi.fn(),
}));

vi.mock('../wailsjs/runtime/runtime', () => ({
  EventsOn: vi.fn(),
  EventsOff: vi.fn(),
  EventsEmit: vi.fn(),
  OnFileDrop: vi.fn(),
  OnFileDropOff: vi.fn(),
}));

vi.mock('../store/collectionsStore', () => ({
  useCollectionsStore: vi.fn((selector: (s: { fetchCollections: () => Promise<void> }) => unknown) =>
    selector({ fetchCollections: vi.fn().mockResolvedValue(undefined) })
  ),
}));

import { ImportOpenAPISpec, ImportOpenAPISpecWithResolution, PickOpenAPIFile } from '../wailsjs/go/main/App';
import { OnFileDrop, OnFileDropOff } from '../wailsjs/runtime/runtime';

const mockImportOpenAPISpec = ImportOpenAPISpec as ReturnType<typeof vi.fn>;
const mockImportWithResolution = ImportOpenAPISpecWithResolution as ReturnType<typeof vi.fn>;
const mockPickOpenAPIFile = PickOpenAPIFile as ReturnType<typeof vi.fn>;
const mockOnFileDrop = OnFileDrop as ReturnType<typeof vi.fn>;
const mockOnFileDropOff = OnFileDropOff as ReturnType<typeof vi.fn>;

const CONFLICT_ERROR =
  'import conflict: a collection named "Pet Store" already exists (id=abc-123)';

function renderDialog(onClose = vi.fn()) {
  return { onClose, ...render(<ImportOpenAPIDialog onClose={onClose} />) };
}

describe('ImportOpenAPIDialog — initial render', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders the dialog title', () => {
    renderDialog();
    expect(screen.getByText('Import OpenAPI / Swagger')).toBeInTheDocument();
  });

  it('renders a Browse button', () => {
    renderDialog();
    expect(screen.getByRole('button', { name: /browse/i })).toBeInTheDocument();
  });

  it('renders a Cancel button', () => {
    renderDialog();
    expect(screen.getByRole('button', { name: /cancel/i })).toBeInTheDocument();
  });

  it('renders the drag-and-drop zone', () => {
    renderDialog();
    expect(screen.getByLabelText(/drop zone/i)).toBeInTheDocument();
  });

  it('registers Wails OnFileDrop listener on mount', () => {
    renderDialog();
    expect(mockOnFileDrop).toHaveBeenCalledWith(expect.any(Function), true);
  });

  it('calls OnFileDropOff on unmount', () => {
    const { unmount } = renderDialog();
    unmount();
    expect(mockOnFileDropOff).toHaveBeenCalled();
  });

  it('calls onClose when Cancel is clicked', async () => {
    const user = userEvent.setup();
    const { onClose } = renderDialog();
    await user.click(screen.getByRole('button', { name: /cancel/i }));
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('calls onClose when Escape is pressed on the backdrop', () => {
    const { onClose } = renderDialog();
    const backdrop = document.querySelector('.modal-backdrop')!;
    fireEvent.keyDown(backdrop, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledOnce();
  });
});

describe('ImportOpenAPIDialog — Browse button', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockImportOpenAPISpec.mockResolvedValue({ CollectionID: 'c1', RequestCount: 3, FolderCount: 1 });
  });

  it('calls PickOpenAPIFile and then ImportOpenAPISpec with the returned path', async () => {
    mockPickOpenAPIFile.mockResolvedValue('/home/user/petstore.yaml');

    const user = userEvent.setup();
    const { onClose } = renderDialog();

    await user.click(screen.getByRole('button', { name: /browse/i }));

    await waitFor(() => {
      expect(mockPickOpenAPIFile).toHaveBeenCalledOnce();
      expect(mockImportOpenAPISpec).toHaveBeenCalledWith('/home/user/petstore.yaml');
    });

    expect(onClose).toHaveBeenCalledOnce();
  });

  it('does nothing when the user cancels the file dialog', async () => {
    mockPickOpenAPIFile.mockResolvedValue('');

    const user = userEvent.setup();
    renderDialog();

    await user.click(screen.getByRole('button', { name: /browse/i }));

    await waitFor(() => {
      expect(mockPickOpenAPIFile).toHaveBeenCalledOnce();
    });

    expect(mockImportOpenAPISpec).not.toHaveBeenCalled();
  });

  it('shows an error when PickOpenAPIFile rejects', async () => {
    mockPickOpenAPIFile.mockRejectedValue(new Error('dialog failed'));

    const user = userEvent.setup();
    renderDialog();

    await user.click(screen.getByRole('button', { name: /browse/i }));

    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeInTheDocument();
    });
  });
});

describe('ImportOpenAPIDialog — Wails file drop', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockImportOpenAPISpec.mockResolvedValue({ CollectionID: 'c1', RequestCount: 3, FolderCount: 1 });
  });

  it('imports a valid .json file dropped via Wails file-drop event', async () => {
    let dropCallback: ((x: number, y: number, paths: string[]) => void) | null = null;
    mockOnFileDrop.mockImplementation((cb: (x: number, y: number, paths: string[]) => void) => {
      dropCallback = cb;
    });

    renderDialog();
    expect(dropCallback).toBeTruthy();

    dropCallback!(0, 0, ['/tmp/api.json']);

    await waitFor(() => {
      expect(mockImportOpenAPISpec).toHaveBeenCalledWith('/tmp/api.json');
    });
  });

  it('shows a validation error when an unsupported file is dropped', async () => {
    let dropCallback: ((x: number, y: number, paths: string[]) => void) | null = null;
    mockOnFileDrop.mockImplementation((cb: (x: number, y: number, paths: string[]) => void) => {
      dropCallback = cb;
    });

    renderDialog();

    dropCallback!(0, 0, ['spec.txt']);

    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeInTheDocument();
    });
    expect(screen.getByRole('alert').textContent).toMatch(/unsupported file type/i);
    expect(mockImportOpenAPISpec).not.toHaveBeenCalled();
  });

  it('imports a .yaml file dropped via Wails file-drop event', async () => {
    let dropCallback: ((x: number, y: number, paths: string[]) => void) | null = null;
    mockOnFileDrop.mockImplementation((cb: (x: number, y: number, paths: string[]) => void) => {
      dropCallback = cb;
    });

    renderDialog();

    dropCallback!(0, 0, ['/home/user/petstore.yaml']);

    await waitFor(() => {
      expect(mockImportOpenAPISpec).toHaveBeenCalledWith('/home/user/petstore.yaml');
    });
  });
});

describe('ImportOpenAPIDialog — conflict resolution', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockImportOpenAPISpec.mockRejectedValue(new Error(CONFLICT_ERROR));
    mockImportWithResolution.mockResolvedValue({
      CollectionID: 'new-id',
      RequestCount: 5,
      FolderCount: 2,
    });
  });

  it('transitions to conflict step when ImportOpenAPISpec returns a conflict error', async () => {
    let dropCallback: ((x: number, y: number, paths: string[]) => void) | null = null;
    mockOnFileDrop.mockImplementation((cb: (x: number, y: number, paths: string[]) => void) => {
      dropCallback = cb;
    });

    renderDialog();

    dropCallback!(0, 0, ['/home/user/petstore.yaml']);

    await waitFor(() => {
      expect(screen.getByText(/already exists/i)).toBeInTheDocument();
    });

    expect(screen.getByRole('button', { name: /merge into existing/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /replace existing/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /create a copy/i })).toBeInTheDocument();
  });

  it('shows the conflicting collection name', async () => {
    let dropCallback: ((x: number, y: number, paths: string[]) => void) | null = null;
    mockOnFileDrop.mockImplementation((cb: (x: number, y: number, paths: string[]) => void) => {
      dropCallback = cb;
    });

    renderDialog();

    dropCallback!(0, 0, ['/home/user/petstore.yaml']);

    await waitFor(() => {
      expect(screen.getByText('Pet Store')).toBeInTheDocument();
    });
  });

  it('calls ImportOpenAPISpecWithResolution with "merge"', async () => {
    let dropCallback: ((x: number, y: number, paths: string[]) => void) | null = null;
    mockOnFileDrop.mockImplementation((cb: (x: number, y: number, paths: string[]) => void) => {
      dropCallback = cb;
    });

    const user = userEvent.setup();
    renderDialog();
    dropCallback!(0, 0, ['/home/user/petstore.yaml']);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /merge into existing/i })).toBeInTheDocument();
    });

    await user.click(screen.getByRole('button', { name: /merge into existing/i }));

    await waitFor(() => {
      expect(mockImportWithResolution).toHaveBeenCalledWith('/home/user/petstore.yaml', 'merge');
    });
  });

  it('calls ImportOpenAPISpecWithResolution with "replace"', async () => {
    let dropCallback: ((x: number, y: number, paths: string[]) => void) | null = null;
    mockOnFileDrop.mockImplementation((cb: (x: number, y: number, paths: string[]) => void) => {
      dropCallback = cb;
    });

    const user = userEvent.setup();
    renderDialog();
    dropCallback!(0, 0, ['/home/user/petstore.yaml']);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /replace existing/i })).toBeInTheDocument();
    });

    await user.click(screen.getByRole('button', { name: /replace existing/i }));

    await waitFor(() => {
      expect(mockImportWithResolution).toHaveBeenCalledWith('/home/user/petstore.yaml', 'replace');
    });
  });

  it('calls ImportOpenAPISpecWithResolution with "copy"', async () => {
    let dropCallback: ((x: number, y: number, paths: string[]) => void) | null = null;
    mockOnFileDrop.mockImplementation((cb: (x: number, y: number, paths: string[]) => void) => {
      dropCallback = cb;
    });

    const user = userEvent.setup();
    renderDialog();
    dropCallback!(0, 0, ['/home/user/petstore.yaml']);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /create a copy/i })).toBeInTheDocument();
    });

    await user.click(screen.getByRole('button', { name: /create a copy/i }));

    await waitFor(() => {
      expect(mockImportWithResolution).toHaveBeenCalledWith('/home/user/petstore.yaml', 'copy');
    });
  });
});

describe('ImportOpenAPIDialog — generic error handling', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockImportOpenAPISpec.mockRejectedValue(new Error('file not found'));
  });

  it('shows an inline error when a non-conflict error is returned', async () => {
    let dropCallback: ((x: number, y: number, paths: string[]) => void) | null = null;
    mockOnFileDrop.mockImplementation((cb: (x: number, y: number, paths: string[]) => void) => {
      dropCallback = cb;
    });

    renderDialog();
    dropCallback!(0, 0, ['/tmp/api.yaml']);

    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeInTheDocument();
    });
    expect(screen.getByRole('alert').textContent).toMatch(/file not found/i);
    expect(screen.queryByText(/already exists/i)).not.toBeInTheDocument();
  });
});