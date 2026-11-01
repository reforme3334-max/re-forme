import React, { useState, useEffect, useRef } from 'react';
import { CalendarDays, ChevronLeft, ChevronRight, Check, ChevronDown } from 'lucide-react';
import { formatSelectedMonthsLabel } from '../../lib/financeUtils';
import { getMoroccoNow } from '../../lib/timeUtils';

const MONTHS_FR = [
  { num: '01', short: 'Janv.', full: 'Janvier' },
  { num: '02', short: 'Févr.', full: 'Février' },
  { num: '03', short: 'Mars', full: 'Mars' },
  { num: '04', short: 'Avr.', full: 'Avril' },
  { num: '05', short: 'Mai', full: 'Mai' },
  { num: '06', short: 'Juin', full: 'Juin' },
  { num: '07', short: 'Juil.', full: 'Juillet' },
  { num: '08', short: 'Août', full: 'Août' },
  { num: '09', short: 'Sept.', full: 'Septembre' },
  { num: '10', short: 'Oct.', full: 'Octobre' },
  { num: '11', short: 'Nov.', full: 'Novembre' },
  { num: '12', short: 'Déc.', full: 'Décembre' },
];

const PRESET_GROUPS = [
  { label: 'T1', nums: ['01', '02', '03'], title: '1er Trimestre (Jan - Mars)' },
  { label: 'T2', nums: ['04', '05', '06'], title: '2ème Trimestre (Avr - Juin)' },
  { label: 'T3', nums: ['07', '08', '09'], title: '3ème Trimestre (Juil - Sept)' },
  { label: 'T4', nums: ['10', '11', '12'], title: '4ème Trimestre (Oct - Déc)' },
  { label: 'S1', nums: ['01', '02', '03', '04', '05', '06'], title: '1er Semestre' },
  { label: 'S2', nums: ['07', '08', '09', '10', '11', '12'], title: '2ème Semestre' },
];

interface MultiMonthPickerProps {
  selectedMonths: string[];
  onChange: (months: string[]) => void;
  openTrigger?: number;
}

