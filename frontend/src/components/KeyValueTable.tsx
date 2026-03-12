import React, { useRef } from 'react';
import { useVarAutocomplete } from '../hooks/useVarAutocomplete';
import VarPopover from './VarPopover';

export interface KVRow {
  key: string;
  value: string;
  enabled: boolean;
}

interface KeyValueTableProps {
  rows: KVRow[];
  onChange: (rows: KVRow[]) => void;
  keyPlaceholder?: string;
  valuePlaceholder?: string;
}

/** A value input that surfaces the {{ variable autocomplete popover. */
function VarValueInput({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const { open, filteredVars, selectedIdx, checkTrigger, select, onKeyDown, close } =
    useVarAutocomplete({
      inputRef,
      onInsert: onChange,
    });

  return (
    <>
      <input
        ref={inputRef}
        type="text"
        className="kv-input"
        value={value}
        placeholder={placeholder}
        onChange={(e) => {
          onChange(e.target.value);
          checkTrigger();
        }}
        onKeyDown={onKeyDown}
      />
      <VarPopover
        open={open}
        items={filteredVars}
        selectedIdx={selectedIdx}
        anchorRef={inputRef}
        onSelect={select}
        onClose={close}
      />
    </>
  );
}

const KeyValueTable: React.FC<KeyValueTableProps> = ({
  rows,
  onChange,
  keyPlaceholder = 'Key',
  valuePlaceholder = 'Value',
}) => {
  const updateRow = (index: number, patch: Partial<KVRow>) => {
    const updated = rows.map((r, i) => (i === index ? { ...r, ...patch } : r));
    onChange(updated);
  };

  const addRow = () => {
    onChange([...rows, { key: '', value: '', enabled: true }]);
  };

  const removeRow = (index: number) => {
    onChange(rows.filter((_, i) => i !== index));
  };

  return (
    <div className="kv-table">
      <table>
        <thead>
          <tr>
            <th className="kv-col-check" />
            <th className="kv-col-key">{keyPlaceholder}</th>
            <th className="kv-col-value">{valuePlaceholder}</th>
            <th className="kv-col-del" />
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i} className={row.enabled ? '' : 'kv-row-disabled'}>
              <td>
                <input
                  type="checkbox"
                  checked={row.enabled}
                  onChange={(e) => updateRow(i, { enabled: e.target.checked })}
                  aria-label="Enable row"
                />
              </td>
              <td>
                <input
                  type="text"
                  className="kv-input"
                  value={row.key}
                  placeholder={keyPlaceholder}
                  onChange={(e) => updateRow(i, { key: e.target.value })}
                />
              </td>
              <td>
                <VarValueInput
                  value={row.value}
                  placeholder={valuePlaceholder}
                  onChange={(v) => updateRow(i, { value: v })}
                />
              </td>
              <td>
                <button
                  className="kv-remove-btn"
                  onClick={() => removeRow(i)}
                  aria-label="Remove row"
                >
                  ×
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <button className="kv-add-btn" onClick={addRow}>
        + Add Row
      </button>
    </div>
  );
};

export default KeyValueTable;
