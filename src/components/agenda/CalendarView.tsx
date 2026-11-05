import React, { useState, useEffect, useRef } from 'react';
import { format, addDays, subDays, startOfWeek, isSameDay, setHours, setMinutes, isSameMonth } from 'date-fns';
import { fr } from 'date-fns/locale';
import { ChevronLeft, ChevronRight, Calendar as CalendarIcon, Clock, User, Plus, CreditCard, Wallet, CheckCircle, Search, AlertCircle, ArrowLeft, ArrowRight, Bell, FolderOpen, Trophy, Lock, ShieldCheck, Edit2, X } from 'lucide-react';
import { supabase } from '@/lib/supabaseClient';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Modal } from '@/components/ui/modal';
import { motion, AnimatePresence } from 'motion/react';
import { useAppointmentNotifications } from '@/contexts/AppointmentNotificationsContext';
import { getMoroccoNow, parseClinicDate, toClinicIsoString } from '@/lib/timeUtils';
import { parsePatientMutuelle } from '@/lib/mutuelleUtils';
import { resolveOrBindCollaboratorSession } from '@/lib/teamUtils';
import { roundMoney, isPaidBillingStatus } from '@/lib/financeUtils';
import { openPatientDossier } from '@/lib/patientNavigation';
import { DualMotifSelector } from '@/components/motifs/DualMotifSelector';
import { STANDARD_MOTIFS } from '@/lib/motifUtils';

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
  patients?: { nom: string; prenom: string; telephone?: string; pathologie?: string; atcd?: string; follow_up_status?: string };
  therapists?: { nom: string; prenom: string };
}

const MOTIFS_SEANCE = STANDARD_MOTIFS;

