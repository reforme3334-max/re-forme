import { useEffect, useState } from 'react';
import { LayoutDashboard, CalendarDays, Users, FileText, Settings, X } from 'lucide-react';
import { Button } from '../ui/button';

interface SidebarProps {
  onClose: () => void;
}

export function Sidebar({ onClose }: SidebarProps) {
  const [currentHash, setCurrentHash] = useState(window.location.hash || '#dashboard');

  useEffect(() => {
    const handleHashChange = () => {
      setCurrentHash(window.location.hash || '#dashboard');
    };
    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, []);

  const navItems = [
    { icon: LayoutDashboard, label: 'Dashboard', href: '#dashboard' },
    { icon: CalendarDays, label: 'Agenda', href: '#agenda' },
    { icon: Users, label: 'Patients', href: '#patients' },
    { icon: FileText, label: 'Facturation', href: '#billing' },
    { icon: Settings, label: 'Paramètres', href: '#settings' },
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
          {navItems.map((item) => {
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
            DR
          </div>
          <div>
            <p className="text-sm font-medium text-slate-900">Dr. Dupont</p>
            <p className="text-xs text-slate-500">Kinésithérapeute</p>
          </div>
        </div>
      </div>
    </div>
  );
}
