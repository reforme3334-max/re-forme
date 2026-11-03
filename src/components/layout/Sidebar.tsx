import { useEffect, useState } from 'react';
import { LayoutDashboard, CalendarDays, Users, FileText, Settings, X, User, Activity, LogOut } from 'lucide-react';
import { Button } from '../ui/button';
import { supabase, clearStoredAuthSession } from '../../lib/supabaseClient';
import { useAppointmentNotifications } from '../../contexts/AppointmentNotificationsContext';
import { isPrimaryAdminEmail, parseCollaboratorProfile, resolveOrBindCollaboratorSession } from '../../lib/teamUtils';

interface SidebarProps {
  onClose: () => void;
}

export function Sidebar({ onClose }: SidebarProps) {
  const [currentHash, setCurrentHash] = useState(window.location.hash || '#dashboard');
  const [userProfile, setUserProfile] = useState<any>(null);
  const { pendingCount } = useAppointmentNotifications();

  useEffect(() => {
    const handleHashChange = () => {
      setCurrentHash(window.location.hash || '#dashboard');
    };
    const handleProfileUpdated = () => fetchUserProfile();
    window.addEventListener('hashchange', handleHashChange);
    window.addEventListener('reforme-team-updated', handleProfileUpdated);

    fetchUserProfile();

    return () => {
      window.removeEventListener('hashchange', handleHashChange);
      window.removeEventListener('reforme-team-updated', handleProfileUpdated);
    };
  }, []);

  const fetchUserProfile = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (session) {
      const data = await resolveOrBindCollaboratorSession(supabase, {
        id: session.user.id,
        email: session.user.email,
      });
      if (data && !data.__transientError && !data.__blocked) {
        const effRole = isPrimaryAdminEmail(session.user.email) ? 'admin' : data.role;
        setUserProfile(parseCollaboratorProfile({ ...data, role: effRole }, [], session.user));
      } else if (isPrimaryAdminEmail(session.user.email)) {
        setUserProfile({
          role: 'admin',
          name: 'Administrateur',
          email: session.user.email,
          permissions: [],
        });
      }
    }
  };

  const handleLogout = async () => {
    try {
      sessionStorage.removeItem('reforme_portal_patient_phone');
    } catch {}
    clearStoredAuthSession();
    await supabase.auth.signOut({ scope: 'local' }).catch(() => {});
    window.location.hash = 'login';
  };

  const hasPermission = (permission: string) => {
    if (!userProfile) return false;
    if (userProfile.role === 'admin') return true;
    return userProfile.permissions?.includes(permission);
  };

  const navItems = [
    { icon: LayoutDashboard, label: 'Dashboard', href: '#dashboard', show: userProfile?.role === 'admin' },
    { icon: CalendarDays, label: 'Agenda', href: '#agenda', show: hasPermission('agenda') },
    { icon: Users, label: 'Patients', href: '#patients', show: hasPermission('patients') },
    { icon: FileText, label: 'Facturation', href: '#finance', show: hasPermission('finance_recettes') },
    { icon: Activity, label: 'Finance', href: '#finance', show: hasPermission('finance_stats') || hasPermission('finance_recettes') || hasPermission('finance_depenses_view') || hasPermission('finance_depenses_edit') },
    { icon: User, label: 'Espace Patient (Démo)', href: '#espace-patient', show: true },
    { icon: Settings, label: 'Paramètres', href: '#settings', show: hasPermission('settings') },
  ];

  const roleDisplayName =
    userProfile?.role === 'admin'
      ? 'Administrateur'
      : userProfile?.role === 'secretaire'
      ? 'Secrétariat'
      : userProfile?.role === 'therapeute'
      ? 'Thérapeute'
      : 'Chargement...';

  return (
    <div className="flex h-full flex-col">
      <div className="flex h-16 items-center justify-between px-6 border-b border-slate-200">
        <div className="flex items-center gap-2 text-primary-600 font-bold text-2xl tracking-tight">
          <span className="text-mint-500">Re</span>Forme
        </div>
        <Button variant="ghost" size="icon" className="lg:hidden" onClick={onClose}>
          <X className="h-5 w-5" />
        </Button>
      </div>

      <div className="flex-1 overflow-y-auto py-4">
        <nav className="space-y-1 px-3">
          {navItems.filter(item => item.show).map((item) => {
            const Icon = item.icon;
            const isActive = currentHash.startsWith(item.href) ||
                             (currentHash === '#patient-detail' && item.href === '#patients');
            return (
              <a
                key={item.label}
                href={item.href}
                onClick={onClose}
                className={`flex items-center justify-between rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
                  isActive
                    ? 'bg-primary-50 text-primary-700'
                    : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                }`}
              >
                <div className="flex items-center gap-3">
                  <Icon className={`h-5 w-5 ${isActive ? 'text-primary-600' : 'text-slate-400'}`} />
                  <span>{item.label}</span>
                </div>
                {item.label === 'Agenda' && pendingCount > 0 && (
                  <span className="bg-amber-500 text-white text-[11px] font-black px-2 py-0.5 rounded-full shadow-xs animate-pulse">
                    {pendingCount}
                  </span>
                )}
              </a>
            );
          })}
        </nav>
      </div>

      <div className="border-t border-slate-200 p-4 space-y-3">
        <div className="flex items-center gap-3 min-w-0">
          <div className="h-10 w-10 rounded-full bg-primary-100 flex items-center justify-center text-primary-700 font-bold flex-shrink-0">
            {userProfile?.role === 'admin' ? 'AD' : userProfile?.role === 'secretaire' ? 'SE' : 'TH'}
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-slate-900 truncate">
              {userProfile?.name || roleDisplayName}
            </p>
            <p className="text-xs text-slate-500 truncate">
              {userProfile?.email || roleDisplayName}
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={handleLogout}
          className="w-full flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-slate-50 hover:bg-rose-50 hover:border-rose-200 hover:text-rose-700 px-3 py-2 text-xs font-semibold text-slate-700 transition-colors cursor-pointer"
        >
          <LogOut className="h-3.5 w-3.5" />
          Se déconnecter
        </button>
      </div>
    </div>
  );
}
