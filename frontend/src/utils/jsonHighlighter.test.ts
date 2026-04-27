import { describe, it, expect } from 'vitest';
import { tokenizeJson } from './jsonHighlighter';

describe('tokenizeJson — var tokens inside JSON strings', () => {
  it('emits var token for standalone {{var}} outside any string', () => {
    const tokens = tokenizeJson('{{baseUrl}}');
    expect(tokens).toContainEqual({ type: 'var', value: '{{baseUrl}}' });
  });

  it('splits {{var}} out of a JSON string value', () => {
    const tokens = tokenizeJson('"{{baseUrl}}/api"');
    const varTokens = tokens.filter((t) => t.type === 'var');
    expect(varTokens).toHaveLength(1);
    expect(varTokens[0].value).toBe('{{baseUrl}}');
  });

  it('surrounding string parts retain string type when var is embedded', () => {
    const tokens = tokenizeJson('"https://{{host}}/path"');
    const types = tokens.map((t) => t.type);
    expect(types).toContain('var');
    expect(types).toContain('string');
    // No var should have string type
    const varPart = tokens.find((t) => t.value === '{{host}}');
    expect(varPart?.type).toBe('var');
    // The surrounding literal string parts should remain 'string' type
    const prefix = tokens.find((t) => t.value === '"https://');
    expect(prefix?.type).toBe('string');
  });

  it('handles multiple vars embedded in one string', () => {
    const tokens = tokenizeJson('"{{scheme}}://{{host}}:{{port}}"');
    const varTokens = tokens.filter((t) => t.type === 'var');
    expect(varTokens.map((t) => t.value)).toEqual(['{{scheme}}', '{{host}}', '{{port}}']);
  });

  it('var inside a JSON key also gets var type', () => {
    const tokens = tokenizeJson('{"{{key}}": "value"}');
    const varInKey = tokens.find((t) => t.value === '{{key}}');
    expect(varInKey?.type).toBe('var');
  });
});
