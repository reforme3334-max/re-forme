import React, { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabaseClient';
import { Activity } from 'lucide-react';
import {
  isEmailBlocked,
  parseCollaboratorProfile,
  resolveOrBindCollaboratorSession,
} from '../../lib/teamUtils';

interface ProtectedRouteProps {
  children: React.ReactNode;
  allowedRoles?: string[];
  allowedPermissions?: string[];
}

export function ProtectedRoute({ children, allowedRoles, allowedPermissions }: ProtectedRouteProps) {
  const [loading, setLoading] = useState(true);
  const [authorized, setAuthorized] = useState(false);

  const rolesKey = (allowedRoles || []).join(',');
  const permsKey = (allowedPermissions || []).join(',');

  useEffect(() => {
    checkAuth();

    const handleWindowFocus = () => {
      checkAuth(true);
    };

    const { data: authListener } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (event === 'SIGNED_OUT') {
        setAuthorized(false);
        window.location.hash = 'login';
      } else if (event === 'SIGNED_IN' && session) {
        checkAuth();
      }
    });

    window.addEventListener('focus', handleWindowFocus);

    return () => {
      authListener.subscription.unsubscribe();
      window.removeEventListener('focus', handleWindowFocus);
    };
  }, [rolesKey, permsKey]);

  const kickOutSession = async (reason?: string) => {
    setAuthorized(false);
    if (reason) {
      try {
        sessionStorage.setItem('reforme_auth_blocked_msg', reason);
      } catch {}
    }
    await supabase.auth.signOut({ scope: 'local' }).catch(() => {});
    window.location.hash = 'login';
  };

  const checkAuth = async (silent = false) => {
    if (!silent) {
      setLoading(true);
    }
    try {
      const {
        data: { session },
        error: sessionError,
      } = await supabase.auth.getSession();

      if (sessionError || !session) {
        if (sessionError) {
          await supabase.auth.signOut({ scope: 'local' }).catch(() => {});
        }
        setAuthorized(false);
        window.location.hash = 'login';
        return;
      }

      const sessionEmail = (session.user.email || '').trim().toLowerCase();
      const isPatientEmail = sessionEmail.endsWith('@patient.reforme.center');

      // 1. Immediate blocklist enforcement (even on already-open tabs)
      if (sessionEmail && !isPatientEmail) {
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

        // Patient accounts without a `profiles` row still have role 'patient'
        if (!profile) {
          if (isPatientEmail && checkRoles && allowedRoles?.includes('patient')) {
            setAuthorized(true);
            return;
          }
          await kickOutSession("Accès révoqué : votre profil collaborateur n'est plus autorisé.");
          return;
        }

        let roleOk = true;
        let permOk = true;

        if (checkRoles) {
          roleOk = allowedRoles!.includes(profile.role);
        }

        const parsed = parseCollaboratorProfile(profile, [], session.user);

        if (checkPerms) {
          if (profile.role === 'admin') {
            permOk = true;
          } else {
            permOk = allowedPermissions!.some((p) => parsed.permissions.includes(p));
          }
        }

        if (roleOk && permOk) {
          setAuthorized(true);
        } else if (profile.role === 'therapeute' || profile.role === 'secretaire') {
          // Redirect valid collaborator to their first permitted module, or kick out if 0 permissions
          const perms = parsed.permissions;
          if (perms.length === 0) {
            await kickOutSession("Aucune permission d'accès n'est activée sur votre compte.");
            return;
          }
          setAuthorized(false);
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
        setAuthorized(true);
      }
    } catch (error) {
      console.warn('Avertissement lors de la vérification des droits:', error);
    } finally {
      if (!silent) {
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
