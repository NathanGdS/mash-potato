import React from 'react';

interface TestsEditorProps {
  value: string;
  onChange: (value: string) => void;
}

const TestsEditor: React.FC<TestsEditorProps> = ({ value, onChange }) => {
  return (
    <div className="tests-editor">
      <div className="tests-editor-header">
        <p className="tests-editor-hint">
          Enter one assertion per line. Examples:<br />
          <code>status == 200</code><br />
          <code>body.id exists</code><br />
          <code>body.name == "John"</code><br />
          <code>header["Content-Type"] contains "json"</code>
        </p>
      </div>
      <textarea
        className="tests-editor-textarea"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="status == 200..."
        spellCheck={false}
      />
    </div>
  );
};

export default TestsEditor;
