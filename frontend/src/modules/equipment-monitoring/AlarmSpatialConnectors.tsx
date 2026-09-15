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
      stage.querySelectorAll<HTMLElement>('.alarm-spatial__event[data-part]').forEach(card => {
        const key = card.dataset.index!;
        const marker = [...host.querySelectorAll<HTMLElement>('.monitor-alarm-anchor')].find(item => item.dataset.partId === card.dataset.part);
        if (!marker || marker.hidden || !card.offsetWidth) return;
        const markerX = parseFloat(marker.style.left);
        const markerY = parseFloat(marker.style.top);
        if (!Number.isFinite(markerX) || !Number.isFinite(markerY)) return;
        used.add(key);
        let path = paths.get(key);
        if (!path) { path = document.createElementNS('http://www.w3.org/2000/svg', 'path'); svg.append(path); paths.set(key, path); }
        const box = card.getBoundingClientRect();
        const left = card.dataset.side === 'left';
        const x = (left ? box.right : box.left) - rect.left;
        const y = box.top - rect.top + box.height / 2;
        const targetX = hostRect.left - rect.left + markerX;
        const targetY = hostRect.top - rect.top + markerY;
        const elbow = x + (left ? 22 : -22);
        path.setAttribute('d', `M ${x} ${y} H ${elbow} L ${targetX} ${targetY}`);
        path.dataset.tone = card.dataset.tone;
      });
      paths.forEach((path, key) => { if (!used.has(key)) { path.remove(); paths.delete(key); } });
    };
    // El motor ya actualiza las etiquetas al renderizar. No añadimos otro bucle continuo de animación.
    const observer = new MutationObserver(draw);
    observer.observe(stage, { subtree: true, attributes: true, attributeFilter: ['style', 'hidden'], childList: false });
    const resize = new ResizeObserver(draw); resize.observe(stage);
    draw();
    return () => { observer.disconnect(); resize.disconnect(); svg.replaceChildren(); };
  }, [signature]);
  return <svg ref={svgRef} className="alarm-spatial__connectors" aria-hidden="true" />;
}
