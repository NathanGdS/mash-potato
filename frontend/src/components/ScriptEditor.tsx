import React, { useRef, useState, useCallback, useEffect } from 'react';
import { Wand2 } from 'lucide-react';
import { js as beautifyJs } from 'js-beautify';
import { highlightCode } from '../utils/codeHighlighter';
import DoRequestPopover from './DoRequestPopover';
import './ScriptEditor.css';

interface ScriptEditorProps {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
}

// Match doRequest(" or doRequest(' with optional partial path up to cursor
const DO_REQUEST_PATTERN = /doRequest\(\s*(["'])([^"']*?)$/;

const ScriptEditor: React.FC<ScriptEditorProps> = ({ value, onChange, placeholder }) => {
  const [formatError, setFormatError] = useState<string | null>(null);
  const [doRequestOpen, setDoRequestOpen] = useState(false);
  const [doRequestPartial, setDoRequestPartial] = useState('');
  const [cursorCoords, setCursorCoords] = useState<{ top: number; left: number } | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const mirrorRef = useRef<HTMLDivElement>(null);
  const cursorMirrorRef = useRef<HTMLDivElement>(null);

  const detectDoRequestPattern = useCallback((text: string, cursorPos: number) => {
    const textUpToCursor = text.substring(0, cursorPos);
    const match = textUpToCursor.match(DO_REQUEST_PATTERN);
    if (match) {
      setDoRequestPartial(match[2]);
      setDoRequestOpen(true);
    } else {
      setDoRequestOpen(false);
      setDoRequestPartial('');
    }
  }, []);

  // Calculate cursor coordinates for popover positioning
  useEffect(() => {
    if (!doRequestOpen || !textareaRef.current || !cursorMirrorRef.current) return;

    const textarea = textareaRef.current;
    const cursorPos = textarea.selectionStart;
    const textBeforeCursor = textarea.value.substring(0, cursorPos);

    const mirror = cursorMirrorRef.current;
    mirror.textContent = textBeforeCursor;

    const textareaRect = textarea.getBoundingClientRect();
    const mirrorRect = mirror.getBoundingClientRect();

    // Position below the current line (mirror height gives us the line bottom)
    const top = textareaRect.top + mirrorRect.height + 2;
    const left = textareaRect.left;

    setCursorCoords({ top, left });
  }, [doRequestOpen, doRequestPartial, value]);

  const handleFormat = () => {
    try {
      const formatted = beautifyJs(value, {
        indent_size: 2,
        indent_char: ' ',
        max_preserve_newlines: 2,
        preserve_newlines: true,
        brace_style: 'collapse',
        end_with_newline: false,
      });
      onChange(formatted);
      setFormatError(null);
    } catch (err) {
      setFormatError(err instanceof Error ? err.message : 'Formatting failed');
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    if (formatError !== null) {
      setFormatError(null);
    }
    onChange(e.target.value);
    detectDoRequestPattern(e.target.value, e.target.selectionStart);
  };

  const handleSelectPath = (fullPath: string, isRequest: boolean) => {
    if (!textareaRef.current) return;
    const textarea = textareaRef.current;
    const cursorPos = textarea.selectionStart;
    const textBefore = textarea.value.substring(0, cursorPos);

    const match = textBefore.match(DO_REQUEST_PATTERN);
    if (!match) {
      setDoRequestOpen(false);
      return;
    }

    const quoteChar = match[1];
    const insertStart = cursorPos - doRequestPartial.length;
    const insertEnd = cursorPos;

    const charAfter = textarea.value[cursorPos];
    let insertEndAdjusted = insertEnd;
    if (charAfter === quoteChar) {
      insertEndAdjusted = cursorPos + 1;
    }

    let insertValue = fullPath;
    if (isRequest) {
      insertValue = fullPath + quoteChar + ')';
    }

    const newValue = textarea.value.substring(0, insertStart) + insertValue + textarea.value.substring(insertEndAdjusted);
    onChange(newValue);
    setDoRequestOpen(false);
    setDoRequestPartial('');

    const newCursorPos = insertStart + insertValue.length;
    requestAnimationFrame(() => {
      textarea.selectionStart = newCursorPos;
      textarea.selectionEnd = newCursorPos;
      textarea.focus();
    });
  };

  const handleClosePopover = () => {
    setDoRequestOpen(false);
    setDoRequestPartial('');
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Tab') {
      e.preventDefault();
      const el = e.currentTarget;
      const start = el.selectionStart;
      const end = el.selectionEnd;
      const newValue = el.value.substring(0, start) + '  ' + el.value.substring(end);
      onChange(newValue);
      requestAnimationFrame(() => {
        el.selectionStart = start + 2;
        el.selectionEnd = start + 2;
      });
    }
    if (e.key === 'Escape' && doRequestOpen) {
      e.preventDefault();
      handleClosePopover();
    }
  };

  const syncScroll = () => {
    if (textareaRef.current && mirrorRef.current) {
      mirrorRef.current.scrollTop = textareaRef.current.scrollTop;
      mirrorRef.current.scrollLeft = textareaRef.current.scrollLeft;
    }
  };

  const highlightedHtml = highlightCode(value, 'JavaScript');

  return (
    <div className="script-editor-wrapper">
      <button
        className="script-editor-format-btn"
        onClick={handleFormat}
        title="Format Code"
        type="button"
      >
        <Wand2 size={14} />
      </button>
      <div className="script-editor-inner">
        <div
          ref={mirrorRef}
          className="script-editor-mirror"
          aria-hidden="true"
          dangerouslySetInnerHTML={{ __html: highlightedHtml }}
        />
        <textarea
          ref={textareaRef}
          className="script-editor-textarea"
          value={value}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          onScroll={syncScroll}
          onClick={() => {
            if (textareaRef.current) {
              detectDoRequestPattern(textareaRef.current.value, textareaRef.current.selectionStart);
            }
          }}
          placeholder={placeholder}
          spellCheck={false}
        />
      </div>
      {formatError !== null && (
        <p className="script-editor-format-error">{formatError}</p>
      )}
      <div
        ref={cursorMirrorRef}
        className="script-editor-cursor-mirror"
        aria-hidden="true"
      />
      <DoRequestPopover
        open={doRequestOpen}
        partialPath={doRequestPartial}
        cursorCoords={cursorCoords}
        onSelect={handleSelectPath}
        onClose={handleClosePopover}
      />
    </div>
  );
};

export default ScriptEditor;
