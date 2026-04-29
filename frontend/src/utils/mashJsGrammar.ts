import Prism from 'prismjs';
import 'prismjs/components/prism-javascript';

Prism.languages['mash-js'] = Prism.languages.extend('javascript', {});

// Method calls in chains: .json(), .then(), .map()
// Must be inserted before 'function' so .json() is caught as method, not punctuation+function
Prism.languages.insertBefore('mash-js', 'function', {
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

// Property access in chains: .token, .data, .user
// Must be inserted before 'punctuation' so .token is caught as property, not punctuation+plain
Prism.languages.insertBefore('mash-js', 'punctuation', {
  property: {
    pattern: /\.([a-zA-Z_$][\w$]*)/,
    lookbehind: false,
    inside: {
      punctuation: /^\./,
      'property-name': /[\w$]+/,
    },
  },
});

// Builtin API tokens: doRequest, stopRunner, mp
Prism.languages.insertBefore('mash-js', 'keyword', {
  builtin: /\b(?:doRequest|stopRunner|mp)\b/,
});
