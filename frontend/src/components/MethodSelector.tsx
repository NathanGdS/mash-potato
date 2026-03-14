import React from 'react';

const METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'] as const;
export type HttpMethod = (typeof METHODS)[number];

interface MethodSelectorProps {
  value: string;
  onChange: (method: HttpMethod) => void;
}

const methodColors: Record<string, string> = {
  GET: '#61affe',
  POST: '#49cc90',
  PUT: '#fca130',
  PATCH: '#50e3c2',
  DELETE: '#f93e3e',
  HEAD: '#a0aec0',
  OPTIONS: '#b794f4',
};

const MethodSelector: React.FC<MethodSelectorProps> = ({ value, onChange }) => {
  const color = methodColors[value] ?? '#a0aec0';

  return (
    <select
      className="method-selector"
      value={value}
      onChange={(e) => onChange(e.target.value as HttpMethod)}
      style={{ color }}
      aria-label="HTTP method"
    >
      {METHODS.map((m) => (
        <option key={m} value={m} style={{ color: methodColors[m] }}>
          {m}
        </option>
      ))}
    </select>
  );
};

export default MethodSelector;
