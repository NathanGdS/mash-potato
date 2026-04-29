import Prism from 'prismjs';
import 'prismjs/components/prism-javascript';
import './mashJsGrammar';
import './mashPythonGrammar';
import './mashTypeScriptGrammar';
import './mashGoGrammar';
import './mashJavaGrammar';
import { Language } from './codeGen/index';

// ── Language mapping to Prism IDs ──────────────────────────
const PRISM_LANG_MAP: Record<Language, string | null> = {
  'cURL': null,
  'Python (requests)': 'mash-python',
  'JS Fetch': 'javascript',
  'JS Axios': 'javascript',
  'TypeScript (fetch)': 'mash-typescript',
  'Go (net/http)': 'mash-go',
  'Java (HttpClient)': 'mash-java',
  'JavaScript': 'mash-js',
};

// ── HTML escaping helper ───────────────────────────────────
function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

// ── highlightCode (Prism-based) ────────────────────────────
export function highlightCode(code: string, language: Language): string {
  const prismLang = PRISM_LANG_MAP[language];
  if (!prismLang) {
    return escapeHtml(code);
  }

  const grammar = Prism.languages[prismLang];
  if (!grammar) {
    return escapeHtml(code);
  }

  return Prism.highlight(code, grammar, prismLang);
}
