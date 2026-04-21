import React, { useRef } from 'react';
import './TestsEditor.css';

interface TestsEditorProps {
  value: string;
  onChange: (value: string) => void;
}

function parseRows(raw: string): string[] {
  const lines = raw.split('\n');
  return lines.length > 0 ? lines : [''];
}

function serializeRows(rows: string[]): string {
  return rows.join('\n');
}

const PLACEHOLDERS = [
  'status == 200',
  'body.id exists',
  'body.name == "John"',
  'header["Content-Type"] contains "json"',
];

const TestsEditor: React.FC<TestsEditorProps> = ({ value, onChange }) => {
  const rows = parseRows(value);
  const nextIdRef = useRef(0);
  const rowIdsRef = useRef<number[]>([]);
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

  if (rowIdsRef.current.length < rows.length) {
    const missing = rows.length - rowIdsRef.current.length;
    for (let i = 0; i < missing; i++) {
      rowIdsRef.current.push(nextIdRef.current++);
    }
  } else if (rowIdsRef.current.length > rows.length) {
    rowIdsRef.current.length = rows.length;
  }

  const handleRowChange = (index: number, newVal: string) => {
    const updated = [...rows];
    updated[index] = newVal;
    onChange(serializeRows(updated));
  };

  const handleRemove = (index: number) => {
    if (rows.length === 1) {
      onChange('');
      return;
    }
    const updated = rows.filter((_, i) => i !== index);
    rowIdsRef.current.splice(index, 1);
    onChange(serializeRows(updated));
  };

  const handleAdd = () => {
    const updated = [...rows, ''];
    rowIdsRef.current.push(nextIdRef.current++);
    onChange(serializeRows(updated));
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>, index: number) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      const updated = [...rows.slice(0, index + 1), '', ...rows.slice(index + 1)];
      rowIdsRef.current.splice(index + 1, 0, nextIdRef.current++);
      onChange(serializeRows(updated));
      setTimeout(() => {
        inputRefs.current[index + 1]?.focus();
      }, 0);
    } else if (e.key === 'Backspace' && rows[index] === '' && rows.length > 1) {
      e.preventDefault();
      const targetIndex = Math.max(0, index - 1);
      handleRemove(index);
      setTimeout(() => {
        inputRefs.current[targetIndex]?.focus();
      }, 0);
    }
  };

  return (
    <div className="tests-editor">
      {/* Hint block — fixed height, never scrolls */}
      <div className="tests-editor-hint-block">
        <p className="tests-editor-hint">
          Enter one assertion per line. Examples:<br />
          <code>status == 200</code>&nbsp;&nbsp;
          <code>body.id exists</code>&nbsp;&nbsp;
          <code>body.name == "John"</code>&nbsp;&nbsp;
          <code>header["Content-Type"] contains "json"</code>
        </p>
      </div>

      {/* Scrollable assertion list */}
      <div className="tests-editor-list">
        {rows.map((row, index) => (
          <div key={rowIdsRef.current[index]} className="tests-editor-row">
            <input
              ref={(el) => { inputRefs.current[index] = el; }}
              className="tests-editor-input"
              type="text"
              value={row}
              placeholder={PLACEHOLDERS[index % PLACEHOLDERS.length]}
              spellCheck={false}
              onChange={(e) => handleRowChange(index, e.target.value)}
              onKeyDown={(e) => handleKeyDown(e, index)}
            />
            <button
              className="tests-editor-remove"
              title="Remove assertion"
              aria-label="Remove assertion"
              onClick={() => handleRemove(index)}
            >
              ×
            </button>
          </div>
        ))}
      </div>

      {/* Pinned Add Test button — always visible, outside scroll area */}
      <button className="tests-editor-add" onClick={handleAdd}>
        + Add Test
      </button>
    </div>
  );
};

export default TestsEditor;
