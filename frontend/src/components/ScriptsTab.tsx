import React, { useState } from 'react';
import ScriptEditor from './ScriptEditor';

type ScriptSubTab = 'pre-request' | 'post-response';

interface ScriptsTabProps {
  preScript: string;
  postScript: string;
  onPreScriptChange: (value: string) => void;
  onPostScriptChange: (value: string) => void;
}

const PRE_PLACEHOLDER =
  '// Runs before the request.\n// Example: mp.env.set(\'token\', \'abc123\');';
const POST_PLACEHOLDER =
  '// Runs after the response arrives.\n// Example: mp.env.set(\'authToken\', mp.response.body.token);';

const ScriptsTab: React.FC<ScriptsTabProps> = ({
  preScript,
  postScript,
  onPreScriptChange,
  onPostScriptChange,
}) => {
  const [activeSubTab, setActiveSubTab] = useState<ScriptSubTab>('pre-request');

  return (
    <div className="scripts-tab">
      <div className="scripts-subtabs">
        <button
          className={`scripts-subtab${activeSubTab === 'pre-request' ? ' scripts-subtab--active' : ''}`}
          onClick={() => setActiveSubTab('pre-request')}
        >
          Pre-request
        </button>
        <button
          className={`scripts-subtab${activeSubTab === 'post-response' ? ' scripts-subtab--active' : ''}`}
          onClick={() => setActiveSubTab('post-response')}
        >
          Post-response
        </button>
      </div>

      <div className="scripts-editor-area">
        {activeSubTab === 'pre-request' && (
          <ScriptEditor
            value={preScript}
            onChange={onPreScriptChange}
            placeholder={PRE_PLACEHOLDER}
          />
        )}
        {activeSubTab === 'post-response' && (
          <ScriptEditor
            value={postScript}
            onChange={onPostScriptChange}
            placeholder={POST_PLACEHOLDER}
          />
        )}
      </div>
    </div>
  );
};

export default ScriptsTab;
