import React, { useEffect } from 'react';
import { createPortal } from 'react-dom';

interface ScriptDocsModalProps {
  onClose: () => void;
}

const ScriptDocsModal: React.FC<ScriptDocsModalProps> = ({ onClose }) => {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  return createPortal(
    <div
      className="script-docs-modal__backdrop"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Scripting documentation"
    >
      <div
        className="script-docs-modal"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="script-docs-modal__header">
          <h2 className="script-docs-modal__title">Scripting API</h2>
          <button
            className="script-docs-modal__close"
            onClick={onClose}
            aria-label="Close documentation"
          >
            ×
          </button>
        </div>

        <div className="script-docs-modal__body">

          <section className="script-docs-modal__section">
            <h3 className="script-docs-modal__section-title">Overview</h3>
            <p className="script-docs-modal__text">
              Scripts run inside a sandboxed JavaScript engine. They cannot make network
              requests or access the filesystem. A single global object <code>mp</code> is
              injected into every script.
            </p>
            <p className="script-docs-modal__text">
              <strong>Pre-request scripts</strong> run before <code>{'{{variable}}'}</code>{' '}
              interpolation, so any variables set with <code>mp.env.set()</code> are
              available in the request URL, headers, and body.
            </p>
            <p className="script-docs-modal__text">
              <strong>Post-response scripts</strong> run after the HTTP response arrives.
              Use them to extract values from the response and store them as environment
              variables.
            </p>
            <p className="script-docs-modal__text">
              Script errors are non-fatal — the request still executes and errors are
              displayed in the <strong>Console</strong> tab of the response panel.
            </p>
          </section>

          <section className="script-docs-modal__section">
            <h3 className="script-docs-modal__section-title">mp.env</h3>
            <p className="script-docs-modal__text">
              Read and write variables in the active environment. Writes are persisted to
              the database immediately after the script finishes.
            </p>
            <pre className="script-docs-modal__code"><code>{`// Read a variable
const token = mp.env.get('authToken');

// Write a variable (persisted to active environment)
mp.env.set('authToken', 'Bearer abc123');`}</code></pre>
            <p className="script-docs-modal__text script-docs-modal__note">
              If no environment is active, <code>get</code> returns <code>undefined</code>{' '}
              and <code>set</code> is a no-op.
            </p>
          </section>

          <section className="script-docs-modal__section">
            <h3 className="script-docs-modal__section-title">mp.request</h3>
            <p className="script-docs-modal__text">
              Read-only snapshot of the outgoing request. Available in both pre-request
              and post-response scripts.
            </p>
            <pre className="script-docs-modal__code"><code>{`// Shape of mp.request
{
  url:     string,   // full URL after params are appended
  method:  string,   // "GET", "POST", etc.
  headers: object,   // { "Content-Type": "application/json", ... }
  body:    string    // raw request body string
}

// Example: log the method and URL before sending
console.log(mp.request.method, mp.request.url);`}</code></pre>
          </section>

          <section className="script-docs-modal__section">
            <h3 className="script-docs-modal__section-title">mp.response</h3>
            <p className="script-docs-modal__text">
              Read-only snapshot of the HTTP response. Available in <strong>post-response scripts only</strong>.{' '}
              It is <code>null</code> in pre-request scripts.
            </p>
            <pre className="script-docs-modal__code"><code>{`// Shape of mp.response
{
  status:     number,  // e.g. 200
  statusText: string,  // e.g. "200 OK"
  body:       string,  // raw response body string
  headers:    object   // { "content-type": ["application/json"], ... }
}

// Example: extract a token from a JSON response
const data = JSON.parse(mp.response.body);
mp.env.set('authToken', data.token);`}</code></pre>
          </section>

          <section className="script-docs-modal__section">
            <h3 className="script-docs-modal__section-title">console.log</h3>
            <p className="script-docs-modal__text">
              Output from <code>console.log()</code> is captured and displayed in the{' '}
              <strong>Console</strong> tab after the request completes. It is not written
              to any file or terminal.
            </p>
            <pre className="script-docs-modal__code"><code>{`// Log multiple values (joined with a space)
console.log('Status:', mp.response.status);
console.log('Body:', mp.response.body);`}</code></pre>
          </section>

          <section className="script-docs-modal__section">
            <h3 className="script-docs-modal__section-title">Examples</h3>

            <p className="script-docs-modal__label">Pre-request — inject a timestamp header</p>
            <pre className="script-docs-modal__code"><code>{`// Pre-request script
mp.env.set('requestTime', new Date().toISOString());`}</code></pre>

            <p className="script-docs-modal__label">Post-response — store an auth token</p>
            <pre className="script-docs-modal__code"><code>{`// Post-response script
if (mp.response.status === 200) {
  const body = JSON.parse(mp.response.body);
  if (body.token) {
    mp.env.set('authToken', body.token);
    console.log('Token saved:', body.token);
  }
}`}</code></pre>

            <p className="script-docs-modal__label">Pre-request — build a signed query param</p>
            <pre className="script-docs-modal__code"><code>{`// Pre-request script
const apiKey = mp.env.get('apiKey');
const ts = Date.now().toString();
mp.env.set('timestamp', ts);
mp.env.set('signature', apiKey + ':' + ts);`}</code></pre>
          </section>

        </div>
      </div>
    </div>,
    document.body
  );
};

export default ScriptDocsModal;
