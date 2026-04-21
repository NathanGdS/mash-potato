import React, { useState, useRef, useEffect } from 'react';
import ReactDOM from 'react-dom';
import { useCollectionsStore } from '../store/collectionsStore';
import './Modal.css';

interface Props {
  onClose: () => void;
}

const NewCollectionModal: React.FC<Props> = ({ onClose }) => {
  const [name, setName] = useState('');
  const [validationError, setValidationError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const createCollection = useCollectionsStore((s) => s.createCollection);

  // Auto-focus the input when the modal opens.
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = name.trim();

    if (!trimmed) {
      setValidationError('Name is required.');
      return;
    }

    setValidationError('');
    setSubmitting(true);
    try {
      await createCollection(trimmed);
      onClose();
    } catch (err) {
      setValidationError(String(err));
    } finally {
      setSubmitting(false);
    }
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

  return ReactDOM.createPortal(
    <div
      className="modal-backdrop"
      onClick={handleBackdropClick}
      onKeyDown={handleKeyDown}
      role="dialog"
      aria-modal="true"
      aria-labelledby="new-collection-title"
    >
      <div className="modal-box">
        <h2 id="new-collection-title" className="modal-title">
          New Collection
        </h2>

        <form onSubmit={handleSubmit} noValidate>
          <div className="modal-field">
            <label htmlFor="collection-name" className="modal-label">
              Collection name
            </label>
            <input
              id="collection-name"
              ref={inputRef}
              type="text"
              className={`modal-input${validationError ? ' modal-input--error' : ''}`}
              placeholder="My Collection"
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                if (validationError) setValidationError('');
              }}
              disabled={submitting}
              maxLength={200}
            />
            {validationError && (
              <span className="modal-error" role="alert">
                {validationError}
              </span>
            )}
          </div>

          <div className="modal-actions">
            <button
              type="button"
              className="btn btn--secondary"
              onClick={onClose}
              disabled={submitting}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="btn btn--primary"
              disabled={submitting}
            >
              {submitting ? 'Creating…' : 'Create'}
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body
  );
};

export default NewCollectionModal;
