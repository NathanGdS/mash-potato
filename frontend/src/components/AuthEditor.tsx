import React, { useRef } from 'react';
import VarPopover from './VarPopover';
import { useVarAutocomplete } from '../hooks/useVarAutocomplete';

export type AuthType = 'none' | 'bearer' | 'basic' | 'apikey';

export interface AuthConfig {
  token?: string;     // bearer
  username?: string;  // basic
  password?: string;  // basic
  keyName?: string;   // apikey: header/param name
  keyValue?: string;  // apikey: value
  addTo?: 'header' | 'query'; // apikey
}

interface AuthEditorProps {
  authType: AuthType;
  authConfig: AuthConfig;
  onAuthTypeChange: (t: AuthType) => void;
  onAuthConfigChange: (cfg: AuthConfig) => void;
}

const AUTH_TYPES: AuthType[] = ['none', 'bearer', 'basic', 'apikey'];

const AUTH_TYPE_LABELS: Record<AuthType, string> = {
  none: 'None',
  bearer: 'Bearer Token',
  basic: 'Basic Auth',
  apikey: 'API Key',
};

/** A single-line input with {{variable}} autocomplete support. */
const VarInput: React.FC<{
  value: string;
  placeholder?: string;
  type?: string;
  onChange: (v: string) => void;
  ariaLabel?: string;
}> = ({ value, placeholder, type = 'text', onChange, ariaLabel }) => {
  const inputRef = useRef<HTMLInputElement>(null);
  const { open, filteredVars, selectedIdx, checkTrigger, select, onKeyDown, close } =
    useVarAutocomplete({
      inputRef,
      onInsert: onChange,
    });

  return (
    <div style={{ position: 'relative', flex: 1 }}>
      <input
        ref={inputRef}
        type={type}
        className="auth-field-input"
        value={value}
        placeholder={placeholder}
        aria-label={ariaLabel}
        onChange={(e) => { onChange(e.target.value); checkTrigger(); }}
        onKeyDown={onKeyDown}
        autoComplete="off"
        spellCheck={false}
      />
      <VarPopover
        open={open}
        items={filteredVars}
        selectedIdx={selectedIdx}
        anchorRef={inputRef}
        onSelect={select}
        onClose={close}
      />
    </div>
  );
};

const AuthEditor: React.FC<AuthEditorProps> = ({
  authType,
  authConfig,
  onAuthTypeChange,
  onAuthConfigChange,
}) => {
  const update = (patch: Partial<AuthConfig>) =>
    onAuthConfigChange({ ...authConfig, ...patch });

  return (
    <div className="auth-editor">
      {/* Auth type selector */}
      <div className="auth-type-selector">
        <label className="auth-type-label">Auth Type</label>
        <div className="auth-type-options">
          {AUTH_TYPES.map((t) => (
            <label
              key={t}
              className={`auth-type-option${authType === t ? ' active' : ''}`}
            >
              <input
                type="radio"
                name="auth-type"
                value={t}
                checked={authType === t}
                onChange={() => onAuthTypeChange(t)}
              />
              {AUTH_TYPE_LABELS[t]}
            </label>
          ))}
        </div>
      </div>

      {/* None */}
      {authType === 'none' && (
        <p className="auth-editor-empty">No authentication.</p>
      )}

      {/* Bearer Token */}
      {authType === 'bearer' && (
        <div className="auth-fields">
          <div className="auth-field-row">
            <span className="auth-field-label">Token</span>
            <VarInput
              value={authConfig.token ?? ''}
              placeholder="Bearer token or {{variable}}"
              ariaLabel="Bearer token"
              onChange={(v) => update({ token: v })}
            />
          </div>
          <p className="auth-field-hint">
            Sends <code>Authorization: Bearer &lt;token&gt;</code> at send time. Not stored in headers.
          </p>
        </div>
      )}

      {/* Basic Auth */}
      {authType === 'basic' && (
        <div className="auth-fields">
          <div className="auth-field-row">
            <span className="auth-field-label">Username</span>
            <VarInput
              value={authConfig.username ?? ''}
              placeholder="Username or {{variable}}"
              ariaLabel="Basic auth username"
              onChange={(v) => update({ username: v })}
            />
          </div>
          <div className="auth-field-row">
            <span className="auth-field-label">Password</span>
            <VarInput
              value={authConfig.password ?? ''}
              placeholder="Password or {{variable}}"
              type="password"
              ariaLabel="Basic auth password"
              onChange={(v) => update({ password: v })}
            />
          </div>
          <p className="auth-field-hint">
            Sends <code>Authorization: Basic &lt;base64&gt;</code> at send time. Not stored in headers.
          </p>
        </div>
      )}

      {/* API Key */}
      {authType === 'apikey' && (
        <div className="auth-fields">
          <div className="auth-field-row">
            <span className="auth-field-label">Key Name</span>
            <VarInput
              value={authConfig.keyName ?? ''}
              placeholder="e.g. X-API-Key"
              ariaLabel="API key name"
              onChange={(v) => update({ keyName: v })}
            />
          </div>
          <div className="auth-field-row">
            <span className="auth-field-label">Key Value</span>
            <VarInput
              value={authConfig.keyValue ?? ''}
              placeholder="API key value or {{variable}}"
              ariaLabel="API key value"
              onChange={(v) => update({ keyValue: v })}
            />
          </div>
          <div className="auth-field-row">
            <span className="auth-field-label">Add to</span>
            <div className="auth-type-options auth-type-options--inline">
              {(['header', 'query'] as const).map((loc) => (
                <label
                  key={loc}
                  className={`auth-type-option${(authConfig.addTo ?? 'header') === loc ? ' active' : ''}`}
                >
                  <input
                    type="radio"
                    name="apikey-in"
                    value={loc}
                    checked={(authConfig.addTo ?? 'header') === loc}
                    onChange={() => update({ addTo: loc })}
                  />
                  {loc === 'header' ? 'Header' : 'Query Param'}
                </label>
              ))}
            </div>
          </div>
          <p className="auth-field-hint">
            Injected at send time. Not stored in headers or params.
          </p>
        </div>
      )}
    </div>
  );
};

export default AuthEditor;
