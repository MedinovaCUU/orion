import { useEffect, useRef } from 'react';

/** Conecta tarjetas con la proyección real de los conjuntos, también durante giro y despiece. */
export default function AlarmSpatialConnectors({ signature }: { signature: string }) {
  const svgRef = useRef<SVGSVGElement>(null);
  useEffect(() => {
    const svg = svgRef.current;
    const stage = svg?.closest('.alarm-spatial__stage');
    if (!svg || !(stage instanceof HTMLElement)) return;
    const paths = new Map<string, SVGPathElement>();
    const draw = () => {
      const rect = stage.getBoundingClientRect();
      const host = stage.querySelector('.ba400-canvas');
      if (!host) return;
      const hostRect = host.getBoundingClientRect();
      const used = new Set<string>();
      // Un solo recorrido de marcadores por dibujo, en vez de una búsqueda por cada tarjeta y conjunto.
      const markersByPart = new Map<string, HTMLElement>();
      host.querySelectorAll<HTMLElement>('.monitor-alarm-anchor').forEach(item => { if (item.dataset.partId) markersByPart.set(item.dataset.partId, item); });
      stage.querySelectorAll<HTMLElement>('.alarm-spatial__event[data-part], .alarm-spatial__event [data-antecedent-parts]').forEach(card => {
        const parent = card.closest<HTMLElement>('.alarm-spatial__event')!;
        for (const partId of (card.dataset.antecedentParts || card.dataset.parts || card.dataset.part || '').split(' ').filter(Boolean)) {
          const key = `${parent.dataset.index}:${card.dataset.antecedentIndex ?? 'active'}:${partId}`;
          const marker = markersByPart.get(partId);
          if (!marker || marker.hidden || !card.offsetWidth) continue;
          const markerX = parseFloat(marker.style.left);
          const markerY = parseFloat(marker.style.top);
          if (!Number.isFinite(markerX) || !Number.isFinite(markerY)) continue;
          used.add(key);
          let path = paths.get(key);
          if (!path) { path = document.createElementNS('http://www.w3.org/2000/svg', 'path'); svg.append(path); paths.set(key, path); }
          const box = card.getBoundingClientRect();
          const left = parent.dataset.side === 'left';
          const x = (left ? box.right : box.left) - rect.left;
          const y = box.top - rect.top + box.height / 2;
          const targetX = hostRect.left - rect.left + markerX;
          const targetY = hostRect.top - rect.top + markerY;
          const elbow = x + (left ? 22 : -22);
          path.setAttribute('d', `M ${x} ${y} H ${elbow} L ${targetX} ${targetY}`);
          path.dataset.tone = card.dataset.tone;
        }
      });
      paths.forEach((path, key) => { if (!used.has(key)) { path.remove(); paths.delete(key); } });
    };
    // El motor ya actualiza las etiquetas al renderizar. Las mutaciones de un mismo frame se agrupan en un solo dibujo.
    let frame = 0;
    const schedule = () => {
      if (frame) return;
      frame = requestAnimationFrame(() => { frame = 0; draw(); });
    };
    const observer = new MutationObserver(schedule);
    observer.observe(stage, { subtree: true, attributes: true, attributeFilter: ['style', 'hidden'], childList: false });
    const resize = new ResizeObserver(schedule); resize.observe(stage);
    draw();
    return () => { observer.disconnect(); resize.disconnect(); if (frame) cancelAnimationFrame(frame); svg.replaceChildren(); };
  }, [signature]);
  return <svg ref={svgRef} className="alarm-spatial__connectors" aria-hidden="true" />;
}
