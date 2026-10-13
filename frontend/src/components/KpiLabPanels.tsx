import type { ReactNode, RefObject } from 'react';
import type * as echarts from 'echarts/core';
import { downloadChart, useEChart, type ChartHandlers, type ChartOption } from './kpiEcharts';

// Panels shared by the time and parts labs: a segmented control and a chart card with PNG download.
export function Segmented<T extends string>({ label, value, options, onChange }: { label: string; value: T; options: Array<[T, string]>; onChange: (value: T) => void }) {
  return <div className="kpi-lab-seg" role="group" aria-label={label}>
    {options.map(([key, text]) => <button key={key} type="button" aria-pressed={value === key} onClick={() => onChange(key)}>{text}</button>)}
  </div>;
}

export function ChartPanel({ title, note, option, handlers, height = 290, file, wide, controls, footer, label }: {
  title: string; note?: ReactNode; option: ChartOption | null; handlers?: ChartHandlers; height?: number; file: string; wide?: boolean;
  controls?: (chart: RefObject<echarts.ECharts | null>) => ReactNode; footer?: ReactNode; label: string;
}) {
  const { ref, chart } = useEChart(option, handlers);
  return <figure className={`kpi-lab-panel${wide ? ' is-wide' : ''}`}>
    <figcaption>
      <div><strong>{title}</strong>{note && <span>{note}</span>}</div>
      <div className="kpi-lab-tools">{controls?.(chart)}
        <button type="button" className="kpi-lab-png" onClick={() => downloadChart(chart.current, file)} aria-label={`Descargar «${title}» como imagen`} title="Descargar imagen">PNG</button>
      </div>
    </figcaption>
    <div ref={ref} className="kpi-lab-canvas" style={{ height }} role="img" aria-label={label} />
    {footer}
  </figure>;
}
