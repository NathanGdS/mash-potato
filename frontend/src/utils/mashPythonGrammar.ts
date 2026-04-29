import Prism from 'prismjs';
import 'prismjs/components/prism-python';

Prism.languages['mash-python'] = Prism.languages.extend('python', {});

const mashPython = Prism.languages['mash-python'] as Record<string, unknown>;

const originalKeyword = mashPython['keyword'] as RegExp | undefined;
if (originalKeyword) {
  mashPython['keyword'] = new RegExp(`\\bNone\\b|${originalKeyword.source}`, originalKeyword.flags);
}

// Method calls: .json(), .get(), .keys()
Prism.languages.insertBefore('mash-python', 'function', {
  method: {
    pattern: /\.([a-zA-Z_$][\w$]*)\s*\(/,
    lookbehind: false,
    inside: {
      punctuation: [
        /^\./,
        /\s*\($/,
      ],
      'method-name': /[\w$]+/,
    },
  },
});

// Property access: .data, .user, .name
Prism.languages.insertBefore('mash-python', 'punctuation', {
  property: {
    pattern: /\.([a-zA-Z_$][\w$]*)/,
    lookbehind: false,
    inside: {
      punctuation: /^\./,
      'property-name': /[\w$]+/,
    },
  },
});
