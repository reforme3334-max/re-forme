import React, { useState, useEffect } from 'react';
import { Sidebar } from './Sidebar';
import { Menu, Clock, Edit2, Check } from 'lucide-react';
import { Button } from '../ui/button';
import { Modal } from '../ui/modal';
import { NotificationCenter } from '../notifications/NotificationCenter';
import {
  getMoroccoTimeStr,
  getMoroccoNow,
  getClinicTimeMode,
  setClinicTimeMode,
  setClinicCustomTime,
  ClinicTimeMode
} from '../../lib/timeUtils';

export function Layout({ children }: { children: React.ReactNode }) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [moroccoTime, setMoroccoTime] = useState(() => getMoroccoTimeStr());
  const [moroccoDateStr, setMoroccoDateStr] = useState(() =>
    getMoroccoNow().toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' })
  );
  const [isTimeModalOpen, setIsTimeModalOpen] = useState(false);
  const [timeMode, setTimeMode] = useState<ClinicTimeMode>(() => getClinicTimeMode());
  const [customTimeInput, setCustomTimeInput] = useState(() => getMoroccoTimeStr());

  const updateClock = () => {
    setMoroccoTime(getMoroccoTimeStr());
    setMoroccoDateStr(
      getMoroccoNow().toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' })
    );
    setTimeMode(getClinicTimeMode());
  };

  useEffect(() => {
    updateClock();
    const interval = setInterval(updateClock, 10000);
    const handleTimeUpdated = () => updateClock();
    window.addEventListener('reforme-time-updated', handleTimeUpdated);
    return () => {
      clearInterval(interval);
      window.removeEventListener('reforme-time-updated', handleTimeUpdated);
    };
  }, []);

  const openTimeModal = () => {
    setCustomTimeInput(getMoroccoTimeStr());
    setTimeMode(getClinicTimeMode());
    setIsTimeModalOpen(true);
  };

  const handleSaveCustomTime = (e: React.FormEvent) => {
    e.preventDefault();
    if (customTimeInput) {
      setClinicCustomTime(customTimeInput);
      updateClock();
      setIsTimeModalOpen(false);
    }
  };

  const handleSelectMode = (mode: ClinicTimeMode) => {
    setClinicTimeMode(mode);
    updateClock();
    setCustomTimeInput(getMoroccoTimeStr());
  };

  return (
    <div className="flex h-screen bg-slate-50">
      {/* Mobile sidebar backdrop */}
      {sidebarOpen && (
        <div 
          className="fixed inset-0 z-20 bg-slate-900/50 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <div className={`fixed inset-y-0 left-0 z-30 w-64 transform bg-white border-r border-slate-200 transition-transform duration-200 ease-in-out lg:static lg:translate-x-0 ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}`}>
        <Sidebar onClose={() => setSidebarOpen(false)} />
      </div>

      {/* Main content */}
      <div className="flex flex-1 flex-col overflow-hidden">
        {/* Desktop Header */}
        <header className="hidden lg:flex h-16 items-center justify-between border-b border-slate-200 bg-white px-8 flex-shrink-0">
          <div className="flex items-center gap-3">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-400 bg-slate-100 px-2.5 py-1 rounded-md">
              Centre de Kinésithérapie
            </span>
            <span className="text-slate-300">•</span>
            <span className="text-xs text-slate-500 font-medium">
              Espace Administratif & Secrétariat
            </span>
          </div>

          <div className="flex items-center gap-3">
            {/* Live Morocco Clock (Clickable to modify time) */}
            <button
              type="button"
              onClick={openTimeModal}
              title="Cliquer pour modifier l'heure actuelle"
              className="flex items-center gap-2 bg-slate-100/90 hover:bg-primary-50/80 border border-slate-200/80 hover:border-primary-200 px-3 py-1.5 rounded-xl text-xs font-semibold text-slate-700 transition-all cursor-pointer group"
            >
              <Clock className="h-3.5 w-3.5 text-primary-600" />
              <span className="capitalize text-slate-500">{moroccoDateStr}</span>
              <span className="text-slate-300">•</span>
              <span className="font-black text-slate-900 tabular-nums text-sm">{moroccoTime}</span>
              <span className="text-[10px] font-bold text-primary-600 bg-primary-50 group-hover:bg-white px-1.5 py-0.5 rounded flex items-center gap-1">
                Modifier l'heure
                <Edit2 className="h-2.5 w-2.5" />
              </span>
            </button>

            <div className="h-5 w-px bg-slate-200" />

            {/* Direct link to patient portal demo */}
            <a
              href="#espace-patient"
              className="text-xs font-bold text-mint-700 bg-mint-50 hover:bg-mint-100 border border-mint-200/80 px-3 py-1.5 rounded-xl transition-all"
            >
              Portail Patient (Démo)
            </a>

            <div className="h-5 w-px bg-slate-200" />

            {/* Notification Bell */}
            <NotificationCenter />
          </div>
        </header>

        {/* Mobile header */}
        <header className="flex h-16 items-center justify-between border-b border-slate-200 bg-white px-4 lg:hidden flex-shrink-0">
          <div className="flex items-center gap-2 text-primary-600 font-bold text-xl">
            <span className="text-mint-500">Re</span>Forme
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={openTimeModal}
              title="Modifier l'heure"
              className="flex items-center gap-1.5 bg-slate-100 hover:bg-primary-50 border border-slate-200 px-2.5 py-1 rounded-lg text-xs font-bold text-slate-800 tabular-nums"
            >
              <Clock className="h-3 w-3 text-primary-600" />
              <span>{moroccoTime}</span>
              <Edit2 className="h-2.5 w-2.5 text-slate-400" />
            </button>
            <NotificationCenter />
            <Button variant="ghost" size="icon" onClick={() => setSidebarOpen(true)}>
              <Menu className="h-6 w-6" />
            </Button>
          </div>
        </header>

        {/* Main scrollable area */}
        <main className="flex-1 overflow-y-auto p-4 md:p-6 lg:p-8">
          {children}
        </main>
      </div>

      {/* Modal de modification de l'heure actuelle */}
      <Modal
        isOpen={isTimeModalOpen}
        onClose={() => setIsTimeModalOpen(false)}
        title="Modifier l'heure de l'application"
        maxWidth="md"
      >
        <form onSubmit={handleSaveCustomTime} className="space-y-5">
          <div className="p-4 bg-primary-50/60 border border-primary-100 rounded-xl space-y-3">
            <label className="block text-xs font-bold uppercase tracking-wider text-primary-900">
              Régler manuellement l'heure actuelle
            </label>
            <div className="flex items-center gap-3">
              <input
                type="time"
                required
                value={customTimeInput}
                onChange={(e) => setCustomTimeInput(e.target.value)}
                className="flex-1 rounded-xl border border-primary-200 bg-white px-4 py-2.5 text-lg font-black text-slate-900 focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500/20"
              />
              <Button type="submit" className="h-11 px-5 font-bold rounded-xl">
                Appliquer l'heure
              </Button>
            </div>
            <p className="text-xs text-slate-500">
              Saisissez l'heure exacte actuelle (ex: 16:58) : l'application ajustera automatiquement son horloge sur tous les écrans (Agenda, Caisse, Patients).
            </p>
          </div>

          <div className="space-y-2">
            <label className="block text-xs font-bold uppercase tracking-wider text-slate-400">
              Ou sélectionner un fuseau horaire prédéfini
            </label>
            <div className="grid grid-cols-1 gap-2">
              <button
                type="button"
                onClick={() => handleSelectMode('GMT+1')}
                className={`flex items-center justify-between p-3 rounded-xl border text-left text-sm font-semibold transition-all ${
                  timeMode === 'GMT+1'
                    ? 'border-primary-500 bg-primary-50 text-primary-900'
                    : 'border-slate-200 bg-white hover:bg-slate-50 text-slate-700'
                }`}
              >
                <div>
                  <div className="font-bold">Heure du Maroc Standard (GMT+1)</div>
                  <div className="text-xs text-slate-500 font-normal">Fuseau officiel du Maroc hors Ramadan</div>
                </div>
                {timeMode === 'GMT+1' && <Check className="h-4 w-4 text-primary-600" />}
              </button>

              <button
                type="button"
                onClick={() => handleSelectMode('GMT+0')}
                className={`flex items-center justify-between p-3 rounded-xl border text-left text-sm font-semibold transition-all ${
                  timeMode === 'GMT+0'
                    ? 'border-primary-500 bg-primary-50 text-primary-900'
                    : 'border-slate-200 bg-white hover:bg-slate-50 text-slate-700'
                }`}
              >
                <div>
                  <div className="font-bold">Heure Ramadan / UTC (GMT+0)</div>
                  <div className="text-xs text-slate-500 font-normal">Recule l'horloge d'une heure (-1h)</div>
                </div>
                {timeMode === 'GMT+0' && <Check className="h-4 w-4 text-primary-600" />}
              </button>

              <button
                type="button"
                onClick={() => handleSelectMode('SYSTEM')}
                className={`flex items-center justify-between p-3 rounded-xl border text-left text-sm font-semibold transition-all ${
                  timeMode === 'SYSTEM'
                    ? 'border-primary-500 bg-primary-50 text-primary-900'
                    : 'border-slate-200 bg-white hover:bg-slate-50 text-slate-700'
                }`}
              >
                <div>
                  <div className="font-bold">Heure système de l'appareil</div>
                  <div className="text-xs text-slate-500 font-normal">Utilise directement l'heure de votre ordinateur/téléphone</div>
                </div>
                {timeMode === 'SYSTEM' && <Check className="h-4 w-4 text-primary-600" />}
              </button>
            </div>
          </div>

          <div className="flex justify-end pt-2">
            <Button type="button" variant="outline" onClick={() => setIsTimeModalOpen(false)}>
              Fermer
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
