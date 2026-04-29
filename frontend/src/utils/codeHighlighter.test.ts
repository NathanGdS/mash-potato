import { describe, it, expect } from 'vitest';
import { highlightCode } from './codeHighlighter';

describe('highlightCode – JavaScript (mash-js grammar)', () => {
  it('doRequest produces token builtin span', () => {
    const html = highlightCode('doRequest', 'JavaScript');
    expect(html).toContain('class="token builtin"');
    expect(html).toContain('doRequest');
  });

  it('stopRunner produces token builtin span', () => {
    const html = highlightCode('stopRunner', 'JavaScript');
    expect(html).toContain('class="token builtin"');
    expect(html).toContain('stopRunner');
  });

  it('mp standalone produces token builtin span', () => {
    const html = highlightCode('mp', 'JavaScript');
    expect(html).toContain('class="token builtin"');
    expect(html).toContain('mp');
  });

  it('xmp, tempo, compress do NOT produce builtin spans', () => {
    for (const ident of ['xmp', 'tempo', 'compress']) {
      const html = highlightCode(ident, 'JavaScript');
      expect(html).not.toContain('class="token builtin"');
    }
  });

  it('console is not a keyword (plain identifier in Prism)', () => {
    const html = highlightCode('console', 'JavaScript');
    expect(html).not.toContain('class="token keyword"');
  });

  it('const produces token keyword span', () => {
    const html = highlightCode('const', 'JavaScript');
    expect(html).toContain('class="token keyword"');
    expect(html).toContain('const');
  });

  it('"hello" produces token string span', () => {
    const html = highlightCode('"hello"', 'JavaScript');
    expect(html).toContain('class="token string"');
  });

  it('42 produces token number span', () => {
    const html = highlightCode('42', 'JavaScript');
    expect(html).toContain('class="token number"');
  });

  it('// comment produces token comment span', () => {
    const html = highlightCode('// comment', 'JavaScript');
    expect(html).toContain('class="token comment"');
    expect(html).toContain('comment');
  });

  it('template literal interpolation is not inside token string span', () => {
    const html = highlightCode('`Bearer ${token}`', 'JavaScript');
    const stringTokenMatch = html.match(/<span class="token string">([\s\S]*?)<\/span>/g);
    if (stringTokenMatch) {
      for (const match of stringTokenMatch) {
        expect(match).not.toContain('${token}');
      }
    }
    expect(html).toContain('token');
  });

  it('/^\\d+$/g produces token regex span', () => {
    const html = highlightCode('/^\\d+$/g', 'JavaScript');
    expect(html).toContain('class="token regex"');
  });
});

describe('highlightCode – JS Fetch (standard javascript grammar)', () => {
  it('doRequest does NOT produce token builtin span', () => {
    const html = highlightCode('doRequest', 'JS Fetch');
    expect(html).not.toContain('class="token builtin"');
  });
});

describe('highlightCode – Python (mash-python grammar)', () => {
  it('None produces token keyword span', () => {
    const html = highlightCode('None', 'Python (requests)');
    expect(html).toContain('class="token keyword"');
  });

  it('doRequest produces no token builtin span', () => {
    const html = highlightCode('doRequest', 'Python (requests)');
    expect(html).not.toContain('class="token builtin"');
  });

  it('.json() produces token method span', () => {
    const html = highlightCode('.json()', 'Python (requests)');
    expect(html).toContain('class="token method"');
    expect(html).toContain('json');
  });

  it('.data produces token property span', () => {
    const html = highlightCode('.data', 'Python (requests)');
    expect(html).toContain('class="token property"');
    expect(html).toContain('data');
  });
});

describe('highlightCode – cURL (no Prism grammar)', () => {
  it('returns plain escaped text with no spans', () => {
    const html = highlightCode('curl -X GET http://example.com', 'cURL');
    expect(html).toBe('curl -X GET http://example.com');
    expect(html).not.toContain('<span');
  });
});

describe('highlightCode – Go', () => {
  it('func produces token keyword span', () => {
    const html = highlightCode('func', 'Go (net/http)');
    expect(html).toContain('class="token keyword"');
  });

  it('.String() produces token method span', () => {
    const html = highlightCode('.String()', 'Go (net/http)');
    expect(html).toContain('class="token method"');
    expect(html).toContain('String');
  });

  it('.Body produces token property span', () => {
    const html = highlightCode('.Body', 'Go (net/http)');
    expect(html).toContain('class="token property"');
    expect(html).toContain('Body');
  });
});

describe('highlightCode – Java', () => {
  it('import produces token keyword span', () => {
    const html = highlightCode('import', 'Java (HttpClient)');
    expect(html).toContain('class="token keyword"');
  });

  it('.getBody() produces token method span', () => {
    const html = highlightCode('.getBody()', 'Java (HttpClient)');
    expect(html).toContain('class="token method"');
    expect(html).toContain('getBody');
  });

  it('.uri produces token property span', () => {
    const html = highlightCode('.uri', 'Java (HttpClient)');
    expect(html).toContain('class="token property"');
    expect(html).toContain('uri');
  });
});

describe('highlightCode – TypeScript', () => {
  it('interface produces token keyword span', () => {
    const html = highlightCode('interface', 'TypeScript (fetch)');
    expect(html).toContain('class="token keyword"');
  });

  it('.json() produces token method span', () => {
    const html = highlightCode('.json()', 'TypeScript (fetch)');
    expect(html).toContain('class="token method"');
    expect(html).toContain('json');
  });

  it('.data produces token property span', () => {
    const html = highlightCode('.data', 'TypeScript (fetch)');
    expect(html).toContain('class="token property"');
    expect(html).toContain('data');
  });
});

describe('highlightCode – method chains', () => {
  it('.json() produces token method span with method-name', () => {
    const html = highlightCode('.json()', 'JavaScript');
    expect(html).toContain('class="token method"');
    expect(html).toContain('class="token method-name"');
    expect(html).toContain('json');
  });

  it('.then() produces token method span', () => {
    const html = highlightCode('.then()', 'JavaScript');
    expect(html).toContain('class="token method"');
    expect(html).toContain('then');
  });

  it('.token (property access) produces token property span', () => {
    const html = highlightCode('.token', 'JavaScript');
    expect(html).toContain('class="token property"');
    expect(html).toContain('class="token property-name"');
    expect(html).toContain('token');
  });

  it('full chain: doRequest().json().token highlights all parts', () => {
    const html = highlightCode("doRequest('api/login').json().token", 'JavaScript');
    expect(html).toContain('class="token builtin"');
    expect(html).toContain('doRequest');
    expect(html).toContain('class="token method"');
    expect(html).toContain('json');
    expect(html).toContain('class="token property"');
    expect(html).toContain('token');
  });

  it('.data produces token property span', () => {
    const html = highlightCode('.data', 'JavaScript');
    expect(html).toContain('class="token property"');
    expect(html).toContain('data');
  });

  it('.map() in array chain produces token method span', () => {
    const html = highlightCode('.map()', 'JavaScript');
    expect(html).toContain('class="token method"');
    expect(html).toContain('map');
  });
});