export function MultiMonthPicker({
  selectedMonths,
  onChange,
  openTrigger = 0,
}: MultiMonthPickerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [viewYear, setViewYear] = useState<number>(() => getMoroccoNow().getFullYear());
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (openTrigger > 0) {
      setIsOpen(true);
    }
  }, [openTrigger]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

  const selectedSet = new Set(selectedMonths);

  const toggleMonth = (monthNum: string) => {
    const key = `${viewYear}-${monthNum}`;
    const next = new Set(selectedSet);
    if (next.has(key)) {
      next.delete(key);
    } else {
      next.add(key);
    }
    onChange(Array.from(next).sort());
  };

  const toggleGroup = (nums: string[]) => {
    const groupKeys = nums.map((n) => `${viewYear}-${n}`);
    const allSelected = groupKeys.every((k) => selectedSet.has(k));
    const next = new Set(selectedSet);
    if (allSelected) {
      groupKeys.forEach((k) => next.delete(k));
    } else {
      groupKeys.forEach((k) => next.add(k));
    }
    onChange(Array.from(next).sort());
  };

  const selectFullYear = () => {
    const yearKeys = MONTHS_FR.map((m) => `${viewYear}-${m.num}`);
    const allSelected = yearKeys.every((k) => selectedSet.has(k));
    const next = new Set(selectedSet);
    if (allSelected) {
      yearKeys.forEach((k) => next.delete(k));
    } else {
      yearKeys.forEach((k) => next.add(k));
    }
    onChange(Array.from(next).sort());
  };

  const selectCurrentMonthOnly = () => {
    const now = getMoroccoNow();
    const ym = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    setViewYear(now.getFullYear());
    onChange([ym]);
  };

  const summaryText =
    selectedMonths.length > 0 ? formatSelectedMonthsLabel(selectedMonths) : 'Choisir les mois...';

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        className="flex items-center gap-2 bg-white px-3 py-2 rounded-xl border border-primary-200 hover:border-primary-400 shadow-sm text-sm font-semibold text-slate-800 transition-colors cursor-pointer"
      >
        <CalendarDays className="h-4 w-4 text-primary-600 flex-shrink-0" />
        <span className="max-w-[180px] truncate">{summaryText}</span>
        {selectedMonths.length > 0 && (
          <span className="px-1.5 py-0.5 text-[11px] font-bold rounded-md bg-primary-50 text-primary-700 border border-primary-100">
            {selectedMonths.length}
          </span>
        )}
        <ChevronDown
          className={`h-3.5 w-3.5 text-slate-400 transition-transform ${
            isOpen ? 'rotate-180' : ''
          }`}
        />
      </button>

      {isOpen && (
        <div className="absolute right-0 mt-2 w-80 bg-white rounded-2xl shadow-xl border border-slate-200 p-4 z-50">
          {/* Year navigation */}
          <div className="flex items-center justify-between pb-3 mb-3 border-b border-slate-100">
            <button
              type="button"
              onClick={() => setViewYear((y) => y - 1)}
              className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-600 transition-colors cursor-pointer"
              title="Année précédente"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <div className="text-center">
              <span className="text-sm font-black text-slate-900">{viewYear}</span>
              <p className="text-[11px] text-slate-400 font-medium">
                Cliquez sur plusieurs mois
              </p>
            </div>
            <button
              type="button"
              onClick={() => setViewYear((y) => y + 1)}
              className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-600 transition-colors cursor-pointer"
              title="Année suivante"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>

          {/* Quick quarter / semester presets */}
          <div className="flex flex-wrap items-center gap-1.5 mb-3">
            {PRESET_GROUPS.map((g) => {
              const active = g.nums.every((n) => selectedSet.has(`${viewYear}-${n}`));
              return (
                <button
                  key={g.label}
                  type="button"
                  title={g.title}
                  onClick={() => toggleGroup(g.nums)}
                  className={`px-2 py-1 rounded-lg text-[11px] font-bold border transition-colors cursor-pointer ${
                    active
                      ? 'bg-primary-600 text-white border-primary-600'
                      : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'
                  }`}
                >
                  {g.label}
                </button>
              );
            })}
            <button
              type="button"
              onClick={selectFullYear}
              className={`px-2 py-1 rounded-lg text-[11px] font-bold border transition-colors cursor-pointer ml-auto ${
                MONTHS_FR.every((m) => selectedSet.has(`${viewYear}-${m.num}`))
                  ? 'bg-primary-600 text-white border-primary-600'
                  : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'
              }`}
            >
              Toute {viewYear}
            </button>
          </div>

          {/* 12 Months grid */}
          <div className="grid grid-cols-3 gap-2">
            {MONTHS_FR.map((m) => {
              const key = `${viewYear}-${m.num}`;
              const isSelected = selectedSet.has(key);
              return (
                <button
                  key={m.num}
                  type="button"
                  onClick={() => toggleMonth(m.num)}
                  title={`${m.full} ${viewYear}`}
                  className={`flex items-center justify-between px-2.5 py-2 rounded-xl text-xs font-semibold border transition-all cursor-pointer ${
                    isSelected
                      ? 'bg-primary-600 text-white border-primary-600 shadow-xs'
                      : 'bg-white text-slate-700 border-slate-200 hover:border-primary-300 hover:bg-primary-50/40'
                  }`}
                >
                  <span>{m.short}</span>
                  {isSelected && <Check className="h-3.5 w-3.5 flex-shrink-0" />}
                </button>
              );
            })}
          </div>

          {/* Footer actions */}
          <div className="mt-3 pt-3 border-t border-slate-100 flex items-center justify-between gap-2 text-xs">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={selectCurrentMonthOnly}
                className="text-slate-500 hover:text-slate-800 font-medium cursor-pointer"
              >
                Ce mois
              </button>
              {selectedMonths.length > 0 && (
                <>
                  <span className="text-slate-300">•</span>
                  <button
                    type="button"
                    onClick={() => onChange([])}
                    className="text-rose-600 hover:text-rose-700 font-medium cursor-pointer"
                  >
                    Effacer
                  </button>
                </>
              )}
            </div>
            <button
              type="button"
              onClick={() => setIsOpen(false)}
              className="px-3 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-white font-bold cursor-pointer"
            >
              Valider ({selectedMonths.length})
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
