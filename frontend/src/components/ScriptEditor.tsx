import React from 'react';

interface ScriptEditorProps {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
}

const ScriptEditor: React.FC<ScriptEditorProps> = ({ value, onChange, placeholder }) => {
  return (
    <textarea
      className="script-editor-textarea"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      spellCheck={false}
    />
  );
};

export default ScriptEditor;
