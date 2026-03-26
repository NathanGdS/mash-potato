import { ResolvedRequest } from '../../hooks/useCodeGen';
import { buildUrl, buildHeadersLines, buildBodyParts } from './jsFetch';

/**
 * Generates a TypeScript fetch snippet with explicit type annotations.
 * Wraps the call in `async function main(): Promise<void>`.
 */
export function generateTsFetch(req: ResolvedRequest): string {
  const url = buildUrl(req);
  const headerLines = buildHeadersLines(req);
  const { preLines, bodyExpr } = buildBodyParts(req);

  const lines: string[] = [];

  if (preLines.length > 0) {
    lines.push(...preLines, '');
  }

  lines.push('async function main(): Promise<void> {');
  lines.push(`  const response: Response = await fetch('${url}', {`);
  lines.push(`    method: '${req.method}',`);

  if (headerLines.length > 0) {
    lines.push('    headers: {');
    lines.push(...headerLines.map((l) => '  ' + l));
    lines.push('    } as HeadersInit,');
  }

  if (bodyExpr) {
    lines.push(`    body: ${bodyExpr},`);
  }

  lines.push('  });');
  lines.push('');
  lines.push('  const data: unknown = await response.json();');
  lines.push('  console.log(data);');
  lines.push('}');
  lines.push('');
  lines.push('main();');

  return lines.join('\n');
}
