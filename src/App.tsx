import React, { useState, useEffect } from 'react';
import { Layout } from './components/layout/Layout';
import { Dashboard } from './pages/Dashboard';
import { Agenda } from './pages/Agenda';
import { Patients } from './pages/Patients';
import { PatientDetail } from './pages/PatientDetail';
import { PatientPortal } from './pages/PatientPortal';
import { LoginPage } from './pages/LoginPage';
import { Settings } from './pages/Settings';
import { Finance } from './pages/Finance';
import { ProtectedRoute } from './components/auth/ProtectedRoute';
import { AppointmentNotificationsProvider } from './contexts/AppointmentNotificationsContext';
import { supabase } from './lib/supabaseClient';
import { resolveOrBindCollaboratorSession, isPrimaryAdminEmail } from './lib/teamUtils';
import { isPatientSyntheticEmail } from './lib/patientAuthUtils';
import { Activity, Lock, Eye, EyeOff, CheckCircle, AlertCircle } from 'lucide-react';
import { Card, CardContent } from './components/ui/card';
import { Button } from './components/ui/button';

export default function App() {
  const [currentRoute, setCurrentRoute] = useState('login');
  const [isRecoveryMode, setIsRecoveryMode] = useState(() =>
    typeof window !== 'undefined' && window.location.hash.includes('type=recovery')
  );
  const [recoveryPassword, setRecoveryPassword] = useState('');
  const [recoveryConfirm, setRecoveryConfirm] = useState('');
  const [showRecoveryPassword, setShowRecoveryPassword] = useState(false);
  const [recoveryLoading, setRecoveryLoading] = useState(false);
  const [recoveryError, setRecoveryError] = useState('');
  const [recoverySuccess, setRecoverySuccess] = useState('');

  const [selectedPatientId, setSelectedPatientId] = useState<string | null>(() => {
    try {
      return localStorage.getItem('reforme_preview_patient_id');
    } catch {
      return null;
    }
  });

  const [returnRoute, setReturnRoute] = useState<string>(() => {
    try {
      return sessionStorage.getItem('reforme_patient_return_route') || 'patients';
    } catch {
      return 'patients';
    }
  });

  useEffect(() => {
    const handleHashChange = () => {
      const rawHash = window.location.hash.replace(/^#/, '');
      if (rawHash.includes('type=recovery')) {
        setIsRecoveryMode(true);
        return;
      }

      // Handle OAuth / magic-link callback hashes cleanly without routing to a broken hash string
      if (rawHash.startsWith('access_token=')) {
        supabase.auth.getSession().then(async ({ data: { session } }) => {
          if (!session?.user) {
            window.location.hash = 'login';
            return;
          }
          const userEmail = (session.user.email || '').toLowerCase();
          if (isPatientSyntheticEmail(userEmail)) {
            window.location.hash = 'espace-patient';
            return;
          }
          const prof = await resolveOrBindCollaboratorSession(supabase, {
            id: session.user.id,
            email: userEmail,
          });
          if (prof?.role === 'admin' || isPrimaryAdminEmail(userEmail)) {
            window.location.hash = 'dashboard';
          } else {
            window.location.hash = 'agenda';
          }
        });
        return;
      }

      const hash = rawHash || 'login';
      setCurrentRoute(hash);
      if (hash === 'patient-detail' && !selectedPatientId) {
        try {
          const savedId = localStorage.getItem('reforme_preview_patient_id');
          if (savedId) setSelectedPatientId(savedId);
        } catch {}
      }
    };

    const { data: authSub } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY') {
        setIsRecoveryMode(true);
      }
    });

    window.addEventListener('hashchange', handleHashChange);
    handleHashChange();

    return () => {
      window.removeEventListener('hashchange', handleHashChange);
      authSub.subscription.unsubscribe();
    };
  }, [selectedPatientId]);

  const handleSaveRecoveryPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setRecoveryError('');
    setRecoverySuccess('');

    const trimmed = recoveryPassword.trim();
    if (trimmed.length < 6) {
      setRecoveryError('Le nouveau mot de passe doit contenir au moins 6 caractères.');
      return;
    }
    if (trimmed !== recoveryConfirm.trim()) {
      setRecoveryError('Les deux mots de passe ne correspondent pas.');
      return;
    }

    setRecoveryLoading(true);
    try {
      const { data, error } = await supabase.auth.updateUser({ password: trimmed });
      if (error) throw error;

      const updatedUser = data.user;
      let targetHash = 'dashboard';

      if (updatedUser) {
        const userEmail = (updatedUser.email || '').toLowerCase();
        if (isPatientSyntheticEmail(userEmail)) {
          targetHash = 'espace-patient';
        } else {
          const prof = await resolveOrBindCollaboratorSession(supabase, {
            id: updatedUser.id,
            email: userEmail,
          });
          targetHash =
            prof?.role === 'admin' || isPrimaryAdminEmail(userEmail) ? 'dashboard' : 'agenda';
        }
      }

      setRecoverySuccess('Votre mot de passe a été mis à jour avec succès ! Redirection...');
      setTimeout(() => {
        setIsRecoveryMode(false);
        setRecoveryPassword('');
        setRecoveryConfirm('');
        setRecoverySuccess('');
        window.location.hash = targetHash;
      }, 1200);
    } catch (err: any) {
      setRecoveryError(err.message || 'Impossible de mettre à jour le mot de passe.');
    } finally {
      setRecoveryLoading(false);
    }
  };

  const handleSelectPatient = (id: string, fromRoute?: string) => {
    if (!id) return;
    const origin = fromRoute || (currentRoute && currentRoute !== 'patient-detail' ? currentRoute : 'patients');
    setReturnRoute(origin);
    setSelectedPatientId(id);
    try {
      sessionStorage.setItem('reforme_patient_return_route', origin);
      localStorage.setItem('reforme_preview_patient_id', id);
    } catch {}
    window.location.hash = 'patient-detail';
  };

  if (isRecoveryMode) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col justify-center items-center p-4 font-sans">
        <div className="w-full max-w-md">
          <div className="text-center mb-8">
            <div className="inline-flex items-center justify-center h-16 w-16 rounded-full bg-mint-100 text-mint-600 mb-4 shadow-sm">
              <Activity className="h-8 w-8" />
            </div>
            <h1 className="text-3xl font-bold text-slate-900 tracking-tight">
              <span className="text-mint-500">Re</span>Forme Center
            </h1>
            <p className="text-slate-500 mt-2 font-medium">Définissez votre nouveau mot de passe</p>
          </div>

          <Card className="shadow-xl border-0 rounded-2xl overflow-hidden">
            <CardContent className="p-8">
              <form onSubmit={handleSaveRecoveryPassword} className="space-y-5">
                {recoveryError && (
                  <div className="bg-red-50 border border-red-100 text-red-600 p-4 rounded-xl flex items-start gap-3 text-sm">
                    <AlertCircle className="h-5 w-5 flex-shrink-0 mt-0.5" />
                    <p className="font-medium">{recoveryError}</p>
                  </div>
                )}

                {recoverySuccess && (
                  <div className="bg-emerald-50 border border-emerald-200 text-emerald-700 p-4 rounded-xl flex items-start gap-3 text-sm">
                    <CheckCircle className="h-5 w-5 flex-shrink-0 mt-0.5" />
                    <p className="font-medium">{recoverySuccess}</p>
                  </div>
                )}

                <div className="space-y-1.5">
                  <label className="text-sm font-semibold text-slate-700">Nouveau mot de passe</label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                      <Lock className="h-5 w-5 text-slate-400" />
                    </div>
                    <input
                      type={showRecoveryPassword ? 'text' : 'password'}
                      required
                      minLength={6}
                      value={recoveryPassword}
                      onChange={(e) => setRecoveryPassword(e.target.value)}
                      className="block w-full pl-10 pr-10 py-2.5 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-mint-500/20 focus:border-mint-500 bg-slate-50 focus:bg-white"
                      placeholder="Minimum 6 caractères"
                    />
                    <button
                      type="button"
                      onClick={() => setShowRecoveryPassword((v) => !v)}
                      className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-400 hover:text-slate-600"
                    >
                      {showRecoveryPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="text-sm font-semibold text-slate-700">Confirmer le mot de passe</label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                      <Lock className="h-5 w-5 text-slate-400" />
                    </div>
                    <input
                      type={showRecoveryPassword ? 'text' : 'password'}
                      required
                      minLength={6}
                      value={recoveryConfirm}
                      onChange={(e) => setRecoveryConfirm(e.target.value)}
                      className="block w-full pl-10 pr-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-mint-500/20 focus:border-mint-500 bg-slate-50 focus:bg-white"
                      placeholder="Répétez le mot de passe"
                    />
                  </div>
                </div>

                <Button
                  type="submit"
                  disabled={recoveryLoading}
                  className="w-full h-12 text-base font-semibold bg-mint-600 hover:bg-mint-700 text-white rounded-xl shadow-sm"
                >
                  {recoveryLoading ? 'Enregistrement...' : 'Valider le nouveau mot de passe'}
                </Button>

                <button
                  type="button"
                  onClick={() => {
                    setIsRecoveryMode(false);
                    window.location.hash = 'login';
                  }}
                  className="w-full text-center text-xs font-medium text-slate-500 hover:text-slate-700"
                >
                  Retour à la connexion
                </button>
              </form>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  const renderContent = () => {
    if (currentRoute === 'patient-detail' && selectedPatientId) {
      return (
        <ProtectedRoute allowedPermissions={['patients', 'agenda']}>
          <PatientDetail patientId={selectedPatientId} returnRoute={returnRoute} />
        </ProtectedRoute>
      );
    }

    switch (currentRoute) {
      case 'dashboard':
        return (
          <ProtectedRoute allowedRoles={['admin']}>
            <Dashboard onSelectPatient={(id) => handleSelectPatient(id, 'dashboard')} />
          </ProtectedRoute>
        );
      case 'agenda':
        return (
          <ProtectedRoute allowedPermissions={['agenda']}>
            <Agenda onSelectPatient={(id) => handleSelectPatient(id, 'agenda')} />
          </ProtectedRoute>
        );
      case 'patients':
        return (
          <ProtectedRoute allowedPermissions={['patients']}>
            <Patients onSelectPatient={(id) => handleSelectPatient(id, 'patients')} />
          </ProtectedRoute>
        );
      case 'settings':
        return (
          <ProtectedRoute allowedPermissions={['settings']}>
            <Settings />
          </ProtectedRoute>
        );
      case 'finance':
        return (
          <ProtectedRoute allowedPermissions={['finance_stats', 'finance_recettes', 'finance_depenses_view', 'finance_depenses_edit']}>
            <Finance />
          </ProtectedRoute>
        );
      default:
        return (
          <ProtectedRoute allowedPermissions={['agenda']}>
            <Agenda onSelectPatient={(id) => handleSelectPatient(id, 'agenda')} />
          </ProtectedRoute>
        );
    }
  };

  if (currentRoute === 'login') {
    return <LoginPage />;
  }

  return (
    <AppointmentNotificationsProvider>
      {currentRoute === 'espace-patient' ? (
        <ProtectedRoute allowedRoles={['patient', 'admin', 'therapeute', 'secretaire']}>
          <PatientPortal />
        </ProtectedRoute>
      ) : (
        <Layout>
          {renderContent()}
        </Layout>
      )}
    </AppointmentNotificationsProvider>
  );
}
