import { PatientManager } from '../components/patients/PatientManager';

export function Patients({ onSelectPatient }: { onSelectPatient: (id: string) => void }) {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">Gestion des Patients</h1>
        <p className="text-slate-500">Ajoutez de nouveaux patients et consultez la base de données du cabinet.</p>
      </div>
      
      <PatientManager onSelectPatient={onSelectPatient} />
    </div>
  );
}
