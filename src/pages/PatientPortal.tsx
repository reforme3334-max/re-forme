import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabaseClient';
import { LogOut, AlertCircle, Calendar, Clock, CheckCircle, CreditCard, Activity, User, Key, FileText, Settings, Phone, MessageCircle, Plus, Download, Camera, Upload, Trash2, Image as ImageIcon, Play } from 'lucide-react';
import { Card, CardContent } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { ReviewSection } from '../components/reviews/ReviewSection';
import { Modal } from '../components/ui/modal';

export function PatientPortal() {
  const [patient, setPatient] = useState<any>(null);
  const [appointments, setAppointments] = useState<any[]>([]);
  const [billings, setBillings] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Navigation
  const [activeTab, setActiveTab] = useState('accueil');

  // Password Change State
  const [isPasswordModalOpen, setIsPasswordModalOpen] = useState(false);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordLoading, setPasswordLoading] = useState(false);
  const [passwordMessage, setPasswordMessage] = useState({ type: '', text: '' });

  // Appointment Request State
  const [isApptModalOpen, setIsApptModalOpen] = useState(false);
  const [apptDate, setApptDate] = useState('');
  const [apptTime, setApptTime] = useState('');
  const [apptMotif, setApptMotif] = useState('');
  const [apptLoading, setApptLoading] = useState(false);
  const [apptMessage, setApptMessage] = useState({ type: '', text: '' });

  // Profile Edit State
  const [isProfileModalOpen, setIsProfileModalOpen] = useState(false);
  const [profileForm, setProfileForm] = useState({
    telephone: '',
    email: '',
    adresse: '',
    pathologie: '',
    notes_antecedents: ''
  });
  const [profileLoading, setProfileLoading] = useState(false);
  const [profileMessage, setProfileMessage] = useState({ type: '', text: '' });

 
  // Local Documents State (simulated)
  
  const [exercises, setExercises] = useState<any[]>([]);
