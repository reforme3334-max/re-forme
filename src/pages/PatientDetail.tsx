import { useState } from 'react';
import { User, Phone, Mail, Calendar, FileText, Clock, Activity, Plus } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Badge } from '../components/ui/badge';
import { mockPatients } from '../data/mockData';

export function PatientDetail() {
  // In a real app, this ID would come from URL params
  const patient = mockPatients[0];
  const [activeTab, setActiveTab] = useState('dossier');

  const remainingSessions = patient.active_treatment.seances_prescrites - patient.active_treatment.seances_effectuees;
  const progressPercentage = (patient.active_treatment.seances_effectuees / patient.active_treatment.seances_prescrites) * 100;

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      {/* Header Profile */}
      <div className="flex flex-col md:flex-row gap-6 items-start md:items-center justify-between bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
        <div className="flex items-center gap-5">
          <div className="h-20 w-20 rounded-full bg-primary-100 flex items-center justify-center text-primary-700 text-2xl font-bold">
            {patient.prenom[0]}{patient.nom[0]}
          </div>
          <div>
            <h1 className="text-2xl font-bold text-slate-900">{patient.prenom} {patient.nom}</h1>
            <div className="flex flex-wrap items-center gap-4 mt-2 text-sm text-slate-500">
              <span className="flex items-center gap-1.5"><Calendar className="h-4 w-4" /> {new Date(patient.date_naissance).toLocaleDateString('fr-FR')}</span>
              <span className="flex items-center gap-1.5"><Phone className="h-4 w-4" /> {patient.tel}</span>
              <span className="flex items-center gap-1.5"><Mail className="h-4 w-4" /> {patient.email}</span>
            </div>
          </div>
        </div>
        <div className="flex gap-3 w-full md:w-auto">
          <Button variant="outline" className="flex-1 md:flex-none">Modifier</Button>
          <Button className="flex-1 md:flex-none gap-2"><Plus className="h-4 w-4" /> Nouveau RDV</Button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex space-x-1 border-b border-slate-200">
        <button 
          onClick={() => setActiveTab('dossier')}
          className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${activeTab === 'dossier' ? 'border-primary-500 text-primary-600' : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'}`}
        >
          Dossier de Soins
        </button>
        <button 
          onClick={() => setActiveTab('historique')}
          className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${activeTab === 'historique' ? 'border-primary-500 text-primary-600' : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'}`}
        >
          Historique RDV
        </button>
        <button 
          onClick={() => setActiveTab('facturation')}
          className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${activeTab === 'facturation' ? 'border-primary-500 text-primary-600' : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'}`}
        >
          Facturation
        </button>
      </div>

      {/* Tab Content */}
      {activeTab === 'dossier' && (
        <div className="grid gap-6 md:grid-cols-3">
          {/* Left Column */}
          <div className="md:col-span-2 space-y-6">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle className="flex items-center gap-2">
                  <Activity className="h-5 w-5 text-primary-500" />
                  Traitement Actuel
                </CardTitle>
                <Badge variant="success">En cours</Badge>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div>
                    <h4 className="text-sm font-medium text-slate-500">Motif de consultation</h4>
                    <p className="text-base font-medium text-slate-900 mt-1">{patient.active_treatment.motif}</p>
                  </div>
                  
                  <div className="pt-4 border-t border-slate-100">
                    <div className="flex justify-between text-sm mb-2">
                      <span className="font-medium text-slate-700">Progression des séances</span>
                      <span className="text-slate-500">{patient.active_treatment.seances_effectuees} / {patient.active_treatment.seances_prescrites}</span>
                    </div>
                    <div className="h-2.5 w-full bg-slate-100 rounded-full overflow-hidden">
                      <div 
                        className="h-full bg-mint-500 rounded-full transition-all duration-500"
                        style={{ width: `${progressPercentage}%` }}
                      ></div>
                    </div>
                    <p className="text-xs text-slate-500 mt-2 text-right">
                      {remainingSessions} séance{remainingSessions > 1 ? 's' : ''} restante{remainingSessions > 1 ? 's' : ''}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle className="flex items-center gap-2">
                  <FileText className="h-5 w-5 text-primary-500" />
                  Notes de séance
                </CardTitle>
                <Button variant="outline" size="sm">Ajouter une note</Button>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="border-l-2 border-primary-200 pl-4 pb-4">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-sm font-semibold text-slate-900">Séance #8</span>
                      <span className="text-xs text-slate-500">03 Avril 2026</span>
                    </div>
                    <p className="text-sm text-slate-600">Bonne progression. Flexion du genou améliorée à 110°. Moins de douleur signalée lors de la marche. Poursuite du renforcement musculaire.</p>
                  </div>
                  <div className="border-l-2 border-slate-200 pl-4 pb-4">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-sm font-semibold text-slate-900">Séance #7</span>
                      <span className="text-xs text-slate-500">30 Mars 2026</span>
                    </div>
                    <p className="text-sm text-slate-600">Travail sur la proprioception. Légère inflammation en fin de séance, application de glace.</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Right Column */}
          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Antécédents & Notes</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-slate-600 whitespace-pre-line">
                  {patient.notes_antecedents || 'Aucun antécédent renseigné.'}
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Prochain RDV</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-start gap-3 p-3 bg-primary-50 rounded-lg border border-primary-100">
                  <Clock className="h-5 w-5 text-primary-600 mt-0.5" />
                  <div>
                    <p className="font-medium text-primary-900">Demain à 11h00</p>
                    <p className="text-sm text-primary-700 mt-0.5">Durée: 30 min</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      )}
    </div>
  );
}
