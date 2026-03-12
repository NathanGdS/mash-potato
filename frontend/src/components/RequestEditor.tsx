import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Request } from '../types/request';
import { useRequestsStore } from '../store/requestsStore';
import { useResponseStore } from '../store/responseStore';
import MethodSelector, { HttpMethod } from './MethodSelector';
import UrlBar from './UrlBar';
import KeyValueTable, { KVRow } from './KeyValueTable';
import BodyEditor, { BodyType } from './BodyEditor';
import { RequestPayload } from '../wailsjs/go/main/App';

type Tab = 'params' | 'headers' | 'body';

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

  // Local editable state — initialized from prop, synced when request.id changes
  const [method, setMethod] = useState(request.method);
  const [url, setUrl] = useState(request.url);
  const [headers, setHeaders] = useState<KVRow[]>(parseKV(request.headers));
  const [params, setParams] = useState<KVRow[]>(parseKV(request.params));
  const [bodyType, setBodyType] = useState<BodyType>(request.body_type as BodyType);
  const [body, setBody] = useState(request.body);
  const [activeTab, setActiveTab] = useState<Tab>('params');

  // Reset local state when the selected request changes
  useEffect(() => {
    setMethod(request.method);
    setUrl(request.url);
    setHeaders(parseKV(request.headers));
    setParams(parseKV(request.params));
    setBodyType(request.body_type as BodyType);
    setBody(request.body);
  }, [request.id]); // eslint-disable-line react-hooks/exhaustive-deps

  /** Build a payload from current local state, then persist. */
  const persist = useCallback(
    (overrides: Partial<RequestPayload> = {}) => {
      const payload: RequestPayload = {
        id: request.id,
        method,
        url,
        headers: JSON.stringify(headers),
        params: JSON.stringify(params),
        body_type: bodyType,
        body,
        ...overrides,
      };
      updateRequest(payload).catch((err) => console.error('UpdateRequest failed:', err));
    },
    [request.id, method, url, headers, params, bodyType, body, updateRequest]
  );

  /** Debounce ref for URL changes */
  const persistTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const schedulePersist = (overrides: Partial<RequestPayload> = {}) => {
    if (persistTimer.current) clearTimeout(persistTimer.current);
    persistTimer.current = setTimeout(() => persist(overrides), 0);
  };

  const handleMethodChange = (m: HttpMethod) => {
    setMethod(m);
    schedulePersist({ method: m });
  };

  const handleUrlChange = (u: string) => {
    setUrl(u);
    schedulePersist({ url: u });
  };

  const handleHeadersChange = (rows: KVRow[]) => {
    setHeaders(rows);
    schedulePersist({ headers: JSON.stringify(rows) });
  };

  const handleParamsChange = (rows: KVRow[]) => {
    setParams(rows);
    schedulePersist({ params: JSON.stringify(rows) });
  };

  const handleBodyTypeChange = (t: BodyType) => {
    setBodyType(t);
    schedulePersist({ body_type: t });
  };

  const handleBodyChange = (b: string) => {
    setBody(b);
    schedulePersist({ body: b });
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
        <button
          className={`send-btn${isLoading ? ' send-btn--cancel' : ''}`}
          onClick={handleSendOrCancel}
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

        const tabLabels: Record<Tab, { label: string; badge: number | boolean }> = {
          params:  { label: 'Params',  badge: paramsCount },
          headers: { label: 'Headers', badge: headersCount },
          body:    { label: 'Body',    badge: hasBody },
        };

        return (
          <div className="request-editor-tabs">
            {(['params', 'headers', 'body'] as Tab[]).map((tab) => {
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
      </div>
    </div>
  );
};

export default RequestEditor;
