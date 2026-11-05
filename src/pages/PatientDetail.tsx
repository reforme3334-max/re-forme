import React, { useState, useEffect, useMemo } from 'react';
import { User, Phone, Mail, Calendar, FileText, Clock, Activity, Plus, Minus, Check, X, ArrowLeft, Download, AlertCircle, FileSpreadsheet, Key, CheckCircle2, Trash2, MapPin, ShieldAlert, Play, Camera, HeartPulse, ExternalLink, Edit2, RefreshCw, Trophy, Lock, Wallet, LayoutTemplate, Eye, EyeOff } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Badge } from '../components/ui/badge';
import { Modal } from '../components/ui/modal';
import { supabase, supabaseUrl, supabaseAnonKey } from '../lib/supabaseClient';
import * as XLSX from 'xlsx';
import { PainEvolutionChart } from '../components/patients/PainEvolutionChart';
import { parseYouTubeUrl, parseExercisesFromPatient, saveExercisesForPatient, parsePainLogsFromPatient, savePainLogsForPatient, ExerciseItem, PainLogItem } from '../lib/exercisesService';
import { getMoroccoNow, getMoroccoTodayStr, parseClinicDate, toClinicIsoString } from '../lib/timeUtils';
import { ORGANISMES_MUTUELLE, SPORTS_DISCIPLINES, PartnerClub, parsePatientMutuelle, serializeAtcdWithMutuelle, fetchPartnerClubs, upsertPartnerClub } from '../lib/mutuelleUtils';
import { resolveOrBindCollaboratorSession, canManageSessionCounts, isPrimaryAdminEmail } from '../lib/teamUtils';
import { normalizePatientPhone, provisionOrResetPatientAccess } from '../lib/patientAuthUtils';
import { roundMoney, sumMoney, formatMoney, sanitizeBillings, isPaidBillingStatus, isUnpaidBillingStatus, getBillDate } from '../lib/financeUtils';
import {
  DocumentTemplatesConfig,
  CustomInvoiceRefsStore,
  getCachedDocumentTemplates,
  fetchDocumentTemplates,
  getCachedCustomInvoiceRefs,
  fetchCustomInvoiceRefs,
  savePatientCustomInvoiceRef,
  saveBillingCustomInvoiceRef,
  incrementInvoiceSequence,
  formatInvoiceReference,
  getBillingDisplayReference,
  exportPatientInvoicePDF,
  exportPatientInvoiceExcel,
  exportCareCalendarPDF,
  exportPatientReceiptPDF,
} from '../lib/documentTemplates';
import { DocumentTemplateEditor } from '../components/settings/DocumentTemplateEditor';

interface PatientDetailProps {
  patientId?: string;
  returnRoute?: string;
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
  'Séance de Suivi',
  'Séance à domicile',
  'Clinique Taghzout',
  'Clinique Chiekhe Essaadi Agadir'
];

