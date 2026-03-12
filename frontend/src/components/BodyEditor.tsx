import React, { useRef } from 'react';
import KeyValueTable, { KVRow } from './KeyValueTable';
import VarPopover from './VarPopover';
import { useVarAutocomplete } from '../hooks/useVarAutocomplete';

export type BodyType = 'none' | 'json' | 'raw' | 'form-data';

interface BodyEditorProps {
  method: string;
  bodyType: BodyType;
  body: string;
  onBodyTypeChange: (t: BodyType) => void;
  onBodyChange: (body: string) => void;
}

const BODY_TYPES: BodyType[] = ['none', 'json', 'raw', 'form-data'];

const BodyEditor: React.FC<BodyEditorProps> = ({
  method,
  bodyType,
  body,
  onBodyTypeChange,
  onBodyChange,
}) => {
  const noBodyMethod = method === 'GET' || method === 'DELETE';

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  // Hooks must be called unconditionally — the popover just won't open when
  // the textarea isn't rendered (bodyType !== 'json'/'raw').
  const { open, filteredVars, selectedIdx, checkTrigger, select, onKeyDown, close } =
    useVarAutocomplete({
      inputRef: textareaRef,
      onInsert: onBodyChange,
    });

  const parseFormData = (): KVRow[] => {
    try {
      const parsed = JSON.parse(body);
      if (Array.isArray(parsed)) return parsed as KVRow[];
    } catch {
      // ignore
    }
    return [];
  };

  const handleFormDataChange = (rows: KVRow[]) => {
    onBodyChange(JSON.stringify(rows));
  };

  return (
    <div className="body-editor">
      <div className="body-type-selector">
        {BODY_TYPES.map((t) => (
          <label key={t} className={`body-type-option${bodyType === t ? ' active' : ''}`}>
            <input
              type="radio"
              name="body-type"
              value={t}
              checked={bodyType === t}
              onChange={() => onBodyTypeChange(t)}
            />
            {t}
          </label>
        ))}
      </div>

      {noBodyMethod && bodyType !== 'none' && (
        <p className="body-editor-warning">
          {method} requests typically do not include a body.
        </p>
      )}

      {bodyType === 'none' && (
        <p className="body-editor-empty">No body.</p>
      )}

      {(bodyType === 'json' || bodyType === 'raw') && (
        <>
          <textarea
            ref={textareaRef}
            className="body-textarea"
            value={body}
            placeholder={bodyType === 'json' ? '{\n  "key": "value"\n}' : 'Raw body text'}
            onChange={(e) => {
              onBodyChange(e.target.value);
              checkTrigger();
            }}
            onKeyDown={onKeyDown}
            spellCheck={false}
            aria-label="Request body"
          />
          <VarPopover
            open={open}
            items={filteredVars}
            selectedIdx={selectedIdx}
            anchorRef={textareaRef}
            onSelect={select}
            onClose={close}
          />
        </>
      )}

      {bodyType === 'form-data' && (
        <KeyValueTable
          rows={parseFormData()}
          onChange={handleFormDataChange}
          keyPlaceholder="Field"
          valuePlaceholder="Value"
        />
      )}
    </div>
  );
};

export default BodyEditor;
