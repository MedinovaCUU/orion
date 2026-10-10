import { useState, type ReactNode } from 'react';

/**
 * Sección del expediente con cabecera siempre visible (título, resumen de un renglón, lecturas)
 * y cuerpo plegable mediante el atributo `hidden`: lo plegado no se mide ni se pinta, pero sigue montado.
 */
export default function CollapsibleSection({
  id,
  className = '',
  title,
  summary,
  tone,
  head,
  defaultOpen = false,
  onOpen,
  children,
}: {
  id: string;
  className?: string;
  title: string;
  summary?: ReactNode;
  tone?: string;
  /** Lecturas que permanecen visibles con el cuerpo plegado (KPIs). */
  head?: ReactNode;
  defaultOpen?: boolean;
  onOpen?: (open: boolean) => void;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const bodyId = `${id}-body`;
  const toggle = () => {
    const next = !open;
    setOpen(next);
    onOpen?.(next);
  };

  return (
    <section id={id} className={`equipment-monitor__focus-section mon-collapsible ${className}`.trim()} data-open={open} data-tone={tone} data-dossier-section>
      <div className="mon-collapsible__head">
        <div className="mon-collapsible__title">
          <h4>{title}</h4>
          {summary ? <p className="mon-collapsible__summary">{summary}</p> : null}
        </div>
        <button type="button" className="mon-collapsible__toggle" aria-expanded={open} aria-controls={bodyId} onClick={toggle}>
          {open ? 'Plegar' : 'Desplegar'}
        </button>
      </div>
      {head}
      <div id={bodyId} className="mon-collapsible__body" hidden={!open}>
        {children}
      </div>
    </section>
  );
}
