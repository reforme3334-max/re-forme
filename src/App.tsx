import { useState, useEffect } from 'react';
import { Layout } from './components/layout/Layout';
import { Dashboard } from './pages/Dashboard';
import { Agenda } from './pages/Agenda';
import { Patients } from './pages/Patients';
import { PatientDetail } from './pages/PatientDetail';
import { PatientPortal } from './pages/PatientPortal';
import { LoginPage } from './pages/LoginPage';
import { Settings } from './pages/Settings';
import { Finance } from './pages/Finance';
import { ProtectedRoute } from './components/auth/ProtectedRoute';

export default function App() {
  const [currentRoute, setCurrentRoute] = useState('login');
  const [selectedPatientId, setSelectedPatientId] = useState<string | null>(null);

  useEffect(() => {
    const handleHashChange = () => {
      const hash = window.location.hash.replace('#', '') || 'login';
      setCurrentRoute(hash);
      if (hash !== 'patient-detail') {
        setSelectedPatientId(null);
      }
    };

    window.addEventListener('hashchange', handleHashChange);
    handleHashChange(); // Initial check

    return () => window.removeEventListener('hashchange', handleHashChange);
  }, []);

  const handleSelectPatient = (id: string) => {
    setSelectedPatientId(id);
    window.location.hash = 'patient-detail';
  };

  const renderContent = () => {
    if (currentRoute === 'patient-detail' && selectedPatientId) {
      return (
        <ProtectedRoute allowedPermissions={['patients']}>
          <PatientDetail patientId={selectedPatientId} />
        </ProtectedRoute>
      );
    }

    switch (currentRoute) {
      case 'admin/dashboard':
      case 'dashboard':
        return (
          <ProtectedRoute allowedRoles={['admin']}>
            <Dashboard />
          </ProtectedRoute>
        );
      case 'app/agenda-pro':
      case 'agenda':
        return (
          <ProtectedRoute allowedPermissions={['agenda']}>
            <Agenda />
          </ProtectedRoute>
        );
      case 'patients':
        return (
          <ProtectedRoute allowedPermissions={['patients']}>
            <Patients onSelectPatient={handleSelectPatient} />
          </ProtectedRoute>
        );
      case 'app/accueil-secretariat':
        return (
          <ProtectedRoute allowedPermissions={['agenda', 'patients']}>
            <Dashboard /> {/* Placeholder pour l'accueil secrétariat */}
          </ProtectedRoute>
        );
      case 'settings':
        return (
          <ProtectedRoute allowedPermissions={['settings']}>
            <Settings />
          </ProtectedRoute>
        );
      case 'finance':
        return (
          <ProtectedRoute allowedPermissions={['finance_recettes', 'finance_depenses_view', 'finance_depenses_edit']}>
            <Finance />
          </ProtectedRoute>
        );
      default:
        return (
          <ProtectedRoute allowedPermissions={['agenda', 'patients', 'finance_recettes', 'finance_depenses_view', 'finance_depenses_edit', 'settings']}>
            <Dashboard />
          </ProtectedRoute>
        );
    }
  };

  if (currentRoute === 'login') {
    return <LoginPage />;
  }

  return (
    currentRoute === 'espace-patient' ? (
      <ProtectedRoute allowedRoles={['patient']}>
        <PatientPortal />
      </ProtectedRoute>
    ) : (
      <Layout>
        {renderContent()}
      </Layout>
    )
  );
}
