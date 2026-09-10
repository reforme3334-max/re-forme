import { useState, useEffect, useMemo } from 'react';
import { Users, Wallet, Activity, AlertCircle, Send, Calendar, Lock, Mail, AlertTriangle, Phone, Clock } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { LineChart, Line, PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { supabase } from '../lib/supabaseClient';
import { Button } from '../components/ui/button';
import { 
  fetchAllRows, 
  getBillDate, 
  getDateRange, 
  getPreviousDateRange, 
  isDateInRange, 
  calcTrend 
} from '../lib/financeUtils';

// Components
const StatCard = ({ title, value, icon: Icon, description, colorClass = "text-indigo-600", bgClass = "bg-indigo-50", trend, trendType = "positive" }: any) => {
  const isUp = trend !== undefined && trend > 0;
  const isDown = trend !== undefined && trend < 0;
  
  let isGood = isUp;
  if (trendType === "negative") isGood = isDown; // for things like unpaid bills where down is good
  
  const trendColor = isGood 
    ? 'bg-emerald-100 text-emerald-700' 
    : (trend === 0 ? 'bg-slate-100 text-slate-600' : 'bg-rose-100 text-rose-700');

  return (
    <Card className="border-0 shadow-sm">
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-sm font-medium text-slate-500">{title}</CardTitle>
        <div className={`h-8 w-8 rounded-full flex items-center justify-center ${bgClass}`}>
          <Icon className={`h-4 w-4 ${colorClass}`} />
        </div>
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold text-slate-900">{value}</div>
        {(description || trend !== undefined) && (
          <div className="flex items-center gap-2 mt-1 min-h-[20px]">
            {trend !== undefined && (
              <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${trendColor}`}>
                {isUp ? '+' : ''}{typeof trend === 'number' ? trend.toFixed(1) : trend}%
              </span>
            )}
            <span className="text-xs text-slate-500 truncate">
              {description}
            </span>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export function Dashboard({ onSelectPatient }: { onSelectPatient?: (id: string) => void }) {
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('month');
  const [customDate, setCustomDate] = useState(new Date().toISOString().split('T')[0]);
  const [rawData, setRawData] = useState({ 
    billings: [] as any[], 
    patients: [] as any[], 
    appointments: [] as any[], 
    treatments: [] as any[],
    therapists: [] as any[]
  });

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [patients, billings, rawAppointments, treatments, therapists] = await Promise.all([
        fetchAllRows('patients', 'id, nom, prenom, created_at, pathologie, telephone, email, nombre_seances'),
        fetchAllRows('billings', 'id, patient_id, appointment_id, montant, statut, date_facturation', { column: 'date_facturation', ascending: false }),
        fetchAllRows('appointments', 'id, patient_id, therapist_id, date_heure, statut, notes_seance', { column: 'date_heure', ascending: false }),
        fetchAllRows('treatments', '*'),
        fetchAllRows('therapists', 'id, nom, prenom, specialite')
      ]);

      const appointments = (rawAppointments || []).map(app => {
        let cleanNotes = app.notes_seance || '';
        let resolvedTherapistId = app.therapist_id;
        
        if (cleanNotes.includes('||TH_ID:')) {
          const match = cleanNotes.match(/\|\|TH_ID:([a-f0-9-]+)\|\|(.*)/s);
          if (match) {
            resolvedTherapistId = match[1];
            cleanNotes = match[2];
          }
        }
        
        return {
          ...app,
          therapist_id: resolvedTherapistId,
          notes_seance: cleanNotes
        };
      });

      setRawData({
        patients: patients || [],
        billings: billings || [],
        appointments: appointments || [],
        treatments: treatments || [],
        therapists: therapists || []
      });
    } catch (err) {
      console.error('Unexpected error in fetchData:', err);
    } finally {
      setLoading(false);
    }
  };

  const dashboardData = useMemo(() => {
    const now = new Date();
    const dateRange = getDateRange(filter, customDate);
    const prevDateRange = getPreviousDateRange(filter, customDate);
    const filterLabel = dateRange.label;

    // 1. CA (selon filtre et période précédente)
    const paidBillings = rawData.billings.filter(b => b.statut === 'Payé');
    
    const ca = paidBillings
      .filter(b => isDateInRange(getBillDate(b), dateRange))
      .reduce((sum, b) => sum + (Number(b.montant) || 0), 0);
      
    const prevCa = prevDateRange.startDate 
      ? paidBillings
          .filter(b => isDateInRange(getBillDate(b), prevDateRange))
          .reduce((sum, b) => sum + (Number(b.montant) || 0), 0)
      : undefined;
      
    const caTrend = calcTrend(ca, prevCa);

    // 2. Nouveaux Patients
    const nouveauxPatients = rawData.patients
      .filter(p => isDateInRange(p.created_at || new Date(), dateRange)).length;
      
    const prevNouveauxPatients = prevDateRange.startDate
      ? rawData.patients.filter(p => isDateInRange(p.created_at || new Date(), prevDateRange)).length
      : undefined;
      
    const patientsTrend = calcTrend(nouveauxPatients, prevNouveauxPatients);

    // 3. Taux de Présence au lieu de Taux d'Occupation
    const presentAppts = rawData.appointments.filter(a => isDateInRange(a.date_heure, dateRange) && a.statut === 'Effectué').length;
    const pastAppts = rawData.appointments.filter(a => isDateInRange(a.date_heure, dateRange) && (new Date(a.date_heure) < now)).length;
    const occupation = pastAppts > 0 ? Math.round((presentAppts / pastAppts) * 100) : 100;
    
    // Total Séances (for the 6th card)
    const booked = rawData.appointments.filter(a => isDateInRange(a.date_heure, dateRange)).length;
    const prevBooked = prevDateRange.startDate
      ? rawData.appointments.filter(a => isDateInRange(a.date_heure, prevDateRange)).length
      : undefined;
    const seancesTrend = calcTrend(booked, prevBooked);
    
    const prevPresentAppts = prevDateRange.startDate
      ? rawData.appointments.filter(a => isDateInRange(a.date_heure, prevDateRange) && a.statut === 'Effectué').length
      : 0;
    const prevPastAppts = prevDateRange.startDate
      ? rawData.appointments.filter(a => isDateInRange(a.date_heure, prevDateRange) && (new Date(a.date_heure) < now)).length
      : 0;
    const prevOccupation = prevPastAppts > 0 ? Math.round((prevPresentAppts / prevPastAppts) * 100) : 100;
    const occupationTrend = prevDateRange.startDate ? occupation - prevOccupation : undefined;

    // 4. Impayés (Total global)
    const unpaidBillings = rawData.billings.filter(b => b.statut === 'Impayé' || b.statut === 'En attente' || b.statut === 'Rejeté');
    const billedAppIds = new Set(rawData.billings.map(b => b.appointment_id).filter(Boolean));
    const extraUnpaidAppts = rawData.appointments.filter(a => a.statut === 'Impayé' && !billedAppIds.has(a.id));
    const extraUnpaidAmount = extraUnpaidAppts.length * 200;

    const impayesTotal = unpaidBillings.reduce((sum, b) => sum + (Number(b.montant) || 0), 0) + extraUnpaidAmount;

    // 5. Patients sans accès
    const patientsSansAcces = rawData.patients.filter(p => !p.has_access);

    // LineChart: 6 derniers mois de chiffre d'affaires
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
    paidBillings.forEach(b => {
      const d = getBillDate(b);
      const match = last6Months.find(m => m.month === d.getMonth() && m.year === d.getFullYear());
      if (match) match.DH += Number(b.montant) || 0;
    });

    // BarChart: Team workload
    const teamMap = new Map();
    if (rawData.therapists && rawData.therapists.length > 0) {
      rawData.therapists.forEach(t => {
        const fullName = `${t.prenom} ${t.nom}`;
        teamMap.set(fullName, 0);
      });
    } else {
      teamMap.set('Mr HADDAOUI Younes', 0);
    }

    const therapistsMap = new Map<string, string>(
      rawData.therapists ? rawData.therapists.map(t => [t.id, `${t.prenom} ${t.nom}`]) : []
    );

    rawData.appointments.filter(a => isDateInRange(a.date_heure, dateRange)).forEach(a => {
      let therapistName = 'Mr HADDAOUI Younes';
      if (a.therapist_id) {
        therapistName = therapistsMap.get(a.therapist_id) || `Thérapeute ${a.therapist_id.substring(0,4)}`;
      }
      teamMap.set(therapistName, (teamMap.get(therapistName) || 0) + 1);
    });
    const teamChartData = Array.from(teamMap, ([name, seances]) => ({ name, seances }));

    // PieChart: Care types (Motifs)
    const actsMap = new Map();
    rawData.appointments.filter(a => isDateInRange(a.date_heure, dateRange)).forEach(a => {
      const act = a.treatments?.motif || a.notes_seance || a.motif || 'Général';
      actsMap.set(act, (actsMap.get(act) || 0) + 1);
    });
    const actsChartData = Array.from(actsMap, ([name, value]) => ({ name, value })).sort((a,b) => b.value - a.value).slice(0, 8);
    if (actsChartData.length === 0) actsChartData.push({ name: 'Aucun soin', value: 1 });

    // PieChart: Pathologies
    const pathologyMap = new Map();
    const patientIdsWithAppointments = new Set(
      rawData.appointments
        .filter(a => isDateInRange(a.date_heure, dateRange))
        .map(a => a.patient_id)
        .filter(Boolean)
    );

    rawData.patients.forEach(p => {
      if (patientIdsWithAppointments.has(p.id)) {
        let patho = p.pathologie ? p.pathologie.trim() : 'Non renseignée';
        patho = patho.charAt(0).toUpperCase() + patho.slice(1);
        pathologyMap.set(patho, (pathologyMap.get(patho) || 0) + 1);
      }
    });
    const pathologyChartData = Array.from(pathologyMap, ([name, value]) => ({ name, value }))
      .sort((a,b) => b.value - a.value)
      .slice(0, 8);
    
    if (pathologyChartData.length === 0) {
      pathologyChartData.push({ name: 'Aucune donnée', value: 1 });
    }

    // Top 5 Impayés
    const unpaidMap = new Map();
    const patientsMap = new Map(rawData.patients.map(p => [p.id, p]));
    
    unpaidBillings.forEach(b => {
      const p = (b.patients as any) || patientsMap.get(b.patient_id);
      if (p) {
        const pName = `${p.prenom} ${p.nom}`;
        const current = unpaidMap.get(p.id) || { name: pName, amount: 0, sessions: 0, email: p.email };
        current.amount += Number(b.montant) || 0;
        current.sessions += 1;
        unpaidMap.set(p.id, current);
      }
    });

    extraUnpaidAppts.forEach(a => {
      const p = patientsMap.get(a.patient_id) as any;
      if (p) {
        const pName = `${p.prenom} ${p.nom}`;
        const current = unpaidMap.get(p.id) || { name: pName, amount: 0, sessions: 0, email: p.email };
        current.amount += 200;
        current.sessions += 1;
        unpaidMap.set(p.id, current);
      }
    });

    const topUnpaidList = Array.from(unpaidMap.values()).sort((a: any, b: any) => b.amount - a.amount).slice(0, 5);

    // Compute Attendance Alerts (Patients who stopped coming / did not complete their sessions)
    const attendanceAlerts: any[] = [];
    const nowLocalDate = new Date();
    
    rawData.patients.forEach(p => {
      // Find all appointments for this patient
      const pAppts = rawData.appointments.filter(a => a.patient_id === p.id);
      
      // Filter into completed (statut === 'Effectué')
      const completedAppts = pAppts.filter(a => a.statut === 'Effectué');
      
      // Filter into upcoming (date is in the future)
      const upcomingAppts = pAppts.filter(a => {
        const apptDate = new Date(a.date_heure);
        return apptDate >= nowLocalDate;
      });

      const completedCount = completedAppts.length;
      const hasUpcoming = upcomingAppts.length > 0;

      // Find the last completed appointment date; fallback to completed or some past appointment
      let lastApptDate: Date | null = null;
      if (completedAppts.length > 0) {
        const sortedCompleted = [...completedAppts].sort((a, b) => new Date(b.date_heure).getTime() - new Date(a.date_heure).getTime());
        lastApptDate = new Date(sortedCompleted[0].date_heure);
      } else if (pAppts.length > 0) {
        const pastAppts = pAppts.filter(a => new Date(a.date_heure) < nowLocalDate);
        if (pastAppts.length > 0) {
          const sortedPast = [...pastAppts].sort((a, b) => new Date(b.date_heure).getTime() - new Date(a.date_heure).getTime());
          lastApptDate = new Date(sortedPast[0].date_heure);
        }
      }

      // Check if patient has prescribed sessions
      let prescribedSessions = p.nombre_seances || 0;
      
      // Or in active treatments
      const activeTreatments = rawData.treatments?.filter(t => t.patient_id === p.id && t.statut === 'En cours') || [];
      if (activeTreatments.length > 0) {
        prescribedSessions = activeTreatments[0].nombre_seances_prescrites || prescribedSessions;
      }

      if (prescribedSessions > 0 && completedCount < prescribedSessions && !hasUpcoming) {
        attendanceAlerts.push({
          patientId: p.id,
          nom: p.nom,
          prenom: p.prenom,
          type: 'uncompleted',
          title: 'Séances incomplètes',
          badgeColor: 'bg-amber-100 text-amber-800 border-amber-200',
          message: `${completedCount}/${prescribedSessions} séance(s) effectuée(s) (aucun RDV prévu)`,
          email: p.email,
          telephone: p.telephone,
          lastSessionDate: lastApptDate,
          completedCount,
          prescribedSessions
        });
      } else if (lastApptDate && !hasUpcoming) {
        // Calculate days of inactivity
        const diffMs = nowLocalDate.getTime() - lastApptDate.getTime();
        const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
        if (diffDays >= 14) {
          attendanceAlerts.push({
            patientId: p.id,
            nom: p.nom,
            prenom: p.prenom,
            type: 'discontinued',
            title: 'Arrêt de soins (Inactif)',
            badgeColor: 'bg-rose-100 text-rose-800 border-rose-200',
            message: `Inactif depuis ${diffDays} jours (dernière séance le ${lastApptDate.toLocaleDateString('fr-FR')})`,
            email: p.email,
            telephone: p.telephone,
            lastSessionDate: lastApptDate,
            completedCount,
            prescribedSessions,
            inactiveDays: diffDays
          });
        }
      }
    });

    // Sort alerts by urgency (discontinued first, then by duration of inactivity)
    attendanceAlerts.sort((a, b) => {
      if (a.type === 'discontinued' && b.type !== 'discontinued') return -1;
      if (a.type !== 'discontinued' && b.type === 'discontinued') return 1;
      return (b.inactiveDays || 0) - (a.inactiveDays || 0);
    });

    return {
      ca,
      caTrend,
      nouveauxPatients,
      patientsTrend,
      occupation,
      occupationTrend,
      booked,
      seancesTrend,
      impayesTotal,
      filterLabel,
      last6Months,
      teamChartData,
      actsChartData,
      pathologyChartData,
      topUnpaidList,
      patientsSansAccesCount: patientsSansAcces.length,
      patientsSansAccesList: patientsSansAcces.slice(0, 10),
      attendanceAlerts: attendanceAlerts
    };
  }, [rawData, filter, customDate]);

  const [pieToggle, setPieToggle] = useState<'motifs' | 'pathologies'>('motifs');

  const handleRelance = (patient: any) => {
    if (patient.email) {
      window.location.href = `mailto:${patient.email}?subject=Relance de paiement - Re Forme Center&body=Bonjour ${patient.name},%0D%0A%0D%0ANous vous contactons concernant un solde en attente de ${patient.amount} DH pour vos ${patient.sessions} dernières séances.%0D%0A%0D%0AMerci de régulariser votre situation.%0D%0A%0D%0ACordialement,%0D%0AL'équipe Re Forme Center`;
    } else {
      alert(`Aucun email renseigné pour ${patient.name}. Veuillez le contacter par téléphone.`);
    }
  };

  const handleFollowUpAttendance = (alertItem: any) => {
    if (alertItem.email) {
      const subject = encodeURIComponent("Suivi de votre traitement - Cabinet Re Forme");
      const text = `Bonjour ${alertItem.prenom} ${alertItem.nom},\n\nNous faisons le suivi de votre dossier thérapeutique chez Cabinet Re Forme.\n\n${alertItem.type === 'uncompleted' ? `Nous constatons que vous avez réalisé ${alertItem.completedCount} séances sur les ${alertItem.prescribedSessions} prescrites pour votre traitement en cours, et qu'aucun nouveau rendez-vous n'est planifié.` : `Votre dernière séance remonte au ${alertItem.lastSessionDate ? new Date(alertItem.lastSessionDate).toLocaleDateString('fr-FR') : 'quelques semaines'} et aucun rendez-vous de suivi n'est programmé.`}\n\nPour assurer la continuité des soins et l'efficacité de votre rétablissement, nous vous invitons à planifier vos prochaines séances.\n\nVous pouvez le faire directement en ligne sur votre Espace Patient ou en contactant notre secrétariat.\n\nBien cordialement,\nL'équipe Cabinet Re Forme`;
      window.location.href = `mailto:${alertItem.email}?subject=${subject}&body=${encodeURIComponent(text)}`;
    } else {
      alert(`Aucun email enregistré pour ${alertItem.prenom} ${alertItem.nom}. Veuillez contacter directement le patient par téléphone au ${alertItem.telephone || 'Non renseigné'}.`);
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
        <div className="flex items-center gap-2">
          {filter === 'exact' && (
            <input
              type="date"
              value={customDate}
              onChange={(e) => setCustomDate(e.target.value)}
              className="p-1.5 text-sm border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none shadow-sm"
            />
          )}
          <div className="flex items-center gap-2 bg-white p-1.5 rounded-xl border border-slate-200 shadow-sm">
            <Calendar className="h-4 w-4 text-slate-400 ml-2" />
            <select
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              className="bg-transparent border-none text-sm font-medium text-slate-700 focus:ring-0 cursor-pointer py-1 pr-8 pl-2 outline-none"
            >
              <option value="all">Tout le temps</option>
              <option value="exact">Date exacte</option>
              <option value="today">Aujourd'hui</option>
              <option value="7days">7 derniers jours</option>
              <option value="week">Cette semaine</option>
              <option value="month">Ce mois</option>
              <option value="year">Cette année</option>
            </select>
          </div>
        </div>
      </div>

      {/* 1. Composants de Statistiques (Top Bar) */}
      <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
        <StatCard 
          title={`Chiffre d'Affaires (${dashboardData.filterLabel})`}
          value={`${dashboardData.ca.toLocaleString()} DH`} 
          icon={Wallet} 
          description="Total encaissé"
          trend={dashboardData.caTrend}
          colorClass="text-indigo-600"
          bgClass="bg-indigo-50"
        />
        <StatCard 
          title={`Séances (${dashboardData.filterLabel})`} 
          value={dashboardData.booked} 
          icon={Activity} 
          description="Séances effectuées ou prévues"
          trend={dashboardData.seancesTrend}
          colorClass="text-cyan-600"
          bgClass="bg-cyan-50"
        />
        <StatCard 
          title="Nouveaux Patients" 
          value={dashboardData.nouveauxPatients} 
          icon={Users} 
          description={dashboardData.filterLabel}
          trend={dashboardData.patientsTrend}
          colorClass="text-blue-600"
          bgClass="bg-blue-50"
        />
        <StatCard 
          title="Taux de Présence" 
          value={`${dashboardData.occupation}%`} 
          icon={Calendar} 
          description="Séances honorées vs passées"
          trend={dashboardData.occupationTrend}
          colorClass="text-emerald-600"
          bgClass="bg-emerald-50"
        />
        <StatCard 
          title="Impayés (Total global)" 
          value={`${dashboardData.impayesTotal.toLocaleString()} DH`} 
          icon={AlertCircle} 
          description="En attente de paiement"
          trendType="negative"
          colorClass="text-rose-600"
          bgClass="bg-rose-50"
        />
        <StatCard 
          title="Patients sans accès" 
          value={dashboardData.patientsSansAccesCount} 
          icon={Lock} 
          description="Portail non généré"
          trendType="negative"
          colorClass="text-amber-600"
          bgClass="bg-amber-50"
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
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-base font-semibold text-slate-800">Répartition des Soins</CardTitle>
            <div className="flex bg-slate-100 p-1 rounded-lg">
              <button 
                onClick={() => setPieToggle('motifs')}
                className={`px-2 py-1 text-[10px] font-bold uppercase rounded-md transition-all ${pieToggle === 'motifs' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
              >
                Motifs
              </button>
              <button 
                onClick={() => setPieToggle('pathologies')}
                className={`px-2 py-1 text-[10px] font-bold uppercase rounded-md transition-all ${pieToggle === 'pathologies' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
              >
                Pathologies
              </button>
            </div>
          </CardHeader>
          <CardContent>
            <div className="h-[300px] w-full flex flex-col items-center justify-center">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={pieToggle === 'motifs' ? dashboardData.actsChartData : dashboardData.pathologyChartData}
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={80}
                    paddingAngle={5}
                    dataKey="value"
                    label={({ name, percent }) => `${(percent * 100).toFixed(0)}%`}
                  >
                    {(pieToggle === 'motifs' ? dashboardData.actsChartData : dashboardData.pathologyChartData).map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={PIE_COLORS[index % PIE_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip 
                    contentStyle={{borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)'}} 
                    formatter={(value: number) => [`${value} ${pieToggle === 'motifs' ? 'séances' : 'patients'}`, 'Total']}
                  />
                  <Legend verticalAlign="bottom" height={36} iconType="circle" wrapperStyle={{ fontSize: '11px' }} />
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
                  <YAxis dataKey="name" type="category" stroke="#64748b" fontSize={11} tickLine={false} axisLine={false} width={130} />
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

      {/* 3.5. Suivi de l'Assiduité & Alertes d'activité */}
      <div className="grid gap-4 grid-cols-1">
        <Card className="border-0 shadow-sm border-t-4 border-t-amber-500">
          <CardHeader className="pb-2">
            <CardTitle className="text-base font-semibold flex items-center justify-between text-slate-800">
              <span className="flex items-center gap-2">
                <AlertTriangle className="h-5 w-5 text-amber-500" />
                Alertes d'Assiduité : Patients inactifs ou séances incomplètes
              </span>
              <span className="bg-amber-50 text-amber-800 border border-amber-200 rounded-full px-2.5 py-0.5 text-xs font-bold">
                {dashboardData.attendanceAlerts.length} alertes actives
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left">
                <thead className="text-xs text-slate-500 uppercase bg-slate-50 rounded-t-lg">
                  <tr>
                    <th className="px-4 py-3 font-medium rounded-tl-lg">Patient</th>
                    <th className="px-4 py-3 font-medium">Type d'alerte</th>
                    <th className="px-4 py-3 font-medium">Détails du suivi</th>
                    <th className="px-4 py-3 font-medium text-center rounded-tr-lg">Actions de relance</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {dashboardData.attendanceAlerts.length > 0 ? (
                    dashboardData.attendanceAlerts.slice(0, 5).map((alertItem: any, index: number) => (
                      <tr key={index} className="hover:bg-slate-50/50 transition-colors">
                        <td className="px-4 py-3 font-semibold text-slate-900">
                          {alertItem.prenom} {alertItem.nom}
                        </td>
                        <td className="px-4 py-3">
                          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold border ${alertItem.badgeColor}`}>
                            {alertItem.type === 'discontinued' ? <Clock className="h-3 w-3" /> : <AlertCircle className="h-3 w-3" />}
                            {alertItem.title}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-slate-600 text-xs">
                          {alertItem.message}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center justify-center gap-2">
                            <Button 
                              size="sm" 
                              variant="outline" 
                              className="h-8 text-xs text-indigo-600 border-indigo-200 hover:bg-indigo-50 hover:text-indigo-700" 
                              onClick={() => handleFollowUpAttendance(alertItem)}
                            >
                              <Send className="h-3 w-3 mr-1.5" /> Recommander RDV
                            </Button>
                            {alertItem.telephone && (
                              <Button 
                                size="sm" 
                                variant="ghost" 
                                className="h-8 text-xs text-slate-600 hover:bg-slate-50" 
                                onClick={() => window.location.href = `tel:${alertItem.telephone}`}
                                title={`Appeler le ${alertItem.telephone}`}
                              >
                                <Phone className="h-3 w-3" />
                              </Button>
                            )}
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-8 text-xs text-slate-600 hover:bg-slate-50"
                              onClick={() => onSelectPatient ? onSelectPatient(alertItem.patientId) : window.location.hash = `patients`}
                            >
                              Fiche
                            </Button>
                          </div>
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={4} className="px-4 py-8 text-center text-slate-500 italic text-sm">
                        Aucun arrêt de traitement ou séance incomplète à signaler. Tous vos patients poursuivent assidûment leurs séances ! 🎉
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            {dashboardData.attendanceAlerts.length > 5 && (
              <div className="mt-4 text-center">
                <p className="text-xs text-slate-400 italic">Et {dashboardData.attendanceAlerts.length - 5} autres alertes d'assiduité actives...</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* 4. Pathologies Fréquentes */}
      <div className="mt-4">
        <Card className="border-0 shadow-sm">
          <CardHeader>
            <CardTitle className="text-base font-semibold text-slate-800 flex items-center gap-2">
              <Activity className="h-5 w-5 text-indigo-500" />
              Pathologies les plus fréquentes ({dashboardData.filterLabel})
            </CardTitle>
          </CardHeader>
          <CardContent>
            {dashboardData.pathologyChartData.filter(p => p.name !== 'Aucune donnée').length > 0 ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                {dashboardData.pathologyChartData.filter(p => p.name !== 'Aucune donnée').map((p, i) => (
                  <div key={i} className="p-4 rounded-xl bg-slate-50 border border-slate-100 flex flex-col gap-1 hover:bg-slate-100 transition-colors">
                    <span className="text-[10px] font-bold text-indigo-600 uppercase tracking-widest truncate" title={p.name}>{p.name}</span>
                    <div className="flex items-baseline gap-1">
                      <span className="text-2xl font-bold text-slate-900">{p.value}</span>
                      <span className="text-xs text-slate-500 font-medium">patients</span>
                    </div>
                    <div className="w-full bg-slate-200 h-1 rounded-full mt-2 overflow-hidden">
                      <div 
                        className="h-full bg-indigo-500 rounded-full" 
                        style={{ width: `${(p.value / Math.max(...dashboardData.pathologyChartData.map(x => x.value))) * 100}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="py-8 text-center text-slate-500 text-sm">
                Aucune donnée de pathologie pour cette période.
              </div>
            )}
          </CardContent>
        </Card>
      </div>
      
      {/* 5. Patients sans accès */}
      <div className="mt-4">
        <Card className="border-0 shadow-sm border-t-4 border-t-amber-500">
          <CardHeader className="pb-2">
            <CardTitle className="text-base font-semibold flex items-center gap-2 text-slate-800">
              <Lock className="h-5 w-5 text-amber-500" />
              Patients sans accès Portail
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto mt-2">
              <div className="bg-amber-50 text-amber-800 p-3 rounded-lg text-xs mb-4 border border-amber-100 italic">
                <strong>Note :</strong> Cette liste affiche les patients n'ayant pas encore d'accès au portail généré. 
                Une fois l'accès généré dans la fiche patient, ils disparaîtront de cette liste de vigilance.
              </div>
              <table className="w-full text-sm text-left">
                <thead className="text-xs text-slate-500 uppercase bg-slate-50 rounded-t-lg">
                  <tr>
                    <th className="px-4 py-3 font-medium rounded-tl-lg">Patient</th>
                    <th className="px-4 py-3 font-medium">Contact</th>
                    <th className="px-4 py-3 font-medium text-center rounded-tr-lg">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {dashboardData.patientsSansAccesList.length > 0 ? dashboardData.patientsSansAccesList.map((p, i) => (
                    <tr key={i} className="border-b border-slate-50 hover:bg-slate-50/50 transition-colors last:border-0">
                      <td className="px-4 py-3 font-medium text-slate-900">{p.nom} {p.prenom}</td>
                      <td className="px-4 py-3 text-slate-600">
                        <div className="text-xs">
                          {p.email ? <div className="flex items-center gap-1"><Mail className="h-3 w-3" /> {p.email}</div> : null}
                          {p.tel ? <div className="flex items-center gap-1"><Send className="h-3 w-3" /> {p.tel}</div> : null}
                          {!p.email && !p.tel ? <span className="text-rose-500 font-bold">Aucun contact !</span> : null}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <Button 
                          size="sm" 
                          variant="ghost" 
                          className="h-8 text-xs text-indigo-600 hover:bg-indigo-50" 
                          onClick={() => onSelectPatient ? onSelectPatient(p.id) : window.location.hash = `patients`}
                        >
                          Gérer l'accès
                        </Button>
                      </td>
                    </tr>
                  )) : (
                    <tr>
                      <td colSpan={3} className="px-4 py-8 text-center text-slate-500">
                        Tous les patients ont un accès configuré. Magnifique !
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
              {dashboardData.patientsSansAccesCount > 10 && (
                <div className="mt-4 text-center">
                  <p className="text-xs text-slate-400 italic">Et {dashboardData.patientsSansAccesCount - 10} autres patients...</p>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
