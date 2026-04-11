import { useState, useEffect, useMemo } from 'react';
import { Users, Wallet, Activity, AlertCircle, Send, Calendar } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { LineChart, Line, PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { supabase } from '../lib/supabaseClient';
import { Button } from '../components/ui/button';

// Components
const StatCard = ({ title, value, icon: Icon, description, colorClass = "text-indigo-600", bgClass = "bg-indigo-50" }: any) => (
  <Card className="border-0 shadow-sm">
    <CardHeader className="flex flex-row items-center justify-between pb-2">
      <CardTitle className="text-sm font-medium text-slate-500">{title}</CardTitle>
      <div className={`h-8 w-8 rounded-full flex items-center justify-center ${bgClass}`}>
        <Icon className={`h-4 w-4 ${colorClass}`} />
      </div>
    </CardHeader>
    <CardContent>
      <div className="text-2xl font-bold text-slate-900">{value}</div>
      {description && (
        <p className="text-xs mt-1 text-slate-500">
          {description}
        </p>
      )}
    </CardContent>
  </Card>
);

export function Dashboard() {
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('month');
  const [rawData, setRawData] = useState({ billings: [] as any[], patients: [] as any[], appointments: [] as any[] });

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    const { data: patients } = await supabase.from('patients').select('id, created_at');
    const { data: billings } = await supabase.from('billings').select('*, patients(nom, prenom, email)');
    const { data: appointments } = await supabase.from('appointments').select('*');
    
    setRawData({
      patients: patients || [],
      billings: billings || [],
      appointments: appointments || []
    });
    setLoading(false);
  };

  const dashboardData = useMemo(() => {
    const now = new Date();
    let startDate = new Date();
    let filterLabel = "Ce mois";
    
    if (filter === '7days') {
      startDate.setDate(now.getDate() - 7);
      filterLabel = "7 derniers jours";
    } else if (filter === 'month') {
      startDate = new Date(now.getFullYear(), now.getMonth(), 1);
      filterLabel = "Ce mois";
    } else if (filter === 'year') {
      startDate = new Date(now.getFullYear(), 0, 1);
      filterLabel = "Cette année";
    }

    // 1. CA Mensuel (ou selon filtre)
    const ca = rawData.billings
      .filter(b => new Date(b.created_at || new Date()) >= startDate && (b.statut === 'Payé' || b.statut === 'Effectué' || !b.statut))
      .reduce((sum, b) => sum + Number(b.montant), 0);

    // 2. Nouveaux Patients
    const nouveauxPatients = rawData.patients
      .filter(p => new Date(p.created_at || new Date()) >= startDate).length;

    // 3. Taux d'Occupation
    const days = filter === '7days' ? 7 : filter === 'month' ? 30 : 365;
    const capacity = days * 15; // Estimation de 15 créneaux par jour
    const booked = rawData.appointments.filter(a => new Date(a.date_heure) >= startDate).length;
    const occupation = capacity > 0 ? Math.min(Math.round((booked / capacity) * 100), 100) : 0;

    // 4. Impayés (Total global)
    const impayesTotal = rawData.billings
      .filter(b => b.statut === 'Impayé' || b.statut === 'En attente')
      .reduce((sum, b) => sum + Number(b.montant), 0);

    // LineChart: 6 months revenue
    const last6Months = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      last6Months.push({
        month: d.getMonth(),
        year: d.getFullYear(),
        name: d.toLocaleDateString('fr-FR', { month: 'short' }),
        DH: 0
      });
    }
    rawData.billings.forEach(b => {
      if (b.statut === 'Payé' || b.statut === 'Effectué' || !b.statut) {
        const d = new Date(b.created_at || new Date());
        const match = last6Months.find(m => m.month === d.getMonth() && m.year === d.getFullYear());
        if (match) match.DH += Number(b.montant);
      }
    });

    // BarChart: Team workload
    const teamMap = new Map();
    rawData.appointments.filter(a => new Date(a.date_heure) >= startDate).forEach(a => {
      const therapist = a.therapeute_id ? `Thérapeute ${a.therapeute_id.substring(0,4)}` : 'Dr. Dupont';
      teamMap.set(therapist, (teamMap.get(therapist) || 0) + 1);
    });
    const teamChartData = Array.from(teamMap, ([name, seances]) => ({ name, seances }));
    if (teamChartData.length === 0) teamChartData.push({ name: 'Dr. Dupont', seances: 0 });

    // PieChart: Care types
    const actsMap = new Map();
    rawData.appointments.filter(a => new Date(a.date_heure) >= startDate).forEach(a => {
      const act = a.motif || 'Général';
      actsMap.set(act, (actsMap.get(act) || 0) + 1);
    });
    const actsChartData = Array.from(actsMap, ([name, value]) => ({ name, value })).sort((a,b) => b.value - a.value).slice(0, 5);
    if (actsChartData.length === 0) actsChartData.push({ name: 'Aucun soin', value: 1 });

    // Top 5 Impayés
    const unpaidMap = new Map();
    rawData.billings.filter(b => b.statut === 'Impayé' || b.statut === 'En attente').forEach(b => {
      if (b.patients) {
        const pName = `${b.patients.prenom} ${b.patients.nom}`;
        const current = unpaidMap.get(pName) || { name: pName, amount: 0, sessions: 0, email: b.patients.email };
        current.amount += Number(b.montant);
        current.sessions += 1;
        unpaidMap.set(pName, current);
      }
    });
    const topUnpaidList = Array.from(unpaidMap.values()).sort((a, b) => b.amount - a.amount).slice(0, 5);

    return {
      ca,
      nouveauxPatients,
      occupation,
      impayesTotal,
      filterLabel,
      last6Months,
      teamChartData,
      actsChartData,
      topUnpaidList
    };
  }, [rawData, filter]);

  const handleRelance = (patient: any) => {
    if (patient.email) {
      window.location.href = `mailto:${patient.email}?subject=Relance de paiement - Re Forme Center&body=Bonjour ${patient.name},%0D%0A%0D%0ANous vous contactons concernant un solde en attente de ${patient.amount} DH pour vos ${patient.sessions} dernières séances.%0D%0A%0D%0AMerci de régulariser votre situation.%0D%0A%0D%0ACordialement,%0D%0AL'équipe Re Forme Center`;
    } else {
      alert(`Aucun email renseigné pour ${patient.name}. Veuillez le contacter par téléphone.`);
    }
  };

  // Palette Pro: Bleu, Émeraude, Indigo
  const PIE_COLORS = ['#3b82f6', '#10b981', '#6366f1', '#8b5cf6', '#0ea5e9'];

  if (loading) {
    return (
      <div className="p-8 flex justify-center items-center min-h-[60vh]">
        <Activity className="h-8 w-8 text-indigo-500 animate-pulse" />
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-7xl mx-auto font-sans">
      {/* Header & Filters */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Dashboard Principal</h1>
          <p className="text-slate-500 mt-1">Vue d'ensemble des performances du cabinet.</p>
        </div>
        <div>
          <select
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            className="bg-white border border-slate-200 text-slate-700 text-sm rounded-lg focus:ring-indigo-500 focus:border-indigo-500 block w-full p-2.5 shadow-sm outline-none font-medium"
          >
            <option value="7days">7 derniers jours</option>
            <option value="month">Ce mois</option>
            <option value="year">Cette année</option>
          </select>
        </div>
      </div>

      {/* 1. Composants de Statistiques (Top Bar) */}
      <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard 
          title={`Chiffre d'Affaires (${dashboardData.filterLabel})`}
          value={`${dashboardData.ca} DH`} 
          icon={Wallet} 
          description="Total encaissé"
          colorClass="text-indigo-600"
          bgClass="bg-indigo-50"
        />
        <StatCard 
          title="Nouveaux Patients" 
          value={dashboardData.nouveauxPatients} 
          icon={Users} 
          description={dashboardData.filterLabel}
          colorClass="text-blue-600"
          bgClass="bg-blue-50"
        />
        <StatCard 
          title="Taux d'Occupation" 
          value={`${dashboardData.occupation}%`} 
          icon={Calendar} 
          description="Créneaux réservés vs libres"
          colorClass="text-emerald-600"
          bgClass="bg-emerald-50"
        />
        <StatCard 
          title="Impayés (Total)" 
          value={`${dashboardData.impayesTotal} DH`} 
          icon={AlertCircle} 
          description="Séances non réglées"
          colorClass="text-rose-600"
          bgClass="bg-rose-50"
        />
      </div>

      {/* 2. Graphiques Interactifs */}
      <div className="grid gap-4 grid-cols-1 lg:grid-cols-3">
        {/* LineChart (Évolution) */}
        <Card className="lg:col-span-2 border-0 shadow-sm">
          <CardHeader>
            <CardTitle className="text-base font-semibold text-slate-800">Évolution des Revenus (6 derniers mois)</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-[300px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={dashboardData.last6Months}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                  <XAxis dataKey="name" stroke="#94a3b8" fontSize={12} tickLine={false} axisLine={false} />
                  <YAxis stroke="#94a3b8" fontSize={12} tickLine={false} axisLine={false} tickFormatter={(value) => `${value} DH`} />
                  <Tooltip 
                    contentStyle={{borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)'}} 
                    formatter={(value: number) => [`${value} DH`, 'Revenus']}
                  />
                  <Line type="monotone" dataKey="DH" stroke="#6366f1" strokeWidth={3} dot={{r: 4, fill: '#6366f1', strokeWidth: 2, stroke: '#fff'}} activeDot={{r: 6}} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        {/* PieChart (Répartition) */}
        <Card className="border-0 shadow-sm">
          <CardHeader>
            <CardTitle className="text-base font-semibold text-slate-800">Répartition des Soins</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-[300px] w-full flex flex-col items-center justify-center">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={dashboardData.actsChartData}
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={80}
                    paddingAngle={5}
                    dataKey="value"
                  >
                    {dashboardData.actsChartData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={PIE_COLORS[index % PIE_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip contentStyle={{borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)'}} />
                  <Legend verticalAlign="bottom" height={36} iconType="circle" />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* 3. Liste de Vigilance & BarChart */}
      <div className="grid gap-4 grid-cols-1 lg:grid-cols-2">
        {/* BarChart (Équipe) */}
        <Card className="border-0 shadow-sm">
          <CardHeader>
            <CardTitle className="text-base font-semibold text-slate-800">Charge de Travail de l'Équipe</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-[250px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={dashboardData.teamChartData} layout="vertical" margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#f1f5f9" />
                  <XAxis type="number" stroke="#94a3b8" fontSize={12} tickLine={false} axisLine={false} />
                  <YAxis dataKey="name" type="category" stroke="#64748b" fontSize={12} tickLine={false} axisLine={false} width={100} />
                  <Tooltip 
                    cursor={{fill: '#f8fafc'}} 
                    contentStyle={{borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)'}} 
                    formatter={(value: number) => [`${value} séances`, 'Activité']}
                  />
                  <Bar dataKey="seances" fill="#3b82f6" radius={[0, 4, 4, 0]} maxBarSize={40} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        {/* Liste de Vigilance (Top 5 Impayés) */}
        <Card className="border-0 shadow-sm border-t-4 border-t-rose-500">
          <CardHeader className="pb-2">
            <CardTitle className="text-base font-semibold flex items-center gap-2 text-slate-800">
              <AlertCircle className="h-5 w-5 text-rose-500" />
              Liste de Vigilance : Top 5 Impayés
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto mt-2">
              <table className="w-full text-sm text-left">
                <thead className="text-xs text-slate-500 uppercase bg-slate-50 rounded-t-lg">
                  <tr>
                    <th className="px-4 py-3 font-medium rounded-tl-lg">Patient</th>
                    <th className="px-4 py-3 font-medium text-center">Séances dues</th>
                    <th className="px-4 py-3 font-medium text-right">Montant</th>
                    <th className="px-4 py-3 font-medium text-center rounded-tr-lg">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {dashboardData.topUnpaidList.length > 0 ? dashboardData.topUnpaidList.map((p, i) => (
                    <tr key={i} className="border-b border-slate-50 hover:bg-slate-50/50 transition-colors last:border-0">
                      <td className="px-4 py-3 font-medium text-slate-900">{p.name}</td>
                      <td className="px-4 py-3 text-center text-slate-600">
                        <span className="bg-slate-100 px-2 py-1 rounded-md text-xs font-medium">{p.sessions}</span>
                      </td>
                      <td className="px-4 py-3 text-right font-bold text-rose-600">{p.amount} DH</td>
                      <td className="px-4 py-3 text-center">
                        <Button 
                          size="sm" 
                          variant="outline" 
                          className="h-8 text-xs text-indigo-600 border-indigo-200 hover:bg-indigo-50 hover:text-indigo-700" 
                          onClick={() => handleRelance(p)}
                        >
                          <Send className="h-3 w-3 mr-1.5" /> Relancer
                        </Button>
                      </td>
                    </tr>
                  )) : (
                    <tr>
                      <td colSpan={4} className="px-4 py-8 text-center text-slate-500">
                        Aucun impayé à signaler. Excellent !
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