export function PatientDetail({ patientId, returnRoute }: PatientDetailProps) {
  const [activeTab, setActiveTab] = useState('dossier');
  const [patient, setPatient] = useState<any>(null);
  const [appointments, setAppointments] = useState<any[]>([]);
  const [billings, setBillings] = useState<any[]>([]);
  const [treatments, setTreatments] = useState<any[]>([]);
  const [motifs, setMotifs] = useState<string[]>(MOTIFS_SEANCE);
  const [loading, setLoading] = useState(true);
  const [forfait, setForfait] = useState(0);

  // Access Modal State
  
  // Exercises/Videos State
  const [exercises, setExercises] = useState<ExerciseItem[]>([]);
  const [isNewVideoModalOpen, setIsNewVideoModalOpen] = useState(false);
  const [newVideoUrl, setNewVideoUrl] = useState('');
  const [newVideoTitle, setNewVideoTitle] = useState('');
  const [newVideoInstructions, setNewVideoInstructions] = useState('');
  const [savingVideo, setSavingVideo] = useState(false);
  const [videoSuccessNotice, setVideoSuccessNotice] = useState('');
  const videoInputRef = React.useRef<HTMLInputElement>(null);

  // Pain Evaluation State (Échelle EVA 1-10)
  const [painLogs, setPainLogs] = useState<any[]>([]);
  const [isAddPainModalOpen, setIsAddPainModalOpen] = useState(false);
  const [practitionerPainScore, setPractitionerPainScore] = useState<number>(3);
  const [practitionerPainNote, setPractitionerPainNote] = useState<string>('');
  const [practitionerPainDate, setPractitionerPainDate] = useState<string>(() => getMoroccoTodayStr());
  const [practitionerPainLoading, setPractitionerPainLoading] = useState<boolean>(false);
  const [confirmDeletePainId, setConfirmDeletePainId] = useState<string | null>(null);
  const [confirmDeleteExerciseId, setConfirmDeleteExerciseId] = useState<string | null>(null);

  const [isAccessModalOpen, setIsAccessModalOpen] = useState(false);
  const [accessPassword, setAccessPassword] = useState('');
  const [lastGeneratedAccess, setLastGeneratedAccess] = useState<{ phone: string; password: string } | null>(null);
  const [showAccessPassword, setShowAccessPassword] = useState(true);
  const [accessLoading, setAccessLoading] = useState(false);
  const [accessMessage, setAccessMessage] = useState({ type: '', text: '' });

  // Note Modal State
  const [isNoteModalOpen, setIsNoteModalOpen] = useState(false);
  const [noteContent, setNoteContent] = useState('');
  const [selectedAppointmentId, setSelectedAppointmentId] = useState('');
  const [noteLoading, setNoteLoading] = useState(false);
  const [noteMessage, setNoteMessage] = useState({ type: '', text: '' });

  // Edit Patient Modal State
  const [isEditPatientModalOpen, setIsEditPatientModalOpen] = useState(false);
  const [editPatientData, setEditPatientData] = useState<any>({});
  const [editPatientLoading, setEditPatientLoading] = useState(false);
  const [editPatientMessage, setEditPatientMessage] = useState({ type: '', text: '' });
  const [partnerClubs, setPartnerClubs] = useState<PartnerClub[]>([]);
  const [newInlineClubName, setNewInlineClubName] = useState('');
  const [newInlineClubSport, setNewInlineClubSport] = useState('Football');

  // New Appointment Modal State
  const [isNewAppointmentModalOpen, setIsNewAppointmentModalOpen] = useState(false);
  const [newAppointmentDate, setNewAppointmentDate] = useState('');
  const [newAppointmentTime, setNewAppointmentTime] = useState('');
  const [newAppointmentMotif, setNewAppointmentMotif] = useState('Séance de Suivi');
  const [showNewMotifDropdown, setShowNewMotifDropdown] = useState(false);
  const [newAppointmentLoading, setNewAppointmentLoading] = useState(false);
  const [newAppointmentMessage, setNewAppointmentMessage] = useState({ type: '', text: '' });
  const [therapists, setTherapists] = useState<any[]>([]);
  const [newAppointmentTherapist, setNewAppointmentTherapist] = useState('');

  // New & Edit Treatment Modal State
  const [isNewTreatmentModalOpen, setIsNewTreatmentModalOpen] = useState(false);
  const [newTreatmentData, setNewTreatmentData] = useState({
    motif: '',
    nombre_seances_prescrites: 10,
    date_debut: getMoroccoTodayStr(),
    medecin_prescripteur: '',
    statut: 'En cours'
  });
  const [newTreatmentLoading, setNewTreatmentLoading] = useState(false);
  const [newTreatmentMessage, setNewTreatmentMessage] = useState({ type: '', text: '' });

  const [isEditTreatmentModalOpen, setIsEditTreatmentModalOpen] = useState(false);
  const [treatmentToEdit, setTreatmentToEdit] = useState<any | null>(null);
  const [editTreatmentLoading, setEditTreatmentLoading] = useState(false);
  const [editTreatmentMessage, setEditTreatmentMessage] = useState({ type: '', text: '' });

  // Quick Inline Edit for Prescribed Sessions & Forfait
  const [isEditingSeances, setIsEditingSeances] = useState(false);
  const [seancesInputVal, setSeancesInputVal] = useState<string>('0');
  const [savingSeances, setSavingSeances] = useState(false);

  const [isEditingForfait, setIsEditingForfait] = useState(false);
  const [forfaitInputVal, setForfaitInputVal] = useState<string>('0');
  const [savingForfait, setSavingForfait] = useState(false);

  // Delete Appointment Modal State
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [appointmentToDelete, setAppointmentToDelete] = useState<string | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);

  // Edit Appointment (Motif / Practitioner / Date / Time) Modal State
  const [isEditAppointmentModalOpen, setIsEditAppointmentModalOpen] = useState(false);
  const [appointmentToEdit, setAppointmentToEdit] = useState<any>(null);
  const [editAppDate, setEditAppDate] = useState('');
  const [editAppTime, setEditAppTime] = useState('');
  const [editAppMotif, setEditAppMotif] = useState('');
  const [editAppTherapist, setEditAppTherapist] = useState('');
  const [showEditAppMotifDropdown, setShowEditAppMotifDropdown] = useState(false);
  const [editAppLoading, setEditAppLoading] = useState(false);

  // Delete & Edit Billing Modal State (Admin-only modification) & Session Count Role Gate (Admin + Secrétaire only)
  const [isAdmin, setIsAdmin] = useState(false);
  const [canEditSessionCount, setCanEditSessionCount] = useState(false);
  const [isDeleteBillingModalOpen, setIsDeleteBillingModalOpen] = useState(false);
  const [billingToDelete, setBillingToDelete] = useState<string | null>(null);
  const [deleteBillingLoading, setDeleteBillingLoading] = useState(false);
  const [isSettling, setIsSettling] = useState<string | null>(null);
  const [isEditBillingModalOpen, setIsEditBillingModalOpen] = useState(false);
  const [billingToEdit, setBillingToEdit] = useState<any | null>(null);
  const [editBillingForm, setEditBillingForm] = useState({
    reference: '',
    montant: '',
    type_paiement: 'Patient',
    statut: 'Payé',
  });
  const [editBillingLoading, setEditBillingLoading] = useState(false);
  const [editBillingError, setEditBillingError] = useState('');

  // Delete Patient Modal State
  const [isDeletePatientModalOpen, setIsDeletePatientModalOpen] = useState(false);
  const [deletePatientLoading, setDeletePatientLoading] = useState(false);

  // Document Template Config & Custom Invoice References State
  const [docTemplates, setDocTemplates] = useState<DocumentTemplatesConfig>(() =>
    getCachedDocumentTemplates()
  );
  const [customInvoiceRefs, setCustomInvoiceRefs] = useState<CustomInvoiceRefsStore>(() =>
    getCachedCustomInvoiceRefs()
  );
  const [invoiceRefInput, setInvoiceRefInput] = useState<string>('');
  const [invoiceDateInput, setInvoiceDateInput] = useState<string>(() => getMoroccoTodayStr());
  const [invoiceRefDirty, setInvoiceRefDirty] = useState(false);
  const [invoiceRefSavedMsg, setInvoiceRefSavedMsg] = useState('');
  const [inlineRefBillId, setInlineRefBillId] = useState<string | null>(null);
  const [inlineRefValue, setInlineRefValue] = useState<string>('');
  const [isDocTemplateModalOpen, setIsDocTemplateModalOpen] = useState(false);

  useEffect(() => {
    const loadRoleAndTemplates = async () => {
      try {
        const [{ data: { session } }, loadedTemplates, loadedRefs] = await Promise.all([
          supabase.auth.getSession(),
          fetchDocumentTemplates(supabase),
          fetchCustomInvoiceRefs(supabase),
        ]);
        setDocTemplates(loadedTemplates);
        setCustomInvoiceRefs(loadedRefs);
        if (session) {
          const profile = await resolveOrBindCollaboratorSession(supabase, {
            id: session.user.id,
            email: session.user.email,
          });
          setIsAdmin(profile?.role === 'admin' || isPrimaryAdminEmail(session.user.email));
          setCanEditSessionCount(canManageSessionCounts(profile?.role, session.user.email));
        }
      } catch (err) {
        console.warn('Could not determine user role or templates in PatientDetail:', err);
      }
    };
    loadRoleAndTemplates();
  }, []);

  useEffect(() => {
    if (!patientId) return;
    const savedCustom = customInvoiceRefs.patients?.[patientId]?.trim();
    if (savedCustom) {
      setInvoiceRefInput(savedCustom);
      setInvoiceRefDirty(false);
    } else if (!invoiceRefDirty) {
      const refDate = invoiceDateInput ? parseClinicDate(invoiceDateInput) : new Date();
      setInvoiceRefInput(formatInvoiceReference(docTemplates, { date: refDate }));
    }
  }, [patientId, docTemplates, customInvoiceRefs]);

  useEffect(() => {
    if (patientId) {
      fetchPatientDetails();

      const handleFocus = () => syncPainAndExercises();
      const handlePainEvent = (e: any) => {
        if (!e.detail?.patientId || e.detail.patientId === patientId) {
          syncPainAndExercises();
        }
      };

      window.addEventListener('focus', handleFocus);
      window.addEventListener('reforme_pain_updated', handlePainEvent);

      const timer = setInterval(() => {
        syncPainAndExercises();
      }, 10000);

      // Realtime channel for immediate sync when patient rates EVA on their portal
      const channel = supabase
        .channel(`patient-pain-live-${patientId}`)
        .on(
          'postgres_changes',
          {
            event: 'UPDATE',
            schema: 'public',
            table: 'patients',
            filter: `id=eq.${patientId}`
          },
          () => {
            syncPainAndExercises();
          }
        )
        .subscribe();

      return () => {
        window.removeEventListener('focus', handleFocus);
        window.removeEventListener('reforme_pain_updated', handlePainEvent);
        clearInterval(timer);
        supabase.removeChannel(channel);
      };
    }
  }, [patientId]);

  const syncPainAndExercises = async () => {
    if (!patientId) return;
    try {
      const { data: pData } = await supabase
        .from('patients')
        .select('id, telephone, notes_antecedents, follow_up_status, last_follow_up_date')
        .eq('id', patientId)
        .single();
      if (!pData) return;

      let rawSources: any[] = [pData];
      const digitsOnly = (pData.telephone || '').replace(/\D/g, '');
      const tail = digitsOnly.slice(-8);
      if (tail.length === 8 && !/^0+$/.test(tail)) {
        const { data: lightPhones } = await supabase
          .from('patients')
          .select('id, telephone');
        if (lightPhones) {
          const dupIds = lightPhones
            .filter(r => r.id !== pData.id && (r.telephone || '').replace(/\D/g, '').endsWith(tail))
            .map(r => r.id);
          if (dupIds.length > 0) {
            const { data: samePhoneRows } = await supabase
              .from('patients')
              .select('id, notes_antecedents, follow_up_status, last_follow_up_date')
              .in('id', dupIds);
            if (samePhoneRows) {
              rawSources = [pData, ...samePhoneRows];
            }
          }
        }
      }

      setExercises(parseExercisesFromPatient(rawSources, pData.id));
      setPainLogs(parsePainLogsFromPatient(rawSources, pData.id));
    } catch (e) {
      console.warn('Silent sync warning', e);
    }
  };

  const fetchPatientDetails = async () => {
    setLoading(true);
    
    // Fetch patient
    let { data: patientData, error: patientError } = await supabase
      .from('patients')
      .select('*')
      .eq('id', patientId)
      .single();

    if (patientError) {
      // Fallback without notes_antecedents in case of oversized legacy data
      const fallback = await supabase
        .from('patients')
        .select('id, nom, prenom, telephone, email, date_naissance, cin, adresse, pathologie, nombre_seances, atcd, forfait_seances, has_access, last_follow_up_date, follow_up_status, created_at')
        .eq('id', patientId)
        .single();
      if (!fallback.error && fallback.data) {
        patientData = fallback.data;
        patientError = null;
      }
    }

    if (!patientError && patientData) {
      setPatient(patientData);
      try {
        localStorage.setItem('reforme_preview_patient_id', patientData.id);
      } catch {}
      
      // Load exercises & pain evaluations synced from Supabase (including duplicate phone rows & localStorage)
      try {
        let rawSources: any[] = [patientData];
        const digitsOnly = (patientData.telephone || '').replace(/\D/g, '');
        const tail = digitsOnly.slice(-8);
        if (tail.length === 8 && !/^0+$/.test(tail)) {
          const { data: lightPhones } = await supabase
            .from('patients')
            .select('id, telephone');
          if (lightPhones) {
            const dupIds = lightPhones
              .filter(r => r.id !== patientData.id && (r.telephone || '').replace(/\D/g, '').endsWith(tail))
              .map(r => r.id);
            if (dupIds.length > 0) {
              const { data: samePhoneRows } = await supabase
                .from('patients')
                .select('id, notes_antecedents, follow_up_status, last_follow_up_date')
                .in('id', dupIds);
              if (samePhoneRows && samePhoneRows.length > 0) {
                rawSources = [patientData, ...samePhoneRows];
              }
            }
          }
        }
        const loadedExercises = parseExercisesFromPatient(rawSources, patientData.id);
        setExercises(loadedExercises);

        const loadedPainLogs = parsePainLogsFromPatient(rawSources, patientData.id);
        setPainLogs(loadedPainLogs);

        // Auto-persist if local or duplicate data hasn't been saved to this patient's cloud record yet
        const hasCloudJson = patientData.notes_antecedents && patientData.notes_antecedents.trim().startsWith('{');
        if (!hasCloudJson && (loadedExercises.length > 0 || loadedPainLogs.length > 0)) {
          if (loadedPainLogs.length > 0) {
            savePainLogsForPatient(patientData.id, loadedPainLogs, patientData.telephone);
          } else if (loadedExercises.length > 0) {
            saveExercisesForPatient(patientData.id, loadedExercises, patientData.telephone);
          }
        }
      } catch(e) { console.warn('Error loading exercises & pain logs', e); }
      setForfait(patientData.forfait_seances || 0);

    }

    // Fetch appointments
    const { data: apptData } = await supabase
      .from('appointments')
      .select('*')
      .eq('patient_id', patientId)
      .order('date_heure', { ascending: false });
      
    if (apptData) {
      const mappedAppts = apptData.map(app => {
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
          notes_seance: cleanNotes
        };
      });
      setAppointments(mappedAppts);
    }

    // Fetch billings
    const { data: billingData } = await supabase
      .from('billings')
      .select('*, appointments(id, date_heure, statut)')
      .eq('patient_id', patientId)
      .order('date_facturation', { ascending: false });
      
    if (billingData) {
      setBillings(sanitizeBillings(billingData, apptData || []));
    }

    // Fetch treatments
    const { data: treatmentData } = await supabase
      .from('treatments')
      .select('*')
      .eq('patient_id', patientId)
      .order('created_at', { ascending: false });

    if (treatmentData) {
      setTreatments(treatmentData);
    }

    // Fetch motifs
    const { data: motifsData } = await supabase.from('seance_motifs').select('nom');
    if (motifsData) {
      const dbMotifs = motifsData.map(m => m.nom);
      const allMotifs = Array.from(new Set([...MOTIFS_SEANCE, ...dbMotifs]));
      setMotifs(allMotifs);
    } else {
      setMotifs(MOTIFS_SEANCE);
    }

    // Fetch therapists
    const { data: therData } = await supabase.from('therapists').select('id, nom, prenom').order('nom');
    if (therData) {
      setTherapists(therData);
    }

    // Fetch partner sports clubs
    const loadedClubs = await fetchPartnerClubs(supabase, patientData ? [patientData] : []);
    setPartnerClubs(loadedClubs);

    setLoading(false);
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

  // Calculate session progression based on actual performed appointments ('Effectué' + 'Impayé')
  const activeTreatment = useMemo(() => {
    const activeTreatmentData = treatments.find(t => t.statut === 'En cours') || treatments[0];
    const performedAppts = appointments.filter(
      a => a.statut === 'Effectué' || a.statut === 'Impayé'
    );
    const seances_effectuees = performedAppts.length;
    const latestActMotif =
      performedAppts.find(a => a.notes_seance && !/^\d+([.,]\d+)?$/.test(a.notes_seance.trim()))
        ?.notes_seance || '';

    return {
      motif:
        activeTreatmentData?.motif ||
        patient?.pathologie ||
        latestActMotif ||
        'Non renseigné',
      medecin_prescripteur: activeTreatmentData?.medecin_prescripteur || '',
      seances_prescrites: activeTreatmentData?.nombre_seances_prescrites || patient?.nombre_seances || 0,
      seances_effectuees: seances_effectuees,
    };
  }, [appointments, treatments, patient]);

  const age = useMemo(() => {
    if (!patient?.date_naissance) return null;
    const birthDate = new Date(patient.date_naissance);
    const today = new Date();
    let years = today.getFullYear() - birthDate.getFullYear();
    const m = today.getMonth() - birthDate.getMonth();
    if (m < 0 || (m === 0 && today.getDate() < birthDate.getDate())) {
      years--;
    }
    return years;
  }, [patient]);

  const remainingSessions = Math.max(0, activeTreatment.seances_prescrites - activeTreatment.seances_effectuees);
  const progressPercentage = activeTreatment.seances_prescrites > 0 
    ? Math.min(100, (activeTreatment.seances_effectuees / activeTreatment.seances_prescrites) * 100) 
    : 0;

  
  
  const handleVideoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 4.2 * 1024 * 1024) {
      if (videoInputRef.current) videoInputRef.current.value = '';
      setIsNewVideoModalOpen(true);
      setVideoSuccessNotice('Cette vidéo dépasse 4,2 Mo. Pour une visibilité instantanée sur le téléphone du patient, utilisez un lien YouTube / Shorts ou une vidéo plus courte.');
      setTimeout(() => setVideoSuccessNotice(''), 6000);
      return;
    }
    const reader = new FileReader();
    reader.onloadend = async () => {
      const newEx: ExerciseItem = {
        id: Date.now().toString(),
        title: file.name ? file.name.replace(/\.[^/.]+$/, '') : 'Vidéo enregistrée',
        url: reader.result as string,
        type: 'video',
        date: new Date().toISOString()
      };
      const updated = [newEx, ...exercises];
      setExercises(updated);
      const res = await saveExercisesForPatient(patient.id, updated, patient.telephone);
      if (res.success) {
        setVideoSuccessNotice('Vidéo enregistrée et synchronisée avec l\'espace patient !');
      } else {
        setVideoSuccessNotice(res.error || 'Erreur lors de la synchronisation.');
      }
      setTimeout(() => setVideoSuccessNotice(''), 5000);
      if (videoInputRef.current) videoInputRef.current.value = '';
    };
    reader.readAsDataURL(file);
  };

  const handleAddVideo = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newVideoUrl || !newVideoTitle) return;
    setSavingVideo(true);

    const parsed = parseYouTubeUrl(newVideoUrl);
    const newEx: ExerciseItem = {
      id: Date.now().toString(),
      title: newVideoTitle.trim(),
      url: parsed.embedUrl || newVideoUrl.trim(),
      originalUrl: parsed.watchUrl || newVideoUrl.trim(),
      thumbnailUrl: parsed.thumbnailUrl,
      instructions: newVideoInstructions.trim() || undefined,
      type: 'youtube',
      date: new Date().toISOString()
    };

    const updated = [newEx, ...exercises];
    setExercises(updated);

    const res = await saveExercisesForPatient(patient.id, updated, patient.telephone);
    setSavingVideo(false);

    if (res.success) {
      setVideoSuccessNotice('Exercice YouTube ajouté et synchronisé en direct avec l\'accès du patient !');
      setTimeout(() => setVideoSuccessNotice(''), 4000);
    } else {
      setVideoSuccessNotice('Enregistré localement. Note de synchronisation réseau : ' + (res.error || ''));
      setTimeout(() => setVideoSuccessNotice(''), 5000);
    }

    setNewVideoUrl('');
    setNewVideoTitle('');
    setNewVideoInstructions('');
    setIsNewVideoModalOpen(false);
  };

  const handleDeleteExercise = async (id: string) => {
    const updated = exercises.filter(e => e.id !== id);
    setExercises(updated);
    setConfirmDeleteExerciseId(null);
    await saveExercisesForPatient(patient.id, updated, patient.telephone);
    setVideoSuccessNotice('Exercice supprimé.');
    setTimeout(() => setVideoSuccessNotice(''), 3000);
  };

  const getPainBadge = (score: number) => {
    if (score <= 2) return { label: 'Très légère', color: 'bg-emerald-100 text-emerald-800 border-emerald-200', btnColor: 'bg-emerald-500 text-white', dot: 'bg-emerald-500' };
    if (score <= 4) return { label: 'Légère / Modérée', color: 'bg-lime-100 text-lime-800 border-lime-200', btnColor: 'bg-lime-500 text-white', dot: 'bg-lime-500' };
    if (score <= 6) return { label: 'Modérée', color: 'bg-amber-100 text-amber-800 border-amber-200', btnColor: 'bg-amber-500 text-white', dot: 'bg-amber-500' };
    if (score <= 8) return { label: 'Intense', color: 'bg-orange-100 text-orange-800 border-orange-200', btnColor: 'bg-orange-600 text-white', dot: 'bg-orange-500' };
    return { label: 'Insupportable', color: 'bg-rose-100 text-rose-800 border-rose-200', btnColor: 'bg-rose-600 text-white', dot: 'bg-rose-600' };
  };

  const handleSavePractitionerPain = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!patient) return;
    setPractitionerPainLoading(true);
    try {
      const dateObj = new Date(practitionerPainDate + 'T12:00:00');
      const newEntry: PainLogItem = {
        id: Date.now().toString(),
        score: practitionerPainScore,
        note: practitionerPainNote.trim() || 'Évaluation en consultation',
        date: dateObj.toISOString(),
        author: 'praticien'
      };
      const filtered = painLogs.filter(p => !(p.date && p.date.startsWith(practitionerPainDate)));
      const updated = [newEntry, ...filtered].sort(
        (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
      );
      setPainLogs(updated);

      await savePainLogsForPatient(patient.id, updated, patient.telephone);

      setIsAddPainModalOpen(false);
      setPractitionerPainNote('');
    } catch (err) {
      console.error('Error saving practitioner pain', err);
    } finally {
      setPractitionerPainLoading(false);
    }
  };

  const handleDeletePainLog = async (id: string) => {
    const updated = painLogs.filter(p => p.id !== id);
    setPainLogs(updated);
    setConfirmDeletePainId(null);
    if (patient) {
      await savePainLogsForPatient(patient.id, updated, patient.telephone);
    }
  };

  if (loading) {
    return <div className="p-8 text-center text-slate-500">Chargement des détails du patient...</div>;
  }

  if (!patient) {
    return <div className="p-8 text-center text-slate-500">Patient introuvable.</div>;
  }

  const handleAddForfait = async () => {
    if (!canEditSessionCount) return;
    const newForfait = forfait + 10;
    setForfait(newForfait);
    await supabase.from('patients').update({ forfait_seances: newForfait }).eq('id', patientId);
  };

  const handleQuickSaveForfait = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!canEditSessionCount || !patientId) return;
    const parsed = Math.max(0, parseInt(forfaitInputVal, 10) || 0);
    setSavingForfait(true);
    try {
      const { error } = await supabase
        .from('patients')
        .update({ forfait_seances: parsed })
        .eq('id', patientId);
      if (!error) {
        setForfait(parsed);
        setPatient((prev: any) => (prev ? { ...prev, forfait_seances: parsed } : prev));
        setIsEditingForfait(false);
      }
    } finally {
      setSavingForfait(false);
    }
  };

  const handleQuickSaveSeances = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!canEditSessionCount || !patientId) return;
    const parsed = Math.max(0, parseInt(seancesInputVal, 10) || 0);
    setSavingSeances(true);
    try {
      const { error } = await supabase
        .from('patients')
        .update({ nombre_seances: parsed })
        .eq('id', patientId);

      if (!error) {
        setPatient((prev: any) => (prev ? { ...prev, nombre_seances: parsed } : prev));

        const activeTr = treatments.find(t => t.statut === 'En cours') || (treatments.length === 1 ? treatments[0] : null);
        if (activeTr?.id) {
          const { error: trErr } = await supabase
            .from('treatments')
            .update({ nombre_seances_prescrites: parsed })
            .eq('id', activeTr.id);
          if (!trErr) {
            setTreatments(prev =>
              prev.map(t => (t.id === activeTr.id ? { ...t, nombre_seances_prescrites: parsed } : t))
            );
          }
        }
        setIsEditingSeances(false);
      }
    } finally {
      setSavingSeances(false);
    }
  };

  const handleGenerateAccess = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!patient?.telephone) {
      setAccessMessage({ type: 'error', text: 'Le patient doit avoir un numéro de téléphone renseigné.' });
      return;
    }

    setAccessLoading(true);
    setAccessMessage({ type: '', text: '' });

    try {
      const savedPlainPassword = accessPassword.trim();
      const result = await provisionOrResetPatientAccess(
        supabase,
        supabaseUrl,
        supabaseAnonKey,
        { id: patient.id, telephone: patient.telephone },
        savedPlainPassword
      );

      try {
        localStorage.setItem('reforme_preview_patient_id', patient.id);
      } catch {}

      // Sync exercises across any duplicate phone records so the patient immediately sees their videos
      if (exercises.length > 0) {
        await saveExercisesForPatient(patient.id, exercises, patient.telephone);
      }

      setPatient({ ...patient, has_access: true });
      setLastGeneratedAccess({ phone: result.canonicalPhone, password: savedPlainPassword });
      setAccessMessage({
        type: 'success',
        text: result.isReset
          ? `Mot de passe réinitialisé avec succès ! Connexion active immédiatement.`
          : `Accès généré et synchronisé avec succès ! Connexion active immédiatement.`,
      });
      setAccessPassword('');
    } catch (err: any) {
      setAccessMessage({ type: 'error', text: err.message || "Erreur lors de la génération de l'accès." });
    } finally {
      setAccessLoading(false);
    }
  };

  const handleAddNote = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedAppointmentId || !noteContent.trim()) {
      setNoteMessage({ type: 'error', text: 'Veuillez sélectionner une séance et saisir une note.' });
      return;
    }

    setNoteLoading(true);
    setNoteMessage({ type: '', text: '' });

    try {
      const originalApp = appointments.find(app => app.id === selectedAppointmentId);
      const dbNotes = originalApp?.therapist_id ? `||TH_ID:${originalApp.therapist_id}||${noteContent}` : noteContent;

      const { error } = await supabase
        .from('appointments')
        .update({ notes_seance: dbNotes })
        .eq('id', selectedAppointmentId);

      if (error) throw error;

      setNoteMessage({ type: 'success', text: 'Note ajoutée avec succès !' });
      
      // Update local state
      setAppointments(appointments.map(app => 
        app.id === selectedAppointmentId ? { ...app, notes_seance: noteContent } : app
      ));
      
      setTimeout(() => {
        setIsNoteModalOpen(false);
        setNoteContent('');
        setSelectedAppointmentId('');
        setNoteMessage({ type: '', text: '' });
      }, 1500);
    } catch (err: any) {
      setNoteMessage({ type: 'error', text: err.message || 'Erreur lors de l\'ajout de la note.' });
    } finally {
      setNoteLoading(false);
    }
  };

  const handleEditPatient = async (e: React.FormEvent) => {
    e.preventDefault();
    setEditPatientLoading(true);
    setEditPatientMessage({ type: '', text: '' });

    let resolvedClub = editPatientData.club || '';
    if (resolvedClub === '__NEW__') {
      const cleanNewName = newInlineClubName.replace(/[\[\]\|]/g, '').trim();
      if (!cleanNewName) {
        setEditPatientLoading(false);
        setEditPatientMessage({ type: 'error', text: 'Veuillez saisir le nom du nouveau club sportif.' });
        return;
      }
      try {
        await upsertPartnerClub(supabase, {
          name: cleanNewName,
          sport: newInlineClubSport || 'Football',
        });
      } catch (clubErr: any) {
        console.warn('Could not persist club in admin registry, saving on patient directly:', clubErr);
      }
      resolvedClub = cleanNewName;
    }

    const serializedAtcd = serializeAtcdWithMutuelle(
      editPatientData.cleanAtcd ?? editPatientData.atcd ?? '',
      Boolean(editPatientData.isMutualiste),
      editPatientData.isMutualiste ? editPatientData.organismeMutuelle || 'CNOPS' : '',
      resolvedClub
    );

    const parsedNbSeances =
      editPatientData.nombre_seances === '' ||
      editPatientData.nombre_seances === null ||
      editPatientData.nombre_seances === undefined
        ? null
        : Math.max(0, parseInt(String(editPatientData.nombre_seances), 10) || 0);

    const updatePayload: Record<string, any> = {
      nom: editPatientData.nom,
      prenom: editPatientData.prenom,
      telephone: editPatientData.telephone,
      email: editPatientData.email,
      date_naissance: editPatientData.date_naissance || null,
      cin: editPatientData.cin,
      adresse: editPatientData.adresse,
      pathologie: editPatientData.pathologie,
      atcd: serializedAtcd,
    };

    if (canEditSessionCount) {
      updatePayload.nombre_seances = parsedNbSeances;
    }

    const { error } = await supabase
      .from('patients')
      .update(updatePayload)
      .eq('id', patientId);

    setEditPatientLoading(false);
    if (error) {
      setEditPatientMessage({ type: 'error', text: error.message });
    } else {
      if (canEditSessionCount && parsedNbSeances !== null) {
        const activeTr =
          treatments.find(t => t.statut === 'En cours') ||
          (treatments.length === 1 ? treatments[0] : null);
        if (activeTr?.id) {
          const { error: trErr } = await supabase
            .from('treatments')
            .update({ nombre_seances_prescrites: parsedNbSeances })
            .eq('id', activeTr.id);
          if (!trErr) {
            setTreatments(prev =>
              prev.map(t =>
                t.id === activeTr.id ? { ...t, nombre_seances_prescrites: parsedNbSeances } : t
              )
            );
          }
        }
      }

      setEditPatientMessage({ type: 'success', text: 'Patient modifié avec succès' });
      const updatedPatient = { ...patient, ...updatePayload };
      setPatient(updatedPatient);
      fetchPartnerClubs(supabase, [updatedPatient]).then(setPartnerClubs);
      setTimeout(() => {
        setIsEditPatientModalOpen(false);
        setEditPatientMessage({ type: '', text: '' });
      }, 1500);
    }
  };

  const handleNewTreatment = async (e: React.FormEvent) => {
    e.preventDefault();
    setNewTreatmentLoading(true);
    setNewTreatmentMessage({ type: '', text: '' });

    const effectiveNewSeances = canEditSessionCount
      ? Math.max(1, Number(newTreatmentData.nombre_seances_prescrites) || 1)
      : Math.max(1, Number(patient?.nombre_seances) || 10);

    const { error } = await supabase
      .from('treatments')
      .insert([{
        patient_id: patientId,
        ...newTreatmentData,
        nombre_seances_prescrites: effectiveNewSeances,
      }]);

    setNewTreatmentLoading(false);
    if (error) {
      setNewTreatmentMessage({ type: 'error', text: error.message });
    } else {
      if (canEditSessionCount) {
        await supabase
          .from('patients')
          .update({ nombre_seances: effectiveNewSeances })
          .eq('id', patientId);
      }

      setNewTreatmentMessage({ type: 'success', text: 'Traitement ajouté avec succès' });
      fetchPatientDetails();
      setTimeout(() => {
        setIsNewTreatmentModalOpen(false);
        setNewTreatmentData({
          motif: '',
          nombre_seances_prescrites: 10,
          date_debut: new Date().toISOString().split('T')[0],
          medecin_prescripteur: '',
          statut: 'En cours'
        });
        setNewTreatmentMessage({ type: '', text: '' });
      }, 1500);
    }
  };

  const openEditTreatmentModal = (tr: any) => {
    setTreatmentToEdit({
      id: tr.id,
      motif: tr.motif || '',
      nombre_seances_prescrites: Number(tr.nombre_seances_prescrites) || 10,
      date_debut: tr.date_debut ? String(tr.date_debut).split('T')[0] : getMoroccoTodayStr(),
      medecin_prescripteur: tr.medecin_prescripteur || '',
      statut: tr.statut || 'En cours',
    });
    setEditTreatmentMessage({ type: '', text: '' });
    setIsEditTreatmentModalOpen(true);
  };

  const handleUpdateTreatment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!treatmentToEdit?.id) return;
    setEditTreatmentLoading(true);
    setEditTreatmentMessage({ type: '', text: '' });

    const parsedSeances = Math.max(1, Number(treatmentToEdit.nombre_seances_prescrites) || 1);
    const payload: Record<string, any> = {
      motif: treatmentToEdit.motif,
      date_debut: treatmentToEdit.date_debut || null,
      medecin_prescripteur: treatmentToEdit.medecin_prescripteur,
      statut: treatmentToEdit.statut || 'En cours',
    };
    if (canEditSessionCount) {
      payload.nombre_seances_prescrites = parsedSeances;
    }

    const { error } = await supabase
      .from('treatments')
      .update(payload)
      .eq('id', treatmentToEdit.id);

    setEditTreatmentLoading(false);
    if (error) {
      setEditTreatmentMessage({ type: 'error', text: error.message });
    } else {
      if (canEditSessionCount && (payload.statut === 'En cours' || treatments.length === 1)) {
        await supabase
          .from('patients')
          .update({ nombre_seances: parsedSeances })
          .eq('id', patientId);
      }
      setEditTreatmentMessage({ type: 'success', text: 'Traitement mis à jour avec succès' });
      await fetchPatientDetails();
      setTimeout(() => {
        setIsEditTreatmentModalOpen(false);
        setTreatmentToEdit(null);
        setEditTreatmentMessage({ type: '', text: '' });
      }, 1000);
    }
  };

  const openEditAppointmentModal = (app: any) => {
    const parsed = parseClinicDate(app.date_heure);
    const yyyy = parsed.getFullYear();
    const mm = String(parsed.getMonth() + 1).padStart(2, '0');
    const dd = String(parsed.getDate()).padStart(2, '0');
    const hh = String(parsed.getHours()).padStart(2, '0');
    const min = String(parsed.getMinutes()).padStart(2, '0');
    const cleanMotif = String(app.notes_seance || '')
      .replace(/^\|\|TH_ID:[a-f0-9-]+\|\|/i, '')
      .trim();
    setAppointmentToEdit(app);
    setEditAppDate(`${yyyy}-${mm}-${dd}`);
    setEditAppTime(`${hh}:${min}`);
    setEditAppMotif(cleanMotif || 'Séance de Suivi');
    setEditAppTherapist(app.therapist_id || '');
    setShowEditAppMotifDropdown(false);
    setIsEditAppointmentModalOpen(true);
  };

  const handleSaveAppointmentTime = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!appointmentToEdit || !editAppDate || !editAppTime) return;
    setEditAppLoading(true);

    const trimmedMotif = editAppMotif.trim() || 'Séance de Suivi';
    await ensureMotifExists(trimmedMotif);

    const newIso = toClinicIsoString(editAppDate, editAppTime);
    const resolvedThId = editAppTherapist ? editAppTherapist : null;

    const dbNotes = resolvedThId
      ? `||TH_ID:${resolvedThId}||${trimmedMotif}`
      : trimmedMotif;

    const { error } = await supabase
      .from('appointments')
      .update({
        date_heure: newIso,
        notes_seance: dbNotes,
        therapist_id: null,
      })
      .eq('id', appointmentToEdit.id);

    setEditAppLoading(false);
    if (!error) {
      setAppointments(prev =>
        prev.map(a =>
          a.id === appointmentToEdit.id
            ? {
                ...a,
                date_heure: newIso,
                notes_seance: trimmedMotif,
                therapist_id: resolvedThId,
              }
            : a
        )
      );
      setIsEditAppointmentModalOpen(false);
      setAppointmentToEdit(null);
    }
  };

  const confirmDeleteAppointment = (id: string) => {
    setAppointmentToDelete(id);
    setIsDeleteModalOpen(true);
  };

  const executeDeleteAppointment = async () => {
    if (!appointmentToDelete) return;
    
    setDeleteLoading(true);
    
    // First safely delete the billing record associated to this appointment
    await supabase.from('billings').delete().eq('appointment_id', appointmentToDelete);
    
    const { error } = await supabase
      .from('appointments')
      .delete()
      .eq('id', appointmentToDelete);

    if (!error) {
      setAppointments(appointments.filter(app => app.id !== appointmentToDelete));
      setBillings(billings.filter(b => b.appointment_id !== appointmentToDelete));
      setIsDeleteModalOpen(false);
      setAppointmentToDelete(null);
    } else {
      console.error("Erreur lors de la suppression de la séance : " + error.message);
    }
    setDeleteLoading(false);
  };

  const confirmDeleteBilling = (id: string) => {
    if (!isAdmin) return;
    setBillingToDelete(id);
    setIsDeleteBillingModalOpen(true);
  };

  const executeDeleteBilling = async () => {
    if (!billingToDelete || !isAdmin) return;
    
    setDeleteBillingLoading(true);
    const { error } = await supabase
      .from('billings')
      .delete()
      .eq('id', billingToDelete);

    if (!error) {
      setBillings(billings.filter(b => b.id !== billingToDelete));
      setIsDeleteBillingModalOpen(false);
      setBillingToDelete(null);
    } else {
      console.error("Erreur lors de la suppression de la facture : " + error.message);
    }
    setDeleteBillingLoading(false);
  };

  const openEditBillingModal = (bill: any) => {
    if (!isAdmin) return;
    setBillingToEdit(bill);
    setEditBillingForm({
      reference: getBillingDisplayReference(bill, docTemplates, customInvoiceRefs),
      montant: String(bill.montant ?? '0'),
      type_paiement: bill.type_paiement || 'Patient',
      statut: bill.statut === 'En attente' || bill.statut === 'Impayé' ? 'En attente' : 'Payé',
    });
    setEditBillingError('');
    setIsEditBillingModalOpen(true);
  };

  const handleUpdateBilling = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!billingToEdit || !isAdmin) return;

    const rawAmount = parseFloat(editBillingForm.montant);
    if (isNaN(rawAmount) || rawAmount < 0) {
      setEditBillingError('Veuillez saisir un montant valide.');
      return;
    }
    const parsedAmount = roundMoney(rawAmount);

    setEditBillingLoading(true);
    setEditBillingError('');

    try {
      const nextStatut = editBillingForm.statut === 'En attente' ? 'En attente' : 'Payé';
      const { error: billErr } = await supabase
        .from('billings')
        .update({
          montant: parsedAmount,
          type_paiement: editBillingForm.type_paiement,
          statut: nextStatut,
        })
        .eq('id', billingToEdit.id);

      if (billErr) throw billErr;

      const defaultRef = getBillingDisplayReference(billingToEdit, docTemplates, null);
      const trimmedRef = (editBillingForm.reference || '').trim();
      const refToStore = trimmedRef && trimmedRef !== defaultRef ? trimmedRef : '';
      const updatedRefs = await saveBillingCustomInvoiceRef(supabase, billingToEdit.id, refToStore);
      setCustomInvoiceRefs(updatedRefs);

      const linkedAppId =
        billingToEdit.appointment_id ||
        (billingToEdit.appointments && !Array.isArray(billingToEdit.appointments)
          ? billingToEdit.appointments.id
          : billingToEdit.appointments?.[0]?.id);

      if (linkedAppId) {
        await supabase
          .from('appointments')
          .update({ statut: nextStatut === 'Payé' ? 'Effectué' : 'Impayé' })
          .eq('id', linkedAppId);
      }

      await fetchPatientDetails();
      setIsEditBillingModalOpen(false);
      setBillingToEdit(null);
    } catch (err: any) {
      setEditBillingError(err.message || 'Erreur lors de la modification du règlement.');
    } finally {
      setEditBillingLoading(false);
    }
  };

  const executeDeletePatient = async () => {
    if (!patientId) return;
    
    setDeletePatientLoading(true);
    try {
      // 1. Delete associated billings
      await supabase.from('billings').delete().eq('patient_id', patientId);
      
      // 2. Delete associated appointments
      await supabase.from('appointments').delete().eq('patient_id', patientId);
      
      // 3. Delete associated treatments
      await supabase.from('treatments').delete().eq('patient_id', patientId);
      
      // 4. Delete patient
      const { error } = await supabase
        .from('patients')
        .delete()
        .eq('id', patientId);
        
      if (error) throw error;
      
      setIsDeletePatientModalOpen(false);
      // Navigate back to patients list
      window.location.hash = 'patients';
    } catch (err: any) {
      console.error("Erreur lors de la suppression de la fiche patient :", err.message);
    } finally {
      setDeletePatientLoading(false);
    }
  };

  const handleSettleBilling = async (bill: any) => {
    setIsSettling(bill.id);
    const appointmentId = bill.appointment_id || (bill.appointments && !Array.isArray(bill.appointments) ? bill.appointments.id : (bill.appointments?.[0]?.id));

    try {
      // 1. Update billing status
      const { data: updatedBillings, error: billError } = await supabase
        .from('billings')
        .update({ 
          statut: 'Payé', 
          date_facturation: new Date().toISOString() 
        })
        .eq('id', bill.id)
        .select();
        
      if (billError) {
        throw new Error("Erreur mise à jour facture: " + billError.message);
      }
      
      // 2. Update appointment status if exists
      let finalAppId = appointmentId;
      if (!finalAppId && updatedBillings && updatedBillings.length > 0) {
        finalAppId = updatedBillings[0].appointment_id;
      }

      if (finalAppId) {
        const { error: apptError } = await supabase
          .from('appointments')
          .update({ statut: 'Effectué' })
          .eq('id', finalAppId);
          
        if (apptError) {
          console.warn("Could not update appointment status:", apptError.message);
        }
      }
      
      // 3. Refresh patient details
      await fetchPatientDetails();
    } catch (error: any) {
      console.error("Settle error:", error);
    } finally {
      setIsSettling(null);
    }
  };

  const openNewAppointmentModal = () => {
    setNewAppointmentDate('');
    setNewAppointmentTime('');
    setNewAppointmentMotif('Séance de Suivi');
    setNewAppointmentTherapist('');
    setNewAppointmentMessage({ type: '', text: '' });
    setIsNewAppointmentModalOpen(true);
  };

  const handleNewAppointment = async (e: React.FormEvent) => {
    e.preventDefault();
    setNewAppointmentLoading(true);
    setNewAppointmentMessage({ type: '', text: '' });

    await ensureMotifExists(newAppointmentMotif);

    const dateHeure = toClinicIsoString(newAppointmentDate, newAppointmentTime);

    const validTherapistIds = therapists.map(t => t.id);
    const therapistIdToInsert = validTherapistIds.includes(newAppointmentTherapist) ? newAppointmentTherapist : null;

    // To prevent appointments_therapist_id_fkey foreign key violation on DB,
    // we set therapist_id to null in database and store therapistIdToInsert as metadata in notes_seance.
    const dbNotes = therapistIdToInsert ? `||TH_ID:${therapistIdToInsert}||${newAppointmentMotif}` : newAppointmentMotif;

    const { error } = await supabase
      .from('appointments')
      .insert([{
        patient_id: patientId,
        therapist_id: null, // Always null in DB to prevent foreign key constraint violation
        date_heure: dateHeure,
        statut: 'Confirmé',
        notes_seance: dbNotes,
        duree: 30
      }]);

    setNewAppointmentLoading(false);
    if (error) {
      setNewAppointmentMessage({ type: 'error', text: error.message });
    } else {
      setNewAppointmentMessage({ type: 'success', text: 'Rendez-vous ajouté avec succès' });
      fetchPatientDetails();
      setTimeout(() => {
        setIsNewAppointmentModalOpen(false);
        setNewAppointmentDate('');
        setNewAppointmentTime('');
        setNewAppointmentMessage({ type: '', text: '' });
      }, 1500);
    }
  };

  const paidPatientBillings = billings.filter((b) => isPaidBillingStatus(b.statut));
  const unpaidPatientBillings = billings.filter((b) => isUnpaidBillingStatus(b.statut));
  const totalPatientPaid = sumMoney(paidPatientBillings, (b) => b.montant);
  const totalPatientUnpaid = sumMoney(unpaidPatientBillings, (b) => b.montant);
  const totalPatientBilled = roundMoney(totalPatientPaid + totalPatientUnpaid);

  const flashInvoiceRefFeedback = (msg: string) => {
    setInvoiceRefSavedMsg(msg);
    setTimeout(() => {
      setInvoiceRefSavedMsg((prev) => (prev === msg ? '' : prev));
    }, 3000);
  };

  const handleSaveCustomPatientRef = async () => {
    if (!patient?.id) return;
    const trimmed = invoiceRefInput.trim();
    const updated = await savePatientCustomInvoiceRef(supabase, patient.id, trimmed);
    setCustomInvoiceRefs(updated);
    setInvoiceRefDirty(false);
    flashInvoiceRefFeedback(trimmed ? 'Référence enregistrée' : 'Référence automatique rétablie');
  };

  const handleResetPatientRefToAuto = async () => {
    if (!patient?.id) return;
    const updated = await savePatientCustomInvoiceRef(supabase, patient.id, '');
    setCustomInvoiceRefs(updated);
    const refDate = invoiceDateInput ? parseClinicDate(invoiceDateInput) : new Date();
    const autoRef = formatInvoiceReference(docTemplates, { date: refDate });
    setInvoiceRefInput(autoRef);
    setInvoiceRefDirty(false);
    flashInvoiceRefFeedback('Format automatique appliqué');
  };

  const handleIncrementInvoiceRef = async () => {
    const refDate = invoiceDateInput ? parseClinicDate(invoiceDateInput) : new Date();
    const { nextConfig, formattedRef } = await incrementInvoiceSequence(
      supabase,
      docTemplates,
      refDate
    );
    setDocTemplates(nextConfig);
    setInvoiceRefInput(formattedRef);
    if (patient?.id) {
      const updated = await savePatientCustomInvoiceRef(supabase, patient.id, formattedRef);
      setCustomInvoiceRefs(updated);
    }
    setInvoiceRefDirty(false);
    flashInvoiceRefFeedback(`Nouveau N° : ${formattedRef}`);
  };

  const handleSaveInlineBillingRef = async (bill: any) => {
    if (!bill?.id) return;
    const defaultRef = getBillingDisplayReference(bill, docTemplates, null);
    const trimmed = inlineRefValue.trim();
    const refToStore = trimmed && trimmed !== defaultRef ? trimmed : '';
    const updated = await saveBillingCustomInvoiceRef(supabase, bill.id, refToStore);
    setCustomInvoiceRefs(updated);
    setInlineRefBillId(null);
    setInlineRefValue('');
  };

  const handleDownloadBillingReceipt = async (bill: any) => {
    const latest = await fetchDocumentTemplates(supabase);
    setDocTemplates(latest);
    const linkedAppt = Array.isArray(bill.appointments) ? bill.appointments[0] : bill.appointments;
    const resolvedRef = getBillingDisplayReference(bill, latest, customInvoiceRefs);
    exportPatientReceiptPDF(latest, {
      patient,
      billing: bill,
      appointment: linkedAppt,
      receiptNumber: resolvedRef,
    });
  };

  const generateInvoicePDF = async () => {
    const latest = await fetchDocumentTemplates(supabase);
    setDocTemplates(latest);
    const activeRef =
      invoiceRefInput.trim() ||
      formatInvoiceReference(latest, {
        date: invoiceDateInput ? parseClinicDate(invoiceDateInput) : new Date(),
      });
    if (patient?.id && invoiceRefDirty && activeRef) {
      const updated = await savePatientCustomInvoiceRef(supabase, patient.id, activeRef);
      setCustomInvoiceRefs(updated);
      setInvoiceRefDirty(false);
    }
    exportPatientInvoicePDF(latest, {
      patient,
      billings,
      invoiceNumber: activeRef,
      invoiceDate: invoiceDateInput,
    });
  };

  const generateInvoiceExcel = async () => {
    const latest = await fetchDocumentTemplates(supabase);
    setDocTemplates(latest);
    const activeRef =
      invoiceRefInput.trim() ||
      formatInvoiceReference(latest, {
        date: invoiceDateInput ? parseClinicDate(invoiceDateInput) : new Date(),
      });
    if (patient?.id && invoiceRefDirty && activeRef) {
      const updated = await savePatientCustomInvoiceRef(supabase, patient.id, activeRef);
      setCustomInvoiceRefs(updated);
      setInvoiceRefDirty(false);
    }
    exportPatientInvoiceExcel(latest, {
      patient,
      billings,
      invoiceNumber: activeRef,
      invoiceDate: invoiceDateInput,
    });
  };

  const exportHistoryToExcel = () => {
    const completedAppointments = [...appointments]
      .filter((a) => a.statut === 'Effectué')
      .sort((a, b) => parseClinicDate(a.date_heure).getTime() - parseClinicDate(b.date_heure).getTime());
    const data = completedAppointments.map((app, idx) => ({
      'N°': idx + 1,
      'Date': parseClinicDate(app.date_heure).toLocaleDateString('fr-FR'),
      'Nature des soins': app.notes_seance || 'Séance de kinésithérapie',
    }));

    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Calendrier_Soins');
    XLSX.writeFile(wb, `Calendrier_Soins_${patient.nom}_${patient.prenom}.xlsx`);
  };

  const generateCalendarPDF = async () => {
    const latest = await fetchDocumentTemplates(supabase);
    setDocTemplates(latest);
    exportCareCalendarPDF(latest, {
      patient,
      appointments,
      treatments,
      therapists,
    });
  };

  const getPatientAlert = () => {
    if (!patient) return null;
    const nowLocalDate = getMoroccoNow();
    
    const completedAppts = appointments.filter(
      a => a.statut === 'Effectué' || a.statut === 'Impayé'
    );
    const upcomingAppts = appointments.filter(a => {
      const apptDate = parseClinicDate(a.date_heure);
      return apptDate >= nowLocalDate;
    });
    const hasUpcoming = upcomingAppts.length > 0;
    const completedCount = completedAppts.length;

    let lastApptDate: Date | null = null;
    if (completedAppts.length > 0) {
      const sortedCompleted = [...completedAppts].sort((a, b) => parseClinicDate(b.date_heure).getTime() - parseClinicDate(a.date_heure).getTime());
      lastApptDate = parseClinicDate(sortedCompleted[0].date_heure);
    } else if (appointments.length > 0) {
      const pastAppts = appointments.filter(a => parseClinicDate(a.date_heure) < nowLocalDate);
      if (pastAppts.length > 0) {
        const sortedPast = [...pastAppts].sort((a, b) => parseClinicDate(b.date_heure).getTime() - parseClinicDate(a.date_heure).getTime());
        lastApptDate = parseClinicDate(sortedPast[0].date_heure);
      }
    }

    let prescribedSessions = patient.nombre_seances || 0;
    const activeTreatments = treatments.filter(t => t.statut === 'En cours');
    if (activeTreatments.length > 0) {
      prescribedSessions = activeTreatments[0].nombre_seances_prescrites || prescribedSessions;
    }

    if (prescribedSessions > 0 && completedCount < prescribedSessions && !hasUpcoming) {
      return {
        type: 'uncompleted',
        title: "Alerte d'Assiduité : Séances incomplètes",
        message: `Le patient a réalisé uniquement ${completedCount} séance(s) sur les ${prescribedSessions} prescrites pour son traitement, et aucun nouveau rendez-vous n'est planifié.`,
        badgeColor: 'border-amber-200 bg-amber-50 text-amber-800'
      };
    } else if (lastApptDate && !hasUpcoming) {
      const diffMs = nowLocalDate.getTime() - lastApptDate.getTime();
      const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
      if (diffDays >= 14) {
        return {
          type: 'discontinued',
          title: "Alerte d'Assiduité : Patient inactif / Arrêt de soins",
          message: `Le patient n'a plus effectué de séance depuis ${diffDays} jours (dernière séance le ${lastApptDate.toLocaleDateString('fr-FR')}) et n'est inscrit à aucun prochain rendez-vous.`,
          badgeColor: 'border-rose-200 bg-rose-50 text-rose-800'
        };
      }
    }
    return null;
  };

  const activeAlert = getPatientAlert();

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      {/* Header Profile */}
      <div className="flex flex-col md:flex-row gap-6 items-start md:items-center justify-between bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
        <div className="flex items-center gap-5">
          <div className="h-20 w-20 rounded-full bg-primary-100 flex items-center justify-center text-primary-700 text-2xl font-bold uppercase">
            {patient.prenom?.[0]}{patient.nom?.[0]}
          </div>
          <div>
            <div className="flex flex-wrap items-center gap-2.5">
              <h1 className="text-2xl font-bold text-slate-900">{patient.prenom} {patient.nom}</h1>
              {(() => {
                const mutInfo = parsePatientMutuelle(patient);
                return mutInfo.club ? (
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-lg text-xs font-bold bg-indigo-50 text-indigo-700 border border-indigo-200">
                    <Trophy className="h-3.5 w-3.5 text-indigo-600" />
                    {mutInfo.club}
                  </span>
                ) : null;
              })()}
            </div>
            <div className="flex flex-wrap items-center gap-4 mt-2 text-sm text-slate-500">
              {patient.date_naissance && (
                <span className="flex items-center gap-1.5"><Calendar className="h-4 w-4" /> {new Date(patient.date_naissance).toLocaleDateString('fr-FR')}</span>
              )}
              {patient.telephone && (
                <span className="flex items-center gap-1.5"><Phone className="h-4 w-4" /> {patient.telephone}</span>
              )}
              {patient.email && (
                <span className="flex items-center gap-1.5"><Mail className="h-4 w-4" /> {patient.email}</span>
              )}
            </div>
          </div>
        </div>
        <div className="flex gap-3 w-full md:w-auto flex-wrap">
          <Button variant="outline" className="flex-1 md:flex-none text-rose-600 hover:text-rose-700 hover:bg-rose-50 border-rose-200" onClick={() => setIsDeletePatientModalOpen(true)}>
            <Trash2 className="h-4 w-4 mr-2" /> Supprimer
          </Button>
          <Button
            variant="outline"
            className="flex-1 md:flex-none text-emerald-700 hover:text-emerald-800 hover:bg-emerald-50 border-emerald-200"
            onClick={() => {
              try {
                localStorage.setItem('reforme_preview_patient_id', patient.id);
              } catch {}
              window.location.hash = 'espace-patient';
            }}
          >
            <ExternalLink className="h-4 w-4 mr-2" /> Espace Patient
          </Button>
          <Button
            variant="outline"
            className="flex-1 md:flex-none"
            onClick={() => {
              setAccessMessage({ type: '', text: '' });
              setLastGeneratedAccess(null);
              setIsAccessModalOpen(true);
            }}
          >
            <Key className="h-4 w-4 mr-2" /> {patient.has_access ? 'Accès / Reset' : 'Accès'}
          </Button>
          <Button
            variant="outline"
            className="flex-1 md:flex-none"
            onClick={() => {
              const target = returnRoute || 'patients';
              window.location.hash = target;
            }}
          >
            <ArrowLeft className="h-4 w-4 mr-2" />
            {returnRoute === 'agenda'
              ? "Retour à l'agenda"
              : returnRoute === 'dashboard'
              ? 'Retour au tableau de bord'
              : returnRoute === 'finance'
              ? 'Retour aux finances'
              : returnRoute === 'patients'
              ? 'Retour aux patients'
              : returnRoute === 'settings'
              ? 'Retour aux paramètres'
              : returnRoute === 'espace-club'
              ? 'Retour au portail club'
              : 'Retour'}
          </Button>
          <Button variant="outline" className="flex-1 md:flex-none" onClick={() => {
            const mutInfo = parsePatientMutuelle(patient);
            setNewInlineClubName('');
            setEditPatientData({
              ...patient,
              nombre_seances: activeTreatment.seances_prescrites || patient.nombre_seances || '',
              cleanAtcd: mutInfo.cleanAtcd,
              isMutualiste: mutInfo.isMutualiste,
              organismeMutuelle: mutInfo.organisme || 'CNOPS',
              club: mutInfo.club || '',
            });
            setIsEditPatientModalOpen(true);
          }}>Modifier</Button>
          <Button className="flex-1 md:flex-none gap-2" onClick={openNewAppointmentModal}><Plus className="h-4 w-4" /> Nouveau RDV</Button>
        </div>
      </div>

      {/* Active Assiduousness Alert Banner */}
      {activeAlert && (
        <div className={`p-4 rounded-xl border flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-sm transition-all ${activeAlert.badgeColor}`}>
          <div className="flex items-start gap-3">
            <AlertCircle className="h-5 w-5 text-current flex-shrink-0 mt-0.5" />
            <div>
              <h4 className="font-bold text-sm sm:text-base">{activeAlert.title}</h4>
              <p className="text-xs sm:text-sm opacity-90 mt-0.5">{activeAlert.message}</p>
            </div>
          </div>
          <div className="flex items-center gap-2 self-end sm:self-center">
            {patient.email && (
              <Button 
                size="sm" 
                variant="outline" 
                className="bg-white hover:bg-slate-50 border-slate-200 text-slate-800"
                onClick={() => {
                  const subject = encodeURIComponent("Suivi de votre traitement - Cabinet Re Forme");
                  const text = `Bonjour ${patient.prenom} ${patient.nom},\n\nNous vous contactons pour faire le suivi de votre dossier thérapeutique chez Cabinet Re Forme.\n\n${activeAlert.type === 'uncompleted' ? `Nous constatons que vous n'avez réalisé que certaines séances prescrites, et aucun nouveau rendez-vous n'est planifié.` : `Vous n'avez pas réalisé de séance récemment, et aucun rendez-vous de suivi n'est au calendrier.`}\n\nPour la réussite de votre traitement, nous vous encourageons à prendre rendez-vous en ligne ou en nous appelant.\n\nCordialement,\nL'équipe Cabinet Re Forme`;
                  window.location.href = `mailto:${patient.email}?subject=${subject}&body=${encodeURIComponent(text)}`;
                }}
              >
                <Mail className="h-3.5 w-3.5 mr-1 text-slate-650" /> Contacter par Email
              </Button>
            )}
            <Button
              size="sm"
              className="bg-transparent hover:bg-black/5 text-current border border-current font-semibold"
              onClick={openNewAppointmentModal}
            >
              Planifier un RDV
            </Button>
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="flex space-x-1 border-b border-slate-200 overflow-x-auto">
        <button 
          onClick={() => setActiveTab('dossier')}
          className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${activeTab === 'dossier' ? 'border-primary-500 text-primary-600' : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'}`}
        >
          Dossier de Soins
        </button>
        <button 
          onClick={() => setActiveTab('traitements')}
          className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${activeTab === 'traitements' ? 'border-primary-500 text-primary-600' : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'}`}
        >
          Historique des Traitements
        </button>
        <button 
          onClick={() => setActiveTab('historique')}
          className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${activeTab === 'historique' ? 'border-primary-500 text-primary-600' : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'}`}
        >
          Historique RDV
        </button>
        <button 
          onClick={() => setActiveTab('facturation')}
          className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${activeTab === 'facturation' ? 'border-primary-500 text-primary-600' : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'}`}
        >
          Facturation
        </button>
        <button 
          onClick={() => setActiveTab('exercices')}
          className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${activeTab === 'exercices' ? 'border-primary-500 text-primary-600' : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'}`}
        >
          Vidéos & Exercices
        </button>

      </div>

      {/* Tab Content */}
      {activeTab === 'dossier' && (
        <div className="grid gap-6 md:grid-cols-12">
          {/* Main Content Area */}
          <div className="md:col-span-8 space-y-6">
            {/* Nouveau Bloc: Fiche Administrative */}
            <Card className="border-0 shadow-sm overflow-hidden bg-white">
              <CardHeader className="pb-3 border-b border-slate-50">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base font-bold flex items-center gap-2 text-slate-800">
                    <User className="h-5 w-5 text-primary-500" />
                    Fiche Administrative
                  </CardTitle>
                  <Button 
                    variant="ghost" 
                    size="sm" 
                    className="h-8 text-primary-600 hover:text-primary-700 hover:bg-primary-50 font-bold"
                    onClick={() => {
                      const mutInfo = parsePatientMutuelle(patient);
                      setNewInlineClubName('');
                      setEditPatientData({
                        ...patient,
                        nombre_seances: activeTreatment.seances_prescrites || patient.nombre_seances || '',
                        cleanAtcd: mutInfo.cleanAtcd,
                        isMutualiste: mutInfo.isMutualiste,
                        organismeMutuelle: mutInfo.organisme || 'CNOPS',
                        club: mutInfo.club || '',
                      });
                      setIsEditPatientModalOpen(true);
                    }}
                  >
                    MODIFIER
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="pt-6">
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-6">
                  <div className="space-y-1">
                    <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Âge / Date de naissance</h4>
                    <p className="text-sm font-bold text-slate-900">
                      {age ? `${age} ans` : 'N/A'} 
                      {patient.date_naissance && <span className="text-slate-400 font-medium ml-1">({new Date(patient.date_naissance).toLocaleDateString('fr-FR')})</span>}
                    </p>
                  </div>
                  <div className="space-y-1">
                    <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">CIN / Identité</h4>
                    <p className="text-sm font-bold text-slate-900">{patient.cin || 'Non renseigné'}</p>
                  </div>
                  <div className="space-y-1">
                    <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Couverture / Mutuelle</h4>
                    {(() => {
                      const mutInfo = parsePatientMutuelle(patient);
                      return mutInfo.isMutualiste ? (
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-lg text-xs font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                          Mutualiste{mutInfo.organisme ? ` • ${mutInfo.organisme}` : ''}
                        </span>
                      ) : (
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-lg text-xs font-semibold bg-slate-100 text-slate-600 border border-slate-200">
                          Non mutualiste
                        </span>
                      );
                    })()}
                  </div>
                  <div className="space-y-1">
                    <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Club Sportif Conventionné</h4>
                    {(() => {
                      const mutInfo = parsePatientMutuelle(patient);
                      return mutInfo.club ? (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-lg text-xs font-bold bg-indigo-50 text-indigo-700 border border-indigo-200">
                          <Trophy className="h-3.5 w-3.5 text-indigo-600" />
                          {mutInfo.club}
                        </span>
                      ) : (
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-lg text-xs font-medium bg-slate-50 text-slate-500 border border-slate-200">
                          Particulier (Hors club)
                        </span>
                      );
                    })()}
                  </div>
                  <div className="space-y-1">
                    <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">N° de Téléphone</h4>
                    <div className="flex items-center gap-2">
                      <Phone className="h-3.5 w-3.5 text-primary-500" />
                      <p className="text-sm font-bold text-slate-900">{patient.telephone || 'Non renseigné'}</p>
                    </div>
                  </div>
                  <div className="space-y-1 sm:col-span-2 md:col-span-1">
                    <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Adresse E-mail</h4>
                    <div className="flex items-center gap-2">
                      <Mail className="h-3.5 w-3.5 text-primary-500" />
                      <p className="text-sm font-bold text-slate-900 truncate">{patient.email || 'Non renseigné'}</p>
                    </div>
                  </div>
                  <div className="space-y-1">
                    <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Adresse Résidence</h4>
                    <div className="flex items-center gap-2">
                      <MapPin className="h-3.5 w-3.5 text-primary-500" />
                      <p className="text-sm font-bold text-slate-900 leading-tight">
                        {patient.adresse || 'Aucune adresse enregistrée'}
                      </p>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <Card className="border-0 shadow-sm border-t-4 border-t-primary-500">
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                  <CardTitle className="text-sm font-bold flex items-center gap-2 text-primary-700">
                    <Activity className="h-4 w-4" />
                    Traitement Actuel
                  </CardTitle>
                  {canEditSessionCount && !isEditingSeances && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-7 px-2 text-[11px] font-bold text-primary-600 hover:text-primary-700 hover:bg-primary-50 gap-1"
                      onClick={() => {
                        setSeancesInputVal(String(activeTreatment.seances_prescrites || 0));
                        setIsEditingSeances(true);
                      }}
                    >
                      <Edit2 className="h-3 w-3" />
                      Modifier séances
                    </Button>
                  )}
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    <div>
                      <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Motif de consultation</h4>
                      <p className="text-base font-bold text-slate-900 mt-1">{activeTreatment.motif}</p>
                      {activeTreatment.medecin_prescripteur && (
                        <p className="text-xs text-slate-500 mt-1 font-medium italic">
                          Prescrit par : {activeTreatment.medecin_prescripteur}
                        </p>
                      )}
                    </div>

                    {canEditSessionCount && isEditingSeances ? (
                      <form
                        onSubmit={handleQuickSaveSeances}
                        className="p-3 rounded-xl bg-slate-50 border border-slate-200 space-y-2.5"
                      >
                        <div className="flex items-center justify-between">
                          <label className="text-[11px] font-bold uppercase text-slate-600">
                            Nombre de séances prescrites
                          </label>
                          <span className="text-[11px] font-semibold text-slate-500">
                            {activeTreatment.seances_effectuees} réalisée(s)
                          </span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() =>
                              setSeancesInputVal(prev =>
                                String(Math.max(0, (parseInt(prev, 10) || 0) - 1))
                              )
                            }
                            className="h-8 w-8 rounded-lg border border-slate-200 bg-white hover:bg-slate-100 flex items-center justify-center text-slate-700 shrink-0"
                          >
                            <Minus className="h-3.5 w-3.5" />
                          </button>
                          <input
                            type="number"
                            min="0"
                            value={seancesInputVal}
                            onChange={e => setSeancesInputVal(e.target.value)}
                            className="w-full h-8 px-2.5 text-center font-bold text-sm border border-slate-200 rounded-lg bg-white text-slate-900 focus:ring-2 focus:ring-primary-500 outline-none"
                          />
                          <button
                            type="button"
                            onClick={() =>
                              setSeancesInputVal(prev =>
                                String((parseInt(prev, 10) || 0) + 1)
                              )
                            }
                            className="h-8 w-8 rounded-lg border border-slate-200 bg-white hover:bg-slate-100 flex items-center justify-center text-slate-700 shrink-0"
                          >
                            <Plus className="h-3.5 w-3.5" />
                          </button>
                        </div>
                        <div className="flex flex-wrap items-center justify-between gap-1.5">
                          <div className="flex items-center gap-1">
                            {[10, 15, 20, 30].map(preset => (
                              <button
                                key={preset}
                                type="button"
                                onClick={() => setSeancesInputVal(String(preset))}
                                className="px-2 py-0.5 rounded bg-white border border-slate-200 hover:border-primary-300 text-[11px] font-semibold text-slate-700"
                              >
                                {preset}
                              </button>
                            ))}
                            <button
                              type="button"
                              onClick={() =>
                                setSeancesInputVal(prev =>
                                  String((parseInt(prev, 10) || 0) + 5)
                                )
                              }
                              className="px-2 py-0.5 rounded bg-primary-50 border border-primary-200 text-[11px] font-bold text-primary-700"
                            >
                              +5
                            </button>
                          </div>
                          <div className="flex items-center gap-1">
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              disabled={savingSeances}
                              onClick={() => setIsEditingSeances(false)}
                              className="h-7 px-2 text-xs text-slate-500"
                            >
                              <X className="h-3.5 w-3.5" />
                            </Button>
                            <Button
                              type="submit"
                              size="sm"
                              disabled={savingSeances}
                              className="h-7 px-2.5 text-xs gap-1"
                            >
                              <Check className="h-3.5 w-3.5" />
                              {savingSeances ? '...' : 'Valider'}
                            </Button>
                          </div>
                        </div>
                      </form>
                    ) : (
                      <div className="pt-2">
                        <div className="flex justify-between text-[11px] mb-1.5 font-bold uppercase text-slate-500">
                          <span>Séances effectuées</span>
                          {canEditSessionCount ? (
                            <button
                              type="button"
                              onClick={() => {
                                setSeancesInputVal(String(activeTreatment.seances_prescrites || 0));
                                setIsEditingSeances(true);
                              }}
                              title="Cliquer pour modifier le nombre de séances prescrites"
                              className="text-primary-600 hover:text-primary-700 inline-flex items-center gap-1 cursor-pointer"
                            >
                              <span>
                                {activeTreatment.seances_effectuees} / {activeTreatment.seances_prescrites}
                              </span>
                              <Edit2 className="h-2.5 w-2.5 opacity-70" />
                            </button>
                          ) : (
                            <span className="text-primary-600">
                              {activeTreatment.seances_effectuees} / {activeTreatment.seances_prescrites}
                            </span>
                          )}
                        </div>
                        <div className="h-2 w-full bg-slate-200/50 rounded-full overflow-hidden">
                          <div 
                            className="h-full bg-primary-500 rounded-full transition-all duration-500 shadow-[0_0_8px_rgba(var(--primary-500),0.3)]"
                            style={{ width: `${progressPercentage}%` }}
                          ></div>
                        </div>
                        {remainingSessions > 0 ? (
                          <p className="text-[11px] text-slate-500 mt-1.5 font-medium">
                            Reste {remainingSessions} séance{remainingSessions > 1 ? 's' : ''} sur la prescription
                          </p>
                        ) : activeTreatment.seances_prescrites > 0 &&
                          activeTreatment.seances_effectuees > activeTreatment.seances_prescrites ? (
                          <p className="text-[11px] text-emerald-700 mt-1.5 font-semibold">
                            Protocole initial complété (+{activeTreatment.seances_effectuees - activeTreatment.seances_prescrites} de suivi)
                          </p>
                        ) : null}
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>

              <Card className="border-0 shadow-sm border-t-4 border-t-emerald-500">
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                  <CardTitle className="text-sm font-bold flex items-center gap-2 text-emerald-700">
                    <FileText className="h-4 w-4" />
                    Forfait
                  </CardTitle>
                  {canEditSessionCount && (
                    <div className="flex items-center gap-1">
                      {!isEditingForfait && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="h-7 px-2 text-[10px] font-bold text-slate-600 hover:text-slate-900"
                          onClick={() => {
                            setForfaitInputVal(String(forfait));
                            setIsEditingForfait(true);
                          }}
                        >
                          <Edit2 className="h-3 w-3 mr-1" />
                          MODIFIER
                        </Button>
                      )}
                      <Button variant="ghost" size="sm" className="h-7 text-[10px] font-bold text-emerald-700 hover:bg-emerald-50" onClick={handleAddForfait}>+ 10 SÉANCES</Button>
                    </div>
                  )}
                </CardHeader>
                <CardContent>
                  {canEditSessionCount && isEditingForfait ? (
                    <form
                      onSubmit={handleQuickSaveForfait}
                      className="p-3 rounded-xl bg-slate-50 border border-slate-200 space-y-2"
                    >
                      <label className="text-[11px] font-bold uppercase text-slate-600 block">
                        Solde forfait (séances restantes)
                      </label>
                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() =>
                            setForfaitInputVal(prev =>
                              String(Math.max(0, (parseInt(prev, 10) || 0) - 1))
                            )
                          }
                          className="h-8 w-8 rounded-lg border border-slate-200 bg-white hover:bg-slate-100 flex items-center justify-center text-slate-700 shrink-0"
                        >
                          <Minus className="h-3.5 w-3.5" />
                        </button>
                        <input
                          type="number"
                          min="0"
                          value={forfaitInputVal}
                          onChange={e => setForfaitInputVal(e.target.value)}
                          className="w-full h-8 px-2.5 text-center font-bold text-sm border border-slate-200 rounded-lg bg-white text-slate-900 focus:ring-2 focus:ring-emerald-500 outline-none"
                        />
                        <button
                          type="button"
                          onClick={() =>
                            setForfaitInputVal(prev =>
                              String((parseInt(prev, 10) || 0) + 1)
                            )
                          }
                          className="h-8 w-8 rounded-lg border border-slate-200 bg-white hover:bg-slate-100 flex items-center justify-center text-slate-700 shrink-0"
                        >
                          <Plus className="h-3.5 w-3.5" />
                        </button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          disabled={savingForfait}
                          onClick={() => setIsEditingForfait(false)}
                          className="h-8 px-2 text-slate-500"
                        >
                          <X className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          type="submit"
                          size="sm"
                          disabled={savingForfait}
                          className="h-8 px-2.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs"
                        >
                          <Check className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </form>
                  ) : (
                    <div className={`p-4 rounded-xl flex items-center justify-between ${forfait < 2 ? 'bg-orange-50' : 'bg-emerald-50'}`}>
                      <div className="flex items-center gap-3">
                        <span className={`text-2xl font-black ${forfait < 2 ? 'text-orange-600' : 'text-emerald-600'}`}>{forfait}</span>
                        <div>
                          <h4 className={`text-[10px] font-black uppercase tracking-wider ${forfait < 2 ? 'text-orange-800' : 'text-emerald-800'}`}>
                            Restantes
                          </h4>
                          <p className={`text-[9px] font-bold ${forfait < 2 ? 'text-orange-600' : 'text-emerald-600'}`}>
                            {forfait < 2 ? 'Renouvellement conseillé' : 'Solde suffisant'}
                          </p>
                        </div>
                      </div>
                      <Activity className={`h-8 w-8 opacity-20 ${forfait < 2 ? 'text-orange-500' : 'text-emerald-500'}`} />
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>

            {/* Bloc Suivi Quotidien de la Douleur (EVA 1-10) */}
            <Card className="border-0 shadow-sm overflow-hidden bg-white">
              <CardHeader className="pb-3 border-b border-slate-50 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div className="flex items-center gap-2.5">
                  <div className="h-8 w-8 rounded-lg bg-rose-50 text-rose-500 flex items-center justify-center flex-shrink-0">
                    <HeartPulse className="h-4 w-4" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <CardTitle className="text-base font-bold text-slate-800">
                        Suivi de la Douleur Quotidienne (Échelle EVA 1-10)
                      </CardTitle>
                      <span className="px-2 py-0.5 text-[10px] font-bold rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 flex items-center gap-1">
                        <CheckCircle2 className="h-3 w-3" /> Synchronisé en direct avec le patient
                      </span>
                    </div>
                    <p className="text-xs text-slate-500">Diagramme et historique synchronisés entre l'espace patient, l'administrateur et le secrétariat</p>
                  </div>
                </div>
                <div className="flex items-center gap-2 self-end sm:self-center">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={syncPainAndExercises}
                    title="Actualiser les données du patient"
                    className="h-8 px-2.5 text-xs text-slate-600 hover:text-primary-600 gap-1"
                  >
                    <RefreshCw className="h-3.5 w-3.5" /> Actualiser
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setIsAddPainModalOpen(true)}
                    className="rounded-lg text-xs font-bold text-primary-600 hover:bg-primary-50 border-primary-100 gap-1.5"
                  >
                    <Plus className="h-3.5 w-3.5" /> Évaluer / Noter
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="pt-4">
                {painLogs.length === 0 ? (
                  <div className="text-center py-6 bg-slate-50 rounded-xl border border-dashed border-slate-200">
                    <HeartPulse className="h-8 w-8 text-slate-300 mx-auto mb-2" />
                    <p className="text-xs font-bold text-slate-500">Aucune évaluation enregistrée pour le moment</p>
                    <p className="text-[11px] text-slate-400 mt-1 max-w-sm mx-auto">
                      Le patient peut évaluer son niveau de douleur de 1 à 10 chaque jour depuis son portail patient.
                    </p>
                    <Button 
                      variant="ghost" 
                      size="sm" 
                      onClick={() => setIsAddPainModalOpen(true)} 
                      className="mt-3 text-xs text-primary-600 hover:bg-white"
                    >
                      Ajouter une note de douleur maintenant
                    </Button>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {/* Latest score summary banner */}
                    {(() => {
                      const latest = painLogs[0];
                      const badge = getPainBadge(latest.score);
                      return (
                        <div className="p-4 rounded-xl bg-slate-50 border border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                          <div className="flex items-center gap-3">
                            <div className={`h-12 w-12 rounded-2xl flex items-center justify-center font-black text-xl shadow-inner ${
                              latest.score <= 2 ? 'bg-emerald-500 text-white' :
                              latest.score <= 4 ? 'bg-lime-500 text-white' :
                              latest.score <= 6 ? 'bg-amber-500 text-white' :
                              latest.score <= 8 ? 'bg-orange-600 text-white' :
                              'bg-rose-600 text-white'
                            }`}>
                              {latest.score}
                            </div>
                            <div>
                              <div className="flex items-center gap-2">
                                <span className="font-bold text-sm text-slate-900">Dernier niveau noté : {latest.score} / 10</span>
                                <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full border ${badge.color}`}>
                                  {badge.label}
                                </span>
                              </div>
                              <p className="text-xs text-slate-500 mt-0.5">
                                {new Date(latest.date).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
                                {latest.note && <span className="font-medium text-slate-700 ml-1.5 italic">« {latest.note} »</span>}
                              </p>
                            </div>
                          </div>

                          {/* Quick statistics if multiple logs */}
                          {painLogs.length > 1 && (
                            <div className="text-left sm:text-right border-t sm:border-t-0 pt-2 sm:pt-0 border-slate-200">
                              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Moyenne</p>
                              <p className="text-sm font-black text-slate-800">
                                {(painLogs.reduce((acc, cur) => acc + cur.score, 0) / painLogs.length).toFixed(1)} / 10
                              </p>
                            </div>
                          )}
                        </div>
                      );
                    })()}

                    {/* Graphique Linéaire d'Évolution sur 30 jours */}
                    <div className="bg-white p-4 rounded-xl border border-slate-100 shadow-sm">
                      <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider mb-3">
                        Courbe d'évolution du niveau de douleur (30 jours)
                      </h4>
                      <PainEvolutionChart logs={painLogs} daysCount={30} />
                    </div>

                    {/* Timeline / Recent entries */}
                    <div>
                      <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Historique des évaluations</h4>
                      <div className="divide-y divide-slate-100 border border-slate-100 rounded-xl overflow-hidden bg-white max-h-56 overflow-y-auto">
                        {painLogs.slice(0, 8).map((item) => {
                          const badge = getPainBadge(item.score);
                          return (
                            <div key={item.id} className="p-3 flex items-center justify-between hover:bg-slate-50 transition-colors">
                              <div className="flex items-center gap-3">
                                <span className={`h-7 w-7 rounded-lg flex items-center justify-center font-bold text-xs ${
                                  item.score <= 2 ? 'bg-emerald-100 text-emerald-800' :
                                  item.score <= 4 ? 'bg-lime-100 text-lime-800' :
                                  item.score <= 6 ? 'bg-amber-100 text-amber-800' :
                                  item.score <= 8 ? 'bg-orange-100 text-orange-800' :
                                  'bg-rose-100 text-rose-800'
                                }`}>
                                  {item.score}
                                </span>
                                <div>
                                  <p className="text-xs font-semibold text-slate-900">
                                    {new Date(item.date).toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' })}
                                    {item.note && <span className="font-normal text-slate-600 ml-1.5">— {item.note}</span>}
                                  </p>
                                  <p className="text-[10px] text-slate-400">
                                    {new Date(item.date).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })} • {badge.label}
                                  </p>
                                </div>
                              </div>
                              {confirmDeletePainId === item.id ? (
                                <div className="flex items-center gap-1 shrink-0">
                                  <button
                                    type="button"
                                    onClick={() => setConfirmDeletePainId(null)}
                                    className="px-2 py-1 text-[11px] font-medium text-slate-600 hover:bg-slate-100 rounded"
                                  >
                                    Annuler
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => handleDeletePainLog(item.id)}
                                    className="px-2 py-1 text-[11px] font-semibold bg-rose-600 text-white hover:bg-rose-700 rounded"
                                  >
                                    Supprimer
                                  </button>
                                </div>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() => setConfirmDeletePainId(item.id)}
                                  className="p-1.5 text-slate-400 hover:text-red-500 rounded-md transition-colors"
                                  title="Supprimer"
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </button>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            <Card className="border-0 shadow-sm">
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle className="text-base font-bold flex items-center gap-2">
                  <FileText className="h-5 w-5 text-primary-500" />
                  Notes de séance
                </CardTitle>
                <Button variant="outline" size="sm" className="rounded-lg font-bold text-xs" onClick={() => setIsNoteModalOpen(true)}>+ Ajouter une note</Button>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {appointments.filter(app => app.notes_seance).length === 0 ? (
                    <div className="text-center py-8 bg-slate-50 rounded-xl border border-dashed border-slate-200">
                      <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Aucune note pour le moment</p>
                    </div>
                  ) : (
                    appointments.filter(app => app.notes_seance).slice(0, 5).map((app) => {
                      const displayNote = String(app.notes_seance || '').replace(/^\|\|TH_ID:[a-f0-9-]+\|\|/i, '').trim();
                      return (
                        <div key={app.id} className="group relative bg-white p-4 rounded-xl border border-slate-100 hover:border-primary-100 hover:shadow-md hover:shadow-primary-500/5 transition-all">
                          <div className="flex items-center justify-between gap-2 mb-2">
                            <div className="flex items-center gap-2">
                              <span className="w-2 h-2 rounded-full bg-primary-500" />
                              <span className="text-sm font-bold text-slate-900">Séance du {parseClinicDate(app.date_heure).toLocaleDateString('fr-FR')}</span>
                            </div>
                            <div className="flex items-center gap-1.5">
                              <button
                                type="button"
                                onClick={() => openEditAppointmentModal(app)}
                                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-semibold text-primary-600 hover:bg-primary-50 transition-colors cursor-pointer"
                                title="Modifier le motif ou la note de cette séance"
                              >
                                <Edit2 className="h-3 w-3" />
                                Modifier
                              </button>
                              <span className="text-[10px] font-bold text-slate-400 bg-slate-50 px-2 py-1 rounded-md">{parseClinicDate(app.date_heure).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}</span>
                            </div>
                          </div>
                          <p className="text-sm text-slate-600 leading-relaxed italic">"{displayNote || 'Séance enregistrée'}"</p>
                        </div>
                      );
                    })
                  )}
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Right Column - Status & History */}
          <div className="md:col-span-4 space-y-6">
            <Card className="border-0 shadow-sm border-t-4 border-t-indigo-500 bg-indigo-50/30">
               <CardHeader className="pb-2">
                <CardTitle className="text-sm font-bold flex items-center gap-2 text-indigo-800">
                  <Clock className="h-4 w-4 text-indigo-500" />
                  Prochain RDV
                </CardTitle>
              </CardHeader>
              <CardContent>
                {appointments.filter(a => parseClinicDate(a.date_heure) > getMoroccoNow()).length > 0 ? (
                  (() => {
                    const next = appointments.filter(a => parseClinicDate(a.date_heure) > getMoroccoNow()).sort((a,b) => parseClinicDate(a.date_heure).getTime() - parseClinicDate(b.date_heure).getTime())[0];
                    return (
                      <div className="p-4 bg-white rounded-xl border border-indigo-100 shadow-sm">
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <p className="font-black text-indigo-900 text-base">
                              {parseClinicDate(next.date_heure).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })}
                            </p>
                            <p className="text-sm text-indigo-600 mt-1 font-bold">
                              à {parseClinicDate(next.date_heure).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
                            </p>
                          </div>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => openEditAppointmentModal(next)}
                            className="h-8 px-2.5 text-xs font-bold text-indigo-700 border-indigo-200 hover:bg-indigo-50 gap-1"
                          >
                            <Edit2 className="h-3 w-3" />
                            Modifier l'heure
                          </Button>
                        </div>
                        <div className="mt-3 pt-3 border-t border-indigo-50 flex items-center justify-between">
                          <span className="text-[10px] font-bold text-indigo-400 uppercase tracking-widest">
                            Durée : {next.duree || 30} min
                          </span>
                          <span className="text-[10px] font-bold text-indigo-400 uppercase tracking-widest">
                            {(() => {
                              const th = therapists.find((t) => t.id === next.therapist_id);
                              return th ? `Kiné : ${th.prenom || th.nom}` : 'Cabinet Re Forme';
                            })()}
                          </span>
                        </div>
                      </div>
                    );
                  })()
                ) : (
                  <div className="p-4 bg-slate-50/50 rounded-xl border border-dashed border-slate-200 text-center">
                    <p className="text-[10px] font-bold text-slate-400 uppercase">Aucun RDV à venir</p>
                  </div>
                )}
              </CardContent>
            </Card>

            <Card className="border-0 shadow-sm border-t-4 border-t-rose-500">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-bold flex items-center gap-2 text-rose-800">
                  <ShieldAlert className="h-4 w-4 text-rose-500" />
                  Situation Médicale
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="p-3 bg-rose-50/50 rounded-xl border border-rose-100">
                  <h4 className="text-[10px] font-bold text-rose-400 uppercase tracking-widest mb-1.5">Pathologie</h4>
                  <p className="text-xs text-rose-900 font-bold leading-relaxed">
                    {patient.pathologie || 'Non renseigné'}
                  </p>
                </div>
                <div className="p-3 bg-amber-50/50 rounded-xl border border-amber-100">
                  <h4 className="text-[10px] font-bold text-amber-500 uppercase tracking-widest mb-1.5">Antécédents</h4>
                  <p className="text-xs text-amber-900 font-medium leading-relaxed">
                    {parsePatientMutuelle(patient).cleanAtcd || 'Aucun antécédent médical signalé.'}
                  </p>
                </div>
              </CardContent>
            </Card>

            <Card className="border-0 shadow-sm border-t-4 border-t-slate-800 bg-slate-900 text-white overflow-hidden relative">
              <div className="absolute top-0 right-0 p-4 opacity-5">
                <FileText className="h-24 w-24" />
              </div>
              <CardHeader className="pb-2">
                <CardTitle className="text-xs font-bold uppercase tracking-widest text-slate-400">Statistiques Patient</CardTitle>
              </CardHeader>
              <CardContent className="pt-2 space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div className="bg-white/5 p-3 rounded-lg">
                    <p className="text-xl font-black">{appointments.filter(a => a.statut === 'Effectué' || a.statut === 'Impayé').length}</p>
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-tighter">Séances effectuées</p>
                  </div>
                  <div className="bg-white/5 p-3 rounded-lg">
                    <p className="text-xl font-black text-emerald-400">{paidPatientBillings.length}</p>
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-tighter">Séances réglées</p>
                  </div>
                </div>
                <div className="bg-white/5 p-3 rounded-lg flex items-center justify-between text-xs">
                  <span className="text-slate-400 font-semibold uppercase tracking-wider">Total réglé</span>
                  <span className="font-black text-emerald-400">{formatMoney(totalPatientPaid)} DH</span>
                </div>
                {totalPatientUnpaid > 0 && (
                  <div className="bg-rose-500/15 border border-rose-500/30 p-3 rounded-lg flex items-center justify-between text-xs">
                    <span className="text-rose-200 font-semibold uppercase tracking-wider">Reste à payer</span>
                    <span className="font-black text-rose-300">{formatMoney(totalPatientUnpaid)} DH</span>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      )}

      {activeTab === 'traitements' && (
        <div className="space-y-6">
          <div className="flex justify-end">
            <Button onClick={() => setIsNewTreatmentModalOpen(true)} className="gap-2">
              <Plus className="h-4 w-4" />
              Nouveau Traitement
            </Button>
          </div>
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileText className="h-5 w-5 text-primary-500" />
                Historique des Traitements
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-6">
                {treatments.length === 0 ? (
                  <div className="text-center py-12 text-slate-500 bg-slate-50 rounded-lg border border-dashed border-slate-300">
                    <FileText className="h-12 w-12 mx-auto mb-3 opacity-20" />
                    <p>Aucun traitement enregistré pour ce patient.</p>
                  </div>
                ) : (
                  treatments.map((treatment) => (
                    <div key={treatment.id} className="border border-slate-200 rounded-lg p-5 bg-white shadow-sm">
                      <div className="flex justify-between items-start gap-3 mb-4">
                        <div>
                          <h3 className="font-semibold text-slate-900 text-lg">{treatment.motif}</h3>
                          <p className="text-sm text-slate-500 mt-1">
                            {treatment.date_debut ? `Depuis le ${new Date(treatment.date_debut).toLocaleDateString('fr-FR')}` : 'Date non renseignée'}
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => openEditTreatmentModal(treatment)}
                            className="h-7 px-2.5 text-xs gap-1 border-slate-200 text-slate-700"
                          >
                            <Edit2 className="h-3 w-3" />
                            Modifier
                          </Button>
                          <Badge variant="outline" className={
                            treatment.statut === 'Terminé' ? "bg-green-100 text-green-700 border-green-200" : 
                            treatment.statut === 'En cours' ? "bg-blue-100 text-blue-700 border-blue-200" : 
                            "bg-slate-100 text-slate-700 border-slate-200"
                          }>
                            {treatment.statut || 'En cours'}
                          </Badge>
                        </div>
                      </div>
                      
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-4 border-t border-slate-100">
                        <div>
                          <p className="text-xs text-slate-500 font-medium uppercase tracking-wider mb-1">Séances</p>
                          <p className="text-slate-900 font-medium">{treatment.nombre_seances_prescrites} séances prescrites</p>
                        </div>
                        <div>
                          <p className="text-xs text-slate-500 font-medium uppercase tracking-wider mb-1">Bilan Financier</p>
                          <p className="text-slate-900 font-medium">
                            Total réglé : {formatMoney(treatment.total_facture ? treatment.total_facture : (treatments.length === 1 ? totalPatientPaid : 0))} DH
                          </p>
                        </div>
                        <div>
                          <p className="text-xs text-slate-500 font-medium uppercase tracking-wider mb-1">Médecin Prescripteur</p>
                          <p className="text-slate-900 font-medium">{treatment.medecin_prescripteur || 'Non renseigné'}</p>
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {activeTab === 'historique' && (
        <div className="space-y-6">
          <div className="flex justify-end gap-3">
            <Button onClick={exportHistoryToExcel} variant="outline" className="gap-2 border-green-200 text-green-700 hover:bg-green-50 hover:text-green-800">
              <FileSpreadsheet className="h-4 w-4 text-green-600" />
              Exporter historique des soins (Excel)
            </Button>
          </div>
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Calendar className="h-5 w-5 text-primary-500" />
                Historique des Rendez-vous
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-sm text-left">
                  <thead className="text-xs text-slate-500 uppercase bg-slate-50 border-b border-slate-200">
                    <tr>
                      <th className="px-6 py-4 font-medium">Date & Heure</th>
                      <th className="px-6 py-4 font-medium">Motif / Soin</th>
                      <th className="px-6 py-4 font-medium">Durée</th>
                      <th className="px-6 py-4 font-medium">Statut</th>
                      <th className="px-6 py-4 font-medium text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {appointments.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="px-6 py-8 text-center text-slate-500">
                          Aucun rendez-vous trouvé.
                        </td>
                      </tr>
                    ) : (
                      appointments.map((app) => {
                        const cleanMotif = String(app.notes_seance || '')
                          .replace(/^\|\|TH_ID:[a-f0-9-]+\|\|/i, '')
                          .trim();
                        return (
                          <tr key={app.id} className="bg-white hover:bg-slate-50 transition-colors">
                            <td className="px-6 py-4 font-medium text-slate-900">
                              {parseClinicDate(app.date_heure).toLocaleString('fr-FR', {
                                dateStyle: 'long',
                                timeStyle: 'short'
                              })}
                            </td>
                            <td className="px-6 py-4">
                              <button
                                type="button"
                                onClick={() => openEditAppointmentModal(app)}
                                title="Cliquer pour modifier le motif de cette séance"
                                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-50 hover:bg-primary-50 border border-slate-200 hover:border-primary-200 text-xs font-semibold text-slate-800 hover:text-primary-700 transition-colors cursor-pointer text-left"
                              >
                                <span>{cleanMotif || 'Non précisé'}</span>
                                <Edit2 className="h-3 w-3 opacity-60 shrink-0" />
                              </button>
                            </td>
                            <td className="px-6 py-4 text-slate-600">
                              {app.duree || 30} min
                            </td>
                            <td className="px-6 py-4">
                              <Badge
                                variant={
                                  app.statut === 'Effectué'
                                    ? 'success'
                                    : app.statut === 'Annulé'
                                    ? 'outline'
                                    : 'default'
                                }
                              >
                                {app.statut === 'Impayé'
                                  ? 'Réalisé (À régler)'
                                  : app.statut || 'Confirmé'}
                              </Badge>
                            </td>
                            <td className="px-6 py-4 text-right">
                              <div className="flex items-center justify-end gap-1">
                                <Button 
                                  variant="ghost" 
                                  size="sm" 
                                  onClick={() => openEditAppointmentModal(app)}
                                  className="text-primary-600 hover:text-primary-700 hover:bg-primary-50 gap-1 text-xs font-semibold"
                                  title="Modifier le motif, le praticien ou l'horaire de la séance"
                                >
                                  <Edit2 className="h-3.5 w-3.5" />
                                  Modifier la séance
                                </Button>
                                <Button 
                                  variant="ghost" 
                                  size="sm" 
                                  onClick={() => confirmDeleteAppointment(app.id)}
                                  className="text-rose-500 hover:text-rose-700 hover:bg-rose-50"
                                  title="Supprimer la séance"
                                >
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              </div>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {activeTab === 'facturation' && (
        <div className="space-y-6">
          {/* Cartes récapitulatives des sommes de règlement du patient */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <Card className="border-0 shadow-sm bg-emerald-50/50 border-l-4 border-l-emerald-500">
              <CardContent className="p-4 flex items-center justify-between">
                <div>
                  <p className="text-xs font-bold uppercase tracking-wider text-emerald-700">Total Réglé</p>
                  <p className="text-2xl font-black text-emerald-700 mt-1">{formatMoney(totalPatientPaid)} DH</p>
                  <p className="text-xs text-emerald-700/80 mt-0.5">{paidPatientBillings.length} séance(s) payée(s)</p>
                </div>
                <div className="h-10 w-10 rounded-full bg-emerald-100 flex items-center justify-center text-emerald-700">
                  <CheckCircle2 className="h-5 w-5" />
                </div>
              </CardContent>
            </Card>

            <Card className="border-0 shadow-sm bg-rose-50/50 border-l-4 border-l-rose-500">
              <CardContent className="p-4 flex items-center justify-between">
                <div>
                  <p className="text-xs font-bold uppercase tracking-wider text-rose-700">Reste à Payer (Impayés)</p>
                  <p className="text-2xl font-black text-rose-600 mt-1">{formatMoney(totalPatientUnpaid)} DH</p>
                  <p className="text-xs text-rose-700/80 mt-0.5">{unpaidPatientBillings.length} séance(s) en attente</p>
                </div>
                <div className="h-10 w-10 rounded-full bg-rose-100 flex items-center justify-center text-rose-600">
                  <AlertCircle className="h-5 w-5" />
                </div>
              </CardContent>
            </Card>

            <Card className="border-0 shadow-sm bg-slate-50 border-l-4 border-l-slate-700">
              <CardContent className="p-4 flex items-center justify-between">
                <div>
                  <p className="text-xs font-bold uppercase tracking-wider text-slate-600">Total Facturé</p>
                  <p className="text-2xl font-black text-slate-900 mt-1">{formatMoney(totalPatientBilled)} DH</p>
                  <p className="text-xs text-slate-500 mt-0.5">{billings.length} règlement(s) enregistré(s)</p>
                </div>
                <div className="h-10 w-10 rounded-full bg-slate-200/80 flex items-center justify-center text-slate-700">
                  <Wallet className="h-5 w-5" />
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Barre de personnalisation de la Référence & Édition de Facture */}
          <div className="bg-white rounded-xl border border-slate-200 p-4 flex flex-col xl:flex-row xl:items-end justify-between gap-4">
            <div className="flex flex-col sm:flex-row sm:items-end gap-3 flex-1">
              <div className="space-y-1 flex-1 max-w-md">
                <div className="flex items-center justify-between gap-2">
                  <label className="block text-xs font-semibold text-slate-700">
                    Référence de la facture (Réf)
                  </label>
                  {invoiceRefSavedMsg ? (
                    <span className="text-[11px] font-medium text-emerald-600">
                      {invoiceRefSavedMsg}
                    </span>
                  ) : customInvoiceRefs.patients?.[patient.id] ? (
                    <button
                      type="button"
                      onClick={handleResetPatientRefToAuto}
                      className="text-[11px] font-medium text-slate-500 hover:text-slate-800 underline cursor-pointer"
                    >
                      Rétablir format auto
                    </button>
                  ) : null}
                </div>
                <div className="flex items-center gap-1.5">
                  <input
                    type="text"
                    value={invoiceRefInput}
                    onChange={(e) => {
                      setInvoiceRefInput(e.target.value);
                      setInvoiceRefDirty(true);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        handleSaveCustomPatientRef();
                      }
                    }}
                    placeholder="Ex: FAC-2026-0001"
                    className="w-full h-9 px-3 border border-slate-200 rounded-lg text-sm font-mono font-semibold text-slate-900 outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-500/20"
                  />
                  {invoiceRefDirty && (
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={handleSaveCustomPatientRef}
                      className="h-9 px-3 text-xs font-semibold border-emerald-200 text-emerald-700 hover:bg-emerald-50 shrink-0"
                    >
                      Enregistrer
                    </Button>
                  )}
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={handleIncrementInvoiceRef}
                    title="Générer le prochain numéro de facture (+1)"
                    className="h-9 px-2.5 text-xs font-semibold text-slate-700 border-slate-200 hover:bg-slate-50 gap-1 shrink-0"
                  >
                    <RefreshCw className="h-3.5 w-3.5 text-slate-500" />
                    +1
                  </Button>
                </div>
              </div>

              <div className="space-y-1 sm:w-40">
                <label className="block text-xs font-semibold text-slate-700">
                  Date sur la facture
                </label>
                <input
                  type="date"
                  value={invoiceDateInput}
                  onChange={(e) => setInvoiceDateInput(e.target.value)}
                  className="w-full h-9 px-2.5 border border-slate-200 rounded-lg text-xs font-medium text-slate-800 outline-none focus:border-primary-500 tabular-nums"
                />
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2 shrink-0">
              {isAdmin && (
                <Button
                  variant="outline"
                  onClick={() => setIsDocTemplateModalOpen(true)}
                  className="gap-2 text-slate-700 border-slate-300 hover:bg-slate-50 h-9 text-xs sm:text-sm"
                >
                  <LayoutTemplate className="h-4 w-4 text-primary-600" />
                  Mise en page
                </Button>
              )}
              <Button variant="outline" onClick={generateCalendarPDF} className="gap-2 h-9 text-xs sm:text-sm">
                <Download className="h-4 w-4" /> Calendrier de Soins (PDF)
              </Button>
              <Button onClick={generateInvoicePDF} className="gap-2 h-9 text-xs sm:text-sm">
                <FileText className="h-4 w-4" /> Facture PDF
              </Button>
              <Button
                onClick={generateInvoiceExcel}
                className="gap-2 bg-green-600 hover:bg-green-700 text-white h-9 text-xs sm:text-sm"
              >
                <FileSpreadsheet className="h-4 w-4" /> Facture Excel
              </Button>
            </div>
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileText className="h-5 w-5 text-primary-500" />
                Historique de Facturation
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-sm text-left">
                  <thead className="text-xs text-slate-500 uppercase bg-slate-50 border-b border-slate-200">
                    <tr>
                      <th className="px-6 py-4 font-medium">Référence</th>
                      <th className="px-6 py-4 font-medium">Date</th>
                      <th className="px-6 py-4 font-medium">Montant</th>
                      <th className="px-6 py-4 font-medium">Type de paiement</th>
                      <th className="px-6 py-4 font-medium">Statut</th>
                      <th className="px-6 py-4 font-medium text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {billings.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="px-6 py-8 text-center text-slate-500">
                          Aucune facture trouvée.
                        </td>
                      </tr>
                    ) : (
                      billings.map((bill) => {
                        const isUnpaid = isUnpaidBillingStatus(bill.statut);
                        const linkedAppt = Array.isArray(bill.appointments)
                          ? bill.appointments[0]
                          : bill.appointments;
                        const displayDate = linkedAppt?.date_heure
                          ? parseClinicDate(linkedAppt.date_heure).toLocaleDateString('fr-FR')
                          : getBillDate(bill).toLocaleDateString('fr-FR');
                        const rowRef = getBillingDisplayReference(
                          bill,
                          docTemplates,
                          customInvoiceRefs
                        );
                        const isEditingRowRef = inlineRefBillId === bill.id;
                        return (
                          <tr
                            key={bill.id}
                            className={`bg-white hover:bg-slate-50 transition-colors ${
                              isUnpaid ? 'bg-rose-50/20' : ''
                            }`}
                          >
                            <td className="px-6 py-4">
                              {isEditingRowRef ? (
                                <div className="flex items-center gap-1.5 max-w-[210px]">
                                  <input
                                    type="text"
                                    value={inlineRefValue}
                                    onChange={(e) => setInlineRefValue(e.target.value)}
                                    onKeyDown={(e) => {
                                      if (e.key === 'Enter') {
                                        e.preventDefault();
                                        handleSaveInlineBillingRef(bill);
                                      } else if (e.key === 'Escape') {
                                        setInlineRefBillId(null);
                                        setInlineRefValue('');
                                      }
                                    }}
                                    autoFocus
                                    className="w-full px-2 py-1 border border-primary-400 rounded text-xs font-mono font-semibold text-slate-900 outline-none"
                                  />
                                  <button
                                    type="button"
                                    onClick={() => handleSaveInlineBillingRef(bill)}
                                    className="px-2 py-1 rounded bg-slate-900 text-white text-[11px] font-semibold hover:bg-slate-800 cursor-pointer shrink-0"
                                  >
                                    OK
                                  </button>
                                </div>
                              ) : (
                                <div className="inline-flex items-center gap-1.5 group">
                                  <span className="font-mono text-xs font-semibold text-slate-700">
                                    {rowRef}
                                  </span>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setInlineRefBillId(bill.id);
                                      setInlineRefValue(rowRef);
                                    }}
                                    title="Personnaliser la référence de cette ligne"
                                    className="p-1 rounded text-slate-400 hover:text-slate-700 hover:bg-slate-100 opacity-70 group-hover:opacity-100 transition-opacity cursor-pointer"
                                  >
                                    <Edit2 className="h-3 w-3" />
                                  </button>
                                </div>
                              )}
                            </td>
                            <td className="px-6 py-4 font-medium text-slate-900">{displayDate}</td>
                            <td
                              className={`px-6 py-4 font-bold ${
                                isUnpaid ? 'text-rose-600' : 'text-slate-900'
                              }`}
                            >
                              {formatMoney(bill.montant)} DH
                            </td>
                            <td className="px-6 py-4 text-slate-600">{bill.type_paiement}</td>
                            <td className="px-6 py-4">
                              <Badge
                                variant={isUnpaid ? 'outline' : 'success'}
                                className={
                                  isUnpaid ? 'text-rose-600 border-rose-200 bg-rose-50' : ''
                                }
                              >
                                {bill.statut}
                              </Badge>
                            </td>
                            <td className="px-6 py-4 text-right flex items-center justify-end gap-2">
                              {!isUnpaid && (
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => handleDownloadBillingReceipt(bill)}
                                  className="text-slate-600 hover:text-slate-900 hover:bg-slate-100 gap-1 text-xs"
                                  title="Télécharger le reçu PDF avec cette référence"
                                >
                                  <Download className="h-3.5 w-3.5" />
                                  Reçu
                                </Button>
                              )}
                              {isUnpaid && (
                                <Button
                                  onClick={(e) => {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    handleSettleBilling(bill);
                                  }}
                                  disabled={isSettling === bill.id}
                                  size="sm"
                                  className="bg-emerald-500 hover:bg-emerald-600 text-white text-[10px] h-7 px-3 uppercase font-bold"
                                >
                                  {isSettling === bill.id ? '...' : 'Régler'}
                                </Button>
                              )}
                              {isAdmin ? (
                                <>
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => openEditBillingModal(bill)}
                                    className="text-indigo-600 hover:text-indigo-700 hover:bg-indigo-50 gap-1 text-xs font-semibold"
                                    title="Modifier le règlement (Administrateur)"
                                  >
                                    <Edit2 className="h-3.5 w-3.5" />
                                    Modifier
                                  </Button>
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => confirmDeleteBilling(bill.id)}
                                    className="text-rose-500 hover:text-rose-700 hover:bg-rose-50"
                                    title="Supprimer la facturation (Administrateur)"
                                  >
                                    <Trash2 className="h-4 w-4" />
                                  </Button>
                                </>
                              ) : (
                                !isUnpaid && (
                                  <span
                                    className="inline-flex items-center gap-1 text-[11px] font-medium text-slate-400"
                                    title="Modification du montant réservée à l'administrateur"
                                  >
                                    <Lock className="h-3 w-3" />
                                    Verrouillé
                                  </span>
                                )
                              )}
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                  {billings.length > 0 && (
                    <tfoot className="bg-slate-50 border-t-2 border-slate-200">
                      <tr>
                        <td colSpan={2} className="px-6 py-3.5 text-xs font-bold uppercase text-slate-700">
                          Somme des règlements ({paidPatientBillings.length} payé{paidPatientBillings.length > 1 ? 's' : ''}{unpaidPatientBillings.length > 0 ? ` • ${unpaidPatientBillings.length} impayé${unpaidPatientBillings.length > 1 ? 's' : ''}` : ''})
                        </td>
                        <td colSpan={4} className="px-6 py-3.5 text-sm font-black">
                          <span className="text-emerald-700">Réglé : {formatMoney(totalPatientPaid)} DH</span>
                          {totalPatientUnpaid > 0 && (
                            <span className="ml-4 text-rose-600">• Reste à payer : {formatMoney(totalPatientUnpaid)} DH</span>
                          )}
                        </td>
                      </tr>
                    </tfoot>
                  )}
                </table>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {activeTab === 'exercices' && (
        <div className="space-y-6">
          {videoSuccessNotice && (
            <div className="p-3 bg-emerald-50 text-emerald-800 border border-emerald-200 rounded-xl text-sm flex items-center gap-2 animate-fadeIn">
              <CheckCircle2 className="h-5 w-5 text-emerald-600 flex-shrink-0" />
              <span>{videoSuccessNotice}</span>
            </div>
          )}

          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-white p-5 rounded-xl shadow-sm border border-slate-100">
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="text-lg font-bold text-slate-900">Programme d'exercices & Vidéos</h3>
                <span className="px-2.5 py-0.5 text-xs font-semibold rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 flex items-center gap-1">
                  <CheckCircle2 className="h-3 w-3" /> Synchronisé en direct avec l'espace patient
                </span>
              </div>
              <p className="text-sm text-slate-500 mt-1">
                Les vidéos YouTube et exercices ajoutés ici sont instantanément visibles par le patient dans son espace personnel.
              </p>
            </div>
            
            <div className="flex flex-wrap gap-2">
              <Button
                variant="outline"
                onClick={() => {
                  try {
                    localStorage.setItem('reforme_preview_patient_id', patient.id);
                  } catch {}
                  window.location.hash = 'espace-patient';
                }}
                className="gap-2 border-mint-200 bg-mint-50 text-mint-700 hover:bg-mint-100"
              >
                <ExternalLink className="h-4 w-4" /> Voir dans l'accès patient
              </Button>
              <Button onClick={() => setIsNewVideoModalOpen(true)} className="gap-2 bg-red-600 hover:bg-red-700 text-white shadow-xs">
                <Plus className="h-4 w-4" /> Lien YouTube
              </Button>
              <Button onClick={() => videoInputRef.current?.click()} className="gap-2 bg-slate-800 hover:bg-slate-900 text-white">
                <Camera className="h-4 w-4" /> Vidéo (Fichier / Caméra)
              </Button>
              <input type="file" accept="video/*" ref={videoInputRef} onChange={handleVideoUpload} className="hidden" />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {exercises.length === 0 ? (
              <div className="col-span-full p-12 text-center text-slate-500 bg-white rounded-xl border border-dashed border-slate-300 space-y-3">
                <div className="w-12 h-12 rounded-full bg-red-50 text-red-500 flex items-center justify-center mx-auto">
                  <Play className="h-6 w-6" />
                </div>
                <h4 className="font-semibold text-slate-800">Aucun exercice vidéo assigné</h4>
                <p className="text-sm text-slate-500 max-w-md mx-auto">
                  Ajoutez un lien YouTube (ex: étirements, renforcement) pour que le patient puisse l'effectuer chez lui et le visualiser dans son application.
                </p>
                <Button onClick={() => setIsNewVideoModalOpen(true)} className="bg-red-600 hover:bg-red-700 text-white gap-2">
                  <Plus className="h-4 w-4" /> Ajouter un exercice YouTube
                </Button>
              </div>
            ) : (
              exercises.map(ex => (
                <Card key={ex.id} className="overflow-hidden shadow-sm border border-slate-200/80 rounded-xl flex flex-col justify-between">
                  <div>
                    <div className="aspect-video bg-slate-900 relative">
                      {ex.url.startsWith('data:video') ? (
                        <video src={ex.url} controls className="w-full h-full object-cover"></video>
                      ) : (
                        <iframe 
                          src={ex.url} 
                          title={ex.title}
                          className="w-full h-full border-0"
                          referrerPolicy="strict-origin-when-cross-origin"
                          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" 
                          allowFullScreen
                        ></iframe>
                      )}
                    </div>
                    <div className="p-4 space-y-2">
                      <div className="flex items-start justify-between gap-2">
                        <h4 className="font-bold text-slate-900 text-base leading-snug line-clamp-2" title={ex.title}>
                          {ex.title}
                        </h4>
                      </div>

                      {ex.instructions && (
                        <div className="text-xs text-slate-700 bg-amber-50/80 p-2.5 rounded-lg border border-amber-200/70">
                          <span className="font-bold text-amber-900">Consignes :</span> {ex.instructions}
                        </div>
                      )}

                      <div className="flex items-center justify-between text-xs text-slate-400 pt-1">
                        <span>Ajouté le {new Date(ex.date).toLocaleDateString('fr-FR')}</span>
                        {ex.originalUrl && (
                          <a 
                            href={ex.originalUrl} 
                            target="_blank" 
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 text-red-600 hover:text-red-700 font-medium"
                          >
                            <ExternalLink className="h-3 w-3" /> Ouvrir sur YouTube
                          </a>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="p-4 pt-0 border-t border-slate-100 mt-2 flex justify-between items-center">
                    <span className="text-[11px] text-emerald-600 font-medium flex items-center gap-1">
                      <CheckCircle2 className="h-3 w-3" /> Visible côté patient
                    </span>
                    {confirmDeleteExerciseId === ex.id ? (
                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => setConfirmDeleteExerciseId(null)}
                          className="px-2 py-1 text-xs font-medium text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
                        >
                          Annuler
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDeleteExercise(ex.id)}
                          className="px-2.5 py-1 text-xs font-semibold bg-red-600 text-white hover:bg-red-700 rounded-lg transition-colors"
                        >
                          Confirmer
                        </button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setConfirmDeleteExerciseId(ex.id)}
                        className="p-1.5 text-red-500 hover:text-red-700 hover:bg-red-50 rounded-lg transition-colors flex items-center gap-1 text-xs font-medium"
                        title="Supprimer la vidéo"
                      >
                        <Trash2 className="h-3.5 w-3.5" /> Supprimer
                      </button>
                    )}
                  </div>
                </Card>
              ))
            )}
          </div>
        </div>
      )}


      {/* Access Modal */}
      <Modal
        isOpen={isAccessModalOpen}
        onClose={() => setIsAccessModalOpen(false)}
        title={patient.has_access ? "Réinitialiser l'accès patient" : 'Générer un accès en ligne'}
      >
        <form onSubmit={handleGenerateAccess} className="space-y-4">
          <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 text-sm text-slate-700 space-y-1">
            <p>
              {patient.has_access
                ? 'Définissez un nouveau mot de passe pour réinitialiser immédiatement le compte espace patient.'
                : 'Générez un accès pour que le patient puisse se connecter à son espace personnel.'}
            </p>
            <p className="text-xs text-slate-500 pt-1">
              Identifiant de connexion (téléphone) :{' '}
              <strong className="font-mono text-slate-900">
                {normalizePatientPhone(patient.telephone || '') || patient.telephone || 'Non renseigné'}
              </strong>
            </p>
          </div>

          {accessMessage.text && (
            <div className={`p-3.5 rounded-xl text-sm space-y-2.5 ${accessMessage.type === 'success' ? 'bg-emerald-50 text-emerald-800 border border-emerald-200' : 'bg-red-50 text-red-700 border border-red-200'}`}>
              <p className="font-semibold">{accessMessage.text}</p>
              {accessMessage.type === 'success' && lastGeneratedAccess && (
                <div className="p-2.5 rounded-lg bg-white border border-emerald-200 text-xs text-slate-800 space-y-1">
                  <div>
                    Identifiant : <strong className="font-mono text-slate-900">{lastGeneratedAccess.phone}</strong>
                  </div>
                  <div>
                    Mot de passe : <strong className="font-mono text-slate-900">{lastGeneratedAccess.password}</strong>
                  </div>
                </div>
              )}
              {accessMessage.type === 'success' && (
                <Button
                  type="button"
                  size="sm"
                  className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-semibold gap-1.5"
                  onClick={() => {
                    try {
                      localStorage.setItem('reforme_preview_patient_id', patient.id);
                    } catch {}
                    setIsAccessModalOpen(false);
                    window.location.hash = 'espace-patient';
                  }}
                >
                  <ExternalLink className="h-3.5 w-3.5" />
                  Ouvrir l'Espace Patient de {patient.prenom}
                </Button>
              )}
            </div>
          )}

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-sm font-medium text-slate-700">
                {patient.has_access ? 'Nouveau mot de passe' : 'Mot de passe provisoire'}
              </label>
              <button
                type="button"
                onClick={() => {
                  const phoneDigits = normalizePatientPhone(patient.telephone || '').slice(-4) || '2025';
                  setAccessPassword(`Reforme${phoneDigits}`);
                  setShowAccessPassword(true);
                }}
                className="text-xs font-semibold text-primary-600 hover:text-primary-700"
              >
                Suggérer un mot de passe
              </button>
            </div>
            <div className="relative">
              <input
                type={showAccessPassword ? 'text' : 'password'}
                required
                value={accessPassword}
                onChange={(e) => setAccessPassword(e.target.value)}
                className="w-full p-2.5 pr-10 border border-slate-200 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                placeholder="Ex: Reforme1234"
                minLength={6}
              />
              <button
                type="button"
                onClick={() => setShowAccessPassword((v) => !v)}
                className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-400 hover:text-slate-600"
                tabIndex={-1}
              >
                {showAccessPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
            <p className="text-xs text-slate-500">Le mot de passe doit contenir au moins 6 caractères.</p>
          </div>

          <div className="pt-4 flex justify-end gap-3">
            <Button type="button" variant="outline" onClick={() => setIsAccessModalOpen(false)}>
              Fermer
            </Button>
            <Button type="submit" disabled={accessLoading || !patient.telephone}>
              {accessLoading
                ? 'Enregistrement...'
                : patient.has_access
                ? 'Mettre à jour le mot de passe'
                : "Générer l'accès"}
            </Button>
          </div>
        </form>
      </Modal>

      {/* Note Modal */}
      <Modal
        isOpen={isNoteModalOpen}
        onClose={() => setIsNoteModalOpen(false)}
        title="Ajouter une note de séance"
      >
        <form onSubmit={handleAddNote} className="space-y-4">
          {noteMessage.text && (
            <div className={`p-3 rounded-lg text-sm ${noteMessage.type === 'success' ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
              {noteMessage.text}
            </div>
          )}

          <div className="space-y-2">
            <label className="text-sm font-medium text-slate-700">Sélectionner la séance</label>
            <select
              required
              value={selectedAppointmentId}
              onChange={(e) => {
                setSelectedAppointmentId(e.target.value);
                const app = appointments.find(a => a.id === e.target.value);
                setNoteContent(String(app?.notes_seance || '').replace(/^\|\|TH_ID:[a-f0-9-]+\|\|/i, ''));
              }}
              className="w-full p-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
            >
              <option value="">-- Choisir une séance --</option>
              {appointments.map(app => (
                <option key={app.id} value={app.id}>
                  {parseClinicDate(app.date_heure).toLocaleDateString('fr-FR')} à {parseClinicDate(app.date_heure).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium text-slate-700">Note clinique</label>
            <textarea
              required
              value={noteContent}
              onChange={(e) => setNoteContent(e.target.value)}
              className="w-full p-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 min-h-[100px]"
              placeholder="Saisissez vos observations, évolution, etc."
            />
          </div>

          <div className="pt-4 flex justify-end gap-3">
            <Button type="button" variant="outline" onClick={() => setIsNoteModalOpen(false)}>
              Annuler
            </Button>
            <Button type="submit" disabled={noteLoading}>
              {noteLoading ? 'Enregistrement...' : 'Enregistrer la note'}
            </Button>
          </div>
        </form>
      </Modal>

      {/* Edit Patient Modal */}
      <Modal
        isOpen={isEditPatientModalOpen}
        onClose={() => setIsEditPatientModalOpen(false)}
        title="Modifier le patient"
        maxWidth="lg"
      >
        <form onSubmit={handleEditPatient} className="space-y-4">
          {editPatientMessage.text && (
            <div className={`p-3 rounded-lg text-sm ${editPatientMessage.type === 'success' ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
              {editPatientMessage.text}
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-slate-700">Nom</label>
              <input
                type="text"
                required
                value={editPatientData.nom || ''}
                onChange={(e) => setEditPatientData({ ...editPatientData, nom: e.target.value })}
                className="w-full p-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-slate-700">Prénom</label>
              <input
                type="text"
                required
                value={editPatientData.prenom || ''}
                onChange={(e) => setEditPatientData({ ...editPatientData, prenom: e.target.value })}
                className="w-full p-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-slate-700">Téléphone</label>
              <input
                type="tel"
                required
                value={editPatientData.telephone || ''}
                onChange={(e) => setEditPatientData({ ...editPatientData, telephone: e.target.value })}
                className="w-full p-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-slate-700">Email</label>
              <input
                type="email"
                value={editPatientData.email || ''}
                onChange={(e) => setEditPatientData({ ...editPatientData, email: e.target.value })}
                className="w-full p-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-slate-700">Date de naissance</label>
              <input
                type="date"
                value={editPatientData.date_naissance || ''}
                onChange={(e) => setEditPatientData({ ...editPatientData, date_naissance: e.target.value })}
                className="w-full p-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-slate-700">Pathologie</label>
              <input
                type="text"
                value={editPatientData.pathologie || ''}
                onChange={(e) => setEditPatientData({ ...editPatientData, pathologie: e.target.value })}
                className="w-full p-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-slate-700">Nombre de séances prescrites</label>
              {canEditSessionCount ? (
                <input
                  type="number"
                  min="0"
                  placeholder="Ex: 15"
                  value={editPatientData.nombre_seances ?? ''}
                  onChange={(e) => setEditPatientData({ ...editPatientData, nombre_seances: e.target.value })}
                  className="w-full p-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                />
              ) : (
                <input
                  type="text"
                  disabled
                  value={
                    editPatientData.nombre_seances !== undefined && editPatientData.nombre_seances !== null && editPatientData.nombre_seances !== ''
                      ? `${editPatientData.nombre_seances} séance(s) (Admin / Secrétariat)`
                      : 'Réservé à Admin / Secrétariat'
                  }
                  className="w-full p-2 border border-slate-200 rounded-lg bg-slate-100 text-slate-500 cursor-not-allowed text-sm"
                />
              )}
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-slate-700">CIN</label>
              <input
                type="text"
                value={editPatientData.cin || ''}
                onChange={(e) => setEditPatientData({ ...editPatientData, cin: e.target.value })}
                className="w-full p-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-slate-700">Adresse</label>
            <input
              type="text"
              value={editPatientData.adresse || ''}
              onChange={(e) => setEditPatientData({ ...editPatientData, adresse: e.target.value })}
              className="w-full p-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
            />
          </div>
          <div className="p-3.5 rounded-xl bg-indigo-50/60 border border-indigo-200/80 space-y-2.5">
            <label className="text-sm font-semibold text-indigo-950 flex items-center gap-1.5">
              <Trophy className="h-4 w-4 text-indigo-600" />
              Club sportif conventionné
            </label>
            <select
              value={editPatientData.club || ''}
              onChange={(e) => setEditPatientData({ ...editPatientData, club: e.target.value })}
              className="w-full p-2 border border-indigo-200 rounded-lg text-sm bg-white focus:ring-2 focus:ring-indigo-500"
            >
              <option value="">Aucun club (Patient particulier)</option>
              {partnerClubs.map((c) => (
                <option key={c.name} value={c.name}>
                  {c.name} ({c.sport}{c.tarifConvention ? ` • ${c.tarifConvention} DH/séance` : ''})
                </option>
              ))}
              {editPatientData.club &&
                editPatientData.club !== '__NEW__' &&
                !partnerClubs.some((c) => c.name.toLowerCase() === String(editPatientData.club).toLowerCase()) && (
                  <option value={editPatientData.club}>{editPatientData.club}</option>
                )}
              <option value="__NEW__">+ Créer un nouveau club conventionné...</option>
            </select>
            {editPatientData.club === '__NEW__' && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
                <input
                  type="text"
                  placeholder="Nom du club (ex: Hassania Agadir)"
                  value={newInlineClubName}
                  onChange={(e) => setNewInlineClubName(e.target.value)}
                  className="p-2 border border-indigo-200 rounded-lg text-sm bg-white focus:ring-2 focus:ring-indigo-500"
                />
                <select
                  value={newInlineClubSport}
                  onChange={(e) => setNewInlineClubSport(e.target.value)}
                  className="p-2 border border-indigo-200 rounded-lg text-sm bg-white focus:ring-2 focus:ring-indigo-500"
                >
                  {SPORTS_DISCIPLINES.map((sp) => (
                    <option key={sp} value={sp}>
                      {sp}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>
          <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 space-y-2.5">
            <label className="text-sm font-semibold text-slate-700 block">Couverture médicale (Mutuelle)</label>
            <div className="flex flex-col sm:flex-row sm:items-center gap-3">
              <div className="inline-flex rounded-lg border border-slate-200 bg-white p-1">
                <button
                  type="button"
                  onClick={() => setEditPatientData({ ...editPatientData, isMutualiste: false })}
                  className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-all ${
                    !editPatientData.isMutualiste
                      ? 'bg-slate-800 text-white'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Non mutualiste
                </button>
                <button
                  type="button"
                  onClick={() => setEditPatientData({ ...editPatientData, isMutualiste: true })}
                  className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-all ${
                    editPatientData.isMutualiste
                      ? 'bg-emerald-600 text-white'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Mutualiste
                </button>
              </div>
              {editPatientData.isMutualiste && (
                <select
                  value={editPatientData.organismeMutuelle || 'CNOPS'}
                  onChange={(e) => setEditPatientData({ ...editPatientData, organismeMutuelle: e.target.value })}
                  className="flex-1 p-2 border border-slate-200 rounded-lg text-sm bg-white focus:ring-2 focus:ring-primary-500"
                >
                  {ORGANISMES_MUTUELLE.map((org) => (
                    <option key={org} value={org}>
                      {org}
                    </option>
                  ))}
                </select>
              )}
            </div>
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-slate-700">Antécédents & Notes</label>
            <textarea
              value={editPatientData.cleanAtcd ?? ''}
              onChange={(e) => setEditPatientData({ ...editPatientData, cleanAtcd: e.target.value })}
              className="w-full p-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 min-h-[80px]"
            />
          </div>

          <div className="pt-4 flex justify-end gap-3">
            <Button type="button" variant="outline" onClick={() => setIsEditPatientModalOpen(false)}>
              Annuler
            </Button>
            <Button type="submit" disabled={editPatientLoading}>
              {editPatientLoading ? 'Enregistrement...' : 'Enregistrer'}
            </Button>
          </div>
        </form>
      </Modal>

      {/* New Appointment Modal */}
      <Modal
        isOpen={isNewAppointmentModalOpen}
        onClose={() => setIsNewAppointmentModalOpen(false)}
        title="Nouveau Rendez-vous"
        maxWidth="sm"
      >
        <form onSubmit={handleNewAppointment} className="space-y-4">
          {newAppointmentMessage.text && (
            <div className={`p-3 rounded-lg text-sm ${newAppointmentMessage.type === 'success' ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
              {newAppointmentMessage.text}
            </div>
          )}

          <div className="space-y-2">
            <label className="text-sm font-medium text-slate-700">Date</label>
            <input
              type="date"
              required
              value={newAppointmentDate}
              onChange={(e) => setNewAppointmentDate(e.target.value)}
              className="w-full p-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium text-slate-700">Heure</label>
            <input
              type="time"
              required
              value={newAppointmentTime}
              onChange={(e) => setNewAppointmentTime(e.target.value)}
              className="w-full p-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium text-slate-700">Praticien (optionnel)</label>
            <select
              value={newAppointmentTherapist}
              onChange={(e) => setNewAppointmentTherapist(e.target.value)}
              className="w-full p-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 bg-white text-sm"
            >
              <option value="">Sélectionner un praticien (optionnel)</option>
              {therapists.map(t => (
                <option key={t.id} value={t.id}>{t.prenom} {t.nom}</option>
              ))}
            </select>
          </div>

          <div className="space-y-2 relative">
            <label className="text-sm font-medium text-slate-700">Motif de la séance</label>
            <div className="relative">
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
                className="w-full p-2 pr-8 border border-slate-200 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
              />
              {newAppointmentMotif && (
                <button
                  type="button"
                  onMouseDown={(e) => {
                    e.preventDefault();
                    setNewAppointmentMotif('');
                    setShowNewMotifDropdown(true);
                  }}
                  className="absolute inset-y-0 right-0 pr-2.5 flex items-center text-slate-400 hover:text-slate-600 cursor-pointer"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>
            {showNewMotifDropdown && (() => {
              const trimmed = newAppointmentMotif.trim().toLowerCase();
              const isExactMatch = motifs.some(m => m.toLowerCase() === trimmed);
              const displayedMotifs =
                !trimmed || isExactMatch
                  ? motifs
                  : motifs.filter(m => m.toLowerCase().includes(trimmed));
              return displayedMotifs.length > 0 ? (
                <div className="absolute z-50 w-full mt-1 bg-white border border-slate-200 rounded-xl shadow-lg max-h-48 overflow-y-auto">
                  {displayedMotifs.map(m => (
                    <div 
                      key={m} 
                      onMouseDown={(e) => {
                        e.preventDefault();
                        setNewAppointmentMotif(m);
                        setShowNewMotifDropdown(false);
                      }}
                      className={`p-3 hover:bg-slate-50 cursor-pointer text-sm font-medium border-b border-slate-50 last:border-0 ${
                        m.toLowerCase() === trimmed ? 'bg-primary-50/60 text-primary-700 font-bold' : 'text-slate-700'
                      }`}
                    >
                      {m}
                    </div>
                  ))}
                </div>
              ) : null;
            })()}
          </div>

          <div className="pt-4 flex justify-end gap-3 border-t border-slate-100">
            <Button type="button" variant="outline" onClick={() => setIsNewAppointmentModalOpen(false)}>
              Annuler
            </Button>
            <Button type="submit" disabled={newAppointmentLoading}>
              {newAppointmentLoading ? 'Enregistrement...' : 'Confirmer le RDV'}
            </Button>
          </div>
        </form>
      </Modal>

      {/* New Treatment Modal */}
      <Modal
        isOpen={isNewTreatmentModalOpen}
        onClose={() => setIsNewTreatmentModalOpen(false)}
        title="Nouveau Traitement"
      >
        <form onSubmit={handleNewTreatment} className="space-y-4">
          {newTreatmentMessage.text && (
            <div className={`p-3 rounded-md text-sm flex items-center gap-2 ${
              newTreatmentMessage.type === 'success' ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-red-50 text-red-700 border border-red-200'
            }`}>
              {newTreatmentMessage.type === 'success' ? <CheckCircle2 className="h-4 w-4" /> : <AlertCircle className="h-4 w-4" />}
              {newTreatmentMessage.text}
            </div>
          )}

          <div className="space-y-2">
            <label className="text-sm font-medium text-slate-700">Motif du traitement / Pathologie</label>
            <input
              type="text"
              required
              placeholder="Ex: Entorse cheville droite"
              value={newTreatmentData.motif}
              onChange={(e) => setNewTreatmentData({ ...newTreatmentData, motif: e.target.value })}
              className="w-full p-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-700">Séances prescrites</label>
              {canEditSessionCount ? (
                <input
                  type="number"
                  min="1"
                  required
                  value={newTreatmentData.nombre_seances_prescrites}
                  onChange={(e) => setNewTreatmentData({ ...newTreatmentData, nombre_seances_prescrites: parseInt(e.target.value) })}
                  className="w-full p-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                />
              ) : (
                <input
                  type="text"
                  disabled
                  value={`${patient?.nombre_seances || 10} séances (Admin / Secrétariat)`}
                  className="w-full p-2 border border-slate-200 rounded-lg bg-slate-100 text-slate-500 cursor-not-allowed text-sm"
                />
              )}
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-700">Date de début</label>
              <input
                type="date"
                required
                value={newTreatmentData.date_debut}
                onChange={(e) => setNewTreatmentData({ ...newTreatmentData, date_debut: e.target.value })}
                className="w-full p-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
              />
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium text-slate-700">Médecin Prescripteur</label>
            <input
              type="text"
              placeholder="Ex: Mr HADDAOUI Younes"
              value={newTreatmentData.medecin_prescripteur}
              onChange={(e) => setNewTreatmentData({ ...newTreatmentData, medecin_prescripteur: e.target.value })}
              className="w-full p-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
            />
          </div>

          <div className="pt-4 flex justify-end gap-3 border-t border-slate-100">
            <Button type="button" variant="outline" onClick={() => setIsNewTreatmentModalOpen(false)}>
              Annuler
            </Button>
            <Button type="submit" disabled={newTreatmentLoading}>
              {newTreatmentLoading ? 'Enregistrement...' : 'Enregistrer le traitement'}
            </Button>
          </div>
        </form>
      </Modal>

      {/* Edit Treatment Modal */}
      <Modal
        isOpen={isEditTreatmentModalOpen && Boolean(treatmentToEdit)}
        onClose={() => {
          if (!editTreatmentLoading) {
            setIsEditTreatmentModalOpen(false);
            setTreatmentToEdit(null);
          }
        }}
        title={canEditSessionCount ? 'Modifier le traitement & le nombre de séances' : 'Modifier le traitement'}
      >
        {treatmentToEdit && (
          <form onSubmit={handleUpdateTreatment} className="space-y-4">
            {editTreatmentMessage.text && (
              <div className={`p-3 rounded-md text-sm flex items-center gap-2 ${
                editTreatmentMessage.type === 'success'
                  ? 'bg-green-50 text-green-700 border border-green-200'
                  : 'bg-red-50 text-red-700 border border-red-200'
              }`}>
                {editTreatmentMessage.type === 'success' ? <CheckCircle2 className="h-4 w-4" /> : <AlertCircle className="h-4 w-4" />}
                {editTreatmentMessage.text}
              </div>
            )}

            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-700">Motif du traitement / Pathologie</label>
              <input
                type="text"
                required
                value={treatmentToEdit.motif}
                onChange={(e) => setTreatmentToEdit({ ...treatmentToEdit, motif: e.target.value })}
                className="w-full p-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="space-y-2">
                <label className="text-sm font-medium text-slate-700">Séances prescrites</label>
                {canEditSessionCount ? (
                  <input
                    type="number"
                    min="1"
                    required
                    value={treatmentToEdit.nombre_seances_prescrites}
                    onChange={(e) =>
                      setTreatmentToEdit({
                        ...treatmentToEdit,
                        nombre_seances_prescrites: parseInt(e.target.value, 10) || 1,
                      })
                    }
                    className="w-full p-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 font-bold"
                  />
                ) : (
                  <input
                    type="text"
                    disabled
                    value={`${treatmentToEdit.nombre_seances_prescrites} (Admin / Secrétaire)`}
                    className="w-full p-2 border border-slate-200 rounded-lg bg-slate-100 text-slate-500 cursor-not-allowed text-xs font-semibold"
                  />
                )}
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-slate-700">Date de début</label>
                <input
                  type="date"
                  value={treatmentToEdit.date_debut}
                  onChange={(e) => setTreatmentToEdit({ ...treatmentToEdit, date_debut: e.target.value })}
                  className="w-full p-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-slate-700">Statut</label>
                <select
                  value={treatmentToEdit.statut}
                  onChange={(e) => setTreatmentToEdit({ ...treatmentToEdit, statut: e.target.value })}
                  className="w-full p-2 border border-slate-200 rounded-lg bg-white focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                >
                  <option value="En cours">En cours</option>
                  <option value="Terminé">Terminé</option>
                </select>
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-700">Médecin Prescripteur</label>
              <input
                type="text"
                value={treatmentToEdit.medecin_prescripteur}
                onChange={(e) => setTreatmentToEdit({ ...treatmentToEdit, medecin_prescripteur: e.target.value })}
                className="w-full p-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
              />
            </div>

            <div className="pt-4 flex justify-end gap-3 border-t border-slate-100">
              <Button
                type="button"
                variant="outline"
                disabled={editTreatmentLoading}
                onClick={() => setIsEditTreatmentModalOpen(false)}
              >
                Annuler
              </Button>
              <Button type="submit" disabled={editTreatmentLoading}>
                {editTreatmentLoading ? 'Enregistrement...' : 'Enregistrer'}
              </Button>
            </div>
          </form>
        )}
      </Modal>

      {/* Delete Appointment Modal */}
      <Modal
        isOpen={isDeleteModalOpen}
        onClose={() => setIsDeleteModalOpen(false)}
        title="Supprimer la séance"
      >
        <div className="space-y-4">
          <p className="text-slate-600 text-sm">
            Êtes-vous sûr de vouloir supprimer cette séance ? Cette action est irréversible et la séance disparaîtra de l'historique et de l'agenda.
            <br/><br/><i>Note : si un règlement était associé à cette séance, il sera également supprimé automatiquement de la facturation.</i>
          </p>
          <div className="flex justify-end gap-3 pt-4 border-t border-slate-100">
            <Button variant="outline" onClick={() => setIsDeleteModalOpen(false)}>
              Annuler
            </Button>
            <Button 
              className="bg-rose-600 hover:bg-rose-700 text-white" 
              onClick={executeDeleteAppointment}
              disabled={deleteLoading}
            >
              {deleteLoading ? 'Suppression...' : 'Supprimer'}
            </Button>
          </div>
        </div>
      </Modal>

      {/* Edit Billing Modal (Admin Only) */}
      <Modal
        isOpen={isEditBillingModalOpen && isAdmin}
        onClose={() => {
          if (!editBillingLoading) setIsEditBillingModalOpen(false);
        }}
        title="Modifier le règlement (Administrateur)"
        maxWidth="sm"
      >
        <form onSubmit={handleUpdateBilling} className="space-y-4">
          {editBillingError && (
            <div className="p-3 rounded-lg bg-rose-50 text-rose-700 border border-rose-200 text-sm">
              {editBillingError}
            </div>
          )}

          <div className="space-y-1.5">
            <label className="text-sm font-medium text-slate-700">
              Référence de la facture / du reçu
            </label>
            <input
              type="text"
              value={editBillingForm.reference}
              onChange={(e) =>
                setEditBillingForm({ ...editBillingForm, reference: e.target.value })
              }
              placeholder="Ex: FAC-2026-0001"
              className="w-full p-2.5 border border-slate-200 rounded-lg font-mono text-sm font-semibold text-slate-900 focus:ring-2 focus:ring-indigo-500 outline-none"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-medium text-slate-700">Montant (DH)</label>
            <input
              type="number"
              min="0"
              step="any"
              onWheel={(e) => e.currentTarget.blur()}
              required
              value={editBillingForm.montant}
              onChange={(e) => setEditBillingForm({ ...editBillingForm, montant: e.target.value })}
              className="w-full p-2.5 border border-slate-200 rounded-lg font-semibold text-slate-900 focus:ring-2 focus:ring-indigo-500 outline-none"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-medium text-slate-700">Mode / Type de paiement</label>
            <select
              value={editBillingForm.type_paiement}
              onChange={(e) => setEditBillingForm({ ...editBillingForm, type_paiement: e.target.value })}
              className="w-full p-2.5 border border-slate-200 rounded-lg bg-white text-slate-900 focus:ring-2 focus:ring-indigo-500 outline-none"
            >
              <option value="Patient">Direct (Patient)</option>
              <option value="Mutuelle">Mutuelle</option>
              <option value="Tiers-payant">Tiers-payant</option>
              <option value="Hors nomenclature">Hors nomenclature</option>
              <option value="Espèces">Espèces</option>
              <option value="Carte bancaire">Carte bancaire</option>
              <option value="Virement">Virement</option>
              <option value="Chèque">Chèque</option>
              {!['Patient', 'Mutuelle', 'Tiers-payant', 'Hors nomenclature', 'Espèces', 'Carte bancaire', 'Virement', 'Chèque'].includes(editBillingForm.type_paiement) &&
                editBillingForm.type_paiement && (
                  <option value={editBillingForm.type_paiement}>{editBillingForm.type_paiement}</option>
                )}
            </select>
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-medium text-slate-700">Statut du règlement</label>
            <select
              value={editBillingForm.statut}
              onChange={(e) => setEditBillingForm({ ...editBillingForm, statut: e.target.value })}
              className="w-full p-2.5 border border-slate-200 rounded-lg bg-white text-slate-900 focus:ring-2 focus:ring-indigo-500 outline-none"
            >
              <option value="Payé">Payé (Séance réglée)</option>
              <option value="En attente">En attente / Impayé</option>
            </select>
          </div>

          <div className="flex justify-end gap-3 pt-4 border-t border-slate-100">
            <Button
              type="button"
              variant="outline"
              disabled={editBillingLoading}
              onClick={() => setIsEditBillingModalOpen(false)}
            >
              Annuler
            </Button>
            <Button
              type="submit"
              disabled={editBillingLoading}
              className="bg-indigo-600 hover:bg-indigo-700 text-white"
            >
              {editBillingLoading ? 'Enregistrement...' : 'Enregistrer'}
            </Button>
          </div>
        </form>
      </Modal>

      {/* Delete Billing Modal */}
      <Modal
        isOpen={isDeleteBillingModalOpen && isAdmin}
        onClose={() => setIsDeleteBillingModalOpen(false)}
        title="Supprimer la facture / le règlement"
      >
        <div className="space-y-4">
          <p className="text-slate-600 text-sm">
            Êtes-vous sûr de vouloir supprimer ce règlement ? Cette action supprimera définitivement le paiement de l'historique de ce patient et impactera vos statistiques de recettes.
          </p>
          <div className="flex justify-end gap-3 pt-4 border-t border-slate-100">
            <Button variant="outline" onClick={() => setIsDeleteBillingModalOpen(false)}>
              Annuler
            </Button>
            <Button 
              className="bg-rose-600 hover:bg-rose-700 text-white" 
              onClick={executeDeleteBilling}
              disabled={deleteBillingLoading}
            >
              {deleteBillingLoading ? 'Suppression...' : 'Supprimer'}
            </Button>
          </div>
        </div>
      </Modal>

      {/* Delete Patient Modal */}
      <Modal
        isOpen={isDeletePatientModalOpen}
        onClose={() => {
          if (!deletePatientLoading) {
            setIsDeletePatientModalOpen(false);
          }
        }}
        title="Supprimer entièrement le patient"
      >
        <div className="space-y-4">
          <p className="text-slate-600 text-sm">
            Êtes-vous sûr de vouloir supprimer définitivement le patient{" "}
            <strong className="text-slate-900 font-semibold">
              {patient?.prenom} {patient?.nom}
            </strong>{" "}
            de la base de données ?
          </p>
          <div className="p-3 bg-rose-50 text-rose-800 rounded-lg text-sm flex gap-2 border border-rose-100">
            <ShieldAlert className="h-5 w-5 text-rose-500 flex-shrink-0" />
            <span>
              <strong>Attention :</strong> Cette action supprimera définitivement toutes les séances associées, l'historique des traitements, et les factures/règlements de ce patient. Cette opération est irréversible.
            </span>
          </div>
          <div className="flex justify-end gap-3 pt-4 border-t border-slate-100">
            <Button
              variant="outline"
              onClick={() => setIsDeletePatientModalOpen(false)}
              disabled={deletePatientLoading}
            >
              Annuler
            </Button>
            <Button 
              className="bg-rose-600 hover:bg-rose-700 text-white font-medium" 
              onClick={executeDeletePatient}
              disabled={deletePatientLoading}
            >
              {deletePatientLoading ? 'Suppression totale...' : 'Supprimer définitivement'}
            </Button>
          </div>
        </div>
      </Modal>

    
      {/* Modal Nouvelle Vidéo */}
      {/* Modal Ajout Vidéo Exercice */}
      <Modal
        isOpen={isNewVideoModalOpen}
        onClose={() => setIsNewVideoModalOpen(false)}
        title="Ajouter une vidéo d'exercice (YouTube)"
      >
        <form onSubmit={handleAddVideo} className="space-y-4">
          <div className="space-y-2">
            <label className="text-sm font-medium text-slate-700">Titre de l'exercice *</label>
            <input
              type="text"
              required
              value={newVideoTitle}
              onChange={e => setNewVideoTitle(e.target.value)}
              className="w-full p-2.5 border border-slate-200 rounded-lg focus:ring-2 focus:ring-primary-500"
              placeholder="Ex: Étirements des ischio-jambiers"
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium text-slate-700">Lien de la vidéo (YouTube) *</label>
            <input
              type="url"
              required
              value={newVideoUrl}
              onChange={e => setNewVideoUrl(e.target.value)}
              className="w-full p-2.5 border border-slate-200 rounded-lg focus:ring-2 focus:ring-primary-500 font-mono text-sm"
              placeholder="https://www.youtube.com/watch?v=... ou https://youtu.be/..."
            />
            <p className="text-xs text-slate-500">
              Compatible avec tous les liens YouTube standards, raccourcis (youtu.be) et Shorts.
            </p>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium text-slate-700">Consignes & Répétitions pour le patient (optionnel)</label>
            <textarea
              value={newVideoInstructions}
              onChange={e => setNewVideoInstructions(e.target.value)}
              className="w-full p-2.5 border border-slate-200 rounded-lg focus:ring-2 focus:ring-primary-500 text-sm h-20 resize-none"
              placeholder="Ex: 3 séries de 10 répétitions chaque matin. Arrêter immédiatement en cas de douleur."
            />
          </div>

          {newVideoUrl && parseYouTubeUrl(newVideoUrl).embedUrl && (
            <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 space-y-2">
              <span className="text-xs font-semibold text-slate-700 flex items-center gap-1.5">
                <Play className="h-3.5 w-3.5 text-red-600" /> Aperçu de la vidéo intégrée :
              </span>
              <div className="aspect-video w-full rounded-lg overflow-hidden bg-black shadow-inner">
                <iframe
                  src={parseYouTubeUrl(newVideoUrl).embedUrl}
                  title="Aperçu YouTube"
                  className="w-full h-full border-0"
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                />
              </div>
            </div>
          )}

          <div className="p-3 bg-emerald-50 text-emerald-800 rounded-xl text-xs flex items-center gap-2 border border-emerald-200">
            <CheckCircle2 className="h-4 w-4 text-emerald-600 flex-shrink-0" />
            <span>Cet exercice sera immédiatement accessible sur l'application et l'espace patient.</span>
          </div>

          <div className="pt-3 flex justify-end gap-3">
            <Button type="button" variant="outline" onClick={() => setIsNewVideoModalOpen(false)}>
              Annuler
            </Button>
            <Button type="submit" disabled={savingVideo} className="bg-red-600 hover:bg-red-700 text-white">
              {savingVideo ? 'Synchronisation...' : 'Ajouter et synchroniser'}
            </Button>
          </div>
        </form>
      </Modal>

      {/* Modal Évaluation de la Douleur */}
      <Modal
        isOpen={isAddPainModalOpen}
        onClose={() => setIsAddPainModalOpen(false)}
        title="Évaluer le niveau de douleur (Échelle EVA 1 à 10)"
      >
        <form onSubmit={handleSavePractitionerPain} className="space-y-4">
          <div className="space-y-2">
            <label className="text-sm font-medium text-slate-700">Date de l'évaluation</label>
            <input
              type="date"
              required
              value={practitionerPainDate}
              onChange={e => setPractitionerPainDate(e.target.value)}
              className="w-full p-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-primary-500"
            />
          </div>

          <div className="space-y-2">
            <div className="flex justify-between items-center">
              <label className="text-sm font-medium text-slate-700">Niveau de douleur (EVA)</label>
              <span className="text-sm font-bold text-primary-600">{practitionerPainScore} / 10</span>
            </div>
            <div className="grid grid-cols-10 gap-1">
              {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((num) => {
                const isSelected = practitionerPainScore === num;
                const badge = getPainBadge(num);
                return (
                  <button
                    key={num}
                    type="button"
                    onClick={() => setPractitionerPainScore(num)}
                    className={`h-9 rounded-lg font-bold text-xs transition-all border ${
                      isSelected
                        ? badge.btnColor + ' scale-105 border-transparent shadow-sm'
                        : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                    }`}
                  >
                    {num}
                  </button>
                );
              })}
            </div>
            <p className="text-xs text-slate-500 mt-1">
              Statut : <span className="font-semibold">{getPainBadge(practitionerPainScore).label}</span>
            </p>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium text-slate-700">Remarque / Localisation clinique</label>
            <input
              type="text"
              value={practitionerPainNote}
              onChange={e => setPractitionerPainNote(e.target.value)}
              placeholder="Ex: Douleur vive à la flexion du genou..."
              className="w-full p-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-primary-500"
            />
          </div>

          <div className="pt-4 flex justify-end gap-3">
            <Button type="button" variant="outline" onClick={() => setIsAddPainModalOpen(false)}>
              Annuler
            </Button>
            <Button type="submit" disabled={practitionerPainLoading}>
              {practitionerPainLoading ? 'Enregistrement...' : 'Enregistrer'}
            </Button>
          </div>
        </form>
      </Modal>

      {/* Modal Modification Séance (Motif, Praticien, Date & Heure — y compris séances déjà réalisées) */}
      <Modal
        isOpen={isEditAppointmentModalOpen}
        onClose={() => setIsEditAppointmentModalOpen(false)}
        title="Modifier la séance (motif, praticien, date & heure)"
      >
        <form onSubmit={handleSaveAppointmentTime} className="space-y-4">
          {appointmentToEdit &&
            (appointmentToEdit.statut === 'Effectué' || appointmentToEdit.statut === 'Impayé') && (
              <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-xs font-medium text-emerald-800 flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
                <span>
                  Séance déjà réalisée ({appointmentToEdit.statut === 'Effectué' ? 'réglée' : 'à régler'}). Vous pouvez librement modifier son motif ou son horaire sans impacter la facturation.
                </span>
              </div>
            )}

          <div className="space-y-1.5 relative">
            <label className="text-sm font-medium text-slate-700">
              Motif / Acte thérapeutique de la séance
            </label>
            <div className="relative">
              <input
                type="text"
                required
                value={editAppMotif}
                onChange={(e) => {
                  setEditAppMotif(e.target.value);
                  setShowEditAppMotifDropdown(true);
                }}
                onFocus={() => setShowEditAppMotifDropdown(true)}
                onBlur={() => setTimeout(() => setShowEditAppMotifDropdown(false), 200)}
                placeholder="Ex: Réathlétisation, Tecar thérapie..."
                className="w-full p-2.5 pr-9 border border-slate-200 rounded-lg text-sm font-bold text-slate-900 focus:ring-2 focus:ring-primary-500 outline-none"
              />
              {editAppMotif && (
                <button
                  type="button"
                  onMouseDown={(e) => {
                    e.preventDefault();
                    setEditAppMotif('');
                    setShowEditAppMotifDropdown(true);
                  }}
                  title="Effacer pour afficher tous les motifs"
                  className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-400 hover:text-slate-600 cursor-pointer"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>
            {showEditAppMotifDropdown && (() => {
              const trimmed = editAppMotif.trim().toLowerCase();
              const isExactMatch = motifs.some(m => m.toLowerCase() === trimmed);
              const displayedMotifs =
                !trimmed || isExactMatch
                  ? motifs
                  : motifs.filter(m => m.toLowerCase().includes(trimmed));
              return displayedMotifs.length > 0 ? (
                <div className="absolute z-50 w-full mt-1 bg-white border border-slate-200 rounded-xl shadow-lg max-h-48 overflow-y-auto">
                  {displayedMotifs.map(m => (
                    <div
                      key={m}
                      onMouseDown={(e) => {
                        e.preventDefault();
                        setEditAppMotif(m);
                        setShowEditAppMotifDropdown(false);
                      }}
                      className={`p-3 hover:bg-slate-50 cursor-pointer text-sm font-medium border-b border-slate-50 last:border-0 ${
                        m.toLowerCase() === trimmed
                          ? 'bg-primary-50/60 text-primary-700 font-bold'
                          : 'text-slate-700'
                      }`}
                    >
                      {m}
                    </div>
                  ))}
                </div>
              ) : null;
            })()}

            <div className="flex flex-wrap gap-1.5 pt-1">
              {[
                'Kinésithérapie classique',
                'Tecar thérapie',
                'Réathlétisation',
                'Thérapie manuelle',
                'Onde de choc',
                'Cupping thérapie',
                'Récupération',
                'Séance de bilan',
                'Séance de Suivi',
              ].map((quickMotif) => {
                const active = editAppMotif.trim().toLowerCase() === quickMotif.toLowerCase();
                return (
                  <button
                    key={quickMotif}
                    type="button"
                    onClick={() => {
                      setEditAppMotif(quickMotif);
                      setShowEditAppMotifDropdown(false);
                    }}
                    className={`px-2 py-0.5 rounded-md text-xs font-semibold border transition-colors cursor-pointer ${
                      active
                        ? 'bg-primary-600 text-white border-primary-600'
                        : 'bg-slate-50 hover:bg-primary-50 text-slate-600 hover:text-primary-700 border-slate-200'
                    }`}
                  >
                    {quickMotif}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-medium text-slate-700">Praticien (optionnel)</label>
            <select
              value={editAppTherapist}
              onChange={(e) => setEditAppTherapist(e.target.value)}
              className="w-full p-2.5 border border-slate-200 rounded-lg bg-white text-sm text-slate-900 focus:ring-2 focus:ring-primary-500 outline-none"
            >
              <option value="">Non assigné</option>
              {therapists.map(t => (
                <option key={t.id} value={t.id}>{t.prenom} {t.nom}</option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-slate-700">Date de la séance</label>
              <input
                type="date"
                required
                value={editAppDate}
                onChange={(e) => setEditAppDate(e.target.value)}
                className="w-full p-2.5 border border-slate-200 rounded-lg text-sm font-semibold focus:ring-2 focus:ring-primary-500"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-slate-700">Heure de la séance</label>
              <input
                type="time"
                required
                value={editAppTime}
                onChange={(e) => setEditAppTime(e.target.value)}
                className="w-full p-2.5 border border-slate-200 rounded-lg text-sm font-semibold focus:ring-2 focus:ring-primary-500"
              />
            </div>
          </div>

          <div className="pt-3 flex justify-end gap-3 border-t border-slate-100">
            <Button type="button" variant="outline" onClick={() => setIsEditAppointmentModalOpen(false)}>
              Annuler
            </Button>
            <Button type="submit" disabled={editAppLoading}>
              {editAppLoading ? 'Enregistrement...' : 'Enregistrer les modifications'}
            </Button>
          </div>
        </form>
      </Modal>

      {/* Modal Personnalisation Mise en Page Factures & Calendrier de Soins */}
      <Modal
        isOpen={isDocTemplateModalOpen}
        onClose={async () => {
          setIsDocTemplateModalOpen(false);
          const [refreshed, refreshedRefs] = await Promise.all([
            fetchDocumentTemplates(supabase),
            fetchCustomInvoiceRefs(supabase),
          ]);
          setDocTemplates(refreshed);
          setCustomInvoiceRefs(refreshedRefs);
        }}
        title="Personnaliser la mise en page (Factures & Calendrier de soins)"
        maxWidth="6xl"
      >
        <DocumentTemplateEditor />
      </Modal>
</div>
  );
}
