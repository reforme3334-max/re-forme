import React, { useState, useRef, useEffect } from 'react';
import { X, Check, Activity, Plus, Sparkles } from 'lucide-react';
import {
  STANDARD_MOTIFS,
  QUICK_MOTIFS,
  splitMotifs,
  combineMotifs,
  toggleMotif,
  isMotifSelected,
} from '../../lib/motifUtils';

interface DualMotifSelectorProps {
  value: string;
  onChange: (newValue: string) => void;
  availableMotifs?: string[];
  label?: string;
  required?: boolean;
  size?: 'sm' | 'md';
  themeColor?: 'primary' | 'indigo';
  placeholder?: string;
}

export function DualMotifSelector({
  value,
  onChange,
  availableMotifs,
  label = 'Motif(s) de la séance',
  required = false,
  size = 'md',
  themeColor = 'primary',
  placeholder = 'Sélectionner ou saisir jusqu’à 2 motifs...',
}: DualMotifSelectorProps) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const motifsList = availableMotifs && availableMotifs.length > 0 ? availableMotifs : STANDARD_MOTIFS;
  const currentParts = splitMotifs(value);

  // Close dropdown on click outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleToggle = (motif: string) => {
    const nextVal = toggleMotif(value, motif, 2);
    onChange(nextVal);
  };

  const handleRemovePart = (indexToRemove: number) => {
    const nextParts = currentParts.filter((_, idx) => idx !== indexToRemove);
    onChange(combineMotifs(nextParts));
  };

  const handleClearAll = () => {
    onChange('');
    setIsOpen(true);
    inputRef.current?.focus();
  };

  // Filter dropdown items
  const query = value.trim().toLowerCase();
  const filteredMotifs = motifsList.filter((m) => {
    if (!query) return true;
    // Don't hide items just because another motif is typed
    if (currentParts.length > 0) return true;
    return m.toLowerCase().includes(query);
  });

  const isPrimary = themeColor === 'primary';
  const activeBg = isPrimary ? 'bg-primary-600 text-white border-primary-600' : 'bg-indigo-600 text-white border-indigo-600';
  const tagBg = isPrimary ? 'bg-primary-50 text-primary-900 border-primary-200' : 'bg-indigo-50 text-indigo-900 border-indigo-200';
  const badgeColor =
    currentParts.length === 2
      ? 'bg-emerald-100 text-emerald-800 border-emerald-300'
      : currentParts.length === 1
      ? 'bg-amber-100 text-amber-800 border-amber-300'
      : 'bg-slate-100 text-slate-600 border-slate-200';

  return (
    <div ref={containerRef} className="space-y-1.5 w-full">
      {/* Header Label + Status Counter */}
      <div className="flex items-center justify-between">
        <label className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
          <Activity className="h-3.5 w-3.5 text-slate-400" />
          <span>{label}</span>
          {required && <span className="text-rose-500 font-bold">*</span>}
        </label>
        <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full border ${badgeColor} transition-all`}>
          {currentParts.length === 0 && '0 / 2 motif sélectionné'}
          {currentParts.length === 1 && '1 / 2 motif (cliquez pour ajouter un 2ème)'}
          {currentParts.length >= 2 && 'Séance double : 2 / 2 motifs'}
        </span>
      </div>

      {/* Selected Motifs Tags (when 1 or 2 are selected) */}
      {currentParts.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5 p-1.5 bg-slate-50/80 rounded-xl border border-slate-200">
          {currentParts.map((part, idx) => (
            <span
              key={`${part}-${idx}`}
              className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-bold border shadow-sm ${tagBg}`}
            >
              <span className="text-[10px] uppercase tracking-wider opacity-75">
                Motif {idx + 1} :
              </span>
              <span>{part}</span>
              <button
                type="button"
                onClick={() => handleRemovePart(idx)}
                title={`Retirer "${part}"`}
                className="hover:opacity-70 p-0.5 rounded cursor-pointer"
              >
                <X className="h-3 w-3" />
              </button>
            </span>
          ))}

          {currentParts.length === 1 && (
            <span className="text-[11px] text-slate-500 italic pl-1 flex items-center gap-1">
              <Plus className="h-3 w-3 text-slate-400" />
              Sélectionnez un 2ème motif ci-dessous (ex : Échographie)
            </span>
          )}
        </div>
      )}

      {/* Text Input with Dropdown Trigger */}
      <div className="relative">
        <input
          ref={inputRef}
          type="text"
          value={value}
          onChange={(e) => {
            onChange(e.target.value);
            setIsOpen(true);
          }}
          onFocus={() => setIsOpen(true)}
          placeholder={placeholder}
          required={required}
          className={`w-full rounded-xl border border-slate-200 bg-white font-medium text-slate-900 focus:outline-none transition-all ${
            size === 'sm'
              ? 'px-3 py-1.5 pr-8 text-xs'
              : 'px-3.5 py-2.5 pr-9 text-sm'
          } ${
            isPrimary
              ? 'focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500'
              : 'focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500'
          }`}
        />

        {value && (
          <button
            type="button"
            onClick={handleClearAll}
            title="Effacer tout"
            className="absolute inset-y-0 right-0 pr-2.5 flex items-center text-slate-400 hover:text-slate-600 cursor-pointer"
          >
            <X className="h-4 w-4" />
          </button>
        )}

        {/* Dropdown Menu */}
        {isOpen && (
          <div className="absolute z-50 w-full mt-1 bg-white border border-slate-200 rounded-xl shadow-xl max-h-56 overflow-y-auto divide-y divide-slate-100">
            <div className="p-2 bg-slate-50/90 text-[11px] font-semibold text-slate-500 flex items-center justify-between border-b border-slate-200">
              <span>Cliquez pour cocher jusqu'à 2 motifs</span>
              <span>{currentParts.length}/2</span>
            </div>
            {filteredMotifs.map((m) => {
              const active = isMotifSelected(value, m);
              const isEcho = m.toLowerCase().includes('échographie') || m.toLowerCase().includes('echographie');
              return (
                <div
                  key={m}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    handleToggle(m);
                  }}
                  className={`p-2.5 hover:bg-slate-50 cursor-pointer text-xs font-medium flex items-center justify-between transition-colors ${
                    active
                      ? isPrimary
                        ? 'bg-primary-50 text-primary-900 font-bold'
                        : 'bg-indigo-50 text-indigo-900 font-bold'
                      : 'text-slate-700'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <div
                      className={`h-4 w-4 rounded border flex items-center justify-center transition-all ${
                        active
                          ? isPrimary
                            ? 'bg-primary-600 border-primary-600 text-white'
                            : 'bg-indigo-600 border-indigo-600 text-white'
                          : 'border-slate-300 bg-white'
                      }`}
                    >
                      {active && <Check className="h-3 w-3 stroke-[3]" />}
                    </div>
                    <span>{m}</span>
                    {isEcho && (
                      <span className="px-1.5 py-0.2 rounded text-[10px] font-bold bg-sky-100 text-sky-800 border border-sky-200 flex items-center gap-0.5">
                        <Sparkles className="h-2.5 w-2.5" /> Nouveau
                      </span>
                    )}
                  </div>
                  {active && (
                    <span className="text-[10px] font-bold uppercase opacity-60">
                      Sélectionné
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Quick Selection Pills (Including Échographie) */}
      <div className="space-y-1 pt-0.5">
        <div className="flex items-center justify-between">
          <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">
            Sélection rapide (max 2) :
          </span>
          <span className="text-[10px] text-slate-400">
            {currentParts.length === 2 ? 'Remplacer le 2ème' : 'Combinable'}
          </span>
        </div>
        <div className="flex flex-wrap gap-1">
          {QUICK_MOTIFS.map((quickMotif) => {
            const active = isMotifSelected(value, quickMotif);
            const isEcho = quickMotif.toLowerCase().includes('échographie');
            return (
              <button
                key={quickMotif}
                type="button"
                onClick={() => handleToggle(quickMotif)}
                className={`px-2 py-0.5 rounded-lg text-xs font-semibold border transition-all cursor-pointer flex items-center gap-1 ${
                  active
                    ? activeBg + ' shadow-xs ring-2 ring-offset-1 ' + (isPrimary ? 'ring-primary-500' : 'ring-indigo-500')
                    : isEcho
                    ? 'bg-sky-50/80 hover:bg-sky-100 text-sky-900 border-sky-300 font-bold'
                    : 'bg-slate-50 hover:bg-slate-100 text-slate-700 hover:text-slate-900 border-slate-200'
                }`}
              >
                {active && <Check className="h-3 w-3 stroke-[3]" />}
                {isEcho && !active && <Sparkles className="h-2.5 w-2.5 text-sky-600" />}
                <span>{quickMotif}</span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
