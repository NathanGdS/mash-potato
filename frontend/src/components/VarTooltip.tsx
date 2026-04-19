import React, { useMemo, useState } from 'react';
import ReactDOM from 'react-dom';
import { useEnvironmentsStore } from '../store/environmentsStore';
import './VarTooltip.css';

interface VarTooltipProps {
  varName: string;
  anchorRect: DOMRect;
  isPassword: boolean;
  onMouseEnter: () => void;
  onMouseLeave: ((e: React.MouseEvent) => void) | (() => void);
}

interface TooltipPos {
  top: number;
  left: number;
  placedBelow: boolean;
}

const TOOLTIP_WIDTH = 260;

function computePos(anchorRect: DOMRect): TooltipPos {
  const spaceBelow = window.innerHeight - anchorRect.bottom;
  const spaceAbove = anchorRect.top;
  const placedBelow = spaceBelow >= spaceAbove;
  const top = placedBelow ? anchorRect.bottom + 4 : anchorRect.top - 4;
  const left = Math.min(
    anchorRect.left,
    window.innerWidth - TOOLTIP_WIDTH - 8
  );
  return { top, left, placedBelow };
}

const VarTooltip: React.FC<VarTooltipProps> = ({
  varName,
  anchorRect,
  isPassword,
  onMouseEnter,
  onMouseLeave,
}) => {
  const environments = useEnvironmentsStore((s) => s.environments);
  const activeEnvironmentId = useEnvironmentsStore((s) => s.activeEnvironmentId);
  const globalEnvironmentId = useEnvironmentsStore((s) => s.globalEnvironmentId);
  const variables = useEnvironmentsStore((s) => s.variables);
  const setActiveEnvironment = useEnvironmentsStore((s) => s.setActiveEnvironment);

  const resolvedValue = useMemo(() => {
    const activeVars =
      activeEnvironmentId && activeEnvironmentId !== globalEnvironmentId
        ? (variables[activeEnvironmentId] ?? [])
        : [];
    const globalVars = globalEnvironmentId ? (variables[globalEnvironmentId] ?? []) : [];
    const inActive = activeVars.find((v) => v.key === varName);
    if (inActive !== undefined) return inActive.value;
    const inGlobal = globalVars.find((v) => v.key === varName);
    if (inGlobal !== undefined) return inGlobal.value;
    return '\u2014';
  }, [varName, activeEnvironmentId, globalEnvironmentId, variables]);

  // Issue 3: lazy initializer — compute from anchorRect immediately, no flash at {0,0}
  const [pos] = useState<TooltipPos>(() => computePos(anchorRect));

  // Issue 4: async handler with try/catch
  const handleEnvChange = async (e: React.ChangeEvent<HTMLSelectElement>) => {
    try {
      await setActiveEnvironment(e.target.value);
    } catch (err) {
      console.error('[VarTooltip] Failed to set active environment:', err);
    }
  };

  const displayValue = isPassword ? '••••••' : resolvedValue;

  // Issue 2: flip logic — when placed below, anchor at top of card; above, anchor at bottom
  const style: React.CSSProperties = pos.placedBelow
    ? { top: pos.top, left: pos.left }
    : { bottom: window.innerHeight - (anchorRect.top - 4), left: pos.left };

  return ReactDOM.createPortal(
    // Issue 1: position:fixed is already in CSS — no inline position:absolute
    // Issue 5: removed role="tooltip" — card has interactive <select>, use no role
    <div
      className="var-tooltip"
      style={style}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
    >
      <div className="var-tooltip__header">
        <span className="var-tooltip__braces">{'{{' }</span>
        <span className="var-tooltip__name">{varName}</span>
        <span className="var-tooltip__braces">{'}}'}</span>
      </div>
      <div className="var-tooltip__divider" />
      <div className="var-tooltip__body">
        <div className="var-tooltip__row">
          <span className="var-tooltip__label">Value:</span>
          <span className="var-tooltip__value">{displayValue}</span>
        </div>
      </div>
      {/* Issue 6: Env row moved to its own footer section */}
      <div className="var-tooltip__footer">
        <div className="var-tooltip__row">
          <span className="var-tooltip__label">Env:</span>
          <select
            className="var-tooltip__env-select"
            value={activeEnvironmentId ?? ''}
            onChange={handleEnvChange}
            aria-label="Select active environment"
          >
            <option value="">No Environment</option>
            {environments.map((env) => (
              <option key={env.id} value={env.id}>
                {env.name}
              </option>
            ))}
          </select>
        </div>
      </div>
    </div>,
    document.body
  );
};

export default VarTooltip;
