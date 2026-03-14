import React, { useRef, useState, useEffect } from 'react';
import KeyValueTable, { KVRow } from './KeyValueTable';
import VarPopover from './VarPopover';
import { useVarAutocomplete } from '../hooks/useVarAutocomplete';
import { parseVarSegments } from '../utils/varSegments';
import { JsonHighlighted } from '../utils/jsonHighlighter';

export type BodyType = 'none' | 'json' | 'raw' | 'form-data' | 'urlencoded';

interface BodyEditorProps {
  method: string;
  bodyType: BodyType;
  body: string;
  onBodyTypeChange: (t: BodyType) => void;
  onBodyChange: (body: string) => void;
}

const BODY_TYPES: BodyType[] = ['none', 'json', 'raw', 'form-data', 'urlencoded'];

const BODY_TYPE_LABELS: Record<BodyType, string> = {
  none: 'none',
  json: 'json',
  raw: 'raw',
  'form-data': 'form-data',
  urlencoded: 'Form URL Encoded',
};

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
  const [validationError, setValidationError] = useState<string | null>(null);

  /** Sync vertical scroll so the highlight overlay stays aligned. */
  const syncScroll = () => {
    if (textareaRef.current && mirrorRef.current) {
      mirrorRef.current.scrollTop = textareaRef.current.scrollTop;
    }
  };

  // Clear error when body or type changes
  useEffect(() => {
    setValidationError(null);
  }, [body, bodyType]);

  // Hook called unconditionally (Rules of Hooks)
  const { open, filteredVars, selectedIdx, checkTrigger, select, onKeyDown, close } =
    useVarAutocomplete({
      inputRef: textareaRef,
      onInsert: (v) => { onBodyChange(v); syncScroll(); },
    });

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // Ctrl+Alt+L to beautify JSON
    if (e.ctrlKey && e.altKey && (e.key === 'l' || e.key === 'L')) {
      if (bodyType === 'json') {
        e.preventDefault();
        handleBeautify();
        return;
      }
    }
    onKeyDown(e);
  };

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

  const handleBeautify = () => {
    try {
      const parsed = JSON.parse(body);
      const beautified = JSON.stringify(parsed, null, 2);
      onBodyChange(beautified);
      setValidationError(null);
      // Sync scroll after state update (next tick)
      setTimeout(syncScroll, 0);
    } catch (e) {
      setValidationError('Invalid JSON: ' + (e as Error).message);
    }
  };

  const segments = parseVarSegments(body);

  return (
    <div className="body-editor">
      <div className="body-editor-header">
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
              {BODY_TYPE_LABELS[t]}
            </label>
          ))}
        </div>

        {bodyType === 'json' && (
          <button
            className="body-beautify-btn"
            onClick={handleBeautify}
            title="Beautify JSON (Ctrl+Alt+L)"
          >
            Beautify
          </button>
        )}
      </div>

      {validationError && (
        <div className="body-validation-error">
          {validationError}
        </div>
      )}

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
            {bodyType === 'json' ? (
              <JsonHighlighted text={body} />
            ) : (
              segments.map((seg, i) =>
                seg.isVar ? (
                  <span key={i} className="var-token">{seg.text}</span>
                ) : (
                  <span key={i}>{seg.text}</span>
                )
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
            onKeyDown={handleKeyDown}
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

      {bodyType === 'urlencoded' && (
        <KeyValueTable
          rows={parseFormData()}
          onChange={handleFormDataChange}
          keyPlaceholder="Key"
          valuePlaceholder="Value"
        />
      )}
    </div>
  );
};

export default BodyEditor;
