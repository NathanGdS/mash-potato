import React, { useState } from 'react';
import { Request } from '../types/request';
import { LANGUAGES, Language } from '../utils/codeGen/index';
import { useCodeGen } from '../hooks/useCodeGen';
import { highlightCode } from '../utils/codeHighlighter';

// ── CodeBlock ──────────────────────────────────────────────

interface CodeBlockProps {
  code: string;
  language: Language;
}

const CodeBlock: React.FC<CodeBlockProps> = ({ code, language }) => {
  const html = highlightCode(code, language);
  return (
    <pre className="code-gen-snippet">
      <code
        className="code-gen-code"
        // highlightCode returns escaped HTML with span tags only — safe to inject
        dangerouslySetInnerHTML={{ __html: html }}
      />
    </pre>
  );
};

// ── CodeGenPanel ───────────────────────────────────────────

interface CodeGenPanelProps {
  request: Request;
}

const CodeGenPanel: React.FC<CodeGenPanelProps> = ({ request }) => {
  const [language, setLanguage] = useState<Language>('cURL');
  const [copied, setCopied] = useState<boolean>(false);

  const fullCode = useCodeGen(request, language);

  const TRUNCATE_AT = 10240;
  const displayCode = fullCode.length > TRUNCATE_AT
    ? fullCode.slice(0, TRUNCATE_AT) + '\n// ... (truncated for display)'
    : fullCode;

  const handleCopy = () => {
    navigator.clipboard.writeText(fullCode).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  };

  return (
    <div className="code-gen-panel">
      <div className="code-gen-toolbar">
        <select
          className="code-gen-lang-selector"
          value={language}
          onChange={(e) => setLanguage(e.target.value as Language)}
          aria-label="Code generation language"
        >
          {LANGUAGES.map((lang) => (
            <option key={lang} value={lang}>
              {lang}
            </option>
          ))}
        </select>
        <button
          className={`rv-copy-btn code-gen-copy-btn${copied ? ' rv-copy-btn--success' : ''}`}
          onClick={handleCopy}
          title="Copy snippet to clipboard"
        >
          {copied ? '✓ Copied!' : 'Copy'}
        </button>
      </div>
      <CodeBlock code={displayCode} language={language} />
    </div>
  );
};

export default CodeGenPanel;
