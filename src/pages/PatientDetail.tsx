import { useState, useEffect } from 'react';
import { User, Phone, Mail, Calendar, FileText, Clock, Activity, Plus, ArrowLeft, Download, AlertCircle, FileSpreadsheet, Key } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Badge } from '../components/ui/badge';
import { Modal } from '../components/ui/modal';
import { supabase } from '../lib/supabaseClient';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';

interface PatientDetailProps {
  patientId?: string;
}

export function PatientDetail({ patientId }: PatientDetailProps) {
  const [activeTab, setActiveTab] = useState('dossier');
  const [patient, setPatient] = useState<any>(null);
  const [appointments, setAppointments] = useState<any[]>([]);
  const [billings, setBillings] = useState<any[]>([]);
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

    setLoading(false);
  };

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
      ["Séances de kinésithérapie", sessionsCount, "-", `${totalPaid} €`],
      [],
      ["", "", "Total Payé :", `${totalPaid} €`]
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
      'Thérapeute': 'Dr. Dupont',
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

  // Fallback for missing active_treatment data in Supabase (since we just added the columns)
  const activeTreatment = {
    motif: patient.pathologie || 'Non renseigné',
    seances_prescrites: patient.nombre_seances || 0,
    seances_effectuees: 0, // This would ideally come from counting appointments
  };

  const remainingSessions = activeTreatment.seances_prescrites - activeTreatment.seances_effectuees;
  const progressPercentage = activeTreatment.seances_prescrites > 0 
    ? (activeTreatment.seances_effectuees / activeTreatment.seances_prescrites) * 100 
    : 0;

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
          <Button variant="outline" className="flex-1 md:flex-none">Modifier</Button>
          <Button className="flex-1 md:flex-none gap-2"><Plus className="h-4 w-4" /> Nouveau RDV</Button>
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
        <div className="grid gap-6 md:grid-cols-3">
          {/* Left Column */}
          <div className="md:col-span-2 space-y-6">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle className="flex items-center gap-2">
                  <Activity className="h-5 w-5 text-primary-500" />
                  Traitement Actuel
                </CardTitle>
                <Badge variant="success">En cours</Badge>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div>
                    <h4 className="text-sm font-medium text-slate-500">Motif de consultation</h4>
                    <p className="text-base font-medium text-slate-900 mt-1">{activeTreatment.motif}</p>
                  </div>
                  
                  <div className="pt-4 border-t border-slate-100">
                    <div className="flex justify-between text-sm mb-2">
                      <span className="font-medium text-slate-700">Progression des séances</span>
                      <span className="text-slate-500">{activeTreatment.seances_effectuees} / {activeTreatment.seances_prescrites}</span>
                    </div>
                    <div className="h-2.5 w-full bg-slate-100 rounded-full overflow-hidden">
                      <div 
                        className="h-full bg-mint-500 rounded-full transition-all duration-500"
                        style={{ width: `${progressPercentage}%` }}
                      ></div>
                    </div>
                    <p className="text-xs text-slate-500 mt-2 text-right">
                      {remainingSessions} séance{remainingSessions > 1 ? 's' : ''} restante{remainingSessions > 1 ? 's' : ''}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle className="flex items-center gap-2">
                  <FileText className="h-5 w-5 text-primary-500" />
                  Gestion des Forfaits
                </CardTitle>
                <Button variant="outline" size="sm" onClick={handleAddForfait}>+ 10 Séances</Button>
              </CardHeader>
              <CardContent>
                <div className={`p-4 rounded-xl border flex items-center justify-between ${forfait < 2 ? 'bg-orange-50 border-orange-200' : 'bg-mint-50 border-mint-200'}`}>
                  <div className="flex items-center gap-3">
                    {forfait < 2 ? (
                      <AlertCircle className="h-8 w-8 text-orange-500" />
                    ) : (
                      <Activity className="h-8 w-8 text-mint-500" />
                    )}
                    <div>
                      <h4 className={`font-semibold ${forfait < 2 ? 'text-orange-800' : 'text-mint-800'}`}>
                        Forfait en cours
                      </h4>
                      <p className={`text-sm ${forfait < 2 ? 'text-orange-600' : 'text-mint-600'}`}>
                        {forfait} séance{forfait > 1 ? 's' : ''} restante{forfait > 1 ? 's' : ''}
                      </p>
                    </div>
                  </div>
                  {forfait < 2 && (
                    <Badge variant="secondary" className="bg-orange-100 text-orange-700 hover:bg-orange-100">
                      Renouvellement conseillé
                    </Badge>
                  )}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle className="flex items-center gap-2">
                  <FileText className="h-5 w-5 text-primary-500" />
                  Notes de séance
                </CardTitle>
                <Button variant="outline" size="sm" onClick={() => setIsNoteModalOpen(true)}>Ajouter une note</Button>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {appointments.filter(app => app.notes_seance).length === 0 ? (
                    <p className="text-sm text-slate-500 text-center py-4">Aucune note de séance enregistrée.</p>
                  ) : (
                    appointments.filter(app => app.notes_seance).map((app, index) => (
                      <div key={app.id} className={`border-l-2 ${index === 0 ? 'border-primary-200' : 'border-slate-200'} pl-4 pb-4`}>
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-sm font-semibold text-slate-900">Séance du {new Date(app.date_heure).toLocaleDateString('fr-FR')}</span>
                          <span className="text-xs text-slate-500">{new Date(app.date_heure).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}</span>
                        </div>
                        <p className="text-sm text-slate-600">{app.notes_seance}</p>
                      </div>
                    ))
                  )}
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Right Column */}
          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Antécédents & Notes</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-slate-600 whitespace-pre-line">
                  {patient.atcd || patient.notes_antecedents || 'Aucun antécédent renseigné.'}
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Prochain RDV</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-start gap-3 p-3 bg-primary-50 rounded-lg border border-primary-100">
                  <Clock className="h-5 w-5 text-primary-600 mt-0.5" />
                  <div>
                    <p className="font-medium text-primary-900">Demain à 11h00</p>
                    <p className="text-sm text-primary-700 mt-0.5">Durée: 30 min</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      )}

      {activeTab === 'traitements' && (
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileText className="h-5 w-5 text-primary-500" />
                Historique des Traitements Passés
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-6">
                {/* Example Treatment 1 */}
                <div className="border border-slate-200 rounded-lg p-5 bg-white shadow-sm">
                  <div className="flex justify-between items-start mb-4">
                    <div>
                      <h3 className="font-semibold text-slate-900 text-lg">Entorse cheville droite</h3>
                      <p className="text-sm text-slate-500 mt-1">Du 12 Janvier 2024 au 28 Février 2024</p>
                    </div>
                    <Badge variant="secondary" className="bg-slate-100 text-slate-700">Terminé</Badge>
                  </div>
                  
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-4 border-t border-slate-100">
                    <div>
                      <p className="text-xs text-slate-500 font-medium uppercase tracking-wider mb-1">Séances</p>
                      <p className="text-slate-900 font-medium">12 séances effectuées</p>
                    </div>
                    <div>
                      <p className="text-xs text-slate-500 font-medium uppercase tracking-wider mb-1">Bilan Financier</p>
                      <p className="text-slate-900 font-medium">Total facturé : 600 €</p>
                      <p className="text-xs text-slate-500 mt-0.5">Reste à charge : 0 €</p>
                    </div>
                    <div>
                      <p className="text-xs text-slate-500 font-medium uppercase tracking-wider mb-1">Médecin Prescripteur</p>
                      <p className="text-slate-900 font-medium">Dr. Jean Dupont</p>
                    </div>
                  </div>
                </div>

                {/* Example Treatment 2 */}
                <div className="border border-slate-200 rounded-lg p-5 bg-white shadow-sm">
                  <div className="flex justify-between items-start mb-4">
                    <div>
                      <h3 className="font-semibold text-slate-900 text-lg">Tendinite épaule gauche</h3>
                      <p className="text-sm text-slate-500 mt-1">Du 05 Septembre 2023 au 15 Octobre 2023</p>
                    </div>
                    <Badge variant="secondary" className="bg-slate-100 text-slate-700">Terminé</Badge>
                  </div>
                  
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-4 border-t border-slate-100">
                    <div>
                      <p className="text-xs text-slate-500 font-medium uppercase tracking-wider mb-1">Séances</p>
                      <p className="text-slate-900 font-medium">10 séances effectuées</p>
                    </div>
                    <div>
                      <p className="text-xs text-slate-500 font-medium uppercase tracking-wider mb-1">Bilan Financier</p>
                      <p className="text-slate-900 font-medium">Total facturé : 500 €</p>
                      <p className="text-xs text-slate-500 mt-0.5 text-orange-600 font-medium">Reste à charge : 50 €</p>
                    </div>
                    <div>
                      <p className="text-xs text-slate-500 font-medium uppercase tracking-wider mb-1">Médecin Prescripteur</p>
                      <p className="text-slate-900 font-medium">Dr. Marie Curie</p>
                    </div>
                  </div>
                </div>
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
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {appointments.length === 0 ? (
                      <tr>
                        <td colSpan={3} className="px-6 py-8 text-center text-slate-500">
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
                            <Badge variant={app.statut === 'Effectué' ? 'success' : app.statut === 'Annulé' ? 'secondary' : 'default'}>
                              {app.statut || 'Confirmé'}
                            </Badge>
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
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {billings.length === 0 ? (
                      <tr>
                        <td colSpan={4} className="px-6 py-8 text-center text-slate-500">
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
                            {bill.montant} €
                          </td>
                          <td className="px-6 py-4 text-slate-600">
                            {bill.type_paiement}
                          </td>
                          <td className="px-6 py-4">
                            <Badge variant="success">
                              {bill.statut}
                            </Badge>
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
              onChange={(e) => setSelectedAppointmentId(e.target.value)}
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
    </div>
  );
}
