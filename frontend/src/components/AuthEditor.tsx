import React, { useEffect, useRef, useState } from 'react';
import VarPopover from './VarPopover';
import VarTooltip from './VarTooltip';
import { useVarAutocomplete } from '../hooks/useVarAutocomplete';
import { useVarHoverTooltip } from '../hooks/useVarHoverTooltip';
import { parseVarSegments } from '../utils/varSegments';

const DEBOUNCE_MS = 300;

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

/** A single-line input with {{variable}} autocomplete and hover tooltip support. */
const VarInput: React.FC<{
  value: string;
  placeholder?: string;
  type?: string;
  onChange: (v: string) => void;
  ariaLabel?: string;
}> = ({ value, placeholder, type = 'text', onChange, ariaLabel }) => {
  const [local, setLocal] = useState(value);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const mirrorInnerRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    setLocal(value);
  }, [value]);

  const syncScroll = () => {
    if (inputRef.current && mirrorInnerRef.current) {
      mirrorInnerRef.current.style.transform = `translateX(-${inputRef.current.scrollLeft}px)`;
    }
  };

  const { open, filteredVars, selectedIdx, checkTrigger, select, onKeyDown, close } =
    useVarAutocomplete({
      inputRef,
      onInsert: (v) => { setLocal(v); onChange(v); syncScroll(); },
    });

  const { wrapperProps, tooltipState, cancelDismiss } = useVarHoverTooltip({
    inputRef,
    isPassword: type === 'password',
  });

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const v = e.target.value;
    setLocal(v);
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => onChange(v), DEBOUNCE_MS);
    checkTrigger();
    syncScroll();
  };

  const handleBlur = () => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    onChange(local);
  };

  const segments = parseVarSegments(local);

  return (
    <div className="kv-value-wrapper kv-value-wrapper--mono" style={{ flex: 1 }} {...wrapperProps}>
      <div className="kv-value-mirror" aria-hidden="true">
        <span ref={mirrorInnerRef} className="kv-value-mirror-inner">
          {segments.map((seg, i) =>
            seg.isVar ? (
              <span key={i} className="var-token" data-var-name={seg.text.slice(2, -2)}>{seg.text}</span>
            ) : (
              <span key={i}>{seg.text}</span>
            )
          )}
        </span>
      </div>
      <input
        ref={inputRef}
        type={type}
        className="auth-field-input kv-input--highlight"
        value={local}
        placeholder={placeholder}
        aria-label={ariaLabel}
        onChange={handleChange}
        onBlur={handleBlur}
        onKeyDown={(e) => { onKeyDown(e); syncScroll(); }}
        onClick={syncScroll}
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
      {tooltipState !== null && (
        <VarTooltip
          varName={tooltipState.varName}
          anchorRect={tooltipState.anchorRect}
          isPassword={tooltipState.isPassword}
          onMouseEnter={cancelDismiss}
          onMouseLeave={wrapperProps.onMouseLeave}
        />
      )}
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
