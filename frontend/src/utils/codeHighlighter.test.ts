import { describe, it, expect } from 'vitest';
import { tokenizeCode } from './codeHighlighter';

describe('tokenizeCode – JavaScript language', () => {
  it('classifies control-flow keywords correctly', () => {
    const tokens = tokenizeCode('const x = 1;', 'JavaScript');
    const constToken = tokens.find((t) => t.value === 'const');
    expect(constToken?.type).toBe('keyword');
  });

  it('classifies scripting-API globals as keywords', () => {
    for (const global of ['mp', 'console', 'JSON', 'Promise', 'Math', 'Object', 'Array']) {
      const tokens = tokenizeCode(global, 'JavaScript');
      expect(tokens[0].type).toBe('keyword');
    }
  });

  it('tokenizes "const x = 1; // hello" with correct token types', () => {
    const code = 'const x = 1; // hello';
    const tokens = tokenizeCode(code, 'JavaScript');

    // keyword: const
    expect(tokens.find((t) => t.value === 'const')?.type).toBe('keyword');
    // text: x
    expect(tokens.find((t) => t.value === 'x')?.type).toBe('text');
    // number: 1
    expect(tokens.find((t) => t.value === '1')?.type).toBe('number');
    // comment: // hello
    const comment = tokens.find((t) => t.value.startsWith('//'));
    expect(comment?.type).toBe('comment');
  });

  it('classifies async/await/yield as keywords', () => {
    for (const kw of ['async', 'await', 'yield']) {
      const [token] = tokenizeCode(kw, 'JavaScript');
      expect(token.type).toBe('keyword');
    }
  });

  it('does not affect JS Fetch keyword set', () => {
    // "mp" is a JavaScript-only keyword; should be text in JS Fetch
    const [token] = tokenizeCode('mp', 'JS Fetch');
    expect(token.type).toBe('text');
  });

  it('does not affect JS Axios keyword set', () => {
    const [token] = tokenizeCode('mp', 'JS Axios');
    expect(token.type).toBe('text');
  });

  it('does not affect Python keyword set', () => {
    const tokens = tokenizeCode('None', 'Python (requests)');
    expect(tokens[0].type).toBe('keyword');
    // 'null' is a JS keyword, not Python
    const [nullToken] = tokenizeCode('null', 'Python (requests)');
    expect(nullToken.type).toBe('text');
  });

  it('unknown identifiers in JavaScript are text', () => {
    const [token] = tokenizeCode('myVar', 'JavaScript');
    expect(token.type).toBe('text');
  });

  // ── US-5 focused token tests ──────────────────────────────

  it('single standalone keyword produces a single keyword token', () => {
    const [token] = tokenizeCode('const', 'JavaScript');
    expect(token.type).toBe('keyword');
    expect(token.value).toBe('const');
  });

  it('single-quoted string produces a token of type string', () => {
    const tokens = tokenizeCode("'hello'", 'JavaScript');
    const strToken = tokens.find((t) => t.value === "'hello'");
    expect(strToken?.type).toBe('string');
  });

  it('double-quoted string produces a token of type string', () => {
    const tokens = tokenizeCode('"world"', 'JavaScript');
    const strToken = tokens.find((t) => t.value === '"world"');
    expect(strToken?.type).toBe('string');
  });

  it('template literal produces a token of type string', () => {
    const tokens = tokenizeCode('`foo`', 'JavaScript');
    const strToken = tokens.find((t) => t.value === '`foo`');
    expect(strToken?.type).toBe('string');
  });

  it('numeric literal produces a token of type number', () => {
    const [token] = tokenizeCode('42', 'JavaScript');
    expect(token.type).toBe('number');
    expect(token.value).toBe('42');
  });

  it('line comment produces a token of type comment', () => {
    const [token] = tokenizeCode('// note', 'JavaScript');
    expect(token.type).toBe('comment');
    expect(token.value).toBe('// note');
  });

  it('block comment produces a token of type comment', () => {
    const [token] = tokenizeCode('/* note */', 'JavaScript');
    expect(token.type).toBe('comment');
    expect(token.value).toBe('/* note */');
  });

  it('non-keyword identifier produces a token of type text and not keyword', () => {
    const [token] = tokenizeCode('myCustomVar', 'JavaScript');
    expect(token.type).toBe('text');
    expect(token.type).not.toBe('keyword');
  });
});
