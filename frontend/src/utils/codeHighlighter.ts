import { Language } from './codeGen/index';

// ── Token types ────────────────────────────────────────────
export type CodeTokenType =
  | 'comment'
  | 'string'
  | 'number'
  | 'keyword'
  | 'punctuation'
  | 'text';

export interface CodeToken {
  type: CodeTokenType;
  value: string;
}

// ── Keyword sets per language ──────────────────────────────
const KEYWORDS: Record<Language, ReadonlyArray<string>> = {
  'cURL': [],
  'Python (requests)': [
    'import', 'from', 'as', 'def', 'class', 'return', 'if', 'else', 'elif',
    'for', 'while', 'in', 'not', 'and', 'or', 'is', 'None', 'True', 'False',
    'try', 'except', 'finally', 'with', 'pass', 'raise', 'lambda', 'yield',
    'del', 'global', 'nonlocal', 'assert', 'break', 'continue',
  ],
  'JS Fetch': [
    'const', 'let', 'var', 'function', 'return', 'if', 'else', 'for', 'while',
    'class', 'new', 'this', 'import', 'export', 'default', 'from', 'await',
    'async', 'try', 'catch', 'finally', 'throw', 'typeof', 'instanceof', 'of',
    'in', 'true', 'false', 'null', 'undefined', 'switch', 'case', 'break',
  ],
  'JS Axios': [
    'const', 'let', 'var', 'function', 'return', 'if', 'else', 'for', 'while',
    'class', 'new', 'this', 'import', 'export', 'default', 'from', 'await',
    'async', 'try', 'catch', 'finally', 'throw', 'typeof', 'instanceof', 'of',
    'in', 'true', 'false', 'null', 'undefined', 'switch', 'case', 'break',
  ],
  'TypeScript (fetch)': [
    'const', 'let', 'var', 'function', 'return', 'if', 'else', 'for', 'while',
    'class', 'new', 'this', 'import', 'export', 'default', 'from', 'await',
    'async', 'try', 'catch', 'finally', 'throw', 'typeof', 'instanceof', 'of',
    'in', 'true', 'false', 'null', 'undefined', 'switch', 'case', 'break',
    'interface', 'type', 'enum', 'readonly', 'public', 'private', 'protected',
    'abstract', 'implements', 'extends', 'declare', 'as', 'keyof', 'never',
    'void', 'any', 'string', 'number', 'boolean', 'object',
  ],
  'Go (net/http)': [
    'package', 'import', 'func', 'var', 'const', 'type', 'struct', 'interface',
    'return', 'if', 'else', 'for', 'range', 'switch', 'case', 'default',
    'break', 'continue', 'goto', 'defer', 'go', 'chan', 'map', 'make', 'new',
    'nil', 'true', 'false', 'iota', 'string', 'int', 'int64', 'float64',
    'bool', 'byte', 'error', 'any',
  ],
  'Java (HttpClient)': [
    'import', 'package', 'public', 'private', 'protected', 'class', 'interface',
    'extends', 'implements', 'new', 'return', 'if', 'else', 'for', 'while',
    'do', 'switch', 'case', 'default', 'break', 'continue', 'throw', 'throws',
    'try', 'catch', 'finally', 'static', 'final', 'abstract', 'void', 'null',
    'true', 'false', 'this', 'super', 'instanceof', 'boolean', 'int', 'long',
    'double', 'float', 'char', 'byte', 'short', 'var', 'String',
  ],
  'JavaScript': [
    // Control flow & declarations
    'const', 'let', 'var', 'function', 'return', 'if', 'else', 'for', 'while',
    'do', 'switch', 'case', 'break', 'continue', 'new', 'typeof', 'instanceof',
    'in', 'of', 'try', 'catch', 'finally', 'throw', 'class', 'extends',
    'import', 'export', 'default', 'null', 'undefined', 'true', 'false',
    'this', 'super', 'async', 'await', 'yield',
    // Scripting-API globals
    'mp', 'console', 'JSON', 'Promise', 'Math', 'Object', 'Array',
  ],
};

// ── Tokenizer ──────────────────────────────────────────────
/**
 * Tokenize source code into typed tokens.
 * Priority order (highest first):
 *   1. Multi-line comments  /* ... *\/
 *   2. Single-line comments // ... or # ...
 *   3. Template literals    `...`
 *   4. Double-quoted strings "..."
 *   5. Single-quoted strings '...'
 *   6. Numeric literals
 *   7. Identifiers (resolved to keyword or text)
 *   8. Punctuation / operators
 *   9. Whitespace / other (text)
 */
export function tokenizeCode(code: string, language: Language): CodeToken[] {
  const kwSet = new Set(KEYWORDS[language]);

  const regex = new RegExp(
    [
      // 1. Multi-line comment
      /(?:\/\*[\s\S]*?\*\/)/.source,
      // 2. Single-line comment (// or #)
      /(?:\/\/[^\n]*|#[^\n]*)/.source,
      // 3. Template literal (backtick)
      /(?:`(?:\\[\s\S]|[^`\\])*`)/.source,
      // 4. Double-quoted string
      /(?:"(?:\\[\s\S]|[^"\\])*")/.source,
      // 5. Single-quoted string
      /(?:'(?:\\[\s\S]|[^'\\])*')/.source,
      // 6. Numeric literal (hex, float, int)
      /(?:0x[\da-fA-F]+|\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)/.source,
      // 7. Identifier
      /(?:[A-Za-z_$][\w$]*)/.source,
      // 8. Punctuation / operators (single char)
      /(?:[{}[\]().,;:=+\-*/%&|^~<>!?@\\])/.source,
      // 9. Whitespace / other
      /(?:[\s\S])/.source,
    ].join('|'),
    'g',
  );

  const tokens: CodeToken[] = [];
  let match: RegExpExecArray | null;

  while ((match = regex.exec(code)) !== null) {
    const raw = match[0];

    if (raw.startsWith('/*') || raw.startsWith('//') || raw.startsWith('#')) {
      tokens.push({ type: 'comment', value: raw });
    } else if (raw.startsWith('`') || raw.startsWith('"') || raw.startsWith("'")) {
      tokens.push({ type: 'string', value: raw });
    } else if (/^(?:0x[\da-fA-F]+|\d)/.test(raw)) {
      tokens.push({ type: 'number', value: raw });
    } else if (/^[A-Za-z_$]/.test(raw)) {
      tokens.push({ type: kwSet.has(raw) ? 'keyword' : 'text', value: raw });
    } else if (/^[{}[\]().,;:=+\-*/%&|^~<>!?@\\]/.test(raw)) {
      tokens.push({ type: 'punctuation', value: raw });
    } else {
      tokens.push({ type: 'text', value: raw });
    }
  }

  return tokens;
}

// ── HTML escaping helper ───────────────────────────────────
function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

// ── highlightCode ──────────────────────────────────────────
/**
 * Returns an HTML string where each token is wrapped in a
 * `<span class="code-<type>">` element. Plain text tokens use
 * no class to avoid unnecessary DOM nodes.
 */
export function highlightCode(code: string, language: Language): string {
  const tokens = tokenizeCode(code, language);
  return tokens
    .map((token) => {
      const escaped = escapeHtml(token.value);
      if (token.type === 'text') return escaped;
      return `<span class="code-${token.type}">${escaped}</span>`;
    })
    .join('');
}
