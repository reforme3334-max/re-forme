import { useState, useEffect } from 'react';
import { format, addDays, startOfWeek, isSameDay, setHours, setMinutes } from 'date-fns';
import { fr } from 'date-fns/locale';
import { ChevronLeft, ChevronRight, Calendar as CalendarIcon, Clock, User, Plus, CreditCard, Euro, CheckCircle } from 'lucide-react';
import { supabase } from '@/lib/supabaseClient';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Modal } from '@/components/ui/modal';

interface Patient {
  id: string;
  nom: string;
  prenom: string;
}

interface Appointment {
  id: string;
  patient_id: string;
  date_heure: string;
  duree: number;
  statut: string;
  notes_seance: string; // Utilisé pour stocker "Bilan" ou "Séance"
  patients?: { nom: string; prenom: string };
}

export function CalendarView() {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [patients, setPatients] = useState<Patient[]>([]);
  
  // Modal state
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  
  // Form state
  const [selectedPatient, setSelectedPatient] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Manage Modal state
  const [isBillingModalOpen, setIsBillingModalOpen] = useState(false);
  const [selectedAppointment, setSelectedAppointment] = useState<Appointment | null>(null);
  const [billingAmount, setBillingAmount] = useState('50');
  const [paymentType, setPaymentType] = useState('Patient');
  const [editDate, setEditDate] = useState('');
  const [editTime, setEditTime] = useState('');

  // Setup grid (Lundi à Vendredi, 8h à 20h)
  const startDate = startOfWeek(currentDate, { weekStartsOn: 1 });
  const weekDays = Array.from({ length: 5 }).map((_, i) => addDays(startDate, i));
  const hours = Array.from({ length: 13 }).map((_, i) => i + 8);

  useEffect(() => {
    fetchAppointments();
    fetchPatients();
  }, [currentDate]);

  const fetchAppointments = async () => {
    // Dans une vraie app, on filtrerait par date de début et fin de semaine
    const { data, error } = await supabase
      .from('appointments')
      .select('*, patients(nom, prenom)');
      
    if (!error && data) {
      setAppointments(data);
    }
  };

  const fetchPatients = async () => {
    const { data, error } = await supabase
      .from('patients')
      .select('id, nom, prenom')
      .order('nom');
      
    if (!error && data) {
      setPatients(data);
    }
  };

  const handleSlotClick = (day: Date, hour: number) => {
    const slotDate = setMinutes(setHours(day, hour), 0);
    setSelectedDate(slotDate);
    setErrorMsg(null);
    setIsModalOpen(true);
  };

  const handleSaveAppointment = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    
    if (!selectedDate || !selectedPatient) {
      setErrorMsg("Veuillez sélectionner un patient.");
      return;
    }

    setLoading(true);
    const { error } = await supabase
      .from('appointments')
      .insert([{
        patient_id: selectedPatient,
        date_heure: selectedDate.toISOString()
      }]);

    setLoading(false);
    if (!error) {
      setIsModalOpen(false);
      setSelectedPatient('');
      fetchAppointments();
    } else {
      setErrorMsg("Erreur d'ajout : " + error.message);
    }
  };

  const handleUpdateAppointment = async () => {
    if (!selectedAppointment) return;
    setLoading(true);
    const newDateTime = new Date(`${editDate}T${editTime}`);
    const { error } = await supabase
      .from('appointments')
      .update({ date_heure: newDateTime.toISOString() })
      .eq('id', selectedAppointment.id);

    setLoading(false);
    if (!error) {
      setIsBillingModalOpen(false);
      fetchAppointments();
    } else {
      setErrorMsg("Erreur de modification : " + error.message);
    }
  };

  const handleCancelAppointment = async () => {
    if (!selectedAppointment) return;
    setLoading(true);
    const { error } = await supabase
      .from('appointments')
      .update({ statut: 'Annulé' })
      .eq('id', selectedAppointment.id);

    setLoading(false);
    if (!error) {
      setIsBillingModalOpen(false);
      fetchAppointments();
    } else {
      setErrorMsg("Erreur d'annulation : " + error.message);
    }
  };

  const handleSaveBilling = async () => {
    setErrorMsg(null);

    if (!selectedAppointment) return;

    setLoading(true);
    
    // 1. Mettre à jour le statut du rendez-vous
    await supabase
      .from('appointments')
      .update({ statut: 'Effectué' })
      .eq('id', selectedAppointment.id);

    // 2. Créer la facture
    const { error } = await supabase
      .from('billings')
      .insert([{
        patient_id: selectedAppointment.patient_id,
        appointment_id: selectedAppointment.id,
        montant: parseFloat(billingAmount),
        type_paiement: paymentType,
        statut: 'Payé'
      }]);

    setLoading(false);
    if (!error) {
      setIsBillingModalOpen(false);
      setSelectedAppointment(null);
      fetchAppointments();
    } else {
      setErrorMsg("Erreur de facturation : " + error.message);
    }
  };

  const getAppointmentsForSlot = (day: Date, hour: number) => {
    return appointments.filter(app => {
      const appDate = new Date(app.date_heure);
      return isSameDay(appDate, day) && appDate.getHours() === hour;
    });
  };

  return (
    <div className="flex flex-col h-full space-y-4">
      {/* Header Controls */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-800 capitalize flex items-center gap-2">
            <CalendarIcon className="h-5 w-5 text-primary-500" />
            {format(startDate, 'MMMM yyyy', { locale: fr })}
          </h2>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={() => setCurrentDate(new Date())}>Aujourd'hui</Button>
          <div className="flex items-center rounded-md border border-slate-200 bg-white">
            <Button variant="ghost" size="icon" onClick={() => setCurrentDate(addDays(currentDate, -7))} className="h-9 w-9 rounded-none border-r border-slate-200">
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="icon" onClick={() => setCurrentDate(addDays(currentDate, 7))} className="h-9 w-9 rounded-none">
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>

      {/* Calendar Grid */}
      <Card className="flex-1 overflow-hidden flex flex-col shadow-sm">
        <div className="overflow-x-auto flex-1">
          <div className="min-w-[800px] h-full flex flex-col">
            {/* Days Header */}
            <div className="grid grid-cols-6 border-b border-slate-200 bg-slate-50/80">
              <div className="p-3 border-r border-slate-200 text-center text-xs font-medium text-slate-500">
                Heure
              </div>
              {weekDays.map((day, i) => (
                <div key={i} className="p-3 border-r border-slate-200 text-center">
                  <div className="text-xs font-medium text-slate-500 uppercase">
                    {format(day, 'EEEE', { locale: fr })}
                  </div>
                  <div className={`text-lg font-semibold mt-0.5 ${isSameDay(day, new Date()) ? 'text-primary-600' : 'text-slate-900'}`}>
                    {format(day, 'd')}
                  </div>
                </div>
              ))}
            </div>

            {/* Time Slots */}
            <div className="flex-1 overflow-y-auto relative bg-white">
              {hours.map((hour) => (
                <div key={hour} className="grid grid-cols-6 border-b border-slate-100 min-h-[80px]">
                  <div className="p-2 border-r border-slate-200 text-right text-xs font-medium text-slate-400 sticky left-0 bg-slate-50/50">
                    {hour}:00
                  </div>
                  {weekDays.map((day, dayIdx) => {
                    const slotAppointments = getAppointmentsForSlot(day, hour);
                    return (
                      <div 
                        key={dayIdx} 
                        className="border-r border-slate-100 p-1 relative group hover:bg-slate-50 transition-colors cursor-pointer"
                        onClick={() => handleSlotClick(day, hour)}
                      >
                        {/* Hover indicator for empty slot */}
                        {slotAppointments.length === 0 && (
                          <div className="absolute inset-1 rounded border-2 border-dashed border-primary-200 bg-primary-50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center pointer-events-none">
                            <span className="text-xs font-medium text-primary-600">+ Ajouter</span>
                          </div>
                        )}

                        {/* Quick Add Button (always accessible on hover) */}
                        <button 
                          className="absolute top-1 right-1 z-30 p-1 rounded bg-white shadow-sm border border-slate-200 text-slate-500 opacity-0 group-hover:opacity-100 hover:text-primary-600 hover:bg-primary-50 transition-all"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleSlotClick(day, hour);
                          }}
                          title="Ajouter un rendez-vous"
                        >
                          <Plus className="h-3 w-3" />
                        </button>

                        {/* Appointments */}
                        {slotAppointments.map((app, index) => {
                          const isBilan = app.notes_seance === 'Bilan';
                          const startMin = new Date(app.date_heure).getMinutes();
                          const count = slotAppointments.length;
                          
                          let statusStyles = 'bg-primary-50 border-primary-200 text-primary-800 hover:bg-primary-100'; // Confirmé
                          if (app.statut === 'Effectué') {
                            statusStyles = 'bg-mint-50 border-mint-200 text-mint-800 hover:bg-mint-100';
                          } else if (app.statut === 'Annulé') {
                            statusStyles = 'bg-slate-100 border-slate-300 text-slate-500 opacity-80 hover:opacity-100';
                          }
                          
                          return (
                            <div 
                              key={app.id} 
                              className={`absolute rounded-md px-2 py-1.5 text-xs border shadow-sm z-10 overflow-hidden transition-all cursor-pointer ${statusStyles}`}
                              style={{
                                top: `${(startMin / 60) * 100}%`,
                                height: `calc(${((app.duree || 30) / 60) * 100}% - 4px)`,
                                minHeight: '36px',
                                left: count > 1 ? `calc(${(index / count) * 100}% + 2px)` : '4px',
                                width: count > 1 ? `calc(${(100 / count)}% - 4px)` : 'calc(100% - 8px)',
                              }}
                              onClick={(e) => {
                                e.stopPropagation();
                                setSelectedAppointment(app);
                                const appDate = new Date(app.date_heure);
                                setEditDate(format(appDate, 'yyyy-MM-dd'));
                                setEditTime(format(appDate, 'HH:mm'));
                                setErrorMsg(null);
                                setIsBillingModalOpen(true);
                              }}
                            >
                              <div className="font-semibold truncate flex items-center justify-between">
                                <span>{app.patients?.prenom} {app.patients?.nom}</span>
                                {app.statut === 'Effectué' && <CheckCircle className="h-3 w-3 text-green-600" />}
                              </div>
                              <div className="flex items-center gap-1 mt-0.5 opacity-80">
                                <Clock className="h-3 w-3" />
                                <span>{app.duree || 30} min - {isBilan ? 'Bilan' : 'Séance'}</span>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
          </div>
        </div>
      </Card>

      {/* Booking Modal */}
      <Modal 
        isOpen={isModalOpen} 
        onClose={() => setIsModalOpen(false)} 
        title="Nouveau Rendez-vous"
      >
        <form onSubmit={handleSaveAppointment} className="space-y-5">
          {errorMsg && (
            <div className="p-3 text-sm text-red-600 bg-red-50 rounded-md border border-red-200">
              {errorMsg}
            </div>
          )}
          
          {selectedDate && (
            <div className="flex items-center gap-2 text-sm text-slate-600 bg-slate-50 p-3 rounded-lg border border-slate-100">
              <CalendarIcon className="h-4 w-4 text-primary-500" />
              <span className="font-medium">
                {format(selectedDate, 'EEEE d MMMM yyyy à HH:mm', { locale: fr })}
              </span>
            </div>
          )}

          <div className="space-y-2">
            <label className="text-sm font-medium text-slate-700 flex items-center gap-2">
              <User className="h-4 w-4" /> Patient
            </label>
            <select
              required
              value={selectedPatient}
              onChange={(e) => setSelectedPatient(e.target.value)}
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500/20"
            >
              <option value="">Sélectionner un patient...</option>
              {patients.map(p => (
                <option key={p.id} value={p.id}>{p.nom} {p.prenom}</option>
              ))}
            </select>
          </div>

          <div className="pt-4 flex justify-end gap-3 border-t border-slate-100">
            <Button type="button" variant="outline" onClick={() => setIsModalOpen(false)}>
              Annuler
            </Button>
            <Button type="submit" disabled={loading}>
              {loading ? 'Enregistrement...' : 'Confirmer le RDV'}
            </Button>
          </div>
        </form>
      </Modal>

      {/* Manage Appointment Modal */}
      <Modal 
        isOpen={isBillingModalOpen} 
        onClose={() => setIsBillingModalOpen(false)} 
        title="Gestion du Rendez-vous"
      >
        <div className="space-y-5">
          {errorMsg && (
            <div className="p-3 text-sm text-red-600 bg-red-50 rounded-md border border-red-200">
              {errorMsg}
            </div>
          )}

          {selectedAppointment?.statut === 'Effectué' && (
            <div className="p-3 text-sm text-green-700 bg-green-50 rounded-md border border-green-200 flex items-center gap-2 font-medium">
              <CheckCircle className="h-4 w-4" />
              Cette séance a déjà été facturée et réglée.
            </div>
          )}

          {selectedAppointment?.statut === 'Annulé' && (
            <div className="p-3 text-sm text-slate-700 bg-slate-100 rounded-md border border-slate-200 flex items-center gap-2 font-medium">
              Ce rendez-vous a été annulé.
            </div>
          )}
          
          {selectedAppointment && (
            <div className="flex items-center gap-2 text-sm text-slate-600 bg-slate-50 p-3 rounded-lg border border-slate-100">
              <User className="h-4 w-4 text-primary-500" />
              <span className="font-medium">
                Patient : {selectedAppointment.patients?.prenom} {selectedAppointment.patients?.nom}
              </span>
            </div>
          )}

          {/* Date and Time Modification */}
          <div className="space-y-3 bg-white p-4 rounded-lg border border-slate-100 shadow-sm">
            <h4 className="text-sm font-semibold text-slate-800">Date et Heure</h4>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-xs font-medium text-slate-500">Date</label>
                <input
                  type="date"
                  value={editDate}
                  onChange={(e) => setEditDate(e.target.value)}
                  disabled={selectedAppointment?.statut === 'Effectué' || selectedAppointment?.statut === 'Annulé'}
                  className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500/20 disabled:bg-slate-50 disabled:text-slate-500"
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium text-slate-500">Heure</label>
                <input
                  type="time"
                  value={editTime}
                  onChange={(e) => setEditTime(e.target.value)}
                  disabled={selectedAppointment?.statut === 'Effectué' || selectedAppointment?.statut === 'Annulé'}
                  className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500/20 disabled:bg-slate-50 disabled:text-slate-500"
                />
              </div>
            </div>
            {selectedAppointment?.statut !== 'Effectué' && selectedAppointment?.statut !== 'Annulé' && (
              <Button type="button" variant="secondary" size="sm" onClick={handleUpdateAppointment} disabled={loading} className="w-full mt-2">
                Mettre à jour l'horaire
              </Button>
            )}
          </div>

          {/* Billing Section */}
          {selectedAppointment?.statut !== 'Annulé' && (
            <div className="space-y-3 bg-white p-4 rounded-lg border border-slate-100 shadow-sm">
              <h4 className="text-sm font-semibold text-slate-800">Facturation</h4>
              <div className="space-y-2">
                <label className="text-xs font-medium text-slate-500 flex items-center gap-1">
                  <Euro className="h-3 w-3" /> Montant (€)
                </label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={billingAmount}
                  onChange={(e) => setBillingAmount(e.target.value)}
                  disabled={selectedAppointment?.statut === 'Effectué'}
                  className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500/20 disabled:bg-slate-50 disabled:text-slate-500"
                />
              </div>

              <div className="space-y-2">
                <label className="text-xs font-medium text-slate-500 flex items-center gap-1">
                  <CreditCard className="h-3 w-3" /> Type de paiement
                </label>
                <select
                  value={paymentType}
                  onChange={(e) => setPaymentType(e.target.value)}
                  disabled={selectedAppointment?.statut === 'Effectué'}
                  className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500/20 disabled:bg-slate-50 disabled:text-slate-500"
                >
                  <option value="Patient">Patient (Direct)</option>
                  <option value="Mutuelle">Mutuelle</option>
                  <option value="Tiers-payant">Tiers-payant</option>
                  <option value="Hors nomenclature">Hors nomenclature</option>
                </select>
              </div>
              {selectedAppointment?.statut !== 'Effectué' && selectedAppointment?.statut !== 'Annulé' && (
                <Button type="button" onClick={handleSaveBilling} disabled={loading} className="w-full mt-2 bg-mint-600 hover:bg-mint-700 text-white">
                  {loading ? 'Validation...' : 'Confirmer le règlement'}
                </Button>
              )}
            </div>
          )}

          {/* Footer Actions */}
          <div className="pt-4 flex justify-between gap-3 border-t border-slate-100">
            <div>
              {selectedAppointment?.statut !== 'Effectué' && selectedAppointment?.statut !== 'Annulé' && (
                <Button type="button" variant="destructive" onClick={handleCancelAppointment} disabled={loading}>
                  Annuler le RDV
                </Button>
              )}
            </div>
            <Button type="button" variant="outline" onClick={() => setIsBillingModalOpen(false)}>
              Fermer
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
