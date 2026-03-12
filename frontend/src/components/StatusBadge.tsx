import React from 'react';

interface StatusBadgeProps {
  statusCode: number;
  statusText: string;
}

function getStatusClass(code: number): string {
  if (code >= 200 && code < 300) return 'status-badge--2xx';
  if (code >= 300 && code < 400) return 'status-badge--3xx';
  if (code >= 400 && code < 500) return 'status-badge--4xx';
  if (code >= 500 && code < 600) return 'status-badge--5xx';
  return 'status-badge--other';
}

const StatusBadge: React.FC<StatusBadgeProps> = ({ statusCode, statusText }) => {
  return (
    <span className={`status-badge ${getStatusClass(statusCode)}`}>
      {statusCode} {statusText}
    </span>
  );
};

export default StatusBadge;
