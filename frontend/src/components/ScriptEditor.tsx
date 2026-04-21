import React, { useState } from 'react';
import { Wand2 } from 'lucide-react';
import { js as beautifyJs } from 'js-beautify';
import './ScriptEditor.css';

interface ScriptEditorProps {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
}

const ScriptEditor: React.FC<ScriptEditorProps> = ({ value, onChange, placeholder }) => {
  const [formatError, setFormatError] = useState<string | null>(null);

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
      <textarea
        className="script-editor-textarea"
        value={value}
        onChange={handleChange}
        placeholder={placeholder}
        spellCheck={false}
      />
      {formatError !== null && (
        <p className="script-editor-format-error">{formatError}</p>
      )}
    </div>
  );
};

export default ScriptEditor;
