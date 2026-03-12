import React, { useState, useEffect, useRef, useCallback } from 'react';
import { EnvironmentVariable } from '../wailsjs/go/main/App';
import './SaveVarDialog.css';

type Mode = 'new' | 'existing';

interface SaveVarDialogProps {
  selectedValue: string;
  existingVars: EnvironmentVariable[];
  onSave: (name: string, value: string) => void;
  onClose: () => void;
  saving?: boolean;
  error?: string | null;
}

const SaveVarDialog: React.FC<SaveVarDialogProps> = ({
  selectedValue,
  existingVars,
  onSave,
  onClose,
  saving = false,
  error = null,
}) => {
  const [mode, setMode] = useState<Mode>('new');
  const [newName, setNewName] = useState('');
  const [selectedKey, setSelectedKey] = useState<string>(existingVars[0]?.key ?? '');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (mode === 'new') inputRef.current?.focus();
  }, [mode]);

  const handleSave = useCallback(() => {
    if (saving) return;
    if (mode === 'new') {
      const trimmed = newName.trim();
      if (!trimmed) return;
      onSave(trimmed, selectedValue);
    } else {
      if (!selectedKey) return;
      onSave(selectedKey, selectedValue);
    }
  }, [mode, newName, selectedKey, selectedValue, onSave, saving]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement | HTMLSelectElement>) => {
      if (e.key === 'Enter') handleSave();
      else if (e.key === 'Escape') onClose();
    },
    [handleSave, onClose],
  );

  const handleOverlayClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (e.target === e.currentTarget) onClose();
    },
    [onClose],
  );

  const canSave =
    !saving &&
    (mode === 'new' ? newName.trim().length > 0 : Boolean(selectedKey));

  return (
    <div className="svd-overlay" onMouseDown={handleOverlayClick}>
      <div className="svd-dialog" role="dialog" aria-modal="true" aria-label="Save as variable">
        <p className="svd-title">Save as variable</p>

        <div className="svd-field">
          <span className="svd-label">Value</span>
          <div className="svd-value-preview" title={selectedValue}>
            {selectedValue}
          </div>
        </div>

        <div className="svd-tabs">
          <button
            className={`svd-tab${mode === 'new' ? ' svd-tab--active' : ''}`}
            onClick={() => setMode('new')}
            disabled={saving}
          >
            New variable
          </button>
          <button
            className={`svd-tab${mode === 'existing' ? ' svd-tab--active' : ''}`}
            onClick={() => setMode('existing')}
            disabled={saving || existingVars.length === 0}
            title={existingVars.length === 0 ? 'No variables in this environment yet' : undefined}
          >
            Set existing
          </button>
        </div>

        {mode === 'new' ? (
          <div className="svd-field">
            <label className="svd-label" htmlFor="svd-name-input">
              Variable name
            </label>
            <input
              id="svd-name-input"
              ref={inputRef}
              className="svd-input"
              type="text"
              placeholder="e.g. ACCESS_TOKEN"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={handleKeyDown}
              disabled={saving}
            />
          </div>
        ) : (
          <div className="svd-field">
            <label className="svd-label" htmlFor="svd-var-select">
              Variable
            </label>
            <select
              id="svd-var-select"
              className="svd-select"
              value={selectedKey}
              onChange={(e) => setSelectedKey(e.target.value)}
              onKeyDown={handleKeyDown}
              disabled={saving}
            >
              {existingVars.map((v) => (
                <option key={v.id} value={v.key}>
                  {v.key}
                </option>
              ))}
            </select>
          </div>
        )}

        {error && <p className="svd-error">{error}</p>}

        <div className="svd-actions">
          <button className="svd-cancel-btn" onClick={onClose} disabled={saving}>
            Cancel
          </button>
          <button className="svd-save-btn" disabled={!canSave} onClick={handleSave}>
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default SaveVarDialog;
