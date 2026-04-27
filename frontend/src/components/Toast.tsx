import React, { useEffect } from 'react';
import './Toast.css';

interface ToastProps {
  message: string;
  onDismiss: () => void;
  autoDismissMs?: number;
}

const Toast: React.FC<ToastProps> = ({ message, onDismiss, autoDismissMs = 4000 }) => {
  useEffect(() => {
    const timer = setTimeout(onDismiss, autoDismissMs);
    return () => clearTimeout(timer);
  }, [onDismiss, autoDismissMs]);

  return (
    <div className="toast toast--error" role="alert" aria-live="assertive">
      <span className="toast-icon" aria-hidden="true">!</span>
      <div className="toast-body">
        <div className="toast-title">Request Error</div>
        <div className="toast-message">{message}</div>
      </div>
      <button className="toast-dismiss" onClick={onDismiss} aria-label="Dismiss error">
        ×
      </button>
    </div>
  );
};

export default Toast;
