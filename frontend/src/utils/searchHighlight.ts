/**
 * Splits `text` into three parts around the first case-insensitive match
 * of `query`. Special regex characters in `query` are escaped so the
 * function is safe to call with arbitrary user input.
 *
 * Returns `null` when `query` is empty or produces no match.
 */
export interface MatchSegments {
  before: string;
  match: string;
  after: string;
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function splitOnMatch(text: string, query: string): MatchSegments | null {
  if (!query) return null;
  const re = new RegExp(escapeRegex(query), 'i');
  const result = re.exec(text);
  if (!result) return null;
  const start = result.index;
  const end = start + result[0].length;
  return {
    before: text.slice(0, start),
    match: text.slice(start, end),
    after: text.slice(end),
  };
}
