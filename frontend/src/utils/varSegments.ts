/** A piece of text, either a plain string or a {{variable}} token. */
export interface VarSegment {
  text: string;
  isVar: boolean;
}

/**
 * Splits a string into plain-text and `{{variable}}` segments.
 * e.g. "{{base}}/users/{{id}}" →
 *   [{ text: "{{base}}", isVar: true }, { text: "/users/", isVar: false }, ...]
 * Only fully-closed tokens (both `{{` and `}}`) are highlighted.
 */
export function parseVarSegments(value: string): VarSegment[] {
  const segs: VarSegment[] = [];
  const re = /\{\{[^}]*\}\}/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(value)) !== null) {
    if (m.index > last) segs.push({ text: value.slice(last, m.index), isVar: false });
    segs.push({ text: m[0], isVar: true });
    last = m.index + m[0].length;
  }
  if (last < value.length) segs.push({ text: value.slice(last), isVar: false });
  return segs;
}
