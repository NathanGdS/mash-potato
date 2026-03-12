import { useCallback, useEffect, useRef, useState } from 'react';
import { useEnvironmentsStore } from '../store/environmentsStore';

type InputEl = HTMLInputElement | HTMLTextAreaElement;

/**
 * Detects whether the cursor sits inside an unclosed `{{...` expression and
 * returns the trigger position and the partial variable name typed so far.
 * Stops matching if the user types a space (variable names have no spaces).
 */
function getTriggerAtCursor(el: InputEl): { triggerStart: number; filter: string } | null {
  const cursor = el.selectionStart ?? 0;
  const before = el.value.slice(0, cursor);
  const m = /\{\{([^}\s]*)$/.exec(before);
  if (!m) return null;
  return { triggerStart: m.index, filter: m[1] };
}

interface UseVarAutocompleteOptions<T extends InputEl> {
  inputRef: React.RefObject<T | null>;
  /** Called when a variable is inserted — receives the complete new value. */
  onInsert: (newValue: string) => void;
}

export function useVarAutocomplete<T extends InputEl>({
  inputRef,
  onInsert,
}: UseVarAutocompleteOptions<T>) {
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState('');
  const [selectedIdx, setSelectedIdx] = useState(0);
  const triggerStart = useRef<number>(-1);

  const activeId = useEnvironmentsStore((s) => s.activeEnvironmentId);
  const variables = useEnvironmentsStore((s) => s.variables);
  const fetchVariables = useEnvironmentsStore((s) => s.fetchVariables);

  // Pre-fetch variables for the active environment so they are ready when the
  // user first types {{.
  useEffect(() => {
    if (activeId && !variables[activeId]) {
      fetchVariables(activeId);
    }
  }, [activeId, variables, fetchVariables]);

  const allVarKeys = activeId ? (variables[activeId] ?? []).map((v) => v.key) : [];

  const filteredVars = filter
    ? allVarKeys.filter((k) => k.toLowerCase().includes(filter.toLowerCase()))
    : allVarKeys;

  const close = useCallback(() => {
    setOpen(false);
    setFilter('');
    setSelectedIdx(0);
    triggerStart.current = -1;
  }, []);

  /**
   * Call this inside the component's own onChange handler to detect the `{{`
   * trigger. Reads cursor position from the DOM after React has flushed the
   * latest value (via setTimeout 0).
   */
  const checkTrigger = useCallback(() => {
    setTimeout(() => {
      const el = inputRef.current;
      if (!el) return;
      const t = getTriggerAtCursor(el);
      if (t) {
        triggerStart.current = t.triggerStart;
        setFilter(t.filter);
        setSelectedIdx(0);
        setOpen(true);
      } else {
        setOpen(false);
        triggerStart.current = -1;
      }
    }, 0);
  }, [inputRef]);

  /** Insert the chosen variable name at the trigger position. */
  const select = useCallback(
    (varName: string) => {
      const el = inputRef.current;
      if (!el || triggerStart.current < 0) return;
      const cursor = el.selectionStart ?? 0;
      const val = el.value;
      const newValue =
        val.slice(0, triggerStart.current) + '{{' + varName + '}}' + val.slice(cursor);
      const newCursor = triggerStart.current + 2 + varName.length + 2;
      onInsert(newValue);
      close();
      // Restore cursor after React re-renders the controlled input
      setTimeout(() => {
        if (inputRef.current) {
          inputRef.current.setSelectionRange(newCursor, newCursor);
          inputRef.current.focus();
        }
      }, 16);
    },
    [inputRef, onInsert, close]
  );

  const onKeyDown = useCallback(
    (e: React.KeyboardEvent<InputEl>) => {
      if (!open || filteredVars.length === 0) return;
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIdx((i) => (i + 1) % filteredVars.length);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIdx((i) => (i - 1 + filteredVars.length) % filteredVars.length);
      } else if (e.key === 'Enter' || e.key === 'Tab') {
        if (filteredVars[selectedIdx] !== undefined) {
          e.preventDefault();
          select(filteredVars[selectedIdx]);
        }
      } else if (e.key === 'Escape') {
        e.preventDefault();
        close();
      }
    },
    [open, filteredVars, selectedIdx, select, close]
  );

  return { open, filteredVars, selectedIdx, checkTrigger, select, onKeyDown, close };
}
