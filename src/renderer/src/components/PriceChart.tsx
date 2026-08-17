import { useEffect, useRef } from 'react';
import {
  CandlestickSeries,
  ColorType,
  createChart,
  type CandlestickData,
  type UTCTimestamp,
} from 'lightweight-charts';
import type { Candle } from '../../../shared/types';

export function PriceChart({ candles }: { candles: Candle[] }) {
  const container = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!container.current) return;
    const chart = createChart(container.current, {
      autoSize: true,
      layout: {
        background: { type: ColorType.Solid, color: '#0b111b' },
        textColor: '#8290a7',
        fontFamily: 'Inter, Segoe UI, sans-serif',
      },
      grid: {
        vertLines: { color: '#17202d' },
        horzLines: { color: '#17202d' },
      },
      rightPriceScale: { borderColor: '#263243' },
      timeScale: { borderColor: '#263243', timeVisible: true },
      crosshair: {
        vertLine: { color: '#64748b' },
        horzLine: { color: '#64748b' },
      },
    });
    const series = chart.addSeries(CandlestickSeries, {
      upColor: '#20c997',
      downColor: '#ff5d73',
      borderUpColor: '#20c997',
      borderDownColor: '#ff5d73',
      wickUpColor: '#20c997',
      wickDownColor: '#ff5d73',
    });
    const data: CandlestickData<UTCTimestamp>[] = candles.map((candle) => ({
      time: Math.floor(new Date(candle.timestamp).getTime() / 1000) as UTCTimestamp,
      open: Number(candle.open),
      high: Number(candle.high),
      low: Number(candle.low),
      close: Number(candle.close),
    }));
    series.setData(data);
    chart.timeScale().fitContent();
    return () => chart.remove();
  }, [candles]);

  return <div className="price-chart" ref={container} />;
}
