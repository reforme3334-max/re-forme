import React, { useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

interface NewPatientFormProps {
  onSuccess: () => void;
  onCancel: () => void;
}

export function NewPatientForm({ onSuccess, onCancel }: NewPatientFormProps) {
  const [nom, setNom] = useState('');
  const [prenom, setPrenom] = useState('');
  const [tel, setTel] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    // Insertion dans la table 'patients' via Supabase
    const { error: supabaseError } = await supabase
      .from('patients')
      .insert([
        { nom, prenom, telephone: tel }
      ]);

    setLoading(false);

    if (supabaseError) {
      setError(supabaseError.message);
    } else {
      onSuccess();
    }
  };

  return (
    <Card className="w-full max-w-lg mx-auto mt-8">
      <CardHeader>
        <CardTitle>Enregistrer un nouveau patient</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <div className="p-3 text-sm text-red-600 bg-red-50 rounded-md border border-red-200">
              Erreur : {error}
              <br/>
              <span className="text-xs mt-1 block">
                (Note: Vérifiez vos règles RLS dans Supabase si l'accès est refusé)
              </span>
            </div>
          )}
          
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label htmlFor="nom" className="block text-sm font-medium text-slate-700">Nom *</label>
              <input
                id="nom"
                type="text"
                required
                value={nom}
                onChange={(e) => setNom(e.target.value)}
                className="block w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
                placeholder="Ex: HADDAOUI"
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
                className="block w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
                placeholder="Ex: Jean"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <label htmlFor="tel" className="block text-sm font-medium text-slate-700">Téléphone</label>
            <input
              id="tel"
              type="tel"
              value={tel}
              onChange={(e) => setTel(e.target.value)}
              className="block w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
              placeholder="Ex: 06 12 34 56 78"
            />
          </div>

          <div className="flex justify-end gap-3 pt-4 border-t border-slate-100 mt-6">
            <Button type="button" variant="outline" onClick={onCancel}>
              Annuler
            </Button>
            <Button type="submit" disabled={loading}>
              {loading ? 'Enregistrement...' : 'Enregistrer le patient'}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
