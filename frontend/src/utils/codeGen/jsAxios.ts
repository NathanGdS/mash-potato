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

function indent(lines: string[], spaces = 2): string {
  const pad = ' '.repeat(spaces);
  return lines.map((l) => (l === '' ? '' : `${pad}${l}`)).join('\n');
}

function buildDataExpr(req: ResolvedRequest): string | null {
  const bodyType = req.body_type;

  if (bodyType === 'json' && req.body) {
    try {
      const parsed = JSON.parse(req.body);
      return JSON.stringify(parsed, null, 2);
    } catch {
      return `'${req.body.replace(/'/g, "\\'")}'`;
    }
  }

  if (bodyType === 'raw' && req.body) {
    return `'${req.body.replace(/'/g, "\\'")}'`;
  }

  if (bodyType === 'urlencoded') {
    const rows = parseKVRows(req.body).filter((r) => r.enabled && r.key !== '');
    if (rows.length === 0) return null;
    const entries = rows.map((r) => `  '${r.key}': '${r.value}'`).join(',\n');
    return `new URLSearchParams({\n${entries}\n})`;
  }

  if (bodyType === 'form-data') {
    const rows = parseKVRows(req.body).filter((r) => r.enabled && r.key !== '');
    // Form-data preamble and appends are emitted as setup lines, not inline.
    // Return a sentinel so the caller knows to use the `formData` variable.
    if (rows.length === 0) return null;
    return '__FORM_DATA__';
  }

  return null;
}

/**
 * Generates a JS Axios snippet for the given resolved request.
 *
 * Structure:
 *   async function main() {
 *     const response = await axios({ method, url, params, headers, data });
 *     console.log(response.data);
 *   }
 *   main();
 */
export function generateJsAxios(req: ResolvedRequest): string {
  const lines: string[] = [];

  // --- form-data preamble (Node.js) ---
  const isFormData = req.body_type === 'form-data';
  const formDataRows = isFormData
    ? parseKVRows(req.body).filter((r) => r.enabled && r.key !== '')
    : [];

  if (isFormData && formDataRows.length > 0) {
    lines.push(
      `const FormData = require('form-data'); // npm install form-data`
    );
  }
  lines.push(`const axios = require('axios');`);
  lines.push('');

  // --- form-data variable setup ---
  if (isFormData && formDataRows.length > 0) {
    lines.push('const formData = new FormData();');
    for (const r of formDataRows) {
      lines.push(`formData.append('${r.key}', '${r.value}');`);
    }
    lines.push('');
  }

  lines.push('async function main() {');

  // Build axios config object fields
  const configLines: string[] = [];

  configLines.push(`method: '${req.method.toLowerCase()}',`);
  configLines.push(`url: '${req.url}',`);

  // Query params
  const params = parseKVRows(req.params).filter((p) => p.enabled && p.key !== '');
  if (params.length > 0) {
    const paramEntries = params.map((p) => `  '${p.key}': '${p.value}'`).join(',\n');
    configLines.push(`params: {\n${paramEntries}\n},`);
  }

  // Headers
  const headers = parseKVRows(req.headers).filter((h) => h.enabled && h.key !== '');
  if (headers.length > 0) {
    const headerEntries = headers.map((h) => `  '${h.key}': '${h.value}'`).join(',\n');
    configLines.push(`headers: {\n${headerEntries}\n},`);
  }

  // Data / body
  const dataExpr = buildDataExpr(req);
  if (dataExpr !== null) {
    if (dataExpr === '__FORM_DATA__') {
      configLines.push(`data: formData,`);
    } else {
      // Multi-line data expressions need correct indentation inside the config object
      const dataIndented = dataExpr
        .split('\n')
        .map((l, i) => (i === 0 ? l : `  ${l}`))
        .join('\n');
      configLines.push(`data: ${dataIndented},`);
    }
  }

  // Indent config lines inside axios({...})
  const configBlock = indent(configLines, 4);
  lines.push(`  const response = await axios({`);
  lines.push(configBlock);
  lines.push(`  });`);
  lines.push(`  console.log(response.data);`);
  lines.push(`}`);
  lines.push('');
  lines.push(`main();`);

  return lines.join('\n');
}
