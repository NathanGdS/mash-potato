import React, { useRef, useState } from 'react';
import { Wand2 } from 'lucide-react';
import { js as beautifyJs } from 'js-beautify';
import { highlightCode } from '../utils/codeHighlighter';
import './ScriptEditor.css';

interface ScriptEditorProps {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
}

const ScriptEditor: React.FC<ScriptEditorProps> = ({ value, onChange, placeholder }) => {
  const [formatError, setFormatError] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const mirrorRef = useRef<HTMLDivElement>(null);

  const handleFormat = () => {
    try {
      const formatted = beautifyJs(value, {
        indent_size: 2,
        indent_char: ' ',
        max_preserve_newlines: 2,
        preserve_newlines: true,
        brace_style: 'collapse',
        end_with_newline: false,
      });
      onChange(formatted);
      setFormatError(null);
    } catch (err) {
      setFormatError(err instanceof Error ? err.message : 'Formatting failed');
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    if (formatError !== null) {
      setFormatError(null);
    }
    onChange(e.target.value);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Tab') {
      e.preventDefault();
      const el = e.currentTarget;
      const start = el.selectionStart;
      const end = el.selectionEnd;
      const newValue = el.value.substring(0, start) + '  ' + el.value.substring(end);
      onChange(newValue);
      // Restore cursor after the two inserted spaces
      requestAnimationFrame(() => {
        el.selectionStart = start + 2;
        el.selectionEnd = start + 2;
      });
    }
  };

  const syncScroll = () => {
    if (textareaRef.current && mirrorRef.current) {
      mirrorRef.current.scrollTop = textareaRef.current.scrollTop;
      mirrorRef.current.scrollLeft = textareaRef.current.scrollLeft;
    }
  };

  const highlightedHtml = highlightCode(value, 'JavaScript');

  return (
    <div className="script-editor-wrapper">
      <button
        className="script-editor-format-btn"
        onClick={handleFormat}
        title="Format Code"
        type="button"
      >
        <Wand2 size={14} />
      </button>
      <div className="script-editor-inner">
        <div
          ref={mirrorRef}
          className="script-editor-mirror"
          aria-hidden="true"
          dangerouslySetInnerHTML={{ __html: highlightedHtml }}
        />
        <textarea
          ref={textareaRef}
          className="script-editor-textarea"
          value={value}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          onScroll={syncScroll}
          placeholder={placeholder}
          spellCheck={false}
        />
      </div>
      {formatError !== null && (
        <p className="script-editor-format-error">{formatError}</p>
      )}
    </div>
  );
};

export default ScriptEditor;
