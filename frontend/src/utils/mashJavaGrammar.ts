import Prism from 'prismjs';
import 'prismjs/components/prism-java';

Prism.languages['mash-java'] = Prism.languages.extend('java', {});

// Method calls: .toString(), .getBody(), .close()
Prism.languages.insertBefore('mash-java', 'function', {
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

// Property/field access: .data, .body, .url
Prism.languages.insertBefore('mash-java', 'punctuation', {
  property: {
    pattern: /\.([a-zA-Z_$][\w$]*)/,
    lookbehind: false,
    inside: {
      punctuation: /^\./,
      'property-name': /[\w$]+/,
    },
  },
});
