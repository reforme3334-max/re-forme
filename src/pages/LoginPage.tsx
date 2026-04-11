import { useState } from 'react';
import { supabase } from '../lib/supabaseClient';
import { Activity, Lock, Mail, AlertCircle } from 'lucide-react';
import { Card, CardContent } from '../components/ui/card';
import { Button } from '../components/ui/button';

export function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      // 1. Authentification via Supabase
      const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (authError) {
        if (authError.message.includes('Email not confirmed')) {
          throw new Error("Veuillez confirmer votre adresse email. (Astuce: Vous pouvez désactiver la confirmation d'email dans les paramètres Supabase).");
        }
        if (authError.message.includes('Invalid login credentials')) {
          throw new Error("Identifiants incorrects. Veuillez vérifier l'email et le mot de passe.");
        }
        throw authError;
      }

      if (authData.user) {
        // 2. Récupération du rôle dans la table profiles
        const { data: profile, error: profileError } = await supabase
          .from('profiles')
          .select('role')
          .eq('id', authData.user.id)
          .single();

        if (profileError || !profile) {
          throw new Error('Profil introuvable ou rôle non défini.');
        }

        // 3. Redirection Intelligente selon le rôle
        const role = profile.role;
        if (role === 'admin') {
          window.location.hash = 'admin/dashboard';
        } else if (role === 'therapeute') {
          window.location.hash = 'app/agenda-pro';
        } else if (role === 'secretaire') {
          window.location.hash = 'app/accueil-secretariat';
        } else if (role === 'patient') {
          window.location.hash = 'espace-patient';
        } else {
          throw new Error('Rôle non reconnu.');
        }
      }
    } catch (err: any) {
      setError(err.message || 'Une erreur est survenue lors de la connexion.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col justify-center items-center p-4 font-sans">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center h-16 w-16 rounded-full bg-mint-100 text-mint-600 mb-4 shadow-sm">
            <Activity className="h-8 w-8" />
          </div>
          <h1 className="text-3xl font-bold text-slate-900 tracking-tight">
            <span className="text-mint-500">Re</span>Forme Center
          </h1>
          <p className="text-slate-500 mt-2 font-medium">Connectez-vous à votre espace</p>
        </div>

        <Card className="shadow-xl border-0 rounded-2xl overflow-hidden">
          <CardContent className="p-8">
            <form onSubmit={handleLogin} className="space-y-6">
              {error && (
                <div className="bg-red-50 border border-red-100 text-red-600 p-4 rounded-xl flex items-start gap-3 text-sm">
                  <AlertCircle className="h-5 w-5 flex-shrink-0 mt-0.5" />
                  <p className="font-medium">{error}</p>
                </div>
              )}

              <div className="space-y-4">
                <div className="space-y-1.5">
                  <label className="text-sm font-semibold text-slate-700">Adresse email</label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                      <Mail className="h-5 w-5 text-slate-400" />
                    </div>
                    <input
                      type="email"
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="block w-full pl-10 pr-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-mint-500/20 focus:border-mint-500 transition-all bg-slate-50 focus:bg-white"
                      placeholder="votre@email.com"
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <label className="text-sm font-semibold text-slate-700">Mot de passe</label>
                    <a href="#" className="text-xs font-medium text-mint-600 hover:text-mint-700">
                      Mot de passe oublié ?
                    </a>
                  </div>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                      <Lock className="h-5 w-5 text-slate-400" />
                    </div>
                    <input
                      type="password"
                      required
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="block w-full pl-10 pr-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-mint-500/20 focus:border-mint-500 transition-all bg-slate-50 focus:bg-white"
                      placeholder="••••••••"
                    />
                  </div>
                </div>
              </div>

              <Button 
                type="submit" 
                className="w-full h-12 text-base font-semibold bg-mint-600 hover:bg-mint-700 text-white rounded-xl shadow-sm transition-all" 
                disabled={loading}
              >
                {loading ? 'Connexion en cours...' : 'Se connecter'}
              </Button>
            </form>
          </CardContent>
        </Card>
        
        <p className="text-center text-sm text-slate-500 mt-8">
          © {new Date().getFullYear()} Re Forme Center. Tous droits réservés.
        </p>
      </div>
    </div>
  );
}
