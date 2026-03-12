import React from 'react';
import Sidebar from './components/Sidebar';
import './App.css';

const App: React.FC = () => {
  return (
    <div className="app-layout">
      <Sidebar />
      <main className="app-main">
        <div className="app-placeholder">
          <p>Select a collection or create a new one to get started.</p>
        </div>
      </main>
    </div>
  );
};

export default App;
