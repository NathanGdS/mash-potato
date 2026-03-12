import React from 'react';

interface MetricsBarProps {
  durationMs: number;
  sizeBytes: number;
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  return `${(bytes / 1024).toFixed(1)} KB`;
}

const MetricsBar: React.FC<MetricsBarProps> = ({ durationMs, sizeBytes }) => {
  return (
    <span className="metrics-bar">
      <span className="metrics-item">
        <span className="metrics-label">Time:</span>
        <span className="metrics-value">{durationMs} ms</span>
      </span>
      <span className="metrics-separator">|</span>
      <span className="metrics-item">
        <span className="metrics-label">Size:</span>
        <span className="metrics-value">{formatSize(sizeBytes)}</span>
      </span>
    </span>
  );
};

export default MetricsBar;
