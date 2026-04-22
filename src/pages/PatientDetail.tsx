import React, { useState, useEffect, useMemo } from 'react';
import { User, Phone, Mail, Calendar, FileText, Clock, Activity, Plus, ArrowLeft, Download, AlertCircle, FileSpreadsheet, Key, CheckCircle2, Trash2, MapPin, ShieldAlert } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Badge } from '../components/ui/badge';
import { Modal } from '../components/ui/modal';
import { supabase } from '../lib/supabaseClient';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';

interface PatientDetailProps {
  patientId?: string;
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

export function PatientDetail({ patientId }: PatientDetailProps) {
  const [activeTab, setActiveTab] = useState('dossier');
  const [patient, setPatient] = useState<any>(null);
  const [appointments, setAppointments] = useState<any[]>([]);
  const [billings, setBillings] = useState<any[]>([]);
  const [treatments, setTreatments] = useState<any[]>([]);
  const [motifs, setMotifs] = useState<string[]>(MOTIFS_SEANCE);
  const [loading, setLoading] = useState(true);
  const [forfait, setForfait] = useState(0);

  // Access Modal State
  const [isAccessModalOpen, setIsAccessModalOpen] = useState(false);
  const [accessPassword, setAccessPassword] = useState('');
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

  // New Appointment Modal State
  const [isNewAppointmentModalOpen, setIsNewAppointmentModalOpen] = useState(false);
  const [newAppointmentDate, setNewAppointmentDate] = useState('');
  const [newAppointmentTime, setNewAppointmentTime] = useState('');
  const [newAppointmentMotif, setNewAppointmentMotif] = useState('Séance de Suivi');
  const [showNewMotifDropdown, setShowNewMotifDropdown] = useState(false);
  const [newAppointmentLoading, setNewAppointmentLoading] = useState(false);
  const [newAppointmentMessage, setNewAppointmentMessage] = useState({ type: '', text: '' });

  // New Treatment Modal State
  const [isNewTreatmentModalOpen, setIsNewTreatmentModalOpen] = useState(false);
  const [newTreatmentData, setNewTreatmentData] = useState({
    motif: '',
    nombre_seances_prescrites: 10,
    date_debut: new Date().toISOString().split('T')[0],
    medecin_prescripteur: '',
    statut: 'En cours'
  });
  const [newTreatmentLoading, setNewTreatmentLoading] = useState(false);
  const [newTreatmentMessage, setNewTreatmentMessage] = useState({ type: '', text: '' });

  // Delete Appointment Modal State
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [appointmentToDelete, setAppointmentToDelete] = useState<string | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);

  // Delete Billing Modal State
  const [isDeleteBillingModalOpen, setIsDeleteBillingModalOpen] = useState(false);
  const [billingToDelete, setBillingToDelete] = useState<string | null>(null);
  const [deleteBillingLoading, setDeleteBillingLoading] = useState(false);

  useEffect(() => {
    if (patientId) {
      fetchPatientDetails();
    }
  }, [patientId]);

