import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabaseClient';
import { Shield, Users, UserPlus, Mail, Lock, AlertCircle, CheckCircle, Activity, Save, CheckSquare, Square } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';

const PERMISSIONS_LIST = [
  { id: 'agenda', label: 'Agenda' },
  { id: 'patients', label: 'Dossiers Patients' },
  { id: 'finance_stats', label: 'Finance (Statistiques & CA)' },
  { id: 'finance_recettes', label: 'Finance (Recettes)' },
  { id: 'finance_depenses_view', label: 'Finance (Dépenses - Lecture seule)' },
  { id: 'finance_depenses_edit', label: 'Finance (Dépenses - Modification)' },
  { id: 'settings', label: 'Paramètres du cabinet' }
];

export function Settings() {
  const [activeTab, setActiveTab] = useState('equipe');
  const [profiles, setProfiles] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // Form state
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState('therapeute');
  const [createLoading, setCreateLoading] = useState(false);
  const [message, setMessage] = useState({ type: '', text: '' });

  useEffect(() => {
    fetchProfiles();
  }, []);

  const fetchProfiles = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .neq('role', 'patient')
      .order('created_at', { ascending: false });

    if (data) {
      // Ensure permissions is an array
      const formattedData = data.map(p => ({
        ...p,
        permissions: p.permissions || []
      }));
      setProfiles(formattedData);
    }
    setLoading(false);
  };

  const handleUpdateRole = async (id: string, newRole: string) => {
    const { error } = await supabase
      .from('profiles')
      .update({ role: newRole })
      .eq('id', id);

    if (!error) {
      fetchProfiles(); // Refresh list
    } else {
      alert("Erreur lors de la mise à jour du rôle.");
    }
  };

  const handleTogglePermission = async (profileId: string, permissionId: string, currentPermissions: string[]) => {
    const newPermissions = currentPermissions.includes(permissionId)
      ? currentPermissions.filter(p => p !== permissionId)
      : [...currentPermissions, permissionId];

    // Optimistic update
    setProfiles(profiles.map(p => p.id === profileId ? { ...p, permissions: newPermissions } : p));

    const { error } = await supabase
      .from('profiles')
      .update({ permissions: newPermissions })
      .eq('id', profileId);

    if (error) {
      console.error(error);
      alert("Erreur lors de la mise à jour des permissions. Assurez-vous d'avoir exécuté le script SQL pour ajouter la colonne 'permissions' (JSONB) à la table 'profiles'.");
      fetchProfiles(); // Revert on error
    }
  };

  const handleCreateAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreateLoading(true);
    setMessage({ type: '', text: '' });

    try {
      // 1. Create auth user
      const { data: authData, error: authError } = await supabase.auth.signUp({
        email,
        password,
      });

      if (authError) throw authError;

      if (authData.user) {
        // Default permissions based on role
        let defaultPermissions: string[] = [];
        if (role === 'admin') {
          defaultPermissions = PERMISSIONS_LIST.map(p => p.id);
        } else if (role === 'secretaire') {
          defaultPermissions = ['agenda', 'patients', 'finance_recettes', 'finance_depenses_edit'];
        } else if (role === 'therapeute') {
          defaultPermissions = ['agenda', 'patients'];
        }

        // 2. Create profile with role and permissions
        const { error: profileError } = await supabase
          .from('profiles')
          .upsert([
            { id: authData.user.id, role: role, permissions: defaultPermissions }
          ]);

        if (profileError) throw profileError;

        setMessage({ type: 'success', text: 'Compte collaborateur créé avec succès !' });
        setEmail('');
        setPassword('');
        fetchProfiles();
      }
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message || 'Erreur lors de la création du compte.' });
    } finally {
      setCreateLoading(false);
    }
  };

  return (
    <div className="p-8 max-w-6xl mx-auto font-sans">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Paramètres du cabinet</h1>
        <p className="text-slate-500 mt-1">Gérez votre équipe, les rôles et les permissions d'accès à l'application.</p>
      </div>

      <div className="flex flex-col md:flex-row gap-8">
        {/* Sidebar Settings */}
        <div className="w-full md:w-64 flex-shrink-0 space-y-2">
          <button
            onClick={() => setActiveTab('equipe')}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-semibold transition-colors ${
              activeTab === 'equipe'
                ? 'bg-primary-50 text-primary-700'
                : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
            }`}
          >
            <Users className={`h-5 w-5 ${activeTab === 'equipe' ? 'text-primary-600' : 'text-slate-400'}`} />
            Gestion de l'équipe
          </button>
          <button
            onClick={() => setActiveTab('create')}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-semibold transition-colors ${
              activeTab === 'create'
                ? 'bg-primary-50 text-primary-700'
                : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
            }`}
          >
            <UserPlus className={`h-5 w-5 ${activeTab === 'create' ? 'text-primary-600' : 'text-slate-400'}`} />
            Nouveau collaborateur
          </button>
        </div>

        {/* Content Area */}
        <div className="flex-1">
          {activeTab === 'equipe' && (
            <Card className="border-0 shadow-sm rounded-2xl overflow-hidden">
              <CardHeader className="bg-white border-b border-slate-100 pb-6">
                <CardTitle className="text-lg flex items-center gap-2">
                  <Shield className="h-5 w-5 text-primary-500" />
                  Répartition des rôles et permissions
                </CardTitle>
                <p className="text-sm text-slate-500 mt-1.5">
                  Cochez les modules auxquels chaque collaborateur a accès.
                </p>
              </CardHeader>
              <CardContent className="p-0">
                {loading ? (
                  <div className="p-8 flex justify-center">
                    <Activity className="h-8 w-8 text-primary-500 animate-pulse" />
                  </div>
                ) : (
                  <div className="divide-y divide-slate-100">
                    {profiles.length === 0 ? (
                      <div className="p-8 text-center text-slate-500">Aucun collaborateur trouvé.</div>
                    ) : (
                      profiles.map((profile) => (
                        <div key={profile.id} className="p-6 flex flex-col gap-4 hover:bg-slate-50 transition-colors">
                          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                            <div>
                              <div className="flex items-center gap-2 mb-1">
                                <span className="font-mono text-xs text-slate-400 bg-slate-100 px-2 py-1 rounded-md">
                                  ID: {profile.id.substring(0, 8)}...
                                </span>
                                {profile.role === 'admin' && (
                                  <span className="bg-purple-100 text-purple-700 text-xs font-bold px-2 py-0.5 rounded-full">Admin</span>
                                )}
                              </div>
                              <p className="text-sm text-slate-600">
                                Inscrit le {new Date(profile.created_at).toLocaleDateString('fr-FR')}
                              </p>
                            </div>
                            
                            <div className="flex items-center gap-3">
                              <select
                                value={profile.role}
                                onChange={(e) => handleUpdateRole(profile.id, e.target.value)}
                                className="text-sm border border-slate-200 rounded-lg px-3 py-2 bg-white focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 outline-none"
                              >
                                <option value="admin">Administrateur</option>
                                <option value="therapeute">Thérapeute</option>
                                <option value="secretaire">Secrétaire</option>
                              </select>
                            </div>
                          </div>

                          {/* Permissions Checklist */}
                          <div className="mt-2 pt-4 border-t border-slate-100">
                            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">Permissions d'accès</p>
                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                              {PERMISSIONS_LIST.map(perm => {
                                const hasPermission = profile.permissions?.includes(perm.id);
                                return (
                                  <button
                                    key={perm.id}
                                    onClick={() => handleTogglePermission(profile.id, perm.id, profile.permissions || [])}
                                    className={`flex items-center gap-2 p-2 rounded-lg border text-left transition-colors ${
                                      hasPermission 
                                        ? 'bg-primary-50 border-primary-200 text-primary-700' 
                                        : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                                    }`}
                                  >
                                    {hasPermission ? (
                                      <CheckSquare className="h-4 w-4 text-primary-600 flex-shrink-0" />
                                    ) : (
                                      <Square className="h-4 w-4 text-slate-400 flex-shrink-0" />
                                    )}
                                    <span className="text-sm font-medium">{perm.label}</span>
                                  </button>
                                );
                              })}
                            </div>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {activeTab === 'create' && (
            <Card className="border-0 shadow-sm rounded-2xl overflow-hidden">
              <CardHeader className="bg-white border-b border-slate-100 pb-6">
                <CardTitle className="text-lg flex items-center gap-2">
                  <UserPlus className="h-5 w-5 text-primary-500" />
                  Créer un compte collaborateur
                </CardTitle>
                <p className="text-sm text-slate-500 mt-1.5">
                  Ajoutez un nouveau membre à votre équipe. Il pourra se connecter immédiatement avec ces identifiants.
                </p>
              </CardHeader>
              <CardContent className="p-6">
                <form onSubmit={handleCreateAccount} className="space-y-6 max-w-md">
                  {message.text && (
                    <div className={`p-4 rounded-xl flex items-start gap-3 text-sm ${
                      message.type === 'error' ? 'bg-red-50 text-red-700 border border-red-100' : 'bg-mint-50 text-mint-700 border border-mint-100'
                    }`}>
                      {message.type === 'error' ? <AlertCircle className="h-5 w-5 flex-shrink-0" /> : <CheckCircle className="h-5 w-5 flex-shrink-0" />}
                      <p className="font-medium mt-0.5">{message.text}</p>
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
                          className="block w-full pl-10 pr-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 transition-all bg-slate-50 focus:bg-white"
                          placeholder="email@cabinet.com"
                        />
                      </div>
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-sm font-semibold text-slate-700">Mot de passe provisoire</label>
                      <div className="relative">
                        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                          <Lock className="h-5 w-5 text-slate-400" />
                        </div>
                        <input
                          type="password"
                          required
                          minLength={6}
                          value={password}
                          onChange={(e) => setPassword(e.target.value)}
                          className="block w-full pl-10 pr-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 transition-all bg-slate-50 focus:bg-white"
                          placeholder="Minimum 6 caractères"
                        />
                      </div>
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-sm font-semibold text-slate-700">Rôle attribué</label>
                      <select
                        value={role}
                        onChange={(e) => setRole(e.target.value)}
                        className="block w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 transition-all bg-slate-50 focus:bg-white outline-none"
                      >
                        <option value="therapeute">Thérapeute</option>
                        <option value="secretaire">Secrétaire</option>
                        <option value="admin">Administrateur</option>
                      </select>
                    </div>
                  </div>

                  <Button 
                    type="submit" 
                    className="w-full h-11 text-base font-semibold" 
                    disabled={createLoading}
                  >
                    {createLoading ? 'Création en cours...' : 'Créer le compte'}
                  </Button>
                  
                  <p className="text-xs text-slate-500 text-center mt-4">
                    Note : Selon la configuration de votre projet Supabase, la création d'un compte peut nécessiter une validation par email.
                  </p>
                </form>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
