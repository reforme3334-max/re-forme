import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabaseClient';
import { Activity } from 'lucide-react';

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
      const { data: { session } } = await supabase.auth.getSession();
      
      if (!session) {
        window.location.hash = 'login';
        return;
      }

      const checkRoles = allowedRoles && allowedRoles.length > 0;
      const checkPerms = allowedPermissions && allowedPermissions.length > 0;

      if (checkRoles || checkPerms) {
        const { data: profile } = await supabase
          .from('profiles')
          .select('role, permissions')
          .eq('id', session.user.id)
          .single();

        if (profile) {
          let roleOk = true;
          let permOk = true;

          if (checkRoles) {
            roleOk = allowedRoles.includes(profile.role);
          }
          
          if (checkPerms) {
            // Admin has all permissions implicitly or we check the array
            if (profile.role === 'admin') {
              permOk = true;
            } else {
              const userPerms = profile.permissions || [];
              // Check if user has at least one of the allowed permissions
              permOk = allowedPermissions.some(p => userPerms.includes(p));
            }
          }

          if (roleOk && permOk) {
            setAuthorized(true);
          } else {
            window.location.hash = 'login';
          }
        } else {
          window.location.hash = 'login';
        }
      } else {
        // Si aucun rôle/permission spécifique n'est requis, on autorise l'accès
        setAuthorized(true);
      }
    } catch (error) {
      console.error('Erreur lors de la vérification des droits:', error);
      window.location.hash = 'login';
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
