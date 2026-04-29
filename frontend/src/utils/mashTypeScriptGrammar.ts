import Prism from 'prismjs';
import 'prismjs/components/prism-typescript';

Prism.languages['mash-typescript'] = Prism.languages.extend('typescript', {});

// Method calls: .json(), .then(), .map()
Prism.languages.insertBefore('mash-typescript', 'function', {
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

// Property access: .data, .user, .token
Prism.languages.insertBefore('mash-typescript', 'punctuation', {
  property: {
    pattern: /\.([a-zA-Z_$][\w$]*)/,
    lookbehind: false,
    inside: {
      punctuation: /^\./,
      'property-name': /[\w$]+/,
    },
  },
});
