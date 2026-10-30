import React, { useState, useEffect, useMemo } from 'react';
import { supabase } from '../lib/supabaseClient';
import {
  Wallet,
  TrendingUp,
  TrendingDown,
  Activity,
  Calendar,
  ArrowUpRight,
  ArrowDownRight,
  FileSpreadsheet,
  Plus,
  AlertCircle,
  Trophy,
  Users,
  CheckCircle2,
  ChevronRight,
  ChevronDown,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Modal } from '../components/ui/modal';
import * as XLSX from 'xlsx';
import { fetchAllRows, getBillDate, getDateRange, isDateInRange } from '../lib/financeUtils';
import { resolveOrBindCollaboratorSession, parseCollaboratorProfile } from '../lib/teamUtils';
import {
  SPORTS_DISCIPLINES,
  PartnerClub,
  parsePatientMutuelle,
  fetchPartnerClubs,
  upsertPartnerClub,
} from '../lib/mutuelleUtils';

export function Finance() {
  const [activeTab, setActiveTab] = useState<'recettes' | 'impayer' | 'clubs' | 'depenses'>('recettes');
  const [billings, setBillings] = useState<any[]>([]);
  const [unpaidBillings, setUnpaidBillings] = useState<any[]>([]);
  const [expenses, setExpenses] = useState<any[]>([]);
  const [patientsList, setPatientsList] = useState<any[]>([]);
  const [appointmentsList, setAppointmentsList] = useState<any[]>([]);
  const [partnerClubs, setPartnerClubs] = useState<PartnerClub[]>([]);
  const [loading, setLoading] = useState(true);
  const [userProfile, setUserProfile] = useState<any>(null);
  const [dateFilter, setDateFilter] = useState('month');
  const [customDate, setCustomDate] = useState(new Date().toISOString().split('T')[0]);
  const [clubFilterInTables, setClubFilterInTables] = useState<string>('all');
  const [expandedClubName, setExpandedClubName] = useState<string | null>(null);

  // Inline feedback banner (replaces blocked window.alert)
  const [feedback, setFeedback] = useState<{ type: '' | 'success' | 'error'; text: string }>({
    type: '',
    text: '',
  });

  // Modal state: Expense
  const [isExpenseModalOpen, setIsExpenseModalOpen] = useState(false);
  const [newExpense, setNewExpense] = useState({
    amount: '',
    category: 'Matériel',
    description: '',
    date: new Date().toISOString().split('T')[0],
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSettling, setIsSettling] = useState<string | null>(null);
  const [settlingClubName, setSettlingClubName] = useState<string | null>(null);

  // Modal state: New Partner Club from Finance
  const [isAddClubModalOpen, setIsAddClubModalOpen] = useState(false);
  const [newClubData, setNewClubData] = useState({
    name: '',
    sport: 'Football',
    tarifConvention: '',
    note: '',
  });
  const [savingClub, setSavingClub] = useState(false);

  useEffect(() => {
    fetchFinancialData();
  }, []);

  const showNotice = (type: 'success' | 'error', text: string) => {
    setFeedback({ type, text });
    if (type === 'success') {
      setTimeout(() => {
        setFeedback((prev) => (prev.text === text ? { type: '', text: '' } : prev));
      }, 4500);
    }
  };

  const fetchFinancialData = async () => {
    setLoading(true);

    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (session) {
        const rawProfile = await resolveOrBindCollaboratorSession(supabase, {
          id: session.user.id,
          email: session.user.email,
        });
        if (rawProfile) {
          const parsed = parseCollaboratorProfile(rawProfile, [], session.user);
          setUserProfile(parsed);
          const hasRecettes =
            parsed.role === 'admin' || parsed.permissions?.includes('finance_recettes');
          if (!hasRecettes) {
            setActiveTab('depenses');
          }
        }
      }

      const [billingData, expenseData, patData, apptData] = await Promise.all([
        fetchAllRows('billings', '*, patients(id, nom, prenom, atcd)', {
          column: 'date_facturation',
          ascending: false,
        }),
        fetchAllRows('expenses', '*', { column: 'date', ascending: false }),
        fetchAllRows('patients', 'id, nom, prenom, telephone, atcd'),
        fetchAllRows('appointments', 'id, patient_id, statut, date_heure'),
      ]);

      const safePatients = patData || [];
      setPatientsList(safePatients);
      setAppointmentsList(apptData || []);

      const loadedClubs = await fetchPartnerClubs(supabase, safePatients);
      setPartnerClubs(loadedClubs);

      if (billingData && billingData.length > 0) {
        setBillings(billingData.filter((b) => b.statut === 'Payé'));
        setUnpaidBillings(
          billingData.filter(
            (b) => b.statut === 'En attente' || b.statut === 'Impayé' || b.statut === 'Rejeté'
          )
        );
      } else {
        setBillings([]);
        setUnpaidBillings([]);
      }

      if (expenseData && expenseData.length > 0) {
        setExpenses(expenseData);
      } else {
        setExpenses([
          {
            id: '1',
            amount: 150,
            category: 'Matériel',
            date: new Date().toISOString(),
            description: 'Bandes élastiques',
          },
          {
            id: '2',
            amount: 1200,
            category: 'Loyer',
            date: new Date(Date.now() - 86400000 * 2).toISOString(),
            description: 'Loyer cabinet',
          },
          {
            id: '3',
            amount: 80,
            category: 'Logiciel',
            date: new Date(Date.now() - 86400000 * 5).toISOString(),
            description: 'Abonnement Doctolib',
          },
        ]);
      }
    } catch (err) {
      console.error('Error fetching financial data:', err);
    } finally {
      setLoading(false);
    }
  };

  const hasPermission = (permission: string) => {
    if (!userProfile) return false;
    if (userProfile.role === 'admin') return true;
    return userProfile.permissions?.includes(permission);
  };

  // Map patient_id -> club name
  const patientClubMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const p of patientsList) {
      const info = parsePatientMutuelle(p);
      if (info.club) {
        map.set(p.id, info.club);
      }
    }
    return map;
  }, [patientsList]);

  const getBillClub = (bill: any): string => {
    if (bill?.patient_id && patientClubMap.has(bill.patient_id)) {
      return patientClubMap.get(bill.patient_id) || '';
    }
    if (bill?.patients) {
      const patObj = Array.isArray(bill.patients) ? bill.patients[0] : bill.patients;
      if (patObj) {
        return parsePatientMutuelle(patObj).club || '';
      }
    }
    return '';
  };

  const matchesClubTableFilter = (bill: any): boolean => {
    if (clubFilterInTables === 'all') return true;
    const club = getBillClub(bill);
    if (clubFilterInTables === 'any_club') return Boolean(club);
    if (clubFilterInTables === 'no_club') return !club;
    if (clubFilterInTables.startsWith('club:')) {
      const target = clubFilterInTables.slice('club:'.length).toLowerCase();
      return Boolean(club) && club.toLowerCase() === target;
    }
    return true;
  };

  // Calculate metrics based on centralized dateRange
  const dateRange = getDateRange(dateFilter, customDate);
  const filterLabel = dateRange.label;

  const filteredBillingsAll = billings.filter((b) => isDateInRange(getBillDate(b), dateRange));
  const filteredBillings = filteredBillingsAll.filter(matchesClubTableFilter);
  const filteredExpenses = expenses.filter((e) => isDateInRange(e.date, dateRange));
  const filteredUnpaidPeriodAll = unpaidBillings.filter((b) =>
    isDateInRange(getBillDate(b), dateRange)
  );
  const displayedUnpaid = unpaidBillings.filter(matchesClubTableFilter);

  const totalRecettes = filteredBillingsAll.reduce(
    (sum, b) => sum + (Number(b.montant) || 0),
    0
  );
  const totalDepenses = filteredExpenses.reduce(
    (sum, e) => sum + (Number(e.amount) || 0),
    0
  );
  const caNet = totalRecettes - totalDepenses;
  const totalTransactions = filteredBillingsAll.length;

  const totalUnpaidGlobal = unpaidBillings.reduce(
    (sum, b) => sum + (Number(b.montant) || 0),
    0
  );
  const totalUnpaidPeriod = filteredUnpaidPeriodAll.reduce(
    (sum, b) => sum + (Number(b.montant) || 0),
    0
  );

  // Accounting breakdown per Partner Sports Club
  const clubAccountingStats = useMemo(() => {
    const clubNamesSet = new Set<string>(partnerClubs.map((c) => c.name));
    for (const clubName of patientClubMap.values()) {
      if (clubName) clubNamesSet.add(clubName);
    }

    const clubMetaMap = new Map<string, PartnerClub>();
    for (const c of partnerClubs) {
      clubMetaMap.set(c.name.toLowerCase(), c);
    }

    const results = Array.from(clubNamesSet).map((clubName) => {
      const clubKey = clubName.toLowerCase();
      const meta = clubMetaMap.get(clubKey) || {
        name: clubName,
        sport: 'Omnisports',
        tarifConvention: null,
        note: '',
      };

      const clubPatients = patientsList.filter(
        (p) => (patientClubMap.get(p.id) || '').toLowerCase() === clubKey
      );
      const clubPatientIds = new Set(clubPatients.map((p) => p.id));

      const periodAppts = appointmentsList.filter(
        (a) =>
          clubPatientIds.has(a.patient_id) &&
          a.statut === 'Effectué' &&
          isDateInRange(a.date_heure, dateRange)
      );

      const paidPeriodBills = filteredBillingsAll.filter(
        (b) => getBillClub(b).toLowerCase() === clubKey
      );

      const unpaidClubBills = unpaidBillings.filter(
        (b) => getBillClub(b).toLowerCase() === clubKey
      );

      const totalPaid = paidPeriodBills.reduce((s, b) => s + (Number(b.montant) || 0), 0);
      const totalUnpaid = unpaidClubBills.reduce((s, b) => s + (Number(b.montant) || 0), 0);

      // Per-athlete breakdown inside this club
      const athletes = clubPatients.map((pat) => {
        const patSessions = periodAppts.filter((a) => a.patient_id === pat.id).length;
        const patPaid = paidPeriodBills
          .filter((b) => b.patient_id === pat.id)
          .reduce((s, b) => s + (Number(b.montant) || 0), 0);
        const patUnpaidBills = unpaidClubBills.filter((b) => b.patient_id === pat.id);
        const patUnpaid = patUnpaidBills.reduce((s, b) => s + (Number(b.montant) || 0), 0);

        return {
          id: pat.id,
          fullName: `${pat.nom || ''} ${pat.prenom || ''}`.trim(),
          telephone: pat.telephone || '',
          sessionsCount: patSessions,
          paidAmount: patPaid,
          unpaidAmount: patUnpaid,
          unpaidBillsCount: patUnpaidBills.length,
        };
      });

      return {
        name: meta.name,
        sport: meta.sport,
        tarifConvention: meta.tarifConvention,
        note: meta.note,
        patientsCount: clubPatients.length,
        sessionsCount: periodAppts.length,
        totalPaid,
        totalUnpaid,
        unpaidBills: unpaidClubBills,
        paidBills: paidPeriodBills,
        athletes,
      };
    });

    return results.sort((a, b) => b.totalUnpaid - a.totalUnpaid || b.totalPaid - a.totalPaid);
  }, [
    partnerClubs,
    patientsList,
    patientClubMap,
    appointmentsList,
    filteredBillingsAll,
    unpaidBillings,
    dateRange,
  ]);

  const clubsTotals = useMemo(() => {
    return clubAccountingStats.reduce(
      (acc, c) => {
        acc.athletes += c.patientsCount;
        acc.sessions += c.sessionsCount;
        acc.paid += c.totalPaid;
        acc.unpaid += c.totalUnpaid;
        return acc;
      },
      { athletes: 0, sessions: 0, paid: 0, unpaid: 0 }
    );
  }, [clubAccountingStats]);

  const exportToExcel = () => {
    const data = filteredBillings.map((bill) => {
      const date = bill.appointments?.date_heure
        ? new Date(bill.appointments.date_heure)
        : new Date(bill.date_facturation || new Date());
      return {
        Date: date.toLocaleDateString('fr-FR'),
        Référence: `FAC-${date.getFullYear()}-${bill.id.substring(0, 4).toUpperCase()}`,
        Patient: bill.patients ? `${bill.patients.prenom} ${bill.patients.nom}` : 'Client divers',
        'Club Sportif': getBillClub(bill) || 'Particulier',
        'Nature des actes': 'Séance de kinésithérapie',
        'Mode de paiement': bill.type_paiement,
        Montant: bill.montant,
      };
    });

    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Recettes');
    XLSX.writeFile(
      wb,
      `Journal_Recettes_${new Date().toLocaleDateString('fr-FR').replace(/\//g, '-')}.xlsx`
    );
  };

  const exportClubStatementToExcel = (clubStat: (typeof clubAccountingStats)[number]) => {
    const rows: any[] = clubStat.athletes.map((ath) => ({
      'Club Sportif': clubStat.name,
      'Joueur / Athlète': ath.fullName,
      Téléphone: ath.telephone || '-',
      [`Séances effectuées (${filterLabel})`]: ath.sessionsCount,
      [`Montant Réglé (${filterLabel}) (DH)`]: ath.paidAmount,
      'Reste à Payer Global (DH)': ath.unpaidAmount,
    }));

    rows.push({
      'Club Sportif': 'TOTAL CLUB',
      'Joueur / Athlète': `${clubStat.patientsCount} joueur(s)`,
      Téléphone: '',
      [`Séances effectuées (${filterLabel})`]: clubStat.sessionsCount,
      [`Montant Réglé (${filterLabel}) (DH)`]: clubStat.totalPaid,
      'Reste à Payer Global (DH)': clubStat.totalUnpaid,
    });

    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Relevé Club');
    const safeName = clubStat.name.replace(/[^a-zA-Z0-9_-]/g, '_');
    XLSX.writeFile(
      wb,
      `Releve_Comptable_${safeName}_${new Date().toLocaleDateString('fr-FR').replace(/\//g, '-')}.xlsx`
    );
  };

  const handleAddPartnerClubFromFinance = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanName = newClubData.name.trim();
    if (!cleanName) return;

    setSavingClub(true);
    try {
      await upsertPartnerClub(supabase, {
        name: cleanName,
        sport: newClubData.sport,
        tarifConvention: newClubData.tarifConvention ? Number(newClubData.tarifConvention) : null,
        note: newClubData.note.trim(),
      });
      const updated = await fetchPartnerClubs(supabase, patientsList);
      setPartnerClubs(updated);
      setIsAddClubModalOpen(false);
      setNewClubData({ name: '', sport: 'Football', tarifConvention: '', note: '' });
      showNotice('success', `Le club « ${cleanName} » a été créé avec succès.`);
    } catch (err: any) {
      showNotice('error', err.message || "Erreur lors de l'ajout du club.");
    } finally {
      setSavingClub(false);
    }
  };

  const handleSettleEntireClub = async (clubStat: (typeof clubAccountingStats)[number]) => {
    if (clubStat.unpaidBills.length === 0) return;

    setSettlingClubName(clubStat.name);
    try {
      const nowIso = new Date().toISOString();
      await Promise.all(
        clubStat.unpaidBills.map(async (bill) => {
          await supabase
            .from('billings')
            .update({ statut: 'Payé', date_facturation: nowIso })
            .eq('id', bill.id);
          if (bill.appointment_id) {
            await supabase
              .from('appointments')
              .update({ statut: 'Effectué' })
              .eq('id', bill.appointment_id);
          }
        })
      );
      await fetchFinancialData();
      showNotice(
        'success',
        `Toutes les factures en attente du club « ${clubStat.name} » (${clubStat.totalUnpaid.toLocaleString()} DH) ont été marquées comme réglées.`
      );
    } catch (err: any) {
      showNotice('error', `Erreur lors du règlement groupé : ${err.message}`);
    } finally {
      setSettlingClubName(null);
    }
  };

  const handleAddExpense = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);

    const { data, error } = await supabase
      .from('expenses')
      .insert([
        {
          amount: Number(newExpense.amount),
          category: newExpense.category,
          description: newExpense.description,
          date: newExpense.date,
        },
      ])
      .select();

    if (!error && data) {
      setExpenses([data[0], ...expenses]);
      setIsExpenseModalOpen(false);
      setNewExpense({
        amount: '',
        category: 'Matériel',
        description: '',
        date: new Date().toISOString().split('T')[0],
      });
      showNotice('success', 'Dépense enregistrée avec succès.');
    } else {
      console.error('Error adding expense:', error);
      showNotice('error', "Erreur lors de l'ajout de la dépense.");
    }

    setIsSubmitting(false);
  };

  const handleSettleBilling = async (billId: string, inputAppId: string | null) => {
    setIsSettling(billId);

    try {
      const { data: updatedBillings, error: billError } = await supabase
        .from('billings')
        .update({
          statut: 'Payé',
          date_facturation: new Date().toISOString(),
        })
        .eq('id', billId)
        .select();

      if (billError) throw new Error('Erreur mise à jour facture: ' + billError.message);

      let appointmentId = inputAppId;
      if (!appointmentId && updatedBillings && updatedBillings.length > 0) {
        appointmentId = updatedBillings[0].appointment_id;
      }

      if (appointmentId) {
        await supabase.from('appointments').update({ statut: 'Effectué' }).eq('id', appointmentId);
      }

      await fetchFinancialData();
      showNotice('success', 'Facture marquée comme réglée.');
    } catch (error: any) {
      console.error('Settle error details:', error);
      showNotice('error', 'Erreur lors du règlement : ' + (error.message || 'Erreur inconnue'));
    } finally {
      setIsSettling(null);
    }
  };

  if (loading) {
    return (
      <div className="p-8 flex justify-center items-center min-h-[60vh]">
        <Activity className="h-8 w-8 text-primary-500 animate-pulse" />
      </div>
    );
  }

  return (
    <div className="p-8 max-w-7xl mx-auto font-sans">
      <div className="mb-8 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">
            Tableau de Bord Financier
          </h1>
          <p className="text-slate-500 mt-1">
            Suivez vos recettes, vos conventions clubs sportifs, vos impayés et vos dépenses.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {dateFilter === 'exact' && (
            <input
              type="date"
              value={customDate}
              onChange={(e) => setCustomDate(e.target.value)}
              className="p-1.5 text-sm border border-slate-200 rounded-xl focus:ring-2 focus:ring-primary-500 outline-none shadow-sm"
            />
          )}
          <div className="flex items-center gap-2 bg-white p-1.5 rounded-xl border border-slate-200 shadow-sm">
            <Calendar className="h-4 w-4 text-slate-400 ml-2" />
            <select
              value={dateFilter}
              onChange={(e) => setDateFilter(e.target.value)}
              className="bg-transparent border-none text-sm font-medium text-slate-700 focus:ring-0 cursor-pointer py-1 pr-8 pl-2 outline-none"
            >
              <option value="day">Aujourd'hui</option>
              <option value="exact">Date exacte</option>
              <option value="7days">7 derniers jours</option>
              <option value="week">Cette semaine</option>
              <option value="month">Ce mois</option>
              <option value="year">Cette année</option>
              <option value="all">Tout le temps</option>
            </select>
          </div>
        </div>
      </div>

      {feedback.text && (
        <div
          className={`mb-6 p-4 rounded-xl flex items-center gap-3 text-sm border ${
            feedback.type === 'error'
              ? 'bg-rose-50 text-rose-700 border-rose-200'
              : 'bg-emerald-50 text-emerald-700 border-emerald-200'
          }`}
        >
          {feedback.type === 'error' ? (
            <AlertCircle className="h-5 w-5 flex-shrink-0" />
          ) : (
            <CheckCircle2 className="h-5 w-5 flex-shrink-0" />
          )}
          <span className="font-medium">{feedback.text}</span>
        </div>
      )}

      {/* KPI Cards */}
      {hasPermission('finance_stats') && (
        <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 mb-8">
          <Card className="border-0 shadow-sm">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-slate-500">
                CA Net ({filterLabel})
              </CardTitle>
              <div
                className={`h-8 w-8 rounded-full flex items-center justify-center ${
                  caNet >= 0 ? 'bg-emerald-50' : 'bg-rose-50'
                }`}
              >
                <Wallet
                  className={`h-4 w-4 ${caNet >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}
                />
              </div>
            </CardHeader>
            <CardContent>
              <div
                className={`text-2xl font-bold ${
                  caNet >= 0 ? 'text-emerald-600' : 'text-rose-600'
                }`}
              >
                {caNet.toLocaleString()} DH
              </div>
              <p className="text-xs mt-1 text-slate-500">Recettes - Dépenses</p>
            </CardContent>
          </Card>

          <Card className="border-0 shadow-sm">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-slate-500">
                Recettes ({filterLabel})
              </CardTitle>
              <div className="h-8 w-8 rounded-full flex items-center justify-center bg-blue-50">
                <TrendingUp className="h-4 w-4 text-blue-600" />
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-slate-900">
                {totalRecettes.toLocaleString()} DH
              </div>
              <p className="text-xs mt-1 text-slate-500">Entrées encaissées</p>
            </CardContent>
          </Card>

          <Card className="border-0 shadow-sm">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-slate-500">
                Dépenses ({filterLabel})
              </CardTitle>
              <div className="h-8 w-8 rounded-full flex items-center justify-center bg-orange-50">
                <TrendingDown className="h-4 w-4 text-orange-600" />
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-slate-900">
                {totalDepenses.toLocaleString()} DH
              </div>
              <p className="text-xs mt-1 text-slate-500">Sorties brutes</p>
            </CardContent>
          </Card>

          <Card className="border-0 shadow-sm border-t-4 border-t-rose-500">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-slate-500">Impayés</CardTitle>
              <div className="h-8 w-8 rounded-full flex items-center justify-center bg-rose-50">
                <AlertCircle className="h-4 w-4 text-rose-600" />
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-rose-600">
                {dateFilter === 'all'
                  ? `${totalUnpaidGlobal.toLocaleString()} DH`
                  : `${totalUnpaidPeriod.toLocaleString()} DH`}
              </div>
              <p className="text-xs mt-1 text-slate-500">
                {dateFilter === 'all'
                  ? 'Total global à recouvrer'
                  : `Période (${totalUnpaidGlobal.toLocaleString()} DH global)`}
              </p>
            </CardContent>
          </Card>

          <Card className="border-0 shadow-sm">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-slate-500">
                Transactions ({filterLabel})
              </CardTitle>
              <div className="h-8 w-8 rounded-full flex items-center justify-center bg-indigo-50">
                <Activity className="h-4 w-4 text-indigo-600" />
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-slate-900">
                {totalTransactions.toLocaleString()}
              </div>
              <p className="text-xs mt-1 text-slate-500">Nombre de paiements</p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Tabs */}
      <div className="flex flex-wrap border-b border-slate-200 mb-6">
        {hasPermission('finance_recettes') && (
          <button
            onClick={() => setActiveTab('recettes')}
            className={`py-3 px-5 text-sm font-medium border-b-2 transition-colors ${
              activeTab === 'recettes'
                ? 'border-primary-500 text-primary-600'
                : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'
            }`}
          >
            <div className="flex items-center gap-2">
              <ArrowUpRight className="h-4 w-4" />
              Recettes
            </div>
          </button>
        )}

        {(hasPermission('finance_recettes') || hasPermission('finance_stats')) && (
          <button
            onClick={() => setActiveTab('clubs')}
            className={`py-3 px-5 text-sm font-medium border-b-2 transition-colors ${
              activeTab === 'clubs'
                ? 'border-indigo-600 text-indigo-700'
                : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'
            }`}
          >
            <div className="flex items-center gap-2">
              <Trophy className="h-4 w-4 text-indigo-600" />
              Clubs Conventionnés
              {clubAccountingStats.length > 0 && (
                <span className="ml-0.5 px-1.5 py-0.5 rounded-full bg-indigo-100 text-indigo-700 text-[10px] font-bold">
                  {clubAccountingStats.length}
                </span>
              )}
            </div>
          </button>
        )}

        {hasPermission('finance_recettes') && (
          <button
            onClick={() => setActiveTab('impayer')}
            className={`py-3 px-5 text-sm font-medium border-b-2 transition-colors ${
              activeTab === 'impayer'
                ? 'border-rose-500 text-rose-600'
                : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'
            }`}
          >
            <div className="flex items-center gap-2">
              <AlertCircle className="h-4 w-4" />
              Impayés
              {unpaidBillings.length > 0 && (
                <span className="ml-1 px-1.5 py-0.5 rounded-full bg-rose-100 text-rose-700 text-[10px] font-bold">
                  {unpaidBillings.length}
                </span>
              )}
            </div>
          </button>
        )}

        {(hasPermission('finance_depenses_view') || hasPermission('finance_depenses_edit')) && (
          <button
            onClick={() => setActiveTab('depenses')}
            className={`py-3 px-5 text-sm font-medium border-b-2 transition-colors ${
              activeTab === 'depenses'
                ? 'border-primary-500 text-primary-600'
                : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'
            }`}
          >
            <div className="flex items-center gap-2">
              <ArrowDownRight className="h-4 w-4" />
              Dépenses
            </div>
          </button>
        )}
      </div>

      {/* ==================================================================== */}
      {/* TAB : CLUBS SPORTIFS CONVENTIONNÉS (COMPTABILITÉ PAR CLUB)           */}
      {/* ==================================================================== */}
      {activeTab === 'clubs' && (hasPermission('finance_recettes') || hasPermission('finance_stats')) && (
        <div className="space-y-6">
          {/* Club Summary KPIs */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <Card className="border-0 shadow-sm bg-indigo-50/50">
              <CardContent className="p-5">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold uppercase tracking-wider text-indigo-700">
                    Clubs Partenaires
                  </span>
                  <Trophy className="h-4 w-4 text-indigo-600" />
                </div>
                <p className="text-2xl font-black text-indigo-950 mt-2">
                  {clubAccountingStats.length}
                </p>
                <p className="text-xs text-indigo-600/80 mt-1">
                  {clubsTotals.athletes} joueur(s) / athlète(s) regroupés
                </p>
              </CardContent>
            </Card>

            <Card className="border-0 shadow-sm bg-white">
              <CardContent className="p-5">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold uppercase tracking-wider text-slate-500">
                    Séances Clubs ({filterLabel})
                  </span>
                  <Users className="h-4 w-4 text-slate-400" />
                </div>
                <p className="text-2xl font-black text-slate-900 mt-2">
                  {clubsTotals.sessions}
                </p>
                <p className="text-xs text-slate-500 mt-1">Séances effectuées</p>
              </CardContent>
            </Card>

            <Card className="border-0 shadow-sm bg-emerald-50/40">
              <CardContent className="p-5">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold uppercase tracking-wider text-emerald-700">
                    Encaissé Clubs ({filterLabel})
                  </span>
                  <TrendingUp className="h-4 w-4 text-emerald-600" />
                </div>
                <p className="text-2xl font-black text-emerald-700 mt-2">
                  {clubsTotals.paid.toLocaleString()} DH
                </p>
                <p className="text-xs text-emerald-700/80 mt-1">Total réglé sur la période</p>
              </CardContent>
            </Card>

            <Card className="border-0 shadow-sm bg-rose-50/40">
              <CardContent className="p-5">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold uppercase tracking-wider text-rose-700">
                    Reste à Encaisser Clubs
                  </span>
                  <AlertCircle className="h-4 w-4 text-rose-600" />
                </div>
                <p className="text-2xl font-black text-rose-600 mt-2">
                  {clubsTotals.unpaid.toLocaleString()} DH
                </p>
                <p className="text-xs text-rose-700/80 mt-1">Solde global en attente</p>
              </CardContent>
            </Card>
          </div>

          <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="p-4 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-slate-50/60">
              <div>
                <h3 className="font-bold text-slate-900 flex items-center gap-2">
                  <Trophy className="h-4 w-4 text-indigo-600" />
                  Comptabilité détaillée par Club Sportif Conventionné
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Cliquez sur un club pour afficher le relevé individuel de ses joueurs, exporter sa facture Excel ou encaisser son solde.
                </p>
              </div>
              <Button
                type="button"
                size="sm"
                onClick={() => setIsAddClubModalOpen(true)}
                className="bg-indigo-600 hover:bg-indigo-700 text-white gap-1.5 self-start sm:self-center"
              >
                <Plus className="h-4 w-4" />
                Nouveau club conventionné
              </Button>
            </div>

            {clubAccountingStats.length === 0 ? (
              <div className="p-10 text-center space-y-3">
                <Trophy className="h-10 w-10 text-slate-300 mx-auto" />
                <p className="text-slate-700 font-semibold">
                  Aucun club sportif conventionné configuré pour le moment.
                </p>
                <p className="text-sm text-slate-500 max-w-md mx-auto">
                  Créez vos clubs partenaires ici ou depuis l'onglet <strong>Patients</strong>, puis regroupez-y vos joueurs en quelques clics.
                </p>
                <Button
                  type="button"
                  onClick={() => setIsAddClubModalOpen(true)}
                  className="bg-indigo-600 hover:bg-indigo-700 text-white gap-2 mt-2"
                >
                  <Plus className="h-4 w-4" />
                  Ajouter un premier club sportif
                </Button>
              </div>
            ) : (
              <div className="divide-y divide-slate-100">
                {clubAccountingStats.map((clubStat) => {
                  const isExpanded = expandedClubName === clubStat.name;
                  return (
                    <div key={clubStat.name} className="bg-white">
                      <div
                        onClick={() =>
                          setExpandedClubName(isExpanded ? null : clubStat.name)
                        }
                        className="p-5 flex flex-col lg:flex-row lg:items-center justify-between gap-4 hover:bg-slate-50/80 cursor-pointer transition-colors"
                      >
                        <div className="flex items-start gap-3.5">
                          <div className="h-11 w-11 rounded-xl bg-indigo-100 text-indigo-700 flex items-center justify-center flex-shrink-0">
                            <Trophy className="h-5 w-5" />
                          </div>
                          <div>
                            <div className="flex flex-wrap items-center gap-2">
                              <h4 className="font-bold text-slate-900 text-base">
                                {clubStat.name}
                              </h4>
                              <span className="text-xs font-semibold bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full">
                                {clubStat.sport}
                              </span>
                              {clubStat.tarifConvention && (
                                <span className="text-xs font-bold bg-indigo-50 text-indigo-700 px-2 py-0.5 rounded-full border border-indigo-200">
                                  Convention : {clubStat.tarifConvention} DH/séance
                                </span>
                              )}
                            </div>
                            <p className="text-xs text-slate-500 mt-1">
                              <strong>{clubStat.patientsCount}</strong> joueur(s) affilié(s) •{' '}
                              <strong>{clubStat.sessionsCount}</strong> séance(s) effectuée(s) ({filterLabel})
                              {clubStat.note ? ` • ${clubStat.note}` : ''}
                            </p>
                          </div>
                        </div>

                        <div className="flex flex-wrap items-center gap-4 lg:gap-6">
                          <div className="text-left lg:text-right">
                            <p className="text-[11px] font-semibold uppercase text-slate-400">
                              Encaissé ({filterLabel})
                            </p>
                            <p className="text-base font-black text-emerald-600">
                              {clubStat.totalPaid.toLocaleString()} DH
                            </p>
                          </div>

                          <div className="text-left lg:text-right">
                            <p className="text-[11px] font-semibold uppercase text-slate-400">
                              Reste à payer
                            </p>
                            <p
                              className={`text-base font-black ${
                                clubStat.totalUnpaid > 0 ? 'text-rose-600' : 'text-slate-500'
                              }`}
                            >
                              {clubStat.totalUnpaid.toLocaleString()} DH
                            </p>
                          </div>

                          <div
                            className="flex items-center gap-2"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              onClick={() => exportClubStatementToExcel(clubStat)}
                              className="text-emerald-700 border-emerald-200 hover:bg-emerald-50 gap-1.5 text-xs"
                            >
                              <FileSpreadsheet className="h-3.5 w-3.5" />
                              Relevé Excel
                            </Button>

                            {clubStat.totalUnpaid > 0 && hasPermission('finance_recettes') && (
                              <Button
                                type="button"
                                size="sm"
                                disabled={settlingClubName === clubStat.name}
                                onClick={() => handleSettleEntireClub(clubStat)}
                                className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs"
                              >
                                {settlingClubName === clubStat.name
                                  ? 'Règlement...'
                                  : `Tout régler (${clubStat.totalUnpaid} DH)`}
                              </Button>
                            )}

                            <button
                              type="button"
                              onClick={() =>
                                setExpandedClubName(isExpanded ? null : clubStat.name)
                              }
                              className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100"
                            >
                              {isExpanded ? (
                                <ChevronDown className="h-5 w-5" />
                              ) : (
                                <ChevronRight className="h-5 w-5" />
                              )}
                            </button>
                          </div>
                        </div>
                      </div>

                      {isExpanded && (
                        <div className="bg-slate-50/70 border-t border-slate-100 px-6 py-4">
                          {clubStat.athletes.length === 0 ? (
                            <p className="text-xs text-slate-500 py-2">
                              Aucun patient n'est encore rattaché à ce club. Rendez-vous dans l'onglet <strong>Patients</strong> pour cocher et affecter les joueurs à « {clubStat.name} ».
                            </p>
                          ) : (
                            <div className="overflow-x-auto">
                              <table className="w-full text-xs text-left bg-white rounded-xl border border-slate-200 overflow-hidden">
                                <thead className="bg-slate-100 text-slate-600 uppercase">
                                  <tr>
                                    <th className="px-4 py-2.5 font-semibold">Joueur / Patient</th>
                                    <th className="px-4 py-2.5 font-semibold">Téléphone</th>
                                    <th className="px-4 py-2.5 font-semibold text-center">
                                      Séances ({filterLabel})
                                    </th>
                                    <th className="px-4 py-2.5 font-semibold text-right">
                                      Réglé ({filterLabel})
                                    </th>
                                    <th className="px-4 py-2.5 font-semibold text-right">
                                      Impayé en cours
                                    </th>
                                  </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100">
                                  {clubStat.athletes.map((ath) => (
                                    <tr key={ath.id} className="hover:bg-slate-50">
                                      <td className="px-4 py-2.5 font-bold text-slate-900">
                                        {ath.fullName}
                                      </td>
                                      <td className="px-4 py-2.5 text-slate-600">
                                        {ath.telephone || '-'}
                                      </td>
                                      <td className="px-4 py-2.5 text-center font-semibold text-slate-700">
                                        {ath.sessionsCount}
                                      </td>
                                      <td className="px-4 py-2.5 text-right font-bold text-emerald-600">
                                        {ath.paidAmount.toLocaleString()} DH
                                      </td>
                                      <td
                                        className={`px-4 py-2.5 text-right font-bold ${
                                          ath.unpaidAmount > 0 ? 'text-rose-600' : 'text-slate-400'
                                        }`}
                                      >
                                        {ath.unpaidAmount.toLocaleString()} DH
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ==================================================================== */}
      {/* OTHER TABS : IMPAYÉS, RECETTES, DÉPENSES                             */}
      {/* ==================================================================== */}
      {activeTab !== 'clubs' && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          {activeTab === 'impayer' && hasPermission('finance_recettes') && (
            <>
              <div className="p-4 border-b border-slate-100 bg-rose-50/30 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <h3 className="font-semibold text-rose-800">Séances en attente de règlement</h3>
                <select
                  value={clubFilterInTables}
                  onChange={(e) => setClubFilterInTables(e.target.value)}
                  className="rounded-lg border border-rose-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 outline-none"
                >
                  <option value="all">Tous les patients (Clubs + Particuliers)</option>
                  <option value="any_club">Tous les clubs conventionnés</option>
                  <option value="no_club">Particuliers (hors clubs)</option>
                  {clubAccountingStats.map((c) => (
                    <option key={c.name} value={`club:${c.name}`}>
                      Club : {c.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm text-left">
                  <thead className="text-xs text-slate-500 uppercase bg-slate-50">
                    <tr>
                      <th className="px-6 py-4 font-medium">Date</th>
                      <th className="px-6 py-4 font-medium">Patient</th>
                      <th className="px-6 py-4 font-medium">Club Sportif</th>
                      <th className="px-6 py-4 font-medium">Mode</th>
                      <th className="px-6 py-4 font-medium text-right">Montant</th>
                      <th className="px-6 py-4 font-medium text-center">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {displayedUnpaid.length > 0 ? (
                      displayedUnpaid.map((bill) => {
                        const date = bill.appointments?.date_heure
                          ? new Date(bill.appointments.date_heure)
                          : new Date(bill.date_facturation || new Date());
                        const clubName = getBillClub(bill);
                        return (
                          <tr key={bill.id} className="hover:bg-rose-50/30 transition-colors">
                            <td className="px-6 py-4 text-slate-600">
                              {date.toLocaleDateString('fr-FR')}
                            </td>
                            <td className="px-6 py-4 font-medium text-slate-900">
                              {bill.patients
                                ? `${bill.patients.prenom} ${bill.patients.nom}`
                                : 'Client divers'}
                            </td>
                            <td className="px-6 py-4">
                              {clubName ? (
                                <span className="inline-flex items-center gap-1 bg-indigo-50 text-indigo-700 border border-indigo-200 px-2 py-0.5 rounded-md text-xs font-bold">
                                  <Trophy className="h-3 w-3" />
                                  {clubName}
                                </span>
                              ) : (
                                <span className="text-xs text-slate-400">Particulier</span>
                              )}
                            </td>
                            <td className="px-6 py-4 text-slate-600">
                              <span className="bg-slate-100 px-2.5 py-1 rounded-md text-xs font-medium">
                                {bill.type_paiement}
                              </span>
                            </td>
                            <td className="px-6 py-4 text-right font-bold text-rose-600">
                              {bill.montant} DH
                            </td>
                            <td className="px-6 py-4 text-center">
                              <Button
                                onClick={(e) => {
                                  e.preventDefault();
                                  e.stopPropagation();
                                  const appId =
                                    bill.appointment_id ||
                                    (bill.appointments && !Array.isArray(bill.appointments)
                                      ? bill.appointments.id
                                      : bill.appointments?.[0]?.id);
                                  handleSettleBilling(bill.id, appId);
                                }}
                                disabled={isSettling === bill.id}
                                size="sm"
                                className="bg-emerald-500 hover:bg-emerald-600 text-white text-xs h-8"
                              >
                                {isSettling === bill.id ? '...' : 'Régler'}
                              </Button>
                            </td>
                          </tr>
                        );
                      })
                    ) : (
                      <tr>
                        <td colSpan={6} className="px-6 py-8 text-center text-slate-500">
                          Aucun impayé correspondant à ce filtre.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </>
          )}

          {activeTab === 'recettes' && hasPermission('finance_recettes') && (
            <>
              <div className="p-4 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-slate-50/50">
                <div className="flex flex-wrap items-center gap-3">
                  <h3 className="font-semibold text-slate-800">Historique des Recettes</h3>
                  <select
                    value={clubFilterInTables}
                    onChange={(e) => setClubFilterInTables(e.target.value)}
                    className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 outline-none"
                  >
                    <option value="all">Tous (Clubs + Particuliers)</option>
                    <option value="any_club">Tous les clubs conventionnés</option>
                    <option value="no_club">Particuliers (hors clubs)</option>
                    {clubAccountingStats.map((c) => (
                      <option key={c.name} value={`club:${c.name}`}>
                        Club : {c.name}
                      </option>
                    ))}
                  </select>
                </div>
                <Button
                  onClick={exportToExcel}
                  variant="outline"
                  className="text-emerald-600 border-emerald-200 hover:bg-emerald-50 hover:text-emerald-700"
                >
                  <FileSpreadsheet className="h-4 w-4 mr-2" />
                  Télécharger le journal (Excel)
                </Button>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm text-left">
                  <thead className="text-xs text-slate-500 uppercase bg-slate-50">
                    <tr>
                      <th className="px-6 py-4 font-medium">Date</th>
                      <th className="px-6 py-4 font-medium">Patient</th>
                      <th className="px-6 py-4 font-medium">Club Sportif</th>
                      <th className="px-6 py-4 font-medium">Mode</th>
                      <th className="px-6 py-4 font-medium">Statut</th>
                      <th className="px-6 py-4 font-medium text-right">Montant</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filteredBillings.length > 0 ? (
                      filteredBillings.map((bill) => {
                        const date = bill.appointments?.date_heure
                          ? new Date(bill.appointments.date_heure)
                          : new Date(bill.date_facturation || new Date());
                        const clubName = getBillClub(bill);
                        return (
                          <tr key={bill.id} className="hover:bg-slate-50 transition-colors">
                            <td className="px-6 py-4 text-slate-600">
                              {date.toLocaleDateString('fr-FR')}
                            </td>
                            <td className="px-6 py-4 font-medium text-slate-900">
                              {bill.patients
                                ? `${bill.patients.prenom} ${bill.patients.nom}`
                                : 'Client divers'}
                            </td>
                            <td className="px-6 py-4">
                              {clubName ? (
                                <span className="inline-flex items-center gap-1 bg-indigo-50 text-indigo-700 border border-indigo-200 px-2 py-0.5 rounded-md text-xs font-bold">
                                  <Trophy className="h-3 w-3" />
                                  {clubName}
                                </span>
                              ) : (
                                <span className="text-xs text-slate-400">Particulier</span>
                              )}
                            </td>
                            <td className="px-6 py-4 text-slate-600">
                              <span className="bg-slate-100 px-2.5 py-1 rounded-md text-xs font-medium">
                                {bill.type_paiement}
                              </span>
                            </td>
                            <td className="px-6 py-4">
                              <span
                                className={`px-2.5 py-1 rounded-full text-xs font-medium ${
                                  bill.statut === 'Payé' || bill.statut === 'Effectué'
                                    ? 'bg-emerald-100 text-emerald-700'
                                    : bill.statut === 'Impayé'
                                    ? 'bg-rose-100 text-rose-700'
                                    : 'bg-amber-100 text-amber-700'
                                }`}
                              >
                                {bill.statut || 'Effectué'}
                              </span>
                            </td>
                            <td className="px-6 py-4 text-right font-bold text-slate-900">
                              {bill.montant} DH
                            </td>
                          </tr>
                        );
                      })
                    ) : (
                      <tr>
                        <td colSpan={6} className="px-6 py-8 text-center text-slate-500">
                          Aucune recette enregistrée pour ce filtre.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </>
          )}

          {activeTab === 'depenses' &&
            (hasPermission('finance_depenses_view') || hasPermission('finance_depenses_edit')) && (
              <>
                <div className="p-4 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
                  <h3 className="font-semibold text-slate-800">Historique des Dépenses</h3>
                  {hasPermission('finance_depenses_edit') && (
                    <Button
                      onClick={() => setIsExpenseModalOpen(true)}
                      className="bg-orange-500 hover:bg-orange-600 text-white"
                    >
                      <Plus className="h-4 w-4 mr-2" />
                      Ajouter une dépense
                    </Button>
                  )}
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm text-left">
                    <thead className="text-xs text-slate-500 uppercase bg-slate-50">
                      <tr>
                        <th className="px-6 py-4 font-medium">Date</th>
                        <th className="px-6 py-4 font-medium">Catégorie</th>
                        <th className="px-6 py-4 font-medium">Description</th>
                        <th className="px-6 py-4 font-medium text-right">Montant</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {filteredExpenses.length > 0 ? (
                        filteredExpenses.map((expense) => (
                          <tr key={expense.id} className="hover:bg-slate-50 transition-colors">
                            <td className="px-6 py-4 text-slate-600">
                              {new Date(expense.date).toLocaleDateString('fr-FR')}
                            </td>
                            <td className="px-6 py-4">
                              <span className="bg-orange-100 text-orange-700 px-2.5 py-1 rounded-md text-xs font-medium">
                                {expense.category}
                              </span>
                            </td>
                            <td className="px-6 py-4 text-slate-600">{expense.description}</td>
                            <td className="px-6 py-4 text-right font-bold text-slate-900">
                              - {expense.amount} DH
                            </td>
                          </tr>
                        ))
                      ) : (
                        <tr>
                          <td colSpan={4} className="px-6 py-8 text-center text-slate-500">
                            Aucune dépense enregistrée.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </>
            )}
        </div>
      )}

      {/* Modal : Nouveau Club Sportif Conventionné */}
      <Modal
        isOpen={isAddClubModalOpen}
        onClose={() => {
          if (!savingClub) setIsAddClubModalOpen(false);
        }}
        title="Nouveau club sportif conventionné"
      >
        <form onSubmit={handleAddPartnerClubFromFinance} className="space-y-4">
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-slate-700">Nom du club *</label>
            <input
              type="text"
              required
              placeholder="Ex: Hassania Union Sport Agadir (HUSA)"
              value={newClubData.name}
              onChange={(e) => setNewClubData({ ...newClubData, name: e.target.value })}
              className="w-full p-2.5 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
            />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-slate-700">Discipline sportive</label>
              <select
                value={newClubData.sport}
                onChange={(e) => setNewClubData({ ...newClubData, sport: e.target.value })}
                className="w-full p-2.5 border border-slate-200 rounded-lg text-sm bg-white focus:ring-2 focus:ring-indigo-500 outline-none"
              >
                {SPORTS_DISCIPLINES.map((sp) => (
                  <option key={sp} value={sp}>
                    {sp}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-slate-700">
                Tarif conventionné / séance (DH)
              </label>
              <input
                type="number"
                min="0"
                placeholder="Ex: 150"
                value={newClubData.tarifConvention}
                onChange={(e) =>
                  setNewClubData({ ...newClubData, tarifConvention: e.target.value })
                }
                className="w-full p-2.5 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-slate-700">Modalité / Note</label>
            <input
              type="text"
              placeholder="Ex: Règlement fin de mois sur facture groupée"
              value={newClubData.note}
              onChange={(e) => setNewClubData({ ...newClubData, note: e.target.value })}
              className="w-full p-2.5 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
            />
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <Button
              type="button"
              variant="outline"
              disabled={savingClub}
              onClick={() => setIsAddClubModalOpen(false)}
            >
              Annuler
            </Button>
            <Button
              type="submit"
              disabled={savingClub}
              className="bg-indigo-600 hover:bg-indigo-700 text-white"
            >
              {savingClub ? 'Enregistrement...' : 'Enregistrer le club'}
            </Button>
          </div>
        </form>
      </Modal>

      {/* Add Expense Modal */}
      <Modal
        isOpen={isExpenseModalOpen}
        onClose={() => setIsExpenseModalOpen(false)}
        title="Ajouter une dépense"
      >
        <form onSubmit={handleAddExpense} className="space-y-4">
          <div className="space-y-2">
            <label className="text-sm font-medium text-slate-700">Date</label>
            <input
              type="date"
              required
              value={newExpense.date}
              onChange={(e) => setNewExpense({ ...newExpense, date: e.target.value })}
              className="w-full p-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-primary-500 outline-none"
            />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium text-slate-700">Catégorie</label>
            <select
              value={newExpense.category}
              onChange={(e) => setNewExpense({ ...newExpense, category: e.target.value })}
              className="w-full p-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-primary-500 outline-none"
            >
              <option value="Matériel">Matériel & Équipement</option>
              <option value="Loyer">Loyer & Charges</option>
              <option value="Logiciel">Logiciel & Abonnements</option>
              <option value="Salaire">Salaires & Honoraires</option>
              <option value="Autre">Autre</option>
            </select>
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium text-slate-700">Description</label>
            <input
              type="text"
              required
              placeholder="Ex: Achat de bandes élastiques"
              value={newExpense.description}
              onChange={(e) => setNewExpense({ ...newExpense, description: e.target.value })}
              className="w-full p-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-primary-500 outline-none"
            />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium text-slate-700">Montant (DH)</label>
            <input
              type="number"
              required
              min="0"
              step="0.01"
              placeholder="0.00"
              value={newExpense.amount}
              onChange={(e) => setNewExpense({ ...newExpense, amount: e.target.value })}
              className="w-full p-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-primary-500 outline-none"
            />
          </div>
          <div className="flex justify-end gap-3 pt-4">
            <Button type="button" variant="outline" onClick={() => setIsExpenseModalOpen(false)}>
              Annuler
            </Button>
            <Button
              type="submit"
              disabled={isSubmitting}
              className="bg-orange-500 hover:bg-orange-600 text-white"
            >
              {isSubmitting ? 'Ajout...' : 'Ajouter la dépense'}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
