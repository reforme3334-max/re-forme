import { useState, useEffect } from 'react';
import { Layout } from './components/layout/Layout';
import { Dashboard } from './pages/Dashboard';
import { Agenda } from './pages/Agenda';
import { Patients } from './pages/Patients';
import { PatientDetail } from './pages/PatientDetail';

export default function App() {
  const [currentRoute, setCurrentRoute] = useState('dashboard');
  const [selectedPatientId, setSelectedPatientId] = useState<string | null>(null);

  useEffect(() => {
    const handleHashChange = () => {
      const hash = window.location.hash.replace('#', '') || 'dashboard';
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
      return <PatientDetail />;
    }

    switch (currentRoute) {
      case 'dashboard':
        return <Dashboard />;
      case 'agenda':
        return <Agenda />;
      case 'patients':
        return <Patients onSelectPatient={handleSelectPatient} />;
      default:
        return <Dashboard />;
    }
  };

  return (
    <Layout>
      {renderContent()}
    </Layout>
  );
}
