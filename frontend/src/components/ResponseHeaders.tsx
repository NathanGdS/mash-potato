import React from 'react';

interface ResponseHeadersProps {
  headers: Record<string, string[]>;
}

const ResponseHeaders: React.FC<ResponseHeadersProps> = ({ headers }) => {
  const entries = Object.entries(headers);

  if (entries.length === 0) {
    return <p className="response-headers-empty">No headers received.</p>;
  }

  return (
    <div className="response-headers">
      <table className="response-headers-table">
        <thead>
          <tr>
            <th className="rh-col-key">Header</th>
            <th className="rh-col-value">Value</th>
          </tr>
        </thead>
        <tbody>
          {entries.map(([key, values]) => (
            <tr key={key} className="rh-row">
              <td className="rh-cell rh-cell--key">{key}</td>
              <td className="rh-cell rh-cell--value">{values.join(', ')}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

export default ResponseHeaders;
