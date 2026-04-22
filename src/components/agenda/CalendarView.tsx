import React, { useState, useEffect, useRef } from 'react';
import { format, addDays, startOfWeek, isSameDay, setHours, setMinutes, isSameMonth } from 'date-fns';
import { fr } from 'date-fns/locale';
import { ChevronLeft, ChevronRight, Calendar as CalendarIcon, Clock, User, Plus, CreditCard, Wallet, CheckCircle, Search, AlertCircle, ArrowLeft, ArrowRight } from 'lucide-react';
import { supabase } from '@/lib/supabaseClient';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Modal } from '@/components/ui/modal';
import { motion, AnimatePresence } from 'motion/react';

interface Patient {
  id: string;
  nom: string;
  prenom: string;
}

interface Therapist {
  id: string;
  nom: string;
  prenom: string;
  specialite: string;
}

interface Appointment {
  id: string;
  patient_id: string;
  therapist_id?: string;
  date_heure: string;
  duree: number;
  statut: string;
  notes_seance: string; // Utilisé pour stocker "Bilan" ou "Séance"
  patients?: { nom: string; prenom: string };
  therapists?: { nom: string; prenom: string };
}

const MOTIFS_SEANCE = [
  'Kinésithérapie classique',
  'Kiné-respiratoire',
  'Réathlétisation',
  'Cupping thérapie',
  'Onde de choc',
  'Tecar thérapie',
  'Récupération',
  'Rééducation vestibulaire',
  'Séance de bilan',
  'Consultation nutritionnelle',
  'Séance de contrôle',
  'Thérapie manuelle',
  'Séance à domicile',
  'Clinique Taghzout',
  'Clinique Chiekhe Essaadi Agadir'
];

