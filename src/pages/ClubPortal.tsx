import React, { useEffect, useMemo, useState } from 'react';
import {
  Trophy,
  Users,
  Activity,
  Wallet,
  AlertCircle,
  CheckCircle2,
  Calendar,
  Clock,
  Search,
  FileSpreadsheet,
  RefreshCw,
  LogOut,
  ArrowLeft,
  ChevronRight,
  TrendingDown,
  TrendingUp,
  Minus,
  Key,
  Eye,
  EyeOff,
  FileText,
  Stethoscope,
  Phone,
  Edit2,
  Plus,
  FolderOpen,
  X,
} from 'lucide-react';
import * as XLSX from 'xlsx';
import { supabase, clearStoredAuthSession } from '../lib/supabaseClient';
import { Card, CardContent } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Modal } from '../components/ui/modal';
import { PainEvolutionChart } from '../components/patients/PainEvolutionChart';
import { parsePainLogsFromPatient, PainLogItem } from '../lib/exercisesService';
import { getMoroccoNow, parseClinicDate } from '../lib/timeUtils';
import { PartnerClub, parsePatientMutuelle, fetchPartnerClubs } from '../lib/mutuelleUtils';
import {
  sanitizeBillings,
  formatMoney,
  sumMoney,
  roundMoney,
  isPaidBillingStatus,
  isUnpaidBillingStatus,
  getBillDate,
  fetchAllRows,
} from '../lib/financeUtils';
import {
  DocumentTemplatesConfig,
  CustomInvoiceRefsStore,
  getCachedDocumentTemplates,
  fetchDocumentTemplates,
  getCachedCustomInvoiceRefs,
  fetchCustomInvoiceRefs,
  getBillingDisplayReference,
} from '../lib/documentTemplates';
import {
  isClubSyntheticEmail,
  isClubProfile,
  isRevokedClubProfile,
  parseClubProfileMeta,
} from '../lib/clubPortalUtils';
import { openPatientDossier } from '../lib/patientNavigation';
import { resolveOrBindCollaboratorSession, canManageSessionCounts } from '../lib/teamUtils';

const STANDARD_MOTIFS_LOWER = new Set(
  [
    'kinésithérapie classique',
    'kinesitherapie classique',
    'kiné-respiratoire',
    'kine-respiratoire',
    'réathlétisation',
    'reathletisation',
    'cupping thérapie',
    'cupping therapie',
    'onde de choc',
    'tecar thérapie',
    'tecar therapie',
    'récupération',
    'recuperation',
    'rééducation vestibulaire',
    'reeducation vestibulaire',
    'séance de bilan',
    'seance de bilan',
    'consultation nutritionnelle',
    'séance de contrôle',
    'seance de controle',
    'thérapie manuelle',
    'therapie manuelle',
    'séance à domicile',
    'seance a domicile',
    'séance de suivi',
    'seance de suivi',
    'séance confirmée',
    'seance confirmee',
    'clinique taghzout',
    'clinique chiekhe essaadi agadir',
  ].map((s) => s.toLowerCase())
);

const DEFAULT_CLUB_MOTIFS = [
  'Kinésithérapie classique',
  'Tecar thérapie',
  'Réathlétisation',
  'Thérapie manuelle',
  'Onde de choc',
  'Cupping thérapie',
  'Récupération',
  'Kiné-respiratoire',
  'Rééducation vestibulaire',
  'Séance de bilan',
  'Séance de contrôle',
  'Consultation nutritionnelle',
  'Séance à domicile',
  'Séance de Suivi',
];

export interface TreatmentBreakdownItem {
  motif: string;
  count: number;
  percentage: number;
}

interface PlayerSummary {
  id: string;
  nom: string;
  prenom: string;
  fullName: string;
  telephone: string;
  dateNaissance: string | null;
  pathologie: string;
  cleanAtcd: string;
  organismeMutuelle: string;
  prescribedSessions: number;
  completedSessions: number;
  paidSessionsCount: number;
  unpaidSessionsCount: number;
  remainingSessions: number;
  extraSessions: number;
  upcomingSessions: number;
  cancelledSessions: number;
  progressPercent: number;
  treatments: any[];
  treatmentBreakdown: TreatmentBreakdownItem[];
  activeTreatmentMotifs: string[];
  appointments: any[];
  firstSessionDate: Date | null;
  lastSessionDate: Date | null;
  nextSessionDate: Date | null;
  latestClinicalNote: string;
  latestNoteDate: Date | null;
  latestNoteTherapist: string;
  painLogs: PainLogItem[];
  firstPainScore: number | null;
  latestPainScore: number | null;
  latestPainDate: string | null;
  painDelta: number | null;
  billings: any[];
  paidAmount: number;
  unpaidAmount: number;
  totalBilled: number;
  unpaidCount: number;
  paidCount: number;
  isActiveCare: boolean;
}

function cleanAppointmentNote(rawNote?: string | null): {
  therapistId: string | null;
  cleanText: string;
} {
  const raw = rawNote || '';
  if (raw.includes('||TH_ID:')) {
    const match = raw.match(/\|\|TH_ID:([a-f0-9-]+)\|\|(.*)/s);
    if (match) {
      return {
        therapistId: match[1],
        cleanText: (match[2] || '').trim(),
      };
    }
  }
  return { therapistId: null, cleanText: raw.trim() };
}

/**
 * In the clinic workflow (`CalendarView.tsx` / `PatientDetail.tsx`), a performed session
 * has status `'Effectué'` (when settled immediately) OR `'Impayé'` (when performed and put
 * on pending club/patient invoice). Both represent completed clinical care sessions.
 */
function isPerformedSessionStatus(statut?: string | null): boolean {
  const s = String(statut || '')
    .trim()
    .toLowerCase();
  return s === 'effectué' || s === 'effectue' || s === 'impayé' || s === 'impaye';
}

function isCancelledSessionStatus(statut?: string | null): boolean {
  const s = String(statut || '')
    .trim()
    .toLowerCase();
  return s === 'annulé' || s === 'annule';
}

function isPendingDemand(appt: any): boolean {
  const s = String(appt?.statut || '')
    .trim()
    .toLowerCase();
  const note = String(appt?.notes_seance || '');
  return s === 'en attente' || note.includes('[DEMANDE');
}

function normalizePathologieLabel(raw?: string | null): string {
  const trimmed = String(raw || '').trim();
  if (!trimmed || trimmed.toLowerCase() === 'x' || trimmed === '-') {
    return '';
  }
  return trimmed;
}

function normalizeAtcdLabel(raw?: string | null): string {
  const trimmed = String(raw || '').trim();
  if (!trimmed) return '';
  if (trimmed.toLowerCase() === 'ras' || trimmed.toLowerCase() === 'r.a.s') {
    return 'R.A.S. (Aucun antécédent particulier)';
  }
  return trimmed;
}

function extractSessionActLabel(noteText: string): string {
  const clean = (noteText || '')
    .replace(/\[DEMANDE.*?\]/gi, '')
    .replace(/\|\|Initial:.*$/i, '')
    .trim();
  if (!clean) return '';
  // Ignore accidental numeric-only entries (e.g. "150")
  if (/^\d+([.,]\d+)?$/.test(clean)) return '';
  // If a multi-line note starts with a short title, use first line if short
  const firstLine = clean.split('\n')[0].trim();
  if (firstLine.length <= 48) {
    return firstLine;
  }
  return '';
}

function isDetailedClinicalObservation(
  noteText: string,
  knownMotifsLower: Set<string>
): boolean {
  const clean = (noteText || '').trim();
  if (!clean) return false;
  if (clean.includes('[DEMANDE')) return false;
  if (/^\d+([.,]\d+)?$/.test(clean)) return false;
  const lower = clean.toLowerCase();
  if (STANDARD_MOTIFS_LOWER.has(lower) || knownMotifsLower.has(lower)) {
    return false;
  }
  return clean.length >= 12;
}

async function fetchScopedRowsByPatients(
  table: string,
  columns: string,
  patientIds: string[],
  orderColumn?: string
): Promise<any[]> {
  if (patientIds.length === 0) return [];
  const pageSize = 1000;
  const all: any[] = [];
  let from = 0;

  while (true) {
    let query = supabase
      .from(table)
      .select(columns)
      .in('patient_id', patientIds)
      .range(from, from + pageSize - 1);

    if (orderColumn) {
      query = query.order(orderColumn, { ascending: false });
    }

    const { data, error } = await query;
    if (error) {
      console.warn(`Avertissement lecture ${table}:`, error.message);
      break;
    }
    const batch = data || [];
    all.push(...batch);
    if (batch.length < pageSize) break;
    from += pageSize;
  }

  return all;
}

function computeAge(dateNaissance?: string | null): number | null {
  if (!dateNaissance) return null;
  const d = new Date(dateNaissance);
  if (isNaN(d.getTime())) return null;
  const now = getMoroccoNow();
  let age = now.getFullYear() - d.getFullYear();
  const m = now.getMonth() - d.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < d.getDate())) {
    age--;
  }
  return age >= 0 && age < 120 ? age : null;
}

function getPainBadgeClasses(score: number): string {
  if (score <= 2) return 'bg-emerald-50 text-emerald-700 border-emerald-200';
  if (score <= 4) return 'bg-lime-50 text-lime-700 border-lime-200';
  if (score <= 6) return 'bg-amber-50 text-amber-700 border-amber-200';
  if (score <= 8) return 'bg-orange-50 text-orange-700 border-orange-200';
  return 'bg-rose-50 text-rose-700 border-rose-200';
}

