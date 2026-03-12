import React, { useEffect, useRef, useState } from 'react';

interface UrlBarProps {
  value: string;
  onChange: (url: string) => void;
}

const DEBOUNCE_MS = 300;

const UrlBar: React.FC<UrlBarProps> = ({ value, onChange }) => {
  const [local, setLocal] = useState(value);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Sync when external value changes (e.g. switching active request)
  useEffect(() => {
    setLocal(value);
  }, [value]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const v = e.target.value;
    setLocal(v);
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => onChange(v), DEBOUNCE_MS);
  };

  const handleBlur = () => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    onChange(local);
  };

  return (
    <input
      type="text"
      className="url-bar"
      value={local}
      placeholder="https://example.com/api"
      onChange={handleChange}
      onBlur={handleBlur}
      aria-label="Request URL"
    />
  );
};

export default UrlBar;
