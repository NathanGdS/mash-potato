import React, { useEffect, useRef, useState } from 'react';
import ReactDOM from 'react-dom';
import { useCollectionsStore } from '../store/collectionsStore';
import {
  ImportOpenAPISpec,
  ImportOpenAPISpecWithResolution,
  PickOpenAPIFile,
} from '../wailsjs/go/main/App';
import { OnFileDrop, OnFileDropOff } from '../wailsjs/runtime/runtime';
import './Modal.css';
import './ImportOpenAPIDialog.css';

const ACCEPTED_EXTENSIONS = ['.yaml', '.yml', '.json'];

function isAcceptedFile(name: string): boolean {
  const lower = name.toLowerCase();
  return ACCEPTED_EXTENSIONS.some((ext) => lower.endsWith(ext));
}

const CONFLICT_RE = /import conflict: a collection named "(.+)" already exists \(id=([^)]+)\)/;

interface ConflictInfo {
  name: string;
  existingId: string;
}

function parseConflict(errMsg: string): ConflictInfo | null {
  const m = CONFLICT_RE.exec(errMsg);
  if (!m) return null;
  return { name: m[1], existingId: m[2] };
}

type DialogStep = 'pick' | 'conflict';

interface Props {
  onClose: () => void;
}

const RESOLUTION_OPTIONS: { value: string; label: string; desc: string }[] = [
  { value: 'merge', label: 'Merge into existing', desc: 'Add new requests to the existing collection without removing any.' },
  { value: 'replace', label: 'Replace existing', desc: 'Delete the existing collection and recreate it from the spec.' },
  { value: 'copy', label: 'Create a copy', desc: 'Import as a separate collection with a unique name.' },
];

const ImportOpenAPIDialog: React.FC<Props> = ({ onClose }) => {
  const fetchCollections = useCollectionsStore((s) => s.fetchCollections);

  const [step, setStep] = useState<DialogStep>('pick');
  const [filePath, setFilePath] = useState('');
  const [conflict, setConflict] = useState<ConflictInfo | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [dragRejected, setDragRejected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const dropZoneRef = useRef<HTMLDivElement>(null);

  const handleBrowse = async () => {
    try {
      const path = await PickOpenAPIFile();
      if (!path) return;
      setFilePath(path);
      setError(null);
      await runImport(path);
    } catch (err) {
      setError(String(err));
    }
  };

  const runImport = async (path: string) => {
    setError(null);
    setSubmitting(true);
    try {
      await ImportOpenAPISpec(path);
      await fetchCollections();
      onClose();
    } catch (err) {
      const msg = String(err);
      const conflictInfo = parseConflict(msg);
      if (conflictInfo) {
        setConflict(conflictInfo);
        setStep('conflict');
      } else {
        setError(msg);
      }
    } finally {
      setSubmitting(false);
    }
  };

  const handleResolution = async (resolution: string) => {
    if (!filePath) return;
    setError(null);
    setSubmitting(true);
    try {
      await ImportOpenAPISpecWithResolution(filePath, resolution);
      await fetchCollections();
      onClose();
    } catch (err) {
      setError(String(err));
    } finally {
      setSubmitting(false);
    }
  };

  useEffect(() => {
    OnFileDrop((_: number, __: number, paths: string[]) => {
      if (paths.length === 0) return;
      const path = paths[0];
      setDragOver(false);
      if (!isAcceptedFile(path)) {
        setDragRejected(true);
        setError(`Unsupported file type: "${path}". Please drop a .yaml, .yml, or .json file.`);
        return;
      }
      setDragRejected(false);
      setError(null);
      setFilePath(path);
      runImport(path);
    }, true);

    return () => {
      OnFileDropOff();
    };
  }, []);

  const handleDragEnter = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(true);
    setDragRejected(false);
  };

  const handleDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(false);
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(false);
  };

  const handleBackdropClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      onClose();
    }
  };

  const dropZoneClass = [
    'ioad-drop-zone',
    dragOver ? 'ioad-drop-zone--drag-over' : '',
    dragRejected ? 'ioad-drop-zone--rejected' : '',
  ]
    .filter(Boolean)
    .join(' ');

  return ReactDOM.createPortal(
    <div
      className="modal-backdrop"
      onClick={handleBackdropClick}
      onKeyDown={handleKeyDown}
      role="dialog"
      aria-modal="true"
      aria-labelledby="import-openapi-title"
    >
      <div className="modal-box" style={{ width: 480 }}>
        <h2 id="import-openapi-title" className="modal-title">
          Import OpenAPI / Swagger
        </h2>

        {step === 'pick' && (
          <>
            <div
              ref={dropZoneRef}
              className={dropZoneClass}
              onDragEnter={handleDragEnter}
              onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); }}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              style={{ '--wails-drop-target': 'drop' } as React.CSSProperties}
              aria-label="Drop zone for OpenAPI spec file"
            >
              <svg
                className="ioad-drop-zone-icon"
                xmlns="http://www.w3.org/2000/svg"
                width="32"
                height="32"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                <polyline points="14 2 14 8 20 8" />
                <line x1="12" y1="18" x2="12" y2="12" />
                <line x1="9" y1="15" x2="15" y2="15" />
              </svg>
              <span className="ioad-drop-zone-label">
                {dragOver ? 'Drop to import' : 'Drag & drop a spec file here'}
              </span>
              <span className="ioad-drop-zone-hint">Accepts .yaml, .yml, .json</span>
            </div>

            {filePath && !error && (
              <p className="ioad-file-name">{filePath}</p>
            )}

            {error && (
              <p className="modal-error" role="alert" style={{ marginTop: 8, marginBottom: 0 }}>
                {error}
              </p>
            )}

            <div className="modal-actions" style={{ marginTop: 20 }}>
              <button
                type="button"
                className="btn btn--secondary"
                onClick={onClose}
                disabled={submitting}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn btn--primary"
                onClick={handleBrowse}
                disabled={submitting}
              >
                {submitting ? 'Importing…' : 'Browse…'}
              </button>
            </div>
          </>
        )}

        {step === 'conflict' && conflict && (
          <>
            <p className="ioad-conflict-notice">
              A collection named{' '}
              <span className="ioad-conflict-name">{conflict.name}</span>{' '}
              already exists. How would you like to proceed?
            </p>

            <div className="ioad-resolution-list">
              {RESOLUTION_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  className="ioad-resolution-btn"
                  onClick={() => handleResolution(opt.value)}
                  disabled={submitting}
                >
                  <span className="ioad-resolution-btn-label">{opt.label}</span>
                  <span className="ioad-resolution-btn-desc">{opt.desc}</span>
                </button>
              ))}
            </div>

            {error && (
              <p className="modal-error" role="alert" style={{ marginBottom: 12 }}>
                {error}
              </p>
            )}

            <div className="modal-actions">
              <button
                type="button"
                className="btn btn--secondary"
                onClick={onClose}
                disabled={submitting}
              >
                Cancel
              </button>
            </div>
          </>
        )}
      </div>
    </div>,
    document.body
  );
};

export default ImportOpenAPIDialog;