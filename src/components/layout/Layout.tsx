import React, { useState } from 'react';
import { Sidebar } from './Sidebar';
import { Menu, Calendar } from 'lucide-react';
import { Button } from '../ui/button';
import { NotificationCenter } from '../notifications/NotificationCenter';

export function Layout({ children }: { children: React.ReactNode }) {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <div className="flex h-screen bg-slate-50">
      {/* Mobile sidebar backdrop */}
      {sidebarOpen && (
        <div 
          className="fixed inset-0 z-20 bg-slate-900/50 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <div className={`fixed inset-y-0 left-0 z-30 w-64 transform bg-white border-r border-slate-200 transition-transform duration-200 ease-in-out lg:static lg:translate-x-0 ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}`}>
        <Sidebar onClose={() => setSidebarOpen(false)} />
      </div>

      {/* Main content */}
      <div className="flex flex-1 flex-col overflow-hidden">
        {/* Desktop Header */}
        <header className="hidden lg:flex h-16 items-center justify-between border-b border-slate-200 bg-white px-8 flex-shrink-0">
          <div className="flex items-center gap-3">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-400 bg-slate-100 px-2.5 py-1 rounded-md">
              Centre de Kinésithérapie
            </span>
            <span className="text-slate-300">•</span>
            <span className="text-xs text-slate-500 font-medium">
              Espace Administratif & Secrétariat
            </span>
          </div>

          <div className="flex items-center gap-3">
            {/* Direct link to patient portal demo */}
            <a
              href="#espace-patient"
              className="text-xs font-bold text-mint-700 bg-mint-50 hover:bg-mint-100 border border-mint-200/80 px-3 py-1.5 rounded-xl transition-all"
            >
              Portail Patient (Démo)
            </a>

            <div className="h-5 w-px bg-slate-200" />

            {/* Notification Bell */}
            <NotificationCenter />
          </div>
        </header>

        {/* Mobile header */}
        <header className="flex h-16 items-center justify-between border-b border-slate-200 bg-white px-4 lg:hidden flex-shrink-0">
          <div className="flex items-center gap-2 text-primary-600 font-bold text-xl">
            <span className="text-mint-500">Re</span>Forme
          </div>
          <div className="flex items-center gap-2">
            <NotificationCenter />
            <Button variant="ghost" size="icon" onClick={() => setSidebarOpen(true)}>
              <Menu className="h-6 w-6" />
            </Button>
          </div>
        </header>

        {/* Main scrollable area */}
        <main className="flex-1 overflow-y-auto p-4 md:p-6 lg:p-8">
          {children}
        </main>
      </div>
    </div>
  );
}