export function CalendarView() {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [patients, setPatients] = useState<Patient[]>([]);
  const [therapists, setTherapists] = useState<Therapist[]>([]);
  const [selectedTherapistId, setSelectedTherapistId] = useState<string>('all');
  const [motifs, setMotifs] = useState<string[]>(MOTIFS_SEANCE);
  
  // Modal state
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [newAppointmentTime, setNewAppointmentTime] = useState('');
  const [newAppointmentMotif, setNewAppointmentMotif] = useState('Séance de Suivi');
  const [newAppointmentTherapist, setNewAppointmentTherapist] = useState('');
  const [showNewMotifDropdown, setShowNewMotifDropdown] = useState(false);
  
  // Form state
  const [selectedPatient, setSelectedPatient] = useState('');
  const [patientSearchQuery, setPatientSearchQuery] = useState('');
  const [isPatientDropdownOpen, setIsPatientDropdownOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Manage Modal state
  const [isBillingModalOpen, setIsBillingModalOpen] = useState(false);
  const [selectedAppointment, setSelectedAppointment] = useState<Appointment | null>(null);
  const [billingAmount, setBillingAmount] = useState('50');
  const [paymentType, setPaymentType] = useState('Patient');
  const [editDate, setEditDate] = useState('');
  const [editTime, setEditTime] = useState('');
  const [editMotif, setEditMotif] = useState('');
  const [editTherapist, setEditTherapist] = useState('');
  const [showEditMotifDropdown, setShowEditMotifDropdown] = useState(false);
  const [currentTime, setCurrentTime] = useState(new Date());
  const [isMobile, setIsMobile] = useState(false);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  // Setup grid (Lundi à Samedi, 8h à 20h)
  const startDate = startOfWeek(currentDate, { weekStartsOn: 1 });
  const displayedDays = isMobile 
    ? [currentDate] 
    : Array.from({ length: 7 }).map((_, i) => addDays(startDate, i));
  const hours = Array.from({ length: 14 }).map((_, i) => i + 7); // Start at 7h to be safe

  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < 768);
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(new Date());
    }, 60000); // Update every minute
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    fetchAppointments();
    fetchPatients();
    fetchTherapists();
    fetchMotifs();
  }, [currentDate]);

  const fetchTherapists = async () => {
    const { data, error } = await supabase
      .from('therapists')
      .select('*')
      .order('nom');
    if (!error && data) {
      setTherapists(data);
    }
  };

  const fetchMotifs = async () => {
    const { data, error } = await supabase.from('seance_motifs').select('nom');
    if (!error && data) {
      const dbMotifs = data.map(m => m.nom);
      const allMotifs = Array.from(new Set([...MOTIFS_SEANCE, ...dbMotifs]));
      setMotifs(allMotifs);
    } else {
      setMotifs(MOTIFS_SEANCE);
    }
  };

  const ensureMotifExists = async (motif: string) => {
    if (!motif) return;
    if (!motifs.includes(motif)) {
      const { error } = await supabase.from('seance_motifs').insert([{ nom: motif }]);
      if (!error) {
        setMotifs(prev => [...prev, motif]);
      }
    }
  };

  const fetchAppointments = async () => {
    // Try to fetch with joins
    let { data, error } = await supabase
      .from('appointments')
      .select('*, patients(nom, prenom), therapists(nom, prenom)');
      
    if (error) {
      console.warn("Join failed or error fetching appointments, trying robust fetch:", error.message);
      
      // Manual robust fetch: Get all appointments
      const { data: appData, error: appError } = await supabase.from('appointments').select('*');
      
      if (!appError && appData) {
        // Fetch all patients and therapists to map them manually
        const { data: patData } = await supabase.from('patients').select('id, nom, prenom');
        const { data: therData } = await supabase.from('therapists').select('id, nom, prenom');
        
        const patientsMap = new Map(patData ? patData.map(p => [p.id, p]) : []);
        const therapistsMap = new Map(therData ? therData.map(t => [t.id, t]) : []);
        
        data = appData.map(app => ({
          ...app,
          patients: patientsMap.get(app.patient_id),
          therapists: therapistsMap.get(app.therapist_id)
        }));
      } else {
        console.error("Critical error fetching appointments:", appError?.message);
        return;
      }
    }

    if (data) {
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
    setNewAppointmentTime(`${hour.toString().padStart(2, '0')}:00`);
    setErrorMsg(null);
    setSelectedPatient('');
    setPatientSearchQuery('');
    setIsPatientDropdownOpen(false);
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
    
    await ensureMotifExists(newAppointmentMotif);

    // Combine selectedDate and newAppointmentTime
    const [hours, minutes] = newAppointmentTime.split(':').map(Number);
    const finalDate = new Date(selectedDate);
    finalDate.setHours(hours, minutes, 0, 0);

    const { error } = await supabase
      .from('appointments')
      .insert([{
        patient_id: selectedPatient,
        therapist_id: newAppointmentTherapist || null,
        date_heure: finalDate.toISOString(),
        notes_seance: newAppointmentMotif
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
    
    await ensureMotifExists(editMotif);
    
    const newDateTime = new Date(`${editDate}T${editTime}`);
    const { error } = await supabase
      .from('appointments')
      .update({ 
        date_heure: newDateTime.toISOString(),
        notes_seance: editMotif,
        therapist_id: editTherapist || null
      })
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

  const handleSaveUnpaid = async () => {
    setErrorMsg(null);
    if (!selectedAppointment) return;

    setLoading(true);
    
    const { error } = await supabase
      .from('appointments')
      .update({ statut: 'Impayé' })
      .eq('id', selectedAppointment.id);

    setLoading(false);
    if (!error) {
      setIsBillingModalOpen(false);
      setSelectedAppointment(null);
      fetchAppointments();
    } else {
      setErrorMsg("Erreur d'enregistrement : " + error.message);
    }
  };

  const getAppointmentsForSlot = (day: Date, hour: number) => {
    return appointments.filter(app => {
      const appDate = new Date(app.date_heure);
      const matchesTherapist = selectedTherapistId === 'all' || app.therapist_id === selectedTherapistId;
      return isSameDay(appDate, day) && appDate.getHours() === hour && matchesTherapist;
    });
  };

  return (
    <div className="flex flex-col h-full space-y-6 bg-slate-50/30 p-4 rounded-xl border border-slate-100">
      {/* Header Controls */}
      <div className="flex flex-col md:flex-row items-start md:items-end justify-between gap-6">
        <div className="relative">
          <motion.div 
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex items-baseline gap-2 md:gap-4"
          >
            <h1 className="text-5xl md:text-7xl font-black text-slate-900/5 absolute -top-6 md:-top-10 -left-2 md:-left-4 pointer-events-none select-none uppercase tracking-tighter">
              {format(isMobile ? currentDate : startDate, 'MMMM', { locale: fr })}
            </h1>
            <h2 className="text-3xl md:text-4xl font-bold text-slate-900 capitalize tracking-tight flex items-center gap-2 md:gap-3 relative z-10">
              {format(isMobile ? currentDate : startDate, 'MMMM', { locale: fr })}
              <span className="text-primary-500 font-light">{format(isMobile ? currentDate : startDate, 'yyyy')}</span>
            </h2>
          </motion.div>
          <p className="text-slate-500 text-sm mt-1 font-medium">
            {isMobile 
              ? format(currentDate, 'EEEE d MMMM', { locale: fr })
              : `Semaine du ${format(startDate, 'd MMMM', { locale: fr })}`
            }
          </p>
        </div>

        <div className="flex items-center gap-3 bg-white p-1.5 rounded-2xl shadow-sm border border-slate-200 w-full md:w-auto justify-between md:justify-start">
          <div className="flex items-center gap-2 px-2 border-r border-slate-100">
            <User className="h-4 w-4 text-slate-400" />
            <select 
              value={selectedTherapistId}
              onChange={(e) => setSelectedTherapistId(e.target.value)}
              className="text-xs font-bold text-slate-600 bg-transparent border-none focus:ring-0 outline-none pr-8"
            >
              <option value="all">Tous les praticiens</option>
              {therapists.map(t => (
                <option key={t.id} value={t.id}>{t.prenom} {t.nom}</option>
              ))}
            </select>
          </div>
          <Button 
            variant="ghost" 
            size="sm" 
            onClick={() => setCurrentDate(new Date())}
            className="rounded-xl hover:bg-slate-100 text-slate-600 font-semibold px-4"
          >
            Aujourd'hui
          </Button>
          <div className="h-4 w-px bg-slate-200 mx-1 hidden md:block" />
          <div className="flex items-center gap-1">
            <Button 
              variant="ghost" 
              size="icon" 
              onClick={() => setCurrentDate(addDays(currentDate, isMobile ? -1 : -7))} 
              className="h-9 w-9 rounded-xl hover:bg-primary-50 hover:text-primary-600 transition-colors"
            >
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <Button 
              variant="ghost" 
              size="icon" 
              onClick={() => setCurrentDate(addDays(currentDate, isMobile ? 1 : 7))} 
              className="h-9 w-9 rounded-xl hover:bg-primary-50 hover:text-primary-600 transition-colors"
            >
              <ArrowRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>

      {/* Calendar Grid */}
      <Card className="flex-1 overflow-hidden flex flex-col shadow-xl border-slate-200/60 rounded-2xl bg-white">
        <div className="overflow-x-auto flex-1 scrollbar-thin scrollbar-thumb-slate-200 scrollbar-track-transparent" ref={scrollContainerRef}>
          <div className={`${isMobile ? 'min-w-full' : 'min-w-[900px]'} h-full flex flex-col relative`}>
            {/* Days Header */}
            <div className={`grid ${isMobile ? 'grid-cols-[60px_1fr]' : 'grid-cols-[80px_repeat(7,1fr)]'} border-b border-slate-200 bg-slate-50/50 backdrop-blur-sm sticky top-0 z-40`}>
              <div className="p-4 border-r border-slate-200 text-center text-[10px] font-bold text-slate-400 uppercase tracking-widest flex items-center justify-center bg-slate-50/80">
                GMT+1
              </div>
              {displayedDays.map((day, i) => {
                const dayAppointmentsCount = appointments.filter(app => isSameDay(new Date(app.date_heure), day) && app.statut !== 'Annulé').length;
                const isToday = isSameDay(day, new Date());
                return (
                  <div key={i} className={`p-4 border-r border-slate-200 text-center transition-colors ${isToday ? 'bg-primary-50/30' : ''}`}>
                    <div className={`text-[10px] font-bold uppercase tracking-widest ${isToday ? 'text-primary-600' : 'text-slate-400'}`}>
                      {format(day, 'EEEE', { locale: fr })}
                    </div>
                    <div className="mt-2 flex items-center justify-center">
                      <div className={`text-2xl font-black h-10 w-10 flex items-center justify-center rounded-xl transition-all ${
                        isToday ? 'bg-primary-600 text-white shadow-lg shadow-primary-200 scale-110' : 'text-slate-900'
                      }`}>
                        {format(day, 'd')}
                      </div>
                    </div>
                    {dayAppointmentsCount > 0 && (
                      <div className={`text-[10px] mt-2 font-bold px-2 py-0.5 rounded-full inline-block ${
                        isToday ? 'bg-primary-100 text-primary-700' : 'bg-slate-100 text-slate-500'
                      }`}>
                        {dayAppointmentsCount} RDV
                      </div>
                    )}
                  </div>
                )
              })}
            </div>

            {/* Time Slots */}
            <div className="flex-1 relative bg-white">
              {/* Current Time Indicator Line */}
              {displayedDays.some(day => isSameDay(day, currentTime)) && (
                <div 
                  className="absolute left-0 right-0 z-30 pointer-events-none flex items-center"
                  style={{ 
                    top: `${((currentTime.getHours() - 7) * 80) + (currentTime.getMinutes() / 60 * 80)}px`,
                    display: currentTime.getHours() >= 7 && currentTime.getHours() < 21 ? 'flex' : 'none'
                  }}
                >
                  <div className={`${isMobile ? 'w-[60px]' : 'w-[80px]'} flex justify-end pr-2`}>
                    <span className="bg-rose-500 text-white text-[9px] font-bold px-1.5 py-0.5 rounded shadow-sm">
                      {format(currentTime, 'HH:mm')}
                    </span>
                  </div>
                  <div className="flex-1 h-px bg-rose-500 shadow-[0_0_8px_rgba(244,63,94,0.4)] relative">
                    <div className="absolute -left-1 -top-1 h-2.2 w-2.2 rounded-full bg-rose-500 border-2 border-white shadow-sm" />
                  </div>
                </div>
              )}

              {hours.map((hour) => (
                <div key={hour} className={`grid ${isMobile ? 'grid-cols-[60px_1fr]' : 'grid-cols-[80px_repeat(7,1fr)]'} border-b border-slate-100 min-h-[80px] group/row`}>
                  <div className="p-3 border-r border-slate-200 text-right text-[11px] font-bold text-slate-400 sticky left-0 bg-slate-50/80 backdrop-blur-sm z-20 flex flex-col justify-start">
                    <span>{hour}:00</span>
                    <span className="text-[9px] opacity-0 group-hover/row:opacity-100 transition-opacity mt-1 font-medium">
                      {hour}:30
                    </span>
                  </div>
                  {displayedDays.map((day, dayIdx) => {
                    const slotAppointments = getAppointmentsForSlot(day, hour);
                    const isToday = isSameDay(day, new Date());
                    return (
                      <div 
                        key={dayIdx} 
                        className={`border-r border-slate-100 p-1 relative group transition-all cursor-pointer ${
                          isToday ? 'bg-primary-50/5' : ''
                        } hover:bg-slate-50/80`}
                        onClick={() => handleSlotClick(day, hour)}
                      >
                        {/* Hover indicator for empty slot */}
                        {slotAppointments.length === 0 && (
                          <div className="absolute inset-1.5 rounded-xl border-2 border-dashed border-slate-200 bg-slate-50/50 opacity-0 group-hover:opacity-100 transition-all flex items-center justify-center pointer-events-none scale-95 group-hover:scale-100">
                            <Plus className="h-4 w-4 text-slate-400 mr-1" />
                            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Réserver</span>
                          </div>
                        )}

                        {/* Appointments */}
                        <AnimatePresence>
                          {slotAppointments.map((app, index) => {
                            const isBilan = app.notes_seance === 'Séance de bilan' || app.notes_seance === 'Bilan Initial';
                            const startMin = new Date(app.date_heure).getMinutes();
                            const count = slotAppointments.length;
                            
                            let statusStyles = 'bg-white border-primary-200 text-primary-900 shadow-primary-100/50 hover:shadow-primary-200/60'; // Confirmé
                            let accentColor = 'bg-primary-500';
                            
                            if (app.statut === 'Effectué') {
                              statusStyles = 'bg-emerald-50/50 border-emerald-200 text-emerald-900 shadow-emerald-100/50 hover:bg-emerald-50';
                              accentColor = 'bg-emerald-500';
                            } else if (app.statut === 'Annulé') {
                              statusStyles = 'bg-slate-50 border-slate-200 text-slate-400 opacity-60 hover:opacity-100';
                              accentColor = 'bg-slate-300';
                            } else if (app.statut === 'Impayé') {
                              statusStyles = 'bg-rose-50 border-rose-200 text-rose-900 shadow-rose-100/50 hover:bg-rose-100/50';
                              accentColor = 'bg-rose-500';
                            } else if (isBilan) {
                              statusStyles = 'bg-indigo-50 border-indigo-200 text-indigo-900 shadow-indigo-100/50 hover:bg-indigo-100/50';
                              accentColor = 'bg-indigo-500';
                            }
                            
                            const isNarrow = count > 1;
                            
                            return (
                              <motion.div 
                                key={app.id}
                                initial={{ opacity: 0, scale: 0.95 }}
                                animate={{ opacity: 1, scale: 1 }}
                                exit={{ opacity: 0, scale: 0.95 }}
                                className={`absolute rounded-xl ${isNarrow ? 'p-1.5' : 'px-2.5 py-2'} text-[11px] border shadow-md z-10 overflow-hidden transition-all duration-200 cursor-pointer group/app ${statusStyles} hover:!z-50 hover:!h-auto hover:!min-h-[60px] hover:!w-[140px] hover:shadow-xl`}
                                style={{
                                  top: `${(startMin / 60) * 100}%`,
                                  height: `calc(${((app.duree || 30) / 60) * 100}% - 4px)`,
                                  minHeight: '40px',
                                  left: count > 1 ? `calc(${(index / count) * 100}% + 2px)` : '4px',
                                  width: count > 1 ? `calc(${(100 / count)}% - 4px)` : 'calc(100% - 8px)',
                                }}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setSelectedAppointment(app);
                                  const appDate = new Date(app.date_heure);
                                  setEditDate(format(appDate, 'yyyy-MM-dd'));
                                  setEditTime(format(appDate, 'HH:mm'));
                                  setEditMotif(app.notes_seance || 'Séance de Suivi');
                                  setEditTherapist(app.therapist_id || '');
                                  setErrorMsg(null);
                                  setIsBillingModalOpen(true);
                                }}
                              >
                                <div className={`absolute left-0 top-0 bottom-0 ${isNarrow ? 'w-0.5' : 'w-1'} ${accentColor}`} />
                                <div className={`font-bold flex items-start justify-between ${isNarrow ? 'mb-0' : 'mb-1'} gap-1 pl-1`}>
                                  <span className={`${isNarrow ? 'line-clamp-2 text-[10px] leading-tight break-words group-hover/app:line-clamp-none group-hover/app:text-[11px]' : 'truncate'}`}>
                                    {app.patients ? `${app.patients.prenom} ${app.patients.nom}` : (app.patient_id ? `Chargement...` : 'Patient inconnu')}
                                  </span>
                                  <div className={`flex shrink-0 ${isNarrow ? 'hidden group-hover/app:flex' : ''}`}>
                                    {app.statut === 'Effectué' && <CheckCircle className="h-3 w-3 text-emerald-500" />}
                                    {app.statut === 'Impayé' && <AlertCircle className="h-3 w-3 text-rose-500 animate-pulse" />}
                                  </div>
                                </div>
                                {app.therapists && (
                                  <div className={`text-[9px] font-bold uppercase tracking-tighter text-slate-500/60 mb-1 pl-1 ${isNarrow ? 'hidden group-hover/app:block' : ''}`}>
                                    Praticien: {app.therapists.prenom} {app.therapists.nom}
                                  </div>
                                )}
                                <div className={`${isNarrow ? 'hidden group-hover/app:flex' : 'flex'} items-center gap-1.5 opacity-70 font-medium pl-1 mt-1`}>
                                  <Clock className="h-3 w-3 shrink-0" />
                                  <span className="truncate">{format(new Date(app.date_heure), 'HH:mm')} {app.notes_seance ? `• ${app.notes_seance}` : ''}</span>
                                </div>
                              </motion.div>
                            );
                          })}
                        </AnimatePresence>
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
        maxWidth="sm"
      >
        <form onSubmit={handleSaveAppointment} className="space-y-6">
          {errorMsg && (
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="p-4 text-sm text-rose-600 bg-rose-50 rounded-xl border border-rose-100 flex items-center gap-3"
            >
              <AlertCircle className="h-5 w-5 shrink-0" />
              {errorMsg}
            </motion.div>
          )}
          
          {selectedDate && (
            <div className="flex flex-col gap-4 bg-slate-50 p-4 rounded-2xl border border-slate-100 shadow-inner">
              <div className="flex items-center gap-3 text-slate-700">
                <div className="h-10 w-10 rounded-xl bg-white shadow-sm border border-slate-200 flex items-center justify-center">
                  <CalendarIcon className="h-5 w-5 text-primary-500" />
                </div>
                <div>
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Date sélectionnée</p>
                  <p className="font-bold text-slate-900">
                    {format(selectedDate, 'EEEE d MMMM yyyy', { locale: fr })}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-xl bg-white shadow-sm border border-slate-200 flex items-center justify-center">
                  <Clock className="h-5 w-5 text-primary-500" />
                </div>
                <div className="flex-1">
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Heure du rendez-vous</p>
                  <input
                    type="time"
                    required
                    value={newAppointmentTime}
                    onChange={(e) => setNewAppointmentTime(e.target.value)}
                    className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-bold text-slate-900 focus:border-primary-500 focus:outline-none focus:ring-4 focus:ring-primary-500/10 transition-all"
                  />
                </div>
              </div>
            </div>
          )}

          <div className="space-y-2 relative">
            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">Praticien</label>
            <select
              value={newAppointmentTherapist}
              onChange={(e) => setNewAppointmentTherapist(e.target.value)}
              className="w-full p-3 border border-slate-200 rounded-xl font-medium text-slate-900 focus:ring-4 focus:ring-primary-500/10 focus:border-primary-500 transition-all bg-slate-50/50 outline-none"
            >
              <option value="">Sélectionner un praticien (optionnel)</option>
              {therapists.map(t => (
                <option key={t.id} value={t.id}>{t.prenom} {t.nom}</option>
              ))}
            </select>
          </div>

          <div className="space-y-2 relative">
            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">Motif de la séance</label>
            <input
              type="text"
              value={newAppointmentMotif}
              onChange={(e) => {
                setNewAppointmentMotif(e.target.value);
                setShowNewMotifDropdown(true);
              }}
              onFocus={() => setShowNewMotifDropdown(true)}
              onBlur={() => setTimeout(() => setShowNewMotifDropdown(false), 200)}
              placeholder="Sélectionner ou écrire un motif..."
              className="w-full p-3 border border-slate-200 rounded-xl font-medium text-slate-900 focus:ring-4 focus:ring-primary-500/10 focus:border-primary-500 transition-all bg-slate-50/50"
            />
            {showNewMotifDropdown && (
              <div className="absolute z-50 w-full mt-1 bg-white border border-slate-200 rounded-xl shadow-lg max-h-48 overflow-y-auto">
                {motifs.filter(m => m.toLowerCase().includes(newAppointmentMotif.toLowerCase())).map(m => (
                  <div 
                    key={m} 
                    onMouseDown={(e) => {
                      e.preventDefault();
                      setNewAppointmentMotif(m);
                      setShowNewMotifDropdown(false);
                    }}
                    className="p-3 hover:bg-slate-50 cursor-pointer text-sm font-medium text-slate-700 border-b border-slate-50 last:border-0"
                  >
                    {m}
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="space-y-2 relative">
            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1 flex items-center gap-2">
              Patient
            </label>
            <div className="relative group">
              <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                <Search className="h-4 w-4 text-slate-400 group-focus-within:text-primary-500 transition-colors" />
              </div>
              <input
                type="text"
                required={!selectedPatient}
                value={patientSearchQuery}
                onChange={(e) => {
                  setPatientSearchQuery(e.target.value);
                  setSelectedPatient('');
                  setIsPatientDropdownOpen(true);
                }}
                onFocus={() => setIsPatientDropdownOpen(true)}
                placeholder="Rechercher un patient..."
                className="w-full rounded-xl border border-slate-200 pl-11 pr-4 py-3 text-sm font-medium text-slate-900 focus:border-primary-500 focus:outline-none focus:ring-4 focus:ring-primary-500/10 transition-all bg-slate-50/50"
              />
            </div>
            
            <AnimatePresence>
              {isPatientDropdownOpen && patientSearchQuery && (
                <motion.div 
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  className="absolute z-50 w-full mt-2 bg-white border border-slate-200 rounded-2xl shadow-2xl max-h-60 overflow-y-auto p-2"
                >
                  {patients.filter(p => `${p.nom} ${p.prenom}`.toLowerCase().includes(patientSearchQuery.toLowerCase())).length > 0 ? (
                    patients.filter(p => `${p.nom} ${p.prenom}`.toLowerCase().includes(patientSearchQuery.toLowerCase())).map(p => (
                      <div
                        key={p.id}
                        className="px-4 py-3 text-sm hover:bg-primary-50 rounded-xl cursor-pointer text-slate-700 font-medium transition-colors flex items-center gap-3"
                        onClick={() => {
                          setSelectedPatient(p.id);
                          setPatientSearchQuery(`${p.nom} ${p.prenom}`);
                          setIsPatientDropdownOpen(false);
                        }}
                      >
                        <div className="h-8 w-8 rounded-full bg-slate-100 flex items-center justify-center text-slate-500 font-bold text-xs">
                          {p.nom[0]}{p.prenom[0]}
                        </div>
                        {p.nom} {p.prenom}
                      </div>
                    ))
                  ) : (
                    <div className="px-4 py-8 text-center">
                      <User className="h-8 w-8 text-slate-200 mx-auto mb-2" />
                      <p className="text-sm text-slate-400 font-medium">Aucun patient trouvé.</p>
                    </div>
                  )}
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          <div className="pt-6 flex flex-col sm:flex-row gap-3">
            <Button 
              type="button" 
              variant="ghost" 
              onClick={() => setIsModalOpen(false)}
              className="flex-1 rounded-xl h-12 font-bold text-slate-500 hover:bg-slate-100"
            >
              Annuler
            </Button>
            <Button 
              type="submit" 
              disabled={loading}
              className="flex-1 rounded-xl h-12 font-bold bg-primary-600 hover:bg-primary-700 shadow-lg shadow-primary-200 transition-all active:scale-95"
            >
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
        maxWidth="sm"
      >
        <div className="space-y-6">
          {errorMsg && (
            <div className="p-4 text-sm text-rose-600 bg-rose-50 rounded-xl border border-rose-100 flex items-center gap-3">
              <AlertCircle className="h-5 w-5 shrink-0" />
              {errorMsg}
            </div>
          )}

          {selectedAppointment?.statut === 'Effectué' && (
            <div className="p-4 text-sm text-emerald-700 bg-emerald-50 rounded-2xl border border-emerald-100 flex items-center gap-3 font-bold">
              <div className="h-8 w-8 rounded-full bg-emerald-500 flex items-center justify-center text-white">
                <CheckCircle className="h-5 w-5" />
              </div>
              Séance facturée et réglée.
            </div>
          )}

          {selectedAppointment?.statut === 'Impayé' && (
            <div className="p-4 text-sm text-rose-700 bg-rose-50 rounded-2xl border border-rose-100 flex items-center gap-3 font-bold">
              <div className="h-8 w-8 rounded-full bg-rose-500 flex items-center justify-center text-white">
                <AlertCircle className="h-5 w-5" />
              </div>
              Séance marquée comme non payée.
            </div>
          )}

          {selectedAppointment?.statut === 'Annulé' && (
            <div className="p-4 text-sm text-slate-500 bg-slate-50 rounded-2xl border border-slate-200 flex items-center gap-3 font-bold italic">
              Rendez-vous annulé.
            </div>
          )}
          
          {selectedAppointment && (
            <div className="flex items-center gap-4 bg-slate-50 p-4 rounded-2xl border border-slate-100 shadow-inner">
              <div className="h-12 w-12 rounded-2xl bg-white shadow-sm border border-slate-200 flex items-center justify-center text-primary-500 font-black text-lg">
                {selectedAppointment.patients?.nom[0]}{selectedAppointment.patients?.prenom[0]}
              </div>
              <div>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Patient</p>
                <p className="font-black text-slate-900 text-lg">
                  {selectedAppointment.patients?.prenom} {selectedAppointment.patients?.nom}
                </p>
              </div>
            </div>
          )}

          {/* Date and Time Modification */}
          <div className="space-y-4 bg-white p-5 rounded-2xl border border-slate-100 shadow-sm">
            <div className="flex items-center justify-between">
              <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Détails du RDV</h4>
              <div className="h-1 w-12 bg-slate-100 rounded-full" />
            </div>
            
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">Date</label>
                <input
                  type="date"
                  value={editDate}
                  onChange={(e) => setEditDate(e.target.value)}
                  disabled={selectedAppointment?.statut === 'Effectué' || selectedAppointment?.statut === 'Annulé'}
                  className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-bold text-slate-900 focus:border-primary-500 focus:outline-none focus:ring-4 focus:ring-primary-500/10 transition-all disabled:bg-slate-50 disabled:text-slate-400"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">Heure</label>
                <input
                  type="time"
                  value={editTime}
                  onChange={(e) => setEditTime(e.target.value)}
                  disabled={selectedAppointment?.statut === 'Effectué' || selectedAppointment?.statut === 'Annulé'}
                  className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-bold text-slate-900 focus:border-primary-500 focus:outline-none focus:ring-4 focus:ring-primary-500/10 transition-all disabled:bg-slate-50 disabled:text-slate-400"
                />
              </div>
              <div className="space-y-1.5 col-span-2 relative">
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">Praticien</label>
                <select
                  value={editTherapist}
                  onChange={(e) => setEditTherapist(e.target.value)}
                  disabled={selectedAppointment?.statut === 'Effectué' || selectedAppointment?.statut === 'Annulé'}
                  className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-bold text-slate-900 focus:border-primary-500 focus:outline-none focus:ring-4 focus:ring-primary-500/10 transition-all disabled:bg-slate-50 disabled:text-slate-400 bg-slate-50/30 outline-none"
                >
                  <option value="">Non assigné</option>
                  {therapists.map(t => (
                    <option key={t.id} value={t.id}>{t.prenom} {t.nom}</option>
                  ))}
                </select>
              </div>
              <div className="space-y-1.5 col-span-2 relative">
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">Motif</label>
                <input
                  type="text"
                  value={editMotif}
                  onChange={(e) => {
                    setEditMotif(e.target.value);
                    setShowEditMotifDropdown(true);
                  }}
                  onFocus={() => setShowEditMotifDropdown(true)}
                  onBlur={() => setTimeout(() => setShowEditMotifDropdown(false), 200)}
                  disabled={selectedAppointment?.statut === 'Effectué' || selectedAppointment?.statut === 'Annulé'}
                  placeholder="Sélectionner ou écrire un motif..."
                  className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-bold text-slate-900 focus:border-primary-500 focus:outline-none focus:ring-4 focus:ring-primary-500/10 transition-all disabled:bg-slate-50 disabled:text-slate-400 bg-slate-50/30"
                />
                {showEditMotifDropdown && !(selectedAppointment?.statut === 'Effectué' || selectedAppointment?.statut === 'Annulé') && (
                  <div className="absolute z-50 w-full mt-1 bg-white border border-slate-200 rounded-xl shadow-lg max-h-48 overflow-y-auto">
                    {motifs.filter(m => m.toLowerCase().includes(editMotif.toLowerCase())).map(m => (
                      <div 
                        key={m} 
                        onMouseDown={(e) => {
                          e.preventDefault();
                          setEditMotif(m);
                          setShowEditMotifDropdown(false);
                        }}
                        className="p-3 hover:bg-slate-50 cursor-pointer text-sm font-medium text-slate-700 border-b border-slate-50 last:border-0"
                      >
                        {m}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
            {selectedAppointment?.statut !== 'Effectué' && selectedAppointment?.statut !== 'Annulé' && (
              <Button 
                type="button" 
                variant="secondary" 
                size="sm" 
                onClick={handleUpdateAppointment} 
                disabled={loading} 
                className="w-full mt-2 rounded-xl h-10 font-bold bg-slate-100 hover:bg-slate-200 text-slate-700 transition-all"
              >
                Mettre à jour
              </Button>
            )}
          </div>

          {/* Billing Section */}
          {selectedAppointment?.statut !== 'Annulé' && (
            <div className="space-y-4 bg-white p-5 rounded-2xl border border-slate-100 shadow-sm">
              <div className="flex items-center justify-between">
                <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Règlement</h4>
                <Wallet className="h-4 w-4 text-slate-200" />
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">Montant (DH)</label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                      <Wallet className="h-3 w-3 text-slate-400" />
                    </div>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={billingAmount}
                      onChange={(e) => setBillingAmount(e.target.value)}
                      disabled={selectedAppointment?.statut === 'Effectué'}
                      className="w-full rounded-xl border border-slate-200 pl-8 pr-4 py-2.5 text-sm font-bold text-slate-900 focus:border-primary-500 focus:outline-none focus:ring-4 focus:ring-primary-500/10 transition-all disabled:bg-slate-50 disabled:text-slate-400"
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">Paiement</label>
                  <select
                    value={paymentType}
                    onChange={(e) => setPaymentType(e.target.value)}
                    disabled={selectedAppointment?.statut === 'Effectué'}
                    className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-bold text-slate-900 focus:border-primary-500 focus:outline-none focus:ring-4 focus:ring-primary-500/10 transition-all disabled:bg-slate-50 disabled:text-slate-400 appearance-none bg-slate-50/30"
                  >
                    <option value="Patient">Direct</option>
                    <option value="Mutuelle">Mutuelle</option>
                    <option value="Tiers-payant">Tiers-payant</option>
                    <option value="Hors nomenclature">Hors nom.</option>
                  </select>
                </div>
              </div>

              {selectedAppointment?.statut !== 'Effectué' && selectedAppointment?.statut !== 'Annulé' && (
                <div className="flex flex-col gap-3 mt-2">
                  <Button 
                    type="button" 
                    onClick={handleSaveBilling} 
                    disabled={loading} 
                    className="w-full h-12 rounded-xl font-black bg-emerald-600 hover:bg-emerald-700 shadow-lg shadow-emerald-100 transition-all active:scale-95"
                  >
                    {loading ? 'Validation...' : 'Confirmer le règlement'}
                  </Button>
                  {selectedAppointment?.statut !== 'Impayé' && (
                    <Button 
                      type="button" 
                      onClick={handleSaveUnpaid} 
                      disabled={loading} 
                      variant="ghost" 
                      className="w-full h-10 rounded-xl font-bold text-rose-600 hover:bg-rose-50 transition-colors"
                    >
                      {loading ? '...' : 'Marquer comme impayé'}
                    </Button>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Footer Actions */}
          <div className="pt-6 flex items-center justify-between gap-4">
            {selectedAppointment?.statut !== 'Effectué' && selectedAppointment?.statut !== 'Annulé' && (
              <Button 
                type="button" 
                variant="ghost" 
                onClick={handleCancelAppointment} 
                disabled={loading}
                className="rounded-xl font-bold text-rose-500 hover:bg-rose-50 hover:text-rose-600"
              >
                Annuler le RDV
              </Button>
            )}
            <Button 
              type="button" 
              variant="outline" 
              onClick={() => setIsBillingModalOpen(false)}
              className="rounded-xl font-bold border-slate-200 text-slate-500 hover:bg-slate-50 px-8"
            >
              Fermer
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
