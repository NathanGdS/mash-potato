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
 * Escapes a Go raw string literal value by replacing backtick with
 * a concatenation workaround, since Go raw strings cannot contain backticks.
 */
function goRawString(s: string): string {
  // If the string contains a backtick, fall back to a double-quoted string.
  if (s.includes('`')) {
    return `"${s.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n').replace(/\r/g, '\\r').replace(/\t/g, '\\t')}"`;
  }
  return '`' + s + '`';
}

/**
 * Escapes a value for use inside a Go double-quoted string.
 */
function goString(s: string): string {
  return `"${s.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n').replace(/\r/g, '\\r').replace(/\t/g, '\\t')}"`;
}

/**
 * Generates a complete, runnable main.go using net/http for the given request.
 */
export function generateGoNetHttp(req: ResolvedRequest): string {
  const bodyType = req.body_type;
  const headers = parseKVRows(req.headers).filter((h) => h.enabled && h.key !== '');
  const params = parseKVRows(req.params).filter((p) => p.enabled && p.key !== '');

  // Build URL with query params
  let url = req.url;
  if (params.length > 0) {
    const qs = params
      .map((p) => `${encodeURIComponent(p.key)}=${encodeURIComponent(p.value)}`)
      .join('&');
    url = url.includes('?') ? `${url}&${qs}` : `${url}?${qs}`;
  }

  // Determine imports needed
  const imports = new Set<string>(['fmt', 'io', 'log', 'net/http']);

  // Body setup code lines
  const bodyLines: string[] = [];
  let bodyReaderExpr = 'nil';

  if (bodyType === 'json' && req.body) {
    imports.add('bytes');
    bodyLines.push(`body := bytes.NewBufferString(${goRawString(req.body)})`);
    bodyReaderExpr = 'body';
  } else if (bodyType === 'raw' && req.body) {
    imports.add('strings');
    bodyLines.push(`body := strings.NewReader(${goRawString(req.body)})`);
    bodyReaderExpr = 'body';
  } else if (bodyType === 'urlencoded') {
    imports.add('net/url');
    imports.add('strings');
    const rows = parseKVRows(req.body).filter((r) => r.enabled && r.key !== '');
    bodyLines.push('formData := url.Values{}');
    for (const r of rows) {
      bodyLines.push(`formData.Set(${goString(r.key)}, ${goString(r.value)})`);
    }
    bodyLines.push('body := strings.NewReader(formData.Encode())');
    bodyReaderExpr = 'body';
  } else if (bodyType === 'form-data') {
    imports.add('bytes');
    imports.add('mime/multipart');
    const rows = parseKVRows(req.body).filter((r) => r.enabled && r.key !== '');
    bodyLines.push('var buf bytes.Buffer');
    bodyLines.push('w := multipart.NewWriter(&buf)');
    for (const r of rows) {
      bodyLines.push(
        `if err := w.WriteField(${goString(r.key)}, ${goString(r.value)}); err != nil { log.Fatal(err) }`
      );
    }
    bodyLines.push('w.Close()');
    bodyReaderExpr = '&buf';
  }

  // Build import block
  const sortedImports = Array.from(imports).sort();
  const importBlock =
    sortedImports.length === 1
      ? `import ${goString(sortedImports[0])}`
      : `import (\n${sortedImports.map((i) => `\t${goString(i)}`).join('\n')}\n)`;

  const lines: string[] = [];
  lines.push('package main');
  lines.push('');
  lines.push(importBlock);
  lines.push('');
  lines.push('func main() {');

  // Body setup
  for (const l of bodyLines) {
    lines.push(`\t${l}`);
  }
  if (bodyLines.length > 0) {
    lines.push('');
  }

  // Create request
  lines.push(`\treq, err := http.NewRequest(${goString(req.method)}, ${goString(url)}, ${bodyReaderExpr})`);
  lines.push('\tif err != nil { log.Fatal(err) }');
  lines.push('');

  // Set Content-Type for body types that require it (unless already in headers)
  const hasContentTypeHeader = headers.some((h) => h.key.toLowerCase() === 'content-type');
  if (!hasContentTypeHeader) {
    if (bodyType === 'json' && req.body) {
      lines.push('\treq.Header.Set("Content-Type", "application/json")');
    } else if (bodyType === 'urlencoded') {
      lines.push('\treq.Header.Set("Content-Type", "application/x-www-form-urlencoded")');
    } else if (bodyType === 'form-data') {
      lines.push('\treq.Header.Set("Content-Type", w.FormDataContentType())');
    }
    if (['json', 'urlencoded', 'form-data'].includes(bodyType) && req.body !== '') {
      lines.push('');
    }
  }

  // Set headers
  for (const h of headers) {
    lines.push(`\treq.Header.Set(${goString(h.key)}, ${goString(h.value)})`);
  }
  if (headers.length > 0) {
    lines.push('');
  }

  // Execute request
  lines.push('\tresp, err := http.DefaultClient.Do(req)');
  lines.push('\tif err != nil { log.Fatal(err) }');
  lines.push('\tdefer resp.Body.Close()');
  lines.push('');

  // Read and print body
  lines.push('\tresBody, err := io.ReadAll(resp.Body)');
  lines.push('\tif err != nil { log.Fatal(err) }');
  lines.push('');
  lines.push('\tfmt.Println(resp.Status)');
  lines.push('\tfmt.Println(string(resBody))');
  lines.push('}');

  return lines.join('\n');
}
