import React, { useEffect, useRef, useState, useCallback } from 'react';
import ReactDOM from 'react-dom';
import { SearchRequests, SearchRequestsWithBody, SearchResult } from '../wailsjs/go/main/App';
import { useRequestsStore } from '../store/requestsStore';
import { useTabsStore } from '../store/tabsStore';
import { splitOnMatch } from '../utils/searchHighlight';
import './SearchPalette.css';

const METHOD_COLORS: Record<string, string> = {
  GET: '#61affe',
  POST: '#49cc90',
  PUT: '#fca130',
  PATCH: '#50e3c2',
  DELETE: '#f93e3e',
  HEAD: '#a0aec0',
  OPTIONS: '#b794f4',
};

interface HighlightedTextProps {
  text: string;
  query: string;
}

const HighlightedText: React.FC<HighlightedTextProps> = ({ text, query }) => {
  const segs = splitOnMatch(text, query);
  if (!segs) return <span>{text}</span>;
  return (
    <span>
      {segs.before}
      <mark className="search-palette-mark">{segs.match}</mark>
      {segs.after}
    </span>
  );
};

interface Props {
  query: string;
  setQuery: (q: string) => void;
  onClose: () => void;
}

const SearchPalette: React.FC<Props> = ({ query, setQuery, onClose }) => {
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [focusedIndex, setFocusedIndex] = useState(0);

  const openRequest = useRequestsStore((s) => s.openRequest);
  const openTab = useTabsStore((s) => s.openTab);

  const bodySearch = query.startsWith('/');
  const effectiveQuery = bodySearch ? query.slice(1).trim() : query.trim();

  // Debounced search
  useEffect(() => {
    if (!effectiveQuery) {
      setResults([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    const timer = setTimeout(async () => {
      try {
        const res = bodySearch
          ? await SearchRequestsWithBody(effectiveQuery)
          : await SearchRequests(effectiveQuery);
        setResults(res ?? []);
      } catch {
        setResults([]);
      } finally {
        setLoading(false);
      }
    }, 200);

    return () => clearTimeout(timer);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query]);

  // Reset focused row when results change
  useEffect(() => {
    setFocusedIndex(0);
  }, [results]);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const handleSelect = useCallback(
    (result: SearchResult) => {
      openRequest(result.request_id).catch(() => {});
      openTab({
        requestId: result.request_id,
        requestName: result.request_name,
        method: result.method,
      });
      onClose();
    },
    [openRequest, openTab, onClose],
  );

  const handleBackdropClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget) onClose();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      onClose();
      return;
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setFocusedIndex((prev) => (results.length === 0 ? 0 : (prev + 1) % results.length));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setFocusedIndex((prev) => (results.length === 0 ? 0 : (prev - 1 + results.length) % results.length));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const selected = results[focusedIndex];
      if (selected) handleSelect(selected);
    }
  };

  // Scroll focused row into view
  useEffect(() => {
    const list = listRef.current;
    if (!list) return;
    const row = list.children[focusedIndex] as HTMLElement | undefined;
    row?.scrollIntoView({ block: 'nearest' });
  }, [focusedIndex]);

  const trimmedQuery = effectiveQuery;
  const showResults = !loading && trimmedQuery && results.length > 0;
  const showEmpty = !loading && trimmedQuery && results.length === 0;
  const showHint = !trimmedQuery;

  return ReactDOM.createPortal(
    <div
      className="search-palette-backdrop"
      onClick={handleBackdropClick}
      role="dialog"
      aria-modal="true"
      aria-label="Search requests"
    >
      <div className="search-palette" onKeyDown={handleKeyDown}>
        <div className="search-palette-input-row">
          <span className="search-palette-icon" aria-hidden="true">⌕</span>
          <input
            ref={inputRef}
            className="search-palette-input"
            type="text"
            placeholder="Search requests…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            autoComplete="off"
            spellCheck={false}
            aria-label="Search requests"
            aria-autocomplete="list"
            aria-controls="search-palette-results"
            aria-activedescendant={
              results.length > 0 ? `search-result-${focusedIndex}` : undefined
            }
          />
          {bodySearch && (
            <span className="search-palette-body-tag" aria-label="Body search active">/body</span>
          )}
          {query && (
            <button
              className="search-palette-clear"
              onClick={() => setQuery('')}
              aria-label="Clear search"
              tabIndex={-1}
            >
              ✕
            </button>
          )}
        </div>

        {/* Results / states */}
        {loading && (
          <div className="search-palette-state">
            <span className="search-palette-hint">Searching…</span>
          </div>
        )}

        {showHint && (
          <div className="search-palette-state">
            <span className="search-palette-hint">
              Type to search across all requests and collections.
            </span>
            <span className="search-palette-hint search-palette-hint--sub">
              Tip: prefix with <kbd>/</kbd> to also search request bodies.
            </span>
          </div>
        )}

        {showEmpty && (
          <div className="search-palette-state">
            <span className="search-palette-hint">
              No results for &ldquo;{trimmedQuery}&rdquo;
            </span>
          </div>
        )}

        {showResults && (
          <ul
            id="search-palette-results"
            className="search-palette-results"
            ref={listRef}
            role="listbox"
            aria-label="Search results"
          >
            {results.map((r, i) => {
              const color = METHOD_COLORS[r.method] ?? '#a0aec0';
              const isFocused = i === focusedIndex;
              return (
                <li
                  key={r.request_id}
                  id={`search-result-${i}`}
                  className={`search-palette-result${isFocused ? ' search-palette-result--focused' : ''}`}
                  role="option"
                  aria-selected={isFocused}
                  onMouseEnter={() => setFocusedIndex(i)}
                  onClick={() => handleSelect(r)}
                >
                  <span
                    className="search-palette-method"
                    style={{ color }}
                    aria-label={r.method}
                  >
                    {r.method}
                  </span>
                  <div className="search-palette-result-info">
                    <span className="search-palette-result-name">
                      <HighlightedText text={r.request_name} query={trimmedQuery} />
                    </span>
                    <span className="search-palette-result-meta">
                      <span className="search-palette-breadcrumb">
                        {r.collection_name}
                      </span>
                      <span className="search-palette-url">
                        <HighlightedText text={r.url} query={trimmedQuery} />
                      </span>
                    </span>
                  </div>
                </li>
              );
            })}
          </ul>
        )}

        <div className="search-palette-footer">
          <span className="search-palette-shortcut"><kbd>↑</kbd><kbd>↓</kbd> navigate</span>
          <span className="search-palette-shortcut"><kbd>Enter</kbd> open</span>
          <span className="search-palette-shortcut"><kbd>Esc</kbd> close</span>
          {results.length > 0 && (
            <span className="search-palette-count">
              {results.length}{results.length === 50 ? '+' : ''} result{results.length !== 1 ? 's' : ''}
            </span>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
};

export default SearchPalette;
