import { useMemo, useState } from 'react';
import {
  ResponsiveContainer,
  ComposedChart,
  Area,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
} from 'recharts';
import { TrendingDown, TrendingUp, Minus, Activity } from 'lucide-react';
import { getMoroccoNow } from '../../lib/timeUtils';
import { extractPainDayKey } from '../../lib/exercisesService';

export interface PainLogEntry {
  id?: string;
  score: number;
  date: string;
  note?: string;
  updatedAt?: number;
}

interface PainEvolutionChartProps {
  logs: PainLogEntry[];
  daysCount?: number;
  className?: string;
}

function formatDayMetadata(dateStr: string): { label: string; fullDate: string; dateObj: Date } {
  const parts = dateStr.split('-');
  const y = parseInt(parts[0], 10) || 2026;
  const m = (parseInt(parts[1], 10) || 1) - 1;
  const d = parseInt(parts[2], 10) || 1;
  const dateObj = new Date(y, m, d, 12, 0, 0);
  const label = `${String(d).padStart(2, '0')}/${String(m + 1).padStart(2, '0')}`;
  const fullDate = dateObj.toLocaleDateString('fr-FR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
  return { label, fullDate, dateObj };
}

export function PainEvolutionChart({
  logs,
  daysCount = 30,
  className = '',
}: PainEvolutionChartProps) {
  const [selectedRange, setSelectedRange] = useState<number>(daysCount);

  // Generate chart data for the selected range while always preserving the exact dates entered by the patient
  const { chartData, visibleTicks, stats } = useMemo(() => {
    const days = selectedRange;
    const now = getMoroccoNow();
    const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

    // Sort logs so the newest update for any given day wins
    const sortedLogs = [...(logs || [])].sort((a, b) => {
      const tsA = a.updatedAt || new Date(a.date || 0).getTime();
      const tsB = b.updatedAt || new Date(b.date || 0).getTime();
      return tsB - tsA;
    });

    // Map logs by exact calendar date (YYYY-MM-DD)
    const logsByDate = new Map<string, PainLogEntry>();
    sortedLogs.forEach((log) => {
      if (!log || !log.date) return;
      const datePart = extractPainDayKey(log.date);
      if (!logsByDate.has(datePart)) {
        logsByDate.set(datePart, log);
      }
    });

    // Anchor end date to max(todayStr, latest recorded evaluation date) so future/midnight dates are never clipped
    const allRecordedDates = Array.from(logsByDate.keys()).sort();
    let endRefDate = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 12, 0, 0);
    if (allRecordedDates.length > 0) {
      const latestRecordedStr = allRecordedDates[allRecordedDates.length - 1];
      if (latestRecordedStr > todayStr) {
        endRefDate = formatDayMetadata(latestRecordedStr).dateObj;
      }
    }

    const dayMap = new Map<
      string,
      {
        dateStr: string;
        label: string;
        fullDate: string;
        score: number | null;
        displayScore: number | null;
        note?: string;
      }
    >();

    // Populate the N-day window ending at endRefDate
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date(endRefDate.getFullYear(), endRefDate.getMonth(), endRefDate.getDate() - i, 12, 0, 0);
      const yyyy = d.getFullYear();
      const mm = String(d.getMonth() + 1).padStart(2, '0');
      const dd = String(d.getDate()).padStart(2, '0');
      const dateStr = `${yyyy}-${mm}-${dd}`;
      const { label, fullDate } = formatDayMetadata(dateStr);
      const entry = logsByDate.get(dateStr);
      const score = entry !== undefined && !isNaN(Number(entry.score)) ? Number(entry.score) : null;

      dayMap.set(dateStr, {
        dateStr,
        label,
        fullDate,
        score,
        displayScore: score,
        note: entry?.note,
      });
    }

    // Ensure EVERY recorded pain evaluation date is present with its TRUE date (never overwrite today's date with an older log!)
    for (const [dateStr, entry] of logsByDate.entries()) {
      if (!dayMap.has(dateStr)) {
        const { label, fullDate } = formatDayMetadata(dateStr);
        const score = !isNaN(Number(entry.score)) ? Number(entry.score) : null;
        dayMap.set(dateStr, {
          dateStr,
          label,
          fullDate,
          score,
          displayScore: score,
          note: entry?.note,
        });
      }
    }

    const result = Array.from(dayMap.values()).sort((a, b) => a.dateStr.localeCompare(b.dateStr));

    let totalScore = 0;
    let count = 0;
    let minScore = 10;
    let maxScore = 0;
    const scoredDays: Array<{ date: string; label: string; score: number; index: number }> = [];

    result.forEach((item, idx) => {
      if (item.score !== null && !isNaN(item.score)) {
        totalScore += item.score;
        count++;
        if (item.score < minScore) minScore = item.score;
        if (item.score > maxScore) maxScore = item.score;
        scoredDays.push({ date: item.dateStr, label: item.label, score: item.score, index: idx });
      }
    });

    // Build X-axis ticks: ALWAYS include every date where the patient recorded a pain evaluation,
    // plus non-overlapping reference dates so the patient's exact dates are 100% visible on the axis.
    const scoredIndices = scoredDays.map((s) => s.index);
    const minGap = days <= 7 ? 1 : days <= 14 ? 2 : 4;
    const step = days <= 7 ? 1 : days <= 14 ? 2 : 5;
    const tickSet = new Set<string>();

    // 1. Add all evaluated dates first (authoritative)
    for (const s of scoredDays) {
      tickSet.add(s.date);
    }

    // 2. Add background reference dates only if they don't collide with evaluated dates
    result.forEach((item, idx) => {
      const isEdge = idx === 0 || idx === result.length - 1;
      const isStep = idx % step === 0;
      if (isEdge || isStep) {
        const tooCloseToScored = scoredIndices.some((sIdx) => sIdx !== idx && Math.abs(sIdx - idx) < minGap);
        if (!tooCloseToScored) {
          tickSet.add(item.dateStr);
        }
      }
    });

    const computedTicks = result.filter((r) => tickSet.has(r.dateStr)).map((r) => r.dateStr);

    // Calculate trend between first recorded score and latest score
    let trendDiff = 0;
    if (scoredDays.length >= 2) {
      trendDiff = scoredDays[scoredDays.length - 1].score - scoredDays[0].score;
    }

    const average = count > 0 ? (totalScore / count).toFixed(1) : null;

    return {
      chartData: result,
      visibleTicks: computedTicks,
      stats: {
        count,
        average,
        min: count > 0 ? minScore : null,
        max: count > 0 ? maxScore : null,
        trendDiff,
        firstScore: scoredDays[0]?.score ?? null,
        latestScore: scoredDays[scoredDays.length - 1]?.score ?? null,
        latestDateLabel: scoredDays[scoredDays.length - 1]?.label ?? null,
      },
    };
  }, [logs, selectedRange]);

  const getScoreColor = (score: number) => {
    if (score <= 2) return '#10b981'; // Emerald
    if (score <= 4) return '#84cc16'; // Lime
    if (score <= 6) return '#f59e0b'; // Amber
    if (score <= 8) return '#f97316'; // Orange
    return '#ef4444'; // Rose
  };

  const getScoreLabel = (score: number) => {
    if (score <= 2) return 'Très légère';
    if (score <= 4) return 'Légère / Modérée';
    if (score <= 6) return 'Modérée';
    if (score <= 8) return 'Intense';
    return 'Insupportable';
  };

  // Custom Tooltip
  const CustomTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload;
      if (data.score === null) {
        return (
          <div className="bg-slate-900/95 text-white p-2.5 rounded-xl shadow-xl text-xs border border-slate-700/50">
            <p className="font-semibold text-slate-300 capitalize">{data.fullDate}</p>
            <p className="text-slate-400 text-[11px] mt-0.5">Aucune évaluation ce jour-là</p>
          </div>
        );
      }

      const scoreColor = getScoreColor(data.score);
      const scoreLabel = getScoreLabel(data.score);

      return (
        <div className="bg-slate-900/95 text-white p-3 rounded-xl shadow-xl text-xs border border-slate-700/50 min-w-[170px]">
          <p className="font-semibold text-slate-300 capitalize text-[11px] mb-1.5 pb-1 border-b border-slate-800">
            {data.fullDate}
          </p>
          <div className="flex items-center justify-between gap-2">
            <span className="text-slate-400">Niveau EVA :</span>
            <span className="font-black text-sm" style={{ color: scoreColor }}>
              {data.score} / 10
            </span>
          </div>
          <div className="flex items-center gap-1.5 mt-1">
            <span
              className="w-2 h-2 rounded-full flex-shrink-0"
              style={{ backgroundColor: scoreColor }}
            />
            <span className="text-[11px] text-slate-200 font-medium">{scoreLabel}</span>
          </div>
          {data.note && (
            <p className="mt-2 pt-1.5 border-t border-slate-800/80 text-[11px] text-slate-300 italic leading-snug">
              « {data.note} »
            </p>
          )}
        </div>
      );
    }
    return null;
  };

  return (
    <div className={`space-y-4 ${className}`}>
      {/* Header with Stats & Filter */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-2 border-b border-slate-100">
        <div className="flex items-center gap-2">
          <Activity className="h-4 w-4 text-mint-600 flex-shrink-0" />
          <span className="text-xs font-bold text-slate-700 uppercase tracking-wider">
            Évolution sur {selectedRange} jours
          </span>
          <span className="text-xs bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full font-semibold">
            {stats.count} note{stats.count > 1 ? 's' : ''}
          </span>
        </div>

        {/* Range Selector */}
        <div className="flex items-center gap-1 bg-slate-100 p-0.5 rounded-lg text-xs self-start sm:self-auto">
          {[7, 14, 30].map((days) => (
            <button
              key={days}
              type="button"
              onClick={() => setSelectedRange(days)}
              className={`px-2.5 py-1 rounded-md font-medium transition-all ${
                selectedRange === days
                  ? 'bg-white text-slate-900 shadow-sm font-bold'
                  : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              {days}j
            </button>
          ))}
        </div>
      </div>

      {/* Metrics Row */}
      {stats.count > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
          <div className="bg-slate-50 p-2.5 rounded-xl border border-slate-100">
            <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block">
              Moyenne
            </span>
            <span className="text-base font-black text-slate-800">{stats.average} / 10</span>
          </div>

          <div className="bg-slate-50 p-2.5 rounded-xl border border-slate-100">
            <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block">
              Minimum
            </span>
            <span className="text-base font-black text-emerald-600">{stats.min} / 10</span>
          </div>

          <div className="bg-slate-50 p-2.5 rounded-xl border border-slate-100">
            <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block">
              Maximum
            </span>
            <span className="text-base font-black text-rose-600">{stats.max} / 10</span>
          </div>

          <div className="bg-slate-50 p-2.5 rounded-xl border border-slate-100">
            <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block">
              Tendance
            </span>
            <div className="flex items-center gap-1 mt-0.5">
              {stats.trendDiff < 0 ? (
                <span className="inline-flex items-center gap-1 font-bold text-emerald-600">
                  <TrendingDown className="h-3.5 w-3.5" />
                  {stats.trendDiff} pts
                </span>
              ) : stats.trendDiff > 0 ? (
                <span className="inline-flex items-center gap-1 font-bold text-rose-600">
                  <TrendingUp className="h-3.5 w-3.5" />+{stats.trendDiff} pts
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 font-bold text-slate-600">
                  <Minus className="h-3.5 w-3.5" />
                  Stable
                </span>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Recharts ComposedChart (Area + Line) */}
      <div className="w-full h-60 sm:h-64 bg-slate-50/50 rounded-xl p-2 border border-slate-100/80">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={chartData} margin={{ top: 28, right: 24, left: -20, bottom: 8 }}>
            <defs>
              <linearGradient id="painAreaGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#0d9488" stopOpacity={0.22} />
                <stop offset="95%" stopColor="#0d9488" stopOpacity={0.02} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
            <XAxis
              dataKey="dateStr"
              ticks={visibleTicks}
              stroke="#94a3b8"
              fontSize={10}
              tickLine={false}
              interval={0}
              tick={(props: any) => {
                const { x, y, payload } = props;
                const dStr = String(payload?.value || '');
                const matchedItem = chartData.find((c) => c.dateStr === dStr);
                const labelText = matchedItem ? matchedItem.label : formatDayMetadata(dStr).label;
                const hasScore = matchedItem && matchedItem.score !== null;
                return (
                  <g transform={`translate(${x},${y})`}>
                    <text
                      x={0}
                      y={0}
                      dy={12}
                      textAnchor="middle"
                      fill={hasScore ? '#0f172a' : '#94a3b8'}
                      fontSize={hasScore ? 10.5 : 10}
                      fontWeight={hasScore ? 800 : 500}
                    >
                      {labelText}
                    </text>
                  </g>
                );
              }}
            />
            <YAxis
              domain={[0, 10]}
              ticks={[0, 2, 4, 6, 8, 10]}
              stroke="#94a3b8"
              fontSize={10}
              tickLine={false}
              axisLine={false}
            />
            <Tooltip content={<CustomTooltip />} />

            {/* Qualitative Clinical Reference Lines */}
            <ReferenceLine
              y={3}
              stroke="#10b981"
              strokeDasharray="4 4"
              strokeOpacity={0.5}
            />
            <ReferenceLine
              y={6}
              stroke="#f59e0b"
              strokeDasharray="4 4"
              strokeOpacity={0.5}
            />
            <ReferenceLine
              y={8}
              stroke="#ef4444"
              strokeDasharray="4 4"
              strokeOpacity={0.5}
            />

            {/* Horizontal level line when exactly 1 evaluation is recorded */}
            {stats.count === 1 && stats.latestScore !== null && (
              <ReferenceLine
                y={stats.latestScore}
                stroke="#0d9488"
                strokeWidth={2}
                strokeDasharray="6 4"
                strokeOpacity={0.65}
              />
            )}

            <Area
              type="monotone"
              dataKey="displayScore"
              stroke="none"
              fill="url(#painAreaGradient)"
              connectNulls={true}
              isAnimationActive={false}
            />

            {/* Pain Evolution Curve */}
            <Line
              type="monotone"
              dataKey="displayScore"
              name="Douleur"
              stroke="#0d9488"
              strokeWidth={3}
              connectNulls={true}
              isAnimationActive={false}
              dot={(props: any) => {
                const { cx, cy, payload, index } = props;
                if (payload.score === null || cx === undefined || cy === undefined) {
                  return <g key={`dot-null-${index}`} />;
                }
                const color = getScoreColor(payload.score);
                return (
                  <g key={`dot-${payload.dateStr}-${index}`}>
                    <circle
                      cx={cx}
                      cy={cy}
                      r={6.5}
                      fill={color}
                      stroke="#ffffff"
                      strokeWidth={2}
                    />
                    <text
                      x={cx}
                      y={cy - 17}
                      textAnchor="middle"
                      fill="#0f172a"
                      fontSize={10}
                      fontWeight="800"
                    >
                      {payload.score}/10
                    </text>
                    <text
                      x={cx}
                      y={cy - 8}
                      textAnchor="middle"
                      fill="#0f766e"
                      fontSize={8.5}
                      fontWeight="700"
                    >
                      {payload.label}
                    </text>
                  </g>
                );
              }}
              activeDot={(props: any) => {
                const { cx, cy, payload, index } = props;
                if (payload.score === null || cx === undefined || cy === undefined) {
                  return <g key={`activedot-null-${index}`} />;
                }
                return (
                  <circle
                    key={`activedot-${payload.dateStr}-${index}`}
                    cx={cx}
                    cy={cy}
                    r={8}
                    fill="#0f766e"
                    stroke="#ffffff"
                    strokeWidth={2}
                  />
                );
              }}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      {/* Legend / Clinical Thresholds Footer */}
      <div className="flex flex-wrap items-center justify-between text-[11px] text-slate-400 pt-1 px-1">
        <div className="flex items-center gap-4 flex-wrap">
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 inline-block" />
            0-3 : Légère
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-amber-500 inline-block" />
            4-6 : Modérée
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-orange-500 inline-block" />
            7-8 : Intense
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-rose-500 inline-block" />
            9-10 : Sévère
          </span>
        </div>
        <span className="text-[10px] text-slate-400 italic">Échelle Visuelle Analogique (EVA)</span>
      </div>
    </div>
  );
}
