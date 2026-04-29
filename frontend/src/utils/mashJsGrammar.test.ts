import { describe, it, expect, beforeAll } from 'vitest';
import Prism from 'prismjs';
import './mashJsGrammar';

describe('mash-js Prism grammar', () => {
  beforeAll(() => {
    expect(Prism.languages['mash-js']).toBeDefined();
  });

  it('registers mash-js grammar at module load', () => {
    expect(Prism.languages['mash-js']).toBeDefined();
    expect(typeof Prism.languages['mash-js']).toBe('object');
  });

  it('tokenizes doRequest as builtin', () => {
    const tokens = Prism.tokenize('doRequest', Prism.languages['mash-js']);
    const builtin = tokens.find((t) => typeof t !== 'string' && t.type === 'builtin');
    expect(builtin).toBeDefined();
    expect((builtin as any).content).toBe('doRequest');
  });

  it('tokenizes stopRunner as builtin', () => {
    const tokens = Prism.tokenize('stopRunner', Prism.languages['mash-js']);
    const builtin = tokens.find((t) => typeof t !== 'string' && t.type === 'builtin');
    expect(builtin).toBeDefined();
    expect((builtin as any).content).toBe('stopRunner');
  });

  it('tokenizes mp as builtin', () => {
    const tokens = Prism.tokenize('mp', Prism.languages['mash-js']);
    const builtin = tokens.find((t) => typeof t !== 'string' && t.type === 'builtin');
    expect(builtin).toBeDefined();
    expect((builtin as any).content).toBe('mp');
  });

  it('xmp is NOT tokenized as builtin', () => {
    const tokens = Prism.tokenize('xmp', Prism.languages['mash-js']);
    const builtin = tokens.find((t) => typeof t !== 'string' && t.type === 'builtin');
    expect(builtin).toBeUndefined();
  });

  it('tempo is NOT tokenized as builtin', () => {
    const tokens = Prism.tokenize('tempo', Prism.languages['mash-js']);
    const builtin = tokens.find((t) => typeof t !== 'string' && t.type === 'builtin');
    expect(builtin).toBeUndefined();
  });

  it('compress is NOT tokenized as builtin', () => {
    const tokens = Prism.tokenize('compress', Prism.languages['mash-js']);
    const builtin = tokens.find((t) => typeof t !== 'string' && t.type === 'builtin');
    expect(builtin).toBeUndefined();
  });

  it('const remains keyword not builtin', () => {
    const tokens = Prism.tokenize('const', Prism.languages['mash-js']);
    const keyword = tokens.find((t) => typeof t !== 'string' && t.type === 'keyword');
    const builtin = tokens.find((t) => typeof t !== 'string' && t.type === 'builtin');
    expect(keyword).toBeDefined();
    expect(builtin).toBeUndefined();
  });

  it('builtin pattern is inserted before keyword in grammar', () => {
    const grammar = Prism.languages['mash-js'] as Record<string, unknown>;
    const keys = Object.keys(grammar);
    const builtinIndex = keys.indexOf('builtin');
    const keywordIndex = keys.indexOf('keyword');
    expect(builtinIndex).toBeGreaterThanOrEqual(0);
    expect(keywordIndex).toBeGreaterThanOrEqual(0);
    expect(builtinIndex).toBeLessThan(keywordIndex);
  });

  it('doRequest inside string is not tokenized as builtin', () => {
    const tokens = Prism.tokenize('"doRequest"', Prism.languages['mash-js']);
    const builtin = tokens.find((t) => typeof t !== 'string' && t.type === 'builtin');
    expect(builtin).toBeUndefined();
  });

  it('doRequest inside comment is not tokenized as builtin', () => {
    const tokens = Prism.tokenize('// doRequest', Prism.languages['mash-js']);
    const builtin = tokens.find((t) => typeof t !== 'string' && t.type === 'builtin');
    expect(builtin).toBeUndefined();
  });

  it('mp inside tempo is not tokenized as builtin', () => {
    const tokens = Prism.tokenize('tempo', Prism.languages['mash-js']);
    const builtin = tokens.find((t) => typeof t !== 'string' && t.type === 'builtin');
    expect(builtin).toBeUndefined();
  });

  it('doRequest inside xmp is not tokenized as builtin', () => {
    const tokens = Prism.tokenize('xmp', Prism.languages['mash-js']);
    const builtin = tokens.find((t) => typeof t !== 'string' && t.type === 'builtin');
    expect(builtin).toBeUndefined();
  });

  it('regex literal is tokenized with regex type tokens', () => {
    const tokens = Prism.tokenize('/^\\d+$/g', Prism.languages['mash-js']);
    const hasRegexToken = tokens.some((t) => typeof t !== 'string' && t.type === 'regex');
    expect(hasRegexToken).toBe(true);
  });

  it('template literal is tokenized as template-string type', () => {
    const tokens = Prism.tokenize('`hello ${name}`', Prism.languages['mash-js']);
    const templateStr = tokens.find((t) => typeof t !== 'string' && t.type === 'template-string');
    expect(templateStr).toBeDefined();
  });

  it('nested template literals tokenize without error', () => {
    const tokens = Prism.tokenize('`outer ${fn(`inner`)}`', Prism.languages['mash-js']);
    const templateStr = tokens.find((t) => typeof t !== 'string' && t.type === 'template-string');
    expect(templateStr).toBeDefined();
  });

  it('division operator is not tokenized as regex', () => {
    const tokens = Prism.tokenize('a / b', Prism.languages['mash-js']);
    const regex = tokens.find((t) => typeof t !== 'string' && t.type === 'regex');
    expect(regex).toBeUndefined();
  });

  it('builtin and regex coexist in same code', () => {
    const tokens = Prism.tokenize('doRequest(`/api/${id}`, /\\d+/)', Prism.languages['mash-js']);
    const builtin = tokens.find((t) => typeof t !== 'string' && t.type === 'builtin');
    const regex = tokens.find((t) => typeof t !== 'string' && t.type === 'regex');
    expect(builtin).toBeDefined();
    expect(regex).toBeDefined();
  });
});