export function ClubPortal() {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');

  // Mode & Club Context
  const [isStaffPreview, setIsStaffPreview] = useState(false);
  const [returnRoute, setReturnRoute] = useState('finance');
  const [allPartnerClubs, setAllPartnerClubs] = useState<PartnerClub[]>([]);
  const [activeClub, setActiveClub] = useState<PartnerClub | null>(null);

  // Raw Club Data (strictly scoped to affiliated players)
  const [clubPatients, setClubPatients] = useState<any[]>([]);
  const [clubAppointments, setClubAppointments] = useState<any[]>([]);
  const [clubTreatments, setClubTreatments] = useState<any[]>([]);
  const [clubBillings, setClubBillings] = useState<any[]>([]);
  const [knownMotifsLower, setKnownMotifsLower] = useState<Set<string>>(
    () => new Set(STANDARD_MOTIFS_LOWER)
  );
  const [therapistMap, setTherapistMap] = useState<Map<string, string>>(new Map());
  const [docTemplates, setDocTemplates] = useState<DocumentTemplatesConfig>(() =>
    getCachedDocumentTemplates()
  );
  const [customInvoiceRefs, setCustomInvoiceRefs] = useState<CustomInvoiceRefsStore>(() =>
    getCachedCustomInvoiceRefs()
  );

  // Navigation & Filters
  const [activeTab, setActiveTab] = useState<'effectif' | 'evolution' | 'reglements'>('effectif');
  const [searchQuery, setSearchQuery] = useState('');
  const [rosterFilter, setRosterFilter] = useState<'all' | 'active' | 'unpaid' | 'completed'>('all');
  const [billingStatusFilter, setBillingStatusFilter] = useState<'all' | 'unpaid' | 'paid'>('all');
  const [billingPlayerFilter, setBillingPlayerFilter] = useState<string>('all');

  // Player Detail Modal
  const [selectedPlayerId, setSelectedPlayerId] = useState<string | null>(null);
  const [playerModalTab, setPlayerModalTab] = useState<
    'synthese' | 'evolution' | 'seances' | 'reglements'
  >('synthese');

  // Password Change Modal (for authenticated club administration)
  const [isPasswordModalOpen, setIsPasswordModalOpen] = useState(false);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [passwordSaving, setPasswordSaving] = useState(false);
  const [passwordNotice, setPasswordNotice] = useState<{
    type: 'success' | 'error';
    text: string;
  } | null>(null);

  // Staff-only Quick Edit Prescribed Sessions Modal (`isStaffPreview` + Admin/Secrétaire ONLY)
  const [canEditSessionCount, setCanEditSessionCount] = useState(false);
  const [playerForSessionsEdit, setPlayerForSessionsEdit] = useState<PlayerSummary | null>(null);
  const [sessionsEditValue, setSessionsEditValue] = useState<string>('10');
  const [sessionsEditSaving, setSessionsEditSaving] = useState(false);
  const [sessionsEditError, setSessionsEditError] = useState<string>('');

  // Staff-only Quick Edit Session Motif Modal (`isStaffPreview` only — works on completed sessions too)
  const [clubMotifs, setClubMotifs] = useState<string[]>(DEFAULT_CLUB_MOTIFS);
  const [apptForMotifEdit, setApptForMotifEdit] = useState<any | null>(null);
  const [motifEditValue, setMotifEditValue] = useState<string>('');
  const [showClubMotifDropdown, setShowClubMotifDropdown] = useState<boolean>(false);
  const [applyMotifToSameOldMotif, setApplyMotifToSameOldMotif] = useState<boolean>(false);
  const [motifEditSaving, setMotifEditSaving] = useState<boolean>(false);
  const [motifEditError, setMotifEditError] = useState<string>('');

  useEffect(() => {
    try {
      const savedReturn = sessionStorage.getItem('reforme_club_return_route');
      if (savedReturn) setReturnRoute(savedReturn);
    } catch {}

    loadClubPortalData(false);

    const handleFocus = () => loadClubPortalData(true);
    window.addEventListener('focus', handleFocus);
    const interval = setInterval(() => loadClubPortalData(true), 30000);

    return () => {
      window.removeEventListener('focus', handleFocus);
      clearInterval(interval);
    };
  }, []);

  const handleSignOut = async (blockedReason?: string) => {
    if (blockedReason) {
      try {
        sessionStorage.setItem('reforme_auth_blocked_msg', blockedReason);
      } catch {}
    }
    try {
      sessionStorage.removeItem('reforme_portal_club_name');
    } catch {}
    clearStoredAuthSession();
    await supabase.auth.signOut({ scope: 'local' }).catch(() => {});
    window.location.hash = 'login';
  };

  const loadClubPortalData = async (silent = false, overridePreviewClubName?: string) => {
    if (!silent) {
      setLoading(true);
    } else {
      setRefreshing(true);
    }
    setError('');

    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session?.user) {
        window.location.hash = 'login';
        return;
      }

      const sessionEmail = (session.user.email || '').trim().toLowerCase();

      const { data: ownProfile } = await supabase
        .from('profiles')
        .select('id, role, permissions, created_at')
        .eq('id', session.user.id)
        .maybeSingle();

      if (isRevokedClubProfile(ownProfile)) {
        await handleSignOut(
          "L'accès au portail de ce club a été désactivé par l'administration du cabinet."
        );
        return;
      }

      const isClubAccount = isClubSyntheticEmail(sessionEmail) || isClubProfile(ownProfile);

      const safePatientCols =
        'id, nom, prenom, telephone, email, date_naissance, cin, adresse, pathologie, nombre_seances, atcd, forfait_seances, has_access, last_follow_up_date, follow_up_status, notes_antecedents, created_at';
      const fallbackPatientCols =
        'id, nom, prenom, telephone, email, date_naissance, cin, adresse, pathologie, nombre_seances, atcd, forfait_seances, has_access, last_follow_up_date, follow_up_status, created_at';

      let allPatientsRaw: any[] = [];
      try {
        allPatientsRaw = await fetchAllRows('patients', safePatientCols);
      } catch {
        allPatientsRaw = await fetchAllRows('patients', fallbackPatientCols);
      }

      const [loadedClubs, therapistsRes, motifsRes, templatesCfg, customRefsCfg] =
        await Promise.all([
          fetchPartnerClubs(supabase, allPatientsRaw),
          supabase.from('therapists').select('id, nom, prenom'),
          supabase.from('seance_motifs').select('nom'),
          fetchDocumentTemplates(supabase),
          fetchCustomInvoiceRefs(supabase),
        ]);

      setDocTemplates(templatesCfg);
      setCustomInvoiceRefs(customRefsCfg);

      const motifsSet = new Set<string>(STANDARD_MOTIFS_LOWER);
      const mergedMotifLabels = [...DEFAULT_CLUB_MOTIFS];
      for (const m of motifsRes.data || []) {
        if (m?.nom) {
          const cleanLabel = String(m.nom).trim();
          if (cleanLabel) {
            motifsSet.add(cleanLabel.toLowerCase());
            if (!mergedMotifLabels.some((lbl) => lbl.toLowerCase() === cleanLabel.toLowerCase())) {
              mergedMotifLabels.push(cleanLabel);
            }
          }
        }
      }
      setKnownMotifsLower(motifsSet);
      setClubMotifs(mergedMotifLabels);

      const thMap = new Map<string, string>();
      for (const th of therapistsRes.data || []) {
        const label = `${th.prenom || ''} ${th.nom || ''}`.trim();
        if (th.id && label) thMap.set(th.id, label);
      }
      setTherapistMap(thMap);

      let resolvedClub: PartnerClub | null = null;

      if (isClubAccount) {
        setIsStaffPreview(false);
        setCanEditSessionCount(false);
        const clubMeta = parseClubProfileMeta(ownProfile);
        let boundName = clubMeta?.clubName || '';
        if (!boundName) {
          try {
            boundName = sessionStorage.getItem('reforme_portal_club_name') || '';
          } catch {}
        }

        if (boundName) {
          resolvedClub =
            loadedClubs.find((c) => c.name.toLowerCase() === boundName.toLowerCase()) || null;
        }

        if (!resolvedClub && sessionEmail) {
          resolvedClub =
            loadedClubs.find((c) => (c.authEmail || '').toLowerCase() === sessionEmail) || null;
        }

        if (!resolvedClub && boundName) {
          resolvedClub = {
            name: boundName,
            sport: 'Omnisports',
            tarifConvention: null,
            note: '',
            hasAccess: true,
          };
        }

        if (!resolvedClub) {
          setError("Aucun club conventionné n'est rattaché à cet identifiant.");
          setLoading(false);
          setRefreshing(false);
          return;
        }

        if (resolvedClub.hasAccess === false) {
          await handleSignOut(
            "L'accès au portail de ce club a été désactivé par l'administration du cabinet."
          );
          return;
        }
      } else {
        setIsStaffPreview(true);
        const resolvedStaffProf = await resolveOrBindCollaboratorSession(supabase, {
          id: session.user.id,
          email: sessionEmail,
        });
        setCanEditSessionCount(
          canManageSessionCounts(resolvedStaffProf?.role || ownProfile?.role, sessionEmail)
        );
        setAllPartnerClubs(loadedClubs);

        let targetName = overridePreviewClubName || '';
        if (!targetName) {
          try {
            targetName = localStorage.getItem('reforme_preview_club_name') || '';
          } catch {}
        }

        if (targetName) {
          resolvedClub =
            loadedClubs.find((c) => c.name.toLowerCase() === targetName.toLowerCase()) || null;
        }
        if (!resolvedClub && loadedClubs.length > 0) {
          resolvedClub = loadedClubs[0];
        }

        if (resolvedClub) {
          try {
            localStorage.setItem('reforme_preview_club_name', resolvedClub.name);
          } catch {}
        }
      }

      setActiveClub(resolvedClub);

      if (!resolvedClub) {
        setClubPatients([]);
        setClubAppointments([]);
        setClubTreatments([]);
        setClubBillings([]);
        setLoading(false);
        setRefreshing(false);
        return;
      }

      // Filter strictly to ONLY players affiliated with `resolvedClub.name`
      const targetKey = resolvedClub.name.trim().toLowerCase();
      const affiliatedPlayers = (allPatientsRaw || []).filter((p) => {
        const info = parsePatientMutuelle(p);
        return info.club.trim().toLowerCase() === targetKey;
      });

      setClubPatients(affiliatedPlayers);

      const playerIds = affiliatedPlayers.map((p) => p.id);
      if (playerIds.length === 0) {
        setClubAppointments([]);
        setClubTreatments([]);
        setClubBillings([]);
        setLoading(false);
        setRefreshing(false);
        return;
      }

      // Fetch all appointments, treatments, and billings strictly scoped to `playerIds`
      const [rawAppts, rawTreatments, rawBillings] = await Promise.all([
        fetchScopedRowsByPatients('appointments', '*', playerIds, 'date_heure'),
        fetchScopedRowsByPatients('treatments', '*', playerIds, 'created_at'),
        fetchScopedRowsByPatients(
          'billings',
          '*, appointments(id, date_heure, statut)',
          playerIds,
          'date_facturation'
        ),
      ]);

      const cleanedAppts = rawAppts.map((app: any) => {
        const { therapistId, cleanText } = cleanAppointmentNote(app.notes_seance);
        return {
          ...app,
          therapist_id: therapistId || app.therapist_id || null,
          notes_seance: cleanText,
        };
      });

      const sanitizedBills = sanitizeBillings(rawBillings, rawAppts);

      setClubAppointments(cleanedAppts);
      setClubTreatments(rawTreatments);
      setClubBillings(sanitizedBills);
    } catch (err: any) {
      console.error('Erreur chargement portail club:', err);
      setError(err.message || 'Impossible de charger les données du club.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  // Build structured medical, treatment, progression, evolution & financial summary per player
  const playerSummaries = useMemo<PlayerSummary[]>(() => {
    const moroccoNow = getMoroccoNow();
    const todayStart = new Date(
      moroccoNow.getFullYear(),
      moroccoNow.getMonth(),
      moroccoNow.getDate(),
      0,
      0,
      0
    );

    return clubPatients
      .map((pat) => {
        const mutInfo = parsePatientMutuelle(pat);
        const patAppts = clubAppointments
          .filter((a) => a.patient_id === pat.id)
          .sort(
            (a, b) =>
              parseClinicDate(b.date_heure).getTime() - parseClinicDate(a.date_heure).getTime()
          );

        const patTreatments = clubTreatments.filter((t) => t.patient_id === pat.id);
        const patBillings = clubBillings
          .filter((b) => b.patient_id === pat.id)
          .sort((a, b) => getBillDate(b).getTime() - getBillDate(a).getTime());

        // Performed sessions include BOTH 'Effectué' (paid) and 'Impayé' (performed & awaiting club settlement)
        const performedAppts = patAppts.filter((a) => isPerformedSessionStatus(a.statut));
        const paidSessionsCount = performedAppts.filter(
          (a) => String(a.statut || '').trim().toLowerCase() === 'effectué' ||
            String(a.statut || '').trim().toLowerCase() === 'effectue'
        ).length;
        const unpaidSessionsCount = performedAppts.length - paidSessionsCount;

        const cancelledAppts = patAppts.filter((a) => isCancelledSessionStatus(a.statut));

        const upcomingAppts = patAppts
          .filter((a) => {
            if (isPerformedSessionStatus(a.statut)) return false;
            if (isCancelledSessionStatus(a.statut)) return false;
            if (isPendingDemand(a)) return false;
            return parseClinicDate(a.date_heure).getTime() >= todayStart.getTime();
          })
          .sort(
            (a, b) =>
              parseClinicDate(a.date_heure).getTime() - parseClinicDate(b.date_heure).getTime()
          );

        // Prescribed sessions: active treatment prescription OR sum of treatments OR `patients.nombre_seances` / `forfait_seances`
        const activeTreatRows = patTreatments.filter(
          (t) => String(t.statut || '').toLowerCase() === 'en cours'
        );
        const prescribedFromTreatments =
          activeTreatRows.length > 0
            ? activeTreatRows.reduce(
                (sum, t) => sum + (Number(t.nombre_seances_prescrites) || 0),
                0
              )
            : patTreatments.reduce(
                (sum, t) => sum + (Number(t.nombre_seances_prescrites) || 0),
                0
              );

        const prescribedSessions =
          prescribedFromTreatments > 0
            ? prescribedFromTreatments
            : Number(pat.nombre_seances) || Number(pat.forfait_seances) || 0;

        const completedSessions = performedAppts.length;
        const remainingSessions =
          prescribedSessions > completedSessions ? prescribedSessions - completedSessions : 0;
        const extraSessions =
          prescribedSessions > 0 && completedSessions > prescribedSessions
            ? completedSessions - prescribedSessions
            : 0;

        const progressPercent =
          prescribedSessions > 0
            ? Math.min(100, Math.round((completedSessions / prescribedSessions) * 100))
            : completedSessions > 0
            ? 100
            : 0;

        // Build Treatment Breakdown from BOTH performed/scheduled appointments (`notes_seance`) AND `treatments` table
        const actCounter = new Map<string, { display: string; count: number }>();

        // Count from performed sessions first (real care delivered)
        const apptsForActs =
          performedAppts.length > 0
            ? performedAppts
            : patAppts.filter((a) => !isCancelledSessionStatus(a.statut) && !isPendingDemand(a));

        for (const app of apptsForActs) {
          const actLabel = extractSessionActLabel(app.notes_seance || '');
          if (!actLabel) continue;
          const key = actLabel.toLowerCase();
          const prev = actCounter.get(key);
          if (prev) {
            prev.count += 1;
          } else {
            actCounter.set(key, { display: actLabel, count: 1 });
          }
        }

        // Also ensure any explicit `treatments.motif` is represented
        for (const tr of patTreatments) {
          const trMotif = String(tr.motif || '').trim();
          if (!trMotif) continue;
          const key = trMotif.toLowerCase();
          if (!actCounter.has(key)) {
            actCounter.set(key, {
              display: trMotif,
              count: Number(tr.nombre_seances_prescrites) || 1,
            });
          }
        }

        const totalActCount = Array.from(actCounter.values()).reduce((s, x) => s + x.count, 0);
        const treatmentBreakdown: TreatmentBreakdownItem[] = Array.from(actCounter.values())
          .sort((a, b) => b.count - a.count || a.display.localeCompare(b.display, 'fr'))
          .map((item) => ({
            motif: item.display,
            count: item.count,
            percentage:
              totalActCount > 0 ? Math.round((item.count / totalActCount) * 100) : 0,
          }));

        const activeMotifs = treatmentBreakdown.map((t) => t.motif);

        // Latest detailed clinical observation (distinct from simple standard motif names)
        const apptWithObservation = patAppts.find((a) =>
          isDetailedClinicalObservation(a.notes_seance || '', knownMotifsLower)
        );
        const latestClinicalNote = apptWithObservation
          ? String(apptWithObservation.notes_seance).trim()
          : '';
        const latestNoteDate = apptWithObservation
          ? parseClinicDate(apptWithObservation.date_heure)
          : null;
        const latestNoteTherapist =
          apptWithObservation?.therapist_id && therapistMap.has(apptWithObservation.therapist_id)
            ? therapistMap.get(apptWithObservation.therapist_id)!
            : '';

        // Pain evolution logs (EVA 0-10)
        const rawPainLogs = parsePainLogsFromPatient([pat], pat.id) || [];
        const chronologicalPain = [...rawPainLogs].sort((a, b) =>
          String(a.date || '').localeCompare(String(b.date || ''))
        );
        const firstPain = chronologicalPain.length > 0 ? Number(chronologicalPain[0].score) : null;
        const latestPainObj =
          chronologicalPain.length > 0 ? chronologicalPain[chronologicalPain.length - 1] : null;
        const latestPain = latestPainObj ? Number(latestPainObj.score) : null;
        const painDelta =
          firstPain !== null && latestPain !== null && chronologicalPain.length >= 2
            ? latestPain - firstPain
            : null;

        // Financials
        const paidBills = patBillings.filter((b) => isPaidBillingStatus(b.statut));
        const unpaidBills = patBillings.filter((b) => isUnpaidBillingStatus(b.statut));
        const paidAmount = sumMoney(paidBills, (b) => b.montant);
        const unpaidAmount = sumMoney(unpaidBills, (b) => b.montant);
        const totalBilled = roundMoney(paidAmount + unpaidAmount);

        const lastSessionDate =
          performedAppts.length > 0 ? parseClinicDate(performedAppts[0].date_heure) : null;
        const firstSessionDate =
          performedAppts.length > 0
            ? parseClinicDate(performedAppts[performedAppts.length - 1].date_heure)
            : null;

        const hadRecentSession =
          lastSessionDate !== null &&
          moroccoNow.getTime() - lastSessionDate.getTime() <= 21 * 24 * 3600 * 1000;

        const isActiveCare =
          activeTreatRows.length > 0 ||
          upcomingAppts.length > 0 ||
          (prescribedSessions > 0 && completedSessions < prescribedSessions) ||
          hadRecentSession;

        return {
          id: pat.id,
          nom: pat.nom || '',
          prenom: pat.prenom || '',
          fullName: `${pat.nom || ''} ${pat.prenom || ''}`.trim() || 'Joueur sans nom',
          telephone: pat.telephone || '',
          dateNaissance: pat.date_naissance || null,
          pathologie: normalizePathologieLabel(pat.pathologie),
          cleanAtcd: normalizeAtcdLabel(mutInfo.cleanAtcd),
          organismeMutuelle: mutInfo.isMutualiste ? mutInfo.organisme || 'Mutuelle' : '',
          prescribedSessions,
          completedSessions,
          paidSessionsCount,
          unpaidSessionsCount,
          remainingSessions,
          extraSessions,
          upcomingSessions: upcomingAppts.length,
          cancelledSessions: cancelledAppts.length,
          progressPercent,
          treatments: patTreatments,
          treatmentBreakdown,
          activeTreatmentMotifs: activeMotifs,
          appointments: patAppts,
          firstSessionDate,
          lastSessionDate,
          nextSessionDate:
            upcomingAppts.length > 0 ? parseClinicDate(upcomingAppts[0].date_heure) : null,
          latestClinicalNote,
          latestNoteDate,
          latestNoteTherapist,
          painLogs: rawPainLogs,
          firstPainScore: firstPain,
          latestPainScore: latestPain,
          latestPainDate: latestPainObj?.date || null,
          painDelta,
          billings: patBillings,
          paidAmount,
          unpaidAmount,
          totalBilled,
          unpaidCount: unpaidBills.length,
          paidCount: paidBills.length,
          isActiveCare,
        };
      })
      .sort((a, b) => a.fullName.localeCompare(b.fullName, 'fr'));
  }, [
    clubPatients,
    clubAppointments,
    clubTreatments,
    clubBillings,
    therapistMap,
    knownMotifsLower,
  ]);

  const playerMap = useMemo(() => {
    const m = new Map<string, PlayerSummary>();
    for (const p of playerSummaries) m.set(p.id, p);
    return m;
  }, [playerSummaries]);

  const selectedPlayer = useMemo(
    () => (selectedPlayerId ? playerMap.get(selectedPlayerId) || null : null),
    [selectedPlayerId, playerMap]
  );

  // Executive KPIs
  const kpis = useMemo(() => {
    const playersCount = playerSummaries.length;
    const activePlayersCount = playerSummaries.filter((p) => p.isActiveCare).length;
    const completedSessions = playerSummaries.reduce((s, p) => s + p.completedSessions, 0);
    const prescribedSessions = playerSummaries.reduce((s, p) => s + p.prescribedSessions, 0);
    const upcomingSessions = playerSummaries.reduce((s, p) => s + p.upcomingSessions, 0);
    const totalPaid = sumMoney(playerSummaries, (p) => p.paidAmount);
    const totalUnpaid = sumMoney(playerSummaries, (p) => p.unpaidAmount);
    const totalBilled = roundMoney(totalPaid + totalUnpaid);
    const unpaidBillsCount = playerSummaries.reduce((s, p) => s + p.unpaidCount, 0);
    const paidBillsCount = playerSummaries.reduce((s, p) => s + p.paidCount, 0);

    return {
      playersCount,
      activePlayersCount,
      completedSessions,
      prescribedSessions,
      upcomingSessions,
      totalPaid,
      totalUnpaid,
      totalBilled,
      unpaidBillsCount,
      paidBillsCount,
    };
  }, [playerSummaries]);

  // Filtered Roster
  const filteredPlayers = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return playerSummaries.filter((p) => {
      if (rosterFilter === 'active' && !p.isActiveCare) return false;
      if (rosterFilter === 'unpaid' && p.unpaidAmount <= 0) return false;
      if (rosterFilter === 'completed' && p.isActiveCare) return false;

      if (!q) return true;
      const haystack = [
        p.fullName,
        p.pathologie,
        p.cleanAtcd,
        p.telephone,
        ...p.activeTreatmentMotifs,
      ]
        .join(' ')
        .toLowerCase();
      return haystack.includes(q);
    });
  }, [playerSummaries, searchQuery, rosterFilter]);

  // Filtered Billings for Accounting Tab
  const filteredBillingsList = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return clubBillings.filter((bill) => {
      if (billingStatusFilter === 'paid' && !isPaidBillingStatus(bill.statut)) return false;
      if (billingStatusFilter === 'unpaid' && !isUnpaidBillingStatus(bill.statut)) return false;
      if (billingPlayerFilter !== 'all' && bill.patient_id !== billingPlayerFilter) return false;

      if (!q) return true;
      const player = playerMap.get(bill.patient_id);
      const ref = getBillingDisplayReference(bill, docTemplates, customInvoiceRefs);
      const hay = `${player?.fullName || ''} ${ref} ${bill.type_paiement || ''}`.toLowerCase();
      return hay.includes(q);
    });
  }, [
    clubBillings,
    billingStatusFilter,
    billingPlayerFilter,
    searchQuery,
    playerMap,
    docTemplates,
    customInvoiceRefs,
  ]);

  const filteredBillingTotals = useMemo(() => {
    const paid = sumMoney(
      filteredBillingsList.filter((b) => isPaidBillingStatus(b.statut)),
      (b) => b.montant
    );
    const unpaid = sumMoney(
      filteredBillingsList.filter((b) => isUnpaidBillingStatus(b.statut)),
      (b) => b.montant
    );
    return {
      paid,
      unpaid,
      total: roundMoney(paid + unpaid),
    };
  }, [filteredBillingsList]);

  // Export Comprehensive Club Excel Statement (2 worksheets: Medical/Sessions + Detailed Accounting)
  const handleExportClubExcel = () => {
    if (!activeClub) return;

    const summaryRows: any[] = playerSummaries.map((p) => ({
      'Club Conventionné': activeClub.name,
      'Joueur / Athlète': p.fullName,
      Téléphone: p.telephone || '-',
      Pathologie: p.pathologie || 'Bilan en cours',
      'Traitements Réalisés':
        p.treatmentBreakdown.length > 0
          ? p.treatmentBreakdown.map((t) => `${t.motif} (${t.count})`).join(', ')
          : 'Kinésithérapie',
      'Séances Réalisées': p.completedSessions,
      'Séances Prescrites': p.prescribedSessions || '-',
      'Progression (%)': p.prescribedSessions > 0 ? `${p.progressPercent}%` : '-',
      'Dernier EVA (/10)': p.latestPainScore !== null ? `${p.latestPainScore}/10` : '-',
      'Statut Suivi': p.isActiveCare ? 'En soins actifs' : 'Suivi terminé',
      'Montant Réglé (DH)': p.paidAmount,
      'Reste à Régler (DH)': p.unpaidAmount,
      'Total Facturé (DH)': p.totalBilled,
    }));

    summaryRows.push({
      'Club Conventionné': 'TOTAL ÉQUIPE',
      'Joueur / Athlète': `${kpis.playersCount} joueur(s)`,
      Téléphone: '',
      Pathologie: '',
      'Traitements Réalisés': '',
      'Séances Réalisées': kpis.completedSessions,
      'Séances Prescrites': kpis.prescribedSessions || '-',
      'Progression (%)': '',
      'Dernier EVA (/10)': '',
      'Statut Suivi': '',
      'Montant Réglé (DH)': kpis.totalPaid,
      'Reste à Régler (DH)': kpis.totalUnpaid,
      'Total Facturé (DH)': kpis.totalBilled,
    });

    const billingRows: any[] = clubBillings.map((bill) => {
      const player = playerMap.get(bill.patient_id);
      const billDate = getBillDate(bill);
      const linkedAppt = Array.isArray(bill.appointments)
        ? bill.appointments[0]
        : bill.appointments;
      const seanceDateStr = linkedAppt?.date_heure
        ? parseClinicDate(linkedAppt.date_heure).toLocaleDateString('fr-FR')
        : billDate.toLocaleDateString('fr-FR');

      return {
        Référence: getBillingDisplayReference(bill, docTemplates, customInvoiceRefs),
        'Date Facturation': billDate.toLocaleDateString('fr-FR'),
        'Date Séance': seanceDateStr,
        'Joueur / Athlète': player?.fullName || '-',
        Pathologie: player?.pathologie || '-',
        'Mode de Paiement': bill.type_paiement || 'Patient',
        'Statut Règlement': isPaidBillingStatus(bill.statut) ? 'Payé' : 'En attente',
        'Montant (DH)': roundMoney(bill.montant),
      };
    });

    const wb = XLSX.utils.book_new();
    const wsSummary = XLSX.utils.json_to_sheet(summaryRows);
    XLSX.utils.book_append_sheet(wb, wsSummary, 'Synthese_Joueurs');

    if (billingRows.length > 0) {
      const wsBills = XLSX.utils.json_to_sheet(billingRows);
      XLSX.utils.book_append_sheet(wb, wsBills, 'Detail_Reglements');
    }

    const safeClub = activeClub.name.replace(/[^a-zA-Z0-9_-]/g, '_');
    const dateStamp = new Date().toLocaleDateString('fr-FR').replace(/\//g, '-');
    XLSX.writeFile(wb, `Suivi_Club_${safeClub}_${dateStamp}.xlsx`);
  };

  const handleUpdatePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setPasswordNotice(null);
    const trimmed = newPassword.trim();
    if (trimmed.length < 6) {
      setPasswordNotice({
        type: 'error',
        text: 'Le nouveau mot de passe doit contenir au moins 6 caractères.',
      });
      return;
    }
    if (trimmed !== confirmPassword.trim()) {
      setPasswordNotice({
        type: 'error',
        text: 'Les deux mots de passe ne correspondent pas.',
      });
      return;
    }

    setPasswordSaving(true);
    try {
      const { error: updErr } = await supabase.auth.updateUser({ password: trimmed });
      if (updErr) throw updErr;
      setPasswordNotice({
        type: 'success',
        text: 'Votre mot de passe a été mis à jour avec succès.',
      });
      setNewPassword('');
      setConfirmPassword('');
      setTimeout(() => {
        setIsPasswordModalOpen(false);
        setPasswordNotice(null);
      }, 1500);
    } catch (err: any) {
      setPasswordNotice({
        type: 'error',
        text: err.message || 'Impossible de modifier le mot de passe.',
      });
    } finally {
      setPasswordSaving(false);
    }
  };

  const openStaffEditSessions = (player: PlayerSummary, e?: React.MouseEvent) => {
    if (!isStaffPreview || !canEditSessionCount) return;
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    setPlayerForSessionsEdit(player);
    setSessionsEditValue(String(player.prescribedSessions || player.completedSessions || 10));
    setSessionsEditError('');
  };

  const handleSaveStaffSessions = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isStaffPreview || !canEditSessionCount || !playerForSessionsEdit) return;

    const parsed = Math.max(0, parseInt(sessionsEditValue, 10) || 0);
    setSessionsEditSaving(true);
    setSessionsEditError('');

    try {
      const { error: patErr } = await supabase
        .from('patients')
        .update({ nombre_seances: parsed })
        .eq('id', playerForSessionsEdit.id);

      if (patErr) throw patErr;

      const patTrs = clubTreatments.filter((t) => t.patient_id === playerForSessionsEdit.id);
      const activeTr =
        patTrs.find((t) => String(t.statut || '').toLowerCase() === 'en cours') ||
        (patTrs.length === 1 ? patTrs[0] : null);

      if (activeTr?.id) {
        const { error: trErr } = await supabase
          .from('treatments')
          .update({ nombre_seances_prescrites: parsed })
          .eq('id', activeTr.id);
        if (!trErr) {
          setClubTreatments((prev) =>
            prev.map((t) =>
              t.id === activeTr.id ? { ...t, nombre_seances_prescrites: parsed } : t
            )
          );
        }
      }

      setClubPatients((prev) =>
        prev.map((p) =>
          p.id === playerForSessionsEdit.id ? { ...p, nombre_seances: parsed } : p
        )
      );
      setPlayerForSessionsEdit(null);
    } catch (err: any) {
      setSessionsEditError(
        err.message || 'Impossible de modifier le nombre de séances prescrites.'
      );
    } finally {
      setSessionsEditSaving(false);
    }
  };

  const openStaffEditApptMotif = (appt: any, e?: React.MouseEvent) => {
    if (!isStaffPreview || !appt) return;
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    setApptForMotifEdit(appt);
    setMotifEditValue(String(appt.notes_seance || 'Séance de Suivi').trim());
    setShowClubMotifDropdown(false);
    setApplyMotifToSameOldMotif(false);
    setMotifEditError('');
  };

  const handleSaveStaffApptMotif = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isStaffPreview || !apptForMotifEdit) return;

    const trimmed = motifEditValue.trim() || 'Séance de Suivi';
    setMotifEditSaving(true);
    setMotifEditError('');

    try {
      // Ensure custom motif exists in seance_motifs so future sessions and ClubPortal recognize it
      if (!clubMotifs.some((m) => m.toLowerCase() === trimmed.toLowerCase())) {
        await supabase.from('seance_motifs').insert([{ nom: trimmed }]);
        setClubMotifs((prev) => [...prev, trimmed]);
      }
      setKnownMotifsLower((prev) => {
        const next = new Set(prev);
        next.add(trimmed.toLowerCase());
        return next;
      });

      const oldMotifClean = String(apptForMotifEdit.notes_seance || '').trim();
      const targetAppts =
        applyMotifToSameOldMotif && selectedPlayer
          ? selectedPlayer.appointments.filter(
              (a) => String(a.notes_seance || '').trim() === oldMotifClean
            )
          : [apptForMotifEdit];

      const effectiveTargets = targetAppts.length > 0 ? targetAppts : [apptForMotifEdit];

      for (const target of effectiveTargets) {
        const dbNotes = target.therapist_id
          ? `||TH_ID:${target.therapist_id}||${trimmed}`
          : trimmed;

        const { error: updErr } = await supabase
          .from('appointments')
          .update({
            notes_seance: dbNotes,
            therapist_id: null,
          })
          .eq('id', target.id);

        if (updErr) throw updErr;
      }

      const updatedIds = new Set(effectiveTargets.map((t) => t.id));
      setClubAppointments((prev) =>
        prev.map((a) => (updatedIds.has(a.id) ? { ...a, notes_seance: trimmed } : a))
      );

      setApptForMotifEdit(null);
    } catch (err: any) {
      setMotifEditError(err.message || 'Impossible de modifier le motif de la séance.');
    } finally {
      setMotifEditSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-6">
        <Activity className="h-10 w-10 text-indigo-600 animate-pulse mb-3" />
        <p className="text-sm font-medium text-slate-600">
          Chargement de l'espace administration club...
        </p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 font-sans">
      {/* Staff Preview Banner */}
      {isStaffPreview && (
        <div className="bg-slate-900 text-white border-b border-slate-800">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-2.5 flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={() => {
                  window.location.hash = returnRoute || 'finance';
                }}
                className="inline-flex items-center gap-1.5 text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-100 px-3 py-1.5 rounded-lg transition-colors cursor-pointer"
              >
                <ArrowLeft className="h-3.5 w-3.5" />
                Retour au cabinet
              </button>
              <span className="text-xs font-medium text-slate-300">
                Mode Administration Cabinet — Portail Club
              </span>
            </div>

            {allPartnerClubs.length > 0 && (
              <div className="flex items-center gap-2">
                <label className="text-xs text-slate-400 font-medium">Club affiché :</label>
                <select
                  value={activeClub?.name || ''}
                  onChange={(e) => {
                    const nextName = e.target.value;
                    if (nextName) {
                      loadClubPortalData(false, nextName);
                    }
                  }}
                  className="bg-slate-800 border border-slate-700 text-white text-xs font-semibold rounded-lg px-3 py-1.5 outline-none focus:border-indigo-400"
                >
                  {allPartnerClubs.map((c) => (
                    <option key={c.name} value={c.name}>
                      {c.name} ({c.sport})
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Main Header */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-3.5 min-w-0">
            <div className="h-12 w-12 rounded-xl bg-indigo-50 border border-indigo-100 text-indigo-700 flex items-center justify-center shrink-0">
              <Trophy className="h-6 w-6" />
            </div>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-[11px] font-bold uppercase tracking-wider text-indigo-600">
                  Re Forme Center • Portail Équipe Conventionnée
                </span>
                {activeClub?.sport && (
                  <span className="text-[11px] font-semibold bg-slate-100 text-slate-700 px-2 py-0.5 rounded-md">
                    {activeClub.sport}
                  </span>
                )}
                {activeClub?.tarifConvention && (
                  <span className="text-[11px] font-semibold bg-indigo-50 text-indigo-700 border border-indigo-200 px-2 py-0.5 rounded-md tabular-nums">
                    Tarif conventionné : {formatMoney(activeClub.tarifConvention)} DH / séance
                  </span>
                )}
              </div>
              <h1 className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight truncate mt-0.5">
                {activeClub?.name || 'Espace Administration Club'}
              </h1>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={refreshing}
              onClick={() => loadClubPortalData(true)}
              className="gap-1.5 text-xs border-slate-200 text-slate-700"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? 'animate-spin' : ''}`} />
              Actualiser
            </Button>

            {activeClub && playerSummaries.length > 0 && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleExportClubExcel}
                className="gap-1.5 text-xs border-emerald-200 text-emerald-700 hover:bg-emerald-50"
              >
                <FileSpreadsheet className="h-3.5 w-3.5" />
                Exporter Relevé Excel
              </Button>
            )}

            {!isStaffPreview && (
              <>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setPasswordNotice(null);
                    setIsPasswordModalOpen(true);
                  }}
                  className="gap-1.5 text-xs border-slate-200 text-slate-700"
                >
                  <Key className="h-3.5 w-3.5" />
                  Mot de passe
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => handleSignOut()}
                  className="gap-1.5 text-xs border-rose-200 text-rose-600 hover:bg-rose-50"
                >
                  <LogOut className="h-3.5 w-3.5" />
                  Déconnexion
                </Button>
              </>
            )}
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
        {error && (
          <div className="p-4 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-sm flex items-start gap-3">
            <AlertCircle className="h-5 w-5 shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold">Impossible d'afficher le dossier club</p>
              <p className="text-xs mt-0.5">{error}</p>
            </div>
          </div>
        )}

        {!activeClub ? (
          <Card className="border border-slate-200 shadow-sm rounded-xl">
            <CardContent className="p-10 text-center space-y-2">
              <Trophy className="h-10 w-10 text-slate-300 mx-auto" />
              <p className="text-base font-bold text-slate-800">
                Aucun club sportif conventionné enregistré
              </p>
              <p className="text-sm text-slate-500 max-w-md mx-auto">
                Ajoutez d'abord un club sportif conventionné depuis l'onglet Finance ou Patients.
              </p>
            </CardContent>
          </Card>
        ) : (
          <>
            {/* Executive KPI Row */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <Card className="border border-slate-200 shadow-sm rounded-xl bg-white">
                <CardContent className="p-5">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                      Joueurs affiliés
                    </span>
                    <div className="h-8 w-8 rounded-lg bg-slate-100 text-slate-700 flex items-center justify-center">
                      <Users className="h-4 w-4" />
                    </div>
                  </div>
                  <p className="text-2xl font-bold text-slate-900 mt-2 tabular-nums">
                    {kpis.playersCount}
                  </p>
                  <p className="text-xs text-slate-500 mt-1 tabular-nums">
                    Dont <strong className="text-slate-700">{kpis.activePlayersCount}</strong> en
                    suivi actif
                  </p>
                </CardContent>
              </Card>

              <Card className="border border-slate-200 shadow-sm rounded-xl bg-white">
                <CardContent className="p-5">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                      Séances réalisées
                    </span>
                    <div className="h-8 w-8 rounded-lg bg-indigo-50 text-indigo-700 flex items-center justify-center">
                      <Activity className="h-4 w-4" />
                    </div>
                  </div>
                  <p className="text-2xl font-bold text-slate-900 mt-2 tabular-nums">
                    {kpis.completedSessions}
                  </p>
                  <p className="text-xs text-slate-500 mt-1 tabular-nums">
                    {kpis.prescribedSessions > 0
                      ? `${kpis.prescribedSessions} prescrites initialement • `
                      : ''}
                    <strong className="text-indigo-700">{kpis.upcomingSessions}</strong> à venir
                  </p>
                </CardContent>
              </Card>

              <Card className="border border-slate-200 shadow-sm rounded-xl bg-white">
                <CardContent className="p-5">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                      Total réglé
                    </span>
                    <div className="h-8 w-8 rounded-lg bg-emerald-50 text-emerald-700 flex items-center justify-center">
                      <CheckCircle2 className="h-4 w-4" />
                    </div>
                  </div>
                  <p className="text-2xl font-bold text-emerald-700 mt-2 tabular-nums">
                    {formatMoney(kpis.totalPaid)} DH
                  </p>
                  <p className="text-xs text-slate-500 mt-1 tabular-nums">
                    {kpis.paidBillsCount} règlement(s) encaissé(s)
                  </p>
                </CardContent>
              </Card>

              <Card className="border border-slate-200 shadow-sm rounded-xl bg-white">
                <CardContent className="p-5">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                      Reste à régler
                    </span>
                    <div
                      className={`h-8 w-8 rounded-lg flex items-center justify-center ${
                        kpis.totalUnpaid > 0
                          ? 'bg-rose-50 text-rose-600'
                          : 'bg-slate-100 text-slate-500'
                      }`}
                    >
                      <Wallet className="h-4 w-4" />
                    </div>
                  </div>
                  <p
                    className={`text-2xl font-bold mt-2 tabular-nums ${
                      kpis.totalUnpaid > 0 ? 'text-rose-600' : 'text-slate-800'
                    }`}
                  >
                    {formatMoney(kpis.totalUnpaid)} DH
                  </p>
                  <p className="text-xs text-slate-500 mt-1 tabular-nums">
                    {kpis.unpaidBillsCount > 0
                      ? `${kpis.unpaidBillsCount} séance(s) en attente de règlement`
                      : 'Aucun impayé en cours'}
                  </p>
                </CardContent>
              </Card>
            </div>

            {/* Segmented Navigation + Search Bar */}
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-3 flex flex-col lg:flex-row lg:items-center justify-between gap-3">
              <div className="inline-flex flex-wrap rounded-lg bg-slate-100 p-1 gap-1">
                <button
                  type="button"
                  onClick={() => setActiveTab('effectif')}
                  className={`px-3.5 py-2 rounded-md text-xs font-bold transition-colors cursor-pointer ${
                    activeTab === 'effectif'
                      ? 'bg-white text-slate-900 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Joueurs, Pathologies & Traitements ({playerSummaries.length})
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab('evolution')}
                  className={`px-3.5 py-2 rounded-md text-xs font-bold transition-colors cursor-pointer ${
                    activeTab === 'evolution'
                      ? 'bg-white text-slate-900 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Évolution Clinique & Progression
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab('reglements')}
                  className={`px-3.5 py-2 rounded-md text-xs font-bold transition-colors cursor-pointer flex items-center gap-1.5 ${
                    activeTab === 'reglements'
                      ? 'bg-white text-slate-900 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <span>État des Règlements</span>
                  {kpis.unpaidBillsCount > 0 && (
                    <span className="px-1.5 py-0.5 text-[10px] font-bold rounded bg-rose-100 text-rose-700 tabular-nums">
                      {kpis.unpaidBillsCount}
                    </span>
                  )}
                </button>
              </div>

              <div className="relative w-full lg:w-72">
                <Search className="h-4 w-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Rechercher joueur, pathologie, soin..."
                  className="w-full pl-9 pr-3 py-2 text-xs rounded-lg border border-slate-200 bg-slate-50 focus:bg-white focus:border-indigo-500 outline-none"
                />
              </div>
            </div>

            {/* TAB 1: EFFECTIF, PATHOLOGIES & TRAITEMENTS */}
            {activeTab === 'effectif' && (
              <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                <div className="px-5 py-3.5 border-b border-slate-100 flex flex-wrap items-center justify-between gap-3 bg-slate-50/60">
                  <div className="flex flex-wrap items-center gap-1.5">
                    {(
                      [
                        { id: 'all', label: `Tous (${playerSummaries.length})` },
                        { id: 'active', label: `En soins (${kpis.activePlayersCount})` },
                        {
                          id: 'unpaid',
                          label: `Règlement en attente (${
                            playerSummaries.filter((p) => p.unpaidAmount > 0).length
                          })`,
                        },
                        {
                          id: 'completed',
                          label: `Suivi terminé (${
                            playerSummaries.length - kpis.activePlayersCount
                          })`,
                        },
                      ] as const
                    ).map((f) => (
                      <button
                        key={f.id}
                        type="button"
                        onClick={() => setRosterFilter(f.id)}
                        className={`px-2.5 py-1 rounded-md text-xs font-semibold transition-colors cursor-pointer ${
                          rosterFilter === f.id
                            ? 'bg-slate-900 text-white'
                            : 'bg-white border border-slate-200 text-slate-600 hover:text-slate-900'
                        }`}
                      >
                        {f.label}
                      </button>
                    ))}
                  </div>
                  <p className="text-xs text-slate-500">
                    Cliquez sur un joueur pour consulter le détail de ses traitements, séances, courbe EVA et règlements.
                  </p>
                </div>

                {filteredPlayers.length === 0 ? (
                  <div className="p-10 text-center text-sm text-slate-500">
                    {playerSummaries.length === 0
                      ? `Aucun joueur n'est actuellement rattaché au club « ${activeClub.name} ».`
                      : 'Aucun joueur ne correspond à votre filtre.'}
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm">
                      <thead className="bg-slate-50 text-xs font-semibold uppercase text-slate-500 border-b border-slate-200">
                        <tr>
                          <th className="px-5 py-3.5">Joueur</th>
                          <th className="px-5 py-3.5">Pathologie & Bilan</th>
                          <th className="px-5 py-3.5 min-w-[260px]">Traitements & Progression</th>
                          <th className="px-5 py-3.5">Évolution (EVA & Séances)</th>
                          <th className="px-5 py-3.5 text-right">État des Règlements</th>
                          <th className="px-5 py-3.5 text-right">Détail</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {filteredPlayers.map((player) => {
                          const age = computeAge(player.dateNaissance);
                          const isGoalReached =
                            player.prescribedSessions > 0 &&
                            player.completedSessions >= player.prescribedSessions;

                          return (
                            <tr
                              key={player.id}
                              onClick={() => {
                                setSelectedPlayerId(player.id);
                                setPlayerModalTab('synthese');
                              }}
                              className="hover:bg-slate-50/90 transition-colors cursor-pointer align-top"
                            >
                              {/* Joueur */}
                              <td className="px-5 py-4">
                                <div className="font-bold text-slate-900">{player.fullName}</div>
                                <div className="text-xs text-slate-500 mt-0.5 flex flex-wrap items-center gap-2">
                                  {player.telephone && <span>{player.telephone}</span>}
                                  {age !== null && <span>• {age} ans</span>}
                                </div>
                                <div className="mt-1.5">
                                  {player.isActiveCare ? (
                                    <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold bg-indigo-50 text-indigo-700 border border-indigo-200">
                                      En soins actifs
                                    </span>
                                  ) : (
                                    <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold bg-slate-100 text-slate-600">
                                      Suivi terminé
                                    </span>
                                  )}
                                </div>
                              </td>

                              {/* Pathologie */}
                              <td className="px-5 py-4 max-w-xs">
                                <div className="font-semibold text-slate-800">
                                  {player.pathologie || (
                                    <span className="text-slate-400 font-normal italic">
                                      Bilan en cours / Non précisée
                                    </span>
                                  )}
                                </div>
                                {player.cleanAtcd && (
                                  <p className="text-xs text-slate-500 mt-1 line-clamp-2">
                                    {player.cleanAtcd}
                                  </p>
                                )}
                              </td>

                              {/* Traitements & Progression */}
                              <td className="px-5 py-4 max-w-sm">
                                {player.treatmentBreakdown.length > 0 ? (
                                  <div className="flex flex-wrap gap-1 mb-2.5">
                                    {player.treatmentBreakdown.slice(0, 4).map((tb) => (
                                      <span
                                        key={tb.motif}
                                        className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-indigo-50/70 border border-indigo-100 text-slate-800 text-xs font-medium tabular-nums"
                                      >
                                        <span>{tb.motif}</span>
                                        <strong className="text-indigo-700">×{tb.count}</strong>
                                      </span>
                                    ))}
                                    {player.treatmentBreakdown.length > 4 && (
                                      <span className="px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 text-[11px] font-semibold">
                                        +{player.treatmentBreakdown.length - 4}
                                      </span>
                                    )}
                                  </div>
                                ) : (
                                  <p className="text-xs text-slate-400 italic mb-2">
                                    Aucun acte enregistré pour le moment
                                  </p>
                                )}

                                {/* Progression Bar & Session Counters */}
                                <div className="space-y-1.5">
                                  <div className="flex items-center justify-between gap-2 text-xs tabular-nums">
                                    <div className="flex items-center gap-1.5">
                                      <span className="font-bold text-slate-800">
                                        {player.prescribedSessions > 0
                                          ? `${player.completedSessions} / ${player.prescribedSessions} séances`
                                          : `${player.completedSessions} séance(s) réalisée(s)`}
                                      </span>
                                      {isStaffPreview && canEditSessionCount && (
                                        <button
                                          type="button"
                                          onClick={(e) => openStaffEditSessions(player, e)}
                                          title="Modifier le nombre de séances prescrites"
                                          className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-slate-100 hover:bg-indigo-100 text-slate-600 hover:text-indigo-700 text-[10px] font-semibold transition-colors cursor-pointer"
                                        >
                                          <Edit2 className="h-2.5 w-2.5" />
                                          <span>Modifier</span>
                                        </button>
                                      )}
                                    </div>
                                    {player.prescribedSessions > 0 && (
                                      <span
                                        className={`font-bold ${
                                          isGoalReached ? 'text-emerald-700' : 'text-indigo-700'
                                        }`}
                                      >
                                        {player.progressPercent}%
                                      </span>
                                    )}
                                  </div>

                                  <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
                                    <div
                                      className={`h-full rounded-full transition-all ${
                                        isGoalReached
                                          ? 'bg-emerald-500'
                                          : player.completedSessions > 0
                                          ? 'bg-indigo-600'
                                          : 'bg-slate-300'
                                      }`}
                                      style={{
                                        width: `${
                                          player.prescribedSessions > 0
                                            ? player.progressPercent
                                            : player.completedSessions > 0
                                            ? 100
                                            : 0
                                        }%`,
                                      }}
                                    />
                                  </div>

                                  <div className="flex items-center justify-between text-[11px] text-slate-500 tabular-nums">
                                    {player.remainingSessions > 0 ? (
                                      <span>Reste {player.remainingSessions} séance(s)</span>
                                    ) : player.extraSessions > 0 ? (
                                      <span className="text-emerald-700 font-medium">
                                        Protocole initial complet (+{player.extraSessions} de suivi)
                                      </span>
                                    ) : player.prescribedSessions > 0 &&
                                      player.completedSessions === player.prescribedSessions ? (
                                      <span className="text-emerald-700 font-medium">
                                        Protocole prescrit complété
                                      </span>
                                    ) : (
                                      <span>Suivi libre</span>
                                    )}
                                    {player.cancelledSessions > 0 && (
                                      <span className="text-slate-400">
                                        {player.cancelledSessions} annulée(s)
                                      </span>
                                    )}
                                  </div>
                                </div>
                              </td>

                              {/* Évolution */}
                              <td className="px-5 py-4">
                                {player.latestPainScore !== null ? (
                                  <div className="flex items-center gap-2">
                                    <span
                                      className={`inline-flex items-center px-2 py-0.5 rounded border text-xs font-bold tabular-nums ${getPainBadgeClasses(
                                        player.latestPainScore
                                      )}`}
                                    >
                                      EVA {player.latestPainScore}/10
                                    </span>
                                    {player.painDelta !== null && (
                                      <span
                                        className={`inline-flex items-center gap-0.5 text-xs font-semibold tabular-nums ${
                                          player.painDelta < 0
                                            ? 'text-emerald-600'
                                            : player.painDelta > 0
                                            ? 'text-rose-600'
                                            : 'text-slate-500'
                                        }`}
                                      >
                                        {player.painDelta < 0 ? (
                                          <TrendingDown className="h-3.5 w-3.5" />
                                        ) : player.painDelta > 0 ? (
                                          <TrendingUp className="h-3.5 w-3.5" />
                                        ) : (
                                          <Minus className="h-3.5 w-3.5" />
                                        )}
                                        {player.painDelta > 0
                                          ? `+${player.painDelta}`
                                          : player.painDelta}
                                      </span>
                                    )}
                                  </div>
                                ) : (
                                  <span className="text-xs text-slate-500 font-medium">
                                    Suivi séances en cabinet
                                  </span>
                                )}

                                <div className="text-xs text-slate-500 mt-1.5 space-y-0.5 tabular-nums">
                                  {player.nextSessionDate ? (
                                    <div className="text-indigo-700 font-semibold">
                                      Prochain RDV :{' '}
                                      {player.nextSessionDate.toLocaleDateString('fr-FR')}
                                    </div>
                                  ) : player.lastSessionDate ? (
                                    <div>
                                      Dernière séance :{' '}
                                      {player.lastSessionDate.toLocaleDateString('fr-FR')}
                                    </div>
                                  ) : (
                                    <div>Aucune séance réalisée</div>
                                  )}
                                </div>
                              </td>

                              {/* État des Règlements */}
                              <td className="px-5 py-4 text-right tabular-nums">
                                <div className="text-xs font-semibold text-emerald-700">
                                  Réglé : {formatMoney(player.paidAmount)} DH
                                </div>
                                {player.unpaidAmount > 0 ? (
                                  <div className="mt-1 inline-flex items-center px-2 py-0.5 rounded bg-rose-50 border border-rose-200 text-xs font-bold text-rose-700">
                                    En attente : {formatMoney(player.unpaidAmount)} DH
                                  </div>
                                ) : (
                                  <div className="text-[11px] text-slate-400 mt-0.5">
                                    Solde à jour
                                  </div>
                                )}
                              </td>

                              {/* Action */}
                              <td className="px-5 py-4 text-right">
                                <span className="inline-flex items-center gap-1 text-xs font-bold text-indigo-600 hover:text-indigo-800">
                                  Fiche suivi
                                  <ChevronRight className="h-4 w-4" />
                                </span>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}

            {/* TAB 2: ÉVOLUTION CLINIQUE & PROGRESSION */}
            {activeTab === 'evolution' && (
              <div className="space-y-4">
                {filteredPlayers.length === 0 ? (
                  <div className="bg-white rounded-xl border border-slate-200 p-10 text-center text-sm text-slate-500">
                    Aucun joueur à afficher pour le suivi d'évolution.
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {filteredPlayers.map((player) => {
                      const isGoalReached =
                        player.prescribedSessions > 0 &&
                        player.completedSessions >= player.prescribedSessions;

                      return (
                        <Card
                          key={player.id}
                          className="border border-slate-200 shadow-sm rounded-xl bg-white hover:border-slate-300 transition-colors"
                        >
                          <CardContent className="p-5 space-y-4">
                            <div className="flex items-start justify-between gap-3">
                              <div>
                                <h3 className="font-bold text-base text-slate-900">
                                  {player.fullName}
                                </h3>
                                <p className="text-xs font-medium text-slate-600 mt-0.5">
                                  {player.pathologie || 'Bilan en cours / Pathologie non précisée'}
                                </p>
                              </div>
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                onClick={() => {
                                  setSelectedPlayerId(player.id);
                                  setPlayerModalTab('evolution');
                                }}
                                className="text-xs h-8 gap-1 border-slate-200 shrink-0"
                              >
                                Détails & Séances
                                <ChevronRight className="h-3.5 w-3.5" />
                              </Button>
                            </div>

                            {/* Progression Bar Card */}
                            <div className="p-3 rounded-lg bg-slate-50 border border-slate-100 space-y-2 tabular-nums">
                              <div className="flex items-center justify-between gap-2 text-xs">
                                <span className="font-semibold text-slate-700">
                                  Progression du protocole
                                </span>
                                <div className="flex items-center gap-1.5">
                                  <span className="font-bold text-slate-900">
                                    {player.completedSessions}
                                    {player.prescribedSessions > 0
                                      ? ` / ${player.prescribedSessions} séances (${player.progressPercent}%)`
                                      : ' séance(s) réalisée(s)'}
                                  </span>
                                  {isStaffPreview && canEditSessionCount && (
                                    <button
                                      type="button"
                                      onClick={(e) => openStaffEditSessions(player, e)}
                                      title="Modifier le nombre de séances prescrites"
                                      className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-white border border-slate-200 hover:border-indigo-300 text-slate-600 hover:text-indigo-700 text-[10px] font-semibold transition-colors cursor-pointer"
                                    >
                                      <Edit2 className="h-2.5 w-2.5" />
                                    </button>
                                  )}
                                </div>
                              </div>
                              <div className="w-full h-2 bg-slate-200/80 rounded-full overflow-hidden">
                                <div
                                  className={`h-full rounded-full ${
                                    isGoalReached ? 'bg-emerald-500' : 'bg-indigo-600'
                                  }`}
                                  style={{
                                    width: `${
                                      player.prescribedSessions > 0
                                        ? player.progressPercent
                                        : player.completedSessions > 0
                                        ? 100
                                        : 0
                                    }%`,
                                  }}
                                />
                              </div>
                              <div className="flex items-center justify-between text-[11px] text-slate-500">
                                <span>
                                  {player.remainingSessions > 0
                                    ? `${player.remainingSessions} séance(s) restante(s)`
                                    : player.extraSessions > 0
                                    ? `Protocole atteint (+${player.extraSessions} séances de suivi)`
                                    : 'Protocole complété'}
                                </span>
                                {player.latestPainScore !== null && (
                                  <span className="font-bold text-slate-800">
                                    EVA :{' '}
                                    {player.firstPainScore !== null &&
                                    player.firstPainScore !== player.latestPainScore
                                      ? `${player.firstPainScore}/10 → ${player.latestPainScore}/10`
                                      : `${player.latestPainScore}/10`}
                                  </span>
                                )}
                              </div>
                            </div>

                            {/* Breakdown of Treatments Performed */}
                            {player.treatmentBreakdown.length > 0 && (
                              <div className="space-y-1.5">
                                <span className="text-[11px] font-bold uppercase tracking-wide text-slate-500 block">
                                  Traitements & soins réalisés
                                </span>
                                <div className="flex flex-wrap gap-1.5">
                                  {player.treatmentBreakdown.map((tb) => (
                                    <span
                                      key={tb.motif}
                                      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-white border border-slate-200 text-xs font-medium text-slate-800 tabular-nums"
                                    >
                                      <span>{tb.motif}</span>
                                      <span className="px-1.5 py-0.2 rounded bg-indigo-50 text-indigo-700 font-bold text-[11px]">
                                        {tb.count} séance{tb.count > 1 ? 's' : ''}
                                      </span>
                                    </span>
                                  ))}
                                </div>
                              </div>
                            )}

                            {/* Clinical observation if present */}
                            {player.latestClinicalNote && (
                              <div className="p-3 rounded-lg bg-indigo-50/50 border border-indigo-100 space-y-1">
                                <div className="flex items-center justify-between text-[11px] text-indigo-800 font-semibold">
                                  <span>Observation clinique</span>
                                  {player.latestNoteDate && (
                                    <span>
                                      {player.latestNoteDate.toLocaleDateString('fr-FR')}
                                      {player.latestNoteTherapist
                                        ? ` • ${player.latestNoteTherapist}`
                                        : ''}
                                    </span>
                                  )}
                                </div>
                                <p className="text-xs text-slate-700 leading-relaxed line-clamp-3">
                                  {player.latestClinicalNote}
                                </p>
                              </div>
                            )}

                            <div className="flex items-center justify-between text-xs text-slate-500 pt-2 border-t border-slate-100 tabular-nums">
                              <span>
                                {player.firstSessionDate && player.lastSessionDate
                                  ? `Du ${player.firstSessionDate.toLocaleDateString(
                                      'fr-FR'
                                    )} au ${player.lastSessionDate.toLocaleDateString('fr-FR')}`
                                  : player.lastSessionDate
                                  ? `Dernière séance : ${player.lastSessionDate.toLocaleDateString(
                                      'fr-FR'
                                    )}`
                                  : 'Pas de séance réalisée'}
                              </span>
                              {player.nextSessionDate && (
                                <span className="font-semibold text-indigo-700">
                                  Prochain RDV :{' '}
                                  {player.nextSessionDate.toLocaleDateString('fr-FR')}
                                </span>
                              )}
                            </div>
                          </CardContent>
                        </Card>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {/* TAB 3: ÉTAT DES RÈGLEMENTS */}
            {activeTab === 'reglements' && (
              <div className="space-y-4">
                <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                  <div className="px-5 py-4 border-b border-slate-100 bg-slate-50/60 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="flex flex-wrap items-center gap-1.5">
                      {(
                        [
                          { id: 'all', label: `Tous (${clubBillings.length})` },
                          {
                            id: 'unpaid',
                            label: `En attente (${kpis.unpaidBillsCount})`,
                          },
                          {
                            id: 'paid',
                            label: `Payés (${kpis.paidBillsCount})`,
                          },
                        ] as const
                      ).map((st) => (
                        <button
                          key={st.id}
                          type="button"
                          onClick={() => setBillingStatusFilter(st.id)}
                          className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-colors cursor-pointer ${
                            billingStatusFilter === st.id
                              ? 'bg-slate-900 text-white'
                              : 'bg-white border border-slate-200 text-slate-600 hover:text-slate-900'
                          }`}
                        >
                          {st.label}
                        </button>
                      ))}
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      <select
                        value={billingPlayerFilter}
                        onChange={(e) => setBillingPlayerFilter(e.target.value)}
                        className="px-3 py-1.5 rounded-lg border border-slate-200 bg-white text-xs font-semibold text-slate-700 outline-none"
                      >
                        <option value="all">Tous les joueurs ({playerSummaries.length})</option>
                        {playerSummaries.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.fullName}
                          </option>
                        ))}
                      </select>

                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={handleExportClubExcel}
                        className="text-xs gap-1.5 border-emerald-200 text-emerald-700 hover:bg-emerald-50"
                      >
                        <FileSpreadsheet className="h-3.5 w-3.5" />
                        Télécharger Excel
                      </Button>
                    </div>
                  </div>

                  {filteredBillingsList.length === 0 ? (
                    <div className="p-10 text-center text-sm text-slate-500">
                      Aucune ligne de facturation trouvée pour ce filtre.
                    </div>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-left text-sm">
                        <thead className="bg-slate-50 text-xs font-semibold uppercase text-slate-500 border-b border-slate-200">
                          <tr>
                            <th className="px-5 py-3.5">Référence</th>
                            <th className="px-5 py-3.5">Date</th>
                            <th className="px-5 py-3.5">Joueur</th>
                            <th className="px-5 py-3.5">Pathologie</th>
                            <th className="px-5 py-3.5">Mode</th>
                            <th className="px-5 py-3.5">Statut</th>
                            <th className="px-5 py-3.5 text-right">Montant</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {filteredBillingsList.map((bill) => {
                            const player = playerMap.get(bill.patient_id);
                            const billDate = getBillDate(bill);
                            const linkedAppt = Array.isArray(bill.appointments)
                              ? bill.appointments[0]
                              : bill.appointments;
                            const apptDateStr = linkedAppt?.date_heure
                              ? parseClinicDate(linkedAppt.date_heure).toLocaleDateString('fr-FR')
                              : null;
                            const billDateStr = billDate.toLocaleDateString('fr-FR');
                            const isPaid = isPaidBillingStatus(bill.statut);
                            const ref = getBillingDisplayReference(
                              bill,
                              docTemplates,
                              customInvoiceRefs
                            );

                            return (
                              <tr key={bill.id} className="hover:bg-slate-50 transition-colors">
                                <td className="px-5 py-3.5 font-mono text-xs font-semibold text-slate-700">
                                  {ref}
                                </td>
                                <td className="px-5 py-3.5 text-xs text-slate-600 tabular-nums">
                                  <div>{billDateStr}</div>
                                  {apptDateStr && apptDateStr !== billDateStr && (
                                    <div className="text-[11px] text-slate-400">
                                      Séance du {apptDateStr}
                                    </div>
                                  )}
                                </td>
                                <td className="px-5 py-3.5">
                                  <button
                                    type="button"
                                    onClick={() => {
                                      if (player) {
                                        setSelectedPlayerId(player.id);
                                        setPlayerModalTab('reglements');
                                      }
                                    }}
                                    className="font-bold text-slate-900 hover:text-indigo-600 text-left cursor-pointer"
                                  >
                                    {player?.fullName || 'Joueur affilié'}
                                  </button>
                                </td>
                                <td className="px-5 py-3.5 text-xs text-slate-600">
                                  {player?.pathologie || '-'}
                                </td>
                                <td className="px-5 py-3.5 text-xs text-slate-600">
                                  <span className="px-2 py-0.5 rounded bg-slate-100 font-medium">
                                    {bill.type_paiement || 'Patient'}
                                  </span>
                                </td>
                                <td className="px-5 py-3.5">
                                  {isPaid ? (
                                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                                      <CheckCircle2 className="h-3 w-3" />
                                      Payé
                                    </span>
                                  ) : (
                                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-bold bg-rose-50 text-rose-700 border border-rose-200">
                                      <Clock className="h-3 w-3" />
                                      En attente
                                    </span>
                                  )}
                                </td>
                                <td
                                  className={`px-5 py-3.5 text-right font-bold tabular-nums ${
                                    isPaid ? 'text-emerald-700' : 'text-rose-600'
                                  }`}
                                >
                                  {formatMoney(bill.montant)} DH
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                        <tfoot className="bg-slate-50 border-t-2 border-slate-200 text-xs tabular-nums">
                          <tr>
                            <td colSpan={6} className="px-5 py-3 font-bold uppercase text-slate-700">
                              Total Réglé (sélection)
                            </td>
                            <td className="px-5 py-3 text-right font-bold text-emerald-700">
                              {formatMoney(filteredBillingTotals.paid)} DH
                            </td>
                          </tr>
                          <tr>
                            <td colSpan={6} className="px-5 py-3 font-bold uppercase text-rose-700">
                              Reste à Régler (sélection)
                            </td>
                            <td className="px-5 py-3 text-right font-bold text-rose-600 text-sm">
                              {formatMoney(filteredBillingTotals.unpaid)} DH
                            </td>
                          </tr>
                        </tfoot>
                      </table>
                    </div>
                  )}
                </div>
              </div>
            )}
          </>
        )}
      </main>

      {/* MODAL: FICHE SUIVI DÉTAILLÉE D'UN JOUEUR (LECTURE SEULE) */}
      <Modal
        isOpen={Boolean(selectedPlayer)}
        onClose={() => setSelectedPlayerId(null)}
        title={
          selectedPlayer
            ? `Suivi Médical & Règlements — ${selectedPlayer.fullName}`
            : 'Fiche Joueur'
        }
      >
        {selectedPlayer && (
          <div className="space-y-5">
            {/* Player Header */}
            <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-3">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="font-bold text-base text-slate-900">
                      {selectedPlayer.fullName}
                    </h3>
                    {selectedPlayer.isActiveCare ? (
                      <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-indigo-50 text-indigo-700 border border-indigo-200">
                        En soins actifs
                      </span>
                    ) : (
                      <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-slate-200/70 text-slate-700">
                        Suivi terminé
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-slate-600 mt-1 flex flex-wrap items-center gap-3 tabular-nums">
                    {selectedPlayer.telephone && (
                      <span className="inline-flex items-center gap-1">
                        <Phone className="h-3 w-3 text-slate-400" />
                        {selectedPlayer.telephone}
                      </span>
                    )}
                    <span className="inline-flex items-center gap-1.5">
                      <span>
                        Séances réalisées : <strong>{selectedPlayer.completedSessions}</strong>
                        {selectedPlayer.prescribedSessions > 0
                          ? ` / ${selectedPlayer.prescribedSessions} prescrites (${selectedPlayer.progressPercent}%)`
                          : ''}
                      </span>
                      {isStaffPreview && canEditSessionCount && (
                        <button
                          type="button"
                          onClick={(e) => openStaffEditSessions(selectedPlayer, e)}
                          className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-white border border-slate-200 hover:border-indigo-300 text-[11px] font-semibold text-indigo-700 cursor-pointer"
                        >
                          <Edit2 className="h-2.5 w-2.5" />
                          Modifier séances
                        </button>
                      )}
                    </span>
                    {isStaffPreview && (
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedPlayerId(null);
                          openPatientDossier(selectedPlayer.id, 'espace-club');
                        }}
                        className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-indigo-50 border border-indigo-200 hover:bg-indigo-100 text-[11px] font-bold text-indigo-700 cursor-pointer"
                      >
                        <FolderOpen className="h-3 w-3" />
                        Dossier cabinet
                      </button>
                    )}
                  </div>
                </div>

                <div className="text-left sm:text-right text-xs tabular-nums">
                  <div className="font-semibold text-emerald-700">
                    Réglé : {formatMoney(selectedPlayer.paidAmount)} DH
                  </div>
                  <div
                    className={`font-bold mt-0.5 ${
                      selectedPlayer.unpaidAmount > 0 ? 'text-rose-600' : 'text-slate-500'
                    }`}
                  >
                    Reste : {formatMoney(selectedPlayer.unpaidAmount)} DH
                  </div>
                </div>
              </div>

              {/* Progression bar right in the modal header */}
              <div className="w-full h-2 bg-slate-200/80 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full ${
                    selectedPlayer.prescribedSessions > 0 &&
                    selectedPlayer.completedSessions >= selectedPlayer.prescribedSessions
                      ? 'bg-emerald-500'
                      : 'bg-indigo-600'
                  }`}
                  style={{
                    width: `${
                      selectedPlayer.prescribedSessions > 0
                        ? selectedPlayer.progressPercent
                        : selectedPlayer.completedSessions > 0
                        ? 100
                        : 0
                    }%`,
                  }}
                />
              </div>
            </div>

            {/* Modal Sub-tabs */}
            <div className="flex flex-wrap gap-1 bg-slate-100 p-1 rounded-lg">
              {(
                [
                  { id: 'synthese', label: 'Pathologie & Traitements' },
                  { id: 'evolution', label: 'Évolution & Douleur (EVA)' },
                  {
                    id: 'seances',
                    label: `Séances (${selectedPlayer.completedSessions} réalisées)`,
                  },
                  {
                    id: 'reglements',
                    label: `Règlements (${selectedPlayer.billings.length})`,
                  },
                ] as const
              ).map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setPlayerModalTab(tab.id)}
                  className={`px-3 py-1.5 rounded-md text-xs font-bold transition-colors cursor-pointer ${
                    playerModalTab === tab.id
                      ? 'bg-white text-slate-900 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {/* SUB-TAB 1: PATHOLOGIE & TRAITEMENTS */}
            {playerModalTab === 'synthese' && (
              <div className="space-y-4 max-h-[60vh] overflow-y-auto pr-1">
                <div className="p-4 rounded-xl border border-slate-200 bg-white space-y-2">
                  <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-slate-500">
                    <Stethoscope className="h-4 w-4 text-indigo-600" />
                    Pathologie & Bilan Médical
                  </div>
                  <p className="text-sm font-bold text-slate-900">
                    {selectedPlayer.pathologie || 'Bilan en cours / Non précisée sur la fiche'}
                  </p>
                  {selectedPlayer.cleanAtcd && (
                    <div className="pt-2 border-t border-slate-100">
                      <span className="text-xs font-semibold text-slate-500 block mb-0.5">
                        Antécédents & Observations médicales :
                      </span>
                      <p className="text-xs text-slate-700 leading-relaxed whitespace-pre-line">
                        {selectedPlayer.cleanAtcd}
                      </p>
                    </div>
                  )}
                </div>

                {/* Breakdown of Care & Treatments Performed */}
                <div className="p-4 rounded-xl border border-slate-200 bg-white space-y-3">
                  <div className="flex items-center justify-between">
                    <h4 className="text-xs font-bold uppercase tracking-wide text-slate-500 flex items-center gap-1.5">
                      <FileText className="h-4 w-4 text-indigo-600" />
                      Traitements & Actes Réalisés ({selectedPlayer.completedSessions} séance
                      {selectedPlayer.completedSessions > 1 ? 's' : ''})
                    </h4>
                    {selectedPlayer.prescribedSessions > 0 && (
                      <span className="text-xs font-bold text-indigo-700 tabular-nums">
                        Prescription : {selectedPlayer.prescribedSessions} séances
                      </span>
                    )}
                  </div>

                  {selectedPlayer.treatmentBreakdown.length === 0 ? (
                    <p className="text-xs text-slate-500">
                      Aucun acte thérapeutique détaillé n'a encore été enregistré pour ce joueur.
                    </p>
                  ) : (
                    <div className="space-y-2.5">
                      {selectedPlayer.treatmentBreakdown.map((tb) => (
                        <div key={tb.motif} className="space-y-1 tabular-nums">
                          <div className="flex items-center justify-between text-xs">
                            <span className="font-bold text-slate-800">{tb.motif}</span>
                            <span className="font-semibold text-slate-600">
                              {tb.count} séance{tb.count > 1 ? 's' : ''} ({tb.percentage}%)
                            </span>
                          </div>
                          <div className="w-full h-1.5 bg-slate-100 rounded-full overflow-hidden">
                            <div
                              className="h-full bg-indigo-600 rounded-full"
                              style={{ width: `${tb.percentage}%` }}
                            />
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Explicit Prescriptions in `treatments` table if present */}
                {selectedPlayer.treatments.length > 0 && (
                  <div className="space-y-2">
                    <h4 className="text-xs font-bold uppercase tracking-wide text-slate-500">
                      Ordonnances & Protocoles enregistrés
                    </h4>
                    {selectedPlayer.treatments.map((tr: any) => (
                      <div
                        key={tr.id}
                        className="p-3.5 rounded-xl border border-slate-200 bg-white flex flex-col sm:flex-row sm:items-center justify-between gap-2"
                      >
                        <div>
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-bold text-sm text-slate-900">
                              {tr.motif || 'Rééducation fonctionnelle'}
                            </span>
                            <span
                              className={`px-2 py-0.5 rounded text-[11px] font-semibold ${
                                String(tr.statut || '').toLowerCase() === 'en cours'
                                  ? 'bg-indigo-50 text-indigo-700 border border-indigo-200'
                                  : 'bg-slate-100 text-slate-600'
                              }`}
                            >
                              {tr.statut || 'En cours'}
                            </span>
                          </div>
                          <div className="text-xs text-slate-500 mt-1 flex flex-wrap items-center gap-3">
                            {tr.date_debut && (
                              <span>
                                Début :{' '}
                                {parseClinicDate(tr.date_debut).toLocaleDateString('fr-FR')}
                              </span>
                            )}
                            {tr.medecin_prescripteur && (
                              <span>Prescripteur : Dr. {tr.medecin_prescripteur}</span>
                            )}
                          </div>
                        </div>
                        {tr.nombre_seances_prescrites > 0 && (
                          <div className="text-xs font-bold text-slate-700 bg-slate-50 border border-slate-200 px-2.5 py-1 rounded-lg tabular-nums shrink-0">
                            {tr.nombre_seances_prescrites} séances prescrites
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* SUB-TAB 2: ÉVOLUTION & DOULEUR EVA */}
            {playerModalTab === 'evolution' && (
              <div className="space-y-4 max-h-[60vh] overflow-y-auto pr-1">
                {selectedPlayer.painLogs.length > 0 ? (
                  <div className="p-3 rounded-xl border border-slate-200 bg-white">
                    <PainEvolutionChart logs={selectedPlayer.painLogs} daysCount={30} />
                  </div>
                ) : (
                  <div className="p-5 rounded-xl border border-slate-200 bg-slate-50 text-center text-xs text-slate-500">
                    Aucune évaluation chiffrée de douleur (échelle EVA) n'a encore été saisie pour ce joueur.
                  </div>
                )}

                {/* Chronological care & clinical notes from sessions */}
                <div className="space-y-2">
                  <h4 className="text-xs font-bold uppercase tracking-wide text-slate-500">
                    Suivi chronologique des soins réalisés
                  </h4>
                  {selectedPlayer.appointments.filter((a) => isPerformedSessionStatus(a.statut))
                    .length === 0 ? (
                    <p className="text-xs text-slate-500 italic p-3 bg-slate-50 rounded-lg border border-slate-100">
                      Aucune séance réalisée à ce jour.
                    </p>
                  ) : (
                    <div className="space-y-2">
                      {selectedPlayer.appointments
                        .filter((a) => isPerformedSessionStatus(a.statut))
                        .map((appt) => {
                          const d = parseClinicDate(appt.date_heure);
                          const thName =
                            appt.therapist_id && therapistMap.get(appt.therapist_id)
                              ? therapistMap.get(appt.therapist_id)
                              : '';
                          return (
                            <div
                              key={appt.id}
                              className="p-3 rounded-xl border border-slate-200 bg-white flex items-center justify-between gap-3"
                            >
                              <div>
                                <div className="text-xs font-bold text-slate-900 tabular-nums">
                                  {d.toLocaleDateString('fr-FR')}
                                  {thName ? (
                                    <span className="font-normal text-slate-500">
                                      {' '}
                                      • Kiné : {thName}
                                    </span>
                                  ) : null}
                                </div>
                                <p className="text-xs text-indigo-700 font-semibold mt-0.5">
                                  {appt.notes_seance || 'Séance de kinésithérapie'}
                                </p>
                              </div>
                              <div className="flex items-center gap-2 shrink-0">
                                {isStaffPreview && (
                                  <button
                                    type="button"
                                    onClick={(ev) => openStaffEditApptMotif(appt, ev)}
                                    title="Modifier le motif de cette séance"
                                    className="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 transition-colors cursor-pointer"
                                  >
                                    <Edit2 className="h-3 w-3" />
                                    Modifier motif
                                  </button>
                                )}
                                <span className="text-[11px] font-semibold px-2 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-200 shrink-0">
                                  Réalisée
                                </span>
                              </div>
                            </div>
                          );
                        })}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* SUB-TAB 3: HISTORIQUE DES SÉANCES */}
            {playerModalTab === 'seances' && (
              <div className="max-h-[60vh] overflow-y-auto pr-1">
                {selectedPlayer.appointments.length === 0 ? (
                  <p className="text-center text-xs text-slate-500 py-6">
                    Aucune séance enregistrée pour ce joueur.
                  </p>
                ) : (
                  <div className="divide-y divide-slate-100 border border-slate-200 rounded-xl overflow-hidden bg-white">
                    {selectedPlayer.appointments.map((appt) => {
                      const d = parseClinicDate(appt.date_heure);
                      const thName =
                        appt.therapist_id && therapistMap.get(appt.therapist_id)
                          ? therapistMap.get(appt.therapist_id)
                          : '';
                      const isPerf = isPerformedSessionStatus(appt.statut);
                      const isCanc = isCancelledSessionStatus(appt.statut);
                      const isPaidPerf =
                        String(appt.statut || '').trim().toLowerCase() === 'effectué' ||
                        String(appt.statut || '').trim().toLowerCase() === 'effectue';

                      const statusBadgeLabel = isPerf
                        ? isPaidPerf
                          ? 'Réalisée • Réglée'
                          : 'Réalisée • À régler'
                        : isCanc
                        ? 'Annulée'
                        : 'Programmée';

                      const statusBadgeClass = isPerf
                        ? isPaidPerf
                          ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                          : 'bg-amber-50 text-amber-800 border border-amber-200'
                        : isCanc
                        ? 'bg-slate-100 text-slate-500'
                        : 'bg-indigo-50 text-indigo-700 border border-indigo-200';

                      return (
                        <div
                          key={appt.id}
                          className="p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs"
                        >
                          <div>
                            <div className="font-bold text-slate-900 flex items-center gap-2 tabular-nums">
                              <Calendar className="h-3.5 w-3.5 text-slate-400" />
                              {d.toLocaleDateString('fr-FR')} à{' '}
                              {d.toLocaleTimeString('fr-FR', {
                                hour: '2-digit',
                                minute: '2-digit',
                              })}
                            </div>
                            <p className="text-indigo-700 font-semibold mt-0.5">
                              {appt.notes_seance || 'Séance de Suivi'}
                            </p>
                            {thName && (
                              <p className="text-slate-500 mt-0.5">Praticien : {thName}</p>
                            )}
                          </div>
                          <div className="flex items-center gap-2 self-start sm:self-center shrink-0">
                            {isStaffPreview && (
                              <button
                                type="button"
                                onClick={(ev) => openStaffEditApptMotif(appt, ev)}
                                title="Modifier le motif de cette séance"
                                className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 font-semibold transition-colors cursor-pointer"
                              >
                                <Edit2 className="h-3 w-3" />
                                Modifier motif
                              </button>
                            )}
                            <span
                              className={`px-2.5 py-0.5 rounded font-bold shrink-0 ${statusBadgeClass}`}
                            >
                              {statusBadgeLabel}
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {/* SUB-TAB 4: RÈGLEMENTS DU JOUEUR */}
            {playerModalTab === 'reglements' && (
              <div className="max-h-[60vh] overflow-y-auto pr-1">
                {selectedPlayer.billings.length === 0 ? (
                  <p className="text-center text-xs text-slate-500 py-6">
                    Aucune facturation enregistrée pour ce joueur.
                  </p>
                ) : (
                  <div className="divide-y divide-slate-100 border border-slate-200 rounded-xl overflow-hidden bg-white">
                    {selectedPlayer.billings.map((bill) => {
                      const d = getBillDate(bill);
                      const isPaid = isPaidBillingStatus(bill.statut);
                      const ref = getBillingDisplayReference(
                        bill,
                        docTemplates,
                        customInvoiceRefs
                      );
                      return (
                        <div
                          key={bill.id}
                          className="p-3.5 flex items-center justify-between gap-3 text-xs tabular-nums"
                        >
                          <div>
                            <div className="font-mono font-bold text-slate-800">{ref}</div>
                            <div className="text-slate-500 mt-0.5">
                              {d.toLocaleDateString('fr-FR')} • {bill.type_paiement || 'Patient'}
                            </div>
                          </div>
                          <div className="flex items-center gap-3">
                            <span
                              className={`px-2 py-0.5 rounded font-bold ${
                                isPaid
                                  ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                  : 'bg-rose-50 text-rose-700 border border-rose-200'
                              }`}
                            >
                              {isPaid ? 'Payé' : 'En attente'}
                            </span>
                            <span
                              className={`font-bold text-sm ${
                                isPaid ? 'text-emerald-700' : 'text-rose-600'
                              }`}
                            >
                              {formatMoney(bill.montant)} DH
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </Modal>

      {/* MODAL: CHANGEMENT DE MOT DE PASSE CLUB */}
      <Modal
        isOpen={isPasswordModalOpen}
        onClose={() => {
          if (!passwordSaving) setIsPasswordModalOpen(false);
        }}
        title="Modifier le mot de passe du compte Club"
      >
        <form onSubmit={handleUpdatePassword} className="space-y-4">
          {passwordNotice && (
            <div
              className={`p-3 rounded-xl text-xs font-medium flex items-start gap-2 ${
                passwordNotice.type === 'success'
                  ? 'bg-emerald-50 border border-emerald-200 text-emerald-700'
                  : 'bg-rose-50 border border-rose-200 text-rose-700'
              }`}
            >
              {passwordNotice.type === 'success' ? (
                <CheckCircle2 className="h-4 w-4 shrink-0 mt-0.5" />
              ) : (
                <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
              )}
              <span>{passwordNotice.text}</span>
            </div>
          )}

          <div className="space-y-1.5">
            <label className="text-xs font-bold uppercase text-slate-600">
              Nouveau mot de passe
            </label>
            <div className="relative">
              <input
                type={showNewPassword ? 'text' : 'password'}
                required
                minLength={6}
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="Minimum 6 caractères"
                className="w-full px-3 pr-10 py-2.5 rounded-xl border border-slate-200 text-sm outline-none focus:border-indigo-500"
              />
              <button
                type="button"
                onClick={() => setShowNewPassword((v) => !v)}
                className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-400 hover:text-slate-600"
              >
                {showNewPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-bold uppercase text-slate-600">
              Confirmer le mot de passe
            </label>
            <input
              type={showNewPassword ? 'text' : 'password'}
              required
              minLength={6}
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="Répétez le mot de passe"
              className="w-full px-3 py-2.5 rounded-xl border border-slate-200 text-sm outline-none focus:border-indigo-500"
            />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button
              type="button"
              variant="outline"
              disabled={passwordSaving}
              onClick={() => setIsPasswordModalOpen(false)}
            >
              Annuler
            </Button>
            <Button
              type="submit"
              disabled={passwordSaving}
              className="bg-indigo-600 hover:bg-indigo-700 text-white"
            >
              {passwordSaving ? 'Enregistrement...' : 'Enregistrer'}
            </Button>
          </div>
        </form>
      </Modal>

      {/* MODAL: MODIFIER LE NOMBRE DE SÉANCES PRESCRITES (ADMIN & SECRÉTAIRE UNIQUEMENT) */}
      <Modal
        isOpen={Boolean(playerForSessionsEdit) && isStaffPreview && canEditSessionCount}
        onClose={() => {
          if (!sessionsEditSaving) {
            setPlayerForSessionsEdit(null);
            setSessionsEditError('');
          }
        }}
        title="Modifier le nombre de séances prescrites"
        maxWidth="sm"
      >
        {playerForSessionsEdit && (
          <form onSubmit={handleSaveStaffSessions} className="space-y-4">
            <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-600 flex items-center justify-between gap-2">
              <div>
                Joueur :{' '}
                <strong className="text-slate-900">{playerForSessionsEdit.fullName}</strong>
              </div>
              <span className="font-bold text-indigo-700 tabular-nums">
                {playerForSessionsEdit.completedSessions} réalisée(s)
              </span>
            </div>

            {sessionsEditError && (
              <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-xs font-medium text-rose-700 flex items-start gap-2">
                <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                <span>{sessionsEditError}</span>
              </div>
            )}

            <div className="space-y-2">
              <label className="text-xs font-bold uppercase text-slate-600 block">
                Nombre total de séances prescrites
              </label>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() =>
                    setSessionsEditValue((prev) =>
                      String(Math.max(0, (parseInt(prev, 10) || 0) - 1))
                    )
                  }
                  className="h-10 w-10 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 flex items-center justify-center text-slate-700 shrink-0 cursor-pointer"
                >
                  <Minus className="h-4 w-4" />
                </button>
                <input
                  type="number"
                  min="0"
                  required
                  value={sessionsEditValue}
                  onChange={(e) => setSessionsEditValue(e.target.value)}
                  className="w-full h-10 px-3 text-center font-bold text-base border border-slate-200 rounded-xl bg-white text-slate-900 focus:border-indigo-500 outline-none tabular-nums"
                />
                <button
                  type="button"
                  onClick={() =>
                    setSessionsEditValue((prev) =>
                      String((parseInt(prev, 10) || 0) + 1)
                    )
                  }
                  className="h-10 w-10 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 flex items-center justify-center text-slate-700 shrink-0 cursor-pointer"
                >
                  <Plus className="h-4 w-4" />
                </button>
              </div>

              <div className="flex flex-wrap items-center gap-1.5 pt-1">
                {[10, 15, 20, 25, 30].map((preset) => (
                  <button
                    key={preset}
                    type="button"
                    onClick={() => setSessionsEditValue(String(preset))}
                    className="px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-xs font-semibold text-slate-700 tabular-nums cursor-pointer"
                  >
                    {preset} séances
                  </button>
                ))}
                {playerForSessionsEdit.completedSessions > 0 && (
                  <button
                    type="button"
                    onClick={() =>
                      setSessionsEditValue(String(playerForSessionsEdit.completedSessions))
                    }
                    className="px-2.5 py-1 rounded-lg bg-emerald-50 border border-emerald-200 hover:bg-emerald-100 text-xs font-bold text-emerald-700 tabular-nums cursor-pointer"
                  >
                    Ajuster au réalisé ({playerForSessionsEdit.completedSessions})
                  </button>
                )}
                <button
                  type="button"
                  onClick={() =>
                    setSessionsEditValue((prev) =>
                      String((parseInt(prev, 10) || 0) + 5)
                    )
                  }
                  className="px-2.5 py-1 rounded-lg bg-indigo-50 border border-indigo-200 hover:bg-indigo-100 text-xs font-bold text-indigo-700 tabular-nums cursor-pointer"
                >
                  +5 séances
                </button>
                <button
                  type="button"
                  onClick={() =>
                    setSessionsEditValue((prev) =>
                      String((parseInt(prev, 10) || 0) + 10)
                    )
                  }
                  className="px-2.5 py-1 rounded-lg bg-indigo-50 border border-indigo-200 hover:bg-indigo-100 text-xs font-bold text-indigo-700 tabular-nums cursor-pointer"
                >
                  +10 séances
                </button>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
              <Button
                type="button"
                variant="outline"
                disabled={sessionsEditSaving}
                onClick={() => setPlayerForSessionsEdit(null)}
              >
                Annuler
              </Button>
              <Button
                type="submit"
                disabled={sessionsEditSaving}
                className="bg-indigo-600 hover:bg-indigo-700 text-white"
              >
                {sessionsEditSaving ? 'Enregistrement...' : 'Enregistrer'}
              </Button>
            </div>
          </form>
        )}
      </Modal>

      {/* Staff-only Modal: Edit Session Motif (even if already completed/settled) */}
      <Modal
        isOpen={Boolean(isStaffPreview && apptForMotifEdit)}
        onClose={() => {
          if (!motifEditSaving) setApptForMotifEdit(null);
        }}
        title="Modifier le motif de la séance"
      >
        {apptForMotifEdit && (
          <form onSubmit={handleSaveStaffApptMotif} className="space-y-4">
            <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 text-xs space-y-1">
              <div className="flex items-center justify-between gap-2">
                <span className="font-bold text-slate-900">
                  {selectedPlayer?.fullName || 'Joueur'}
                </span>
                <span className="font-semibold text-slate-600 tabular-nums">
                  {parseClinicDate(apptForMotifEdit.date_heure).toLocaleDateString('fr-FR')} à{' '}
                  {parseClinicDate(apptForMotifEdit.date_heure).toLocaleTimeString('fr-FR', {
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </span>
              </div>
              <p className="text-slate-600">
                Motif actuel :{' '}
                <strong className="text-indigo-700">
                  {apptForMotifEdit.notes_seance || 'Séance de Suivi'}
                </strong>
              </p>
              {isPerformedSessionStatus(apptForMotifEdit.statut) && (
                <p className="text-[11px] text-emerald-700 font-medium pt-0.5">
                  Séance déjà réalisée : la modification du motif met à jour le suivi des soins sans modifier la facturation.
                </p>
              )}
            </div>

            {motifEditError && (
              <div className="p-3 rounded-lg bg-rose-50 border border-rose-200 text-rose-700 text-xs font-medium">
                {motifEditError}
              </div>
            )}

            <div className="relative">
              <label className="block text-sm font-semibold text-slate-700 mb-1.5">
                Nouveau motif / acte réalisé
              </label>
              <div className="relative flex items-center">
                <input
                  type="text"
                  required
                  value={motifEditValue}
                  onChange={(ev) => {
                    setMotifEditValue(ev.target.value);
                    setShowClubMotifDropdown(true);
                  }}
                  onFocus={() => setShowClubMotifDropdown(true)}
                  onBlur={() => setTimeout(() => setShowClubMotifDropdown(false), 200)}
                  placeholder="Choisir ou saisir un motif (ex: Réathlétisation, Tecar thérapie...)"
                  className="w-full h-11 rounded-xl border border-slate-300 bg-white px-3.5 pr-9 text-sm font-medium text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
                {motifEditValue && (
                  <button
                    type="button"
                    onClick={() => {
                      setMotifEditValue('');
                      setShowClubMotifDropdown(true);
                    }}
                    title="Effacer pour voir tous les motifs"
                    className="absolute right-2.5 p-1 rounded-md text-slate-400 hover:text-slate-700 hover:bg-slate-100 cursor-pointer"
                  >
                    <X className="h-4 w-4" />
                  </button>
                )}
              </div>

              {showClubMotifDropdown && (
                <div className="absolute z-50 w-full mt-1 bg-white border border-slate-200 rounded-xl shadow-lg max-h-48 overflow-y-auto">
                  {(() => {
                    const trimmed = motifEditValue.trim().toLowerCase();
                    const isExact = clubMotifs.some((m) => m.toLowerCase() === trimmed);
                    const list =
                      !trimmed || isExact
                        ? clubMotifs
                        : clubMotifs.filter((m) => m.toLowerCase().includes(trimmed));
                    return list.map((m) => (
                      <div
                        key={m}
                        onMouseDown={(ev) => {
                          ev.preventDefault();
                          setMotifEditValue(m);
                          setShowClubMotifDropdown(false);
                        }}
                        className={`px-3.5 py-2 text-xs cursor-pointer hover:bg-indigo-50 hover:text-indigo-700 flex items-center justify-between ${
                          m.toLowerCase() === trimmed
                            ? 'bg-indigo-50/70 font-bold text-indigo-700'
                            : 'text-slate-700 font-medium'
                        }`}
                      >
                        <span>{m}</span>
                      </div>
                    ));
                  })()}
                </div>
              )}

              <div className="mt-2.5 flex flex-wrap gap-1.5">
                {[
                  'Kinésithérapie classique',
                  'Tecar thérapie',
                  'Réathlétisation',
                  'Thérapie manuelle',
                  'Onde de choc',
                  'Cupping thérapie',
                  'Récupération',
                  'Séance de bilan',
                ].map((quickMotif) => {
                  const active =
                    motifEditValue.trim().toLowerCase() === quickMotif.toLowerCase();
                  return (
                    <button
                      key={quickMotif}
                      type="button"
                      onClick={() => {
                        setMotifEditValue(quickMotif);
                        setShowClubMotifDropdown(false);
                      }}
                      className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold border transition-colors cursor-pointer ${
                        active
                          ? 'bg-indigo-600 text-white border-indigo-600'
                          : 'bg-slate-100 hover:bg-slate-200 text-slate-700 border-slate-200'
                      }`}
                    >
                      {quickMotif}
                    </button>
                  );
                })}
              </div>
            </div>

            {selectedPlayer &&
              (() => {
                const oldMotif = String(apptForMotifEdit.notes_seance || '').trim();
                const matchingCount = selectedPlayer.appointments.filter(
                  (a) => String(a.notes_seance || '').trim() === oldMotif
                ).length;
                if (matchingCount <= 1) return null;
                return (
                  <label className="flex items-start gap-2.5 p-3 rounded-xl bg-indigo-50/70 border border-indigo-200 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={applyMotifToSameOldMotif}
                      onChange={(ev) => setApplyMotifToSameOldMotif(ev.target.checked)}
                      className="mt-0.5 rounded border-indigo-300 text-indigo-600 focus:ring-indigo-500"
                    />
                    <span className="text-xs text-slate-700 leading-snug">
                      Appliquer également ce nouveau motif aux{' '}
                      <strong className="text-indigo-700">{matchingCount} séances</strong> de{' '}
                      <strong>{selectedPlayer.fullName}</strong> ayant actuellement le motif{' '}
                      <em>« {oldMotif || 'Séance de Suivi'} »</em>.
                    </span>
                  </label>
                );
              })()}

            <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
              <Button
                type="button"
                variant="outline"
                disabled={motifEditSaving}
                onClick={() => setApptForMotifEdit(null)}
              >
                Annuler
              </Button>
              <Button
                type="submit"
                disabled={motifEditSaving}
                className="bg-indigo-600 hover:bg-indigo-700 text-white"
              >
                {motifEditSaving ? 'Enregistrement...' : 'Enregistrer le motif'}
              </Button>
            </div>
          </form>
        )}
      </Modal>
    </div>
  );
}
