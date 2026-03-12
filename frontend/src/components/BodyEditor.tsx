import React, { useRef } from 'react';
import KeyValueTable, { KVRow } from './KeyValueTable';
import VarPopover from './VarPopover';
import { useVarAutocomplete } from '../hooks/useVarAutocomplete';
import { parseVarSegments } from '../utils/varSegments';

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
  const mirrorRef = useRef<HTMLDivElement>(null);

  /** Sync vertical scroll so the highlight overlay stays aligned. */
  const syncScroll = () => {
    if (textareaRef.current && mirrorRef.current) {
      mirrorRef.current.scrollTop = textareaRef.current.scrollTop;
    }
  };

  // Hook called unconditionally (Rules of Hooks)
  const { open, filteredVars, selectedIdx, checkTrigger, select, onKeyDown, close } =
    useVarAutocomplete({
      inputRef: textareaRef,
      onInsert: (v) => { onBodyChange(v); syncScroll(); },
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

  const segments = parseVarSegments(body);

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
        <div className="body-textarea-wrapper">
          {/* Highlight overlay */}
          <div className="body-textarea-mirror" ref={mirrorRef} aria-hidden="true">
            {segments.map((seg, i) =>
              seg.isVar ? (
                <span key={i} className="var-token">{seg.text}</span>
              ) : (
                <span key={i}>{seg.text}</span>
              )
            )}
            {/* Extra newline so the mirror height matches when body ends with \n */}
            {'\n'}
          </div>

          <textarea
            ref={textareaRef}
            className="body-textarea body-textarea--highlight"
            value={body}
            placeholder={bodyType === 'json' ? '{\n  "key": "value"\n}' : 'Raw body text'}
            onChange={(e) => { onBodyChange(e.target.value); checkTrigger(); syncScroll(); }}
            onKeyDown={onKeyDown}
            onScroll={syncScroll}
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
        </div>
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
