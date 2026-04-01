import React, { useEffect, useRef, useState } from 'react';
import ReactDOM from 'react-dom';
import { useEnvironmentsStore } from '../store/environmentsStore';
import './EnvironmentPanel.css';

interface Props {
  onClose: () => void;
}

// SVG icons for lock toggle
const LockedIcon = () => (
  <svg width="13" height="13" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
    <path d="M11 7V5a3 3 0 0 0-6 0v2H4a1 1 0 0 0-1 1v6a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1V8a1 1 0 0 0-1-1h-1ZM6 5a2 2 0 1 1 4 0v2H6V5Zm2 4a1 1 0 0 1 1 1v1a1 1 0 1 1-2 0v-1a1 1 0 0 1 1-1Z"/>
  </svg>
);

const UnlockedIcon = () => (
  <svg width="13" height="13" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
    <path d="M11 7V5a3 3 0 0 0-6 0v2H4a1 1 0 0 0-1 1v6a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1V8a1 1 0 0 0-1-1h-1ZM6 5a2 2 0 1 1 4 0v2H6V5Z"/>
    <path d="M4 7V5a4 4 0 0 1 8 0v2h.5A1.5 1.5 0 0 1 14 8.5v5a1.5 1.5 0 0 1-1.5 1.5h-9A1.5 1.5 0 0 1 2 13.5v-5A1.5 1.5 0 0 1 3.5 7H4Zm1 0h6V5a3 3 0 1 0-6 0v2Z" opacity="0.3"/>
  </svg>
);

const EyeIcon = () => (
  <svg width="13" height="13" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
    <path d="M16 8s-3-5.5-8-5.5S0 8 0 8s3 5.5 8 5.5S16 8 16 8zM1.173 8a13.133 13.133 0 0 1 1.66-2.043C4.12 4.668 5.88 3.5 8 3.5c2.12 0 3.879 1.168 5.168 2.457A13.133 13.133 0 0 1 14.828 8c-.058.087-.122.183-.195.288-.335.48-.83 1.12-1.465 1.755C11.879 11.332 10.119 12.5 8 12.5c-2.12 0-3.879-1.168-5.168-2.457A13.134 13.134 0 0 1 1.172 8z"/>
    <path d="M8 5.5a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5zM4.5 8a3.5 3.5 0 1 1 7 0 3.5 3.5 0 0 1-7 0z"/>
  </svg>
);

const WarningIcon = () => (
  <svg width="13" height="13" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
    <path d="M8.982 1.566a1.13 1.13 0 0 0-1.96 0L.165 13.233c-.457.778.091 1.767.98 1.767h13.713c.889 0 1.438-.99.98-1.767L8.982 1.566zM8 5c.535 0 .954.462.9.995l-.35 3.507a.552.552 0 0 1-1.1 0L7.1 5.995A.905.905 0 0 1 8 5zm.002 6a1 1 0 1 1 0 2 1 1 0 0 1 0-2z"/>
  </svg>
);

