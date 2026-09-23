import React, { useState, useRef, useEffect } from 'react';
import { 
  Bell, 
  Calendar, 
  Clock, 
  Check, 
  X, 
  Phone, 
  MessageCircle, 
  Volume2, 
  VolumeX, 
  RotateCcw, 
  ArrowRight, 
  AlertCircle,
  ExternalLink,
  ChevronRight
} from 'lucide-react';
import { useAppointmentNotifications, AppointmentRequest } from '../../contexts/AppointmentNotificationsContext';
import { Button } from '../ui/button';

export function NotificationCenter() {
  const {
    requests,
    pendingCount,
    loading,
    soundEnabled,
    setSoundEnabled,
    refreshRequests,
    approveRequest,
    rejectRequest,
    latestNotification,
    clearLatestNotification
  } = useAppointmentNotifications();

  const [isOpen, setIsOpen] = useState(false);
  const [filterType, setFilterType] = useState<'all' | 'nouveau' | 'changement'>('all');
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);

  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

  const filteredRequests = requests.filter(r => {
    if (filterType === 'nouveau') return r.type === 'nouveau_rdv';
    if (filterType === 'changement') return r.type === 'changement_rdv';
    return true;
  });

  const handleApprove = async (req: AppointmentRequest) => {
    setActionLoadingId(req.id);
    await approveRequest(req);
    setActionLoadingId(null);
  };

  const handleReject = async (req: AppointmentRequest) => {
    if (!confirm(`Refuser la demande de ${req.patient_name} ?`)) return;
    setActionLoadingId(req.id);
    await rejectRequest(req);
    setActionLoadingId(null);
  };

  const cleanPhone = (phone: string) => {
    if (!phone) return '';
    // Format Moroccan phone for WhatsApp (212...)
    let p = phone.replace(/\D/g, '');
    if (p.startsWith('0')) p = '212' + p.substring(1);
    if (!p.startsWith('212')) p = '212' + p;
    return p;
  };

  const getNouveauCount = requests.filter(r => r.type === 'nouveau_rdv').length;
  const getChangementCount = requests.filter(r => r.type === 'changement_rdv').length;

  return (
    <div className="relative" ref={dropdownRef}>
      {/* Bell Trigger Button */}
      <button
        type="button"
        onClick={() => {
          setIsOpen(!isOpen);
          clearLatestNotification();
        }}
        className={`relative p-2 rounded-xl transition-all duration-150 flex items-center justify-center ${
          isOpen
            ? 'bg-primary-50 text-primary-600'
            : pendingCount > 0
            ? 'text-amber-600 hover:bg-amber-50'
            : 'text-slate-500 hover:text-slate-800 hover:bg-slate-100'
        }`}
        title={pendingCount > 0 ? `${pendingCount} demande(s) en attente` : 'Notifications'}
      >
        <Bell className={`h-5 w-5 ${pendingCount > 0 ? 'animate-wiggle text-amber-600' : ''}`} />
        
        {/* Unread badge */}
        {pendingCount > 0 && (
          <span className="absolute -top-1 -right-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-amber-500 px-1.5 text-[11px] font-black text-white shadow-sm ring-2 ring-white">
            {pendingCount > 99 ? '99+' : pendingCount}
          </span>
        )}
      </button>

      {/* Floating Dropdown / Popover */}
      {isOpen && (
        <div className="absolute right-0 mt-2 w-[340px] sm:w-[420px] max-w-[calc(100vw-1.5rem)] rounded-2xl bg-white shadow-2xl ring-1 ring-black/10 z-50 overflow-hidden flex flex-col border border-slate-100 animate-in fade-in zoom-in-95 duration-150">
          {/* Header */}
          <div className="p-4 bg-slate-900 text-white flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="h-8 w-8 rounded-lg bg-amber-500/20 text-amber-400 flex items-center justify-center font-bold">
                <Bell className="h-4 w-4" />
              </div>
              <div>
                <h3 className="font-bold text-sm">Demandes de Rendez-vous</h3>
                <p className="text-[11px] text-slate-400">
                  {pendingCount === 0 
                    ? 'Aucune demande en attente' 
                    : `${pendingCount} demande${pendingCount > 1 ? 's' : ''} à valider`}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => setSoundEnabled(!soundEnabled)}
                className={`p-1.5 rounded-lg text-xs transition-colors ${
                  soundEnabled ? 'text-amber-400 hover:bg-white/10' : 'text-slate-500 hover:bg-white/10'
                }`}
                title={soundEnabled ? 'Son activé (cliquez pour couper)' : 'Son coupé (cliquez pour activer)'}
              >
                {soundEnabled ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />}
              </button>
              <button
                type="button"
                onClick={() => refreshRequests()}
                disabled={loading}
                className="p-1.5 rounded-lg text-slate-300 hover:text-white hover:bg-white/10 transition-colors"
                title="Actualiser les demandes"
              >
                <RotateCcw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
              </button>
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 transition-colors ml-1"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>

          {/* Filter Tabs */}
          {pendingCount > 0 && (
            <div className="flex items-center gap-1 p-2 bg-slate-50 border-b border-slate-100 text-xs font-medium">
              <button
                type="button"
                onClick={() => setFilterType('all')}
                className={`px-3 py-1.5 rounded-lg transition-all ${
                  filterType === 'all'
                    ? 'bg-white text-slate-900 font-bold shadow-xs'
                    : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                Toutes ({pendingCount})
              </button>
              <button
                type="button"
                onClick={() => setFilterType('nouveau')}
                className={`px-3 py-1.5 rounded-lg transition-all ${
                  filterType === 'nouveau'
                    ? 'bg-white text-amber-700 font-bold shadow-xs'
                    : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                Nouveaux ({getNouveauCount})
              </button>
              <button
                type="button"
                onClick={() => setFilterType('changement')}
                className={`px-3 py-1.5 rounded-lg transition-all ${
                  filterType === 'changement'
                    ? 'bg-white text-purple-700 font-bold shadow-xs'
                    : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                Reports ({getChangementCount})
              </button>
            </div>
          )}

          {/* Request List */}
          <div className="max-h-[420px] overflow-y-auto divide-y divide-slate-100 p-2 space-y-2">
            {filteredRequests.length === 0 ? (
              <div className="py-10 px-4 text-center">
                <div className="h-12 w-12 rounded-full bg-slate-100 text-slate-400 flex items-center justify-center mx-auto mb-3">
                  <Calendar className="h-6 w-6" />
                </div>
                <p className="text-sm font-bold text-slate-700">Aucune demande en attente</p>
                <p className="text-xs text-slate-400 mt-1">
                  Les demandes de RDV et de reports formulées par les patients apparaîtront ici en temps réel.
                </p>
              </div>
            ) : (
              filteredRequests.map(req => {
                const isChange = req.type === 'changement_rdv';
                const isBusy = actionLoadingId === req.id;
                const formattedDate = new Date(req.date_heure).toLocaleDateString('fr-FR', {
                  weekday: 'short',
                  day: 'numeric',
                  month: 'short'
                });
                const formattedTime = new Date(req.date_heure).toLocaleTimeString('fr-FR', {
                  hour: '2-digit',
                  minute: '2-digit'
                });

                return (
                  <div
                    key={req.id}
                    className={`p-3 rounded-xl border transition-all ${
                      isChange 
                        ? 'bg-purple-50/40 border-purple-100 hover:border-purple-200' 
                        : 'bg-amber-50/40 border-amber-100 hover:border-amber-200'
                    }`}
                  >
                    {/* Header line: Badge + Time */}
                    <div className="flex items-center justify-between gap-2 mb-1.5">
                      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider ${
                        isChange 
                          ? 'bg-purple-100 text-purple-800' 
                          : 'bg-amber-100 text-amber-800'
                      }`}>
                        {isChange ? '🔄 Demande de Report' : '✨ Nouveau RDV'}
                      </span>
                      <span className="text-[10px] text-slate-400 flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        {new Date(req.created_at).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>

                    {/* Patient info */}
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <h4 className="text-xs font-bold text-slate-900 leading-tight">
                          {req.patient_name}
                        </h4>
                        {req.patient_phone && (
                          <p className="text-[11px] text-slate-500 mt-0.5">{req.patient_phone}</p>
                        )}
                      </div>

                      {/* Contact shortcuts */}
                      <div className="flex items-center gap-1">
                        {req.patient_phone && (
                          <>
                            <a
                              href={`https://wa.me/${cleanPhone(req.patient_phone)}?text=${encodeURIComponent(
                                `Bonjour ${req.patient_name}, concernant votre ${
                                  isChange ? 'demande de report de rendez-vous' : 'demande de rendez-vous'
                                } au centre ReForme...`
                              )}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="p-1.5 rounded-lg bg-green-500 hover:bg-green-600 text-white transition-colors"
                              title="Écrire sur WhatsApp"
                            >
                              <MessageCircle className="h-3.5 w-3.5" />
                            </a>
                            <a
                              href={`tel:${req.patient_phone}`}
                              className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-900 text-white transition-colors"
                              title="Appeler le patient"
                            >
                              <Phone className="h-3.5 w-3.5" />
                            </a>
                          </>
                        )}
                      </div>
                    </div>

                    {/* Details Box */}
                    <div className="mt-2.5 p-2 rounded-lg bg-white border border-slate-100 text-xs space-y-1">
                      {isChange ? (
                        <div className="space-y-1">
                          <div className="flex items-center gap-1 text-[11px] text-slate-500">
                            <span>Initial :</span>
                            <span className="line-through font-medium">{formattedDate} à {formattedTime}</span>
                          </div>
                          <div className="flex items-center gap-1 text-xs font-bold text-purple-900">
                            <ArrowRight className="h-3.5 w-3.5 text-purple-600" />
                            <span>Souhaité :</span>
                            <span className="bg-purple-50 px-1.5 py-0.5 rounded text-purple-700">
                              {req.requested_date ? new Date(req.requested_date).toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' }) : 'Date à convenir'}
                              {req.requested_time ? ` à ${req.requested_time}` : ''}
                            </span>
                          </div>
                        </div>
                      ) : (
                        <div className="flex items-center gap-1.5 font-semibold text-slate-800">
                          <Calendar className="h-3.5 w-3.5 text-amber-600" />
                          <span>Souhaité le {formattedDate} à {formattedTime}</span>
                        </div>
                      )}

                      {req.motif && (
                        <p className="text-[11px] text-slate-500 italic pt-1 border-t border-slate-50">
                          Motif : « {req.motif} »
                        </p>
                      )}
                    </div>

                    {/* Actions */}
                    <div className="mt-3 flex items-center justify-between gap-2 pt-1">
                      <a
                        href="#agenda"
                        onClick={() => setIsOpen(false)}
                        className="text-[11px] font-semibold text-primary-600 hover:text-primary-700 hover:underline flex items-center gap-1"
                      >
                        Voir dans l'agenda <ExternalLink className="h-3 w-3" />
                      </a>

                      <div className="flex items-center gap-1.5">
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={isBusy}
                          onClick={() => handleReject(req)}
                          className="h-7 px-2 text-xs border-red-200 text-red-600 hover:bg-red-50 hover:border-red-300"
                        >
                          <X className="h-3.5 w-3.5 mr-1" /> Refuser
                        </Button>

                        <Button
                          size="sm"
                          disabled={isBusy}
                          onClick={() => handleApprove(req)}
                          className={`h-7 px-2.5 text-xs text-white shadow-xs ${
                            isChange 
                              ? 'bg-purple-600 hover:bg-purple-700' 
                              : 'bg-emerald-600 hover:bg-emerald-700'
                          }`}
                        >
                          <Check className="h-3.5 w-3.5 mr-1" />
                          {isBusy ? 'Validation...' : isChange ? 'Valider report' : 'Confirmer RDV'}
                        </Button>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {/* Footer */}
          {pendingCount > 0 && (
            <div className="p-2.5 bg-slate-50 border-t border-slate-100 flex items-center justify-between text-xs">
              <span className="text-[11px] text-slate-500">
                Géré par le secrétariat & l'administration
              </span>
              <a
                href="#agenda"
                onClick={() => setIsOpen(false)}
                className="text-xs font-bold text-primary-600 hover:text-primary-800 flex items-center gap-1"
              >
                Ouvrir l'Agenda <ChevronRight className="h-3.5 w-3.5" />
              </a>
            </div>
          )}
        </div>
      )}

      {/* Floating Instant Toast Banner when new request arrives */}
      {latestNotification && !isOpen && (
        <div className="fixed bottom-5 right-5 z-50 max-w-sm w-full bg-slate-900 text-white p-4 rounded-2xl shadow-2xl border border-amber-500/30 animate-in slide-in-from-bottom-5 duration-200">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-start gap-3">
              <div className="h-9 w-9 rounded-xl bg-amber-500/20 text-amber-400 flex items-center justify-center flex-shrink-0">
                <Bell className="h-5 w-5 animate-bounce" />
              </div>
              <div>
                <p className="text-xs font-black text-amber-400 uppercase tracking-wider">
                  {latestNotification.type === 'changement_rdv' ? 'Demande de Report' : 'Nouveau RDV'}
                </p>
                <p className="text-sm font-bold mt-0.5 text-white">
                  {latestNotification.patient_name}
                </p>
                <p className="text-xs text-slate-300 mt-0.5">
                  {latestNotification.type === 'changement_rdv'
                    ? `Souhaite reporter au ${latestNotification.requested_date || 'prochain créneau'}`
                    : `Pour le ${new Date(latestNotification.date_heure).toLocaleDateString('fr-FR')} à ${new Date(latestNotification.date_heure).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}`}
                </p>
              </div>
            </div>
            <button
              onClick={clearLatestNotification}
              className="text-slate-400 hover:text-white p-1"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="mt-3 flex items-center justify-end gap-2 pt-2 border-t border-slate-800">
            <Button
              size="sm"
              variant="ghost"
              onClick={clearLatestNotification}
              className="h-7 text-xs text-slate-300 hover:text-white hover:bg-slate-800"
            >
              Plus tard
            </Button>
            <Button
              size="sm"
              onClick={() => {
                setIsOpen(true);
                clearLatestNotification();
              }}
              className="h-7 text-xs bg-amber-500 hover:bg-amber-600 text-white font-bold"
            >
              Voir la demande
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
