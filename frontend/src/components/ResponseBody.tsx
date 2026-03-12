import React, { useState, useRef, useCallback, useEffect } from 'react';
import { useEnvironmentsStore } from '../store/environmentsStore';
import SaveVarDialog from './SaveVarDialog';

interface ResponseBodyProps {
  body: string;
}

type ViewMode = 'pretty' | 'raw';

interface SelectionAnchor {
  x: number;
  y: number;
  text: string;
}

function tryPrettyPrint(raw: string): { text: string; isJson: boolean } {
  try {
    const parsed = JSON.parse(raw);
    return { text: JSON.stringify(parsed, null, 2), isJson: true };
  } catch {
    return { text: raw, isJson: false };
  }
}

const ResponseBody: React.FC<ResponseBodyProps> = ({ body }) => {
  const [mode, setMode] = useState<ViewMode>('pretty');
  const [selectionAnchor, setSelectionAnchor] = useState<SelectionAnchor | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [savedVarName, setSavedVarName] = useState<string | null>(null);
  const preRef = useRef<HTMLPreElement>(null);
  const { activeEnvironmentId, setVariable, variables } = useEnvironmentsStore();
  const activeVars = variables[activeEnvironmentId] ?? [];
  const { text: prettyText, isJson } = tryPrettyPrint(body);

  const displayText = mode === 'pretty' ? prettyText : body;

  const handleMouseUp = useCallback(() => {
    const selection = window.getSelection();
    if (!selection || selection.isCollapsed) {
      setSelectionAnchor(null);
      return;
    }

    const selectedText = selection.toString();
    if (!selectedText.trim()) {
      setSelectionAnchor(null);
      return;
    }

    // Verify the selection is within the pre element
    if (preRef.current && selection.rangeCount > 0) {
      const range = selection.getRangeAt(0);
      if (!preRef.current.contains(range.commonAncestorContainer)) {
        setSelectionAnchor(null);
        return;
      }
    }

    const rect = selection.getRangeAt(0).getBoundingClientRect();
    setSelectionAnchor({
      // Center the button horizontally over the selection, offset above it
      x: rect.left + rect.width / 2,
      y: rect.top - 8,
      text: selectedText,
    });
  }, []);

  const handleMouseDown = useCallback(() => {
    setSelectionAnchor(null);
  }, []);

  const handleSaveVarBtnClick = useCallback(() => {
    setDialogOpen(true);
  }, []);

  const handleDialogSave = useCallback(
    async (name: string, value: string) => {
      setSaving(true);
      setSaveError(null);
      try {
        await setVariable(activeEnvironmentId, name, value);
        setDialogOpen(false);
        setSelectionAnchor(null);
        setSavedVarName(name);
      } catch (err) {
        setSaveError(String(err));
      } finally {
        setSaving(false);
      }
    },
    [activeEnvironmentId, setVariable],
  );

  const handleDialogClose = useCallback(() => {
    setDialogOpen(false);
    setSaveError(null);
  }, []);

  // Auto-dismiss the success toast after 2 seconds
  useEffect(() => {
    if (!savedVarName) return;
    const timer = setTimeout(() => setSavedVarName(null), 2000);
    return () => clearTimeout(timer);
  }, [savedVarName]);

  const hasActiveEnv = Boolean(activeEnvironmentId);

  return (
    <>
      <div className="response-body">
        <div className="response-body-tabs">
          <button
            className={`rb-tab${mode === 'pretty' ? ' rb-tab--active' : ''}`}
            onClick={() => setMode('pretty')}
          >
            Pretty
          </button>
          <button
            className={`rb-tab${mode === 'raw' ? ' rb-tab--active' : ''}`}
            onClick={() => setMode('raw')}
          >
            Raw
          </button>
          {mode === 'pretty' && !isJson && body.trim() !== '' && (
            <span className="rb-not-json">not JSON — showing as-is</span>
          )}
        </div>
        {/* eslint-disable-next-line jsx-a11y/no-static-element-interactions */}
        <pre
          ref={preRef}
          className="response-body-pre"
          onMouseUp={handleMouseUp}
          onMouseDown={handleMouseDown}
        >
          {displayText}
        </pre>

        {selectionAnchor && (
          <div
            className={`rb-save-var-btn-wrapper${hasActiveEnv ? '' : ' rb-save-var-btn-wrapper--disabled'}`}
            style={{
              position: 'fixed',
              left: selectionAnchor.x,
              top: selectionAnchor.y,
              transform: 'translate(-50%, -100%)',
              zIndex: 9000,
            }}
          >
            <button
              className="rb-save-var-btn"
              disabled={!hasActiveEnv}
              title={hasActiveEnv ? 'Save as variable' : 'Select an environment first.'}
              onMouseDown={(e) => e.preventDefault()} // prevent selection loss
              onClick={handleSaveVarBtnClick}
            >
              Save as variable
            </button>
            {!hasActiveEnv && (
              <span className="rb-save-var-tooltip">Select an environment first.</span>
            )}
          </div>
        )}
      </div>

      {savedVarName && (
        <div className="rb-save-toast">
          Saved as <span className="rb-save-toast-name">{`{{${savedVarName}}}`}</span>
        </div>
      )}

      {dialogOpen && selectionAnchor && (
        <SaveVarDialog
          selectedValue={selectionAnchor.text}
          existingVars={activeVars}
          onSave={handleDialogSave}
          onClose={handleDialogClose}
          saving={saving}
          error={saveError}
        />
      )}
    </>
  );
};

export default ResponseBody;
