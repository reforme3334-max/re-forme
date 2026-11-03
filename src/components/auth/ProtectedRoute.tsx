import React, { useEffect, useRef, useState } from 'react';
import { supabase, clearStoredAuthSession } from '../../lib/supabaseClient';
import { Activity } from 'lucide-react';
import {
  isEmailBlocked,
  isPrimaryAdminEmail,
  parseCollaboratorProfile,
  resolveOrBindCollaboratorSession,
} from '../../lib/teamUtils';
import { isPatientSyntheticEmail } from '../../lib/patientAuthUtils';

interface ProtectedRouteProps {
  children: React.ReactNode;
  allowedRoles?: string[];
  allowedPermissions?: string[];
}

export function ProtectedRoute({ children, allowedRoles, allowedPermissions }: ProtectedRouteProps) {
  const [loading, setLoading] = useState(true);
  const [authorized, setAuthorized] = useState(false);
  const authorizedRef = useRef(false);

  const rolesKey = (allowedRoles || []).join(',');
  const permsKey = (allowedPermissions || []).join(',');

  const updateAuthorized = (val: boolean) => {
    authorizedRef.current = val;
    setAuthorized(val);
  };

  useEffect(() => {
    let mounted = true;
    checkAuth(false, mounted);

    const handleWindowFocus = () => {
      if (mounted) checkAuth(true, mounted);
    };

    const { data: authListener } = supabase.auth.onAuthStateChange((event, session) => {
      if (!mounted) return;
      if (window.location.hash.includes('type=recovery') || event === 'PASSWORD_RECOVERY') {
        return;
      }
      if (event === 'SIGNED_OUT') {
        updateAuthorized(false);
        window.location.hash = 'login';
      } else if (event === 'SIGNED_IN' && session) {
        // Defer out of GoTrue's synchronous subscriber notification loop
        setTimeout(() => {
          if (mounted) checkAuth(true, mounted);
        }, 0);
      }
    });

    window.addEventListener('focus', handleWindowFocus);

    return () => {
      mounted = false;
      authListener.subscription.unsubscribe();
      window.removeEventListener('focus', handleWindowFocus);
    };
  }, [rolesKey, permsKey]);

  const kickOutSession = async (reason?: string) => {
    updateAuthorized(false);
    if (reason) {
      try {
        sessionStorage.setItem('reforme_auth_blocked_msg', reason);
      } catch {}
    }
    clearStoredAuthSession();
    await supabase.auth.signOut({ scope: 'local' }).catch(() => {});
    window.location.hash = 'login';
  };

  const checkAuth = async (silent = false, isMounted = true) => {
    if (window.location.hash.includes('type=recovery')) {
      if (!silent && isMounted) setLoading(false);
      return;
    }

    if (!silent && isMounted) {
      setLoading(true);
    }

    try {
      const {
        data: { session },
        error: sessionError,
      } = await supabase.auth.getSession();

      if (!isMounted) return;

      if (sessionError || !session) {
        if (sessionError) {
          clearStoredAuthSession();
          await supabase.auth.signOut({ scope: 'local' }).catch(() => {});
        }
        updateAuthorized(false);
        window.location.hash = 'login';
        return;
      }

      const sessionEmail = (session.user.email || '').trim().toLowerCase();
      const isPatientEmail = isPatientSyntheticEmail(sessionEmail);

      // 1. Immediate blocklist enforcement (never blocking primary admin accounts)
      if (sessionEmail && !isPatientEmail && !isPrimaryAdminEmail(sessionEmail)) {
        const blocked = await isEmailBlocked(supabase, sessionEmail);
        if (blocked) {
          await kickOutSession("Accès bloqué : votre compte a été désactivé par l'administrateur du cabinet.");
          return;
        }
      }

      const checkRoles = allowedRoles && allowedRoles.length > 0;
      const checkPerms = allowedPermissions && allowedPermissions.length > 0;

      if (checkRoles || checkPerms) {
        const profile = await resolveOrBindCollaboratorSession(supabase, {
          id: session.user.id,
          email: sessionEmail,
        });

        if (profile?.__blocked) {
          await kickOutSession("Accès bloqué : votre compte a été désactivé par l'administrateur du cabinet.");
          return;
        }

        // Preserve active session on transient network blips
        if (profile?.__transientError) {
          if (authorizedRef.current || isPrimaryAdminEmail(sessionEmail)) {
            updateAuthorized(true);
            return;
          }
          if (isPatientEmail && checkRoles && allowedRoles?.includes('patient')) {
            updateAuthorized(true);
            return;
          }
        }

        // Patient accounts without a `profiles` row still have role 'patient'
        if (!profile || profile.__transientError) {
          if (isPatientEmail) {
            if (checkRoles && allowedRoles?.includes('patient')) {
              updateAuthorized(true);
            } else {
              updateAuthorized(false);
              window.location.hash = 'espace-patient';
            }
            return;
          }
          await kickOutSession("Accès révoqué : votre profil collaborateur n'est plus autorisé.");
          return;
        }

        const effectiveRole = isPrimaryAdminEmail(sessionEmail) ? 'admin' : profile.role;

        // If a patient account navigated to a staff-only page, redirect them back to their portal without signing out
        if ((effectiveRole === 'patient' || isPatientEmail) && !(checkRoles && allowedRoles?.includes('patient'))) {
          updateAuthorized(false);
          window.location.hash = 'espace-patient';
          return;
        }

        let roleOk = true;
        let permOk = true;

        if (checkRoles) {
          roleOk = allowedRoles!.includes(effectiveRole);
        }

        const parsed = parseCollaboratorProfile({ ...profile, role: effectiveRole }, [], session.user);

        if (checkPerms) {
          if (effectiveRole === 'admin') {
            permOk = true;
          } else {
            permOk = allowedPermissions!.some((p) => parsed.permissions.includes(p));
          }
        }

        if (roleOk && permOk) {
          updateAuthorized(true);
        } else if (effectiveRole === 'admin') {
          updateAuthorized(false);
          window.location.hash = 'dashboard';
        } else if (effectiveRole === 'therapeute' || effectiveRole === 'secretaire') {
          const perms = parsed.permissions;
          if (perms.length === 0) {
            await kickOutSession("Aucune permission d'accès n'est activée sur votre compte.");
            return;
          }
          updateAuthorized(false);
          if (perms.includes('agenda')) {
            window.location.hash = 'agenda';
          } else if (perms.includes('patients')) {
            window.location.hash = 'patients';
          } else if (perms.some((p) => p.startsWith('finance_'))) {
            window.location.hash = 'finance';
          } else if (perms.includes('settings')) {
            window.location.hash = 'settings';
          } else {
            await kickOutSession();
          }
        } else {
          await kickOutSession();
        }
      } else {
        updateAuthorized(true);
      }
    } catch (error) {
      console.warn('Avertissement lors de la vérification des droits:', error);
    } finally {
      if (!silent && isMounted) {
        setLoading(false);
      }
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col justify-center items-center">
        <Activity className="h-10 w-10 text-mint-500 animate-pulse mb-4" />
        <p className="text-slate-500 font-medium">Vérification des accès...</p>
      </div>
    );
  }

  return authorized ? <>{children}</> : null;
}
