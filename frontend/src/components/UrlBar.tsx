import React, { useEffect, useRef, useState } from 'react';
import { useVarAutocomplete } from '../hooks/useVarAutocomplete';
import { parseVarSegments } from '../utils/varSegments';
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
  const mirrorInnerRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    setLocal(value);
  }, [value]);

  /** Sync horizontal scroll of the overlay with the input. */
  const syncScroll = () => {
    if (inputRef.current && mirrorInnerRef.current) {
      mirrorInnerRef.current.style.transform = `translateX(-${inputRef.current.scrollLeft}px)`;
    }
  };

  const { open, filteredVars, selectedIdx, checkTrigger, select, onKeyDown: varKeyDown, close } =
    useVarAutocomplete({
      inputRef,
      onInsert: (newValue) => {
        setLocal(newValue);
        onChange(newValue);
        syncScroll();
      },
    });

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const v = e.target.value;
    setLocal(v);
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => onChange(v), DEBOUNCE_MS);
    checkTrigger();
    syncScroll();
  };

  const handleBlur = () => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    onChange(local);
  };

  const segments = parseVarSegments(local);

  return (
    <div className="url-bar-wrapper">
      {/* Highlight overlay — sits behind the transparent input */}
      <div className="url-bar-mirror" aria-hidden="true">
        <span ref={mirrorInnerRef} className="url-bar-mirror-inner">
          {segments.map((seg, i) =>
            seg.isVar ? (
              <span key={i} className="var-token">{seg.text}</span>
            ) : (
              <span key={i}>{seg.text}</span>
            )
          )}
          {/* trailing space so the mirror matches input width exactly */}
          {'\u00A0'}
        </span>
      </div>

      <input
        ref={inputRef}
        type="text"
        className="url-bar url-bar--highlight"
        value={local}
        placeholder="https://example.com/api  or  {{base_url}}/path"
        onChange={handleChange}
        onBlur={handleBlur}
        onKeyDown={(e) => { varKeyDown(e); syncScroll(); }}
        onClick={syncScroll}
        aria-label="Request URL"
        spellCheck={false}
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
