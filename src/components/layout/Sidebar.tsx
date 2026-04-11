import { useEffect, useState } from 'react';
import { LayoutDashboard, CalendarDays, Users, FileText, Settings, X, User, Activity } from 'lucide-react';
import { Button } from '../ui/button';
import { supabase } from '../../lib/supabaseClient';

interface SidebarProps {
  onClose: () => void;
}

export function Sidebar({ onClose }: SidebarProps) {
  const [currentHash, setCurrentHash] = useState(window.location.hash || '#dashboard');
  const [userProfile, setUserProfile] = useState<any>(null);

  useEffect(() => {
    const handleHashChange = () => {
      setCurrentHash(window.location.hash || '#dashboard');
    };
    window.addEventListener('hashchange', handleHashChange);
    
    fetchUserProfile();
    
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, []);

  const fetchUserProfile = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (session) {
      const { data } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', session.user.id)
        .single();
      if (data) {
        setUserProfile(data);
      }
    }
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
    { icon: FileText, label: 'Facturation', href: '#billing', show: hasPermission('finance_recettes') },
    { icon: Activity, label: 'Finance', href: '#finance', show: hasPermission('finance_recettes') || hasPermission('finance_depenses_view') || hasPermission('finance_depenses_edit') },
    { icon: User, label: 'Espace Patient (Démo)', href: '#espace-patient', show: true },
    { icon: Settings, label: 'Paramètres', href: '#settings', show: hasPermission('settings') },
  ];

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
                className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
                  isActive 
                    ? 'bg-primary-50 text-primary-700' 
                    : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                }`}
              >
                <Icon className={`h-5 w-5 ${isActive ? 'text-primary-600' : 'text-slate-400'}`} />
                {item.label}
              </a>
            );
          })}
        </nav>
      </div>

      <div className="border-t border-slate-200 p-4">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-full bg-primary-100 flex items-center justify-center text-primary-700 font-bold">
            {userProfile?.role === 'admin' ? 'AD' : userProfile?.role === 'secretaire' ? 'SE' : 'TH'}
          </div>
          <div>
            <p className="text-sm font-medium text-slate-900">
              {userProfile?.role === 'admin' ? 'Administrateur' : userProfile?.role === 'secretaire' ? 'Secrétariat' : 'Thérapeute'}
            </p>
            <p className="text-xs text-slate-500 capitalize">{userProfile?.role || 'Chargement...'}</p>
          </div>
        </div>
      </div>
    </div>
  );
}
