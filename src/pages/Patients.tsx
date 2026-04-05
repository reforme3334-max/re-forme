import { useState } from 'react';
import { Search, Filter, MoreVertical, Eye } from 'lucide-react';
import { Card, CardContent } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { mockPatients } from '../data/mockData';

export function Patients({ onSelectPatient }: { onSelectPatient: (id: string) => void }) {
  const [searchTerm, setSearchTerm] = useState('');

  const filteredPatients = mockPatients.filter(p => 
    p.nom.toLowerCase().includes(searchTerm.toLowerCase()) || 
    p.prenom.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Patients</h1>
          <p className="text-slate-500">Gérez vos dossiers patients et leurs traitements.</p>
        </div>
        <Button>Nouveau Patient</Button>
      </div>

      <Card>
        <div className="p-4 border-b border-slate-200 flex flex-col sm:flex-row gap-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <input 
              type="text" 
              placeholder="Rechercher un patient..." 
              className="w-full pl-9 pr-4 py-2 rounded-md border border-slate-200 focus:outline-none focus:ring-2 focus:ring-primary-500 text-sm"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          <Button variant="outline" className="gap-2">
            <Filter className="h-4 w-4" /> Filtres
          </Button>
        </div>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead className="text-xs text-slate-500 uppercase bg-slate-50 border-b border-slate-200">
                <tr>
                  <th className="px-6 py-3 font-medium">Patient</th>
                  <th className="px-6 py-3 font-medium">Contact</th>
                  <th className="px-6 py-3 font-medium">Traitement Actif</th>
                  <th className="px-6 py-3 font-medium text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredPatients.map((patient) => (
                  <tr key={patient.id} className="bg-white border-b border-slate-100 hover:bg-slate-50 transition-colors">
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div className="h-8 w-8 rounded-full bg-primary-100 flex items-center justify-center text-primary-700 font-bold text-xs">
                          {patient.prenom[0]}{patient.nom[0]}
                        </div>
                        <div>
                          <div className="font-medium text-slate-900">{patient.nom} {patient.prenom}</div>
                          <div className="text-xs text-slate-500">{new Date(patient.date_naissance).toLocaleDateString('fr-FR')}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="text-slate-900">{patient.tel}</div>
                      <div className="text-xs text-slate-500">{patient.email}</div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="text-slate-900 truncate max-w-[200px]">{patient.active_treatment.motif}</div>
                      <div className="text-xs text-slate-500">
                        {patient.active_treatment.seances_effectuees}/{patient.active_treatment.seances_prescrites} séances
                      </div>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <div className="flex justify-end gap-2">
                        <Button variant="ghost" size="icon" onClick={() => onSelectPatient(patient.id)}>
                          <Eye className="h-4 w-4 text-slate-500" />
                        </Button>
                        <Button variant="ghost" size="icon">
                          <MoreVertical className="h-4 w-4 text-slate-500" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
