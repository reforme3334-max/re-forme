import React, { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabaseClient';
import { Activity } from 'lucide-react';
import { parseCollaboratorProfile, resolveOrBindCollaboratorSession } from '../../lib/teamUtils';

interface ProtectedRouteProps {
  children: React.ReactNode;
  allowedRoles?: string[];
  allowedPermissions?: string[];
}

export function ProtectedRoute({ children, allowedRoles, allowedPermissions }: ProtectedRouteProps) {
  const [loading, setLoading] = useState(true);
  const [authorized, setAuthorized] = useState(false);

  useEffect(() => {
    checkAuth();

    const { data: authListener } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (event === 'SIGNED_OUT') {
        window.location.hash = 'login';
      } else if (event === 'SIGNED_IN' && session) {
        checkAuth();
      }
    });

    return () => {
      authListener.subscription.unsubscribe();
    };
  }, []);

  const checkAuth = async () => {
    setLoading(true);
    try {
      const { data: { session }, error: sessionError } = await supabase.auth.getSession();
      
      if (sessionError || !session) {
        if (sessionError) {
          await supabase.auth.signOut({ scope: 'local' }).catch(() => {});
        }
        window.location.hash = 'login';
        return;
      }

      const checkRoles = allowedRoles && allowedRoles.length > 0;
      const checkPerms = allowedPermissions && allowedPermissions.length > 0;

      if (checkRoles || checkPerms) {
        const profile = await resolveOrBindCollaboratorSession(supabase, {
          id: session.user.id,
          email: session.user.email,
        });

        if (profile) {
          let roleOk = true;
          let permOk = true;

          if (checkRoles) {
            roleOk = allowedRoles.includes(profile.role);
          }
          
          if (checkPerms) {
            if (profile.role === 'admin') {
              permOk = true;
            } else {
              const parsed = parseCollaboratorProfile(profile);
              permOk = allowedPermissions.some(p => parsed.permissions.includes(p));
            }
          }

          if (roleOk && permOk) {
            setAuthorized(true);
          } else {
            window.location.hash = 'login';
          }
        } else {
          // If session is valid but profile fetch failed transiently, allow access rather than kicking user out
          setAuthorized(true);
        }
      } else {
        // Si aucun rôle/permission spécifique n'est requis, on autorise l'accès
        setAuthorized(true);
      }
    } catch (error) {
      console.warn('Avertissement lors de la vérification des droits:', error);
    } finally {
      setLoading(false);
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
