import React, { useEffect } from 'react';
import { createPortal } from 'react-dom';
import './TestDocsModal.css';

interface TestDocsModalProps {
  onClose: () => void;
}

const TestDocsModal: React.FC<TestDocsModalProps> = ({ onClose }) => {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  return createPortal(
    <div
      className="test-docs-modal__backdrop"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Test assertions documentation"
    >
      <div
        className="test-docs-modal"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="test-docs-modal__header">
          <h2 className="test-docs-modal__title">Test Assertions</h2>
          <button
            className="test-docs-modal__close"
            onClick={onClose}
            aria-label="Close documentation"
          >
            ×
          </button>
        </div>

        <div className="test-docs-modal__body">

          <section className="test-docs-modal__section">
            <h3 className="test-docs-modal__section-title">Overview</h3>
            <p className="test-docs-modal__text">
              Each test is a JSON object on its own line. After the request completes,
              every assertion is evaluated against the response and reported as{' '}
              <strong>pass</strong> or <strong>fail</strong> in the{' '}
              <strong>Tests</strong> tab of the response panel.
            </p>
            <p className="test-docs-modal__text">
              A failed assertion does not abort the request — all assertions are always
              evaluated and the results are shown together.
            </p>
          </section>

          <section className="test-docs-modal__section">
            <h3 className="test-docs-modal__section-title">status</h3>
            <p className="test-docs-modal__text">
              Checks that the HTTP response status code equals the expected value.
            </p>
            <p className="test-docs-modal__text">
              Field: <code>expected</code> — the numeric status code to assert.
            </p>
            <pre className="test-docs-modal__code"><code>{`{ "type": "status", "expected": 200 }`}</code></pre>
            <p className="test-docs-modal__label">Example — assert a successful creation response</p>
            <pre className="test-docs-modal__code"><code>{`{ "type": "status", "expected": 201 }`}</code></pre>
          </section>

          <section className="test-docs-modal__section">
            <h3 className="test-docs-modal__section-title">body</h3>
            <p className="test-docs-modal__text">
              Checks that the raw response body string <em>contains</em> the expected substring.
              The check is case-sensitive.
            </p>
            <p className="test-docs-modal__text">
              Field: <code>expected</code> — the substring that must appear somewhere in the body.
            </p>
            <pre className="test-docs-modal__code"><code>{`{ "type": "body", "expected": "success" }`}</code></pre>
            <p className="test-docs-modal__label">Example — verify an error message is absent</p>
            <pre className="test-docs-modal__code"><code>{`{ "type": "body", "expected": "\"status\":\"ok\"" }`}</code></pre>
          </section>

          <section className="test-docs-modal__section">
            <h3 className="test-docs-modal__section-title">header</h3>
            <p className="test-docs-modal__text">
              Checks that a specific response header equals the expected value.
              Header names are matched case-insensitively.
            </p>
            <p className="test-docs-modal__text">
              Fields: <code>key</code> — the header name; <code>expected</code> — the exact value to match.
            </p>
            <pre className="test-docs-modal__code"><code>{`{ "type": "header", "key": "content-type", "expected": "application/json" }`}</code></pre>
            <p className="test-docs-modal__label">Example — assert the response is not cached</p>
            <pre className="test-docs-modal__code"><code>{`{ "type": "header", "key": "cache-control", "expected": "no-store" }`}</code></pre>
          </section>

          <section className="test-docs-modal__section">
            <h3 className="test-docs-modal__section-title">jsonBody</h3>
            <p className="test-docs-modal__text">
              Parses the response body as JSON and checks the value at a dot-notation
              path against the expected value. Use this to assert specific fields inside
              a JSON response without matching the entire body.
            </p>
            <p className="test-docs-modal__text">
              Fields: <code>path</code> — dot-separated path into the JSON object;{' '}
              <code>expected</code> — the value at that path (compared as a string).
            </p>
            <pre className="test-docs-modal__code"><code>{`{ "type": "jsonBody", "path": "data.id", "expected": "123" }`}</code></pre>
            <p className="test-docs-modal__label">Example — assert a nested status field</p>
            <pre className="test-docs-modal__code"><code>{`{ "type": "jsonBody", "path": "meta.status", "expected": "active" }`}</code></pre>
          </section>

          <section className="test-docs-modal__section">
            <h3 className="test-docs-modal__section-title">Examples</h3>

            <p className="test-docs-modal__label">Login endpoint — status, token present, and content-type</p>
            <pre className="test-docs-modal__code"><code>{`{ "type": "status", "expected": 200 }
{ "type": "body", "expected": "token" }
{ "type": "header", "key": "content-type", "expected": "application/json" }`}</code></pre>

            <p className="test-docs-modal__label">User profile endpoint — nested JSON fields</p>
            <pre className="test-docs-modal__code"><code>{`{ "type": "status", "expected": 200 }
{ "type": "jsonBody", "path": "user.role", "expected": "admin" }
{ "type": "jsonBody", "path": "user.active", "expected": "true" }`}</code></pre>
          </section>

        </div>
      </div>
    </div>,
    document.body
  );
};

export default TestDocsModal;
