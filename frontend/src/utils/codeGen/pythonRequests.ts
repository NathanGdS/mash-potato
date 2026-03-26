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

function kvRowsToDict(rows: KVRow[]): string {
  if (rows.length === 0) return '{}';
  const entries = rows.map((r) => `    '${r.key}': '${r.value}'`);
  return `{\n${entries.join(',\n')}\n}`;
}

/**
 * Generates a Python `requests` snippet for the given resolved request.
 *
 * - Query params → params=<dict>
 * - Headers      → headers=<dict>
 * - Body per body_type:
 *     json        → json=<parsed dict> (falls back to data='<text>' if parse fails)
 *     urlencoded  → data=<dict>
 *     form-data   → files=<dict>
 *     raw         → data='<text>'
 * - Ends with print(response.json()) for json body type, else print(response.text)
 */
export function generatePythonRequests(req: ResolvedRequest): string {
  const lines: string[] = [];

  lines.push('import requests');
  lines.push('');

  // Query params dict
  const params = parseKVRows(req.params).filter((p) => p.enabled && p.key !== '');
  if (params.length > 0) {
    lines.push(`params = ${kvRowsToDict(params)}`);
    lines.push('');
  }

  // Headers dict
  const headers = parseKVRows(req.headers).filter((h) => h.enabled && h.key !== '');
  if (headers.length > 0) {
    lines.push(`headers = ${kvRowsToDict(headers)}`);
    lines.push('');
  }

  // Body
  const bodyType = req.body_type;
  let bodyKwarg = '';
  let isJson = false;

  if (bodyType === 'json' && req.body) {
    try {
      const parsed = JSON.parse(req.body);
      lines.push(`json_body = ${JSON.stringify(parsed, null, 4)}`);
      lines.push('');
      bodyKwarg = 'json=json_body';
      isJson = true;
    } catch {
      const escaped = req.body.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
      lines.push(`data = '${escaped}'`);
      lines.push('');
      bodyKwarg = 'data=data';
    }
  } else if (bodyType === 'urlencoded') {
    const rows = parseKVRows(req.body).filter((r) => r.enabled && r.key !== '');
    if (rows.length > 0) {
      lines.push(`data = ${kvRowsToDict(rows)}`);
      lines.push('');
      bodyKwarg = 'data=data';
    }
  } else if (bodyType === 'form-data') {
    const rows = parseKVRows(req.body).filter((r) => r.enabled && r.key !== '');
    if (rows.length > 0) {
      lines.push(`files = ${kvRowsToDict(rows)}`);
      lines.push('');
      bodyKwarg = 'files=files';
    }
  } else if (bodyType === 'raw' && req.body) {
    const escaped = req.body.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
    lines.push(`data = '${escaped}'`);
    lines.push('');
    bodyKwarg = 'data=data';
  }

  // Build requests.<method>() call
  const method = req.method.toLowerCase();
  const kwargs: string[] = [`'${req.url}'`];
  if (params.length > 0) kwargs.push('params=params');
  if (headers.length > 0) kwargs.push('headers=headers');
  if (bodyKwarg) kwargs.push(bodyKwarg);

  if (kwargs.length <= 2) {
    // Fits on one line: url + at most one extra kwarg
    lines.push(`response = requests.${method}(${kwargs.join(', ')})`);
  } else {
    lines.push(`response = requests.${method}(`);
    for (let i = 0; i < kwargs.length; i++) {
      const comma = i < kwargs.length - 1 ? ',' : '';
      lines.push(`    ${kwargs[i]}${comma}`);
    }
    lines.push(')');
  }

  lines.push('');
  if (isJson) {
    lines.push('print(response.json())');
  } else {
    lines.push('print(response.text)');
  }

  return lines.join('\n');
}
