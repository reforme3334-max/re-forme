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
  Edit2,
  Trash2,
  Key,
  ExternalLink,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Modal } from '../components/ui/modal';
import { MultiMonthPicker } from '../components/ui/MultiMonthPicker';
import { PatientNameLink } from '../components/patients/PatientNameLink';
import { ClubAccessModal } from '../components/clubs/ClubAccessModal';
import { openClubPortalPreview } from '../lib/clubPortalUtils';
import * as XLSX from 'xlsx';
import {
  fetchAllRows,
  getBillDate,
  getDateRange,
  isDateInRange,
  roundMoney,
  sumMoney,
  formatMoney,
  sanitizeBillings,
  isPaidBillingStatus,
  isUnpaidBillingStatus,
} from '../lib/financeUtils';
import { getMoroccoNow, getMoroccoTodayStr, parseClinicDate } from '../lib/timeUtils';
import { resolveOrBindCollaboratorSession, parseCollaboratorProfile } from '../lib/teamUtils';
import {
  SPORTS_DISCIPLINES,
  PartnerClub,
  parsePatientMutuelle,
  fetchPartnerClubs,
  upsertPartnerClub,
} from '../lib/mutuelleUtils';
import {
  DocumentTemplatesConfig,
  CustomInvoiceRefsStore,
  getCachedDocumentTemplates,
  fetchDocumentTemplates,
  getCachedCustomInvoiceRefs,
  fetchCustomInvoiceRefs,
  saveBillingCustomInvoiceRef,
  getBillingDisplayReference,
} from '../lib/documentTemplates';

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
  const [customDate, setCustomDate] = useState(() => getMoroccoTodayStr());
  const [selectedMonths, setSelectedMonths] = useState<string[]>(() => {
    const now = getMoroccoNow();
    return [`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`];
  });
  const [monthPickerTrigger, setMonthPickerTrigger] = useState(0);
  const [clubFilterInTables, setClubFilterInTables] = useState<string>('all');
  const [unpaidScope, setUnpaidScope] = useState<'global' | 'period'>('global');
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
    date: getMoroccoTodayStr(),
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
  const [clubForAccessModal, setClubForAccessModal] = useState<PartnerClub | null>(null);

  // Modal state: Edit Patient Billing (Admin ONLY)
  const [isEditBillModalOpen, setIsEditBillModalOpen] = useState(false);
  const [editingBill, setEditingBill] = useState<any | null>(null);
  const [editBillForm, setEditBillForm] = useState({
    reference: '',
    montant: '',
    type_paiement: 'Patient',
    statut: 'Payé',
  });
  const [savingBillEdit, setSavingBillEdit] = useState(false);
  const [confirmDeleteBill, setConfirmDeleteBill] = useState(false);

  // Document templates & custom invoice references
  const [docTemplates, setDocTemplates] = useState<DocumentTemplatesConfig>(() =>
    getCachedDocumentTemplates()
  );
  const [customInvoiceRefs, setCustomInvoiceRefs] = useState<CustomInvoiceRefsStore>(() =>
    getCachedCustomInvoiceRefs()
  );
  const [inlineRefBillId, setInlineRefBillId] = useState<string | null>(null);
  const [inlineRefValue, setInlineRefValue] = useState<string>('');

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

      const [billingData, expenseData, patData, apptData, loadedTemplates, loadedRefs] =
        await Promise.all([
          fetchAllRows(
            'billings',
            '*, patients(id, nom, prenom, atcd), appointments(id, date_heure, statut)',
            {
              column: 'date_facturation',
              ascending: false,
            }
          ),
          fetchAllRows('expenses', '*', { column: 'date', ascending: false }),
          fetchAllRows('patients', 'id, nom, prenom, telephone, atcd'),
          fetchAllRows('appointments', 'id, patient_id, statut, date_heure'),
          fetchDocumentTemplates(supabase),
          fetchCustomInvoiceRefs(supabase),
        ]);

      setDocTemplates(loadedTemplates);
      setCustomInvoiceRefs(loadedRefs);

      const safePatients = patData || [];
      const safeAppointments = apptData || [];
      setPatientsList(safePatients);
      setAppointmentsList(safeAppointments);

      const loadedClubs = await fetchPartnerClubs(supabase, safePatients);
      setPartnerClubs(loadedClubs);

      const cleanBills = sanitizeBillings(billingData || [], safeAppointments);
      setBillings(cleanBills.filter((b) => isPaidBillingStatus(b.statut)));
      setUnpaidBillings(cleanBills.filter((b) => isUnpaidBillingStatus(b.statut)));

      setExpenses(
        (expenseData || []).map((e: any) => ({
          ...e,
          amount: roundMoney(e.amount),
        }))
      );
    } catch (err) {
      console.error('Error fetching financial data:', err);
    } finally {
      setLoading(false);
    }
  };

  const isAdmin = userProfile?.role === 'admin';

  const hasPermission = (permission: string) => {
    if (!userProfile) return false;
    if (userProfile.role === 'admin') return true;
    return userProfile.permissions?.includes(permission);
  };

  // Map patient_id -> patient record & club name
  const patientsByIdMap = useMemo(() => {
    const map = new Map<string, any>();
    for (const p of patientsList) {
      if (p?.id) map.set(p.id, p);
    }
    return map;
  }, [patientsList]);

  const resolveBillPatient = (bill: any): { id: string | null; name: string } => {
    const relPat = bill?.patients
      ? Array.isArray(bill.patients)
        ? bill.patients[0]
        : bill.patients
      : null;
    const fallbackPat = bill?.patient_id ? patientsByIdMap.get(bill.patient_id) : null;
    const pat = relPat || fallbackPat;
    const resolvedId = pat?.id || bill?.patient_id || null;
    const resolvedName = pat
      ? `${pat.prenom || ''} ${pat.nom || ''}`.trim() || 'Patient'
      : 'Client divers';
    return { id: resolvedId, name: resolvedName };
  };

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
  const dateRange = getDateRange(dateFilter, customDate, selectedMonths);
  const filterLabel = dateRange.label;

  const filteredBillingsAll = billings.filter((b) => isDateInRange(getBillDate(b), dateRange));
  const filteredBillings = filteredBillingsAll.filter(matchesClubTableFilter);
  const filteredExpenses = expenses.filter((e) => isDateInRange(e.date, dateRange));
  const filteredUnpaidPeriodAll = unpaidBillings.filter((b) =>
    isDateInRange(getBillDate(b), dateRange)
  );
  const baseUnpaidForTable =
    unpaidScope === 'period' && dateFilter !== 'all' ? filteredUnpaidPeriodAll : unpaidBillings;
  const displayedUnpaid = baseUnpaidForTable.filter(matchesClubTableFilter);

  const totalRecettes = sumMoney(filteredBillingsAll, (b) => b.montant);
  const displayedRecettesTotal = sumMoney(filteredBillings, (b) => b.montant);
  const totalDepenses = sumMoney(filteredExpenses, (e) => e.amount);
  const caNet = roundMoney(totalRecettes - totalDepenses);
  const totalTransactions = filteredBillingsAll.length;

  const totalUnpaidGlobal = sumMoney(unpaidBillings, (b) => b.montant);
  const totalUnpaidPeriod = sumMoney(filteredUnpaidPeriodAll, (b) => b.montant);
  const displayedUnpaidTotal = sumMoney(displayedUnpaid, (b) => b.montant);

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
          (a.statut === 'Effectué' || a.statut === 'Impayé') &&
          isDateInRange(a.date_heure, dateRange)
      );

      const paidPeriodBills = filteredBillingsAll.filter(
        (b) => getBillClub(b).toLowerCase() === clubKey
      );

      const unpaidClubBills = unpaidBillings.filter(
        (b) => getBillClub(b).toLowerCase() === clubKey
      );

      const totalPaid = sumMoney(paidPeriodBills, (b) => b.montant);
      const totalUnpaid = sumMoney(unpaidClubBills, (b) => b.montant);

      // Per-athlete breakdown inside this club
      const athletes = clubPatients.map((pat) => {
        const patSessions = periodAppts.filter((a) => a.patient_id === pat.id).length;
        const patPaid = sumMoney(
          paidPeriodBills.filter((b) => b.patient_id === pat.id),
          (b) => b.montant
        );
        const patUnpaidBills = unpaidClubBills.filter((b) => b.patient_id === pat.id);
        const patUnpaid = sumMoney(patUnpaidBills, (b) => b.montant);

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
        hasAccess: Boolean(meta.hasAccess),
        loginId: meta.loginId || '',
        authEmail: meta.authEmail || '',
        rawClubMeta: meta,
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
    return {
      athletes: clubAccountingStats.reduce((s, c) => s + c.patientsCount, 0),
      sessions: clubAccountingStats.reduce((s, c) => s + c.sessionsCount, 0),
      paid: sumMoney(clubAccountingStats, (c) => c.totalPaid),
      unpaid: sumMoney(clubAccountingStats, (c) => c.totalUnpaid),
    };
  }, [clubAccountingStats]);

  const exportToExcel = () => {
    const rows: any[] = filteredBillings.map((bill) => {
      const date = getBillDate(bill);
      return {
        Date: date.toLocaleDateString('fr-FR'),
        Référence: getBillingDisplayReference(bill, docTemplates, customInvoiceRefs),
        Patient: bill.patients ? `${bill.patients.prenom} ${bill.patients.nom}` : 'Client divers',
        'Club Sportif': getBillClub(bill) || 'Particulier',
        'Nature des actes': docTemplates.invoice.defaultActLabel || 'Séance de kinésithérapie',
        'Mode de paiement': bill.type_paiement,
        'Montant (DH)': roundMoney(bill.montant),
      };
    });

    rows.push({
      Date: 'TOTAL',
      Référence: `${filteredBillings.length} règlement(s)`,
      Patient: '',
      'Club Sportif': '',
      'Nature des actes': '',
      'Mode de paiement': '',
      'Montant (DH)': displayedRecettesTotal,
    });

    const ws = XLSX.utils.json_to_sheet(rows);
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

    const cleanAmount = roundMoney(newExpense.amount);
    const { data, error } = await supabase
      .from('expenses')
      .insert([
        {
          amount: cleanAmount,
          category: newExpense.category,
          description: newExpense.description,
          date: newExpense.date,
        },
      ])
      .select();

    if (!error && data) {
      setExpenses([{ ...data[0], amount: roundMoney(data[0].amount) }, ...expenses]);
      setIsExpenseModalOpen(false);
      setNewExpense({
        amount: '',
        category: 'Matériel',
        description: '',
        date: getMoroccoTodayStr(),
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

  const handleSaveInlineFinanceRef = async (bill: any) => {
    if (!bill?.id) return;
    const defaultRef = getBillingDisplayReference(bill, docTemplates, null);
    const trimmed = inlineRefValue.trim();
    const refToStore = trimmed && trimmed !== defaultRef ? trimmed : '';
    const updated = await saveBillingCustomInvoiceRef(supabase, bill.id, refToStore);
    setCustomInvoiceRefs(updated);
    setInlineRefBillId(null);
    setInlineRefValue('');
    showNotice('success', 'Référence de la facture mise à jour.');
  };

  const openEditBillModal = (bill: any) => {
    if (!isAdmin) return;
    setEditingBill(bill);
    setEditBillForm({
      reference: getBillingDisplayReference(bill, docTemplates, customInvoiceRefs),
      montant: String(bill.montant ?? '0'),
      type_paiement: bill.type_paiement || 'Patient',
      statut: bill.statut === 'En attente' || bill.statut === 'Impayé' || bill.statut === 'Rejeté' ? 'En attente' : 'Payé',
    });
    setConfirmDeleteBill(false);
    setIsEditBillModalOpen(true);
  };

  const handleSaveBillEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingBill || !isAdmin) return;

    const rawAmount = parseFloat(editBillForm.montant);
    if (isNaN(rawAmount) || rawAmount < 0) {
      showNotice('error', 'Veuillez saisir un montant valide.');
      return;
    }
    const parsedAmount = roundMoney(rawAmount);

    setSavingBillEdit(true);
    try {
      const nextStatut = editBillForm.statut === 'En attente' ? 'En attente' : 'Payé';
      const { error: billErr } = await supabase
        .from('billings')
        .update({
          montant: parsedAmount,
          type_paiement: editBillForm.type_paiement,
          statut: nextStatut,
        })
        .eq('id', editingBill.id);

      if (billErr) throw billErr;

      const defaultRef = getBillingDisplayReference(editingBill, docTemplates, null);
      const trimmedRef = (editBillForm.reference || '').trim();
      const refToStore = trimmedRef && trimmedRef !== defaultRef ? trimmedRef : '';
      const updatedRefs = await saveBillingCustomInvoiceRef(supabase, editingBill.id, refToStore);
      setCustomInvoiceRefs(updatedRefs);

      const appId =
        editingBill.appointment_id ||
        (editingBill.appointments && !Array.isArray(editingBill.appointments)
          ? editingBill.appointments.id
          : editingBill.appointments?.[0]?.id);

      if (appId) {
        await supabase
          .from('appointments')
          .update({ statut: nextStatut === 'Payé' ? 'Effectué' : 'Impayé' })
          .eq('id', appId);
      }

      await fetchFinancialData();
      setIsEditBillModalOpen(false);
      setEditingBill(null);
      showNotice('success', 'Règlement et référence mis à jour avec succès.');
    } catch (err: any) {
      showNotice('error', err.message || 'Erreur lors de la modification du règlement.');
    } finally {
      setSavingBillEdit(false);
    }
  };

  const handleDeleteBillFromFinance = async () => {
    if (!editingBill || !isAdmin) return;

    setSavingBillEdit(true);
    try {
      const { error } = await supabase.from('billings').delete().eq('id', editingBill.id);
      if (error) throw error;

      await fetchFinancialData();
      setIsEditBillModalOpen(false);
      setEditingBill(null);
      setConfirmDeleteBill(false);
      showNotice('success', 'Règlement supprimé avec succès.');
    } catch (err: any) {
      showNotice('error', err.message || 'Erreur lors de la suppression du règlement.');
    } finally {
      setSavingBillEdit(false);
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
        <div className="flex flex-wrap items-center gap-2">
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
              onChange={(e) => {
                const next = e.target.value;
                setDateFilter(next);
                if (next === 'months') {
                  setMonthPickerTrigger((c) => c + 1);
                }
              }}
              className="bg-transparent border-none text-sm font-medium text-slate-700 focus:ring-0 cursor-pointer py-1 pr-8 pl-2 outline-none"
            >
              <option value="day">Aujourd'hui</option>
              <option value="exact">Date exacte</option>
              <option value="7days">7 derniers jours</option>
              <option value="week">Cette semaine</option>
              <option value="month">Ce mois</option>
              <option value="months">Plusieurs mois</option>
              <option value="year">Cette année</option>
              <option value="all">Tout le temps</option>
            </select>
          </div>
          {dateFilter === 'months' && (
            <MultiMonthPicker
              selectedMonths={selectedMonths}
              onChange={setSelectedMonths}
              openTrigger={monthPickerTrigger}
            />
          )}
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
                {formatMoney(caNet)} DH
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
                {formatMoney(totalRecettes)} DH
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
                {formatMoney(totalDepenses)} DH
              </div>
              <p className="text-xs mt-1 text-slate-500">Sorties brutes</p>
            </CardContent>
          </Card>

          <Card className="border-0 shadow-sm border-t-4 border-t-rose-500">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-slate-500">
                Impayés (Total global)
              </CardTitle>
              <div className="h-8 w-8 rounded-full flex items-center justify-center bg-rose-50">
                <AlertCircle className="h-4 w-4 text-rose-600" />
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-rose-600">
                {formatMoney(totalUnpaidGlobal)} DH
              </div>
              <p className="text-xs mt-1 text-slate-500">
                {dateFilter === 'all'
                  ? `${unpaidBillings.length} séance(s) à recouvrer`
                  : `Dont ${formatMoney(totalUnpaidPeriod)} DH sur ${filterLabel.toLowerCase()}`}
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
                {totalTransactions.toLocaleString('fr-FR')}
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
                  {formatMoney(clubsTotals.paid)} DH
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
                  {formatMoney(clubsTotals.unpaid)} DH
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
                              {clubStat.hasAccess && (
                                <span className="inline-flex items-center gap-1 text-xs font-bold bg-emerald-50 text-emerald-700 px-2 py-0.5 rounded-full border border-emerald-200">
                                  <CheckCircle2 className="h-3 w-3" />
                                  Accès portail{clubStat.loginId ? ` (${clubStat.loginId})` : ''}
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
                              {formatMoney(clubStat.totalPaid)} DH
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
                              {formatMoney(clubStat.totalUnpaid)} DH
                            </p>
                          </div>

                          <div
                            className="flex flex-wrap items-center gap-2"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              onClick={() => setClubForAccessModal(clubStat.rawClubMeta)}
                              className={`gap-1.5 text-xs ${
                                clubStat.hasAccess
                                  ? 'text-indigo-700 border-indigo-200 bg-indigo-50/60 hover:bg-indigo-100/70'
                                  : 'text-slate-700 border-slate-200 hover:bg-slate-50'
                              }`}
                              title="Créer ou modifier l'accès de l'administration du club"
                            >
                              <Key className="h-3.5 w-3.5" />
                              {clubStat.hasAccess ? 'Gérer accès' : 'Accès Club'}
                            </Button>

                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              onClick={() => openClubPortalPreview(clubStat.name, 'finance')}
                              className="text-slate-700 border-slate-200 hover:bg-slate-50 gap-1.5 text-xs"
                              title="Ouvrir le portail de suivi du club"
                            >
                              <ExternalLink className="h-3.5 w-3.5" />
                              Portail Club
                            </Button>

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
                                  : `Tout régler (${formatMoney(clubStat.totalUnpaid)} DH)`}
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
                                        <PatientNameLink
                                          patientId={ath.id}
                                          name={ath.fullName}
                                          fromRoute="finance"
                                          className="font-bold text-slate-900"
                                        />
                                      </td>
                                      <td className="px-4 py-2.5 text-slate-600">
                                        {ath.telephone || '-'}
                                      </td>
                                      <td className="px-4 py-2.5 text-center font-semibold text-slate-700">
                                        {ath.sessionsCount}
                                      </td>
                                      <td className="px-4 py-2.5 text-right font-bold text-emerald-600">
                                        {formatMoney(ath.paidAmount)} DH
                                      </td>
                                      <td
                                        className={`px-4 py-2.5 text-right font-bold ${
                                          ath.unpaidAmount > 0 ? 'text-rose-600' : 'text-slate-400'
                                        }`}
                                      >
                                        {formatMoney(ath.unpaidAmount)} DH
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
              <div className="p-4 border-b border-slate-100 bg-rose-50/30 flex flex-col lg:flex-row lg:items-center justify-between gap-3">
                <div className="flex flex-wrap items-center gap-3">
                  <h3 className="font-semibold text-rose-800">Séances en attente de règlement</h3>
                  <span className="inline-flex items-center px-2.5 py-1 rounded-lg bg-rose-100 text-rose-800 text-xs font-bold">
                    Total affiché : {formatMoney(displayedUnpaidTotal)} DH ({displayedUnpaid.length})
                  </span>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {dateFilter !== 'all' && (
                    <div className="inline-flex rounded-lg border border-rose-200 bg-white p-0.5 text-xs">
                      <button
                        type="button"
                        onClick={() => setUnpaidScope('global')}
                        className={`px-2.5 py-1 rounded-md font-semibold transition-colors ${
                          unpaidScope === 'global'
                            ? 'bg-rose-600 text-white'
                            : 'text-slate-600 hover:text-slate-900'
                        }`}
                      >
                        Tous les impayés ({unpaidBillings.length})
                      </button>
                      <button
                        type="button"
                        onClick={() => setUnpaidScope('period')}
                        className={`px-2.5 py-1 rounded-md font-semibold transition-colors ${
                          unpaidScope === 'period'
                            ? 'bg-rose-600 text-white'
                            : 'text-slate-600 hover:text-slate-900'
                        }`}
                      >
                        {filterLabel} ({filteredUnpaidPeriodAll.length})
                      </button>
                    </div>
                  )}
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
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm text-left">
                  <thead className="text-xs text-slate-500 uppercase bg-slate-50">
                    <tr>
                      <th className="px-6 py-4 font-medium">Référence</th>
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
                        const date = getBillDate(bill);
                        const linkedAppt = Array.isArray(bill.appointments)
                          ? bill.appointments[0]
                          : bill.appointments;
                        const apptDateStr = linkedAppt?.date_heure
                          ? parseClinicDate(linkedAppt.date_heure).toLocaleDateString('fr-FR')
                          : null;
                        const billDateStr = date.toLocaleDateString('fr-FR');
                        const clubName = getBillClub(bill);
                        const rowRef = getBillingDisplayReference(
                          bill,
                          docTemplates,
                          customInvoiceRefs
                        );
                        const isEditingRowRef = inlineRefBillId === bill.id;
                        return (
                          <tr key={bill.id} className="hover:bg-rose-50/30 transition-colors">
                            <td className="px-6 py-4">
                              {isEditingRowRef ? (
                                <div className="flex items-center gap-1.5 max-w-[190px]">
                                  <input
                                    type="text"
                                    value={inlineRefValue}
                                    onChange={(e) => setInlineRefValue(e.target.value)}
                                    onKeyDown={(e) => {
                                      if (e.key === 'Enter') {
                                        e.preventDefault();
                                        handleSaveInlineFinanceRef(bill);
                                      } else if (e.key === 'Escape') {
                                        setInlineRefBillId(null);
                                        setInlineRefValue('');
                                      }
                                    }}
                                    autoFocus
                                    className="w-full px-2 py-1 border border-primary-400 rounded text-xs font-mono font-semibold text-slate-900 outline-none"
                                  />
                                  <button
                                    type="button"
                                    onClick={() => handleSaveInlineFinanceRef(bill)}
                                    className="px-2 py-1 rounded bg-slate-900 text-white text-[11px] font-semibold hover:bg-slate-800 cursor-pointer shrink-0"
                                  >
                                    OK
                                  </button>
                                </div>
                              ) : (
                                <div className="inline-flex items-center gap-1.5 group">
                                  <span className="font-mono text-xs font-semibold text-slate-700">
                                    {rowRef}
                                  </span>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setInlineRefBillId(bill.id);
                                      setInlineRefValue(rowRef);
                                    }}
                                    title="Personnaliser la référence"
                                    className="p-1 rounded text-slate-400 hover:text-slate-700 hover:bg-slate-100 opacity-70 group-hover:opacity-100 transition-opacity cursor-pointer"
                                  >
                                    <Edit2 className="h-3 w-3" />
                                  </button>
                                </div>
                              )}
                            </td>
                            <td className="px-6 py-4 text-slate-600">
                              <div>{billDateStr}</div>
                              {apptDateStr && apptDateStr !== billDateStr && (
                                <div className="text-[11px] text-slate-400">
                                  Séance du {apptDateStr}
                                </div>
                              )}
                            </td>
                            <td className="px-6 py-4 font-medium text-slate-900">
                              {(() => {
                                const billPat = resolveBillPatient(bill);
                                return (
                                  <PatientNameLink
                                    patientId={billPat.id}
                                    name={billPat.name}
                                    fromRoute="finance"
                                    className="font-semibold text-slate-900"
                                  />
                                );
                              })()}
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
                              {formatMoney(bill.montant)} DH
                            </td>
                            <td className="px-6 py-4 text-center">
                              <div className="inline-flex items-center justify-center gap-2">
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
                                {isAdmin && (
                                  <Button
                                    type="button"
                                    variant="outline"
                                    size="sm"
                                    onClick={(e) => {
                                      e.preventDefault();
                                      e.stopPropagation();
                                      openEditBillModal(bill);
                                    }}
                                    className="h-8 px-2.5 text-xs border-indigo-200 text-indigo-700 hover:bg-indigo-50 gap-1"
                                    title="Modifier le règlement (Administrateur)"
                                  >
                                    <Edit2 className="h-3.5 w-3.5" />
                                    Modifier
                                  </Button>
                                )}
                              </div>
                            </td>
                          </tr>
                        );
                      })
                    ) : (
                      <tr>
                        <td colSpan={7} className="px-6 py-8 text-center text-slate-500">
                          Aucun impayé correspondant à ce filtre.
                        </td>
                      </tr>
                    )}
                  </tbody>
                  {displayedUnpaid.length > 0 && (
                    <tfoot className="bg-rose-50/50 border-t-2 border-rose-100">
                      <tr>
                        <td colSpan={5} className="px-6 py-3.5 text-xs font-bold uppercase text-rose-900">
                          Total des impayés affichés ({displayedUnpaid.length} séance{displayedUnpaid.length > 1 ? 's' : ''})
                        </td>
                        <td className="px-6 py-3.5 text-right text-base font-black text-rose-700">
                          {formatMoney(displayedUnpaidTotal)} DH
                        </td>
                        <td />
                      </tr>
                    </tfoot>
                  )}
                </table>
              </div>
            </>
          )}

          {activeTab === 'recettes' && hasPermission('finance_recettes') && (
            <>
              <div className="p-4 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-slate-50/50">
                <div className="flex flex-wrap items-center gap-3">
                  <h3 className="font-semibold text-slate-800">Historique des Recettes</h3>
                  <span className="inline-flex items-center px-2.5 py-1 rounded-lg bg-emerald-50 text-emerald-800 border border-emerald-200 text-xs font-bold">
                    Total affiché : {formatMoney(displayedRecettesTotal)} DH ({filteredBillings.length})
                  </span>
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
                      <th className="px-6 py-4 font-medium">Référence</th>
                      <th className="px-6 py-4 font-medium">Date</th>
                      <th className="px-6 py-4 font-medium">Patient</th>
                      <th className="px-6 py-4 font-medium">Club Sportif</th>
                      <th className="px-6 py-4 font-medium">Mode</th>
                      <th className="px-6 py-4 font-medium">Statut</th>
                      <th className="px-6 py-4 font-medium text-right">Montant</th>
                      {isAdmin && <th className="px-6 py-4 font-medium text-right">Action</th>}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filteredBillings.length > 0 ? (
                      filteredBillings.map((bill) => {
                        const date = getBillDate(bill);
                        const linkedAppt = Array.isArray(bill.appointments)
                          ? bill.appointments[0]
                          : bill.appointments;
                        const apptDateStr = linkedAppt?.date_heure
                          ? parseClinicDate(linkedAppt.date_heure).toLocaleDateString('fr-FR')
                          : null;
                        const billDateStr = date.toLocaleDateString('fr-FR');
                        const clubName = getBillClub(bill);
                        const rowRef = getBillingDisplayReference(
                          bill,
                          docTemplates,
                          customInvoiceRefs
                        );
                        const isEditingRowRef = inlineRefBillId === bill.id;
                        return (
                          <tr key={bill.id} className="hover:bg-slate-50 transition-colors">
                            <td className="px-6 py-4">
                              {isEditingRowRef ? (
                                <div className="flex items-center gap-1.5 max-w-[190px]">
                                  <input
                                    type="text"
                                    value={inlineRefValue}
                                    onChange={(e) => setInlineRefValue(e.target.value)}
                                    onKeyDown={(e) => {
                                      if (e.key === 'Enter') {
                                        e.preventDefault();
                                        handleSaveInlineFinanceRef(bill);
                                      } else if (e.key === 'Escape') {
                                        setInlineRefBillId(null);
                                        setInlineRefValue('');
                                      }
                                    }}
                                    autoFocus
                                    className="w-full px-2 py-1 border border-primary-400 rounded text-xs font-mono font-semibold text-slate-900 outline-none"
                                  />
                                  <button
                                    type="button"
                                    onClick={() => handleSaveInlineFinanceRef(bill)}
                                    className="px-2 py-1 rounded bg-slate-900 text-white text-[11px] font-semibold hover:bg-slate-800 cursor-pointer shrink-0"
                                  >
                                    OK
                                  </button>
                                </div>
                              ) : (
                                <div className="inline-flex items-center gap-1.5 group">
                                  <span className="font-mono text-xs font-semibold text-slate-700">
                                    {rowRef}
                                  </span>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setInlineRefBillId(bill.id);
                                      setInlineRefValue(rowRef);
                                    }}
                                    title="Personnaliser la référence"
                                    className="p-1 rounded text-slate-400 hover:text-slate-700 hover:bg-slate-100 opacity-70 group-hover:opacity-100 transition-opacity cursor-pointer"
                                  >
                                    <Edit2 className="h-3 w-3" />
                                  </button>
                                </div>
                              )}
                            </td>
                            <td className="px-6 py-4 text-slate-600">
                              <div>{billDateStr}</div>
                              {apptDateStr && apptDateStr !== billDateStr && (
                                <div className="text-[11px] text-slate-400">
                                  Séance du {apptDateStr}
                                </div>
                              )}
                            </td>
                            <td className="px-6 py-4 font-medium text-slate-900">
                              {(() => {
                                const billPat = resolveBillPatient(bill);
                                return (
                                  <PatientNameLink
                                    patientId={billPat.id}
                                    name={billPat.name}
                                    fromRoute="finance"
                                    className="font-semibold text-slate-900"
                                  />
                                );
                              })()}
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
                              {formatMoney(bill.montant)} DH
                            </td>
                            {isAdmin && (
                              <td className="px-6 py-4 text-right">
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => openEditBillModal(bill)}
                                  className="text-indigo-600 hover:text-indigo-700 hover:bg-indigo-50 gap-1 text-xs font-semibold"
                                  title="Modifier le règlement (Administrateur)"
                                >
                                  <Edit2 className="h-3.5 w-3.5" />
                                  Modifier
                                </Button>
                              </td>
                            )}
                          </tr>
                        );
                      })
                    ) : (
                      <tr>
                        <td colSpan={isAdmin ? 8 : 7} className="px-6 py-8 text-center text-slate-500">
                          Aucune recette enregistrée pour ce filtre.
                        </td>
                      </tr>
                    )}
                  </tbody>
                  {filteredBillings.length > 0 && (
                    <tfoot className="bg-slate-50 border-t-2 border-slate-200">
                      <tr>
                        <td colSpan={6} className="px-6 py-3.5 text-xs font-bold uppercase text-slate-700">
                          Total des recettes affichées ({filteredBillings.length} règlement{filteredBillings.length > 1 ? 's' : ''})
                        </td>
                        <td className="px-6 py-3.5 text-right text-base font-black text-emerald-700">
                          {formatMoney(displayedRecettesTotal)} DH
                        </td>
                        {isAdmin && <td />}
                      </tr>
                    </tfoot>
                  )}
                </table>
              </div>
            </>
          )}

          {activeTab === 'depenses' &&
            (hasPermission('finance_depenses_view') || hasPermission('finance_depenses_edit')) && (
              <>
                <div className="p-4 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
                  <div className="flex items-center gap-3">
                    <h3 className="font-semibold text-slate-800">Historique des Dépenses</h3>
                    <span className="inline-flex items-center px-2.5 py-1 rounded-lg bg-orange-50 text-orange-800 border border-orange-200 text-xs font-bold">
                      Total : {formatMoney(totalDepenses)} DH ({filteredExpenses.length})
                    </span>
                  </div>
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
                              {parseClinicDate(expense.date).toLocaleDateString('fr-FR')}
                            </td>
                            <td className="px-6 py-4">
                              <span className="bg-orange-100 text-orange-700 px-2.5 py-1 rounded-md text-xs font-medium">
                                {expense.category}
                              </span>
                            </td>
                            <td className="px-6 py-4 text-slate-600">{expense.description}</td>
                            <td className="px-6 py-4 text-right font-bold text-slate-900">
                              - {formatMoney(expense.amount)} DH
                            </td>
                          </tr>
                        ))
                      ) : (
                        <tr>
                          <td colSpan={4} className="px-6 py-8 text-center text-slate-500">
                            Aucune dépense enregistrée pour cette période.
                          </td>
                        </tr>
                      )}
                    </tbody>
                    {filteredExpenses.length > 0 && (
                      <tfoot className="bg-orange-50/40 border-t-2 border-orange-100">
                        <tr>
                          <td colSpan={3} className="px-6 py-3.5 text-xs font-bold uppercase text-orange-900">
                            Total des dépenses ({filteredExpenses.length})
                          </td>
                          <td className="px-6 py-3.5 text-right text-base font-black text-orange-700">
                            - {formatMoney(totalDepenses)} DH
                          </td>
                        </tr>
                      </tfoot>
                    )}
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
                step="any"
                onWheel={(e) => e.currentTarget.blur()}
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
              step="any"
              onWheel={(e) => e.currentTarget.blur()}
              placeholder="0"
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

      {/* Modal : Modifier le règlement d'un patient (Admin uniquement) */}
      <Modal
        isOpen={isEditBillModalOpen && isAdmin}
        onClose={() => {
          if (!savingBillEdit) {
            setIsEditBillModalOpen(false);
            setConfirmDeleteBill(false);
          }
        }}
        title="Modifier le règlement (Administrateur)"
        maxWidth="sm"
      >
        <form onSubmit={handleSaveBillEdit} className="space-y-4">
          {editingBill && (() => {
            const editBillPat = resolveBillPatient(editingBill);
            if (!editBillPat.id && editBillPat.name === 'Client divers') return null;
            return (
              <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 text-sm">
                <span className="text-xs font-semibold uppercase text-slate-400 block">Patient</span>
                <PatientNameLink
                  patientId={editBillPat.id}
                  name={editBillPat.name}
                  fromRoute="finance"
                  showIconAlways
                  onBeforeNavigate={() => {
                    setIsEditBillModalOpen(false);
                    setConfirmDeleteBill(false);
                  }}
                  className="font-bold text-slate-900 mt-0.5"
                />
              </div>
            );
          })()}

          <div className="space-y-1.5">
            <label className="text-sm font-medium text-slate-700">
              Référence de la facture / du règlement
            </label>
            <input
              type="text"
              value={editBillForm.reference}
              onChange={(e) => setEditBillForm({ ...editBillForm, reference: e.target.value })}
              placeholder="Ex: FAC-2026-0001"
              className="w-full p-2.5 border border-slate-200 rounded-lg font-mono text-sm font-semibold text-slate-900 focus:ring-2 focus:ring-indigo-500 outline-none"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-medium text-slate-700">Montant (DH)</label>
            <input
              type="number"
              min="0"
              step="any"
              onWheel={(e) => e.currentTarget.blur()}
              required
              value={editBillForm.montant}
              onChange={(e) => setEditBillForm({ ...editBillForm, montant: e.target.value })}
              className="w-full p-2.5 border border-slate-200 rounded-lg font-semibold text-slate-900 focus:ring-2 focus:ring-indigo-500 outline-none"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-medium text-slate-700">Mode de paiement</label>
            <select
              value={editBillForm.type_paiement}
              onChange={(e) => setEditBillForm({ ...editBillForm, type_paiement: e.target.value })}
              className="w-full p-2.5 border border-slate-200 rounded-lg bg-white text-slate-900 focus:ring-2 focus:ring-indigo-500 outline-none"
            >
              <option value="Patient">Direct (Patient)</option>
              <option value="Mutuelle">Mutuelle</option>
              <option value="Tiers-payant">Tiers-payant</option>
              <option value="Hors nomenclature">Hors nomenclature</option>
              <option value="Espèces">Espèces</option>
              <option value="Carte bancaire">Carte bancaire</option>
              <option value="Virement">Virement</option>
              <option value="Chèque">Chèque</option>
              {!['Patient', 'Mutuelle', 'Tiers-payant', 'Hors nomenclature', 'Espèces', 'Carte bancaire', 'Virement', 'Chèque'].includes(editBillForm.type_paiement) &&
                editBillForm.type_paiement && (
                  <option value={editBillForm.type_paiement}>{editBillForm.type_paiement}</option>
                )}
            </select>
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-medium text-slate-700">Statut du règlement</label>
            <select
              value={editBillForm.statut}
              onChange={(e) => setEditBillForm({ ...editBillForm, statut: e.target.value })}
              className="w-full p-2.5 border border-slate-200 rounded-lg bg-white text-slate-900 focus:ring-2 focus:ring-indigo-500 outline-none"
            >
              <option value="Payé">Payé (Encaissé)</option>
              <option value="En attente">En attente / Impayé</option>
            </select>
          </div>

          {confirmDeleteBill ? (
            <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 space-y-2.5">
              <p className="text-xs font-semibold text-rose-800">
                Confirmer la suppression définitive de ce règlement ?
              </p>
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  size="sm"
                  disabled={savingBillEdit}
                  onClick={handleDeleteBillFromFinance}
                  className="bg-rose-600 hover:bg-rose-700 text-white text-xs"
                >
                  {savingBillEdit ? 'Suppression...' : 'Oui, supprimer'}
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={savingBillEdit}
                  onClick={() => setConfirmDeleteBill(false)}
                  className="text-xs"
                >
                  Annuler
                </Button>
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-between gap-3 pt-4 border-t border-slate-100">
              <Button
                type="button"
                variant="ghost"
                disabled={savingBillEdit}
                onClick={() => setConfirmDeleteBill(true)}
                className="text-rose-600 hover:bg-rose-50 hover:text-rose-700 gap-1.5 text-xs"
              >
                <Trash2 className="h-4 w-4" />
                Supprimer
              </Button>
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  disabled={savingBillEdit}
                  onClick={() => setIsEditBillModalOpen(false)}
                >
                  Fermer
                </Button>
                <Button
                  type="submit"
                  disabled={savingBillEdit}
                  className="bg-indigo-600 hover:bg-indigo-700 text-white"
                >
                  {savingBillEdit ? 'Enregistrement...' : 'Enregistrer'}
                </Button>
              </div>
            </div>
          )}
        </form>
      </Modal>

      <ClubAccessModal
        isOpen={Boolean(clubForAccessModal)}
        club={clubForAccessModal}
        fromRoute="finance"
        onClose={() => setClubForAccessModal(null)}
        onUpdated={async () => {
          const updatedClubs = await fetchPartnerClubs(supabase, patientsList);
          setPartnerClubs(updatedClubs);
          if (clubForAccessModal) {
            const refreshed = updatedClubs.find(
              (c) => c.name.toLowerCase() === clubForAccessModal.name.toLowerCase()
            );
            if (refreshed) setClubForAccessModal(refreshed);
          }
        }}
      />
    </div>
  );
}
