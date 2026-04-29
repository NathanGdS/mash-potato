import Prism from 'prismjs';
import 'prismjs/components/prism-go';

Prism.languages['mash-go'] = Prism.languages.extend('go', {});

// Method calls: .String(), .Error(), .Close()
Prism.languages.insertBefore('mash-go', 'function', {
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

// Property/field access: .Data, .Body, .URL
Prism.languages.insertBefore('mash-go', 'punctuation', {
  property: {
    pattern: /\.([a-zA-Z_$][\w$]*)/,
    lookbehind: false,
    inside: {
      punctuation: /^\./,
      'property-name': /[\w$]+/,
    },
  },
});
