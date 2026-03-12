import React, { useState } from 'react';

interface ResponseBodyProps {
  body: string;
}

type ViewMode = 'pretty' | 'raw';

function tryPrettyPrint(raw: string): { text: string; isJson: boolean } {
  try {
    const parsed = JSON.parse(raw);
    return { text: JSON.stringify(parsed, null, 2), isJson: true };
  } catch {
    return { text: raw, isJson: false };
  }
}

const ResponseBody: React.FC<ResponseBodyProps> = ({ body }) => {
  const [mode, setMode] = useState<ViewMode>('pretty');
  const { text: prettyText, isJson } = tryPrettyPrint(body);

  const displayText = mode === 'pretty' ? prettyText : body;

  return (
    <div className="response-body">
      <div className="response-body-tabs">
        <button
          className={`rb-tab${mode === 'pretty' ? ' rb-tab--active' : ''}`}
          onClick={() => setMode('pretty')}
        >
          Pretty
        </button>
        <button
          className={`rb-tab${mode === 'raw' ? ' rb-tab--active' : ''}`}
          onClick={() => setMode('raw')}
        >
          Raw
        </button>
        {mode === 'pretty' && !isJson && body.trim() !== '' && (
          <span className="rb-not-json">not JSON — showing as-is</span>
        )}
      </div>
      <pre className="response-body-pre">{displayText}</pre>
    </div>
  );
};

export default ResponseBody;