const EnvironmentPanel: React.FC<Props> = ({ onClose }) => {
  const {
    environments,
    loading,
    variables,
    globalEnvironmentId,
    fetchEnvironments,
    createEnvironment,
    renameEnvironment,
    deleteEnvironment,
    fetchVariables,
    setVariable,
    deleteVariable,
    toggleVariableSecret,
    setSecretVariable,
  } = useEnvironmentsStore();

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [addingEnv, setAddingEnv] = useState(false);
  const [newEnvName, setNewEnvName] = useState('');
  const [editingVarId, setEditingVarId] = useState<number | null>(null);
  const [editKey, setEditKey] = useState('');
  const [editValue, setEditValue] = useState('');
  const [newVarKey, setNewVarKey] = useState('');
  const [newVarValue, setNewVarValue] = useState('');
  const newKeyRef = useRef<HTMLInputElement>(null);

  // Track which secret variables are currently revealed: varId -> timeout handle
  const revealTimers = useRef<Map<number, ReturnType<typeof setTimeout>>>(new Map());
  const [revealedVarIds, setRevealedVarIds] = useState<Set<number>>(new Set());

  // Track re-entry state for broken variables: varId -> draft value being typed
  const [brokenDraftValues, setBrokenDraftValues] = useState<Record<number, string>>({});

  // Track which broken-var saves are currently in-flight to prevent duplicate calls
  // from onBlur firing after a draft is restored on error.
  const brokenSaveInFlight = useRef<Set<number>>(new Set());

  // Clear all reveal timers on unmount to prevent state updates on unmounted component
  useEffect(() => {
    return () => {
      revealTimers.current.forEach((timer) => window.clearTimeout(timer));
      revealTimers.current.clear();
    };
  }, []);

  const handleRevealSecret = (varId: number) => {
    // Clear existing timer for this var if any
    const existing = revealTimers.current.get(varId);
    if (existing !== undefined) window.clearTimeout(existing);

    setRevealedVarIds((prev) => new Set(prev).add(varId));

    const timer = window.setTimeout(() => {
      setRevealedVarIds((prev) => {
        const next = new Set(prev);
        next.delete(varId);
        return next;
      });
      revealTimers.current.delete(varId);
    }, 5000);

    revealTimers.current.set(varId, timer);
  };

  const handleToggleLock = async (varId: number, isCurrentlySecret: boolean) => {
    if (!selectedId) return;
    // If un-locking, also clear any active reveal timer
    if (isCurrentlySecret) {
      const timer = revealTimers.current.get(varId);
      if (timer !== undefined) {
        window.clearTimeout(timer);
        revealTimers.current.delete(varId);
      }
      setRevealedVarIds((prev) => {
        const next = new Set(prev);
        next.delete(varId);
        return next;
      });
    }
    await toggleVariableSecret(selectedId, varId, !isCurrentlySecret);
  };

  useEffect(() => { fetchEnvironments(); }, [fetchEnvironments]);

  useEffect(() => {
    if (environments.length > 0 && !selectedId) {
      // Default-select the Global environment if present, otherwise the first env.
      const globalEnv = environments.find((e) => e.is_global);
      setSelectedId(globalEnv ? globalEnv.id : environments[0].id);
    }
  }, [environments, selectedId]);

  useEffect(() => {
    if (selectedId) fetchVariables(selectedId);
  }, [selectedId, fetchVariables]);

  const handleBackdropClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget) onClose();
  };

  const handleBackdropKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') onClose();
  };

  // ── Environments ────────────────────────────────────────

  const handleSelectEnv = (id: string) => {
    setSelectedId(id);
    setRenamingId(null);
    setEditingVarId(null);
  };

  const startRename = (e: React.MouseEvent, id: string, name: string) => {
    e.stopPropagation();
    setRenamingId(id);
    setRenameValue(name);
  };

  const commitRename = async () => {
    if (!renamingId) return;
    const trimmed = renameValue.trim();
    if (trimmed) await renameEnvironment(renamingId, trimmed);
    setRenamingId(null);
  };

  const handleAddEnvCommit = async () => {
    const trimmed = newEnvName.trim();
    if (!trimmed) { setAddingEnv(false); setNewEnvName(''); return; }
    try {
      const env = await createEnvironment(trimmed);
      setNewEnvName('');
      setAddingEnv(false);
      setSelectedId(env.id);
    } catch {
      // keep input open on error
    }
  };

  const handleDeleteEnv = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    await deleteEnvironment(id);
    if (selectedId === id) setSelectedId(null);
  };

  // ── Variables ────────────────────────────────────────────

  const startEditVar = (id: number, key: string, value: string) => {
    setEditingVarId(id);
    setEditKey(key);
    setEditValue(value);
  };

  const commitVarEdit = async () => {
    if (!selectedId || editingVarId === null) return;
    if (editKey.trim()) await setVariable(selectedId, editKey.trim(), editValue);
    setEditingVarId(null);
  };

  const handleAddVariable = async () => {
    if (!selectedId || !newVarKey.trim()) return;
    await setVariable(selectedId, newVarKey.trim(), newVarValue);
    setNewVarKey('');
    setNewVarValue('');
    newKeyRef.current?.focus();
  };

  const handleBrokenDraftChange = (varId: number, value: string) => {
    setBrokenDraftValues((prev) => ({ ...prev, [varId]: value }));
  };

  const commitBrokenVarReentry = async (varId: number, key: string) => {
    if (!selectedId) return;
    // Guard: if a save is already in-flight for this varId (e.g. onBlur fires
    // after the draft was restored on error), bail out to prevent a duplicate call.
    if (brokenSaveInFlight.current.has(varId)) return;

    const newValue = (brokenDraftValues[varId] ?? '').trim();
    if (!newValue) return;

    // Clear draft synchronously to prevent double-write on blur
    setBrokenDraftValues((prev) => {
      const next = { ...prev };
      delete next[varId];
      return next;
    });

    brokenSaveInFlight.current.add(varId);
    try {
      await setSecretVariable(selectedId, key, newValue);
    } catch (err) {
      // Restore draft on failure so user doesn't lose their input
      setBrokenDraftValues((prev) => ({ ...prev, [varId]: newValue }));
      console.error('Failed to save broken variable re-entry:', err);
    } finally {
      brokenSaveInFlight.current.delete(varId);
    }
  };

  const selectedEnv = environments.find((e) => e.id === selectedId) ?? null;
  const selectedVars = selectedId ? (variables[selectedId] ?? []) : [];
  const selectedIsGlobal = selectedEnv?.is_global || selectedEnv?.id === globalEnvironmentId;
  const hasBrokenVars = selectedVars.some((v) => v.broken);

  return ReactDOM.createPortal(
    <div
      className="modal-backdrop"
      onClick={handleBackdropClick}
      onKeyDown={handleBackdropKeyDown}
      role="dialog"
      aria-modal="true"
      aria-label="Manage environments"
    >
      <div className="env-modal">

        {/* ── Header ── */}
        <div className="env-modal-header">
          <span className="env-modal-title">Manage Environments</span>
          <button className="env-modal-close" onClick={onClose} aria-label="Close">✕</button>
        </div>

        {/* ── Body: two columns ── */}
        <div className="env-modal-body">

          {/* Left: env list */}
          <div className="env-list-panel">
            <div className="env-list-toolbar">
              <span className="env-list-label">Environments</span>
              <button
                className="env-list-add-btn"
                title="Add environment"
                onClick={() => { setAddingEnv(true); }}
              >+</button>
            </div>

            {addingEnv && (
              <div className="env-new-row">
                <input
                  className="env-new-input"
                  autoFocus
                  placeholder="Environment name"
                  value={newEnvName}
                  onChange={(e) => setNewEnvName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleAddEnvCommit();
                    if (e.key === 'Escape') { setAddingEnv(false); setNewEnvName(''); }
                  }}
                  onBlur={handleAddEnvCommit}
                />
              </div>
            )}

            <ul className="env-list">
              {loading && <li className="env-list-hint">Loading…</li>}
              {!loading && environments.length === 0 && !addingEnv && (
                <li className="env-list-hint">No environments yet.</li>
              )}
              {environments.map((env) => {
                const isGlobal = env.is_global || env.id === globalEnvironmentId;
                return (
                  <li
                    key={env.id}
                    className={`env-list-item${selectedId === env.id ? ' env-list-item--active' : ''}${isGlobal ? ' env-list-item--global' : ''}`}
                    onClick={() => handleSelectEnv(env.id)}
                  >
                    {renamingId === env.id ? (
                      <input
                        className="env-rename-input"
                        autoFocus
                        value={renameValue}
                        onChange={(e) => setRenameValue(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') commitRename();
                          if (e.key === 'Escape') setRenamingId(null);
                        }}
                        onBlur={commitRename}
                        onClick={(e) => e.stopPropagation()}
                      />
                    ) : (
                      <>
                        <span
                          className="env-list-name"
                          onDoubleClick={isGlobal ? undefined : (e) => startRename(e, env.id, env.name)}
                        >
                          {env.name}
                          {isGlobal && <span className="env-global-badge">global</span>}
                        </span>
                        {!isGlobal && (
                          <div className="env-list-actions">
                            <button
                              className="env-list-btn"
                              title="Rename"
                              onClick={(e) => startRename(e, env.id, env.name)}
                              aria-label={`Rename ${env.name}`}
                            >✎</button>
                            <button
                              className="env-list-btn env-list-btn--danger"
                              title="Delete"
                              onClick={(e) => handleDeleteEnv(e, env.id)}
                              aria-label={`Delete ${env.name}`}
                            >✕</button>
                          </div>
                        )}
                      </>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>

          {/* Right: variables table */}
          <div className="env-vars-panel">
            {!selectedEnv ? (
              <div className="env-vars-empty">
                Select an environment.
              </div>
            ) : (
              <>
                <div className="env-vars-header">
                  <span className="env-vars-env-name">{selectedEnv.name}</span>
                  {selectedIsGlobal && (
                    <span className="env-vars-hint env-vars-hint--global">
                      Always active · overridden by environment variables with the same key
                    </span>
                  )}
                  {!selectedIsGlobal && (
                    <span className="env-vars-hint">Click a cell to edit · Enter to save · Esc to cancel</span>
                  )}
                </div>

                {hasBrokenVars && (
                  <div className="env-broken-banner" role="alert">
                    <WarningIcon />
                    <span>
                      One or more secret variables could not be decrypted. This may indicate the
                      encryption key was changed or lost. Please re-enter the values.
                    </span>
                  </div>
                )}

                <div className="env-vars-scroll">
                  <table className="env-vars-table">
                    <thead>
                      <tr>
                        <th className="env-vars-col env-vars-col-key">Variable</th>
                        <th className="env-vars-col env-vars-col-val">Value</th>
                        <th className="env-vars-col env-vars-col-lock" />
                        <th className="env-vars-col env-vars-col-del" />
                      </tr>
                    </thead>
                    <tbody>
                      {selectedVars.map((v) => (
                        <tr
                          key={v.id}
                          className={`env-vars-row${v.broken ? ' env-vars-row--broken' : ''}`}
                        >
                          {editingVarId === v.id && !v.broken ? (
                            <>
                              <td className="env-vars-td">
                                <input
                                  className="env-var-input"
                                  autoFocus
                                  value={editKey}
                                  onChange={(e) => setEditKey(e.target.value)}
                                  onKeyDown={(e) => {
                                    if (e.key === 'Enter') commitVarEdit();
                                    if (e.key === 'Escape') setEditingVarId(null);
                                  }}
                                  onBlur={commitVarEdit}
                                />
                              </td>
                              <td className="env-vars-td">
                                <input
                                  className="env-var-input"
                                  value={editValue}
                                  onChange={(e) => setEditValue(e.target.value)}
                                  onKeyDown={(e) => {
                                    if (e.key === 'Enter') commitVarEdit();
                                    if (e.key === 'Escape') setEditingVarId(null);
                                  }}
                                  onBlur={commitVarEdit}
                                />
                              </td>
                              <td className="env-vars-td" />
                              <td className="env-vars-td" />
                            </>
                          ) : v.broken ? (
                            <>
                              <td className="env-vars-td env-var-cell env-var-cell--broken-key">
                                <span className="env-var-broken-key-label">
                                  <WarningIcon />
                                  {v.key}
                                </span>
                              </td>
                              <td className="env-vars-td env-var-cell--broken-value">
                                <input
                                  className="env-var-input env-var-input--broken"
                                  placeholder="Decryption failed — re-enter value"
                                  value={brokenDraftValues[v.id] ?? ''}
                                  onChange={(e) => handleBrokenDraftChange(v.id, e.target.value)}
                                  onKeyDown={(e) => {
                                    if (e.key === 'Enter') commitBrokenVarReentry(v.id, v.key);
                                    if (e.key === 'Escape') {
                                      setBrokenDraftValues((prev) => {
                                        const next = { ...prev };
                                        delete next[v.id];
                                        return next;
                                      });
                                    }
                                  }}
                                  onBlur={() => commitBrokenVarReentry(v.id, v.key)}
                                  aria-label={`Re-enter value for broken variable ${v.key}`}
                                />
                              </td>
                              <td className="env-vars-td env-vars-td-lock" />
                              <td className="env-vars-td env-vars-td-del">
                                <button
                                  className="env-var-del-btn"
                                  onClick={() => deleteVariable(selectedId!, v.id)}
                                  aria-label={`Delete ${v.key}`}
                                >✕</button>
                              </td>
                            </>
                          ) : (
                            <>
                              <td
                                className="env-vars-td env-var-cell"
                                onClick={() => startEditVar(v.id, v.key, v.value)}
                              >{v.key}</td>
                              <td className="env-vars-td env-var-cell env-var-cell--value">
                                {v.is_secret && !revealedVarIds.has(v.id) ? (
                                  <span className="env-var-secret-row">
                                    <span className="secret-value-masked">••••••</span>
                                    <button
                                      className="env-var-eye-btn"
                                      onClick={() => handleRevealSecret(v.id)}
                                      aria-label={`Reveal value for ${v.key}`}
                                      title="Reveal for 5 seconds"
                                    >
                                      <EyeIcon />
                                    </button>
                                  </span>
                                ) : (
                                  <span onClick={() => !v.is_secret && startEditVar(v.id, v.key, v.value)}>
                                    {v.value || <span className="env-var-empty">—</span>}
                                  </span>
                                )}
                              </td>
                              <td className="env-vars-td env-vars-td-lock">
                                <button
                                  className={`env-var-lock-btn${v.is_secret ? ' env-var-lock-btn--locked' : ''}`}
                                  onClick={() => handleToggleLock(v.id, v.is_secret)}
                                  aria-label={v.is_secret ? `Unmark ${v.key} as secret` : `Mark ${v.key} as secret`}
                                  title={v.is_secret ? 'Unmark as secret' : 'Mark as secret'}
                                >
                                  {v.is_secret ? <LockedIcon /> : <UnlockedIcon />}
                                </button>
                              </td>
                              <td className="env-vars-td env-vars-td-del">
                                <button
                                  className="env-var-del-btn"
                                  onClick={() => deleteVariable(selectedId!, v.id)}
                                  aria-label={`Delete ${v.key}`}
                                >✕</button>
                              </td>
                            </>
                          )}
                        </tr>
                      ))}

                      {/* Add row */}
                      <tr className="env-var-add-row">
                        <td className="env-vars-td">
                          <input
                            ref={newKeyRef}
                            className="env-var-input env-var-input--ghost"
                            placeholder="New variable"
                            value={newVarKey}
                            onChange={(e) => setNewVarKey(e.target.value)}
                            onKeyDown={(e) => { if (e.key === 'Enter') handleAddVariable(); }}
                          />
                        </td>
                        <td className="env-vars-td">
                          <input
                            className="env-var-input env-var-input--ghost"
                            placeholder="Value"
                            value={newVarValue}
                            onChange={(e) => setNewVarValue(e.target.value)}
                            onKeyDown={(e) => { if (e.key === 'Enter') handleAddVariable(); }}
                          />
                        </td>
                        <td className="env-vars-td" />
                        <td className="env-vars-td env-vars-td-del">
                          <button
                            className="env-var-add-icon-btn"
                            onClick={handleAddVariable}
                            disabled={!newVarKey.trim()}
                            title="Add variable"
                          >+</button>
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </div>
        </div>

        {/* ── Footer ── */}
        <div className="env-modal-footer">
          <button className="btn btn--secondary" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>,
    document.body
  );
};

export default EnvironmentPanel;
