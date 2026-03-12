import React from 'react';
import Sidebar from './components/Sidebar';
import RequestEditor from './components/RequestEditor';
import ResponseViewer from './components/ResponseViewer';
import { useRequestsStore } from './store/requestsStore';
import './App.css';

const App: React.FC = () => {
  const activeRequest = useRequestsStore((s) => s.activeRequest);

  return (
    <div className="app-layout">
      <Sidebar />
      <main className="app-main">
        {activeRequest ? (
          <div className="app-workspace">
            <div className="app-request-pane">
              <RequestEditor request={activeRequest} />
            </div>
            <div className="app-response-pane">
              <ResponseViewer />
            </div>
          </div>
        ) : (
          <div className="app-placeholder">
            <p>Select a request to start editing.</p>
          </div>
        )}
      </main>
    </div>
  );
};

export default App;
