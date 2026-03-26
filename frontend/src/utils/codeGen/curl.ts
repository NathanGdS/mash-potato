import { ResolvedRequest } from '../../hooks/useCodeGen';

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

function urlEncodeKV(key: string, value: string): string {
  return `${encodeURIComponent(key)}=${encodeURIComponent(value)}`;
}

/**
 * Generates a cURL command for the given resolved request.
 *
 * Line continuation uses backslash (\).
 * Unresolved {{vars}} are left as-is with no extra escaping.
 */
export function generateCurl(req: ResolvedRequest): string {
  const parts: string[] = [];

  // Build URL with query params
  const params = parseKVRows(req.params).filter((p) => p.enabled && p.key !== '');
  let url = req.url;
  if (params.length > 0) {
    const qs = params.map((p) => urlEncodeKV(p.key, p.value)).join('&');
    url = url.includes('?') ? `${url}&${qs}` : `${url}?${qs}`;
  }

  parts.push(`curl -X ${req.method} '${url}'`);

  // Headers
  const headers = parseKVRows(req.headers).filter((h) => h.enabled && h.key !== '');
  for (const h of headers) {
    parts.push(`  -H '${h.key}: ${h.value}'`);
  }

  // Body
  const bodyType = req.body_type;
  if (bodyType === 'json' && req.body) {
    parts.push(`  -d '${req.body}'`);
  } else if (bodyType === 'raw' && req.body) {
    parts.push(`  -d '${req.body}'`);
  } else if (bodyType === 'urlencoded') {
    const rows = parseKVRows(req.body).filter((r) => r.enabled && r.key !== '');
    for (const r of rows) {
      parts.push(`  --data-urlencode '${r.key}=${r.value}'`);
    }
  } else if (bodyType === 'form-data') {
    const rows = parseKVRows(req.body).filter((r) => r.enabled && r.key !== '');
    for (const r of rows) {
      parts.push(`  -F '${r.key}=${r.value}'`);
    }
  }

  return parts.join(' \\\n');
}
