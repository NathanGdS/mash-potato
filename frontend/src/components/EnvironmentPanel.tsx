import React, { useEffect, useRef, useState } from 'react';
import ReactDOM from 'react-dom';
import { useEnvironmentsStore } from '../store/environmentsStore';
import './EnvironmentPanel.css';

interface Props {
  onClose: () => void;
}

const EnvironmentPanel: React.FC<Props> = ({ onClose }) => {
  const {
    environments,
    loading,
    variables,
    fetchEnvironments,
    createEnvironment,
    renameEnvironment,
    deleteEnvironment,
    fetchVariables,
    setVariable,
    deleteVariable,
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

  useEffect(() => { fetchEnvironments(); }, [fetchEnvironments]);

  useEffect(() => {
    if (environments.length > 0 && !selectedId) {
      setSelectedId(environments[0].id);
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

  const selectedEnv = environments.find((e) => e.id === selectedId) ?? null;
  const selectedVars = selectedId ? (variables[selectedId] ?? []) : [];

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
              {environments.map((env) => (
                <li
                  key={env.id}
                  className={`env-list-item${selectedId === env.id ? ' env-list-item--active' : ''}`}
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
                      <span className="env-list-name" onDoubleClick={(e) => startRename(e, env.id, env.name)}>
                        {env.name}
                      </span>
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
                    </>
                  )}
                </li>
              ))}
            </ul>
          </div>

          {/* Right: variables table */}
          <div className="env-vars-panel">
            {!selectedEnv ? (
              <div className="env-vars-empty">
                {environments.length === 0
                  ? 'Create an environment to get started.'
                  : 'Select an environment.'}
              </div>
            ) : (
              <>
                <div className="env-vars-header">
                  <span className="env-vars-env-name">{selectedEnv.name}</span>
                  <span className="env-vars-hint">Click a cell to edit · Enter to save · Esc to cancel</span>
                </div>
                <div className="env-vars-scroll">
                  <table className="env-vars-table">
                    <thead>
                      <tr>
                        <th className="env-vars-col env-vars-col-key">Variable</th>
                        <th className="env-vars-col env-vars-col-val">Value</th>
                        <th className="env-vars-col env-vars-col-del" />
                      </tr>
                    </thead>
                    <tbody>
                      {selectedVars.map((v) => (
                        <tr key={v.id} className="env-vars-row">
                          {editingVarId === v.id ? (
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
                            </>
                          ) : (
                            <>
                              <td
                                className="env-vars-td env-var-cell"
                                onClick={() => startEditVar(v.id, v.key, v.value)}
                              >{v.key}</td>
                              <td
                                className="env-vars-td env-var-cell"
                                onClick={() => startEditVar(v.id, v.key, v.value)}
                              >{v.value || <span className="env-var-empty">—</span>}</td>
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
