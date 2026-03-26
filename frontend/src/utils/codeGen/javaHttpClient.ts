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
 * Escapes a string value for use inside a Java double-quoted string literal.
 */
function javaString(s: string): string {
  return `"${s
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/\n/g, '\\n')
    .replace(/\r/g, '\\r')
    .replace(/\t/g, '\\t')}"`;
}

/**
 * Generates a complete, runnable Java snippet using java.net.http.HttpClient
 * (Java 11+) for the given resolved request.
 */
export function generateJavaHttpClient(req: ResolvedRequest): string {
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

  const method = req.method.toUpperCase();
  const noBodyMethods = ['GET', 'HEAD', 'DELETE', 'OPTIONS', 'TRACE'];
  const isNoBodyMethod = noBodyMethods.includes(method);

  // Determine which imports are needed
  const imports = new Set<string>([
    'java.net.URI',
    'java.net.http.HttpClient',
    'java.net.http.HttpRequest',
    'java.net.http.HttpResponse',
  ]);

  // Body setup code lines (inside main)
  const bodyLines: string[] = [];
  let bodyPublisherExpr = 'HttpRequest.BodyPublishers.noBody()';

  if (isNoBodyMethod) {
    // No body for these methods — bodyPublisherExpr stays noBody()
  } else if (bodyType === 'json' && req.body) {
    bodyLines.push(`String jsonBody = ${javaString(req.body)};`);
    bodyPublisherExpr = 'HttpRequest.BodyPublishers.ofString(jsonBody)';
  } else if (bodyType === 'raw' && req.body) {
    bodyLines.push(`String rawBody = ${javaString(req.body)};`);
    bodyPublisherExpr = 'HttpRequest.BodyPublishers.ofString(rawBody)';
  } else if (bodyType === 'urlencoded') {
    imports.add('java.net.URLEncoder');
    imports.add('java.nio.charset.StandardCharsets');
    const rows = parseKVRows(req.body).filter((r) => r.enabled && r.key !== '');
    if (rows.length > 0) {
      const encodedPairs = rows.map(
        (r) =>
          `URLEncoder.encode(${javaString(r.key)}, StandardCharsets.UTF_8) + "=" +` +
          ` URLEncoder.encode(${javaString(r.value)}, StandardCharsets.UTF_8)`
      );
      bodyLines.push(
        `String encodedBody = ${encodedPairs.join('\n            + "&" + ')};`
      );
    } else {
      bodyLines.push('String encodedBody = "";');
    }
    bodyPublisherExpr = 'HttpRequest.BodyPublishers.ofString(encodedBody)';
  } else if (bodyType === 'form-data') {
    imports.add('java.nio.charset.StandardCharsets');
    const rows = parseKVRows(req.body).filter((r) => r.enabled && r.key !== '');
    // HttpClient has no native multipart support — emit a manual boundary builder
    bodyLines.push('// NOTE: java.net.http.HttpClient has no built-in multipart support.');
    bodyLines.push('// The snippet below constructs a multipart/form-data body manually.');
    bodyLines.push('String boundary = "----JavaBoundary" + System.currentTimeMillis();');
    bodyLines.push('StringBuilder multipartBody = new StringBuilder();');
    for (const r of rows) {
      bodyLines.push(
        `multipartBody.append("--").append(boundary).append("\\r\\n");`
      );
      bodyLines.push(
        `multipartBody.append("Content-Disposition: form-data; name=\\"${r.key}\\"\\r\\n\\r\\n");`
      );
      bodyLines.push(`multipartBody.append(${javaString(r.value)}).append("\\r\\n");`);
    }
    bodyLines.push('multipartBody.append("--").append(boundary).append("--\\r\\n");');
    bodyPublisherExpr =
      'HttpRequest.BodyPublishers.ofString(multipartBody.toString(), StandardCharsets.UTF_8)';
  }

  // Determine .method() call
  let methodCall: string;
  if (method === 'GET' && (isNoBodyMethod || !req.body)) {
    methodCall = '.GET()';
  } else if (method === 'DELETE' && isNoBodyMethod) {
    methodCall = '.DELETE()';
  } else {
    methodCall = `.method(${javaString(method)}, ${bodyPublisherExpr})`;
  }

  // Auto Content-Type header when not already provided by the user
  const hasContentType = headers.some((h) => h.key.toLowerCase() === 'content-type');
  const extraHeaders: Array<[string, string]> = [];
  if (!hasContentType) {
    if (bodyType === 'json' && req.body) {
      extraHeaders.push(['Content-Type', 'application/json']);
    } else if (bodyType === 'urlencoded') {
      extraHeaders.push(['Content-Type', 'application/x-www-form-urlencoded']);
    } else if (bodyType === 'form-data') {
      // Content-Type for multipart needs the boundary — handled inline below
    }
  }

  // Build output lines
  const lines: string[] = [];

  // Imports
  const sortedImports = Array.from(imports).sort();
  for (const imp of sortedImports) {
    lines.push(`import ${imp};`);
  }
  lines.push('');
  lines.push('public class Main {');
  lines.push('    public static void main(String[] args) throws Exception {');
  lines.push('        HttpClient client = HttpClient.newHttpClient();');
  lines.push('');

  // Body setup
  for (const l of bodyLines) {
    lines.push(`        ${l}`);
  }
  if (bodyLines.length > 0) {
    lines.push('');
  }

  // Build request — open builder
  lines.push('        HttpRequest request = HttpRequest.newBuilder()');
  lines.push(`            .uri(URI.create(${javaString(url)}))`);

  // User-defined headers
  for (const h of headers) {
    lines.push(`            .header(${javaString(h.key)}, ${javaString(h.value)})`);
  }

  // Auto Content-Type (non-multipart)
  for (const [k, v] of extraHeaders) {
    lines.push(`            .header(${javaString(k)}, ${javaString(v)})`);
  }

  // Multipart Content-Type (needs boundary variable)
  if (bodyType === 'form-data' && !hasContentType) {
    lines.push('            .header("Content-Type", "multipart/form-data; boundary=" + boundary)');
  }

  // POST/PUT/PATCH with body publishers that weren't covered above
  if (method !== 'GET' && method !== 'DELETE') {
    if (bodyType === 'json' && req.body) {
      lines.push(`            .POST(HttpRequest.BodyPublishers.ofString(jsonBody))`);
    } else if (bodyType === 'raw' && req.body) {
      lines.push(`            .POST(HttpRequest.BodyPublishers.ofString(rawBody))`);
    } else if (bodyType === 'urlencoded') {
      lines.push(`            .POST(HttpRequest.BodyPublishers.ofString(encodedBody))`);
    } else if (bodyType === 'form-data') {
      lines.push(
        `            .POST(HttpRequest.BodyPublishers.ofString(multipartBody.toString(), StandardCharsets.UTF_8))`
      );
    } else {
      // No body for this method
      lines.push(`            ${methodCall}`);
    }
  } else {
    lines.push(`            ${methodCall}`);
  }

  lines.push('            .build();');
  lines.push('');

  // Send request and print response
  lines.push(
    '        HttpResponse<String> response = client.send(request, HttpResponse.BodyHandlers.ofString());'
  );
  lines.push('        System.out.println(response.statusCode());');
  lines.push('        System.out.println(response.body());');
  lines.push('    }');
  lines.push('}');

  return lines.join('\n');
}
