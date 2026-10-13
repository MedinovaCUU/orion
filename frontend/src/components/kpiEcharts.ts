// Apache ECharts, tree-shaken to the pieces the time and parts labs use, with the control center's ink and hairlines.
import { useEffect, useRef } from 'react';
import * as echarts from 'echarts/core';
import { BarChart, HeatmapChart, LineChart, SankeyChart, ScatterChart, TreemapChart } from 'echarts/charts';
import {
  AriaComponent, BrushComponent, DataZoomComponent, GridComponent, LegendComponent, MarkAreaComponent, MarkLineComponent, MarkPointComponent,
  TooltipComponent, VisualMapComponent,
} from 'echarts/components';
import { CanvasRenderer } from 'echarts/renderers';

echarts.use([BarChart, HeatmapChart, LineChart, SankeyChart, ScatterChart, TreemapChart, AriaComponent, BrushComponent, DataZoomComponent, GridComponent,
  LegendComponent, MarkAreaComponent, MarkLineComponent, MarkPointComponent, TooltipComponent, VisualMapComponent, CanvasRenderer]);

export { echarts };

export type ChartOption = echarts.EChartsCoreOption;
export interface ChartEvent {
  componentType?: string; seriesIndex?: number; seriesName?: string; dataIndex?: number; name?: string; value?: unknown; data?: unknown;
  batch?: Array<{ selected: Array<{ seriesIndex: number; dataIndex: number[] }> }>;
}
export type ChartHandlers = Partial<Record<'click' | 'brushselected', (event: ChartEvent, chart: echarts.ECharts) => void>>;

export const INK = '#193b49';
export const MUTED = '#5a7280';
export const LINE = '#dbe5eb';
export const GRID = '#edf1f4';

export const tooltipBase = {
  backgroundColor: '#fff', borderColor: '#cddce2', borderWidth: 1, padding: [10, 12],
  textStyle: { color: INK, fontSize: 11 }, extraCssText: 'box-shadow:0 10px 30px #12364118;border-radius:10px;',
};
export const axisLabel = { color: MUTED, fontSize: 10 };
export const splitLine = { lineStyle: { color: GRID } };
export const axisLine = { lineStyle: { color: '#cbd8de' } };

// One chart per element; options replace (not merge) so stale series never linger, and handlers always
// call the latest closure without re-binding.
export function useEChart(option: ChartOption | null, handlers?: ChartHandlers) {
  const ref = useRef<HTMLDivElement>(null);
  const chart = useRef<echarts.ECharts | null>(null);
  const latest = useRef(handlers);
  useEffect(() => { latest.current = handlers; });
  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    const instance = echarts.init(element, undefined, { renderer: 'canvas' });
    chart.current = instance;
    const fontFamily = getComputedStyle(element).fontFamily;
    instance.setOption({ textStyle: { fontFamily } });
    instance.on('click', event => { latest.current?.click?.(event as unknown as ChartEvent, instance); });
    instance.on('brushselected', (...args: unknown[]) => { latest.current?.brushselected?.(args[0] as ChartEvent, instance); });
    const observer = new ResizeObserver(() => instance.resize());
    observer.observe(element);
    return () => { observer.disconnect(); instance.dispose(); chart.current = null; };
  }, []);
  useEffect(() => {
    const instance = chart.current;
    if (!instance || !option) return;
    const fontFamily = ref.current ? getComputedStyle(ref.current).fontFamily : undefined;
    instance.setOption({ aria: { enabled: true }, animationDuration: 450, textStyle: { fontFamily }, ...option }, { notMerge: true });
  }, [option]);
  return { ref, chart };
}

export const downloadChart = (instance: echarts.ECharts | null, name: string) => {
  if (!instance) return;
  const anchor = document.createElement('a');
  anchor.href = instance.getDataURL({ type: 'png', pixelRatio: 2, backgroundColor: '#fff' });
  anchor.download = `${name}.png`;
  anchor.click();
};
