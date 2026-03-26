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

/**
 * Builds the URL string with query params appended.
 * Exported so tsFetch can reuse it.
 */
export function buildUrl(req: ResolvedRequest): string {
  const params = parseKVRows(req.params).filter((p) => p.enabled && p.key !== '');
  let url = req.url;
  if (params.length > 0) {
    const qs = params
      .map((p) => `${encodeURIComponent(p.key)}=${encodeURIComponent(p.value)}`)
      .join('&');
    url = url.includes('?') ? `${url}&${qs}` : `${url}?${qs}`;
  }
  return url;
}

/**
 * Builds the headers object literal lines (indented).
 * Exported so tsFetch can reuse it.
 */
export function buildHeadersLines(req: ResolvedRequest): string[] {
  const headers = parseKVRows(req.headers).filter((h) => h.enabled && h.key !== '');
  return headers.map((h) => `    '${h.key}': '${h.value}',`);
}

/**
 * Builds the body-related lines that go before the fetch call, and
 * the body value expression to inline in the options object.
 * Returns { preLines, bodyExpr }.
 * Exported so tsFetch can reuse it.
 */
export function buildBodyParts(req: ResolvedRequest): { preLines: string[]; bodyExpr: string | null } {
  const { body_type, body } = req;

  if (body_type === 'json' && body) {
    return { preLines: [], bodyExpr: `JSON.stringify(${body})` };
  }

  if (body_type === 'raw' && body) {
    const escaped = body.replace(/\\/g, '\\\\').replace(/`/g, '\\`').replace(/\$\{/g, '\\${');
    return { preLines: [], bodyExpr: `\`${escaped}\`` };
  }

  if (body_type === 'urlencoded') {
    const rows = parseKVRows(body).filter((r) => r.enabled && r.key !== '');
    if (rows.length === 0) return { preLines: [], bodyExpr: null };
    const entries = rows
      .map((r) => `  '${r.key}': '${r.value}',`)
      .join('\n');
    const preLines = [
      `const params = new URLSearchParams({`,
      entries,
      `});`,
    ];
    return { preLines, bodyExpr: 'params' };
  }

  if (body_type === 'form-data') {
    const rows = parseKVRows(body).filter((r) => r.enabled && r.key !== '');
    const preLines = [
      `const formData = new FormData();`,
      ...rows.map((r) => `formData.append('${r.key}', '${r.value}');`),
    ];
    return { preLines, bodyExpr: rows.length > 0 ? 'formData' : null };
  }

  return { preLines: [], bodyExpr: null };
}

/**
 * Generates a plain JS fetch snippet (no type annotations).
 */
export function generateJsFetch(req: ResolvedRequest): string {
  const url = buildUrl(req);
  const headerLines = buildHeadersLines(req);
  const { preLines, bodyExpr } = buildBodyParts(req);

  const lines: string[] = [];

  if (preLines.length > 0) {
    lines.push(...preLines, '');
  }

  lines.push('async function main() {');
  lines.push(`  const response = await fetch('${url}', {`);
  lines.push(`    method: '${req.method}',`);

  if (headerLines.length > 0) {
    lines.push('    headers: {');
    lines.push(...headerLines.map((l) => '  ' + l));
    lines.push('    },');
  }

  if (bodyExpr) {
    lines.push(`    body: ${bodyExpr},`);
  }

  lines.push('  });');
  lines.push('');
  lines.push('  const data = await response.json();');
  lines.push('  console.log(data);');
  lines.push('}');
  lines.push('');
  lines.push('main();');

  return lines.join('\n');
}
