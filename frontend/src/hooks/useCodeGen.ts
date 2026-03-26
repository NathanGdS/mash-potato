import { useMemo } from 'react';
import { Request } from '../types/request';
import { Language } from '../utils/codeGen/index';
import { generateCurl } from '../utils/codeGen/curl';
import { generatePythonRequests } from '../utils/codeGen/pythonRequests';
import { generateJsFetch } from '../utils/codeGen/jsFetch';
import { generateJsAxios } from '../utils/codeGen/jsAxios';
import { generateTsFetch } from '../utils/codeGen/tsFetch';
import { generateGoNetHttp } from '../utils/codeGen/goNetHttp';
import { generateJavaHttpClient } from '../utils/codeGen/javaHttpClient';
import { useEnvironmentsStore } from '../store/environmentsStore';
import { EnvironmentVariable } from '../wailsjs/go/main/App';
import { AuthConfig } from '../components/AuthEditor';

/**
 * A fully-interpolated copy of a Request where all `{{var}}` tokens in
 * string fields have been replaced with their resolved values.
 */
export interface ResolvedRequest extends Request {}

/**
 * Replicate the `{{var}}` interpolation logic from `interpolator.go`.
 * Replaces every occurrence of `{{key}}` in `text` using the provided map.
 * Unknown keys are left as-is.
 */
function interpolateString(text: string, vars: Record<string, string>): string {
  return text.replace(/\{\{([^}]+)\}\}/g, (match, key) => {
    return Object.prototype.hasOwnProperty.call(vars, key) ? vars[key] : match;
  });
}

/**
 * Build a flat key→value map from the active and global environment variables.
 * Active env vars take precedence over global vars with the same key.
 */
function buildVarMap(envVars: EnvironmentVariable[]): Record<string, string> {
  const map: Record<string, string> = {};
  for (const v of envVars) {
    map[v.key] = v.value;
  }
  return map;
}

/**
 * Apply variable interpolation to all string fields of the request that may
 * contain `{{var}}` tokens.
 */
export function interpolateRequest(
  request: Request,
  envVars: EnvironmentVariable[]
): ResolvedRequest {
  const vars = buildVarMap(envVars);
  return {
    ...request,
    url: interpolateString(request.url, vars),
    headers: interpolateString(request.headers, vars),
    params: interpolateString(request.params, vars),
    body: interpolateString(request.body, vars),
    auth_config: interpolateString(request.auth_config, vars),
  };
}

interface KVRow {
  key: string;
  value: string;
  enabled: boolean;
}

function parseKVRows(raw: string): KVRow[] {
  if (!raw || raw.trim() === '') return [];
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed as KVRow[];
    return [];
  } catch {
    return [];
  }
}

/**
 * Inject auth credentials into the `headers` (and optionally `params`) of a
 * `ResolvedRequest` so that all code generators receive a complete headers
 * array without needing auth-specific logic.
 *
 * Rules:
 * - Skips injection if the target header key already exists (case-insensitive).
 * - Bearer  → `Authorization: Bearer <token>`
 * - Basic   → `Authorization: Basic <btoa(user:pass)>`
 * - API Key (header) → `<keyName>: <keyValue>`
 * - API Key (query)  → appended to `params`
 */
export function mergeAuth(resolved: ResolvedRequest): ResolvedRequest {
  const authType = resolved.auth_type;
  if (!authType || authType === 'none') return resolved;

  let config: AuthConfig = {};
  try {
    const parsed = JSON.parse(resolved.auth_config);
    if (parsed && typeof parsed === 'object') config = parsed as AuthConfig;
  } catch {
    // malformed JSON — treat as empty config
  }

  const headers = parseKVRows(resolved.headers);
  const params = parseKVRows(resolved.params);

  /** Returns true when a header with this key already exists (case-insensitive). */
  const headerExists = (key: string): boolean =>
    headers.some((h) => h.key.toLowerCase() === key.toLowerCase());

  /** Returns true when a param with this key already exists (case-insensitive). */
  const paramExists = (key: string): boolean =>
    params.some((p) => p.key.toLowerCase() === key.toLowerCase());

  let newHeaders = headers;
  let newParams = params;

  if (authType === 'bearer') {
    const token = config.token ?? '';
    if (token && !headerExists('Authorization')) {
      newHeaders = [...headers, { key: 'Authorization', value: `Bearer ${token}`, enabled: true }];
    }
  } else if (authType === 'basic') {
    const username = config.username ?? '';
    const password = config.password ?? '';
    if ((username || password) && !headerExists('Authorization')) {
      const encoded = btoa(`${username}:${password}`);
      newHeaders = [...headers, { key: 'Authorization', value: `Basic ${encoded}`, enabled: true }];
    }
  } else if (authType === 'apikey') {
    const keyName = config.keyName ?? '';
    const keyValue = config.keyValue ?? '';
    const addTo = config.addTo ?? 'header';
    if (keyName && keyValue) {
      if (addTo === 'header' && !headerExists(keyName)) {
        newHeaders = [...headers, { key: keyName, value: keyValue, enabled: true }];
      } else if (addTo === 'query' && !paramExists(keyName)) {
        newParams = [...params, { key: keyName, value: keyValue, enabled: true }];
      }
    }
  }

  return {
    ...resolved,
    headers: JSON.stringify(newHeaders),
    params: JSON.stringify(newParams),
  };
}

/**
 * Generate a code snippet for the given language.
 * Actual generators will be added in subsequent stories; for now each
 * language returns a placeholder comment so the wiring can be tested end-to-end.
 */
function generateSnippet(resolved: ResolvedRequest, language: Language): string {
  switch (language) {
    case 'cURL':
      return generateCurl(resolved);
    case 'Python (requests)':
      return generatePythonRequests(resolved);
    case 'JS Fetch':
      return generateJsFetch(resolved);
    case 'JS Axios':
      return generateJsAxios(resolved);
    case 'TypeScript (fetch)':
      return generateTsFetch(resolved);
    case 'Go (net/http)':
      return generateGoNetHttp(resolved);
    case 'Java (HttpClient)':
      return generateJavaHttpClient(resolved);
    default:
      return `// ${language} generator coming soon`;
  }
}

/**
 * Reactive code-generation hook.
 *
 * Reads the active (and global) environment variables from the environments
 * store, interpolates the request, and synchronously generates a code snippet
 * for the selected language — all inside a `useMemo` so the result only
 * recomputes when inputs actually change.
 *
 * @param request  The current request, or `null` when none is selected.
 * @param language The target language for code generation.
 * @returns        The generated code snippet string.
 */
export function useCodeGen(request: Request | null, language: Language): string {
  const activeId = useEnvironmentsStore((s) => s.activeEnvironmentId);
  const globalId = useEnvironmentsStore((s) => s.globalEnvironmentId);
  const variables = useEnvironmentsStore((s) => s.variables);

  // Merge global + active vars; active env takes precedence.
  const envVars = useMemo<EnvironmentVariable[]>(() => {
    const globalVars = globalId ? (variables[globalId] ?? []) : [];
    const activeVars =
      activeId && activeId !== globalId ? (variables[activeId] ?? []) : [];
    // Build a map so active env overrides global
    const map = new Map<string, EnvironmentVariable>();
    for (const v of globalVars) map.set(v.key, v);
    for (const v of activeVars) map.set(v.key, v);
    return Array.from(map.values());
  }, [globalId, activeId, variables]);

  return useMemo<string>(() => {
    if (!request) return '';
    const resolved = interpolateRequest(request, envVars);
    const withAuth = mergeAuth(resolved);
    return generateSnippet(withAuth, language);
  }, [request, envVars, language]);
}
