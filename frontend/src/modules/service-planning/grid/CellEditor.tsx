import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { KeyboardEvent as ReactKeyboardEvent } from 'react';
import { createPortal } from 'react-dom';
import { normalizeText } from '../helpers/normalizeService';
import type { ColumnOption, GridColumn, ParseContext } from './planningColumns';
import type { FieldValue } from './planningRecord';

export type EditorMove = 'down' | 'up' | 'right' | 'left' | 'none';

interface CellEditorProps {
  column: GridColumn;
  value: FieldValue;
  /** Text typed to start editing (replaces the value); null when editing the existing value. */
  initialText: string | null;
  options: ColumnOption[];
  parseContext: ParseContext;
  getAnchor: () => HTMLElement | null;
  onCommit: (value: FieldValue, move: EditorMove) => void;
  onCancel: () => void;
}

const fold = (value: string) => normalizeText(value);
const MAX_OPTIONS = 60;

const rank = (options: ColumnOption[], query: string) => {
  const q = fold(query);
  if (!q) return options.slice(0, MAX_OPTIONS);
  const starts: ColumnOption[] = [];
  const contains: ColumnOption[] = [];
  for (const option of options) {
    const label = fold(`${option.label} ${option.value}`);
    const hint = fold(option.hint || '');
    if (fold(option.label).startsWith(q) || fold(option.value).startsWith(q)) starts.push(option);
    else if (q.split(' ').every((term) => label.includes(term) || hint.includes(term))) contains.push(option);
    if (starts.length >= MAX_OPTIONS) break;
  }
  return [...starts, ...contains].slice(0, MAX_OPTIONS);
};

function OptionList({ getAnchor, options, highlighted, selected, onPick }: { getAnchor: () => HTMLElement | null; options: ColumnOption[]; highlighted: number; selected: string[]; onPick: (option: ColumnOption) => void }) {
  const listRef = useRef<HTMLUListElement>(null);
  // Placed next to the cell once it is in the DOM (fixed, so the scrolling table never clips it).
  useLayoutEffect(() => {
    const anchor = getAnchor();
    const list = listRef.current;
    if (!anchor || !list) return;
    const rect = anchor.getBoundingClientRect();
    const below = window.innerHeight - rect.bottom;
    const openUp = below < 220 && rect.top > below;
    Object.assign(list.style, {
      display: '',
      position: 'fixed',
      left: `${Math.max(8, Math.min(rect.left, window.innerWidth - 300))}px`,
      minWidth: `${Math.max(rect.width, 220)}px`,
      top: openUp ? '' : `${rect.bottom + 2}px`,
      bottom: openUp ? `${window.innerHeight - rect.top + 2}px` : '',
    });
  }, [getAnchor, options.length]);
  useEffect(() => {
    listRef.current?.querySelector('[data-highlighted="true"]')?.scrollIntoView({ block: 'nearest' });
  }, [highlighted]);
  if (!options.length) return null;
  return createPortal(
    <ul ref={listRef} className="pgrid-options" role="listbox" style={{ display: 'none' }}>
      {options.map((option, index) => (
        <li
          key={`${option.value}-${index}`}
          role="option"
          aria-selected={selected.includes(option.value)}
          data-highlighted={index === highlighted}
          onMouseDown={(event) => {
            event.preventDefault();
            onPick(option);
          }}
        >
          <span>{option.label || 'Vacío'}</span>
          {option.hint ? <small>{option.hint}</small> : null}
          {selected.includes(option.value) ? <b aria-hidden="true">✓</b> : null}
        </li>
      ))}
    </ul>,
    document.body,
  );
}

