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
              injected into every script, along with the global function{' '}
              <code>setNextRequest</code> for collection runner flow control.
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
            <h3 className="script-docs-modal__section-title">setNextRequest</h3>
            <p className="script-docs-modal__text">
              Global function available in both pre-request and post-response scripts when
              running inside the <strong>Collection Runner</strong>. Controls which request
              executes next, enabling branching, looping, and early exit.
            </p>
            <CodeBlock>{`// Jump to a named request
setNextRequest('Login');

// Stop the run immediately (equivalent to passing null or undefined)
setNextRequest(null);

// Loop — re-run the current request
setNextRequest(mp.request.url); // not valid; use the request NAME, not the URL
// setNextRequest('Poll Job Status'); // runs that request next`}</CodeBlock>
            <p className="script-docs-modal__text">
              The runner automatically halts with a warning when the same request is visited
              more than the configured loop limit (default: 10) times in a single run. The
              limit is adjustable in <strong>Settings</strong>.
            </p>
            <p className="script-docs-modal__text script-docs-modal__note">
              <code>setNextRequest</code> has no effect when a request is executed outside
              the collection runner (i.e., from the main request editor). Calling it with an
              unknown request name stops the run with an error.
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

            <p className="script-docs-modal__label">Runner — re-authenticate on 401</p>
            <CodeBlock>{`// Post-response script on any protected request
if (mp.response.status === 401) {
  setNextRequest('Login'); // jump to the Login request, then resume
}`}</CodeBlock>

            <p className="script-docs-modal__label">Runner — pass a token between requests</p>
            <CodeBlock>{`// Post-response script on "Login" request
const token = mp.response.json().access_token;
mp.runVars.set('token', token);
// Downstream requests can use {{run.token}} in their URL/headers/body`}</CodeBlock>

            <p className="script-docs-modal__label">Runner — poll until a job finishes</p>
            <CodeBlock>{`// Post-response script on "Poll Job Status"
const body = mp.response.json();
if (body.status !== 'done') {
  setNextRequest('Poll Job Status'); // loop back; runner loop limit prevents infinite loops
}`}</CodeBlock>

            <p className="script-docs-modal__label">Runner — stop early on unexpected error</p>
            <CodeBlock>{`// Post-response script
if (mp.response.status >= 500) {
  console.log('Server error, aborting run');
  setNextRequest(null);
}`}</CodeBlock>
          </section>

        </div>
      </div>
    </div>,
    document.body
  );
};

export default ScriptDocsModal;
