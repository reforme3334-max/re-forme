import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabaseClient';
import { Activity, Lock, Mail, AlertCircle, CheckCircle } from 'lucide-react';
import { Card, CardContent } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { isEmailBlocked, resolveOrBindCollaboratorSession } from '../lib/teamUtils';

export function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [resetLoading, setResetLoading] = useState(false);
  const [error, setError] = useState('');
  const [infoMessage, setInfoMessage] = useState('');

  useEffect(() => {
    try {
      const blockedNotice = sessionStorage.getItem('reforme_auth_blocked_msg');
      if (blockedNotice) {
        setError(blockedNotice);
        sessionStorage.removeItem('reforme_auth_blocked_msg');
      }
    } catch {}
  }, []);

  const handleForgotPassword = async () => {
    setError('');
    setInfoMessage('');
    const trimmedInput = email.trim().toLowerCase();

    if (!trimmedInput || !trimmedInput.includes('@')) {
      setError("Veuillez d'abord saisir votre adresse email dans le champ ci-dessus pour réinitialiser le mot de passe.");
      return;
    }

    setResetLoading(true);
    try {
      const blocked = await isEmailBlocked(supabase, trimmedInput);
      if (blocked) {
        throw new Error("Accès bloqué : ce compte a été désactivé par l'administrateur du cabinet.");
      }

      const { error: resetErr } = await supabase.auth.resetPasswordForEmail(trimmedInput, {
        redirectTo: window.location.origin,
      });
      if (resetErr) throw resetErr;
      setInfoMessage(`Un lien de réinitialisation a été envoyé à ${trimmedInput} (vérifiez également vos spams).`);
    } catch (err: any) {
      setError(err.message || "Impossible d'envoyer l'email de réinitialisation.");
    } finally {
      setResetLoading(false);
    }
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    setInfoMessage('');

    try {
      const trimmedInput = email.trim();
      let loginEmail = trimmedInput;
      if (!trimmedInput.includes('@')) {
        const cleanPhone = trimmedInput.replace(/\s+/g, '');
        loginEmail = `${cleanPhone}@patient.reforme.center`;
      } else {
        loginEmail = trimmedInput.toLowerCase();
      }

      const isPatientAccount = loginEmail.toLowerCase().endsWith('@patient.reforme.center');

      // 0. Vérification immédiate de la liste noire (comptes bloqués)
      if (!isPatientAccount) {
        const blocked = await isEmailBlocked(supabase, loginEmail);
        if (blocked) {
          await supabase.auth.signOut({ scope: 'local' }).catch(() => {});
          throw new Error("Accès bloqué : ce compte a été désactivé par l'administrateur du cabinet.");
        }
      }

      // 1. Authentification via Supabase
      const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
        email: loginEmail,
        password,
      });

      if (authError) {
        if (authError.message.includes('Email not confirmed')) {
          throw new Error("Veuillez confirmer votre adresse email. (Astuce: Vous pouvez désactiver la confirmation d'email dans les paramètres Supabase).");
        }
        if (authError.message.includes('Invalid login credentials')) {
          throw new Error("Identifiants incorrects. Veuillez vérifier l'email/téléphone et le mot de passe.");
        }
        throw authError;
      }

      if (authData.user) {
        // 2. Récupération ou rattachement automatique du profil collaborateur
        const profile = await resolveOrBindCollaboratorSession(supabase, {
          id: authData.user.id,
          email: authData.user.email || loginEmail,
        });

        if (profile?.__blocked) {
          await supabase.auth.signOut({ scope: 'local' }).catch(() => {});
          throw new Error("Accès bloqué : ce compte a été désactivé par l'administrateur du cabinet.");
        }

        if (!profile && !isPatientAccount) {
          await supabase.auth.signOut({ scope: 'local' }).catch(() => {});
          throw new Error("Accès révoqué ou profil introuvable. Contactez l'administrateur du cabinet.");
        }

        // 3. Redirection intelligente selon le rôle et les permissions
        const role = profile?.role || (isPatientAccount ? 'patient' : '');
        if (role === 'admin') {
          try { sessionStorage.removeItem('reforme_portal_patient_phone'); } catch {}
          window.location.hash = 'dashboard';
        } else if (role === 'therapeute' || role === 'secretaire') {
          try { sessionStorage.removeItem('reforme_portal_patient_phone'); } catch {}
          const perms: string[] = Array.isArray(profile?.permissions) ? profile.permissions : [];
          const hasConfigured = perms.includes('__meta_configured:1');
          const cleanPerms = perms.filter(
            (p) =>
              typeof p === 'string' &&
              !p.startsWith('__meta_') &&
              !p.startsWith('__pending_collab:') &&
              !p.startsWith('__blocked_email:')
          );
          const effectivePerms = !hasConfigured && cleanPerms.length === 0 ? ['agenda', 'patients'] : cleanPerms;

          if (effectivePerms.length === 0) {
            await supabase.auth.signOut({ scope: 'local' }).catch(() => {});
            throw new Error("Aucune permission d'accès n'est activée sur votre compte. Contactez l'administrateur.");
          }

          if (effectivePerms.includes('agenda')) {
            window.location.hash = 'agenda';
          } else if (effectivePerms.includes('patients')) {
            window.location.hash = 'patients';
          } else if (effectivePerms.some((p) => p.startsWith('finance_'))) {
            window.location.hash = 'finance';
          } else if (effectivePerms.includes('settings')) {
            window.location.hash = 'settings';
          } else {
            window.location.hash = 'agenda';
          }
        } else if (role === 'patient') {
          try {
            const patientPhone = loginEmail.replace(/@patient\.reforme\.center$/i, '');
            sessionStorage.setItem('reforme_portal_patient_phone', patientPhone);
          } catch {}
          window.location.hash = 'espace-patient';
        } else {
          await supabase.auth.signOut({ scope: 'local' }).catch(() => {});
          throw new Error('Rôle non reconnu.');
        }
      }
    } catch (err: any) {
      setError(err.message || 'Une erreur est survenue lors de la connexion.');
    } finally {
      setLoading(false);
    }
  };

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
          <p className="text-slate-500 mt-2 font-medium">Connectez-vous à votre espace</p>
        </div>

        <Card className="shadow-xl border-0 rounded-2xl overflow-hidden">
          <CardContent className="p-8">
            <form onSubmit={handleLogin} className="space-y-6">
              {error && (
                <div className="bg-red-50 border border-red-100 text-red-600 p-4 rounded-xl flex items-start gap-3 text-sm">
                  <AlertCircle className="h-5 w-5 flex-shrink-0 mt-0.5" />
                  <p className="font-medium">{error}</p>
                </div>
              )}

              {infoMessage && (
                <div className="bg-emerald-50 border border-emerald-200 text-emerald-700 p-4 rounded-xl flex items-start gap-3 text-sm">
                  <CheckCircle className="h-5 w-5 flex-shrink-0 mt-0.5" />
                  <p className="font-medium">{infoMessage}</p>
                </div>
              )}

              <div className="space-y-4">
                <div className="space-y-1.5">
                  <label className="text-sm font-semibold text-slate-700">Email ou Numéro de téléphone</label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                      <Mail className="h-5 w-5 text-slate-400" />
                    </div>
                    <input
                      type="text"
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="block w-full pl-10 pr-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-mint-500/20 focus:border-mint-500 transition-all bg-slate-50 focus:bg-white"
                      placeholder="Email ou 06XXXXXXXX"
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <label className="text-sm font-semibold text-slate-700">Mot de passe</label>
                    <button
                      type="button"
                      disabled={resetLoading}
                      onClick={handleForgotPassword}
                      className="text-xs font-medium text-mint-600 hover:text-mint-700 disabled:opacity-50"
                    >
                      {resetLoading ? 'Envoi...' : 'Mot de passe oublié ?'}
                    </button>
                  </div>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                      <Lock className="h-5 w-5 text-slate-400" />
                    </div>
                    <input
                      type="password"
                      required
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="block w-full pl-10 pr-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-mint-500/20 focus:border-mint-500 transition-all bg-slate-50 focus:bg-white"
                      placeholder="••••••••"
                    />
                  </div>
                </div>
              </div>

              <Button
                type="submit"
                className="w-full h-12 text-base font-semibold bg-mint-600 hover:bg-mint-700 text-white rounded-xl shadow-sm transition-all"
                disabled={loading}
              >
                {loading ? 'Connexion en cours...' : 'Se connecter'}
              </Button>
            </form>
          </CardContent>
        </Card>

        <p className="text-center text-sm text-slate-500 mt-8">
          © {new Date().getFullYear()} Re Forme Center. Tous droits réservés.
        </p>
      </div>
    </div>
  );
}
