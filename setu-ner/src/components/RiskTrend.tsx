import { useMemo } from 'react'
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine } from 'recharts'
import { riskOf } from '../lib/risk'
import { SEGMENTS } from '../data/ner'
import type { Segment, Season, WeatherPoint } from '../types'

// Risk trend charts power the "weather-driven disruption" surface
// (PlanRoute + Track): the risk engine already returns a 24-point risk
// history over the PAST 48h (riskHistory, 2h steps) and a 24-point forecast
// over the NEXT 48h (trend). Both panels aggregate those arrays across a
// route's segments and render them as one compact recharts sparkline.

// Thresholds a configurable "proactive reroute" suggestion: when the route's
// forecast crosses this in the next 24–48h while the current status is still
// open, pages suggest acting before the corridor blocks.
export const REROUTE_LOOKAHEAD_RISK = 62

export type TrendRead = 'rising' | 'falling' | 'steady'

export interface TrendStats {
  segIds: string[]
  hist: number[] // past 48h avg risk, 2h steps (24 pts)
  fut: number[] // next 48h avg risk, 2h steps (24 pts)
  current: number // latest reading (now)
  futurePeak: number // worst average risk anywhere in the next 48h
  delta: number // next-24-48h average vs last-24h average
  read: TrendRead
}

const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0)
const zeros = (n: number) => Array.from({ length: n }, () => 0)

// Aggregate the engine's per-segment riskHistory/trend arrays along a route.
export function routeTrend(segIds: string[], weather: Record<string, WeatherPoint>, season: Season): TrendStats {
  const segs = segIds
    .map(id => SEGMENTS.find(s => s.id === id))
    .filter((s): s is Segment => Boolean(s))
  if (!segs.length) {
    return { segIds: [], hist: zeros(24), fut: zeros(24), current: 0, futurePeak: 0, delta: 0, read: 'steady' }
  }
  const h = zeros(24), f = zeros(24)
  for (const seg of segs) {
    const r = riskOf(seg, weather, season)
    for (let i = 0; i < 24; i++) {
      h[i] += r.riskHistory[i] / segs.length
      f[i] += r.trend[i] / segs.length
    }
  }
  const past24 = mean(h.slice(12)) // -24h..0
  const next24to48 = mean(f.slice(12)) // +24h..+48h
  const delta = next24to48 - past24
  const read: TrendRead = delta > 6 ? 'rising' : delta < -6 ? 'falling' : 'steady'
  return { segIds: segs.map(s => s.id), hist: h.map(Math.round), fut: f.map(Math.round), current: Math.round(h[23]), futurePeak: Math.round(Math.max(...f)), delta, read }
}

interface Row { label: string; past?: number; forecast?: number }

// Compact chart: past 48h (solid) + next 48h forecast (dashed), "now" dashed.
export default function RiskTrendChart({ stats, height = 96 }: { stats: TrendStats; height?: number }) {
  const data = useMemo<Row[]>(() => {
    const rows: Row[] = []
    // sample past at 4h steps: -48, -44, …, -4
    for (let k = 0; k < 12; k++) rows.push({ label: `${-48 + k * 4}h`, past: stats.hist[k * 2] })
    rows.push({ label: 'now', past: stats.hist[23], forecast: stats.fut[0] })
    // forecast +2, +6, …, +46, then close at +48
    for (let k = 1; k <= 12; k++) rows.push({ label: `+${k * 4}h`, forecast: stats.fut[Math.min(23, k * 2 - 1)] })
    rows.push({ label: '+48h', forecast: stats.fut[23] })
    return rows
  }, [stats])
  const readColor = stats.read === 'rising' ? '#D64545' : stats.read === 'falling' ? '#2E9E5B' : '#64748b'

  return (
    <div style={{ height }} className="w-full">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 6, right: 4, bottom: 0, left: 4 }}>
          <XAxis dataKey="label" tick={{ fontSize: 8, fill: '#94a3b8' }} tickLine={false} axisLine={false} interval={5} height={14} />
          <YAxis hide domain={[0, 100]} />
          <Tooltip contentStyle={{ fontSize: 10, borderRadius: 8 }} formatter={(v: number, name: string) => [v, name === 'past' ? 'past 48h risk' : 'forecast risk']} />
          <ReferenceLine x="now" stroke="#94a3b8" strokeDasharray="3 3" />
          <Line type="monotone" dataKey="past" name="past" stroke="#2E9E5B" strokeWidth={1.6} dot={false} isAnimationActive={false} />
          <Line type="monotone" dataKey="forecast" name="forecast" stroke="#E08E29" strokeWidth={1.6} strokeDasharray="4 3" dot={false} isAnimationActive={false} />
          <ReferenceLine y={REROUTE_LOOKAHEAD_RISK} stroke="#D64545" strokeDasharray="2 4" strokeOpacity={0.55} />
        </LineChart>
      </ResponsiveContainer>
      <div className="flex items-center gap-1.5 text-[10px] font-bold" style={{ color: readColor }}>
        <span className="inline-block w-2 h-2 rounded-full" style={{ background: readColor }} />
        {stats.read === 'rising' ? 'RISING — weather risk climbing over next 48h' : stats.read === 'falling' ? 'Falling — conditions easing' : 'Steady — no sharp change ahead'}
        {stats.futurePeak > 0 && <span className="text-slate-400 font-semibold">· peak {stats.futurePeak}/100</span>}
      </div>
    </div>
  )
}
