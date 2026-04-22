import React, { useState, useEffect, useRef } from 'react';
import { supabase } from '../lib/supabaseClient';
import { Shield, Users, UserPlus, Mail, Lock, AlertCircle, AlertTriangle, CheckCircle, Activity, Save, CheckSquare, Square, Stethoscope, Plus, Trash2, Database, Upload, Phone } from 'lucide-react';
import Papa from 'papaparse';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';

const PERMISSIONS_LIST = [
  { id: 'agenda', label: 'Agenda' },
  { id: 'patients', label: 'Dossiers Patients' },
  { id: 'finance_stats', label: 'Finance (Statistiques & CA)' },
  { id: 'finance_recettes', label: 'Finance (Recettes)' },
  { id: 'finance_depenses_view', label: 'Finance (Dépenses - Lecture seule)' },
  { id: 'finance_depenses_edit', label: 'Finance (Dépenses - Modification)' },
  { id: 'settings', label: 'Paramètres du cabinet' }
];

export function Settings() {
  const [activeTab, setActiveTab] = useState('equipe');
  const [profiles, setProfiles] = useState<any[]>([]);
  const [therapists, setTherapists] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // Form state for collaborators
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState('therapeute');
  const [createLoading, setCreateLoading] = useState(false);
  const [message, setMessage] = useState({ type: '', text: '' });

  // Form state for practitioners
  const [newTherapist, setNewTherapist] = useState({ nom: '', prenom: '', specialite: '', email: '', tel: '' });
  const [therapistLoading, setTherapistLoading] = useState(false);
  const [therapistMessage, setTherapistMessage] = useState({ type: '', text: '' });

  // Form state for import
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [importType, setImportType] = useState('appointments');
  const [importLoading, setImportLoading] = useState(false);
  const [importMessage, setImportMessage] = useState({ type: '', text: '' });
  
  // Dedup state
  const [dedupLoading, setDedupLoading] = useState(false);
  const [dedupMessage, setDedupMessage] = useState({ type: '', text: '' });

  useEffect(() => {
    fetchProfiles();
    fetchTherapists();
  }, []);

  const fetchProfiles = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .neq('role', 'patient')
      .order('created_at', { ascending: false });

    if (data) {
      // Ensure permissions is an array
      const formattedData = data.map(p => ({
        ...p,
        permissions: p.permissions || []
      }));
      setProfiles(formattedData);
    }
    setLoading(false);
  };

  const fetchTherapists = async () => {
    try {
      const { data, error } = await supabase
        .from('therapists')
        .select('*')
        .order('nom');
      
      if (error) {
        console.error("Error fetching therapists:", error);
        setTherapistMessage({ 
          type: 'error', 
          text: `Erreur de chargement des praticiens: ${error.message}. Vérifiez que la table 'therapists' existe dans Supabase.` 
        });
      }
      if (data) setTherapists(data);
    } catch (err: any) {
      console.error("Fetch therapists failed:", err);
    }
  };

  const handleAddTherapist = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // Validation
    if (!newTherapist.nom.trim() || !newTherapist.prenom.trim()) {
      setTherapistMessage({ type: 'error', text: 'Le nom et le prénom sont obligatoires.' });
      return;
    }

    setTherapistLoading(true);
    setTherapistMessage({ type: '', text: '' });
    
    try {
      // Trim values before insert
      const therapistToInsert = {
        nom: newTherapist.nom.trim(),
        prenom: newTherapist.prenom.trim(),
        specialite: newTherapist.specialite.trim(),
        email: newTherapist.email.trim(),
        tel: newTherapist.tel.trim()
      };

      const { error } = await supabase.from('therapists').insert([therapistToInsert]);
      
      if (!error) {
        setNewTherapist({ nom: '', prenom: '', specialite: '', email: '', tel: '' });
        await fetchTherapists();
        setTherapistMessage({ type: 'success', text: 'Praticien ajouté avec succès !' });
        setTimeout(() => setTherapistMessage({ type: '', text: '' }), 4000);
      } else {
        throw error;
      }
    } catch (err: any) {
      console.error("Error adding therapist:", err);
      // More detailed error for debugging
      const detailedError = err.details || err.message || JSON.stringify(err);
      setTherapistMessage({ 
        type: 'error', 
        text: `Échec de l'ajout: ${detailedError}. Vérifiez vos permissions RLS sur la table 'therapists'.` 
      });
    } finally {
      setTherapistLoading(false);
    }
  };

  const handleDeleteTherapist = async (id: string) => {
    if (confirm("Voulez-vous vraiment supprimer ce praticien ?")) {
      const { error } = await supabase.from('therapists').delete().eq('id', id);
      if (!error) fetchTherapists();
    }
  };

  const handleUpdateRole = async (id: string, newRole: string) => {
    const { error } = await supabase
      .from('profiles')
      .update({ role: newRole })
      .eq('id', id);

    if (!error) {
      fetchProfiles(); // Refresh list
    } else {
      alert("Erreur lors de la mise à jour du rôle.");
    }
  };

  const handleTogglePermission = async (profileId: string, permissionId: string, currentPermissions: string[]) => {
    const newPermissions = currentPermissions.includes(permissionId)
      ? currentPermissions.filter(p => p !== permissionId)
      : [...currentPermissions, permissionId];

    // Optimistic update
    setProfiles(profiles.map(p => p.id === profileId ? { ...p, permissions: newPermissions } : p));

    const { error } = await supabase
      .from('profiles')
      .update({ permissions: newPermissions })
      .eq('id', profileId);

    if (error) {
      console.error(error);
      alert("Erreur lors de la mise à jour des permissions. Assurez-vous d'avoir exécuté le script SQL pour ajouter la colonne 'permissions' (JSONB) à la table 'profiles'.");
      fetchProfiles(); // Revert on error
    }
  };

  const handleImportCSV = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setImportLoading(true);
    setImportMessage({ type: '', text: '' });

    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: async (results) => {
        try {
          // 1. Fetch existing patients to match
          const { data: existingPatients, error: pError } = await supabase.from('patients').select('id, nom, prenom');
          if (pError) throw pError;

          const rows = results.data as any[];
          const newAppointments = [];
          const billingsMap: { [key: string]: any } = {}; // To store billing info linked to appointment index
          let errorCount = 0;

          // Instead of looping blindly, we'll index our appointments so we can attach billings map to them
          let currentAppIndex = 0;

          for (const row of rows) {
            // Find patient columns
            const findVal = (keys: string[]) => {
              const key = Object.keys(row).find(k => keys.includes(k.toLowerCase().trim()));
              return key ? row[key] : null;
            };

            const nomPatient = findVal(['nom patient', 'nom', 'patient nom', 'last name'])?.trim();
            const prenomPatient = findVal(['prenom patient', 'prénom patient', 'prenom', 'prénom', 'first name'])?.trim();
            const dateSeance = findVal(['date', 'date seance', 'date de séance', 'appointment date']);
            const heureSeance = findVal(['heure', 'time', 'heure seance', 'appointment time']) || '08:00'; // Default time if missing
            const motif = findVal(['motif', 'notes', 'notes seance', 'description', 'raison']) || 'Séance de suivi';
            const statut = findVal(['statut', 'status', 'état']) || 'Effectué'; // Automatically mark past imports as completed if appropriate, but keeping what's read

            // Billings
            const montantStr = findVal(['montant', 'prix', 'tarif', 'price', 'amount', 'règlement', 'reglement']);
            const typePaiementStr = findVal(['type paiement', 'methode paiement', 'moyen de paiement', 'type de règlement', 'type de reglement']);
            const statutPaiementStr = findVal(['statut paiement', 'etat paiement', 'payment status', 'statut règlement']);

            if (!nomPatient || !dateSeance) {
              errorCount++;
              continue;
            }

            // Find matching patient
            const patient = existingPatients.find(p => 
              p.nom.toLowerCase() === nomPatient.toLowerCase() && 
              p.prenom.toLowerCase() === prenomPatient?.toLowerCase()
            );

            if (!patient) {
              errorCount++;
              continue;
            }

            // Parse Date
            let isoDate = null;
            try {
              let datePart = dateSeance;
              if (dateSeance.includes('/')) {
                const parts = dateSeance.split('/');
                if (parts.length === 3) {
                  datePart = `${parts[2]}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`;
                }
              }
              const dateTimeString = `${datePart}T${heureSeance.padStart(5, '0')}:00`;
              isoDate = new Date(dateTimeString).toISOString();
            } catch (e) {
              errorCount++;
              continue;
            }

            let finalStatut = 'Effectué';
            const sLow = statut.toLowerCase();
            if (sLow.includes('annul') || sLow.includes('cancel')) finalStatut = 'Annulé';
            if (sLow.includes('confirm')) finalStatut = 'Confirmé';
            if (sLow.includes('impay') || sLow.includes('non pay')) finalStatut = 'Impayé';

            newAppointments.push({
              patient_id: patient.id,
              date_heure: isoDate,
              duree: 30, // Default duration
              notes_seance: motif,
              statut: finalStatut
            });

            // Extract billing if available
            if (montantStr) {
              const montantNum = parseFloat(montantStr.toString().replace(',', '.').replace(/[^0-9.-]+/g, ''));
              if (!isNaN(montantNum)) {
                let finalTypePaiement = 'Patient';
                if (typePaiementStr) {
                  const tpLow = typePaiementStr.toString().toLowerCase();
                  if (tpLow.includes('tiers') || tpLow.includes('payant')) finalTypePaiement = 'Tiers-payant';
                  if (tpLow.includes('hors') || tpLow.includes('nomenclature')) finalTypePaiement = 'Hors nomenclature';
                  if (tpLow.includes('mutuelle')) finalTypePaiement = 'Mutuelle';
                }

                let finalStatutPaiement = 'En attente';
                if (statutPaiementStr) {
                  const spLow = statutPaiementStr.toString().toLowerCase();
                  if (spLow.includes('payé') || spLow.includes('reglé') || spLow.includes('réglé')) finalStatutPaiement = 'Payé';
                  if (spLow.includes('rejet')) finalStatutPaiement = 'Rejeté';
                } else {
                   // Si pas de statut défini mais on a un montant et un type, on peut par defaut considerer payé pour l'historique
                   finalStatutPaiement = 'Payé';
                }
                
                billingsMap[currentAppIndex] = {
                  patient_id: patient.id,
                  montant: montantNum,
                  type_paiement: finalTypePaiement,
                  statut: finalStatutPaiement,
                  date_facturation: isoDate
                };
              }
            }

            currentAppIndex++;
          }

          if (newAppointments.length === 0) {
            throw new Error(`Aucune séance valide trouvée. ${errorCount} lignes ignorées (patient non trouvé ou format date invalide).`);
          }

          // Insert appointments AND get their IDs back 
          const { data: insertedApps, error: insertError } = await supabase.from('appointments').insert(newAppointments).select('id');
          if (insertError) throw insertError;

          // Prepare billings mapping
          let totalBillings = 0;
          if (insertedApps && insertedApps.length > 0) {
            const billingsToInsert = [];
            for (let i = 0; i < insertedApps.length; i++) {
              if (billingsMap[i]) {
                billingsToInsert.push({
                   ...billingsMap[i],
                   appointment_id: insertedApps[i].id
                });
              }
            }

            if (billingsToInsert.length > 0) {
              const { error: billError } = await supabase.from('billings').insert(billingsToInsert);
              if (billError) {
                console.error("Erreur import paiements:", billError);
              } else {
                totalBillings = billingsToInsert.length;
              }
            }
          }

          setImportMessage({ type: 'success', text: `${newAppointments.length} séances importées avec succès (et ${totalBillings} règlements) ! ${errorCount > 0 ? `(${errorCount} ignorées).` : ''}` });

        } catch (err: any) {
          setImportMessage({ type: 'error', text: err.message || 'Erreur lors de l\'import.' });
        } finally {
          setImportLoading(false);
          if (fileInputRef.current) fileInputRef.current.value = '';
        }
      },
      error: (error) => {
        setImportMessage({ type: 'error', text: "Erreur de lecture du fichier CSV : " + error.message });
        setImportLoading(false);
        if (fileInputRef.current) fileInputRef.current.value = '';
      }
    });
  };

  const handleRemoveDuplicates = async () => {
    setDedupLoading(true);
    setDedupMessage({ type: '', text: '' });
    try {
      // Fetch all appointments
      const { data, error } = await supabase
        .from('appointments')
        .select('id, patient_id, date_heure, created_at')
        .order('created_at', { ascending: true }); // Keep the oldest one

      if (error) throw error;

      if (!data || data.length === 0) {
        setDedupMessage({ type: 'success', text: 'Aucune séance trouvée.' });
        return;
      }

      const seen = new Set();
      const toDelete: string[] = [];

      for (const app of data) {
        // composite key to identify a duplicate: same patient, same exact date and time
        const key = `${app.patient_id}_${app.date_heure}`;
        if (seen.has(key)) {
          toDelete.push(app.id);
        } else {
          seen.add(key);
        }
      }

      if (toDelete.length === 0) {
        setDedupMessage({ type: 'success', text: 'Aucun doublon trouvé. Votre base est saine !' });
        return;
      }

      // Delete in batches of max 100 just in case
      let deletedCount = 0;
      const batchSize = 100;
      for (let i = 0; i < toDelete.length; i += batchSize) {
        const batch = toDelete.slice(i, i + batchSize);
        const { error: delError } = await supabase
          .from('appointments')
          .delete()
          .in('id', batch);
        if (delError) throw delError;
        deletedCount += batch.length;
      }

      setDedupMessage({ type: 'success', text: `${deletedCount} séance(s) en doublon supprimée(s) avec succès !` });
    } catch (e: any) {
      setDedupMessage({ type: 'error', text: e.message || 'Erreur lors du nettoyage.' });
    } finally {
      setDedupLoading(false);
    }
  };

  const handleCreateAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreateLoading(true);
    setMessage({ type: '', text: '' });

    try {
      // 1. Create auth user
      const { data: authData, error: authError } = await supabase.auth.signUp({
        email,
        password,
      });

      if (authError) throw authError;

      if (authData.user) {
        // Default permissions based on role
        let defaultPermissions: string[] = [];
        if (role === 'admin') {
          defaultPermissions = PERMISSIONS_LIST.map(p => p.id);
        } else if (role === 'secretaire') {
          defaultPermissions = ['agenda', 'patients', 'finance_recettes', 'finance_depenses_edit'];
        } else if (role === 'therapeute') {
          defaultPermissions = ['agenda', 'patients'];
        }

        // 2. Create profile with role and permissions
        const { error: profileError } = await supabase
          .from('profiles')
          .upsert([
            { id: authData.user.id, role: role, permissions: defaultPermissions }
          ]);

        if (profileError) throw profileError;

        setMessage({ type: 'success', text: 'Compte collaborateur créé avec succès !' });
        setEmail('');
        setPassword('');
        fetchProfiles();
      }
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message || 'Erreur lors de la création du compte.' });
    } finally {
      setCreateLoading(false);
    }
  };

  return (
    <div className="p-8 max-w-6xl mx-auto font-sans">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Paramètres du cabinet</h1>
        <p className="text-slate-500 mt-1">Gérez votre équipe, les rôles et les permissions d'accès à l'application.</p>
      </div>

      <div className="flex flex-col md:flex-row gap-8">
        {/* Sidebar Settings */}
        <div className="w-full md:w-64 flex-shrink-0 space-y-2">
          <button
            onClick={() => setActiveTab('equipe')}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-semibold transition-colors ${
              activeTab === 'equipe'
                ? 'bg-primary-50 text-primary-700'
                : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
            }`}
          >
            <Users className={`h-5 w-5 ${activeTab === 'equipe' ? 'text-primary-600' : 'text-slate-400'}`} />
            Gestion de l'équipe
          </button>
          <button
            onClick={() => setActiveTab('praticiens')}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-semibold transition-colors ${
              activeTab === 'praticiens'
                ? 'bg-primary-50 text-primary-700'
                : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
            }`}
          >
            <Stethoscope className={`h-5 w-5 ${activeTab === 'praticiens' ? 'text-primary-600' : 'text-slate-400'}`} />
            Gestion des praticiens
          </button>
          <button
            onClick={() => setActiveTab('create')}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-semibold transition-colors ${
              activeTab === 'create'
                ? 'bg-primary-50 text-primary-700'
                : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
            }`}
          >
            <UserPlus className={`h-5 w-5 ${activeTab === 'create' ? 'text-primary-600' : 'text-slate-400'}`} />
            Nouveau collaborateur
          </button>
          <button
            onClick={() => setActiveTab('import')}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-semibold transition-colors ${
              activeTab === 'import'
                ? 'bg-primary-50 text-primary-700'
                : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
            }`}
          >
            <Database className={`h-5 w-5 ${activeTab === 'import' ? 'text-primary-600' : 'text-slate-400'}`} />
            Import CSV
          </button>
        </div>

        {/* Content Area */}
        <div className="flex-1">
          {activeTab === 'equipe' && (
            <Card className="border-0 shadow-sm rounded-2xl overflow-hidden">
              <CardHeader className="bg-white border-b border-slate-100 pb-6">
                <CardTitle className="text-lg flex items-center gap-2">
                  <Shield className="h-5 w-5 text-primary-500" />
                  Répartition des rôles et permissions
                </CardTitle>
                <p className="text-sm text-slate-500 mt-1.5">
                  Cochez les modules auxquels chaque collaborateur a accès.
                </p>
              </CardHeader>
              <CardContent className="p-0">
                {loading ? (
                  <div className="p-8 flex justify-center">
                    <Activity className="h-8 w-8 text-primary-500 animate-pulse" />
                  </div>
                ) : (
                  <div className="divide-y divide-slate-100">
                    {profiles.length === 0 ? (
                      <div className="p-8 text-center text-slate-500">Aucun collaborateur trouvé.</div>
                    ) : (
                      profiles.map((profile) => (
                        <div key={profile.id} className="p-6 flex flex-col gap-4 hover:bg-slate-50 transition-colors">
                          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                            <div>
                              <div className="flex items-center gap-2 mb-1">
                                <span className="font-mono text-xs text-slate-400 bg-slate-100 px-2 py-1 rounded-md">
                                  ID: {profile.id.substring(0, 8)}...
                                </span>
                                {profile.role === 'admin' && (
                                  <span className="bg-purple-100 text-purple-700 text-xs font-bold px-2 py-0.5 rounded-full">Admin</span>
                                )}
                              </div>
                              <p className="text-sm text-slate-600">
                                Inscrit le {new Date(profile.created_at).toLocaleDateString('fr-FR')}
                              </p>
                            </div>
                            
                            <div className="flex items-center gap-3">
                              <select
                                value={profile.role}
                                onChange={(e) => handleUpdateRole(profile.id, e.target.value)}
                                className="text-sm border border-slate-200 rounded-lg px-3 py-2 bg-white focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 outline-none"
                              >
                                <option value="admin">Administrateur</option>
                                <option value="therapeute">Thérapeute</option>
                                <option value="secretaire">Secrétaire</option>
                              </select>
                            </div>
                          </div>

                          {/* Permissions Checklist */}
                          <div className="mt-2 pt-4 border-t border-slate-100">
                            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">Permissions d'accès</p>
                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                              {PERMISSIONS_LIST.map(perm => {
                                const hasPermission = profile.permissions?.includes(perm.id);
                                return (
                                  <button
                                    key={perm.id}
                                    onClick={() => handleTogglePermission(profile.id, perm.id, profile.permissions || [])}
                                    className={`flex items-center gap-2 p-2 rounded-lg border text-left transition-colors ${
                                      hasPermission 
                                        ? 'bg-primary-50 border-primary-200 text-primary-700' 
                                        : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                                    }`}
                                  >
                                    {hasPermission ? (
                                      <CheckSquare className="h-4 w-4 text-primary-600 flex-shrink-0" />
                                    ) : (
                                      <Square className="h-4 w-4 text-slate-400 flex-shrink-0" />
                                    )}
                                    <span className="text-sm font-medium">{perm.label}</span>
                                  </button>
                                );
                              })}
                            </div>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {activeTab === 'praticiens' && (
            <div className="space-y-6">
              <Card className="border-0 shadow-sm rounded-2xl overflow-hidden">
                <CardHeader className="bg-white border-b border-slate-100 pb-6">
                  <CardTitle className="text-lg flex items-center gap-2">
                    <Stethoscope className="h-5 w-5 text-primary-500" />
                    Ajouter un praticien
                  </CardTitle>
                  <p className="text-sm text-slate-500 mt-1.5">
                    Définissez les praticiens qui apparaîtront dans l'agenda et les dossiers patients.
                  </p>
                </CardHeader>
                <CardContent className="p-6">
                  <form onSubmit={handleAddTherapist} className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {therapistMessage.text && (
                      <div className={`sm:col-span-2 p-3 rounded-xl flex items-center gap-3 text-sm ${
                        therapistMessage.type === 'error' ? 'bg-rose-50 text-rose-700 border border-rose-100' : 'bg-emerald-50 text-emerald-700 border border-emerald-100'
                      }`}>
                        {therapistMessage.type === 'error' ? <AlertCircle className="h-4 w-4" /> : <CheckCircle className="h-4 w-4" />}
                        <span className="font-medium">{therapistMessage.text}</span>
                      </div>
                    )}
                    <div className="space-y-1.5">
                      <label className="text-sm font-semibold text-slate-700">Nom</label>
                      <input
                        type="text"
                        required
                        value={newTherapist.nom}
                        onChange={(e) => setNewTherapist({...newTherapist, nom: e.target.value})}
                        className="block w-full px-3 py-2 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 outline-none"
                        placeholder="Ex: HADDAOUI"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-sm font-semibold text-slate-700">Prénom</label>
                      <input
                        type="text"
                        required
                        value={newTherapist.prenom}
                        onChange={(e) => setNewTherapist({...newTherapist, prenom: e.target.value})}
                        className="block w-full px-3 py-2 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 outline-none"
                        placeholder="Ex: Younes"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-sm font-semibold text-slate-700">Spécialité</label>
                      <input
                        type="text"
                        value={newTherapist.specialite}
                        onChange={(e) => setNewTherapist({...newTherapist, specialite: e.target.value})}
                        className="block w-full px-3 py-2 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 outline-none"
                        placeholder="Ex: Kinésithérapeute du sport"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-sm font-semibold text-slate-700">Téléphone</label>
                      <input
                        type="tel"
                        value={newTherapist.tel}
                        onChange={(e) => setNewTherapist({...newTherapist, tel: e.target.value})}
                        className="block w-full px-3 py-2 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 outline-none"
                        placeholder="06..."
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-sm font-semibold text-slate-700">Email</label>
                      <input
                        type="email"
                        value={newTherapist.email}
                        onChange={(e) => setNewTherapist({...newTherapist, email: e.target.value})}
                        className="block w-full px-3 py-2 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 outline-none"
                        placeholder="email@exemple.com"
                      />
                    </div>
                    <div className="sm:col-span-2">
                      <Button type="submit" disabled={therapistLoading} className="w-full sm:w-auto">
                        <Plus className="h-4 w-4 mr-2" />
                        {therapistLoading ? 'Ajout...' : 'Ajouter le praticien'}
                      </Button>
                    </div>
                  </form>
                </CardContent>
              </Card>

              <Card className="border-0 shadow-sm rounded-2xl overflow-hidden">
                <CardHeader className="bg-white border-b border-slate-100 pb-6">
                  <CardTitle className="text-lg">Liste des praticiens</CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                  <div className="divide-y divide-slate-100">
                    {therapists.length === 0 ? (
                      <div className="p-8 text-center text-slate-500">Aucun praticien enregistré.</div>
                    ) : (
                      therapists.map((t) => (
                        <div key={t.id} className="p-4 flex items-center justify-between hover:bg-slate-50 transition-colors">
                          <div className="flex items-center gap-3">
                            <div className="h-10 w-10 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-700 font-bold">
                              {t.nom[0]}{t.prenom[0]}
                            </div>
                            <div>
                              <p className="font-semibold text-slate-900">{t.prenom} {t.nom}</p>
                              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500 mt-1">
                                <span className="bg-slate-100 px-2 py-0.5 rounded text-slate-600 border border-slate-200">{t.specialite || 'Généraliste'}</span>
                                {t.tel && <span className="flex items-center gap-1 font-medium"><Phone className="h-3 w-3" /> {t.tel}</span>}
                                {t.email && <span className="flex items-center gap-1 font-medium"><Mail className="h-3 w-3" /> {t.email}</span>}
                              </div>
                            </div>
                          </div>
                          <Button variant="ghost" size="icon" onClick={() => handleDeleteTherapist(t.id)} className="text-rose-500 hover:bg-rose-50 hover:text-rose-600">
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      ))
                    )}
                  </div>
                </CardContent>
              </Card>
            </div>
          )}

          {activeTab === 'create' && (
            <Card className="border-0 shadow-sm rounded-2xl overflow-hidden">
              <CardHeader className="bg-white border-b border-slate-100 pb-6">
                <CardTitle className="text-lg flex items-center gap-2">
                  <UserPlus className="h-5 w-5 text-primary-500" />
                  Créer un compte de connexion (Collaborateur)
                </CardTitle>
                <p className="text-sm text-slate-500 mt-1.5">
                  Ajoutez un membre qui pourra <b>se connecter</b> à l'application. 
                  <br/><span className="text-primary-600 font-medium italic">Important : Pour que son nom apparaisse dans l'agenda, ajoutez-le également dans l'onglet "Gestion des praticiens".</span>
                </p>
              </CardHeader>
              <CardContent className="p-6">
                <form onSubmit={handleCreateAccount} className="space-y-6 max-w-md">
                  {message.text && (
                    <div className={`p-4 rounded-xl flex items-start gap-3 text-sm ${
                      message.type === 'error' ? 'bg-red-50 text-red-700 border border-red-100' : 'bg-mint-50 text-mint-700 border border-mint-100'
                    }`}>
                      {message.type === 'error' ? <AlertCircle className="h-5 w-5 flex-shrink-0" /> : <CheckCircle className="h-5 w-5 flex-shrink-0" />}
                      <p className="font-medium mt-0.5">{message.text}</p>
                    </div>
                  )}

                  <div className="space-y-4">
                    <div className="space-y-1.5">
                      <label className="text-sm font-semibold text-slate-700">Adresse email</label>
                      <div className="relative">
                        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                          <Mail className="h-5 w-5 text-slate-400" />
                        </div>
                        <input
                          type="email"
                          required
                          value={email}
                          onChange={(e) => setEmail(e.target.value)}
                          className="block w-full pl-10 pr-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 transition-all bg-slate-50 focus:bg-white"
                          placeholder="email@cabinet.com"
                        />
                      </div>
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-sm font-semibold text-slate-700">Mot de passe provisoire</label>
                      <div className="relative">
                        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                          <Lock className="h-5 w-5 text-slate-400" />
                        </div>
                        <input
                          type="password"
                          required
                          minLength={6}
                          value={password}
                          onChange={(e) => setPassword(e.target.value)}
                          className="block w-full pl-10 pr-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 transition-all bg-slate-50 focus:bg-white"
                          placeholder="Minimum 6 caractères"
                        />
                      </div>
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-sm font-semibold text-slate-700">Rôle attribué</label>
                      <select
                        value={role}
                        onChange={(e) => setRole(e.target.value)}
                        className="block w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 transition-all bg-slate-50 focus:bg-white outline-none"
                      >
                        <option value="therapeute">Thérapeute</option>
                        <option value="secretaire">Secrétaire</option>
                        <option value="admin">Administrateur</option>
                      </select>
                    </div>
                  </div>

                  <Button 
                    type="submit" 
                    className="w-full h-11 text-base font-semibold" 
                    disabled={createLoading}
                  >
                    {createLoading ? 'Création en cours...' : 'Créer le compte'}
                  </Button>
                  
                  <p className="text-xs text-slate-500 text-center mt-4">
                    Note : Selon la configuration de votre projet Supabase, la création d'un compte peut nécessiter une validation par email.
                  </p>
                </form>
              </CardContent>
            </Card>
          )}

          {activeTab === 'import' && (
            <Card className="border-0 shadow-sm rounded-2xl overflow-hidden">
              <CardHeader className="bg-white border-b border-slate-100 pb-6">
                <CardTitle className="text-lg flex items-center gap-2">
                  <Database className="h-5 w-5 text-primary-500" />
                  Importation des données
                </CardTitle>
                <p className="text-sm text-slate-500 mt-1.5">
                  Récupérez vos historiques de séances depuis d'anciens logiciels via un fichier Excel/CSV.
                </p>
              </CardHeader>
              <CardContent className="p-6">
                <div className="space-y-6">
                  {importMessage.text && (
                    <div className={`p-4 rounded-xl flex items-start gap-3 text-sm ${
                      importMessage.type === 'success' ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-rose-50 text-rose-700 border border-rose-200'
                    }`}>
                      {importMessage.type === 'success' ? <CheckCircle className="h-5 w-5 mt-0.5 flex-shrink-0" /> : <AlertCircle className="h-5 w-5 mt-0.5 flex-shrink-0" />}
                      <p>{importMessage.text}</p>
                    </div>
                  )}

                  <div className="bg-slate-50 p-6 rounded-xl border border-slate-200">
                    <h3 className="font-semibold text-slate-800 mb-2">Import Historique des Séances (Agenda)</h3>
                    <p className="text-sm text-slate-600 mb-4 leading-relaxed">
                      Associez vos anciennes séances à vos patients actuels. Le fichier (format <b>.csv</b>) doit idéalement contenir les colonnes suivantes :
                      <br /><br />
                      <span className="font-mono bg-white px-2 py-1 rounded text-xs border border-slate-200 break-words mb-1 inline-block">Date</span>
                      <span className="font-mono bg-white px-2 py-1 rounded text-xs border border-slate-200 ml-2 mb-1 inline-block">Heure</span>
                      <span className="font-mono bg-white px-2 py-1 rounded text-xs border border-slate-200 ml-2 mb-1 inline-block">Nom patient</span>
                      <span className="font-mono bg-white px-2 py-1 rounded text-xs border border-slate-200 ml-2 mb-1 inline-block">Prénom patient</span>
                      <span className="font-mono bg-white px-2 py-1 rounded text-xs border border-slate-200 ml-2 mb-1 inline-block">Motif</span>
                      <span className="font-mono bg-white px-2 py-1 rounded text-xs border border-slate-200 ml-2 mb-1 inline-block">Statut</span>
                      <span className="font-mono bg-blue-50 px-2 py-1 rounded text-xs border border-blue-200 ml-2 mb-1 inline-block text-blue-700">Montant (ex: 50)</span>
                      <span className="font-mono bg-blue-50 px-2 py-1 rounded text-xs border border-blue-200 ml-2 mb-1 inline-block text-blue-700">Type de paiement</span>
                      <span className="font-mono bg-blue-50 px-2 py-1 rounded text-xs border border-blue-200 ml-2 mb-1 inline-block text-blue-700">Statut paiement</span>
                    </p>
                    <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 text-amber-800 p-3 flex-col sm:flex-row text-sm rounded-lg mb-6">
                      <AlertCircle className="h-4 w-4 mt-0.5 flex-shrink-0" />
                      <p>
                        <b>Attention :</b> Le patient <b>doit déjà exister</b> dans la base de données (onglet Patients) avec exactement la même orthographe pour nom et prénom. Autrement, la ligne sera ignorée.
                      </p>
                    </div>

                    <input 
                      type="file" 
                      ref={fileInputRef} 
                      onChange={handleImportCSV} 
                      accept=".csv" 
                      className="hidden" 
                    />
                    
                    <Button 
                      variant="outline"
                      disabled={importLoading}
                      onClick={() => fileInputRef.current?.click()}
                      className="bg-white hover:bg-slate-50 w-full sm:w-auto"
                    >
                      {importLoading ? (
                        <>Importation en cours...</>
                      ) : (
                        <>
                          <Upload className="h-4 w-4 mr-2" />
                          Sélectionner le fichier CSV des séances
                        </>
                      )}
                    </Button>
                  </div>

                  {/* Deduplication Section */}
                  <div className="bg-white border border-slate-200 p-6 rounded-xl mt-8">
                    <h3 className="font-semibold text-slate-800 mb-2 flex items-center gap-2">
                       <Trash2 className="h-5 w-5 text-rose-500" />
                       Nettoyer les doublons
                    </h3>
                    <p className="text-sm text-slate-600 mb-4">
                       Si des doublons ont été créés lors d'une importation précédente (même patient, même date, même heure), vous pouvez utiliser cet outil pour les supprimer automatiquement. 
                       <br/><b>Attention :</b> Cette action est irréversible. L'outil conservera la séance créée en premier.
                    </p>
                    
                    {dedupMessage.text && (
                      <div className={`p-3 rounded-xl flex items-start gap-2 mb-4 text-sm ${
                        dedupMessage.type === 'success' ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-rose-50 text-rose-700 border border-rose-200'
                      }`}>
                        {dedupMessage.type === 'success' ? <CheckCircle className="h-4 w-4 mt-0.5" /> : <AlertCircle className="h-4 w-4 mt-0.5" />}
                        <p>{dedupMessage.text}</p>
                      </div>
                    )}

                    <Button 
                      variant="outline" 
                      onClick={handleRemoveDuplicates} 
                      disabled={dedupLoading} 
                      className="text-rose-600 hover:text-rose-700 hover:bg-rose-50 border-rose-200 w-full sm:w-auto"
                    >
                       {dedupLoading ? 'Recherche et suppression...' : 'Rechercher et supprimer les doublons'}
                    </Button>
                  </div>

                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