export function CalendarView({ onSelectPatient }: { onSelectPatient?: (id: string) => void }) {
  const { requests, pendingCount, approveRequest } = useAppointmentNotifications();
  const [currentDate, setCurrentDate] = useState<Date>(() => {
    try {
      const saved = sessionStorage.getItem('reforme_agenda_current_date');
      if (saved) {
        const parsed = new Date(saved);
        if (!isNaN(parsed.getTime())) return parsed;
      }
    } catch {}
    return getMoroccoNow();
  });
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
  const [existingBilling, setExistingBilling] = useState<any | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [billingAmount, setBillingAmount] = useState('50');
  const [paymentType, setPaymentType] = useState('Patient');
  const [editDate, setEditDate] = useState('');
  const [editTime, setEditTime] = useState('');
  const [editMotif, setEditMotif] = useState('');
  const [editTherapist, setEditTherapist] = useState('');
  const [showEditMotifDropdown, setShowEditMotifDropdown] = useState(false);
  const [currentTime, setCurrentTime] = useState(() => getMoroccoNow());
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
    const updateNow = () => setCurrentTime(getMoroccoNow());
    updateNow();
    const timer = setInterval(updateNow, 15000);
    window.addEventListener('reforme-time-updated', updateNow);
    return () => {
      clearInterval(timer);
      window.removeEventListener('reforme-time-updated', updateNow);
    };
  }, []);

  useEffect(() => {
    const loadCurrentRole = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (session) {
          const profile = await resolveOrBindCollaboratorSession(supabase, {
            id: session.user.id,
            email: session.user.email,
          });
          setIsAdmin(profile?.role === 'admin');
        }
      } catch (err) {
        console.warn('Could not determine user role in CalendarView:', err);
      }
    };
    loadCurrentRole();
  }, []);

  useEffect(() => {
    const fetchBillingForAppointment = async () => {
      if (selectedAppointment) {
        const { data: rows, error } = await supabase
          .from('billings')
          .select('*')
          .eq('appointment_id', selectedAppointment.id)
          .order('date_facturation', { ascending: false });

        const primary =
          !error && rows && rows.length > 0
            ? rows.find((r) => isPaidBillingStatus(r.statut)) || rows[0]
            : null;

        if (primary) {
          setExistingBilling(primary);
          setBillingAmount(String(roundMoney(primary.montant ?? 50)));
          setPaymentType(primary.type_paiement || 'Patient');
        } else {
          setExistingBilling(null);
          setBillingAmount('50');
          setPaymentType('Patient');
        }
      } else {
        setExistingBilling(null);
      }
    };
    fetchBillingForAppointment();
  }, [selectedAppointment]);

  useEffect(() => {
    try {
      sessionStorage.setItem('reforme_agenda_current_date', currentDate.toISOString());
    } catch {}
    fetchAppointments();
    fetchPatients();
    fetchTherapists();
    fetchMotifs();

    const handleFocus = () => fetchAppointments();
    const handlePainEvent = () => fetchAppointments();
    window.addEventListener('focus', handleFocus);
    window.addEventListener('reforme_pain_updated', handlePainEvent);
    return () => {
      window.removeEventListener('focus', handleFocus);
      window.removeEventListener('reforme_pain_updated', handlePainEvent);
    };
  }, [currentDate]);

  const handleOpenPatientDossier = (patientId?: string) => {
    if (!patientId) return;
    try {
      sessionStorage.setItem('reforme_agenda_current_date', currentDate.toISOString());
    } catch {}
    setIsBillingModalOpen(false);
    setIsModalOpen(false);
    if (onSelectPatient) {
      onSelectPatient(patientId);
    } else {
      openPatientDossier(patientId, 'agenda');
    }
  };

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
    const parts = motif.split(/\s*(?:\+|\/|&)\s*/).map(p => p.trim()).filter(Boolean);
    for (const part of parts) {
      if (!motifs.some(m => m.toLowerCase() === part.toLowerCase())) {
        const { error } = await supabase.from('seance_motifs').insert([{ nom: part }]);
        if (!error) {
          setMotifs(prev => [...prev, part]);
        }
      }
    }
  };

  const fetchAppointments = async () => {
    const startRange = subDays(currentDate, 35).toISOString();
    const endRange = addDays(currentDate, 35).toISOString();

    // Manual robust fetch to handle serialized therapist IDs and manually join relations
    const { data: appData, error: appError } = await supabase
      .from('appointments')
      .select('*')
      .gte('date_heure', startRange)
      .lte('date_heure', endRange);
    
    if (!appError && appData) {
      const { data: patData } = await supabase.from('patients').select('id, nom, prenom, telephone, pathologie, atcd, follow_up_status');
      const { data: therData } = await supabase.from('therapists').select('id, nom, prenom');
      
      const patientsMap = new Map(patData ? patData.map(p => [p.id, p]) : []);
      const therapistsMap = new Map(therData ? therData.map(t => [t.id, t]) : []);
      
      const mappedData = appData.map(app => {
        let cleanNotes = app.notes_seance || '';
        let resolvedTherapistId = app.therapist_id;
        
        if (cleanNotes.includes('||TH_ID:')) {
          const match = cleanNotes.match(/\|\|TH_ID:([a-f0-9-]+)\|\|(.*)/s);
          if (match) {
            resolvedTherapistId = match[1];
            cleanNotes = match[2];
          }
        }
        
        return {
          ...app,
          therapist_id: resolvedTherapistId,
          notes_seance: cleanNotes,
          patients: patientsMap.get(app.patient_id),
          therapists: therapistsMap.get(resolvedTherapistId)
        };
      });
      
      setAppointments(mappedData);
    } else if (appError) {
      console.warn("Avertissement chargement rendez-vous:", appError?.message);
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
    
    // Safely set the initial therapist choice for the new appointment
    const activeTherapistId = selectedTherapistId !== 'all' ? selectedTherapistId : '';
    const therapistExists = therapists.some(t => t.id === activeTherapistId);
    setNewAppointmentTherapist(therapistExists ? activeTherapistId : '');
    
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

    // Combine selectedDate and newAppointmentTime in Morocco clinic time
    const isoDateHeure = toClinicIsoString(selectedDate, newAppointmentTime);

    // Ensure the selected therapist still exists in DB to prevent foreign key violation
    const validTherapistIds = therapists.map(t => t.id);
    const therapistIdToInsert = validTherapistIds.includes(newAppointmentTherapist) ? newAppointmentTherapist : null;

    // To prevent appointments_therapist_id_fkey foreign key violation on DB (due to legacy team_members constraint),
    // we set therapist_id to null in database and store therapistIdToInsert as metadata in notes_seance.
    const dbNotes = therapistIdToInsert ? `||TH_ID:${therapistIdToInsert}||${newAppointmentMotif}` : newAppointmentMotif;

    const { error } = await supabase
      .from('appointments')
      .insert([{
        patient_id: selectedPatient,
        therapist_id: null, // Always null in DB to prevent foreign key constraint violation
        date_heure: isoDateHeure,
        notes_seance: dbNotes,
        statut: 'Confirmé',
        duree: 30
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
    
    const isoDateTime = toClinicIsoString(editDate, editTime);

    // Ensure the edited therapist still exists in DB to prevent foreign key violation
    const validTherapistIds = therapists.map(t => t.id);
    const therapistIdToUpdate = validTherapistIds.includes(editTherapist) ? editTherapist : null;

    // To prevent appointments_therapist_id_fkey foreign key violation on DB,
    // we set therapist_id to null in database and store therapistIdToUpdate as metadata in notes_seance.
    const dbNotes = therapistIdToUpdate ? `||TH_ID:${therapistIdToUpdate}||${editMotif}` : editMotif;

    const { error } = await supabase
      .from('appointments')
      .update({ 
        date_heure: isoDateTime,
        notes_seance: dbNotes,
        therapist_id: null // Always null in DB to prevent foreign key constraint violation
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

    // Supprimer tout règlement/impayé rattaché afin de ne laisser aucun montant fantôme dans la comptabilité
    await supabase.from('billings').delete().eq('appointment_id', selectedAppointment.id);

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

  const handleValidatePendingDemand = async () => {
    if (!selectedAppointment) return;
    setLoading(true);
    try {
      const isReport = selectedAppointment.notes_seance?.includes('REPORT');
      let updatePayload: any = {
        statut: 'Programmé'
      };

      if (isReport) {
        const dateMatch = selectedAppointment.notes_seance.match(/Date souhaitée:\s*([^\s|]+)\s*(?:à|a)?\s*([^\s|]+)?/i);
        if (dateMatch && dateMatch[1]) {
          const reqDate = dateMatch[1].trim();
          const rawTime = (dateMatch[2] || '10:00').trim();
          const hm = rawTime.slice(0, 5);
          updatePayload.date_heure = /^\d{4}-\d{2}-\d{2}$/.test(reqDate)
            ? toClinicIsoString(reqDate, /^\d{2}:\d{2}$/.test(hm) ? hm : '10:00')
            : `${reqDate}T${rawTime.length === 5 ? rawTime + ':00' : rawTime}`;
        }
        updatePayload.notes_seance = `Report validé (${selectedAppointment.notes_seance.replace(/\[DEMANDE_REPORT\]/g, '').trim()})`;
      } else {
        updatePayload.notes_seance = selectedAppointment.notes_seance?.replace(/\[DEMANDE.*?\]/g, '').trim() || 'Séance confirmée';
      }

      const { error } = await supabase.from('appointments').update(updatePayload).eq('id', selectedAppointment.id);
      if (error) throw error;

      await fetchAppointments();
      setIsBillingModalOpen(false);
    } catch (err: any) {
      setErrorMsg("Erreur lors de la validation: " + err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleSaveBilling = async () => {
    setErrorMsg(null);

    if (!selectedAppointment) return;

    const rawAmount = parseFloat(billingAmount);
    if (isNaN(rawAmount) || rawAmount < 0) {
      setErrorMsg("Veuillez indiquer un montant valide.");
      return;
    }
    const parsedAmount = roundMoney(rawAmount);

    setLoading(true);

    // Check existing billing rows (array to safely clean up any accidental duplicates)
    const { data: existingRows } = await supabase
      .from('billings')
      .select('*')
      .eq('appointment_id', selectedAppointment.id)
      .order('date_facturation', { ascending: false });

    const existingBill =
      existingRows && existingRows.length > 0
        ? existingRows.find((r) => isPaidBillingStatus(r.statut)) || existingRows[0]
        : null;

    if (existingBill && isPaidBillingStatus(existingBill.statut) && !isAdmin) {
      setLoading(false);
      setErrorMsg("Seul l'administrateur est autorisé à modifier un règlement déjà validé.");
      return;
    }

    await ensureMotifExists(editMotif);

    const isoDateTime = toClinicIsoString(editDate, editTime);
    const validTherapistIds = therapists.map(t => t.id);
    const therapistIdToUpdate = validTherapistIds.includes(editTherapist) ? editTherapist : null;
    const dbNotes = therapistIdToUpdate ? `||TH_ID:${therapistIdToUpdate}||${editMotif}` : editMotif;
    
    // 1. Mettre à jour le statut, la date, le praticien et le motif du rendez-vous
    const { error: apptUpdateError } = await supabase
      .from('appointments')
      .update({ 
        statut: 'Effectué',
        date_heure: isoDateTime,
        notes_seance: dbNotes,
        therapist_id: null // Always null in DB to prevent foreign key constraint violation
      })
      .eq('id', selectedAppointment.id);

    if (apptUpdateError) {
      setLoading(false);
      setErrorMsg("Erreur de mise à jour du rendez-vous : " + apptUpdateError.message);
      return;
    }

    let billingError;
    if (existingBill) {
      const updatePayload: any = isAdmin
        ? {
            montant: parsedAmount,
            type_paiement: paymentType,
            statut: 'Payé',
          }
        : {
            statut: 'Payé',
            date_facturation: new Date().toISOString(),
          };

      const { error } = await supabase
        .from('billings')
        .update(updatePayload)
        .eq('id', existingBill.id);
      billingError = error;

      // Remove any duplicate ghost billing rows on the same appointment
      if (!error && existingRows && existingRows.length > 1) {
        const extraIds = existingRows.filter((r) => r.id !== existingBill.id).map((r) => r.id);
        if (extraIds.length > 0) {
          await supabase.from('billings').delete().in('id', extraIds);
        }
      }
    } else {
      // Créer une nouvelle facture (premier enregistrement)
      const { error } = await supabase
        .from('billings')
        .insert([{
          patient_id: selectedAppointment.patient_id,
          appointment_id: selectedAppointment.id,
          montant: parsedAmount,
          type_paiement: paymentType,
          statut: 'Payé'
        }]);
      billingError = error;
    }

    setLoading(false);
    if (!billingError) {
      setIsBillingModalOpen(false);
      setSelectedAppointment(null);
      fetchAppointments();
    } else {
      setErrorMsg("Erreur de facturation : " + billingError.message);
    }
  };

  const handleSaveUnpaid = async () => {
    setErrorMsg(null);
    if (!selectedAppointment) return;

    const rawAmount = parseFloat(billingAmount);
    if (isNaN(rawAmount) || rawAmount <= 0) {
      setErrorMsg("Veuillez indiquer un montant valide à payer.");
      return;
    }
    const amount = roundMoney(rawAmount);

    setLoading(true);

    const { data: existingRows } = await supabase
      .from('billings')
      .select('*')
      .eq('appointment_id', selectedAppointment.id)
      .order('date_facturation', { ascending: false });

    const existingBill = existingRows && existingRows.length > 0 ? existingRows[0] : null;

    if (existingBill && !isAdmin) {
      setLoading(false);
      setErrorMsg("Seul l'administrateur est autorisé à modifier un règlement déjà enregistré.");
      return;
    }

    await ensureMotifExists(editMotif);

    const isoDateTime = toClinicIsoString(editDate, editTime);
    const validTherapistIds = therapists.map(t => t.id);
    const therapistIdToUpdate = validTherapistIds.includes(editTherapist) ? editTherapist : null;
    const dbNotes = therapistIdToUpdate ? `||TH_ID:${therapistIdToUpdate}||${editMotif}` : editMotif;
    
    // 1. Mark appointment as Impayé and save details
    const { error: apptError } = await supabase
      .from('appointments')
      .update({ 
        statut: 'Impayé',
        date_heure: isoDateTime,
        notes_seance: dbNotes,
        therapist_id: null // Always null in DB to prevent foreign key constraint violation
      })
      .eq('id', selectedAppointment.id);

    if (apptError) {
      setLoading(false);
      setErrorMsg("Erreur d'enregistrement : " + apptError.message);
      return;
    }

    let billError;
    if (existingBill) {
      const { error } = await supabase
        .from('billings')
        .update({
          montant: amount,
          statut: 'En attente',
          type_paiement: paymentType
        })
        .eq('id', existingBill.id);
      billError = error;

      if (!error && existingRows && existingRows.length > 1) {
        const extraIds = existingRows.filter((r) => r.id !== existingBill.id).map((r) => r.id);
        if (extraIds.length > 0) {
          await supabase.from('billings').delete().in('id', extraIds);
        }
      }
    } else {
      const { error } = await supabase
        .from('billings')
        .insert([{
          patient_id: selectedAppointment.patient_id,
          appointment_id: selectedAppointment.id,
          montant: amount,
          type_paiement: paymentType,
          statut: 'En attente'
        }]);
      billError = error;
    }

    setLoading(false);
    if (!billError) {
      setIsBillingModalOpen(false);
      setSelectedAppointment(null);
      fetchAppointments();
    } else {
      setErrorMsg("Rendez-vous marqué impayé mais échec mise à jour facture : " + billError.message);
    }
  };

  const getAppointmentsForSlot = (day: Date, hour: number) => {
    return appointments.filter(app => {
      const appDate = parseClinicDate(app.date_heure);
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
            onClick={() => setCurrentDate(getMoroccoNow())}
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

      {/* Banner des demandes en attente */}
      {pendingCount > 0 && (
        <div className="bg-gradient-to-r from-amber-50 via-purple-50 to-amber-50 border border-amber-200 rounded-2xl p-3 px-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-xs">
          <div className="flex items-center gap-2.5">
            <div className="h-8 w-8 rounded-xl bg-amber-500 text-white flex items-center justify-center font-bold flex-shrink-0">
              <Bell className="h-4 w-4 animate-wiggle" />
            </div>
            <div>
              <p className="text-xs font-bold text-slate-800">
                {pendingCount} demande{pendingCount > 1 ? 's' : ''} de rendez-vous ou de reports en attente de traitement
              </p>
              <p className="text-[11px] text-slate-500">
                Traitables via la cloche de notification en haut ou directement ci-dessous.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 overflow-x-auto pb-1 sm:pb-0">
            {requests.map(r => (
              <div
                key={r.id}
                className={`text-[11px] font-bold px-2.5 py-1 rounded-xl border transition-all flex items-center gap-1.5 whitespace-nowrap shadow-2xs ${
                  r.type === 'changement_rdv'
                    ? 'bg-purple-100/80 text-purple-900 border-purple-300'
                    : 'bg-amber-100/80 text-amber-900 border-amber-300'
                }`}
              >
                <span>{r.type === 'changement_rdv' ? '🔄' : '✨'}</span>
                <button
                  type="button"
                  title={`Accéder au dossier de ${r.patient_name}`}
                  onClick={() => handleOpenPatientDossier(r.patient_id)}
                  className="hover:underline cursor-pointer font-bold flex items-center gap-1"
                >
                  <span>{r.patient_name}</span>
                  <FolderOpen className="h-3 w-3 opacity-75" />
                </button>
                <span className="opacity-30">|</span>
                <button
                  type="button"
                  onClick={() => {
                    const appt = appointments.find(a => a.id === r.id);
                    if (appt) {
                      setSelectedAppointment(appt);
                      const appDate = parseClinicDate(appt.date_heure);
                      setEditDate(format(appDate, 'yyyy-MM-dd'));
                      setEditTime(format(appDate, 'HH:mm'));
                      setEditMotif(appt.notes_seance || '');
                      setEditTherapist(appt.therapist_id || '');
                      setIsBillingModalOpen(true);
                    }
                  }}
                  className="px-1.5 py-0.5 rounded-md bg-white/80 hover:bg-white text-[10px] font-black uppercase tracking-tight cursor-pointer transition-colors"
                >
                  Gérer RDV
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Calendar Grid */}
      <Card className="flex-1 overflow-hidden flex flex-col shadow-xl border-slate-200/60 rounded-2xl bg-white">
        <div className="overflow-x-auto flex-1 scrollbar-thin scrollbar-thumb-slate-200 scrollbar-track-transparent" ref={scrollContainerRef}>
          <div className={`${isMobile ? 'min-w-full' : 'min-w-[900px]'} h-full flex flex-col relative`}>
            {/* Days Header */}
            <div className={`grid ${isMobile ? 'grid-cols-[60px_1fr]' : 'grid-cols-[80px_repeat(7,1fr)]'} border-b border-slate-200 bg-slate-50/50 backdrop-blur-sm sticky top-0 z-40`}>
              <div className="p-2 border-r border-slate-200 text-center text-[10px] font-bold text-slate-500 uppercase tracking-wider flex flex-col items-center justify-center bg-slate-50/80 gap-1">
                <span>Maroc</span>
                <span className="bg-rose-500 text-white px-1.5 py-0.5 rounded text-[10px] font-black shadow-2xs">
                  {format(currentTime, 'HH:mm')}
                </span>
              </div>
              {displayedDays.map((day, i) => {
                const dayAppointmentsCount = appointments.filter(app => isSameDay(parseClinicDate(app.date_heure), day) && app.statut !== 'Annulé').length;
                const isToday = isSameDay(day, currentTime);
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
                    const isToday = isSameDay(day, currentTime);
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
                            const startMin = parseClinicDate(app.date_heure).getMinutes();
                            const count = slotAppointments.length;
                            
                            let statusStyles = 'bg-white border-primary-200 text-primary-900 shadow-primary-100/50 hover:shadow-primary-200/60'; // Confirmé
                            let accentColor = 'bg-primary-500';
                            
                            const isPending = app.statut === 'En attente' || (app.notes_seance && app.notes_seance.includes('[DEMANDE'));
                            const isReport = app.notes_seance && app.notes_seance.includes('REPORT');

                            if (app.statut === 'Effectué') {
                              statusStyles = 'bg-emerald-50/50 border-emerald-200 text-emerald-900 shadow-emerald-100/50 hover:bg-emerald-50';
                              accentColor = 'bg-emerald-500';
                            } else if (app.statut === 'Annulé') {
                              statusStyles = 'bg-slate-50 border-slate-200 text-slate-400 opacity-60 hover:opacity-100';
                              accentColor = 'bg-slate-300';
                            } else if (app.statut === 'Impayé') {
                              statusStyles = 'bg-rose-50 border-rose-200 text-rose-900 shadow-rose-100/50 hover:bg-rose-100/50';
                              accentColor = 'bg-rose-500';
                            } else if (isPending) {
                              statusStyles = isReport 
                                ? 'bg-purple-50/90 border-purple-300 text-purple-900 shadow-purple-100/50 hover:bg-purple-100 ring-2 ring-purple-400/40' 
                                : 'bg-amber-50/90 border-amber-300 text-amber-900 shadow-amber-100/50 hover:bg-amber-100 ring-2 ring-amber-400/40';
                              accentColor = isReport ? 'bg-purple-500' : 'bg-amber-500';
                            } else if (isBilan) {
                              statusStyles = 'bg-indigo-50 border-indigo-200 text-indigo-900 shadow-indigo-100/50 hover:bg-indigo-100/50';
                              accentColor = 'bg-indigo-500';
                            }
                            
                            const isNarrow = count > 1;
                            const isRightEdgeNarrow = isNarrow && index > 0 && dayIdx === displayedDays.length - 1;
                            const clubInfo = app.patients ? parsePatientMutuelle(app.patients) : null;
                            
                            return (
                              <motion.div 
                                key={app.id}
                                initial={{ opacity: 0, scale: 0.95 }}
                                animate={{ opacity: 1, scale: 1 }}
                                exit={{ opacity: 0, scale: 0.95 }}
                                className={`absolute rounded-xl ${isNarrow ? 'p-1.5' : 'px-2.5 py-1.5'} text-[11px] border shadow-md z-10 overflow-hidden transition-all duration-200 cursor-pointer group/app ${statusStyles} hover:!z-50 hover:!h-auto hover:!min-h-[82px] ${isNarrow ? 'hover:!w-[185px]' : ''} ${isRightEdgeNarrow ? 'hover:!right-1 hover:!left-auto' : ''} hover:shadow-xl`}
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
                                  const appDate = parseClinicDate(app.date_heure);
                                  setEditDate(format(appDate, 'yyyy-MM-dd'));
                                  setEditTime(format(appDate, 'HH:mm'));
                                  setEditMotif(app.notes_seance || 'Séance de Suivi');
                                  setEditTherapist(app.therapist_id || '');
                                  setErrorMsg(null);
                                  setIsBillingModalOpen(true);
                                }}
                              >
                                <div className={`absolute left-0 top-0 bottom-0 ${isNarrow ? 'w-0.5' : 'w-1'} ${accentColor}`} />
                                <div className={`font-bold flex items-start justify-between ${isNarrow ? 'mb-0' : 'mb-0.5'} gap-1 pl-1`}>
                                  {app.patient_id ? (
                                    <button
                                      type="button"
                                      title="Accéder au dossier du patient"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        handleOpenPatientDossier(app.patient_id);
                                      }}
                                      className={`text-left hover:underline hover:text-primary-700 cursor-pointer ${isNarrow ? 'line-clamp-2 text-[10px] leading-tight break-words group-hover/app:line-clamp-none group-hover/app:text-[11px]' : 'truncate'}`}
                                    >
                                      {app.patients ? `${app.patients.prenom} ${app.patients.nom}` : 'Chargement...'}
                                    </button>
                                  ) : (
                                    <span className={`${isNarrow ? 'line-clamp-2 text-[10px] leading-tight break-words group-hover/app:line-clamp-none group-hover/app:text-[11px]' : 'truncate'}`}>
                                      Patient inconnu
                                    </span>
                                  )}
                                  <div className="flex items-center shrink-0 gap-1">
                                    {app.patient_id && (
                                      <button
                                        type="button"
                                        title="Visualiser le dossier du patient"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          handleOpenPatientDossier(app.patient_id);
                                        }}
                                        className={`${isNarrow ? 'hidden group-hover/app:inline-flex' : 'inline-flex'} items-center justify-center h-5 w-5 rounded-md bg-white/85 hover:bg-primary-600 text-slate-600 hover:text-white border border-slate-200/80 hover:border-primary-600 shadow-2xs transition-colors`}
                                      >
                                        <FolderOpen className="h-3 w-3" />
                                      </button>
                                    )}
                                    <div className={`flex shrink-0 items-center gap-1 ${isNarrow ? 'hidden group-hover/app:flex' : ''}`}>
                                      {(() => {
                                        const fus = app.patients?.follow_up_status;
                                        if (!fus || !fus.startsWith('PAIN:')) return null;
                                        const parts = fus.replace('PAIN:', '').split('|');
                                        const score = parseInt(parts[0], 10);
                                        if (isNaN(score)) return null;
                                        const color =
                                          score <= 2 ? 'bg-emerald-100 text-emerald-800 border-emerald-300' :
                                          score <= 4 ? 'bg-lime-100 text-lime-800 border-lime-300' :
                                          score <= 6 ? 'bg-amber-100 text-amber-800 border-amber-300' :
                                          score <= 8 ? 'bg-orange-100 text-orange-800 border-orange-300' :
                                          'bg-rose-100 text-rose-800 border-rose-300';
                                        return (
                                          <span
                                            className={`inline-flex items-center px-1.5 py-0.2 rounded text-[9px] font-black border ${color}`}
                                            title={`Score EVA : ${score}/10 (${parts[1] || ''})${parts[2] ? ' — ' + parts[2] : ''}`}
                                          >
                                            EVA {score}
                                          </span>
                                        );
                                      })()}
                                      {app.statut === 'Effectué' && <CheckCircle className="h-3 w-3 text-emerald-500" />}
                                      {app.statut === 'Impayé' && <AlertCircle className="h-3 w-3 text-rose-500 animate-pulse" />}
                                      {isPending && <Bell className="h-3 w-3 text-amber-600 animate-bounce" />}
                                    </div>
                                  </div>
                                </div>
                                {app.therapists && (
                                  <div className={`text-[9px] font-bold uppercase tracking-tighter text-slate-500/70 mb-0.5 pl-1 ${isNarrow ? 'hidden group-hover/app:block' : ''}`}>
                                    Praticien: {app.therapists.prenom} {app.therapists.nom}
                                  </div>
                                )}
                                <div className={`${isNarrow ? 'hidden group-hover/app:flex' : 'flex'} items-center gap-1.5 opacity-75 font-medium pl-1 mt-0.5`}>
                                  <Clock className="h-3 w-3 shrink-0" />
                                  <span className="truncate">{format(parseClinicDate(app.date_heure), 'HH:mm')} {app.notes_seance ? `• ${app.notes_seance}` : ''}</span>
                                </div>
                                {clubInfo?.club && (
                                  <div className="hidden group-hover/app:flex items-center gap-1 text-[9px] font-bold text-indigo-700 pl-1 mt-1 truncate">
                                    <Trophy className="h-2.5 w-2.5 shrink-0 text-indigo-600" />
                                    <span className="truncate">{clubInfo.club}</span>
                                  </div>
                                )}
                                {app.patient_id && (
                                  <div className="hidden group-hover/app:flex pt-1.5 mt-1.5 border-t border-slate-900/10 pl-1">
                                    <button
                                      type="button"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        handleOpenPatientDossier(app.patient_id);
                                      }}
                                      className="w-full inline-flex items-center justify-center gap-1.5 px-2 py-1 rounded-lg bg-slate-900 hover:bg-primary-600 text-white text-[10px] font-bold shadow-xs transition-colors"
                                    >
                                      <FolderOpen className="h-3 w-3 shrink-0" />
                                      <span>Voir le dossier</span>
                                    </button>
                                  </div>
                                )}
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

          <DualMotifSelector
            value={newAppointmentMotif}
            onChange={setNewAppointmentMotif}
            availableMotifs={motifs}
            label="Motif(s) de la séance"
            placeholder="Sélectionner ou saisir jusqu’à 2 motifs..."
          />

          <div className="space-y-2 relative">
            <div className="flex items-center justify-between">
              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1 flex items-center gap-2">
                Patient
              </label>
              {selectedPatient && (
                <button
                  type="button"
                  onClick={() => handleOpenPatientDossier(selectedPatient)}
                  className="inline-flex items-center gap-1 text-xs font-bold text-primary-600 hover:text-primary-700 hover:underline cursor-pointer"
                >
                  <FolderOpen className="h-3.5 w-3.5" />
                  Accéder au dossier
                </button>
              )}
            </div>
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
                        className="px-4 py-3 text-sm hover:bg-primary-50 rounded-xl cursor-pointer text-slate-700 font-medium transition-colors flex items-center justify-between gap-3"
                        onClick={() => {
                          setSelectedPatient(p.id);
                          setPatientSearchQuery(`${p.nom} ${p.prenom}`);
                          setIsPatientDropdownOpen(false);
                        }}
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="h-8 w-8 rounded-full bg-slate-100 flex items-center justify-center text-slate-500 font-bold text-xs shrink-0">
                            {p.nom?.[0]}{p.prenom?.[0]}
                          </div>
                          <span className="truncate">{p.nom} {p.prenom}</span>
                        </div>
                        <button
                          type="button"
                          title={`Ouvrir le dossier de ${p.nom} ${p.prenom}`}
                          onClick={(e) => {
                            e.stopPropagation();
                            handleOpenPatientDossier(p.id);
                          }}
                          className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-semibold text-primary-600 hover:bg-primary-100 transition-colors shrink-0"
                        >
                          <FolderOpen className="h-3.5 w-3.5" />
                          Dossier
                        </button>
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

          {/* Banner Demande en attente (RDV ou Report) */}
          {(selectedAppointment?.statut === 'En attente' || selectedAppointment?.notes_seance?.includes('[DEMANDE')) && (
            <div className={`p-4 rounded-2xl border flex flex-col gap-3 font-medium text-xs ${
              selectedAppointment.notes_seance?.includes('REPORT')
                ? 'bg-purple-50 border-purple-200 text-purple-900'
                : 'bg-amber-50 border-amber-200 text-amber-900'
            }`}>
              <div className="flex items-center gap-2 font-bold text-sm">
                <Bell className="h-4 w-4" />
                <span>
                  {selectedAppointment.notes_seance?.includes('REPORT')
                    ? 'Demande de report formulée par le patient'
                    : 'Nouveau rendez-vous demandé par le patient'}
                </span>
                <span className="ml-auto text-[10px] uppercase font-black px-2 py-0.5 rounded-full bg-white/80">
                  En attente
                </span>
              </div>
              
              <div className="bg-white/80 rounded-xl p-3 border border-slate-200/60 text-slate-700">
                <p className="font-semibold text-xs text-slate-800">Détails de la demande :</p>
                <p className="text-xs mt-1 text-slate-600">{selectedAppointment.notes_seance}</p>
              </div>

              <div className="flex items-center gap-2 pt-1">
                <Button
                  type="button"
                  size="sm"
                  onClick={handleValidatePendingDemand}
                  disabled={loading}
                  className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs h-9 px-4 shadow-sm"
                >
                  <CheckCircle className="h-3.5 w-3.5 mr-1.5" />
                  {selectedAppointment.notes_seance?.includes('REPORT') ? 'Appliquer le report et valider' : 'Valider ce rendez-vous'}
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={handleCancelAppointment}
                  disabled={loading}
                  className="border-red-200 text-red-600 hover:bg-red-50 text-xs h-9"
                >
                  Refuser la demande
                </Button>
              </div>
            </div>
          )}
          
          {selectedAppointment && (
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-slate-50 p-4 rounded-2xl border border-slate-100 shadow-inner">
              <div className="flex items-center gap-3.5 min-w-0">
                <div className="h-12 w-12 rounded-2xl bg-white shadow-sm border border-slate-200 flex items-center justify-center text-primary-500 font-black text-lg shrink-0 uppercase">
                  {selectedAppointment.patients?.nom?.[0]}{selectedAppointment.patients?.prenom?.[0]}
                </div>
                <div className="min-w-0">
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Patient</p>
                  {selectedAppointment.patient_id ? (
                    <button
                      type="button"
                      title="Accéder au dossier du patient"
                      onClick={() => handleOpenPatientDossier(selectedAppointment.patient_id)}
                      className="font-black text-slate-900 hover:text-primary-600 hover:underline text-lg truncate block text-left cursor-pointer transition-colors"
                    >
                      {selectedAppointment.patients?.prenom} {selectedAppointment.patients?.nom}
                    </button>
                  ) : (
                    <p className="font-black text-slate-900 text-lg truncate">
                      {selectedAppointment.patients?.prenom} {selectedAppointment.patients?.nom}
                    </p>
                  )}
                  {selectedAppointment.patients?.pathologie && (
                    <p className="text-xs text-slate-500 font-medium truncate">
                      {selectedAppointment.patients.pathologie}
                    </p>
                  )}
                  {selectedAppointment.patients?.follow_up_status?.startsWith('PAIN:') && (() => {
                    const parts = selectedAppointment.patients.follow_up_status.replace('PAIN:', '').split('|');
                    const score = parseInt(parts[0], 10);
                    const dateStr = parts[1] || '';
                    const noteStr = parts[2] || '';
                    if (isNaN(score)) return null;
                    const colorCls = score <= 2
                      ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                      : score <= 4
                      ? 'bg-lime-50 text-lime-700 border-lime-200'
                      : score <= 6
                      ? 'bg-amber-50 text-amber-700 border-amber-200'
                      : score <= 8
                      ? 'bg-orange-50 text-orange-700 border-orange-200'
                      : 'bg-rose-50 text-rose-700 border-rose-200';
                    return (
                      <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold border ${colorCls}`}>
                          Douleur EVA : {score} / 10
                        </span>
                        {dateStr && <span className="text-[11px] text-slate-400 font-medium">({new Date(dateStr).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })})</span>}
                        {noteStr && <span className="text-xs text-slate-500 italic truncate max-w-xs">— « {noteStr} »</span>}
                      </div>
                    );
                  })()}
                </div>
              </div>
              {selectedAppointment.patient_id && (
                <Button
                  type="button"
                  size="sm"
                  onClick={() => handleOpenPatientDossier(selectedAppointment.patient_id)}
                  className="rounded-xl bg-primary-600 hover:bg-primary-700 text-white font-bold gap-1.5 shrink-0 shadow-sm"
                >
                  <FolderOpen className="h-4 w-4" />
                  Voir le dossier
                </Button>
              )}
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
                  className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-bold text-slate-900 focus:border-primary-500 focus:outline-none focus:ring-4 focus:ring-primary-500/10 transition-all"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">Heure</label>
                <input
                  type="time"
                  value={editTime}
                  onChange={(e) => setEditTime(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-bold text-slate-900 focus:border-primary-500 focus:outline-none focus:ring-4 focus:ring-primary-500/10 transition-all"
                />
              </div>
              <div className="space-y-1.5 col-span-2 relative">
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">Praticien</label>
                <select
                  value={editTherapist}
                  onChange={(e) => setEditTherapist(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-bold text-slate-900 focus:border-primary-500 focus:outline-none focus:ring-4 focus:ring-primary-500/10 transition-all bg-slate-50/30 outline-none"
                >
                  <option value="">Non assigné</option>
                  {therapists.map(t => (
                    <option key={t.id} value={t.id}>{t.prenom} {t.nom}</option>
                  ))}
                </select>
              </div>
              <div className="col-span-2">
                <DualMotifSelector
                  value={editMotif}
                  onChange={setEditMotif}
                  availableMotifs={motifs}
                  label="Motif / Acte de la séance"
                  placeholder="Sélectionner ou saisir jusqu’à 2 motifs..."
                />
              </div>
            </div>
            <Button 
              type="button" 
              variant="secondary" 
              size="sm" 
              onClick={handleUpdateAppointment} 
              disabled={loading} 
              className="w-full mt-2 rounded-xl h-10 font-bold bg-primary-600 hover:bg-primary-700 text-white shadow-xs gap-1.5 transition-all"
            >
              <Edit2 className="h-3.5 w-3.5" />
              {loading ? 'Enregistrement...' : "Enregistrer le motif / praticien / horaire"}
            </Button>
          </div>

          {/* Billing Section */}
          {selectedAppointment?.statut !== 'Annulé' && (() => {
            const hasRecordedBilling =
              Boolean(existingBilling) ||
              selectedAppointment?.statut === 'Effectué' ||
              selectedAppointment?.statut === 'Impayé';
            const canModifyBillingFields = !hasRecordedBilling || isAdmin;

            return (
              <div className="space-y-4 bg-white p-5 rounded-2xl border border-slate-100 shadow-sm">
                <div className="flex items-center justify-between gap-2">
                  <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Règlement</h4>
                  {hasRecordedBilling ? (
                    isAdmin ? (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-700 border border-indigo-200 text-[10px] font-bold">
                        <ShieldCheck className="h-3 w-3" />
                        Admin • Modification autorisée
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-slate-100 text-slate-500 border border-slate-200 text-[10px] font-bold">
                        <Lock className="h-3 w-3" />
                        Modification réservée à l'admin
                      </span>
                    )
                  ) : (
                    <Wallet className="h-4 w-4 text-slate-200" />
                  )}
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
                        step="any"
                        onWheel={(e) => e.currentTarget.blur()}
                        value={billingAmount}
                        onChange={(e) => setBillingAmount(e.target.value)}
                        disabled={!canModifyBillingFields}
                        className="w-full rounded-xl border border-slate-200 pl-8 pr-4 py-2.5 text-sm font-bold text-slate-900 focus:border-primary-500 focus:outline-none focus:ring-4 focus:ring-primary-500/10 transition-all disabled:bg-slate-50 disabled:text-slate-400"
                      />
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">Paiement</label>
                    <select
                      value={paymentType}
                      onChange={(e) => setPaymentType(e.target.value)}
                      disabled={!canModifyBillingFields}
                      className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-bold text-slate-900 focus:border-primary-500 focus:outline-none focus:ring-4 focus:ring-primary-500/10 transition-all disabled:bg-slate-50 disabled:text-slate-400 appearance-none bg-slate-50/30"
                    >
                      <option value="Patient">Direct</option>
                      <option value="Mutuelle">Mutuelle</option>
                      <option value="Tiers-payant">Tiers-payant</option>
                      <option value="Hors nomenclature">Hors nom.</option>
                      {!['Patient', 'Mutuelle', 'Tiers-payant', 'Hors nomenclature'].includes(paymentType) && paymentType && (
                        <option value={paymentType}>{paymentType}</option>
                      )}
                    </select>
                  </div>
                </div>

                {/* Actions when appointment is NOT yet paid */}
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
                    {selectedAppointment?.statut !== 'Impayé' ? (
                      <Button 
                        type="button" 
                        onClick={handleSaveUnpaid} 
                        disabled={loading} 
                        variant="ghost" 
                        className="w-full h-10 rounded-xl font-bold text-rose-600 hover:bg-rose-50 transition-colors"
                      >
                        {loading ? '...' : `Marquer comme impayé (${billingAmount} DH)`}
                      </Button>
                    ) : (
                      isAdmin && (
                        <Button 
                          type="button" 
                          onClick={handleSaveUnpaid} 
                          disabled={loading} 
                          variant="outline" 
                          className="w-full h-10 rounded-xl font-bold border-rose-200 text-rose-600 hover:bg-rose-50 transition-colors"
                        >
                          {loading ? '...' : `Enregistrer la modification de l'impayé (${billingAmount} DH)`}
                        </Button>
                      )
                    )}
                  </div>
                )}

                {/* Admin-only modification actions when appointment IS ALREADY paid ('Effectué') */}
                {selectedAppointment?.statut === 'Effectué' && isAdmin && (
                  <div className="flex flex-col gap-2.5 mt-2 pt-2 border-t border-slate-100">
                    <Button
                      type="button"
                      onClick={handleSaveBilling}
                      disabled={loading}
                      className="w-full h-11 rounded-xl font-bold bg-indigo-600 hover:bg-indigo-700 text-white shadow-sm transition-all"
                    >
                      {loading ? 'Enregistrement...' : 'Enregistrer la modification du règlement'}
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      onClick={handleSaveUnpaid}
                      disabled={loading}
                      className="w-full h-9 rounded-xl font-bold text-rose-600 hover:bg-rose-50 text-xs transition-colors"
                    >
                      {loading ? '...' : `Repasser en impayé (${billingAmount} DH)`}
                    </Button>
                  </div>
                )}
              </div>
            );
          })()}

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
