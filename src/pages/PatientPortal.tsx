import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabaseClient';
import { LogOut, AlertCircle, Calendar, Clock, CheckCircle, CreditCard, Activity, User, Key } from 'lucide-react';
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

  // Password Change State
  const [isPasswordModalOpen, setIsPasswordModalOpen] = useState(false);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordLoading, setPasswordLoading] = useState(false);
  const [passwordMessage, setPasswordMessage] = useState({ type: '', text: '' });

  useEffect(() => {
    fetchPatientData();
  }, []);

  const fetchPatientData = async () => {
    setLoading(true);
    try {
      // Get current user session
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        window.location.hash = 'login';
        return;
      }

      const userEmail = session.user.email || '';
      let query = supabase.from('patients').select('*');

      if (userEmail.endsWith('@patient.reforme.center')) {
        // It's a phone number login
        const phone = userEmail.replace('@patient.reforme.center', '');
        // We need to match the phone number, ignoring spaces.
        // For simplicity, we'll fetch all and filter in JS if needed, or just try exact match first
        // Since we don't have a clean_phone column, we'll try exact match or ilike
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
      
      // Fetch appointments
      const { data: appts } = await supabase
        .from('appointments')
        .select('*')
        .eq('patient_id', patientData.id)
        .order('date_heure', { ascending: true });

      if (appts) setAppointments(appts);

      // Fetch billings
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
      const { error } = await supabase.auth.updateUser({
        password: newPassword
      });

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
  
  // Prochaine séance : Date dans le futur, non annulée
  const nextAppointment = appointments.find(a => new Date(a.date_heure) > now && a.statut !== 'Annulé');
  
  // Séances passées : Date dans le passé OU statut Effectué
  const pastAppointments = appointments
    .filter(a => new Date(a.date_heure) <= now || a.statut === 'Effectué')
    .sort((a, b) => new Date(b.date_heure).getTime() - new Date(a.date_heure).getTime());
  
  // Séances impayées : Séances passées avec statut Confirmé (donc pas encore Effectué/Payé)
  const unpaidAppointments = pastAppointments.filter(a => a.statut === 'Confirmé');

  return (
    <div className="min-h-screen bg-slate-50 pb-10 font-sans">
      {/* Header Mobile-First */}
      <div className="bg-white px-5 py-4 shadow-sm sticky top-0 z-10 flex justify-between items-center border-b border-slate-100">
        <div>
          <h1 className="text-lg font-bold text-slate-900 tracking-tight">
            <span className="text-mint-500">Re</span>Forme Center
          </h1>
          <p className="text-sm text-slate-500 font-medium mt-0.5">Bonjour, {patient.prenom}</p>
        </div>
        <div className="flex items-center gap-2">
          <button 
            onClick={() => setIsPasswordModalOpen(true)} 
            className="p-2.5 text-slate-400 hover:text-mint-600 bg-slate-50 hover:bg-mint-50 rounded-full transition-colors"
            title="Changer le mot de passe"
          >
            <Key className="h-5 w-5" />
          </button>
          <button 
            onClick={handleLogout} 
            className="p-2.5 text-slate-400 hover:text-red-600 bg-slate-50 hover:bg-red-50 rounded-full transition-colors"
            title="Se déconnecter"
          >
            <LogOut className="h-5 w-5" />
          </button>
        </div>
      </div>

      <div className="max-w-md mx-auto p-4 space-y-6 mt-2">
        
        {/* Section Notifications Prioritaires (Alertes) */}
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
                <p className="text-xs text-blue-600/80 mt-1.5 flex items-center gap-1">
                  <User className="h-3 w-3" /> Dr. Dupont
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
                  <div key={app.id} className="p-4 flex items-center justify-between hover:bg-slate-50 transition-colors">
                    <div>
                      <p className="text-sm font-semibold text-slate-900">
                        {new Date(app.date_heure).toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' })} à {new Date(app.date_heure).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
                      </p>
                      <p className="text-xs text-slate-500 mt-1 flex items-center gap-1">
                        <Activity className="h-3 w-3" /> {app.notes_seance || 'Séance de suivi'}
                      </p>
                    </div>
                    {isPaid ? (
                      <div className="flex flex-col items-end gap-1">
                        <div className="flex items-center gap-1.5 text-mint-700 bg-mint-50 px-3 py-1.5 rounded-full text-xs font-bold border border-mint-100">
                          <CheckCircle className="h-3.5 w-3.5" /> Réglé
                        </div>
                        {billing && (
                          <span className="text-xs font-medium text-slate-500 pr-1">{billing.montant} €</span>
                        )}
                      </div>
                    ) : (
                      <div className="flex items-center gap-1.5 text-orange-700 bg-orange-50 px-3 py-1.5 rounded-full text-xs font-bold border border-orange-100">
                        <Clock className="h-3.5 w-3.5" /> En attente
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </section>

        {/* Historique des Séances */}
        <section>
          <h2 className="text-lg font-bold text-slate-900 mb-3 flex items-center gap-2 px-1">
            <Activity className="h-5 w-5 text-primary-500" />
            Historique des Soins
          </h2>
          <div className="space-y-3">
            {pastAppointments.filter(a => a.statut === 'Effectué').length === 0 ? (
              <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 text-center text-sm text-slate-500">
                Aucune séance terminée.
              </div>
            ) : (
              pastAppointments.filter(a => a.statut === 'Effectué').map(app => (
                <div key={app.id} className="bg-white p-4 rounded-2xl shadow-sm border border-slate-100 hover:border-primary-100 transition-colors">
                  <div className="flex justify-between items-start mb-3">
                    <h3 className="font-semibold text-slate-900 text-sm">{app.notes_seance || 'Séance de kinésithérapie'}</h3>
                  </div>
                  <div className="flex items-center gap-4 text-xs font-medium text-slate-500">
                    <span className="flex items-center gap-1.5 bg-slate-50 px-2 py-1 rounded-md">
                      <Calendar className="h-3.5 w-3.5 text-slate-400" />
                      {new Date(app.date_heure).toLocaleDateString('fr-FR')} à {new Date(app.date_heure).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
                    </span>
                    <span className="flex items-center gap-1.5 bg-slate-50 px-2 py-1 rounded-md">
                      <User className="h-3.5 w-3.5 text-slate-400" />
                      Dr. Dupont
                    </span>
                  </div>
                </div>
              ))
            )}
          </div>
        </section>

        {/* Section Avis */}
        <div className="pt-4">
          <ReviewSection patientName={`${patient.prenom} ${patient.nom}`} />
        </div>

      </div>

      {/* Password Change Modal */}
      <Modal
        isOpen={isPasswordModalOpen}
        onClose={() => setIsPasswordModalOpen(false)}
        title="Changer mon mot de passe"
      >
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
            <Button type="button" variant="outline" onClick={() => setIsPasswordModalOpen(false)}>
              Annuler
            </Button>
            <Button type="submit" disabled={passwordLoading} className="bg-mint-600 hover:bg-mint-700 text-white">
              {passwordLoading ? 'Mise à jour...' : 'Enregistrer'}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