export default function CellEditor({ column, value, initialText, options, parseContext, getAnchor, onCommit, onCancel }: CellEditorProps) {
  const isList = column.kind === 'people' || column.kind === 'multi';
  const hasOptions = hasOptionsFor(column);
  const currentText = Array.isArray(value)
    ? ''
    : column.kind === 'date'
      ? formatDateForEdit(String(value || ''))
      : hasOptionsFor(column) && !isList
        ? options.find((option) => option.value === value)?.label ?? String(value ?? '')
        : String(value ?? '');
  const [query, setQuery] = useState(initialText ?? currentText);
  const [chips, setChips] = useState<string[]>(Array.isArray(value) ? value : []);
  const [navIndex, setNavIndex] = useState<number | null>(null);
  const [error, setError] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const dateRef = useRef<HTMLInputElement>(null);
  const committed = useRef(false);
  const replaceMode = initialText !== null;

  const showingCurrent = !replaceMode && !isList && query === currentText;
  const ranked = useMemo(() => (hasOptions ? rank(options, showingCurrent ? '' : query) : []), [hasOptions, options, query, showingCurrent]);
  const autoHighlight = !column.freeText || column.kind === 'person' || column.kind === 'select';
  const defaultHighlight = () => {
    if (!ranked.length) return -1;
    if (!isList && (showingCurrent || !query)) return ranked.findIndex((option) => option.value === value);
    return autoHighlight && query ? 0 : -1;
  };
  // The highlighted option follows the typed text until the user moves through the list with the arrows.
  const navigated = navIndex !== null && navIndex < ranked.length;
  const highlighted = navigated ? navIndex : defaultHighlight();

  useEffect(() => {
    const input = inputRef.current;
    if (!input) return;
    input.focus();
    if (replaceMode) input.setSelectionRange(input.value.length, input.value.length);
    else input.select();
  }, [replaceMode]);

  const finish = (result: FieldValue, move: EditorMove) => {
    if (committed.current) return;
    committed.current = true;
    onCommit(result, move);
  };

  const commitText = (move: EditorMove) => {
    if (isList) {
      if (query.trim()) {
        const option = ranked[highlighted] || null;
        const parsed = option ? { value: [...chips, option.value] } : column.parse([...chips, query].join(', '), parseContext);
        if ('error' in parsed) return setError(parsed.error);
        return finish(Array.from(new Set(parsed.value as string[])), move);
      }
      return finish(chips, move);
    }
    if (hasOptions && highlighted >= 0 && ranked[highlighted] && (navigated || autoHighlight || showingCurrent)) {
      return finish(ranked[highlighted].value, move);
    }
    if (hasOptions && !column.freeText && column.kind !== 'date') {
      if (!query.trim() && !column.required) return finish('', move);
      if (query === currentText) return finish(value, move);
      return setError('Elige una de las opciones.');
    }
    const parsed = column.parse(query, parseContext);
    if ('error' in parsed) return setError(parsed.error);
    finish(parsed.value, move);
  };

  const onKeyDown = (event: ReactKeyboardEvent<HTMLInputElement>) => {
    event.stopPropagation();
    const key = event.key;
    if (key === 'Escape') {
      event.preventDefault();
      committed.current = true;
      onCancel();
      return;
    }
    if (key === 'Enter') {
      event.preventDefault();
      if (isList && query.trim() && ranked[highlighted]) {
        const option = ranked[highlighted];
        setChips((current) => (current.includes(option.value) ? current : [...current, option.value]));
        setQuery('');
        return;
      }
      commitText(event.shiftKey ? 'up' : 'down');
      return;
    }
    if (key === 'Tab') {
      event.preventDefault();
      commitText(event.shiftKey ? 'left' : 'right');
      return;
    }
    if ((key === 'ArrowDown' || key === 'ArrowUp') && hasOptions && (ranked.length > 0) && (navigated || query || isList || !replaceMode)) {
      event.preventDefault();
      setNavIndex(Math.max(0, Math.min(ranked.length - 1, highlighted + (key === 'ArrowDown' ? 1 : -1))));
      return;
    }
    if (replaceMode && !hasOptions && (key === 'ArrowDown' || key === 'ArrowUp' || key === 'ArrowLeft' || key === 'ArrowRight')) {
      event.preventDefault();
      commitText(({ ArrowDown: 'down', ArrowUp: 'up', ArrowLeft: 'left', ArrowRight: 'right' } as const)[key]);
      return;
    }
    if (key === 'Backspace' && isList && !query && chips.length) {
      event.preventDefault();
      setChips((current) => current.slice(0, -1));
    }
  };

  const optionLabel = (raw: string) => options.find((option) => option.value === raw)?.label || raw;

  return (
    <div className={`pgrid-editor pgrid-editor--${column.kind}`} onMouseDown={(event) => event.stopPropagation()}>
      {isList && chips.length ? (
        <span className="pgrid-editor__chips">
          {chips.map((chip) => (
            <button
              key={chip}
              type="button"
              tabIndex={-1}
              onMouseDown={(event) => {
                event.preventDefault();
                setChips((current) => current.filter((entry) => entry !== chip));
              }}
              aria-label={`Quitar ${optionLabel(chip)}`}
            >
              {optionLabel(chip)} ×
            </button>
          ))}
        </span>
      ) : null}
      <input
        ref={inputRef}
        aria-label={column.label}
        value={query}
        placeholder={column.kind === 'date' ? 'dd/mm/aaaa' : isList ? 'Escribe para agregar' : ''}
        onChange={(event) => {
          setQuery(event.target.value);
          setNavIndex(null);
          setError('');
        }}
        onKeyDown={onKeyDown}
        onBlur={() => {
          if (committed.current) return;
          // Clicking elsewhere keeps what was typed when it is valid, like a spreadsheet.
          if (isList) return finish(query.trim() && ranked[highlighted] ? [...chips, ranked[highlighted].value] : chips, 'none');
          if (hasOptions && !column.freeText && column.kind !== 'date' && query !== currentText) {
            const exact = options.find((option) => fold(option.label) === fold(query) || fold(option.value) === fold(query));
            if (exact) return finish(exact.value, 'none');
            committed.current = true;
            return onCancel();
          }
          const parsed = column.parse(query, parseContext);
          if ('error' in parsed) {
            committed.current = true;
            return onCancel();
          }
          finish(parsed.value, 'none');
        }}
      />
      {column.kind === 'date' ? (
        <>
          <button
            type="button"
            className="pgrid-editor__picker"
            tabIndex={-1}
            aria-label="Abrir calendario"
            onMouseDown={(event) => {
              event.preventDefault();
              const picker = dateRef.current;
              if (picker && 'showPicker' in picker) (picker as HTMLInputElement & { showPicker: () => void }).showPicker();
            }}
          >
            ▾
          </button>
          <input
            ref={dateRef}
            type="date"
            className="pgrid-editor__native-date"
            tabIndex={-1}
            aria-hidden="true"
            value={/^\d{4}-\d{2}-\d{2}$/.test(String(value)) ? String(value) : ''}
            onChange={(event) => finish(event.target.value, 'none')}
          />
        </>
      ) : null}
      {hasOptions ? (
        <OptionList
          getAnchor={getAnchor}
          options={ranked}
          highlighted={highlighted}
          selected={isList ? chips : [String(value)]}
          onPick={(option) => {
            if (isList) {
              setChips((current) => (current.includes(option.value) ? current.filter((entry) => entry !== option.value) : [...current, option.value]));
              setQuery('');
              inputRef.current?.focus();
              return;
            }
            finish(option.value, 'none');
          }}
        />
      ) : null}
      {error ? <span className="pgrid-editor__error" role="alert">{error}</span> : null}
    </div>
  );
}

function hasOptionsFor(column: GridColumn) {
  return Boolean(column.options) && column.kind !== 'text' && column.kind !== 'number' && column.kind !== 'date';
}

function formatDateForEdit(iso: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(iso) ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}` : iso;
}
