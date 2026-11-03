import React, { useState, useEffect } from 'react';
import { supabase, supabaseUrl, supabaseAnonKey, clearStoredAuthSession } from '../lib/supabaseClient';
import { Activity, Lock, Mail, AlertCircle, CheckCircle, Eye, EyeOff, ArrowRight, LogOut } from 'lucide-react';
import { Card, CardContent } from '../components/ui/card';
import { Button } from '../components/ui/button';
import {
  OWNER_RECOVERY_EMAIL,
  ensureStaffAuthAccountForRecovery,
  isEmailBlocked,
  isPrimaryAdminEmail,
  parseCollaboratorProfile,
  resolveOrBindCollaboratorSession,
  resolveStaffLoginCandidates,
} from '../lib/teamUtils';
import {
  extractPhoneFromPatientAuthEmail,
  isPatientSyntheticEmail,
  normalizePatientPhone,
  parsePatientProfileAuthMeta,
  resolvePatientLoginCandidates,
  stripInvisibleChars,
} from '../lib/patientAuthUtils';

export function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [resetLoading, setResetLoading] = useState(false);
  const [error, setError] = useState('');
  const [infoMessage, setInfoMessage] = useState('');
  const [existingSessionBanner, setExistingSessionBanner] = useState<{
    label: string;
    roleLabel: string;
    targetHash: string;
  } | null>(null);

  useEffect(() => {
    try {
      const blockedNotice = sessionStorage.getItem('reforme_auth_blocked_msg');
      if (blockedNotice) {
        setError(blockedNotice);
        sessionStorage.removeItem('reforme_auth_blocked_msg');
      }
    } catch {}

    // Check if user already has a valid active session so they can resume in 1 click or switch accounts
    let cancelled = false;
    (async () => {
      try {
        const {
          data: { session },
        } = await supabase.auth.getSession();
        if (cancelled || !session?.user) return;
        const sessEmail = stripInvisibleChars(session.user.email || '').toLowerCase();
        if (isPatientSyntheticEmail(sessEmail)) {
          const phone = extractPhoneFromPatientAuthEmail(sessEmail);
          if (!cancelled) {
            setExistingSessionBanner({
              label: phone || sessEmail,
              roleLabel: 'Espace Patient',
              targetHash: 'espace-patient',
            });
          }
          return;
        }

        const profile = await resolveOrBindCollaboratorSession(supabase, {
          id: session.user.id,
          email: sessEmail,
        });
        if (cancelled || !profile || profile.__blocked || profile.__transientError) return;

        const parsed = parseCollaboratorProfile(profile, [], session.user);
        const effRole = isPrimaryAdminEmail(sessEmail) ? 'admin' : parsed.role;
        const roleLabel =
          effRole === 'admin'
            ? 'Administrateur'
            : effRole === 'secretaire'
            ? 'Secrétaire'
            : effRole === 'therapeute'
            ? 'Thérapeute'
            : 'Patient';
        const targetHash =
          effRole === 'admin'
            ? 'dashboard'
            : effRole === 'patient'
            ? 'espace-patient'
            : parsed.permissions.includes('agenda')
            ? 'agenda'
            : parsed.permissions.includes('patients')
            ? 'patients'
            : 'agenda';

        if (!cancelled) {
          setExistingSessionBanner({
            label: parsed.name || parsed.email || sessEmail,
            roleLabel,
            targetHash,
          });
        }
      } catch {}
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  const handleDisconnectActiveBanner = async () => {
    clearStoredAuthSession();
    await supabase.auth.signOut({ scope: 'local' }).catch(() => {});
    setExistingSessionBanner(null);
  };

  const handleForgotPassword = async () => {
    setError('');
    setInfoMessage('');
    const rawClean = stripInvisibleChars(email).toLowerCase();

    if (!rawClean) {
      setError("Veuillez d'abord saisir votre email ou numéro de téléphone dans le champ ci-dessus.");
      return;
    }

    // Patient phone number entered -> explain instant reset by secretariat
    if (!rawClean.includes('@') && rawClean !== 'admin') {
      setInfoMessage(
        "Pour un accès Patient (connexion par téléphone), contactez le secrétariat du cabinet Re Forme Center : un nouveau mot de passe peut vous être attribué immédiatement depuis votre fiche patient."
      );
      return;
    }

    const isInternalAdminAlias = rawClean === 'admin' || rawClean === 'admin@reforme.com';
    const targetEmail = isInternalAdminAlias ? OWNER_RECOVERY_EMAIL : rawClean;

    setResetLoading(true);
    try {
      const blocked = await isEmailBlocked(supabase, targetEmail);
      if (blocked) {
        throw new Error("Accès bloqué : ce compte a été désactivé par l'administrateur du cabinet.");
      }

      // Ensure known admin/practitioner email exists in Supabase Auth so recovery email actually dispatches
      await ensureStaffAuthAccountForRecovery(supabase, supabaseUrl, supabaseAnonKey, targetEmail).catch(
        () => {}
      );

      const { error: resetErr } = await supabase.auth.resetPasswordForEmail(targetEmail, {
        redirectTo: window.location.origin,
      });
      if (resetErr) {
        if (resetErr.message?.toLowerCase().includes('rate limit')) {
          throw new Error(
            "Limite temporaire d'envoi d'emails atteinte. Veuillez patienter quelques minutes ou vérifier votre boîte de réception (et vos Spams)."
          );
        }
        throw resetErr;
      }

      if (isInternalAdminAlias) {
        setInfoMessage(
          `L'identifiant interne admin@reforme.com ne possède pas de boîte mail : un lien de réinitialisation Administrateur a été envoyé à votre adresse principale ${OWNER_RECOVERY_EMAIL} (vérifiez également vos Spams).`
        );
      } else {
        setInfoMessage(
          `Un lien de réinitialisation du mot de passe a été envoyé à ${targetEmail} (vérifiez également vos Spams).`
        );
      }
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
      const rawIdentifier = stripInvisibleChars(email);
      if (!rawIdentifier) {
        throw new Error('Veuillez saisir votre adresse email ou votre numéro de téléphone.');
      }

      const isAdminShorthand = rawIdentifier.toLowerCase() === 'admin';
      const isEmailInput = isAdminShorthand || rawIdentifier.includes('@');

      let candidateEmails: string[] = [];
      let displayEmailForCheck = '';
      let isPatientAccount = false;

      if (isEmailInput) {
        displayEmailForCheck = isAdminShorthand ? 'admin@reforme.com' : rawIdentifier.toLowerCase();
        isPatientAccount = isPatientSyntheticEmail(displayEmailForCheck);

        if (!isPatientAccount && !isPrimaryAdminEmail(displayEmailForCheck)) {
          const blocked = await isEmailBlocked(supabase, displayEmailForCheck);
          if (blocked) {
            clearStoredAuthSession();
            await supabase.auth.signOut({ scope: 'local' }).catch(() => {});
            throw new Error("Accès bloqué : ce compte a été désactivé par l'administrateur du cabinet.");
          }
        }

        if (isPatientAccount) {
          const extractedPhone = extractPhoneFromPatientAuthEmail(displayEmailForCheck);
          candidateEmails = extractedPhone
            ? await resolvePatientLoginCandidates(supabase, extractedPhone)
            : [displayEmailForCheck];
          if (!candidateEmails.includes(displayEmailForCheck)) {
            candidateEmails.unshift(displayEmailForCheck);
          }
        } else {
          candidateEmails = await resolveStaffLoginCandidates(supabase, displayEmailForCheck);
        }
      } else {
        isPatientAccount = true;
        candidateEmails = await resolvePatientLoginCandidates(supabase, rawIdentifier);
        if (candidateEmails.length === 0) {
          const fallbackDigits = normalizePatientPhone(rawIdentifier) || rawIdentifier.replace(/\s+/g, '');
          candidateEmails = [`${fallbackDigits}@patient.reforme.center`];
        }
      }

      // Clear any stale/expired session in storage before initiating fresh sign-in
      clearStoredAuthSession();
      await supabase.auth.signOut({ scope: 'local' }).catch(() => {});

      const passwordVariants = [password];
      const trimmedPassword = stripInvisibleChars(password);
      if (trimmedPassword && trimmedPassword !== password) {
        passwordVariants.push(trimmedPassword);
      }

      let authenticatedUser: any = null;
      let matchedLoginEmail = candidateEmails[0] || displayEmailForCheck;
      let lastAuthError: any = null;

      outerLoop: for (const candidate of candidateEmails) {
        for (const pwd of passwordVariants) {
          const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
            email: candidate,
            password: pwd,
          });

          if (!authError && authData?.user) {
            authenticatedUser = authData.user;
            matchedLoginEmail = candidate;
            break outerLoop;
          }

          lastAuthError = authError;
          if (authError && authError.message?.includes('Email not confirmed')) {
            break outerLoop;
          }
        }
      }

      if (!authenticatedUser) {
        if (lastAuthError?.message?.includes('Email not confirmed')) {
          throw new Error(
            "Veuillez confirmer votre adresse email avant de vous connecter."
          );
        }
        if (lastAuthError?.message?.includes('Invalid login credentials')) {
          throw new Error(
            isPatientAccount
              ? 'Numéro de téléphone ou mot de passe incorrect. Vérifiez votre saisie ou demandez la réinitialisation de votre code au cabinet.'
              : "Identifiants incorrects. Vérifiez l'adresse email et le mot de passe (ou cliquez sur « Mot de passe oublié ? »)."
          );
        }
        throw lastAuthError || new Error('Identifiants incorrects.');
      }

      const effectiveAuthEmail = (authenticatedUser.email || matchedLoginEmail || '').toLowerCase();
      const effectiveIsPatient =
        isPatientSyntheticEmail(effectiveAuthEmail) ||
        (isPatientAccount && !effectiveAuthEmail.endsWith('@staff.reforme.center'));

      // 2. Récupération ou rattachement automatique du profil collaborateur/admin
      const profile = await resolveOrBindCollaboratorSession(supabase, {
        id: authenticatedUser.id,
        email: displayEmailForCheck || effectiveAuthEmail,
      });

      if (profile?.__blocked) {
        clearStoredAuthSession();
        await supabase.auth.signOut({ scope: 'local' }).catch(() => {});
        throw new Error("Accès bloqué : ce compte a été désactivé par l'administrateur du cabinet.");
      }

      if ((!profile || profile.__transientError) && !effectiveIsPatient && !isPrimaryAdminEmail(displayEmailForCheck || effectiveAuthEmail)) {
        clearStoredAuthSession();
        await supabase.auth.signOut({ scope: 'local' }).catch(() => {});
        throw new Error("Accès révoqué ou profil introuvable. Contactez l'administrateur du cabinet.");
      }

      // 3. Redirection intelligente selon le rôle et les permissions
      const role = isPrimaryAdminEmail(displayEmailForCheck || effectiveAuthEmail)
        ? 'admin'
        : profile?.role && !profile.__transientError
        ? profile.role
        : effectiveIsPatient
        ? 'patient'
        : '';

      if (role === 'admin') {
        try {
          sessionStorage.removeItem('reforme_portal_patient_phone');
          sessionStorage.removeItem('reforme_portal_patient_id');
        } catch {}
        window.location.hash = 'dashboard';
      } else if (role === 'therapeute' || role === 'secretaire') {
        try {
          sessionStorage.removeItem('reforme_portal_patient_phone');
          sessionStorage.removeItem('reforme_portal_patient_id');
        } catch {}
        const perms: string[] = Array.isArray(profile?.permissions) ? profile.permissions : [];
        const hasConfigured = perms.includes('__meta_configured:1');
        const cleanPerms = perms.filter((p) => typeof p === 'string' && !p.startsWith('__'));
        const effectivePerms =
          !hasConfigured && cleanPerms.length === 0 ? ['agenda', 'patients'] : cleanPerms;

        if (effectivePerms.length === 0) {
          clearStoredAuthSession();
          await supabase.auth.signOut({ scope: 'local' }).catch(() => {});
          throw new Error(
            "Aucune permission d'accès n'est activée sur votre compte. Contactez l'administrateur."
          );
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
          const patientMeta = parsePatientProfileAuthMeta(profile);
          if (patientMeta?.patientId) {
            sessionStorage.setItem('reforme_portal_patient_id', patientMeta.patientId);
          }
          const patientPhone =
            patientMeta?.phone ||
            extractPhoneFromPatientAuthEmail(effectiveAuthEmail) ||
            normalizePatientPhone(rawIdentifier);
          if (patientPhone) {
            sessionStorage.setItem('reforme_portal_patient_phone', patientPhone);
          }
        } catch {}
        window.location.hash = 'espace-patient';
      } else {
        clearStoredAuthSession();
        await supabase.auth.signOut({ scope: 'local' }).catch(() => {});
        throw new Error('Rôle non reconnu.');
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

        {existingSessionBanner && (
          <div className="mb-4 bg-white border border-mint-200 rounded-2xl p-4 shadow-sm flex flex-col gap-3">
            <div className="flex items-center justify-between gap-2">
              <div className="min-w-0">
                <p className="text-xs font-bold uppercase tracking-wider text-mint-700">
                  Session déjà connectée ({existingSessionBanner.roleLabel})
                </p>
                <p className="text-sm font-semibold text-slate-900 truncate mt-0.5">
                  {existingSessionBanner.label}
                </p>
              </div>
              <button
                type="button"
                onClick={handleDisconnectActiveBanner}
                title="Fermer cette session"
                className="p-2 rounded-xl text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors"
              >
                <LogOut className="h-4 w-4" />
              </button>
            </div>
            <Button
              type="button"
              onClick={() => {
                window.location.hash = existingSessionBanner.targetHash;
              }}
              className="w-full h-10 text-xs font-bold bg-slate-900 hover:bg-slate-800 text-white rounded-xl gap-1.5"
            >
              Continuer vers mon espace
              <ArrowRight className="h-3.5 w-3.5" />
            </Button>
          </div>
        )}

        <Card className="shadow-xl border-0 rounded-2xl overflow-hidden">
          <CardContent className="p-8">
            <form onSubmit={handleLogin} className="space-y-6">
              {error && (
                <div className="bg-red-50 border border-red-100 text-red-600 p-4 rounded-xl flex items-start gap-3 text-sm">
                  <AlertCircle className="h-5 w-5 flex-shrink-0 mt-0.5" />
                  <p className="font-medium leading-relaxed">{error}</p>
                </div>
              )}

              {infoMessage && (
                <div className="bg-emerald-50 border border-emerald-200 text-emerald-700 p-4 rounded-xl flex items-start gap-3 text-sm">
                  <CheckCircle className="h-5 w-5 flex-shrink-0 mt-0.5" />
                  <p className="font-medium leading-relaxed">{infoMessage}</p>
                </div>
              )}

              <div className="space-y-4">
                <div className="space-y-1.5">
                  <label className="text-sm font-semibold text-slate-700">
                    Email ou Numéro de téléphone
                  </label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                      <Mail className="h-5 w-5 text-slate-400" />
                    </div>
                    <input
                      type="text"
                      required
                      autoCapitalize="none"
                      autoCorrect="off"
                      spellCheck={false}
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="block w-full pl-10 pr-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-mint-500/20 focus:border-mint-500 transition-all bg-slate-50 focus:bg-white"
                      placeholder="Email, 06XXXXXXXX ou CIN"
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
                      type={showPassword ? 'text' : 'password'}
                      required
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="block w-full pl-10 pr-10 py-2.5 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-mint-500/20 focus:border-mint-500 transition-all bg-slate-50 focus:bg-white"
                      placeholder="••••••••"
                    />
                    <button
                      type="button"
                      tabIndex={-1}
                      onClick={() => setShowPassword((prev) => !prev)}
                      className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-400 hover:text-slate-600 transition-colors"
                      title={showPassword ? 'Masquer le mot de passe' : 'Afficher le mot de passe'}
                    >
                      {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
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
