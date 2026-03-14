import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Request } from '../types/request';
import { useRequestsStore } from '../store/requestsStore';
import { useResponseStore } from '../store/responseStore';
import { useTabsStore } from '../store/tabsStore';
import MethodSelector, { HttpMethod } from './MethodSelector';
import UrlBar from './UrlBar';
import KeyValueTable, { KVRow } from './KeyValueTable';
import BodyEditor, { BodyType } from './BodyEditor';
import AuthEditor, { AuthType, AuthConfig } from './AuthEditor';
import TestsEditor from './TestsEditor';
import { main } from '../../wailsjs/go/models';

type Tab = 'params' | 'headers' | 'body' | 'auth' | 'tests';

interface RequestEditorProps {
  request: Request;
}

/** Parse a JSON string into KVRow[]; returns [] on failure. */
function parseKV(json: string): KVRow[] {
  try {
    const parsed = JSON.parse(json);
    if (Array.isArray(parsed)) return parsed as KVRow[];
  } catch {
    // ignore
  }
  return [];
}

const RequestEditor: React.FC<RequestEditorProps> = ({ request }) => {
  const updateRequest = useRequestsStore((s) => s.updateRequest);
  const { sendRequest, cancelRequest, isLoading, error: responseError } = useResponseStore();
  const { markDirty, markClean } = useTabsStore();

  /** Parse auth_config JSON string into AuthConfig object; returns {} on failure. */
  function parseAuthConfig(raw: string): AuthConfig {
    try {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed as AuthConfig;
    } catch {
      // ignore
    }
    return {};
  }

  // Local editable state — initialized from prop, synced when request.id changes
  const [method, setMethod] = useState(request.method);
  const [url, setUrl] = useState(request.url);
  const [headers, setHeaders] = useState<KVRow[]>(parseKV(request.headers));
  const [params, setParams] = useState<KVRow[]>(parseKV(request.params));
  const [bodyType, setBodyType] = useState<BodyType>(request.body_type as BodyType);
  const [body, setBody] = useState(request.body);
  const [authType, setAuthType] = useState<AuthType>((request.auth_type as AuthType) || 'none');
  const [authConfig, setAuthConfig] = useState<AuthConfig>(parseAuthConfig(request.auth_config));
  const [timeoutSeconds, setTimeoutSeconds] = useState(request.timeout_seconds);
  const [tests, setTests] = useState(request.tests);
  const [activeTab, setActiveTab] = useState<Tab>('params');

  // Reset local state when the selected request changes
  useEffect(() => {
    setMethod(request.method);
    setUrl(request.url);
    setHeaders(parseKV(request.headers));
    setParams(parseKV(request.params));
    setBodyType(request.body_type as BodyType);
    setBody(request.body);
    setAuthType((request.auth_type as AuthType) || 'none');
    setAuthConfig(parseAuthConfig(request.auth_config));
    setTimeoutSeconds(request.timeout_seconds);
    setTests(request.tests);
  }, [request.id]); // eslint-disable-line react-hooks/exhaustive-deps

  /** True when the active request is a read-only history snapshot (not persisted). */
  const isEphemeral = request.collection_id === '';

  /** Build a payload from current local state, then persist. */
  const persist = useCallback(
    (overrides: Partial<main.RequestPayload> = {}) => {
      if (isEphemeral) return; // history entries are not saved to SQLite
      const payload: main.RequestPayload = {
        id: request.id,
        method,
        url,
        headers: JSON.stringify(headers),
        params: JSON.stringify(params),
        body_type: bodyType,
        body,
        auth_type: authType,
        auth_config: JSON.stringify(authConfig),
        timeout_seconds: timeoutSeconds,
        tests,
        ...overrides,
      } as main.RequestPayload;
      updateRequest(payload)
        .then(() => markClean(request.id))
        .catch((err) => console.error('UpdateRequest failed:', err));
    },
    [isEphemeral, request.id, method, url, headers, params, bodyType, body, authType, authConfig, timeoutSeconds, tests, updateRequest, markClean]
  );

  /** Debounce ref for URL changes */
  const persistTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const schedulePersist = (overrides: Partial<main.RequestPayload> = {}) => {
    if (persistTimer.current) clearTimeout(persistTimer.current);
    persistTimer.current = setTimeout(() => persist(overrides), 0);
  };

  const handleMethodChange = (m: HttpMethod) => {
    setMethod(m);
    markDirty(request.id);
    schedulePersist({ method: m });
  };

  const handleUrlChange = (u: string) => {
    setUrl(u);
    markDirty(request.id);
    schedulePersist({ url: u });
  };

  const handleHeadersChange = (rows: KVRow[]) => {
    setHeaders(rows);
    markDirty(request.id);
    schedulePersist({ headers: JSON.stringify(rows) });
  };

  const handleParamsChange = (rows: KVRow[]) => {
    setParams(rows);
    markDirty(request.id);
    schedulePersist({ params: JSON.stringify(rows) });
  };

  const handleBodyTypeChange = (t: BodyType) => {
    setBodyType(t);
    markDirty(request.id);
    schedulePersist({ body_type: t });
  };

  const handleBodyChange = (b: string) => {
    setBody(b);
    markDirty(request.id);
    schedulePersist({ body: b });
  };

  const handleAuthTypeChange = (t: AuthType) => {
    setAuthType(t);
    markDirty(request.id);
    schedulePersist({ auth_type: t, auth_config: JSON.stringify(authConfig) });
  };

  const handleAuthConfigChange = (cfg: AuthConfig) => {
    setAuthConfig(cfg);
    markDirty(request.id);
    schedulePersist({ auth_type: authType, auth_config: JSON.stringify(cfg) });
  };

  const handleTimeoutChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const v = parseInt(e.target.value, 10);
    const newVal = isNaN(v) ? 0 : Math.max(0, v);
    setTimeoutSeconds(newVal);
    markDirty(request.id);
    schedulePersist({ timeout_seconds: newVal });
  };

  const handleTestsChange = (t: string) => {
    setTests(t);
    markDirty(request.id);
    schedulePersist({ tests: t });
  };

  const handleSendOrCancel = useCallback(() => {
    if (isLoading) {
      cancelRequest();
    } else {
      sendRequest(request.id).catch(() => {
        // errors are stored in responseStore; nothing extra needed here
      });
    }
  }, [isLoading, cancelRequest, sendRequest, request.id]);

  return (
    <div className="request-editor">
      {/* Top bar: method + url + send */}
      <div className="request-editor-bar">
        <MethodSelector value={method} onChange={handleMethodChange} />
        <UrlBar value={url} onChange={handleUrlChange} />
        <div className="timeout-input-wrapper" title="Request timeout (0 for none)">
          <input
            type="number"
            className="timeout-input"
            value={timeoutSeconds}
            onChange={handleTimeoutChange}
            min="0"
          />
          <span className="timeout-unit">s</span>
        </div>
        <button
          className={`send-btn${isLoading ? ' send-btn--cancel' : ''}`}
          onClick={handleSendOrCancel}
          disabled={isEphemeral}
          title={isEphemeral ? 'Save this request to a collection to send it' : undefined}
          aria-label={isLoading ? 'Cancel request' : 'Send request'}
        >
          {isLoading ? (
            <>
              <span className="send-btn-spinner" aria-hidden="true" />
              {' Cancel'}
            </>
          ) : (
            'Send'
          )}
        </button>
      </div>

      {/* Inline error from last send */}
      {responseError && (
        <div className="send-error" role="alert">
          {responseError}
        </div>
      )}

      {/* Tab navigation */}
      {(() => {
        const paramsCount = params.filter((p) => p.enabled && p.key).length;
        const headersCount = headers.filter((h) => h.enabled && h.key).length;
        const hasBody = body.trim().length > 0;
        const hasAuth = authType !== 'none';
        const testsCount = tests.split('\n').filter(line => line.trim()).length;

        const tabLabels: Record<Tab, { label: string; badge: number | boolean }> = {
          params:  { label: 'Params',  badge: paramsCount },
          headers: { label: 'Headers', badge: headersCount },
          body:    { label: 'Body',    badge: hasBody },
          auth:    { label: 'Auth',    badge: hasAuth },
          tests:   { label: 'Tests',   badge: testsCount },
        };

        return (
          <div className="request-editor-tabs">
            {(['params', 'headers', 'body', 'auth', 'tests'] as Tab[]).map((tab) => {
              const { label, badge } = tabLabels[tab];
              const showBadge = typeof badge === 'boolean' ? badge : badge > 0;
              const badgeText = typeof badge === 'boolean' ? '●' : String(badge);
              return (
                <button
                  key={tab}
                  className={`re-tab${activeTab === tab ? ' re-tab--active' : ''}`}
                  onClick={() => setActiveTab(tab)}
                >
                  {label}
                  {showBadge && (
                    <span className="re-tab-count">{badgeText}</span>
                  )}
                </button>
              );
            })}
          </div>
        );
      })()}

      {/* Tab panels */}
      <div className="request-editor-panel">
        {activeTab === 'params' && (
          <KeyValueTable
            rows={params}
            onChange={handleParamsChange}
            keyPlaceholder="Parameter"
            valuePlaceholder="Value"
          />
        )}

        {activeTab === 'headers' && (
          <KeyValueTable
            rows={headers}
            onChange={handleHeadersChange}
            keyPlaceholder="Header"
            valuePlaceholder="Value"
          />
        )}

        {activeTab === 'body' && (
          <BodyEditor
            method={method}
            bodyType={bodyType}
            body={body}
            onBodyTypeChange={handleBodyTypeChange}
            onBodyChange={handleBodyChange}
          />
        )}

        {activeTab === 'auth' && (
          <AuthEditor
            authType={authType}
            authConfig={authConfig}
            onAuthTypeChange={handleAuthTypeChange}
            onAuthConfigChange={handleAuthConfigChange}
          />
        )}

        {activeTab === 'tests' && (
          <TestsEditor
            value={tests}
            onChange={handleTestsChange}
          />
        )}
      </div>
    </div>
  );
};

export default RequestEditor;
