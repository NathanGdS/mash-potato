import { beforeEach, describe, expect, it, vi } from 'vitest';

// Mock the Wails bindings before importing the store
vi.mock('../wailsjs/go/main/App', () => ({
  GetHistory: vi.fn(),
  ClearHistory: vi.fn(),
}));

import * as App from '../wailsjs/go/main/App';
import { useHistoryStore } from './historyStore';
import type { HistoryEntry } from './historyStore';

const makeEntry = (id: number): HistoryEntry => ({
  id,
  method: 'GET',
  url: `https://example.com/${id}`,
  headers: '[]',
  params: '[]',
  body_type: 'none',
  body: '',
  response_status: 200,
  response_body: '{}',
  response_headers: '{}',
  response_duration_ms: 100,
  response_size_bytes: 2,
  executed_at: `2026-01-0${id}T00:00:00Z`,
});

const entryA = makeEntry(1);
const entryB = makeEntry(2);
const entryC = makeEntry(3);

beforeEach(() => {
  vi.clearAllMocks();
  useHistoryStore.setState({
    entries: [],
    loading: false,
    error: null,
    diffSelection: [],
  });
});

// ---------------------------------------------------------------------------
// toggleDiffSelection
// ---------------------------------------------------------------------------
describe('toggleDiffSelection', () => {
  it('adds a single entry when selection is empty', () => {
    useHistoryStore.getState().toggleDiffSelection(entryA);
    expect(useHistoryStore.getState().diffSelection).toEqual([entryA]);
  });

  it('adds a second entry when one is already selected', () => {
    useHistoryStore.getState().toggleDiffSelection(entryA);
    useHistoryStore.getState().toggleDiffSelection(entryB);
    expect(useHistoryStore.getState().diffSelection).toEqual([entryA, entryB]);
  });

  it('removes an entry that is already selected', () => {
    useHistoryStore.setState({ diffSelection: [entryA, entryB] });
    useHistoryStore.getState().toggleDiffSelection(entryA);
    expect(useHistoryStore.getState().diffSelection).toEqual([entryB]);
  });

  it('removes the only selected entry leaving an empty array', () => {
    useHistoryStore.setState({ diffSelection: [entryA] });
    useHistoryStore.getState().toggleDiffSelection(entryA);
    expect(useHistoryStore.getState().diffSelection).toEqual([]);
  });

  it('FIFO: replaces oldest entry when 2 are already selected and a third is toggled in', () => {
    useHistoryStore.setState({ diffSelection: [entryA, entryB] });
    useHistoryStore.getState().toggleDiffSelection(entryC);
    // entryA (oldest) is dropped; result is [entryB, entryC]
    expect(useHistoryStore.getState().diffSelection).toEqual([entryB, entryC]);
  });

  it('FIFO: subsequent calls keep rolling the window', () => {
    useHistoryStore.setState({ diffSelection: [entryA, entryB] });
    useHistoryStore.getState().toggleDiffSelection(entryC);
    const entryD = makeEntry(4);
    useHistoryStore.getState().toggleDiffSelection(entryD);
    expect(useHistoryStore.getState().diffSelection).toEqual([entryC, entryD]);
  });

  it('does not add a duplicate entry that is already in the selection', () => {
    useHistoryStore.setState({ diffSelection: [entryA] });
    useHistoryStore.getState().toggleDiffSelection(entryA);
    // toggling existing entry removes it; length should now be 0
    expect(useHistoryStore.getState().diffSelection).toHaveLength(0);
  });

  it('selection is always capped at 2 entries', () => {
    useHistoryStore.getState().toggleDiffSelection(entryA);
    useHistoryStore.getState().toggleDiffSelection(entryB);
    useHistoryStore.getState().toggleDiffSelection(entryC);
    expect(useHistoryStore.getState().diffSelection).toHaveLength(2);
  });
});

// ---------------------------------------------------------------------------
// clearDiffSelection
// ---------------------------------------------------------------------------
describe('clearDiffSelection', () => {
  it('resets a populated selection to []', () => {
    useHistoryStore.setState({ diffSelection: [entryA, entryB] });
    useHistoryStore.getState().clearDiffSelection();
    expect(useHistoryStore.getState().diffSelection).toEqual([]);
  });

  it('is a no-op when selection is already empty', () => {
    useHistoryStore.getState().clearDiffSelection();
    expect(useHistoryStore.getState().diffSelection).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Pre-existing actions — ensure they are not broken
// ---------------------------------------------------------------------------
describe('fetchHistory', () => {
  it('populates entries on success', async () => {
    vi.mocked(App.GetHistory).mockResolvedValue([entryA]);
    await useHistoryStore.getState().fetchHistory();
    expect(useHistoryStore.getState().entries).toEqual([entryA]);
    expect(useHistoryStore.getState().loading).toBe(false);
    expect(useHistoryStore.getState().error).toBeNull();
  });

  it('sets error on failure', async () => {
    vi.mocked(App.GetHistory).mockRejectedValue(new Error('network error'));
    await useHistoryStore.getState().fetchHistory();
    expect(useHistoryStore.getState().error).toMatch('network error');
    expect(useHistoryStore.getState().loading).toBe(false);
  });

  it('does not affect diffSelection', async () => {
    useHistoryStore.setState({ diffSelection: [entryA] });
    vi.mocked(App.GetHistory).mockResolvedValue([entryB]);
    await useHistoryStore.getState().fetchHistory();
    expect(useHistoryStore.getState().diffSelection).toEqual([entryA]);
  });
});

describe('clearHistory', () => {
  it('clears entries', async () => {
    useHistoryStore.setState({ entries: [entryA] });
    vi.mocked(App.ClearHistory).mockResolvedValue(undefined);
    await useHistoryStore.getState().clearHistory();
    expect(useHistoryStore.getState().entries).toEqual([]);
  });

  it('does not affect diffSelection', async () => {
    useHistoryStore.setState({ entries: [entryA], diffSelection: [entryB] });
    vi.mocked(App.ClearHistory).mockResolvedValue(undefined);
    await useHistoryStore.getState().clearHistory();
    expect(useHistoryStore.getState().diffSelection).toEqual([entryB]);
  });
});
