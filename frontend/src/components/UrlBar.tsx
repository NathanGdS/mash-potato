import React, { useEffect, useRef, useState } from 'react';
import { useVarAutocomplete } from '../hooks/useVarAutocomplete';
import VarPopover from './VarPopover';

interface UrlBarProps {
  value: string;
  onChange: (url: string) => void;
}

const DEBOUNCE_MS = 300;

const UrlBar: React.FC<UrlBarProps> = ({ value, onChange }) => {
  const [local, setLocal] = useState(value);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Sync when external value changes (e.g. switching active request)
  useEffect(() => {
    setLocal(value);
  }, [value]);

  const { open, filteredVars, selectedIdx, checkTrigger, select, onKeyDown: varKeyDown, close } =
    useVarAutocomplete({
      inputRef,
      onInsert: (newValue) => {
        setLocal(newValue);
        onChange(newValue); // bypass debounce for var inserts
      },
    });

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const v = e.target.value;
    setLocal(v);
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => onChange(v), DEBOUNCE_MS);
    checkTrigger();
  };

  const handleBlur = () => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    onChange(local);
    // Don't close the popover on blur — VarPopover uses mousedown to prevent it
  };

  return (
    <div className="url-bar-wrapper">
      <input
        ref={inputRef}
        type="text"
        className="url-bar"
        value={local}
        placeholder="https://example.com/api  or  {{base_url}}/path"
        onChange={handleChange}
        onBlur={handleBlur}
        onKeyDown={varKeyDown}
        aria-label="Request URL"
      />
      <VarPopover
        open={open}
        items={filteredVars}
        selectedIdx={selectedIdx}
        anchorRef={inputRef}
        onSelect={select}
        onClose={close}
      />
    </div>
  );
};

export default UrlBar;
