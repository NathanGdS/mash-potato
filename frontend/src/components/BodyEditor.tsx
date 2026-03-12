import React from 'react';
import KeyValueTable, { KVRow } from './KeyValueTable';

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
        <textarea
          className="body-textarea"
          value={body}
          placeholder={bodyType === 'json' ? '{\n  "key": "value"\n}' : 'Raw body text'}
          onChange={(e) => onBodyChange(e.target.value)}
          spellCheck={false}
          aria-label="Request body"
        />
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
