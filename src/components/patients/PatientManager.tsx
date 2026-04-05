import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { RefreshCw, CheckCircle2, AlertCircle, UserPlus, Users, Phone, Mail } from 'lucide-react';

interface Patient {
  id: string;
  nom: string;
  prenom: string;
  telephone: string;
  email: string;
  created_at: string;
}

export function PatientManager() {
  // Form states
  const [nom, setNom] = useState('');
  const [prenom, setPrenom] = useState('');
  const [tel, setTel] = useState('');
  const [email, setEmail] = useState('');
  
  // UI states
  const [loading, setLoading] = useState(false);
  const [fetching, setFetching] = useState(false);
  const [success, setSuccess] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  
  // Data state
  const [patients, setPatients] = useState<Patient[]>([]);

  // Fetch patients on component mount
  useEffect(() => {
    fetchPatients();
  }, []);

  const fetchPatients = async () => {
    setFetching(true);
    setError(null);
    
    const { data, error: fetchError } = await supabase
      .from('patients')
      .select('*')
      .order('created_at', { ascending: false });

    if (fetchError) {
      setError(`Erreur lors du chargement : ${fetchError.message}`);
    } else {
      setPatients(data || []);
    }
    
    setFetching(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setSuccess(null);

    const { error: insertError } = await supabase
      .from('patients')
      .insert([{ nom, prenom, telephone: tel, email }]);

    setLoading(false);

    if (insertError) {
      setError(`Erreur d'ajout : ${insertError.message}`);
    } else {
      setSuccess('Patient ajouté avec succès !');
      // Reset form
      setNom('');
      setPrenom('');
      setTel('');
      setEmail('');
      // Refresh list
      fetchPatients();
      
      // Clear success message after 3 seconds
      setTimeout(() => setSuccess(null), 3000);
    }
  };

  return (
    <div className="space-y-8 max-w-5xl mx-auto">
      {/* Formulaire d'ajout */}
      <Card className="border-primary-100 shadow-sm">
        <CardHeader className="bg-primary-50/50 border-b border-primary-100 pb-4">
          <CardTitle className="flex items-center gap-2 text-primary-700">
            <UserPlus className="h-5 w-5" />
            Nouveau Patient
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-6">
          <form onSubmit={handleSubmit} className="space-y-6">
            
            {/* Messages de statut */}
            {error && (
              <div className="flex items-center gap-2 p-3 text-sm text-red-700 bg-red-50 rounded-md border border-red-200">
                <AlertCircle className="h-4 w-4 flex-shrink-0" />
                <p>{error}</p>
              </div>
            )}
            {success && (
              <div className="flex items-center gap-2 p-3 text-sm text-mint-700 bg-mint-50 rounded-md border border-mint-200">
                <CheckCircle2 className="h-4 w-4 flex-shrink-0" />
                <p>{success}</p>
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              <div className="space-y-1.5">
                <label htmlFor="nom" className="block text-sm font-medium text-slate-700">Nom *</label>
                <input
                  id="nom"
                  type="text"
                  required
                  value={nom}
                  onChange={(e) => setNom(e.target.value)}
                  className="block w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500/20 transition-all"
                  placeholder="Ex: Dubois"
                />
              </div>
              <div className="space-y-1.5">
                <label htmlFor="prenom" className="block text-sm font-medium text-slate-700">Prénom *</label>
                <input
                  id="prenom"
                  type="text"
                  required
                  value={prenom}
                  onChange={(e) => setPrenom(e.target.value)}
                  className="block w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500/20 transition-all"
                  placeholder="Ex: Thomas"
                />
              </div>
              <div className="space-y-1.5">
                <label htmlFor="tel" className="block text-sm font-medium text-slate-700">Téléphone</label>
                <input
                  id="tel"
                  type="tel"
                  value={tel}
                  onChange={(e) => setTel(e.target.value)}
                  className="block w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500/20 transition-all"
                  placeholder="Ex: 06 12 34 56 78"
                />
              </div>
              <div className="space-y-1.5">
                <label htmlFor="email" className="block text-sm font-medium text-slate-700">Email</label>
                <input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="block w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500/20 transition-all"
                  placeholder="Ex: thomas.dubois@email.com"
                />
              </div>
            </div>

            <div className="flex justify-end pt-2">
              <Button type="submit" disabled={loading} className="min-w-[150px]">
                {loading ? 'Enregistrement...' : 'Enregistrer'}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      {/* Liste des patients */}
      <Card className="shadow-sm">
        <CardHeader className="flex flex-row items-center justify-between border-b border-slate-100 pb-4">
          <CardTitle className="flex items-center gap-2 text-slate-800">
            <Users className="h-5 w-5 text-primary-500" />
            Base de données Patients
          </CardTitle>
          <Button 
            variant="outline" 
            size="sm" 
            onClick={fetchPatients} 
            disabled={fetching}
            className="gap-2"
          >
            <RefreshCw className={`h-4 w-4 ${fetching ? 'animate-spin' : ''}`} />
            Actualiser
          </Button>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead className="text-xs text-slate-500 uppercase bg-slate-50 border-b border-slate-200">
                <tr>
                  <th className="px-6 py-4 font-medium">Patient</th>
                  <th className="px-6 py-4 font-medium">Contact</th>
                  <th className="px-6 py-4 font-medium">Date d'ajout</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {patients.length === 0 ? (
                  <tr>
                    <td colSpan={3} className="px-6 py-8 text-center text-slate-500">
                      {fetching ? 'Chargement des patients...' : 'Aucun patient enregistré pour le moment.'}
                    </td>
                  </tr>
                ) : (
                  patients.map((patient) => (
                    <tr key={patient.id} className="bg-white hover:bg-slate-50 transition-colors">
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          <div className="h-9 w-9 rounded-full bg-primary-100 flex items-center justify-center text-primary-700 font-bold text-sm">
                            {patient.prenom?.[0]}{patient.nom?.[0]}
                          </div>
                          <div>
                            <div className="font-medium text-slate-900">{patient.nom} {patient.prenom}</div>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="space-y-1">
                          {patient.telephone && (
                            <div className="flex items-center gap-2 text-slate-600">
                              <Phone className="h-3 w-3" /> {patient.telephone}
                            </div>
                          )}
                          {patient.email && (
                            <div className="flex items-center gap-2 text-slate-600">
                              <Mail className="h-3 w-3" /> {patient.email}
                            </div>
                          )}
                          {!patient.telephone && !patient.email && (
                            <span className="text-slate-400 italic">Non renseigné</span>
                          )}
                        </div>
                      </td>
                      <td className="px-6 py-4 text-slate-500">
                        {new Date(patient.created_at).toLocaleDateString('fr-FR', {
                          day: '2-digit',
                          month: 'short',
                          year: 'numeric'
                        })}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