  const fetchPatientDetails = async () => {
    setLoading(true);
    
    // Fetch patient
    const { data: patientData, error: patientError } = await supabase
      .from('patients')
      .select('*')
      .eq('id', patientId)
      .single();

    if (!patientError && patientData) {
      setPatient(patientData);
      setForfait(patientData.forfait_seances || 0);
    }

    // Fetch appointments
    const { data: apptData } = await supabase
      .from('appointments')
      .select('*')
      .eq('patient_id', patientId)
      .order('date_heure', { ascending: false });
      
    if (apptData) {
      setAppointments(apptData);
    }

    // Fetch billings
    const { data: billingData } = await supabase
      .from('billings')
      .select('*, appointments(date_heure)')
      .eq('patient_id', patientId)
      .order('id', { ascending: false }); // Fallback order if created_at doesn't exist
      
    if (billingData) {
      setBillings(billingData);
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
    const { data: motifData } = await supabase.from('seance_motifs').select('nom');
    if (motifData && motifData.length > 0) {
      setMotifs(motifData.map(m => m.nom));
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

  // Calculate session progression based on actual appointments
  const activeTreatment = useMemo(() => {
    // Find the current active treatment or the most recent one
    const activeTreatmentData = treatments.find(t => t.statut === 'En cours') || treatments[0];
    
    // Count completed sessions
    // We count all 'Effectué' appointments for this patient to ensure synchronization with history
    const seances_effectuees = appointments.filter(a => a.statut === 'Effectué').length;

    return {
      motif: activeTreatmentData?.motif || patient?.pathologie || 'Non renseigné',
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

  if (loading) {
    return <div className="p-8 text-center text-slate-500">Chargement des détails du patient...</div>;
  }

  if (!patient) {
    return <div className="p-8 text-center text-slate-500">Patient introuvable.</div>;
  }

  const handleAddForfait = async () => {
    const newForfait = forfait + 10;
    setForfait(newForfait);
    await supabase.from('patients').update({ forfait_seances: newForfait }).eq('id', patientId);
  };

  const handleGenerateAccess = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!patient.telephone) {
      setAccessMessage({ type: 'error', text: 'Le patient doit avoir un numéro de téléphone renseigné.' });
      return;
    }

    setAccessLoading(true);
    setAccessMessage({ type: '', text: '' });

    try {
      // Clean phone number (remove spaces, etc.)
      const cleanPhone = patient.telephone.replace(/\s+/g, '');
      const dummyEmail = `${cleanPhone}@patient.reforme.center`;

      // 1. Create auth user
      const { data: authData, error: authError } = await supabase.auth.signUp({
        email: dummyEmail,
        password: accessPassword,
      });

      if (authError) throw authError;

      if (authData.user) {
        // 2. Create profile with 'patient' role
        const { error: profileError } = await supabase
          .from('profiles')
          .upsert([
            { id: authData.user.id, role: 'patient' }
          ]);

        if (profileError) throw profileError;

        // 3. Update patient to record that access has been generated
        await supabase
          .from('patients')
          .update({ has_access: true })
          .eq('id', patientId);

        setAccessMessage({ type: 'success', text: 'Accès généré avec succès ! Le patient peut se connecter avec son numéro de téléphone et ce mot de passe.' });
        setAccessPassword('');
      }
    } catch (err: any) {
      setAccessMessage({ type: 'error', text: err.message || 'Erreur lors de la génération de l\'accès.' });
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
      const { error } = await supabase
        .from('appointments')
        .update({ notes_seance: noteContent })
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

    const { error } = await supabase
      .from('patients')
      .update(editPatientData)
      .eq('id', patientId);

    setEditPatientLoading(false);
    if (error) {
      setEditPatientMessage({ type: 'error', text: error.message });
    } else {
      setEditPatientMessage({ type: 'success', text: 'Patient modifié avec succès' });
      setPatient({ ...patient, ...editPatientData });
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

    const { error } = await supabase
      .from('treatments')
      .insert([{
        patient_id: patientId,
        ...newTreatmentData
      }]);

    setNewTreatmentLoading(false);
    if (error) {
      setNewTreatmentMessage({ type: 'error', text: error.message });
    } else {
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
    setBillingToDelete(id);
    setIsDeleteBillingModalOpen(true);
  };

  const executeDeleteBilling = async () => {
    if (!billingToDelete) return;
    
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

  const handleNewAppointment = async (e: React.FormEvent) => {
    e.preventDefault();
    setNewAppointmentLoading(true);
    setNewAppointmentMessage({ type: '', text: '' });

    await ensureMotifExists(newAppointmentMotif);

    const dateHeure = new Date(`${newAppointmentDate}T${newAppointmentTime}`).toISOString();

    const { error } = await supabase
      .from('appointments')
      .insert([{
        patient_id: patientId,
        date_heure: dateHeure,
        statut: 'Confirmé',
        notes_seance: newAppointmentMotif
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

  const generateInvoiceExcel = () => {
    const totalPaid = billings.reduce((sum, b) => sum + Number(b.montant), 0);
    const sessionsCount = billings.length;
    const ref = `FAC-${new Date().getFullYear()}-${Math.floor(Math.random() * 10000)}`;
    const date = new Date().toLocaleDateString('fr-FR');

    const wsData = [
      ["Re Forme Center"],
      ["123 Avenue de la Santé, 75000 Paris"],
      ["Tel: 01 23 45 67 89"],
      [],
      ["FACTURE"],
      ["Réf :", ref],
      ["Date :", date],
      [],
      ["Facturé à :", `${patient.prenom} ${patient.nom}`],
      ["Email :", patient.email || "Non renseigné"],
      ["Téléphone :", patient.telephone || "Non renseigné"],
      [],
      ["Désignation", "Quantité", "Prix Unitaire", "Total"],
      ["Séances de kinésithérapie", sessionsCount, "-", `${totalPaid} DH`],
      [],
      ["", "", "Total Payé :", `${totalPaid} DH`]
    ];

    const ws = XLSX.utils.aoa_to_sheet(wsData);
    
    // Ajuster la largeur des colonnes pour une meilleure lisibilité
    ws['!cols'] = [{ wch: 30 }, { wch: 15 }, { wch: 15 }, { wch: 15 }];

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Facture");
    XLSX.writeFile(wb, `Facture_${patient.nom}_${patient.prenom}.xlsx`);
  };

  const exportHistoryToExcel = () => {
    const completedAppointments = appointments.filter(a => a.statut === 'Effectué');
    const data = completedAppointments.map(app => ({
      'Date': new Date(app.date_heure).toLocaleDateString('fr-FR'),
      'Heure': new Date(app.date_heure).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }),
      'Thérapeute': 'Mr HADDAOUI Younes',
      'Nature des soins': app.notes_seance || 'Séance de kinésithérapie'
    }));

    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Historique");
    XLSX.writeFile(wb, `Historique_Soins_${patient.nom}_${patient.prenom}.xlsx`);
  };

  const generateCalendarPDF = () => {
    const doc = new jsPDF();
    
    doc.setFontSize(18);
    doc.setTextColor(13, 148, 136);
    doc.text("Calendrier de Soins", 14, 20);
    
    doc.setFontSize(12);
    doc.setTextColor(0);
    doc.text(`Patient : ${patient.prenom} ${patient.nom}`, 14, 30);
    
    const completedAppointments = appointments.filter(a => a.statut === 'Effectué');
    
    const tableData = completedAppointments.map((app, index) => [
      (index + 1).toString(),
      new Date(app.date_heure).toLocaleDateString('fr-FR'),
      new Date(app.date_heure).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }),
      app.notes_seance || 'Seance de suivi'
    ]);
    
    autoTable(doc, {
      startY: 40,
      head: [['N', 'Date', 'Heure', 'Nature des soins']],
      body: tableData,
      theme: 'grid',
      headStyles: { fillColor: [13, 148, 136] }
    });
    
    doc.save(`Calendrier_Soins_${patient.nom}_${patient.prenom}.pdf`);
  };

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      {/* Header Profile */}
      <div className="flex flex-col md:flex-row gap-6 items-start md:items-center justify-between bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
        <div className="flex items-center gap-5">
          <div className="h-20 w-20 rounded-full bg-primary-100 flex items-center justify-center text-primary-700 text-2xl font-bold uppercase">
            {patient.prenom?.[0]}{patient.nom?.[0]}
          </div>
          <div>
            <h1 className="text-2xl font-bold text-slate-900">{patient.prenom} {patient.nom}</h1>
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
          <Button variant="outline" className="flex-1 md:flex-none" onClick={() => setIsAccessModalOpen(true)}>
            <Key className="h-4 w-4 mr-2" /> Accès
          </Button>
          <Button variant="outline" className="flex-1 md:flex-none" onClick={() => window.location.hash = 'patients'}>
            <ArrowLeft className="h-4 w-4 mr-2" /> Retour
          </Button>
          <Button variant="outline" className="flex-1 md:flex-none" onClick={() => {
            setEditPatientData(patient);
            setIsEditPatientModalOpen(true);
          }}>Modifier</Button>
          <Button className="flex-1 md:flex-none gap-2" onClick={() => setIsNewAppointmentModalOpen(true)}><Plus className="h-4 w-4" /> Nouveau RDV</Button>
        </div>
      </div>

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
                      setEditPatientData(patient);
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
                  <div className="space-y-1 sm:col-span-2">
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
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-bold flex items-center gap-2 text-primary-700">
                    <Activity className="h-4 w-4" />
                    Traitement Actuel
                  </CardTitle>
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
                    <div className="pt-2">
                      <div className="flex justify-between text-[11px] mb-1.5 font-bold uppercase text-slate-500">
                        <span>Séances effectuées</span>
                        <span className="text-primary-600">{activeTreatment.seances_effectuees} / {activeTreatment.seances_prescrites}</span>
                      </div>
                      <div className="h-2 w-full bg-slate-200/50 rounded-full overflow-hidden">
                        <div 
                          className="h-full bg-primary-500 rounded-full transition-all duration-500 shadow-[0_0_8px_rgba(var(--primary-500),0.3)]"
                          style={{ width: `${progressPercentage}%` }}
                        ></div>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card className="border-0 shadow-sm border-t-4 border-t-emerald-500">
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                  <CardTitle className="text-sm font-bold flex items-center gap-2 text-emerald-700">
                    <FileText className="h-4 w-4" />
                    Forfait
                  </CardTitle>
                  <Button variant="ghost" size="sm" className="h-7 text-[10px] font-bold" onClick={handleAddForfait}>+ 10 SÉANCES</Button>
                </CardHeader>
                <CardContent>
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
                </CardContent>
              </Card>
            </div>

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
                    appointments.filter(app => app.notes_seance).slice(0, 5).map((app) => (
                      <div key={app.id} className="group relative bg-white p-4 rounded-xl border border-slate-100 hover:border-primary-100 hover:shadow-md hover:shadow-primary-500/5 transition-all">
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center gap-2">
                            <span className="w-2 h-2 rounded-full bg-primary-500" />
                            <span className="text-sm font-bold text-slate-900">Séance du {new Date(app.date_heure).toLocaleDateString('fr-FR')}</span>
                          </div>
                          <span className="text-[10px] font-bold text-slate-400 bg-slate-50 px-2 py-1 rounded-md">{new Date(app.date_heure).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}</span>
                        </div>
                        <p className="text-sm text-slate-600 leading-relaxed italic">"{app.notes_seance}"</p>
                      </div>
                    ))
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
                {appointments.filter(a => new Date(a.date_heure) > new Date()).length > 0 ? (
                  (() => {
                    const next = appointments.filter(a => new Date(a.date_heure) > new Date()).sort((a,b) => new Date(a.date_heure).getTime() - new Date(b.date_heure).getTime())[0];
                    return (
                      <div className="p-4 bg-white rounded-xl border border-indigo-100 shadow-sm">
                        <p className="font-black text-indigo-900 text-base">
                          {new Date(next.date_heure).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })}
                        </p>
                        <p className="text-sm text-indigo-600 mt-1 font-bold">
                          à {new Date(next.date_heure).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
                        </p>
                        <div className="mt-3 pt-3 border-t border-indigo-50 flex items-center justify-between">
                          <span className="text-[10px] font-bold text-indigo-400 uppercase tracking-widest">Durée : 30 min</span>
                          <span className="text-[10px] font-bold text-indigo-400 uppercase tracking-widest">Kiné : Younes</span>
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
                    {patient.atcd || patient.notes_antecedents || 'Aucun antécédent médical signalé.'}
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
              <CardContent className="pt-2 space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="bg-white/5 p-3 rounded-lg">
                    <p className="text-xl font-black">{appointments.filter(a => a.statut === 'Effectué').length}</p>
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-tighter">Séances effectuées</p>
                  </div>
                  <div className="bg-white/5 p-3 rounded-lg">
                    <p className="text-xl font-black">{billings.length}</p>
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-tighter">Factures réglées</p>
                  </div>
                </div>
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
                      <div className="flex justify-between items-start mb-4">
                        <div>
                          <h3 className="font-semibold text-slate-900 text-lg">{treatment.motif}</h3>
                          <p className="text-sm text-slate-500 mt-1">
                            {treatment.date_debut ? `Depuis le ${new Date(treatment.date_debut).toLocaleDateString('fr-FR')}` : 'Date non renseignée'}
                          </p>
                        </div>
                        <Badge variant="outline" className={
                          treatment.statut === 'Terminé' ? "bg-green-100 text-green-700 border-green-200" : 
                          treatment.statut === 'En cours' ? "bg-blue-100 text-blue-700 border-blue-200" : 
                          "bg-slate-100 text-slate-700 border-slate-200"
                        }>
                          {treatment.statut || 'En cours'}
                        </Badge>
                      </div>
                      
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-4 border-t border-slate-100">
                        <div>
                          <p className="text-xs text-slate-500 font-medium uppercase tracking-wider mb-1">Séances</p>
                          <p className="text-slate-900 font-medium">{treatment.nombre_seances_prescrites} séances prescrites</p>
                        </div>
                        <div>
                          <p className="text-xs text-slate-500 font-medium uppercase tracking-wider mb-1">Bilan Financier</p>
                          <p className="text-slate-900 font-medium">Total facturé : {treatment.total_facture || 0} DH</p>
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
                      <th className="px-6 py-4 font-medium">Durée</th>
                      <th className="px-6 py-4 font-medium">Statut</th>
                      <th className="px-6 py-4 font-medium text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {appointments.length === 0 ? (
                      <tr>
                        <td colSpan={4} className="px-6 py-8 text-center text-slate-500">
                          Aucun rendez-vous trouvé.
                        </td>
                      </tr>
                    ) : (
                      appointments.map((app) => (
                        <tr key={app.id} className="bg-white hover:bg-slate-50 transition-colors">
                          <td className="px-6 py-4 font-medium text-slate-900">
                            {new Date(app.date_heure).toLocaleString('fr-FR', {
                              dateStyle: 'long',
                              timeStyle: 'short'
                            })}
                          </td>
                          <td className="px-6 py-4 text-slate-600">
                            {app.duree || 30} min
                          </td>
                          <td className="px-6 py-4">
                            <Badge variant={app.statut === 'Effectué' ? 'success' : app.statut === 'Annulé' ? 'outline' : 'default'}>
                              {app.statut || 'Confirmé'}
                            </Badge>
                          </td>
                          <td className="px-6 py-4 text-right">
                            <Button 
                              variant="ghost" 
                              size="sm" 
                              onClick={() => confirmDeleteAppointment(app.id)}
                              className="text-rose-500 hover:text-rose-700 hover:bg-rose-50"
                              title="Supprimer la séance"
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </td>
                        </tr>
                      ))
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
          <div className="flex justify-end gap-3">
            <Button variant="outline" onClick={generateCalendarPDF} className="gap-2">
              <Download className="h-4 w-4" /> Calendrier de Soins
            </Button>
            <Button onClick={generateInvoiceExcel} className="gap-2 bg-green-600 hover:bg-green-700 text-white">
              <FileSpreadsheet className="h-4 w-4" /> Générer Facture Excel
            </Button>
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
                      <th className="px-6 py-4 font-medium">Date du RDV</th>
                      <th className="px-6 py-4 font-medium">Montant</th>
                      <th className="px-6 py-4 font-medium">Type de paiement</th>
                      <th className="px-6 py-4 font-medium">Statut</th>
                      <th className="px-6 py-4 font-medium text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {billings.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="px-6 py-8 text-center text-slate-500">
                          Aucune facture trouvée.
                        </td>
                      </tr>
                    ) : (
                      billings.map((bill) => (
                        <tr key={bill.id} className="bg-white hover:bg-slate-50 transition-colors">
                          <td className="px-6 py-4 font-medium text-slate-900">
                            {bill.appointments?.date_heure ? new Date(bill.appointments.date_heure).toLocaleDateString('fr-FR') : 'N/A'}
                          </td>
                          <td className="px-6 py-4 font-medium text-slate-900">
                            {bill.montant} DH
                          </td>
                          <td className="px-6 py-4 text-slate-600">
                            {bill.type_paiement}
                          </td>
                          <td className="px-6 py-4">
                            <Badge variant="success">
                              {bill.statut}
                            </Badge>
                          </td>
                          <td className="px-6 py-4 text-right">
                            <Button 
                              variant="ghost" 
                              size="sm" 
                              onClick={() => confirmDeleteBilling(bill.id)}
                              className="text-rose-500 hover:text-rose-700 hover:bg-rose-50"
                              title="Supprimer la facturation"
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Access Modal */}
      <Modal
        isOpen={isAccessModalOpen}
        onClose={() => setIsAccessModalOpen(false)}
        title="Générer un accès en ligne"
      >
        <form onSubmit={handleGenerateAccess} className="space-y-4">
          <p className="text-sm text-slate-600">
            Générez un accès pour que le patient puisse se connecter à son espace personnel.
            L'identifiant sera son numéro de téléphone : <strong>{patient.telephone || 'Non renseigné'}</strong>
          </p>

          {accessMessage.text && (
            <div className={`p-3 rounded-lg text-sm ${accessMessage.type === 'success' ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
              {accessMessage.text}
            </div>
          )}

          <div className="space-y-2">
            <label className="text-sm font-medium text-slate-700">Mot de passe provisoire</label>
            <input
              type="text"
              required
              value={accessPassword}
              onChange={(e) => setAccessPassword(e.target.value)}
              className="w-full p-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
              placeholder="Ex: Patient2024!"
              minLength={6}
            />
            <p className="text-xs text-slate-500">Le mot de passe doit contenir au moins 6 caractères.</p>
          </div>

          <div className="pt-4 flex justify-end gap-3">
            <Button type="button" variant="outline" onClick={() => setIsAccessModalOpen(false)}>
              Fermer
            </Button>
            <Button type="submit" disabled={accessLoading || !patient.telephone}>
              {accessLoading ? 'Génération...' : 'Générer l\'accès'}
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
                setNoteContent(app?.notes_seance || '');
              }}
              className="w-full p-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
            >
              <option value="">-- Choisir une séance --</option>
              {appointments.map(app => (
                <option key={app.id} value={app.id}>
                  {new Date(app.date_heure).toLocaleDateString('fr-FR')} à {new Date(app.date_heure).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
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
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-slate-700">Antécédents & Notes</label>
            <textarea
              value={editPatientData.atcd || ''}
              onChange={(e) => setEditPatientData({ ...editPatientData, atcd: e.target.value })}
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

          <div className="space-y-2 relative">
            <label className="text-sm font-medium text-slate-700">Motif de la séance</label>
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
              className="w-full p-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
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
              <input
                type="number"
                min="1"
                required
                value={newTreatmentData.nombre_seances_prescrites}
                onChange={(e) => setNewTreatmentData({ ...newTreatmentData, nombre_seances_prescrites: parseInt(e.target.value) })}
                className="w-full p-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
              />
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

      {/* Delete Billing Modal */}
      <Modal
        isOpen={isDeleteBillingModalOpen}
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

    </div>
  );
}
