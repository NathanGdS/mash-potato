import React, { useEffect, useRef, useState } from 'react';
import ReactDOM from 'react-dom';
import './VarPopover.css';

interface VarPopoverProps {
  open: boolean;
  items: string[];
  selectedIdx: number;
  anchorRef: React.RefObject<HTMLElement | null>;
  onSelect: (varName: string) => void;
  onClose: () => void;
}

interface PopoverPos {
  top: number;
  left: number;
  minWidth: number;
}

const VarPopover: React.FC<VarPopoverProps> = ({
  open,
  items,
  selectedIdx,
  anchorRef,
  onSelect,
  onClose,
}) => {
  const listRef = useRef<HTMLUListElement>(null);
  const [pos, setPos] = useState<PopoverPos>({ top: 0, left: 0, minWidth: 200 });

  // Recompute position whenever the popover opens
  useEffect(() => {
    if (!open || !anchorRef.current) return;
    const rect = anchorRef.current.getBoundingClientRect();
    const popoverHeight = Math.min(items.length * 36 + 8, 220);
    const spaceBelow = window.innerHeight - rect.bottom - 8;
    const top =
      spaceBelow >= popoverHeight
        ? rect.bottom + 4
        : rect.top - popoverHeight - 4;
    setPos({ top, left: rect.left, minWidth: Math.max(rect.width, 220) });
  }, [open, anchorRef, items.length]);

  // Scroll the active item into view
  useEffect(() => {
    if (!listRef.current || !open) return;
    const item = listRef.current.children[selectedIdx] as HTMLElement | undefined;
    item?.scrollIntoView({ block: 'nearest' });
  }, [selectedIdx, open]);

  // Close on mousedown outside (before blur fires on the input)
  useEffect(() => {
    if (!open) return;
    const handleMouseDown = (e: MouseEvent) => {
      if (!listRef.current?.contains(e.target as Node)) onClose();
    };
    document.addEventListener('mousedown', handleMouseDown);
    return () => document.removeEventListener('mousedown', handleMouseDown);
  }, [open, onClose]);

  if (!open || items.length === 0) return null;

  return ReactDOM.createPortal(
    <ul
      className="var-popover"
      ref={listRef}
      role="listbox"
      aria-label="Environment variables"
      style={{ top: pos.top, left: pos.left, minWidth: pos.minWidth }}
    >
      {items.map((name, i) => (
        <li
          key={name}
          className={`var-popover-item${i === selectedIdx ? ' var-popover-item--active' : ''}`}
          role="option"
          aria-selected={i === selectedIdx}
          // mousedown instead of click so it fires before the input's onBlur
          onMouseDown={(e) => {
            e.preventDefault();
            onSelect(name);
          }}
        >
          <span className="var-popover-braces">{'{'+'{'}</span>
          <span className="var-popover-name">{name}</span>
          <span className="var-popover-braces">{'}'+'}'}</span>
        </li>
      ))}
    </ul>,
    document.body
  );
};

export default VarPopover;
