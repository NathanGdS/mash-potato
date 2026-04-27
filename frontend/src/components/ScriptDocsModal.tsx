import React, { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { highlightCode } from '../utils/codeHighlighter';

interface ScriptDocsModalProps {
  onClose: () => void;
}

const CodeBlock: React.FC<{ children: string }> = ({ children }) => (
  <pre
    className="script-docs-modal__code"
    dangerouslySetInnerHTML={{ __html: highlightCode(children, 'JavaScript') }}
  />
);

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
              injected into every script, along with the global functions{' '}
              <code>doRequest(path)</code> and <code>stopRunner()</code> for collection runner
              control.
            </p>
            <p className="script-docs-modal__text">
              <strong>Pre-request scripts</strong> run before <code>{'{{variable}}'}</code>{' '}
              interpolation, so any variables set with <code>mp.env.set()</code> or{' '}
              <code>mp.runVars.set()</code> are available in the request URL, headers, and body.
            </p>
            <p className="script-docs-modal__text">
              <strong>Post-response scripts</strong> run after the HTTP response arrives.
              Use them to extract values from the response and store them as environment
              or run variables.
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
            <CodeBlock>{`// Read a variable
const token = mp.env.get('authToken');

// Write a variable (persisted to active environment)
mp.env.set('authToken', 'Bearer abc123');`}</CodeBlock>
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
            <CodeBlock>{`// Shape of mp.request
{
  url:     string,   // full URL after params are appended
  method:  string,   // "GET", "POST", etc.
  headers: object,   // { "Content-Type": "application/json", ... }
  body:    string    // raw request body string
}

// Example: log the method and URL before sending
console.log(mp.request.method, mp.request.url);`}</CodeBlock>
          </section>

          <section className="script-docs-modal__section">
            <h3 className="script-docs-modal__section-title">mp.response</h3>
            <p className="script-docs-modal__text">
              Read-only snapshot of the HTTP response. Available in <strong>post-response scripts only</strong>.{' '}
              It is <code>null</code> in pre-request scripts.
            </p>
            <CodeBlock>{`// Shape of mp.response
{
  status:     number,   // e.g. 200
  statusText: string,   // e.g. "OK"
  body:       string,   // raw response body string
  headers:    object,   // { "content-type": "application/json", ... }
  json():     function  // parses body as JSON; returns undefined if invalid
}

// Example: extract a token using json() helper
const data = mp.response.json();
mp.env.set('authToken', data.token);

// Equivalent manual approach
const data2 = JSON.parse(mp.response.body);`}</CodeBlock>
            <p className="script-docs-modal__text script-docs-modal__note">
              <code>mp.response.json()</code> returns <code>undefined</code> (does not throw)
              when the body is not valid JSON.
            </p>
          </section>

          <section className="script-docs-modal__section">
            <h3 className="script-docs-modal__section-title">mp.runVars</h3>
            <p className="script-docs-modal__text">
              In-memory key/value store scoped to a single collection run. Use run variables
              to pass intermediate values (tokens, cursors, IDs) between requests without
              persisting them to the active environment. Run variables are discarded at the
              end of each run.
            </p>
            <CodeBlock>{`// Set a run variable in a post-response script
mp.runVars.set('token', mp.response.json().access_token);

// Read it in a later request's pre-request or post-response script
const token = mp.runVars.get('token');`}</CodeBlock>
            <p className="script-docs-modal__text">
              Reference run variables in URL, headers, params, body, and auth config using the{' '}
              <code>{'{{run.key}}'}</code> syntax. Environment variables of the same name take
              precedence over run variables.
            </p>
            <CodeBlock>{`// In a request URL or header value:
// https://api.example.com/resource?token={{run.token}}

// mp.runVars is available in both pre-request and post-response scripts.`}</CodeBlock>
            <p className="script-docs-modal__text script-docs-modal__note">
              <code>get</code> returns <code>undefined</code> when the key has not been set.
              Run variables never persist into the active environment.
            </p>
          </section>

          <section className="script-docs-modal__section">
            <h3 className="script-docs-modal__section-title">doRequest(path)</h3>
            <p className="script-docs-modal__text">
              Global function available in both pre-request and post-response scripts.
              Executes another request by its path and returns the response synchronously.
              The path format is <code>collection/request</code> or{' '}
              <code>collection/folder/request</code> for nested requests.
            </p>
            <CodeBlock>{`// Shape of the return value
{
  status:     number,   // e.g. 200
  statusText: string,   // e.g. "OK"
  body:       string,   // raw response body
  headers:    object,   // response headers
  json():     function  // parses body as JSON
}

// Example: fetch a token in a pre-request script
const auth = doRequest('auth-collection/get-token');
const token = auth.json().access_token;
mp.env.set('authToken', token);`}</CodeBlock>
            <p className="script-docs-modal__text">
              <strong>Error cases:</strong> path not found throws a JS exception; network errors
              throw a JS exception; HTTP 4xx/5xx responses are returned normally (not thrown).
            </p>
            <p className="script-docs-modal__text script-docs-modal__note">
              <code>doRequest</code> has a maximum recursion depth of 5. Circular calls
              (A → B → A) will hit this limit and surface as a script error. Environment
              mutations from the sub-request persist into the parent run.
            </p>
          </section>

          <section className="script-docs-modal__section">
            <h3 className="script-docs-modal__section-title">stopRunner()</h3>
            <p className="script-docs-modal__text">
              Global function that halts the collection run after the current request completes.
              Has no effect in standalone execution (single request sent from the editor).
            </p>
            <CodeBlock>{`// Stop the run if we get an unexpected error
if (mp.response.status >= 500) {
  console.log('Server error, aborting run');
  stopRunner();
}

// Stop after finding the data we need
const data = mp.response.json();
if (data.found) {
  stopRunner();
}`}</CodeBlock>
            <p className="script-docs-modal__text script-docs-modal__note">
              When <code>stopRunner()</code> is called, the run's terminal state becomes{' '}
              <code>"stopped_by_script"</code> and remaining requests are skipped.
            </p>
          </section>

          <section className="script-docs-modal__section">
            <h3 className="script-docs-modal__section-title">console.log</h3>
            <p className="script-docs-modal__text">
              Output from <code>console.log()</code> is captured and displayed in the{' '}
              <strong>Console</strong> tab after the request completes. It is not written
              to any file or terminal.
            </p>
            <CodeBlock>{`// Log multiple values (joined with a space)
console.log('Status:', mp.response.status);
console.log('Body:', mp.response.body);`}</CodeBlock>
          </section>

          <section className="script-docs-modal__section">
            <h3 className="script-docs-modal__section-title">Examples</h3>

            <p className="script-docs-modal__label">Pre-request — inject a timestamp header</p>
            <CodeBlock>{`// Pre-request script
mp.env.set('requestTime', new Date().toISOString());`}</CodeBlock>

            <p className="script-docs-modal__label">Post-response — store an auth token</p>
            <CodeBlock>{`// Post-response script
if (mp.response.status === 200) {
  const body = mp.response.json();
  if (body.token) {
    mp.env.set('authToken', body.token);
    console.log('Token saved:', body.token);
  }
}`}</CodeBlock>

            <p className="script-docs-modal__label">Pre-request — build a signed query param</p>
            <CodeBlock>{`// Pre-request script
const apiKey = mp.env.get('apiKey');
const ts = Date.now().toString();
mp.env.set('timestamp', ts);
mp.env.set('signature', apiKey + ':' + ts);`}</CodeBlock>

            <p className="script-docs-modal__label">Pre-request — fetch token via doRequest</p>
            <CodeBlock>{`// Pre-request script: authenticate before the main request
const auth = doRequest('auth-collection/login');
if (auth.status === 200) {
  mp.env.set('authToken', auth.json().token);
}`}</CodeBlock>

            <p className="script-docs-modal__label">Runner — pass a token between requests</p>
            <CodeBlock>{`// Post-response script on "Login" request
const token = mp.response.json().access_token;
mp.runVars.set('token', token);
// Downstream requests can use {{run.token}} in their URL/headers/body`}</CodeBlock>

            <p className="script-docs-modal__label">Runner — stop early on unexpected error</p>
            <CodeBlock>{`// Post-response script
if (mp.response.status >= 500) {
  console.log('Server error, aborting run');
  stopRunner();
}`}</CodeBlock>
          </section>

        </div>
      </div>
    </div>,
    document.body
  );
};

export default ScriptDocsModal;
