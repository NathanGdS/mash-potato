import { useCallback, useEffect, useRef, useState } from 'react';

export interface VarHoverTooltipState {
  varName: string;
  anchorRect: DOMRect;
  isPassword: boolean;
}

export interface UseVarHoverTooltipOptions {
  inputRef: React.RefObject<HTMLInputElement | HTMLTextAreaElement | null>;
  isPassword?: boolean;
}

export interface UseVarHoverTooltipReturn {
  wrapperProps: {
    onMouseMove: (e: React.MouseEvent) => void;
    onMouseLeave: (e: React.MouseEvent) => void;
  };
  tooltipState: VarHoverTooltipState | null;
  dismissTooltip: () => void;
  cancelDismiss: () => void;
}

export function useVarHoverTooltip({
  inputRef,
  isPassword = false,
}: UseVarHoverTooltipOptions): UseVarHoverTooltipReturn {
  const [tooltipState, setTooltipState] = useState<VarHoverTooltipState | null>(null);

  const dismissTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const cancelDismissTimer = useCallback(() => {
    if (dismissTimerRef.current !== null) {
      clearTimeout(dismissTimerRef.current);
      dismissTimerRef.current = null;
    }
  }, []);

  const dismissTooltip = useCallback(() => {
    cancelDismissTimer();
    setTooltipState(null);
  }, [cancelDismissTimer]);

  const onMouseMove = useCallback(
    (e: React.MouseEvent) => {
      cancelDismissTimer();

      const input = inputRef.current;
      if (!input) return;

      const prevPointerEvents = input.style.pointerEvents;
      input.style.pointerEvents = 'none';
      const hitElement = document.elementFromPoint(e.clientX, e.clientY);
      input.style.pointerEvents = prevPointerEvents;

      if (!(hitElement instanceof HTMLElement)) {
        setTooltipState(null);
        return;
      }

      const varName = hitElement.dataset['varName'];
      if (!varName) {
        setTooltipState(null);
        return;
      }

      const anchorRect = hitElement.getBoundingClientRect();

      setTooltipState({ varName, anchorRect, isPassword });
    },
    [inputRef, isPassword, cancelDismissTimer]
  );

  const onMouseLeave = useCallback(
    (_e: React.MouseEvent) => {
      cancelDismissTimer();
      dismissTimerRef.current = setTimeout(() => {
        setTooltipState(null);
        dismissTimerRef.current = null;
      }, 150);
    },
    [cancelDismissTimer]
  );

  useEffect(() => {
    return () => {
      if (dismissTimerRef.current !== null) {
        clearTimeout(dismissTimerRef.current);
      }
    };
  }, []);

  return {
    wrapperProps: { onMouseMove, onMouseLeave },
    tooltipState,
    dismissTooltip,
    cancelDismiss: cancelDismissTimer,
  };
}
