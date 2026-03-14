import React from 'react';
import { httpclient } from '../../wailsjs/go/models';

interface TestResultsProps {
  results: httpclient.AssertionResult[];
}

const TestResults: React.FC<TestResultsProps> = ({ results }) => {
  if (!results || results.length === 0) {
    return (
      <div className="test-results-empty">
        No tests were run.
      </div>
    );
  }

  const passCount = results.filter(r => r.passed).length;
  const allPassed = passCount === results.length;

  return (
    <div className="test-results">
      <div className={`test-results-summary ${allPassed ? 'pass' : 'fail'}`}>
        {allPassed ? (
          <span>✅ All {results.length} tests passed</span>
        ) : (
          <span>❌ {results.length - passCount} of {results.length} tests failed</span>
        )}
      </div>
      <div className="test-results-list">
        {results.map((res, idx) => (
          <div key={idx} className={`test-result-item ${res.passed ? 'pass' : 'fail'}`}>
            <span className="test-result-status">
              {res.passed ? 'PASS' : 'FAIL'}
            </span>
            <span className="test-result-expression">
              {res.expression}
            </span>
            {!res.passed && res.message && (
              <div className="test-result-message">
                {res.message}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};

export default TestResults;
