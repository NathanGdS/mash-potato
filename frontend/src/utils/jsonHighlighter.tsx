import React from 'react';

export function tryPrettyPrint(raw: string): { text: string; isJson: boolean } {
  try {
    const parsed = JSON.parse(raw);
    return { text: JSON.stringify(parsed, null, 2), isJson: true };
  } catch {
    return { text: raw, isJson: false };
  }
}

export type JsonTokenType = 'key' | 'string' | 'number' | 'boolean' | 'null' | 'structural' | 'var' | 'text';

export interface JsonToken {
  type: JsonTokenType;
  value: string;
}

export function tokenizeJson(json: string): JsonToken[] {
  // 1. {{var}} - higher priority
  // 2. Strings/Keys: /"(?:\\.|[^\\"])*"/
  // 3. Numbers: /-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?/
  // 4. Booleans: /\b(?:true|false)\b/
  // 5. Null: /\bnull\b/
  // 6. Structural: /[{}[\],:]/
  // 7. Whitespace: /\s+/
  // 8. Other: /./

  const regex = /(\{\{[^}]*\}\})|("(?:\\.|[^\\"])*")|(-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)|(\b(?:true|false)\b)|(\bnull\b)|([{}[\],:])|(\s+)|(.)/g;

  const tokens: JsonToken[] = [];
  let match;

  while ((match = regex.exec(json)) !== null) {
    if (match[1]) { // Var
      tokens.push({ type: 'var', value: match[1] });
    } else if (match[2]) { // String or Key
      // Check if it's a key (followed by :)
      const isKey = /^\s*:/.test(json.substring(regex.lastIndex));
      tokens.push({ type: isKey ? 'key' : 'string', value: match[2] });
    } else if (match[3]) {
      tokens.push({ type: 'number', value: match[3] });
    } else if (match[4]) {
      tokens.push({ type: 'boolean', value: match[4] });
    } else if (match[5]) {
      tokens.push({ type: 'null', value: match[5] });
    } else if (match[6]) {
      tokens.push({ type: 'structural', value: match[6] });
    } else if (match[7]) { // Whitespace
      tokens.push({ type: 'text', value: match[7] });
    } else if (match[8]) { // Other
      tokens.push({ type: 'text', value: match[8] });
    }
  }

  return tokens;
}

export const JsonHighlighted: React.FC<{ text: string }> = ({ text }) => {
  const tokens = tokenizeJson(text);
  return (
    <>
      {tokens.map((token, i) => {
        if (token.type === 'text') {
          return <span key={i}>{token.value}</span>;
        }
        const className = token.type === 'var' ? 'var-token' : `json-${token.type}`;
        return <span key={i} className={className}>{token.value}</span>;
      })}
    </>
  );
};
