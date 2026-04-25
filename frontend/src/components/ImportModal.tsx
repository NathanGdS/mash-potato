import React, { useEffect, useRef } from 'react';
import ReactDOM from 'react-dom';
import { Download, Terminal, FileCode } from 'lucide-react';
import './Modal.css';
import './ImportModal.css';

interface Props {
  onClose: () => void;
  onImportCollection: () => void;
  onImportCurl: () => void;
  onImportOpenAPI?: () => void;
}

const ImportModal: React.FC<Props> = ({ onClose, onImportCollection, onImportCurl, onImportOpenAPI }) => {
  const firstChoiceRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    firstChoiceRef.current?.focus();
  }, []);

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

  const handleImportCollection = () => {
    onImportCollection();
    onClose();
  };

  const handleImportCurl = () => {
    onClose();
    onImportCurl();
  };

  const handleImportOpenAPI = () => {
    onClose();
    onImportOpenAPI?.();
  };

  return ReactDOM.createPortal(
    <div
      className="modal-backdrop"
      onClick={handleBackdropClick}
      onKeyDown={handleKeyDown}
      role="dialog"
      aria-modal="true"
      aria-labelledby="import-modal-title"
    >
      <div className="modal-box">
        <h2 id="import-modal-title" className="modal-title">
          Import
        </h2>

        <div className="import-modal-choices">
          <button
            ref={firstChoiceRef}
            className="import-modal-choice"
            onClick={handleImportCollection}
          >
            <span className="import-modal-choice-icon" aria-hidden="true">
              <Download size={20} />
            </span>
            <span className="import-modal-choice-text">
              <span className="import-modal-choice-label">Import Collection</span>
              <span className="import-modal-choice-desc">Load a collection from a JSON file</span>
            </span>
          </button>

          <button
            className="import-modal-choice"
            onClick={handleImportCurl}
          >
            <span className="import-modal-choice-icon" aria-hidden="true">
              <Terminal size={20} />
            </span>
            <span className="import-modal-choice-text">
              <span className="import-modal-choice-label">Import from cURL</span>
              <span className="import-modal-choice-desc">Paste a cURL command to create a request</span>
            </span>
          </button>

          <button
            className="import-modal-choice"
            onClick={handleImportOpenAPI}
          >
            <span className="import-modal-choice-icon" aria-hidden="true">
              <FileCode size={20} />
            </span>
            <span className="import-modal-choice-text">
              <span className="import-modal-choice-label">Import OpenAPI / Swagger</span>
              <span className="import-modal-choice-desc">Import an OpenAPI 3.x or Swagger 2.0 spec file</span>
            </span>
          </button>
        </div>

        <div className="import-modal-cancel">
          <button type="button" className="btn btn--secondary" onClick={onClose}>
            Cancel
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
};

export default ImportModal;
