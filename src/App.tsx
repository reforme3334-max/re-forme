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
import { AppointmentNotificationsProvider } from './contexts/AppointmentNotificationsContext';

export default function App() {
  const [currentRoute, setCurrentRoute] = useState('login');
  const [selectedPatientId, setSelectedPatientId] = useState<string | null>(() => {
    try {
      return localStorage.getItem('reforme_preview_patient_id');
    } catch {
      return null;
    }
  });

  useEffect(() => {
    const handleHashChange = () => {
      const hash = window.location.hash.replace('#', '') || 'login';
      setCurrentRoute(hash);
      if (hash === 'patient-detail' && !selectedPatientId) {
        try {
          const savedId = localStorage.getItem('reforme_preview_patient_id');
          if (savedId) setSelectedPatientId(savedId);
        } catch {}
      }
    };

    window.addEventListener('hashchange', handleHashChange);
    handleHashChange(); // Initial check

    return () => window.removeEventListener('hashchange', handleHashChange);
  }, [selectedPatientId]);

  const handleSelectPatient = (id: string) => {
    setSelectedPatientId(id);
    try {
      localStorage.setItem('reforme_preview_patient_id', id);
    } catch {}
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
      case 'dashboard':
        return (
          <ProtectedRoute allowedRoles={['admin']}>
            <Dashboard onSelectPatient={handleSelectPatient} />
          </ProtectedRoute>
        );
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
          <ProtectedRoute allowedPermissions={['agenda']}>
            <Agenda />
          </ProtectedRoute>
        );
    }
  };

  if (currentRoute === 'login') {
    return <LoginPage />;
  }

  return (
    <AppointmentNotificationsProvider>
      {currentRoute === 'espace-patient' ? (
        <ProtectedRoute allowedRoles={['patient', 'admin', 'therapeute', 'secretaire']}>
          <PatientPortal />
        </ProtectedRoute>
      ) : (
        <Layout>
          {renderContent()}
        </Layout>
      )}
    </AppointmentNotificationsProvider>
  );
}
