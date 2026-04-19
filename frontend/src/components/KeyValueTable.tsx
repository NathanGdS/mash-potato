import React, { useRef } from 'react';
import { useVarAutocomplete } from '../hooks/useVarAutocomplete';
import { useVarHoverTooltip } from '../hooks/useVarHoverTooltip';
import { parseVarSegments } from '../utils/varSegments';
import VarPopover from './VarPopover';
import VarTooltip from './VarTooltip';

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

/** A value input with {{ variable highlighting and autocomplete popover. */
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
  const mirrorInnerRef = useRef<HTMLSpanElement>(null);

  const syncScroll = () => {
    if (inputRef.current && mirrorInnerRef.current) {
      mirrorInnerRef.current.style.transform = `translateX(-${inputRef.current.scrollLeft}px)`;
    }
  };

  const { open, filteredVars, selectedIdx, checkTrigger, select, onKeyDown, close } =
    useVarAutocomplete({
      inputRef,
      onInsert: (v) => { onChange(v); syncScroll(); },
    });

  const { wrapperProps, tooltipState, cancelDismiss } = useVarHoverTooltip({ inputRef });

  const segments = parseVarSegments(value);

  return (
    <div className="kv-value-wrapper" {...wrapperProps}>
      <div className="kv-value-mirror" aria-hidden="true">
        <span ref={mirrorInnerRef} className="kv-value-mirror-inner">
          {segments.map((seg, i) =>
            seg.isVar ? (
              <span key={i} className="var-token" data-var-name={seg.text.slice(2, -2)}>{seg.text}</span>
            ) : (
              <span key={i}>{seg.text}</span>
            )
          )}
        </span>
      </div>
      <input
        ref={inputRef}
        type="text"
        className="kv-input kv-input--highlight"
        value={value}
        placeholder={placeholder}
        onChange={(e) => { onChange(e.target.value); checkTrigger(); syncScroll(); }}
        onKeyDown={(e) => { onKeyDown(e); syncScroll(); }}
        onClick={syncScroll}
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
      {tooltipState !== null && (
        <VarTooltip
          varName={tooltipState.varName}
          anchorRect={tooltipState.anchorRect}
          isPassword={tooltipState.isPassword}
          onMouseEnter={cancelDismiss}
          onMouseLeave={wrapperProps.onMouseLeave}
        />
      )}
    </div>
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