const [localDocs, setLocalDocs] = useState<any[]>([]);
  const fileInputRef = React.useRef<HTMLInputElement>(null);
 useEffect(() => {
    fetchPatientData();
  }, []);

  const fetchPatientData = async () => {
    setLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        window.location.hash = 'login';
        return;
      }

      const userEmail = session.user.email || '';
      let query = supabase.from('patients').select('*');

      if (userEmail.endsWith('@patient.reforme.center')) {
        const phone = userEmail.replace('@patient.reforme.center', '');
        query = query.ilike('telephone', `%${phone}%`);
      } else {
        query = query.eq('email', userEmail);
      }

      const { data: patientDataList, error: fetchError } = await query;

      if (fetchError || !patientDataList || patientDataList.length === 0) {
        setError('Aucun dossier patient trouvé pour cet identifiant.');
        setLoading(false);
        return;
      }

      const patientData = patientDataList[0];
      setPatient(patientData);
      try {
        const storedDocs = localStorage.getItem(`reforme_docs_${patientData.id}`);
        if (storedDocs) {
          setLocalDocs(JSON.parse(storedDocs));
 
        const storedEx = localStorage.getItem(`reforme_exercises_${patientData.id}`);
        if (storedEx) {
          setExercises(JSON.parse(storedEx));
        }
       }
      } catch(e) { console.error('Erreur lecture docs', e); }

      setProfileForm({
        telephone: patientData.telephone || '',
        email: patientData.email || '',
        adresse: patientData.adresse || '',
        pathologie: patientData.pathologie || '',
        notes_antecedents: patientData.notes_antecedents || ''
      });
      
      const { data: appts } = await supabase
        .from('appointments')
        .select('*')
        .eq('patient_id', patientData.id)
        .order('date_heure', { ascending: true });

      if (appts) {
        const mappedAppts = appts.map(app => {
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

      const { data: bills } = await supabase
        .from('billings')
        .select('*')
        .eq('patient_id', patientData.id);

      if (bills) setBillings(bills);

    } catch (err) {
      console.error(err);
      setError('Erreur lors du chargement des données.');
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    window.location.hash = 'login';
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword !== confirmPassword) {
      setPasswordMessage({ type: 'error', text: 'Les mots de passe ne correspondent pas.' });
      return;
    }
    if (newPassword.length < 6) {
      setPasswordMessage({ type: 'error', text: 'Le mot de passe doit contenir au moins 6 caractères.' });
      return;
    }

    setPasswordLoading(true);
    setPasswordMessage({ type: '', text: '' });

    try {
      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) throw error;
      setPasswordMessage({ type: 'success', text: 'Mot de passe mis à jour avec succès !' });
      setNewPassword('');
      setConfirmPassword('');
      setTimeout(() => setIsPasswordModalOpen(false), 2000);
    } catch (err: any) {
      setPasswordMessage({ type: 'error', text: err.message || 'Erreur lors de la mise à jour.' });
    } finally {
      setPasswordLoading(false);
    }
  };

  const handleRequestAppointment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!apptDate || !apptTime) {
      setApptMessage({ type: 'error', text: 'Veuillez sélectionner une date et une heure.' });
      return;
    }
    setApptLoading(true);
    try {
      // Create a pending appointment request. We use 'Programmé' but mark it clearly in notes.
      const { error } = await supabase.from('appointments').insert({
        patient_id: patient.id,
        date_heure: `${apptDate}T${apptTime}:00`,
        statut: 'Programmé',
        duree: 30, // Default duration
        notes_seance: `[DEMANDE EN LIGNE] Motif: ${apptMotif || 'Non précisé'}`
      });
      if (error) throw error;
      
      setApptMessage({ type: 'success', text: 'Demande envoyée avec succès !' });
      setApptDate('');
      setApptTime('');
      setApptMotif('');
      fetchPatientData();
      setTimeout(() => setIsApptModalOpen(false), 2000);
    } catch (err: any) {
      setApptMessage({ type: 'error', text: err.message || 'Erreur lors de la demande.' });
    } finally {
      setApptLoading(false);
    }
  };

  
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !patient) return;

    const reader = new FileReader();
    reader.onloadend = () => {
      const newDoc = {
        id: Date.now().toString(),
        name: file.name,
        type: file.type,
        date: new Date().toISOString(),
        dataUrl: reader.result as string
      };
      
      const updatedDocs = [newDoc, ...localDocs];
      setLocalDocs(updatedDocs);
      try {
        localStorage.setItem(`reforme_docs_${patient.id}`, JSON.stringify(updatedDocs));
      } catch(err) {
        alert('Stockage local saturé. Veuillez libérer de la mémoire.');
      }
    };
    reader.readAsDataURL(file);
  };
  
  const handleDeleteDoc = (id: string) => {
    if (!confirm('Supprimer ce document ?')) return;
    const updatedDocs = localDocs.filter(d => d.id !== id);
    setLocalDocs(updatedDocs);
    localStorage.setItem(`reforme_docs_${patient.id}`, JSON.stringify(updatedDocs));
  };
const handleUpdateProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setProfileLoading(true);
    try {
      const { error } = await supabase.from('patients').update(profileForm).eq('id', patient.id);
      if (error) throw error;
      setProfileMessage({ type: 'success', text: 'Profil mis à jour avec succès !' });
      fetchPatientData();
      setTimeout(() => setIsProfileModalOpen(false), 2000);
    } catch (err: any) {
      setProfileMessage({ type: 'error', text: err.message || 'Erreur lors de la mise à jour.' });
    } finally {
      setProfileLoading(false);
    }
  };

  const downloadReceipt = (billing: any, appt: any) => {
    // Generate a simple text-based receipt or trigger print.
    // A robust app would generate a PDF, but here we can open a styled print window.
    const receiptContent = `
      <html>
        <head>
          <title>Reçu de Paiement - ${billing.id}</title>
          <style>
            body { font-family: system-ui, sans-serif; padding: 40px; color: #1e293b; max-width: 600px; margin: 0 auto; }
            h1 { color: #0d9488; border-bottom: 2px solid #e2e8f0; padding-bottom: 10px; }
            .header { display: flex; justify-content: space-between; margin-bottom: 30px; }
            .details { background: #f8fafc; padding: 20px; border-radius: 8px; margin-bottom: 30px; }
            .row { display: flex; justify-content: space-between; margin-bottom: 10px; }
            .total { font-size: 1.25rem; font-weight: bold; border-top: 1px solid #e2e8f0; padding-top: 10px; margin-top: 10px; }
          </style>
        </head>
        <body>
          <div class="header">
            <div>
              <h1>ReForme Center</h1>
              <p>Centre de Kinésithérapie</p>
            </div>
            <div style="text-align: right;">
              <h2>REÇU</h2>
              <p>Date: ${new Date(billing.date_facturation).toLocaleDateString('fr-FR')}</p>
            </div>
          </div>
          <div class="details">
            <div class="row"><span>Patient:</span> <strong>${patient.nom} ${patient.prenom}</strong></div>
            <div class="row"><span>Séance du:</span> <strong>${new Date(appt.date_heure).toLocaleDateString('fr-FR')}</strong></div>
            <div class="row"><span>Motif:</span> <strong>${appt.notes_seance || 'Soins de kinésithérapie'}</strong></div>
            <div class="row total"><span>Montant Réglé:</span> <span>${billing.montant} DH</span></div>
          </div>
          <p style="text-align: center; color: #64748b; font-size: 0.875rem;">Ce document tient lieu de reçu pour le paiement des soins dispensés.</p>
        </body>
      </html>
    `;
    const printWindow = window.open('', '_blank');
    if (printWindow) {
      printWindow.document.write(receiptContent);
      printWindow.document.close();
      printWindow.focus();
      // Allow styles to load
      setTimeout(() => { printWindow.print(); }, 250);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <Activity className="h-8 w-8 text-mint-500 animate-pulse" />
      </div>
    );
  }

  if (error || !patient) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <Card className="w-full max-w-md shadow-lg border-0">
          <CardContent className="pt-8 pb-8 px-6 text-center">
            <AlertCircle className="h-12 w-12 text-red-500 mx-auto mb-4" />
            <h2 className="text-xl font-bold text-slate-900 mb-2">Erreur</h2>
            <p className="text-slate-600 mb-6">{error || 'Dossier patient introuvable.'}</p>
            <Button onClick={handleLogout} variant="outline" className="w-full">
              Se déconnecter
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const now = new Date();
  
  const nextAppointment = appointments.find(a => new Date(a.date_heure) > now && a.statut !== 'Annulé');
  
  const pastAppointments = appointments
    .filter(a => new Date(a.date_heure) <= now || a.statut === 'Effectué')
    .sort((a, b) => new Date(b.date_heure).getTime() - new Date(a.date_heure).getTime());
  
  const unpaidAppointments = pastAppointments.filter(a => a.statut === 'Confirmé' || a.statut === 'Programmé');

  return (
    <div className="min-h-screen bg-slate-50 pb-20 font-sans">
      {/* Header */}
      <div className="bg-white px-5 pt-4 pb-2 shadow-sm sticky top-0 z-20 flex flex-col border-b border-slate-100">
        <div className="flex justify-between items-center mb-4">
          <div>
            <h1 className="text-lg font-bold text-slate-900 tracking-tight">
              <span className="text-mint-500">Re</span>Forme Center
            </h1>
            <p className="text-sm text-slate-500 font-medium mt-0.5">Bonjour, {patient.prenom}</p>
          </div>
          <div className="flex items-center gap-1">
            <button 
              onClick={() => setIsPasswordModalOpen(true)} 
              className="p-2 text-slate-400 hover:text-mint-600 bg-slate-50 hover:bg-mint-50 rounded-full transition-colors"
              title="Changer le mot de passe"
            >
              <Key className="h-4 w-4" />
            </button>
            <button 
              onClick={handleLogout} 
              className="p-2 text-slate-400 hover:text-red-600 bg-slate-50 hover:bg-red-50 rounded-full transition-colors"
              title="Se déconnecter"
            >
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex space-x-6 text-sm font-medium border-t border-slate-100 pt-2 px-1">
          <button 
            onClick={() => setActiveTab('accueil')}
            className={`pb-2 ${activeTab === 'accueil' ? 'border-b-2 border-mint-500 text-mint-700' : 'text-slate-500'}`}
          >
            Accueil
          </button>
          <button 
            onClick={() => setActiveTab('documents')}
            className={`pb-2 ${activeTab === 'documents' ? 'border-b-2 border-mint-500 text-mint-700' : 'text-slate-500'}`}
          >
            Documents & Vidéos
          </button>
          <button 
            onClick={() => setActiveTab('profil')}
            className={`pb-2 ${activeTab === 'profil' ? 'border-b-2 border-mint-500 text-mint-700' : 'text-slate-500'}`}
          >
            Mon Profil
          </button>
        </div>
      </div>

      <div className="max-w-md mx-auto p-4 space-y-6 mt-2">
        
        {activeTab === 'accueil' && (
          <>
            {/* Quick Actions */}
            <div className="flex gap-3">
              <Button onClick={() => setIsApptModalOpen(true)} className="flex-1 bg-mint-600 hover:bg-mint-700 text-white shadow-sm flex items-center justify-center gap-2">
                <Plus className="h-4 w-4" /> Demander un RDV
              </Button>
            </div>

            {/* Notifications Prioritaires */}
            <div className="space-y-3">
              {unpaidAppointments.length > 0 && (
                <div className="bg-orange-50 border border-orange-200 rounded-2xl p-4 flex items-start gap-3 shadow-sm">
                  <AlertCircle className="h-6 w-6 text-orange-500 flex-shrink-0 mt-0.5" />
                  <div>
                    <h3 className="font-semibold text-orange-800 text-base">Action requise</h3>
                    <p className="text-sm text-orange-700 mt-1 leading-relaxed">
                      Vous avez <strong className="font-bold">{unpaidAppointments.length} séance{unpaidAppointments.length > 1 ? 's' : ''}</strong> en attente de règlement.
                    </p>
                  </div>
                </div>
              )}

              {nextAppointment ? (
                <div className="bg-blue-50 border border-blue-200 rounded-2xl p-4 flex items-start gap-3 shadow-sm">
                  <Calendar className="h-6 w-6 text-blue-500 flex-shrink-0 mt-0.5" />
                  <div className="flex-1">
                    <h3 className="font-semibold text-blue-800 text-base">Prochaine séance</h3>
                    <p className="text-sm text-blue-700 mt-1 capitalize font-medium">
                      {new Date(nextAppointment.date_heure).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })} à {new Date(nextAppointment.date_heure).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
                    </p>
                  </div>
                </div>
              ) : (
                <div className="bg-white border border-slate-200 rounded-2xl p-5 text-center shadow-sm">
                  <div className="h-10 w-10 bg-slate-50 rounded-full flex items-center justify-center mx-auto mb-2">
                    <Calendar className="h-5 w-5 text-slate-400" />
                  </div>
                  <p className="text-sm font-medium text-slate-600">Aucune séance prévue prochainement.</p>
                </div>
              )}
            </div>

            {/* Suivi des Règlements */}
            <section>
              <h2 className="text-lg font-bold text-slate-900 mb-3 flex items-center gap-2 px-1">
                <CreditCard className="h-5 w-5 text-primary-500" />
                Suivi des Règlements
              </h2>
              <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden divide-y divide-slate-50">
                {pastAppointments.length === 0 ? (
                  <div className="p-6 text-center text-sm text-slate-500">Aucun historique disponible.</div>
                ) : (
                  pastAppointments.map(app => {
                    const isPaid = app.statut === 'Effectué';
                    const billing = billings.find(b => b.appointment_id === app.id);
                    
                    return (
                      <div key={app.id} className="p-4 flex flex-col sm:flex-row sm:items-center justify-between hover:bg-slate-50 transition-colors gap-3">
                        <div>
                          <p className="text-sm font-semibold text-slate-900">
                            {new Date(app.date_heure).toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' })} à {new Date(app.date_heure).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
                          </p>
                          <p className="text-xs text-slate-500 mt-1 flex items-center gap-1">
                            <Activity className="h-3 w-3" /> {app.notes_seance?.replace('\[DEMANDE EN LIGNE\]', '') || 'Séance de suivi'}
                          </p>
                        </div>
                        <div className="flex items-center justify-between sm:flex-col sm:items-end gap-2">
                          {isPaid ? (
                            <div className="flex items-center gap-1.5 text-mint-700 bg-mint-50 px-3 py-1.5 rounded-full text-xs font-bold border border-mint-100">
                              <CheckCircle className="h-3.5 w-3.5" /> Réglé
                            </div>
                          ) : (
                            <div className="flex items-center gap-1.5 text-orange-700 bg-orange-50 px-3 py-1.5 rounded-full text-xs font-bold border border-orange-100">
                              <Clock className="h-3.5 w-3.5" /> En attente
                            </div>
                          )}
                          {isPaid && billing && (
                            <button 
                              onClick={() => downloadReceipt(billing, app)}
                              className="text-xs font-medium text-slate-500 hover:text-mint-600 flex items-center gap-1 bg-white border border-slate-200 px-2 py-1 rounded shadow-sm"
                            >
                              <Download className="h-3 w-3" /> Reçu ({billing.montant} DH)
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </section>

            {/* Section Avis */}
            <div className="pt-2">
              <ReviewSection patientName={`${patient.prenom} ${patient.nom}`} />
            </div>
          </>
        )}

        {activeTab === 'documents' && (
          <div className="space-y-4">
            
            <div className="flex gap-3">
              <Button onClick={() => fileInputRef.current?.click()} className="flex-1 bg-mint-600 hover:bg-mint-700 text-white shadow-sm flex items-center justify-center gap-2">
                <Upload className="h-4 w-4" /> Importer un document
              </Button>
              <Button onClick={() => {
                  if (fileInputRef.current) {
                    fileInputRef.current.capture = "environment";
                    fileInputRef.current.click();
                  }
                }} 
                className="bg-slate-800 hover:bg-slate-900 text-white shadow-sm flex items-center justify-center gap-2"
              >
                <Camera className="h-4 w-4" />
              </Button>
            </div>
            
            <input 
              type="file" 
              accept="image/*,application/pdf"
              ref={fileInputRef} 
              className="hidden" 
              onChange={handleFileUpload}
            />

            {localDocs.length > 0 ? (
              <div className="space-y-3">
                <h3 className="text-sm font-bold text-slate-900 mb-2 px-1">Mes documents envoyés</h3>
                {localDocs.map(doc => (
                  <div key={doc.id} className="bg-white p-3 rounded-xl shadow-sm border border-slate-100 flex items-center gap-3">
                    <div className="h-12 w-12 bg-slate-50 rounded-lg flex items-center justify-center flex-shrink-0 border border-slate-100 overflow-hidden">
                      {doc.type.startsWith('image/') ? (
                        <img src={doc.dataUrl} alt={doc.name} className="h-full w-full object-cover" />
                      ) : (
                        <FileText className="h-5 w-5 text-slate-400" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-slate-900 truncate">{doc.name}</p>
                      <p className="text-xs text-slate-500">
                        {new Date(doc.date).toLocaleDateString('fr-FR')} • {doc.type.startsWith('image/') ? 'Image' : 'Document'}
                      </p>
                    </div>
                    <button 
                      onClick={() => handleDeleteDoc(doc.id)}
                      className="p-2 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-full transition-colors"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                ))}
              </div>
            ) : null}

            
            {exercises.length > 0 && (
              <div className="space-y-3 mt-8">
                <h3 className="text-sm font-bold text-slate-900 mb-2 px-1 flex items-center gap-2">
                  <Play className="h-4 w-4 text-mint-500" /> Programme d'exercices vidéo
                </h3>
                <div className="space-y-4">
                  {exercises.map(ex => (
                    <div key={ex.id} className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
                      <div className="aspect-video bg-slate-900">
                        
                        {ex.url.startsWith('data:video') ? (
                          <video src={ex.url} controls className="w-full h-full object-cover"></video>
                        ) : (
                          <iframe 
                            src={ex.url} 
                            className="w-full h-full border-0"
                            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" 
                            allowFullScreen
                          ></iframe>
                        )}

                      </div>
                      <div className="p-4">
                        <h4 className="font-bold text-slate-900">{ex.title}</h4>
                        <p className="text-xs text-slate-500 mt-1">Ajouté le {new Date(ex.date).toLocaleDateString('fr-FR')}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
<div className="bg-white border border-slate-200 rounded-2xl p-6 text-center shadow-sm mt-4">
              <div className="h-12 w-12 bg-mint-50 rounded-full flex items-center justify-center mx-auto mb-3">
                <FileText className="h-6 w-6 text-mint-500" />
              </div>
              <h3 className="text-lg font-bold text-slate-900 mb-2">Prescriptions & Bilans</h3>
              <p className="text-sm text-slate-600 leading-relaxed mb-4">
                Prenez en photo vos ordonnances ou examens médicaux pour les partager avec votre thérapeute.
              </p>
            </div>
          </div>
        )}

        {activeTab === 'profil' && (
          <div className="space-y-4">
            <Card className="border-0 shadow-sm rounded-2xl overflow-hidden">
              <CardContent className="p-0">
                <div className="p-6 border-b border-slate-50 flex items-center gap-4 bg-white">
                  <div className="h-16 w-16 bg-gradient-to-br from-mint-400 to-mint-600 rounded-full flex items-center justify-center text-white text-xl font-bold shadow-inner">
                    {patient.prenom.charAt(0)}{patient.nom.charAt(0)}
                  </div>
                  <div>
                    <h2 className="text-xl font-bold text-slate-900">{patient.prenom} {patient.nom}</h2>
                    <p className="text-sm text-slate-500">{patient.email}</p>
                  </div>
                </div>
                
                <div className="p-6 bg-white space-y-4">
                  <div>
                    <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Coordonnées</h3>
                    <p className="text-sm text-slate-800 flex items-center gap-2 mb-1">
                      <Phone className="h-4 w-4 text-slate-400" /> {patient.telephone || 'Non renseigné'}
                    </p>
                    <p className="text-sm text-slate-800 flex items-center gap-2">
                      <User className="h-4 w-4 text-slate-400" /> {patient.adresse || 'Adresse non renseignée'}
                    </p>
                  </div>
                  <hr className="border-slate-50" />
                  <div>
                    <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Dossier Médical</h3>
                    <p className="text-sm text-slate-800 mb-1">
                      <span className="font-medium text-slate-600">Pathologie :</span> {patient.pathologie || 'Non renseignée'}
                    </p>
                    <p className="text-sm text-slate-800">
                      <span className="font-medium text-slate-600">Antécédents :</span> {patient.notes_antecedents || 'Aucun antécédent particulier'}
                    </p>
                  </div>
                </div>
                <div className="p-4 bg-slate-50 border-t border-slate-100 flex gap-2">
                  <Button onClick={() => setIsProfileModalOpen(true)} variant="outline" className="flex-1 bg-white">
                    <Settings className="h-4 w-4 mr-2" />
                    Modifier mes infos
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>
        )}

      </div>

      {/* Floating Contact Buttons (visible on all tabs) */}
      <div className="fixed bottom-6 right-6 flex flex-col gap-3 z-30">
        <a 
          href={`https://wa.me/212678646401`} 
          target="_blank" 
          rel="noopener noreferrer"
          className="h-12 w-12 bg-green-500 hover:bg-green-600 text-white rounded-full flex items-center justify-center shadow-lg transition-transform hover:scale-110"
          title="Nous contacter sur WhatsApp"
        >
          <MessageCircle className="h-6 w-6" />
        </a>
        <a 
          href="tel:+212678646401"
          className="h-12 w-12 bg-slate-800 hover:bg-slate-900 text-white rounded-full flex items-center justify-center shadow-lg transition-transform hover:scale-110"
          title="Appeler le centre"
        >
          <Phone className="h-5 w-5" />
        </a>
      </div>

      {/* Modals */}
      
      {/* Appointment Request Modal */}
      <Modal isOpen={isApptModalOpen} onClose={() => setIsApptModalOpen(false)} title="Demander un rendez-vous">
        <form onSubmit={handleRequestAppointment} className="space-y-4">
          {apptMessage.text && (
            <div className={`p-3 rounded-lg text-sm ${apptMessage.type === 'success' ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
              {apptMessage.text}
            </div>
          )}
          
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <label className="text-sm font-medium text-slate-700">Date souhaitée</label>
              <input
                type="date"
                required
                min={new Date().toISOString().split('T')[0]}
                value={apptDate}
                onChange={(e) => setApptDate(e.target.value)}
                className="w-full p-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-mint-500 focus:border-mint-500"
              />
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium text-slate-700">Heure souhaitée</label>
              <input
                type="time"
                required
                value={apptTime}
                onChange={(e) => setApptTime(e.target.value)}
                className="w-full p-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-mint-500 focus:border-mint-500"
              />
            </div>
          </div>

          <div className="space-y-1">
            <label className="text-sm font-medium text-slate-700">Motif de la consultation (optionnel)</label>
            <textarea
              value={apptMotif}
              onChange={(e) => setApptMotif(e.target.value)}
              placeholder="Ex: Douleur au dos, suivi..."
              className="w-full p-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-mint-500 focus:border-mint-500 h-24 resize-none"
            />
          </div>

          <div className="pt-4 flex justify-end gap-3">
            <Button type="button" variant="outline" onClick={() => setIsApptModalOpen(false)}>Annuler</Button>
            <Button type="submit" disabled={apptLoading} className="bg-mint-600 hover:bg-mint-700 text-white">
              {apptLoading ? 'Envoi...' : 'Envoyer la demande'}
            </Button>
          </div>
        </form>
      </Modal>

      {/* Edit Profile Modal */}
      <Modal isOpen={isProfileModalOpen} onClose={() => setIsProfileModalOpen(false)} title="Modifier mon profil">
        <form onSubmit={handleUpdateProfile} className="space-y-4">
          {profileMessage.text && (
            <div className={`p-3 rounded-lg text-sm ${profileMessage.type === 'success' ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
              {profileMessage.text}
            </div>
          )}
          
          <div className="space-y-3">
            <div>
              <label className="text-sm font-medium text-slate-700">Téléphone</label>
              <input
                type="tel"
                value={profileForm.telephone}
                onChange={(e) => setProfileForm({...profileForm, telephone: e.target.value})}
                className="w-full p-2 mt-1 border border-slate-200 rounded-lg"
              />
            </div>
            <div>
              <label className="text-sm font-medium text-slate-700">Adresse e-mail</label>
              <input
                type="email"
                value={profileForm.email}
                onChange={(e) => setProfileForm({...profileForm, email: e.target.value})}
                className="w-full p-2 mt-1 border border-slate-200 rounded-lg"
              />
            </div>
            <div>
              <label className="text-sm font-medium text-slate-700">Adresse postale</label>
              <input
                type="text"
                value={profileForm.adresse}
                onChange={(e) => setProfileForm({...profileForm, adresse: e.target.value})}
                className="w-full p-2 mt-1 border border-slate-200 rounded-lg"
              />
            </div>
            <hr className="my-2 border-slate-100" />
            <div>
              <label className="text-sm font-medium text-slate-700">Ma Pathologie principale</label>
              <input
                type="text"
                value={profileForm.pathologie}
                onChange={(e) => setProfileForm({...profileForm, pathologie: e.target.value})}
                placeholder="Ex: Lombalgie chronique"
                className="w-full p-2 mt-1 border border-slate-200 rounded-lg"
              />
            </div>
            <div>
              <label className="text-sm font-medium text-slate-700">Antécédents & Remarques médicales</label>
              <textarea
                value={profileForm.notes_antecedents}
                onChange={(e) => setProfileForm({...profileForm, notes_antecedents: e.target.value})}
                placeholder="Allergies, opérations précédentes..."
                className="w-full p-2 mt-1 border border-slate-200 rounded-lg h-24 resize-none"
              />
            </div>
          </div>

          <div className="pt-4 flex justify-end gap-3">
            <Button type="button" variant="outline" onClick={() => setIsProfileModalOpen(false)}>Annuler</Button>
            <Button type="submit" disabled={profileLoading} className="bg-mint-600 hover:bg-mint-700 text-white">
              {profileLoading ? 'Enregistrement...' : 'Enregistrer'}
            </Button>
          </div>
        </form>
      </Modal>

      {/* Password Change Modal */}
      <Modal isOpen={isPasswordModalOpen} onClose={() => setIsPasswordModalOpen(false)} title="Changer mon mot de passe">
        <form onSubmit={handleChangePassword} className="space-y-4">
          {passwordMessage.text && (
            <div className={`p-3 rounded-lg text-sm ${passwordMessage.type === 'success' ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
              {passwordMessage.text}
            </div>
          )}
          
          <div className="space-y-2">
            <label className="text-sm font-medium text-slate-700">Nouveau mot de passe</label>
            <input
              type="password"
              required
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              className="w-full p-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-mint-500 focus:border-mint-500"
              minLength={6}
            />
          </div>
          
          <div className="space-y-2">
            <label className="text-sm font-medium text-slate-700">Confirmer le mot de passe</label>
            <input
              type="password"
              required
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className="w-full p-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-mint-500 focus:border-mint-500"
              minLength={6}
            />
          </div>
          
          <div className="pt-4 flex justify-end gap-3">
            <Button type="button" variant="outline" onClick={() => setIsPasswordModalOpen(false)}>Annuler</Button>
            <Button type="submit" disabled={passwordLoading} className="bg-mint-600 hover:bg-mint-700 text-white">
              {passwordLoading ? 'Mise à jour...' : 'Enregistrer'}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
