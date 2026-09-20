import { useMemo, useState } from 'react';
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
} from 'recharts';
import { TrendingDown, TrendingUp, Minus, Calendar, Activity } from 'lucide-react';

export interface PainLogEntry {
  id?: string;
  score: number;
  date: string;
  note?: string;
}

interface PainEvolutionChartProps {
  logs: PainLogEntry[];
  daysCount?: number;
  className?: string;
}

export function PainEvolutionChart({
  logs,
  daysCount = 30,
  className = '',
}: PainEvolutionChartProps) {
  const [selectedRange, setSelectedRange] = useState<number>(daysCount);

  // Generate chart data for the selected range (default 30 days)
  const { chartData, stats } = useMemo(() => {
    const days = selectedRange;
    const now = new Date();
    const result: Array<{
      dateStr: string;
      label: string;
      fullDate: string;
      score: number | null;
      note?: string;
    }> = [];

    // Map logs by date (YYYY-MM-DD)
    const logsByDate = new Map<string, PainLogEntry>();
    logs.forEach((log) => {
      if (!log.date) return;
      const datePart = log.date.split('T')[0];
      // Keep the most recent or highest priority for the day
      if (!logsByDate.has(datePart)) {
        logsByDate.set(datePart, log);
      }
    });

    let totalScore = 0;
    let count = 0;
    let minScore = 10;
    let maxScore = 0;
    const scoredDays: Array<{ date: string; score: number }> = [];

    for (let i = days - 1; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(d.getDate() - i);
      const dateStr = d.toISOString().split('T')[0];
      const label = d.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' });
      const fullDate = d.toLocaleDateString('fr-FR', {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
      });

      const entry = logsByDate.get(dateStr);
      const score = entry !== undefined ? entry.score : null;

      if (score !== null) {
        totalScore += score;
        count++;
        if (score < minScore) minScore = score;
        if (score > maxScore) maxScore = score;
        scoredDays.push({ date: dateStr, score });
      }

      result.push({
        dateStr,
        label,
        fullDate,
        score,
        note: entry?.note,
      });
    }

    // Calculate trend between first recorded score and latest score
    let trendDiff = 0;
    if (scoredDays.length >= 2) {
      trendDiff = scoredDays[scoredDays.length - 1].score - scoredDays[0].score;
    }

    const average = count > 0 ? (totalScore / count).toFixed(1) : null;

    return {
      chartData: result,
      stats: {
        count,
        average,
        min: count > 0 ? minScore : null,
        max: count > 0 ? maxScore : null,
        trendDiff,
        firstScore: scoredDays[0]?.score ?? null,
        latestScore: scoredDays[scoredDays.length - 1]?.score ?? null,
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

      {/* Recharts LineChart */}
      <div className="w-full h-56 sm:h-64 bg-slate-50/50 rounded-xl p-2 border border-slate-100/80">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={chartData} margin={{ top: 15, right: 15, left: -20, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
            <XAxis
              dataKey="label"
              stroke="#94a3b8"
              fontSize={10}
              tickLine={false}
              interval={selectedRange <= 7 ? 0 : selectedRange <= 14 ? 1 : 4}
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
              strokeOpacity={0.6}
            />
            <ReferenceLine
              y={6}
              stroke="#f59e0b"
              strokeDasharray="4 4"
              strokeOpacity={0.6}
            />
            <ReferenceLine
              y={8}
              stroke="#ef4444"
              strokeDasharray="4 4"
              strokeOpacity={0.6}
            />

            {/* Pain Evolution Curve */}
            <Line
              type="monotone"
              dataKey="score"
              name="Douleur"
              stroke="#0d9488"
              strokeWidth={3}
              connectNulls={true}
              dot={(props: any) => {
                const { cx, cy, payload } = props;
                if (payload.score === null) return <g key={`dot-null-${cx}-${cy}`} />;
                const color = getScoreColor(payload.score);
                return (
                  <circle
                    key={`dot-${cx}-${cy}`}
                    cx={cx}
                    cy={cy}
                    r={4.5}
                    fill={color}
                    stroke="#ffffff"
                    strokeWidth={2}
                    className="shadow-sm transition-all hover:scale-125"
                  />
                );
              }}
              activeDot={{
                r: 7,
                fill: '#0f766e',
                stroke: '#ffffff',
                strokeWidth: 2,
              }}
            />
          </LineChart>
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
