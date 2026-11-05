import React, { useState, useEffect, useRef, useMemo } from 'react';
import { supabase, supabaseUrl, supabaseAnonKey } from '@/lib/supabaseClient';
import { fetchAllRows } from '@/lib/financeUtils';
import { getMoroccoNow, getMoroccoTodayStr, parseClinicDate } from '@/lib/timeUtils';
import { normalizePatientPhone, provisionOrResetPatientAccess } from '@/lib/patientAuthUtils';
import {
  ORGANISMES_MUTUELLE,
  SPORTS_DISCIPLINES,
  PartnerClub,
  parsePatientMutuelle,
  serializeAtcdWithMutuelle,
  serializeAtcdWithClubOnly,
  fetchPartnerClubs,
  upsertPartnerClub,
  removePartnerClub,
} from '@/lib/mutuelleUtils';
import { resolveOrBindCollaboratorSession, canManageSessionCounts } from '@/lib/teamUtils';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  RefreshCw,
  CheckCircle2,
  AlertCircle,
  UserPlus,
  Users,
  Phone,
  Search,
  Filter,
  Upload,
  Lock,
  Trash2,
  ShieldCheck,
  ShieldOff,
  Trophy,
  Plus,
  CheckSquare,
  Square,
  X,
  Key,
  Eye,
  EyeOff,
  ExternalLink,
  FolderOpen,
  Edit2,
  Minus,
} from 'lucide-react';
import { Modal } from '@/components/ui/modal';
import { PatientNameLink } from './PatientNameLink';
import { openPatientDossier } from '@/lib/patientNavigation';
import { ClubAccessModal } from '@/components/clubs/ClubAccessModal';
import { openClubPortalPreview } from '@/lib/clubPortalUtils';
import Papa from 'papaparse';

interface Patient {
  id: string;
  nom: string;
  prenom: string;
  telephone: string;
  email: string;
  date_naissance?: string;
  cin?: string;
  adresse?: string;
  pathologie?: string;
  nombre_seances?: number;
  atcd?: string;
  has_access?: boolean;
  created_at: string;
}

interface PatientManagerProps {
  onSelectPatient?: (id: string) => void;
}

export function PatientManager({ onSelectPatient }: PatientManagerProps) {
  // Form states
  const [nom, setNom] = useState('');
  const [prenom, setPrenom] = useState('');
  const [tel, setTel] = useState('');
  const [email, setEmail] = useState('');
  const [dateNaissance, setDateNaissance] = useState('');
  const [cin, setCin] = useState('');
  const [adresse, setAdresse] = useState('');
  const [pathologie, setPathologie] = useState('');
  const [nombreSeances, setNombreSeances] = useState('');
  const [atcd, setAtcd] = useState('');
  const [isMutualiste, setIsMutualiste] = useState(false);
  const [organismeMutuelle, setOrganismeMutuelle] = useState('CNOPS');
  const [selectedFormClub, setSelectedFormClub] = useState('');
  const [customFormClub, setCustomFormClub] = useState('');

  // UI states
  const [loading, setLoading] = useState(false);
  const [fetching, setFetching] = useState(false);
  const [success, setSuccess] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Data state
  const [patients, setPatients] = useState<Patient[]>([]);
  const [partnerClubs, setPartnerClubs] = useState<PartnerClub[]>([]);
  const [appointments, setAppointments] = useState<any[]>([]);
  const [treatments, setTreatments] = useState<any[]>([]);
  const [mutuelleBillingIds, setMutuelleBillingIds] = useState<Set<string>>(new Set());

  // Search & Filter states
  const [searchQuery, setSearchQuery] = useState('');
  const [mutuelleFilter, setMutuelleFilter] = useState<'all' | 'mutualiste' | 'non_mutualiste'>('all');
  const [organismeFilter, setOrganismeFilter] = useState<string>('all');
  const [clubFilter, setClubFilter] = useState<string>('all'); // 'all' | 'any_club' | 'no_club' | 'club:<name>'
  const [searchDateNaissance, setSearchDateNaissance] = useState('');
  const [searchTelephone, setSearchTelephone] = useState('');
  const [searchPathologie, setSearchPathologie] = useState('');
  const [showAdvancedSearch, setShowAdvancedSearch] = useState(false);

  // Multi-select bulk club grouping states
  const [selectedPatientIds, setSelectedPatientIds] = useState<Set<string>>(new Set());
  const [bulkClubChoice, setBulkClubChoice] = useState<string>('');
  const [bulkNewClubName, setBulkNewClubName] = useState<string>('');
  const [bulkAssignLoading, setBulkAssignLoading] = useState(false);

  // Quick Mutuelle + Club Edit Modal state (from table badges)
  const [isMutuelleModalOpen, setIsMutuelleModalOpen] = useState(false);
  const [patientForMutuelle, setPatientForMutuelle] = useState<Patient | null>(null);
  const [modalIsMutualiste, setModalIsMutualiste] = useState(false);
  const [modalOrganisme, setModalOrganisme] = useState('CNOPS');
  const [modalClubSelect, setModalClubSelect] = useState('');
  const [modalCustomClub, setModalCustomClub] = useState('');
  const [savingMutuelle, setSavingMutuelle] = useState(false);

  // Quick Prescribed Sessions (`nombre_seances`) Edit Modal state (Admin & Secrétaire ONLY)
  const [canEditSessionCount, setCanEditSessionCount] = useState(false);
  const [patientForSeances, setPatientForSeances] = useState<Patient | null>(null);
  const [seancesModalValue, setSeancesModalValue] = useState<string>('10');
  const [savingSeancesModal, setSavingSeancesModal] = useState(false);

  // Manage Partner Clubs Modal state
  const [isClubsModalOpen, setIsClubsModalOpen] = useState(false);
  const [clubForAccessModal, setClubForAccessModal] = useState<PartnerClub | null>(null);
  const [newClubForm, setNewClubForm] = useState({
    name: '',
    sport: 'Football',
    tarifConvention: '',
    note: '',
  });
  const [clubSaving, setClubSaving] = useState(false);
  const [clubModalMessage, setClubModalMessage] = useState<{ type: '' | 'success' | 'error'; text: string }>({
    type: '',
    text: '',
  });

  // Import state
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [importLoading, setImportLoading] = useState(false);

  // Delete states
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [patientToDelete, setPatientToDelete] = useState<Patient | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);

  // Quick Patient Access / Password Reset Modal states
  const [isQuickAccessModalOpen, setIsQuickAccessModalOpen] = useState(false);
  const [patientForAccess, setPatientForAccess] = useState<Patient | null>(null);
  const [quickAccessPassword, setQuickAccessPassword] = useState('');
  const [showQuickAccessPassword, setShowQuickAccessPassword] = useState(true);
  const [quickAccessLoading, setQuickAccessLoading] = useState(false);
  const [quickAccessMessage, setQuickAccessMessage] = useState<{ type: '' | 'success' | 'error'; text: string }>({
    type: '',
    text: '',
  });

  const [lastQuickCreds, setLastQuickCreds] = useState<{ phone: string; password: string } | null>(null);

  const openQuickAccessModal = (patient: Patient) => {
    setPatientForAccess(patient);
    setQuickAccessPassword('');
    setLastQuickCreds(null);
    setShowQuickAccessPassword(true);
    setQuickAccessMessage({ type: '', text: '' });
    try {
      localStorage.setItem('reforme_preview_patient_id', patient.id);
    } catch {}
    setIsQuickAccessModalOpen(true);
  };

  const handleQuickGenerateAccess = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!patientForAccess) return;
    if (!patientForAccess.telephone) {
      setQuickAccessMessage({
        type: 'error',
        text: 'Ce patient doit avoir un numéro de téléphone renseigné pour activer son accès.',
      });
      return;
    }

    setQuickAccessLoading(true);
    setQuickAccessMessage({ type: '', text: '' });

    try {
      const savedPlainPassword = quickAccessPassword.trim();
      const result = await provisionOrResetPatientAccess(
        supabase,
        supabaseUrl,
        supabaseAnonKey,
        { id: patientForAccess.id, telephone: patientForAccess.telephone },
        savedPlainPassword
      );

      try {
        localStorage.setItem('reforme_preview_patient_id', patientForAccess.id);
      } catch {}

      const normTarget = result.canonicalPhone;
      setPatients((prev) =>
        prev.map((p) => {
          const pNorm = normalizePatientPhone(p.telephone || '');
          if (p.id === patientForAccess.id || (normTarget && pNorm === normTarget)) {
            return { ...p, has_access: true };
          }
          return p;
        })
      );
      setPatientForAccess((prev) => (prev ? { ...prev, has_access: true } : null));
      setLastQuickCreds({ phone: result.canonicalPhone, password: savedPlainPassword });
      setQuickAccessPassword('');
      setQuickAccessMessage({
        type: 'success',
        text: result.isReset
          ? `Mot de passe réinitialisé ! Connexion active immédiatement.`
          : `Accès activé ! Connexion active immédiatement.`,
      });
    } catch (err: any) {
      setQuickAccessMessage({
        type: 'error',
        text: err.message || "Erreur lors de la génération de l'accès patient.",
      });
    } finally {
      setQuickAccessLoading(false);
    }
  };

  useEffect(() => {
    fetchPatients();
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (session?.user) {
        const profile = await resolveOrBindCollaboratorSession(supabase, {
          id: session.user.id,
          email: session.user.email,
        });
        setCanEditSessionCount(canManageSessionCounts(profile?.role, session.user.email));
      }
    });

    const handleFocus = () => fetchPatients();
    const handlePainEvent = () => fetchPatients();
    window.addEventListener('focus', handleFocus);
    window.addEventListener('reforme_pain_updated', handlePainEvent);

    const channel = supabase
      .channel('patient-manager-live-pain')
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'patients'
        },
        () => {
          fetchPatients();
        }
      )
      .subscribe();

    return () => {
      window.removeEventListener('focus', handleFocus);
      window.removeEventListener('reforme_pain_updated', handlePainEvent);
      supabase.removeChannel(channel);
    };
  }, []);

  const fetchPatients = async () => {
    setFetching(true);
    setError(null);

    try {
      const patientColumns =
        'id, nom, prenom, telephone, email, date_naissance, cin, adresse, pathologie, nombre_seances, atcd, forfait_seances, has_access, last_follow_up_date, follow_up_status, notes_antecedents, created_at';

      let { data: pData, error: fetchError } = await supabase
        .from('patients')
        .select(patientColumns)
        .order('created_at', { ascending: false });

      if (fetchError) {
        const fallback = await supabase.from('patients').select(patientColumns);
        if (fallback.error) throw fallback.error;
        pData = (fallback.data || []).sort(
          (a: any, b: any) =>
            new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime()
        );
      }

      const loadedPatients = (pData as Patient[]) || [];
      setPatients(loadedPatients);

      const [appData, treatData, billData, clubsList] = await Promise.all([
        fetchAllRows('appointments', 'patient_id, statut, date_heure', {
          column: 'date_heure',
          ascending: false,
        }),
        fetchAllRows('treatments', 'id, patient_id, statut, nombre_seances_prescrites'),
        fetchAllRows('billings', 'patient_id, type_paiement'),
        fetchPartnerClubs(supabase, loadedPatients),
      ]);

      setAppointments(appData || []);
      setTreatments(treatData || []);
      setPartnerClubs(clubsList);

      const mutIds = new Set<string>();
      for (const b of billData || []) {
        if (
          b?.patient_id &&
          (b.type_paiement === 'Mutuelle' || b.type_paiement === 'Tiers-payant')
        ) {
          mutIds.add(b.patient_id);
        }
      }
      setMutuelleBillingIds(mutIds);
    } catch (err: any) {
      setError(`Erreur lors du chargement : ${err.message}`);
    } finally {
      setFetching(false);
    }
  };

  // Partner Clubs Management Handlers
  const handleAddPartnerClub = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanName = newClubForm.name.trim();
    if (!cleanName) {
      setClubModalMessage({ type: 'error', text: 'Veuillez saisir le nom du club sportif.' });
      return;
    }

    setClubSaving(true);
    setClubModalMessage({ type: '', text: '' });
    try {
      await upsertPartnerClub(supabase, {
        name: cleanName,
        sport: newClubForm.sport,
        tarifConvention: newClubForm.tarifConvention ? Number(newClubForm.tarifConvention) : null,
        note: newClubForm.note.trim(),
      });
      const refreshed = await fetchPartnerClubs(supabase, patients);
      setPartnerClubs(refreshed);
      setNewClubForm({ name: '', sport: 'Football', tarifConvention: '', note: '' });
      setClubModalMessage({
        type: 'success',
        text: `Le club « ${cleanName} » a été ajouté aux clubs conventionnés.`,
      });
    } catch (err: any) {
      setClubModalMessage({
        type: 'error',
        text: err.message || "Erreur lors de l'enregistrement du club.",
      });
    } finally {
      setClubSaving(false);
    }
  };

  const handleDeletePartnerClub = async (clubName: string) => {
    setClubSaving(true);
    setClubModalMessage({ type: '', text: '' });
    try {
      await removePartnerClub(supabase, clubName, patients);
      if (clubFilter === `club:${clubName}`) {
        setClubFilter('all');
      }
      await fetchPatients();
      setClubModalMessage({
        type: 'success',
        text: `Le club « ${clubName} » a été retiré.`,
      });
    } catch (err: any) {
      setClubModalMessage({
        type: 'error',
        text: err.message || 'Erreur lors de la suppression du club.',
      });
    } finally {
      setClubSaving(false);
    }
  };

  // Multi-select bulk club grouping handler
  const handleToggleSelectPatient = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setSelectedPatientIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const handleToggleSelectAllFiltered = () => {
    if (filteredPatients.length === 0) return;
    const allSelected = filteredPatients.every((p) => selectedPatientIds.has(p.id));
    if (allSelected) {
      setSelectedPatientIds((prev) => {
        const next = new Set(prev);
        for (const p of filteredPatients) next.delete(p.id);
        return next;
      });
    } else {
      setSelectedPatientIds((prev) => {
        const next = new Set(prev);
        for (const p of filteredPatients) next.add(p.id);
        return next;
      });
    }
  };

  const handleBulkAssignClub = async (detach = false) => {
    if (selectedPatientIds.size === 0) return;

    let targetClub = '';
    if (!detach) {
      targetClub =
        bulkClubChoice === '__new__' ? bulkNewClubName.trim() : bulkClubChoice.trim();
      if (!targetClub) {
        setError('Veuillez choisir un club conventionné ou saisir le nom du nouveau club.');
        return;
      }
    }

    setBulkAssignLoading(true);
    setError(null);
    setSuccess(null);

    try {
      // If creating a new club inline, register it in partner clubs automatically
      if (!detach && targetClub) {
        const exists = partnerClubs.some(
          (c) => c.name.toLowerCase() === targetClub.toLowerCase()
        );
        if (!exists) {
          await upsertPartnerClub(supabase, {
            name: targetClub,
            sport: 'Omnisports',
            tarifConvention: null,
            note: '',
          });
        }
      }

      const targets = patients.filter((p) => selectedPatientIds.has(p.id));
      await Promise.all(
        targets.map((p) => {
          const updatedAtcd = serializeAtcdWithClubOnly(p, detach ? '' : targetClub);
          return supabase.from('patients').update({ atcd: updatedAtcd }).eq('id', p.id);
        })
      );

      setSelectedPatientIds(new Set());
      setBulkNewClubName('');
      await fetchPatients();

      setSuccess(
        detach
          ? `${targets.length} patient(s) retiré(s) des clubs sportifs.`
          : `${targets.length} patient(s) regroupé(s) dans le club « ${targetClub} » !`
      );
      setTimeout(() => setSuccess(null), 4000);
    } catch (err: any) {
      setError(`Erreur lors de l'affectation groupée : ${err.message}`);
    } finally {
      setBulkAssignLoading(false);
    }
  };

  const handleImportCSV = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setImportLoading(true);
    setError(null);
    setSuccess(null);

    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: async (results) => {
        try {
          const validPatients = results.data
            .map((row: any) => {
              const findVal = (keys: string[]) => {
                const key = Object.keys(row).find((k) => keys.includes(k.toLowerCase().trim()));
                return key ? row[key] : null;
              };

              const nomVal = findVal(['nom', 'last name', 'lastname', 'nom_patient']) || 'Inconnu';
              const prenomVal =
                findVal(['prenom', 'prénom', 'first name', 'firstname', 'prenom_patient']) || 'Inconnu';
              const telVal = findVal(['tel', 'téléphone', 'telephone', 'phone', 'contact']) || null;
              const emailVal = findVal(['email', 'e-mail', 'mail', 'courriel']) || null;
              const pathologieVal = findVal(['pathologie', 'pathology', 'motif', 'diagnostic']) || null;
              const dateNaiss =
                findVal(['date de naissance', 'date_naissance', 'dob', 'birthdate', 'birth date']) || null;
              const adresseVal = findVal(['adresse', 'address']) || null;
              const mutuelleVal =
                findVal(['mutuelle', 'mutualiste', 'assurance', 'organisme', 'couverture']) || '';
              const clubVal =
                findVal(['club', 'club sportif', 'equipe', 'équipe', 'convention']) || '';
              const atcdRaw = findVal(['atcd', 'antécédents', 'antecedents']) || '';

              let formattedDate = null;
              if (dateNaiss) {
                const parts = dateNaiss.split('/');
                if (parts.length === 3) {
                  formattedDate = `${parts[2]}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`;
                } else {
                  formattedDate = dateNaiss;
                }
              }

              const mutLow = String(mutuelleVal).trim().toLowerCase();
              const hasMutuelleInCsv =
                Boolean(mutLow) &&
                !['non', 'no', 'aucune', 'sans', 'sans mutuelle', '0', 'false'].includes(mutLow);
              const orgInCsv =
                hasMutuelleInCsv && !['oui', 'yes', '1', 'true', 'mutualiste'].includes(mutLow)
                  ? String(mutuelleVal).trim()
                  : '';
              const cleanClubCsv = String(clubVal || '').trim();

              const finalAtcd =
                mutLow || cleanClubCsv
                  ? serializeAtcdWithMutuelle(atcdRaw, hasMutuelleInCsv, orgInCsv, cleanClubCsv)
                  : atcdRaw || null;

              return {
                nom: nomVal,
                prenom: prenomVal,
                telephone: telVal,
                email: emailVal,
                pathologie: pathologieVal,
                date_naissance: formattedDate,
                adresse: adresseVal,
                atcd: finalAtcd,
              };
            })
            .filter((p) => p.nom !== 'Inconnu' || p.prenom !== 'Inconnu');

          if (validPatients.length === 0) {
            throw new Error(
              'Aucun patient valide trouvé dans le fichier. Veuillez vérifier le format (colonnes : Nom, Prénom, Téléphone, Email...).'
            );
          }

          const { error: insertError } = await supabase.from('patients').insert(validPatients);
          if (insertError) throw insertError;

          setSuccess(`${validPatients.length} patients importés avec succès !`);
          fetchPatients();
        } catch (err: any) {
          setError(`Erreur d'importation : ${err.message}`);
        } finally {
          setImportLoading(false);
          if (fileInputRef.current) {
            fileInputRef.current.value = '';
          }
        }
      },
      error: (err) => {
        setError('Erreur de lecture du fichier CSV : ' + err.message);
        setImportLoading(false);
        if (fileInputRef.current) fileInputRef.current.value = '';
      },
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setSuccess(null);

    try {
      const chosenClub =
        selectedFormClub === '__new__' ? customFormClub.trim() : selectedFormClub.trim();

      if (selectedFormClub === '__new__' && chosenClub) {
        await upsertPartnerClub(supabase, {
          name: chosenClub,
          sport: 'Omnisports',
          tarifConvention: null,
          note: '',
        });
      }

      const serializedAtcd = serializeAtcdWithMutuelle(
        atcd,
        isMutualiste,
        isMutualiste ? organismeMutuelle : '',
        chosenClub
      );

      const { error: insertError } = await supabase.from('patients').insert([
        {
          nom,
          prenom,
          telephone: tel,
          email,
          date_naissance: dateNaissance || null,
          cin,
          adresse,
          pathologie,
          nombre_seances: canEditSessionCount && nombreSeances ? parseInt(nombreSeances, 10) : null,
          atcd: serializedAtcd,
        },
      ]);

      if (insertError) {
        setError(`Erreur d'ajout : ${insertError.message}`);
      } else {
        setSuccess('Patient ajouté avec succès !');
        setNom('');
        setPrenom('');
        setTel('');
        setEmail('');
        setDateNaissance('');
        setCin('');
        setAdresse('');
        setPathologie('');
        setNombreSeances('');
        setAtcd('');
        setIsMutualiste(false);
        setOrganismeMutuelle('CNOPS');
        setSelectedFormClub('');
        setCustomFormClub('');
        fetchPatients();

        setTimeout(() => setSuccess(null), 3000);
      }
    } catch (err: any) {
      setError(`Erreur : ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleOpenMutuelleModal = (patient: Patient, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const info = parsePatientMutuelle(patient, mutuelleBillingIds);
    setPatientForMutuelle(patient);
    setModalIsMutualiste(info.isMutualiste);
    setModalOrganisme(info.organisme || 'CNOPS');
    setModalClubSelect(info.club || '');
    setModalCustomClub('');
    setIsMutuelleModalOpen(true);
  };

  const handleOpenSeancesModal = (patient: Patient, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!canEditSessionCount) return;
    const activeTr = treatments.find(
      (t) => t.patient_id === patient.id && t.statut === 'En cours'
    );
    const currentPrescribed =
      activeTr?.nombre_seances_prescrites || patient.nombre_seances || 0;
    setPatientForSeances(patient);
    setSeancesModalValue(String(currentPrescribed));
  };

  const handleSaveQuickSeances = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canEditSessionCount || !patientForSeances) return;

    const parsed = Math.max(0, parseInt(seancesModalValue, 10) || 0);
    setSavingSeancesModal(true);
    setError(null);
    try {
      const { error: updErr } = await supabase
        .from('patients')
        .update({ nombre_seances: parsed })
        .eq('id', patientForSeances.id);
      if (updErr) throw updErr;

      const patTrs = treatments.filter((t) => t.patient_id === patientForSeances.id);
      const activeTr =
        patTrs.find((t) => t.statut === 'En cours') ||
        (patTrs.length === 1 ? patTrs[0] : null);

      if (activeTr?.id) {
        const { error: trErr } = await supabase
          .from('treatments')
          .update({ nombre_seances_prescrites: parsed })
          .eq('id', activeTr.id);
        if (!trErr) {
          setTreatments((prev) =>
            prev.map((t) =>
              t.id === activeTr.id ? { ...t, nombre_seances_prescrites: parsed } : t
            )
          );
        }
      }

      setPatients((prev) =>
        prev.map((p) =>
          p.id === patientForSeances.id ? { ...p, nombre_seances: parsed } : p
        )
      );
      setPatientForSeances(null);
    } catch (err: any) {
      setError(`Erreur lors de la mise à jour des séances : ${err.message}`);
    } finally {
      setSavingSeancesModal(false);
    }
  };

  const handleSaveQuickMutuelle = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!patientForMutuelle) return;

    setSavingMutuelle(true);
    try {
      const chosenClub =
        modalClubSelect === '__new__' ? modalCustomClub.trim() : modalClubSelect.trim();

      if (modalClubSelect === '__new__' && chosenClub) {
        await upsertPartnerClub(supabase, {
          name: chosenClub,
          sport: 'Omnisports',
          tarifConvention: null,
          note: '',
        });
      }

      const info = parsePatientMutuelle(patientForMutuelle, mutuelleBillingIds);
      const updatedAtcd = serializeAtcdWithMutuelle(
        info.cleanAtcd,
        modalIsMutualiste,
        modalIsMutualiste ? modalOrganisme : '',
        chosenClub
      );

      const { error: updErr } = await supabase
        .from('patients')
        .update({ atcd: updatedAtcd })
        .eq('id', patientForMutuelle.id);

      if (updErr) throw updErr;

      await fetchPatients();
      setIsMutuelleModalOpen(false);
      setPatientForMutuelle(null);
    } catch (err: any) {
      setError(`Impossible de mettre à jour le patient : ${err.message}`);
    } finally {
      setSavingMutuelle(false);
    }
  };

  const handleDeletePatient = async () => {
    if (!patientToDelete) return;
    setDeleteLoading(true);
    setError(null);
    setSuccess(null);
    try {
      await supabase.from('billings').delete().eq('patient_id', patientToDelete.id);
      await supabase.from('appointments').delete().eq('patient_id', patientToDelete.id);
      await supabase.from('treatments').delete().eq('patient_id', patientToDelete.id);

      const { error: deleteError } = await supabase
        .from('patients')
        .delete()
        .eq('id', patientToDelete.id);

      if (deleteError) throw deleteError;

      setSuccess(`Le patient ${patientToDelete.nom} ${patientToDelete.prenom} a été supprimé avec succès.`);
      setIsDeleteModalOpen(false);
      setPatientToDelete(null);
      fetchPatients();

      setTimeout(() => setSuccess(null), 3000);
    } catch (err: any) {
      setError(`Erreur lors de la suppression : ${err.message}`);
    } finally {
      setDeleteLoading(false);
    }
  };

  const getPatientAlertBadge = (patientItem: Patient) => {
    const pAppts = appointments.filter((a) => a.patient_id === patientItem.id);
    const completedAppts = pAppts.filter(
      (a) => a.statut === 'Effectué' || a.statut === 'Impayé'
    );

    const nowLocalDate = getMoroccoNow();
    const upcomingAppts = pAppts.filter((a) => {
      const apptDate = parseClinicDate(a.date_heure);
      return apptDate >= nowLocalDate;
    });

    const completedCount = completedAppts.length;
    const hasUpcoming = upcomingAppts.length > 0;

    let lastApptDate: Date | null = null;
    if (completedAppts.length > 0) {
      const sortedCompleted = [...completedAppts].sort(
        (a, b) => parseClinicDate(b.date_heure).getTime() - parseClinicDate(a.date_heure).getTime()
      );
      lastApptDate = parseClinicDate(sortedCompleted[0].date_heure);
    } else if (pAppts.length > 0) {
      const pastAppts = pAppts.filter((a) => parseClinicDate(a.date_heure) < nowLocalDate);
      if (pastAppts.length > 0) {
        const sortedPast = [...pastAppts].sort(
          (a, b) => parseClinicDate(b.date_heure).getTime() - parseClinicDate(a.date_heure).getTime()
        );
        lastApptDate = parseClinicDate(sortedPast[0].date_heure);
      }
    }

    let prescribed = patientItem.nombre_seances || 0;
    const activeTreats = treatments.filter(
      (t) => t.patient_id === patientItem.id && t.statut === 'En cours'
    );
    if (activeTreats.length > 0) {
      prescribed = activeTreats[0].nombre_seances_prescrites || prescribed;
    }

    if (prescribed > 0 && completedCount < prescribed && !hasUpcoming) {
      return {
        text: `Incomplet (${completedCount}/${prescribed})`,
        tooltip: `${completedCount} séance(s) sur ${prescribed} réalisées, sans prochain RDV`,
        className: 'bg-amber-50 text-amber-700 border-amber-200',
      };
    } else if (lastApptDate && !hasUpcoming) {
      const diffMs = nowLocalDate.getTime() - lastApptDate.getTime();
      const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
      if (diffDays >= 14) {
        return {
          text: `Inactif (${diffDays}j)`,
          tooltip: `Aucune séance depuis ${diffDays} jours, sans prochain RDV`,
          className: 'bg-rose-50 text-rose-700 border-rose-200',
        };
      }
    }

    return null;
  };

  // Counts for Mutuelle & Club filter pills
  const statsCounts = useMemo(() => {
    let mutualistes = 0;
    let nonMutualistes = 0;
    let clubAthletes = 0;
    const perClub = new Map<string, number>();

    for (const c of partnerClubs) {
      perClub.set(c.name, 0);
    }

    for (const p of patients) {
      const info = parsePatientMutuelle(p, mutuelleBillingIds);
      if (info.isMutualiste) {
        mutualistes++;
      } else {
        nonMutualistes++;
      }
      if (info.club) {
        clubAthletes++;
        perClub.set(info.club, (perClub.get(info.club) || 0) + 1);
      }
    }

    return {
      total: patients.length,
      mutualistes,
      nonMutualistes,
      clubAthletes,
      particuliers: patients.length - clubAthletes,
      perClub,
    };
  }, [patients, mutuelleBillingIds, partnerClubs]);

  const filteredPatients = patients.filter((p) => {
    const nomStr = (p.prenom ? `${p.nom || ''} ${p.prenom}` : p.nom || '').toLowerCase();
    const revStr = `${p.prenom || ''} ${p.nom || ''}`.toLowerCase();
    const telStr = (p.telephone || '').toLowerCase();
    const cinStr = (p.cin || '').toLowerCase();
    const queryStr = searchQuery.trim().toLowerCase();

    const mutInfo = parsePatientMutuelle(p, mutuelleBillingIds);

    const matchQuery =
      !queryStr ||
      nomStr.includes(queryStr) ||
      revStr.includes(queryStr) ||
      telStr.includes(queryStr) ||
      cinStr.includes(queryStr) ||
      (mutInfo.organisme && mutInfo.organisme.toLowerCase().includes(queryStr)) ||
      (mutInfo.club && mutInfo.club.toLowerCase().includes(queryStr));

    const matchMutuelle =
      mutuelleFilter === 'all'
        ? true
        : mutuelleFilter === 'mutualiste'
        ? mutInfo.isMutualiste
        : !mutInfo.isMutualiste;

    const matchOrganisme =
      organismeFilter === 'all'
        ? true
        : mutInfo.isMutualiste &&
          mutInfo.organisme.toLowerCase() === organismeFilter.toLowerCase();

    let matchClub = true;
    if (clubFilter === 'any_club') {
      matchClub = Boolean(mutInfo.club);
    } else if (clubFilter === 'no_club') {
      matchClub = !mutInfo.club;
    } else if (clubFilter.startsWith('club:')) {
      const targetClub = clubFilter.slice('club:'.length).toLowerCase();
      matchClub = Boolean(mutInfo.club) && mutInfo.club.toLowerCase() === targetClub;
    }

    const matchDate = searchDateNaissance ? p.date_naissance === searchDateNaissance : true;
    const matchTel = searchTelephone ? Boolean(p.telephone?.includes(searchTelephone)) : true;
    const matchPatho = searchPathologie
      ? Boolean(p.pathologie?.toLowerCase().includes(searchPathologie.toLowerCase()))
      : true;

    return (
      matchQuery &&
      matchMutuelle &&
      matchOrganisme &&
      matchClub &&
      matchDate &&
      matchTel &&
      matchPatho
    );
  });

  const allFilteredSelected =
    filteredPatients.length > 0 && filteredPatients.every((p) => selectedPatientIds.has(p.id));

  return (
    <div className="space-y-8 max-w-6xl mx-auto">
      {/* Formulaire d'ajout */}
      <Card className="border-primary-100 shadow-sm">
        <CardHeader className="bg-primary-50/50 border-b border-primary-100 pb-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <CardTitle className="flex items-center gap-2 text-primary-700">
            <UserPlus className="h-5 w-5" />
            Nouveau Patient
          </CardTitle>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => {
              setClubModalMessage({ type: '', text: '' });
              setIsClubsModalOpen(true);
            }}
            className="gap-2 bg-white border-indigo-200 text-indigo-700 hover:bg-indigo-50 self-start sm:self-center"
          >
            <Trophy className="h-4 w-4 text-indigo-600" />
            Gérer les clubs conventionnés ({partnerClubs.length})
          </Button>
        </CardHeader>
        <CardContent className="pt-6">
          <form onSubmit={handleSubmit} className="space-y-6">
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
                <label htmlFor="nom" className="block text-sm font-medium text-slate-700">
                  Nom *
                </label>
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
                <label htmlFor="prenom" className="block text-sm font-medium text-slate-700">
                  Prénom *
                </label>
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
                <label htmlFor="dateNaissance" className="block text-sm font-medium text-slate-700">
                  Date de naissance *
                </label>
                <input
                  id="dateNaissance"
                  type="date"
                  required
                  value={dateNaissance}
                  onChange={(e) => setDateNaissance(e.target.value)}
                  className="block w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500/20 transition-all"
                />
              </div>
              <div className="space-y-1.5">
                <label htmlFor="cin" className="block text-sm font-medium text-slate-700">
                  CIN (Facultatif)
                </label>
                <input
                  id="cin"
                  type="text"
                  value={cin}
                  onChange={(e) => setCin(e.target.value)}
                  className="block w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500/20 transition-all"
                  placeholder="Ex: AB123456"
                />
              </div>
              <div className="space-y-1.5">
                <label htmlFor="tel" className="block text-sm font-medium text-slate-700">
                  Téléphone *
                </label>
                <input
                  id="tel"
                  type="tel"
                  required
                  value={tel}
                  onChange={(e) => setTel(e.target.value)}
                  className="block w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500/20 transition-all"
                  placeholder="Ex: 06 12 34 56 78"
                />
              </div>
              <div className="space-y-1.5">
                <label htmlFor="adresse" className="block text-sm font-medium text-slate-700">
                  Adresse *
                </label>
                <input
                  id="adresse"
                  type="text"
                  required
                  value={adresse}
                  onChange={(e) => setAdresse(e.target.value)}
                  className="block w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500/20 transition-all"
                  placeholder="Ex: 123 Rue de la Santé"
                />
              </div>
              <div className="space-y-1.5">
                <label htmlFor="pathologie" className="block text-sm font-medium text-slate-700">
                  Pathologie *
                </label>
                <input
                  id="pathologie"
                  type="text"
                  required
                  value={pathologie}
                  onChange={(e) => setPathologie(e.target.value)}
                  className="block w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500/20 transition-all"
                  placeholder="Ex: Lombalgie chronique"
                />
              </div>
              <div className="space-y-1.5">
                <label htmlFor="nombreSeances" className="block text-sm font-medium text-slate-700">
                  Nombre de séances {canEditSessionCount ? '*' : '(Admin / Secrétariat)'}
                </label>
                {canEditSessionCount ? (
                  <input
                    id="nombreSeances"
                    type="number"
                    min="1"
                    required
                    value={nombreSeances}
                    onChange={(e) => setNombreSeances(e.target.value)}
                    className="block w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500/20 transition-all"
                    placeholder="Ex: 10"
                  />
                ) : (
                  <input
                    id="nombreSeances"
                    type="text"
                    disabled
                    value=""
                    placeholder="Réservé à l'administration & secrétariat"
                    className="block w-full rounded-md border border-slate-200 bg-slate-100 text-slate-500 px-3 py-2 text-sm cursor-not-allowed"
                  />
                )}
              </div>

              {/* Couverture Médicale & Club Sportif Conventionné */}
              <div className="space-y-3 md:col-span-2 grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-2.5">
                  <label className="block text-sm font-semibold text-slate-700">
                    Couverture médicale (Mutuelle)
                  </label>
                  <div className="flex flex-wrap items-center gap-2.5">
                    <div className="inline-flex rounded-lg border border-slate-200 bg-white p-1">
                      <button
                        type="button"
                        onClick={() => setIsMutualiste(false)}
                        className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-all ${
                          !isMutualiste
                            ? 'bg-slate-800 text-white shadow-xs'
                            : 'text-slate-600 hover:text-slate-900'
                        }`}
                      >
                        Non mutualiste
                      </button>
                      <button
                        type="button"
                        onClick={() => setIsMutualiste(true)}
                        className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-all ${
                          isMutualiste
                            ? 'bg-emerald-600 text-white shadow-xs'
                            : 'text-slate-600 hover:text-slate-900'
                        }`}
                      >
                        Mutualiste
                      </button>
                    </div>

                    {isMutualiste && (
                      <select
                        value={organismeMutuelle}
                        onChange={(e) => setOrganismeMutuelle(e.target.value)}
                        className="flex-1 min-w-[140px] rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm focus:border-primary-500 focus:outline-none"
                      >
                        {ORGANISMES_MUTUELLE.map((org) => (
                          <option key={org} value={org}>
                            {org}
                          </option>
                        ))}
                      </select>
                    )}
                  </div>
                </div>

                <div className="p-4 rounded-xl bg-indigo-50/50 border border-indigo-100 space-y-2.5">
                  <label className="block text-sm font-semibold text-indigo-900 flex items-center gap-1.5">
                    <Trophy className="h-4 w-4 text-indigo-600" />
                    Club sportif conventionné (Facultatif)
                  </label>
                  <div className="flex flex-col sm:flex-row gap-2">
                    <select
                      value={selectedFormClub}
                      onChange={(e) => setSelectedFormClub(e.target.value)}
                      className="flex-1 rounded-lg border border-indigo-200 bg-white px-3 py-1.5 text-sm text-slate-800 focus:border-indigo-500 focus:outline-none"
                    >
                      <option value="">Aucun club (Patient particulier)</option>
                      {partnerClubs.map((c) => (
                        <option key={c.name} value={c.name}>
                          {c.name} ({c.sport})
                        </option>
                      ))}
                      <option value="__new__">+ Créer un nouveau club...</option>
                    </select>
                    {selectedFormClub === '__new__' && (
                      <input
                        type="text"
                        value={customFormClub}
                        onChange={(e) => setCustomFormClub(e.target.value)}
                        placeholder="Nom du club..."
                        className="flex-1 rounded-lg border border-indigo-300 bg-white px-3 py-1.5 text-sm focus:border-indigo-500 focus:outline-none"
                      />
                    )}
                  </div>
                </div>
              </div>

              <div className="space-y-1.5 md:col-span-2">
                <label htmlFor="atcd" className="block text-sm font-medium text-slate-700">
                  ATCD personnels médicaux *
                </label>
                <textarea
                  id="atcd"
                  required
                  rows={3}
                  value={atcd}
                  onChange={(e) => setAtcd(e.target.value)}
                  className="block w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500/20 transition-all resize-none"
                  placeholder="Antécédents médicaux, chirurgicaux, allergies..."
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
        <CardHeader className="flex flex-col sm:flex-row sm:items-center justify-between border-b border-slate-100 pb-4 gap-4">
          <CardTitle className="flex items-center gap-2 text-slate-800">
            <Users className="h-5 w-5 text-primary-500" />
            Base de données Patients ({filteredPatients.length})
          </CardTitle>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                setClubModalMessage({ type: '', text: '' });
                setIsClubsModalOpen(true);
              }}
              className="gap-1.5 bg-amber-50 border-amber-200 text-amber-800 hover:bg-amber-100"
            >
              <Trophy className="h-4 w-4 text-amber-600" />
              <span>Clubs ({partnerClubs.length})</span>
            </Button>
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleImportCSV}
              accept=".csv"
              className="hidden"
            />
            <Button
              variant="outline"
              size="sm"
              className="gap-2 bg-indigo-50 border-indigo-200 text-indigo-700 hover:bg-indigo-100 hover:text-indigo-800"
              onClick={() => fileInputRef.current?.click()}
              disabled={importLoading || fetching}
            >
              <Upload className={`h-4 w-4 ${importLoading ? 'animate-bounce' : ''}`} />
              <span className="hidden sm:inline">
                {importLoading ? 'Import en cours...' : 'Importer CSV'}
              </span>
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowAdvancedSearch(!showAdvancedSearch)}
              className={`gap-2 ${showAdvancedSearch ? 'bg-slate-100' : ''}`}
            >
              <Filter className="h-4 w-4" />
              <span className="hidden sm:inline">Filtres</span>
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={fetchPatients}
              disabled={fetching || importLoading}
              className="gap-2"
            >
              <RefreshCw className={`h-4 w-4 ${fetching ? 'animate-spin' : ''}`} />
              <span className="hidden sm:inline">Actualiser</span>
            </Button>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="p-4 border-b border-slate-100 bg-slate-50/50 space-y-4">
            {/* Search input */}
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <Search className="h-4 w-4 text-slate-400" />
              </div>
              <input
                type="text"
                placeholder="Rechercher par nom, prénom, téléphone, CIN, mutuelle ou club sportif..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="block w-full rounded-md border border-slate-300 bg-white pl-10 pr-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500/20"
              />
            </div>

            {/* Row 1: Mutuelle Filter */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setMutuelleFilter('all');
                    setOrganismeFilter('all');
                  }}
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors ${
                    mutuelleFilter === 'all'
                      ? 'bg-slate-900 text-white border-slate-900'
                      : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-100'
                  }`}
                >
                  Tous
                  <span
                    className={`px-1.5 py-0.5 rounded text-[11px] font-bold ${
                      mutuelleFilter === 'all'
                        ? 'bg-white/20 text-white'
                        : 'bg-slate-100 text-slate-700'
                    }`}
                  >
                    {statsCounts.total}
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => setMutuelleFilter('mutualiste')}
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors ${
                    mutuelleFilter === 'mutualiste'
                      ? 'bg-emerald-600 text-white border-emerald-600'
                      : 'bg-white text-emerald-700 border-emerald-200 hover:bg-emerald-50'
                  }`}
                >
                  <ShieldCheck className="h-3.5 w-3.5" />
                  Mutualistes
                  <span
                    className={`px-1.5 py-0.5 rounded text-[11px] font-bold ${
                      mutuelleFilter === 'mutualiste'
                        ? 'bg-white/20 text-white'
                        : 'bg-emerald-50 text-emerald-800'
                    }`}
                  >
                    {statsCounts.mutualistes}
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setMutuelleFilter('non_mutualiste');
                    setOrganismeFilter('all');
                  }}
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors ${
                    mutuelleFilter === 'non_mutualiste'
                      ? 'bg-slate-700 text-white border-slate-700'
                      : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-100'
                  }`}
                >
                  <ShieldOff className="h-3.5 w-3.5" />
                  Non mutualistes
                  <span
                    className={`px-1.5 py-0.5 rounded text-[11px] font-bold ${
                      mutuelleFilter === 'non_mutualiste'
                        ? 'bg-white/20 text-white'
                        : 'bg-slate-100 text-slate-700'
                    }`}
                  >
                    {statsCounts.nonMutualistes}
                  </span>
                </button>

                {mutuelleFilter === 'mutualiste' && (
                  <select
                    value={organismeFilter}
                    onChange={(e) => setOrganismeFilter(e.target.value)}
                    className="rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 focus:border-primary-500 focus:outline-none"
                  >
                    <option value="all">Toutes les mutuelles</option>
                    {ORGANISMES_MUTUELLE.map((org) => (
                      <option key={org} value={org}>
                        {org}
                      </option>
                    ))}
                  </select>
                )}
              </div>

              {/* Row 1 Right: Clubs Sportifs Conventionnés Filter */}
              <div className="flex flex-wrap items-center gap-2">
                <Trophy className="h-4 w-4 text-indigo-600 hidden sm:inline" />
                <select
                  value={clubFilter}
                  onChange={(e) => setClubFilter(e.target.value)}
                  className={`rounded-lg border px-3 py-1.5 text-xs font-semibold focus:outline-none transition-colors ${
                    clubFilter !== 'all'
                      ? 'bg-indigo-600 text-white border-indigo-600'
                      : 'bg-white text-slate-700 border-slate-300 hover:border-indigo-300'
                  }`}
                >
                  <option value="all" className="bg-white text-slate-800">
                    Clubs : Tous ({statsCounts.total})
                  </option>
                  <option value="any_club" className="bg-white text-slate-800">
                    Tous les clubs conventionnés ({statsCounts.clubAthletes})
                  </option>
                  <option value="no_club" className="bg-white text-slate-800">
                    Patients hors club ({statsCounts.particuliers})
                  </option>
                  {partnerClubs.map((c) => (
                    <option key={c.name} value={`club:${c.name}`} className="bg-white text-slate-800">
                      Club : {c.name} ({statsCounts.perClub.get(c.name) || 0})
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Active Partner Clubs Quick Chips */}
            {partnerClubs.length > 0 && (
              <div className="flex flex-wrap items-center gap-2 pt-1">
                <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                  Clubs :
                </span>
                {partnerClubs.map((club) => {
                  const isSelected = clubFilter === `club:${club.name}`;
                  const count = statsCounts.perClub.get(club.name) || 0;
                  return (
                    <button
                      key={club.name}
                      type="button"
                      onClick={() => setClubFilter(isSelected ? 'all' : `club:${club.name}`)}
                      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold border transition-colors ${
                        isSelected
                          ? 'bg-indigo-600 text-white border-indigo-600'
                          : 'bg-indigo-50/70 text-indigo-800 border-indigo-200 hover:bg-indigo-100'
                      }`}
                    >
                      <Trophy className="h-3 w-3" />
                      <span>{club.name}</span>
                      <span
                        className={`px-1.5 py-0.2 rounded text-[10px] font-bold ${
                          isSelected ? 'bg-white/20 text-white' : 'bg-white text-indigo-700'
                        }`}
                      >
                        {count}
                      </span>
                    </button>
                  );
                })}
              </div>
            )}

            {showAdvancedSearch && (
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-2 border-t border-slate-200/70">
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-slate-600">Date de naissance</label>
                  <input
                    type="date"
                    value={searchDateNaissance}
                    onChange={(e) => setSearchDateNaissance(e.target.value)}
                    className="block w-full rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500/20"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-slate-600">Téléphone</label>
                  <input
                    type="tel"
                    placeholder="Ex: 06..."
                    value={searchTelephone}
                    onChange={(e) => setSearchTelephone(e.target.value)}
                    className="block w-full rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500/20"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-slate-600">Pathologie</label>
                  <input
                    type="text"
                    placeholder="Ex: Lombalgie..."
                    value={searchPathologie}
                    onChange={(e) => setSearchPathologie(e.target.value)}
                    className="block w-full rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500/20"
                  />
                </div>
              </div>
            )}
          </div>

          {/* Bulk Club Grouping Bar when 1+ patients selected */}
          {selectedPatientIds.size > 0 && (
            <div className="px-4 py-3 bg-indigo-900 text-white flex flex-col lg:flex-row lg:items-center justify-between gap-3">
              <div className="flex items-center gap-2.5 text-sm font-semibold">
                <Trophy className="h-4 w-4 text-amber-400 flex-shrink-0" />
                <span>
                  {selectedPatientIds.size} patient(s) sélectionné(s) — Regrouper dans un club sportif :
                </span>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <select
                  value={bulkClubChoice}
                  onChange={(e) => setBulkClubChoice(e.target.value)}
                  className="rounded-lg bg-white text-slate-900 px-3 py-1.5 text-xs font-semibold outline-none"
                >
                  <option value="">Choisir un club...</option>
                  {partnerClubs.map((c) => (
                    <option key={c.name} value={c.name}>
                      {c.name} ({c.sport})
                    </option>
                  ))}
                  <option value="__new__">+ Nouveau club...</option>
                </select>

                {bulkClubChoice === '__new__' && (
                  <input
                    type="text"
                    value={bulkNewClubName}
                    onChange={(e) => setBulkNewClubName(e.target.value)}
                    placeholder="Nom du club sportif..."
                    className="rounded-lg bg-white text-slate-900 px-3 py-1.5 text-xs font-medium outline-none"
                  />
                )}

                <Button
                  type="button"
                  size="sm"
                  disabled={bulkAssignLoading}
                  onClick={() => handleBulkAssignClub(false)}
                  className="bg-emerald-500 hover:bg-emerald-600 text-white text-xs h-8 font-bold"
                >
                  {bulkAssignLoading ? 'Enregistrement...' : 'Affecter au club'}
                </Button>

                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={bulkAssignLoading}
                  onClick={() => handleBulkAssignClub(true)}
                  className="bg-white/10 border-white/20 text-white hover:bg-white/20 text-xs h-8"
                >
                  Retirer du club
                </Button>

                <button
                  type="button"
                  onClick={() => setSelectedPatientIds(new Set())}
                  className="p-1.5 rounded-lg text-white/70 hover:text-white hover:bg-white/10"
                  title="Désélectionner tout"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>
          )}

          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead className="text-xs text-slate-500 uppercase bg-slate-50 border-b border-slate-200">
                <tr>
                  <th className="pl-4 pr-2 py-4 w-10">
                    <button
                      type="button"
                      onClick={handleToggleSelectAllFiltered}
                      className="text-slate-400 hover:text-indigo-600 flex items-center"
                      title="Tout sélectionner pour regrouper dans un club"
                    >
                      {allFilteredSelected ? (
                        <CheckSquare className="h-4 w-4 text-indigo-600" />
                      ) : (
                        <Square className="h-4 w-4" />
                      )}
                    </button>
                  </th>
                  <th className="px-4 py-4 font-medium">Patient</th>
                  <th className="px-4 py-4 font-medium">Contact</th>
                  <th className="px-4 py-4 font-medium">Club & Mutuelle</th>
                  <th className="px-4 py-4 font-medium">Accès Portail</th>
                  <th className="px-4 py-4 font-medium">Détails Médicaux</th>
                  <th className="px-4 py-4 font-medium">Date d'ajout</th>
                  <th className="px-4 py-4 font-medium text-right font-semibold">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredPatients.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="px-6 py-8 text-center text-slate-500">
                      {fetching ? 'Chargement des patients...' : 'Aucun patient correspondant à ce filtre.'}
                    </td>
                  </tr>
                ) : (
                  filteredPatients.map((patient) => {
                    const alertBadge = getPatientAlertBadge(patient);
                    const mutInfo = parsePatientMutuelle(patient, mutuelleBillingIds);
                    const isChecked = selectedPatientIds.has(patient.id);

                    return (
                      <tr
                        key={patient.id}
                        className={`transition-colors ${
                          isChecked ? 'bg-indigo-50/50' : 'bg-white hover:bg-slate-50'
                        } ${onSelectPatient ? 'cursor-pointer' : ''}`}
                        onClick={() => onSelectPatient && onSelectPatient(patient.id)}
                      >
                        <td
                          className="pl-4 pr-2 py-4"
                          onClick={(e) => handleToggleSelectPatient(patient.id, e)}
                        >
                          {isChecked ? (
                            <CheckSquare className="h-4 w-4 text-indigo-600" />
                          ) : (
                            <Square className="h-4 w-4 text-slate-300 hover:text-slate-500" />
                          )}
                        </td>
                        <td className="px-4 py-4">
                          <div className="flex items-center gap-3">
                            <div className="h-9 w-9 rounded-full bg-primary-100 flex items-center justify-center text-primary-700 font-bold text-sm flex-shrink-0">
                              {patient.prenom?.[0]}
                              {patient.nom?.[0]}
                            </div>
                            <div>
                              <div className="flex flex-wrap items-center gap-1.5">
                                <PatientNameLink
                                  patientId={patient.id}
                                  name={`${patient.nom} ${patient.prenom}`}
                                  fromRoute="patients"
                                  onBeforeNavigate={() => {
                                    if (onSelectPatient) onSelectPatient(patient.id);
                                  }}
                                  className="font-semibold text-slate-900"
                                />
                                {alertBadge && (
                                  <span
                                    className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold border ${alertBadge.className}`}
                                    title={alertBadge.tooltip}
                                  >
                                    {alertBadge.text}
                                  </span>
                                )}
                              </div>
                              {patient.cin && (
                                <div className="text-xs text-slate-500">CIN: {patient.cin}</div>
                              )}
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-4">
                          <div className="space-y-1">
                            {patient.telephone && (
                              <div className="flex items-center gap-2 text-slate-600">
                                <Phone className="h-3 w-3" /> {patient.telephone}
                              </div>
                            )}
                            {patient.adresse && (
                              <div
                                className="text-xs text-slate-500 truncate max-w-[140px]"
                                title={patient.adresse}
                              >
                                {patient.adresse}
                              </div>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-4" onClick={(e) => e.stopPropagation()}>
                          <div className="flex flex-col items-start gap-1.5">
                            {mutInfo.club ? (
                              <button
                                type="button"
                                onClick={(e) => handleOpenMutuelleModal(patient, e)}
                                title="Modifier le club sportif ou la mutuelle"
                                className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-lg text-xs font-bold bg-indigo-50 text-indigo-700 border border-indigo-200 hover:bg-indigo-100 transition-colors"
                              >
                                <Trophy className="h-3 w-3 text-indigo-600" />
                                <span>{mutInfo.club}</span>
                              </button>
                            ) : (
                              <button
                                type="button"
                                onClick={(e) => handleOpenMutuelleModal(patient, e)}
                                title="Affecter ce patient à un club sportif conventionné"
                                className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium text-indigo-600 hover:bg-indigo-50 border border-dashed border-indigo-200 transition-colors"
                              >
                                <Plus className="h-3 w-3" />
                                <span>Club</span>
                              </button>
                            )}

                            <button
                              type="button"
                              onClick={(e) => handleOpenMutuelleModal(patient, e)}
                              title="Modifier le statut mutuelle"
                              className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-lg text-xs font-semibold border transition-colors ${
                                mutInfo.isMutualiste
                                  ? 'bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100'
                                  : 'bg-slate-100 text-slate-600 border-slate-200 hover:bg-slate-200'
                              }`}
                            >
                              {mutInfo.isMutualiste ? (
                                <>
                                  <ShieldCheck className="h-3 w-3 text-emerald-600" />
                                  <span>
                                    {mutInfo.organisme && mutInfo.organisme !== 'Mutuelle'
                                      ? mutInfo.organisme
                                      : 'Mutualiste'}
                                  </span>
                                </>
                              ) : (
                                <>
                                  <ShieldOff className="h-3 w-3 text-slate-400" />
                                  <span>Non mutualiste</span>
                                </>
                              )}
                            </button>
                          </div>
                        </td>
                        <td className="px-4 py-4">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              openQuickAccessModal(patient);
                            }}
                            title="Cliquer pour générer ou réinitialiser le mot de passe patient"
                            className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold border transition-all cursor-pointer ${
                              (patient as any).has_access
                                ? 'bg-mint-50 text-mint-700 border-mint-200 hover:bg-mint-100'
                                : 'bg-amber-50 text-amber-700 border-amber-200 hover:bg-amber-100'
                            }`}
                          >
                            {(patient as any).has_access ? (
                              <>
                                <CheckCircle2 className="h-3 w-3" /> Actif
                              </>
                            ) : (
                              <>
                                <Lock className="h-3 w-3" /> Non généré
                              </>
                            )}
                          </button>
                        </td>
                        <td className="px-4 py-4">
                          <div className="space-y-1">
                            {patient.pathologie ? (
                              <div
                                className="text-sm font-medium text-slate-700 truncate max-w-[140px]"
                                title={patient.pathologie}
                              >
                                {patient.pathologie}
                              </div>
                            ) : (
                              <span className="text-slate-400 italic text-xs">Non renseigné</span>
                            )}
                            {(() => {
                              const doneCount = appointments.filter(
                                (a) =>
                                  a.patient_id === patient.id &&
                                  (a.statut === 'Effectué' || a.statut === 'Impayé')
                              ).length;
                              const activeTr = treatments.find(
                                (t) => t.patient_id === patient.id && t.statut === 'En cours'
                              );
                              const prescribed =
                                activeTr?.nombre_seances_prescrites ||
                                patient.nombre_seances ||
                                0;

                              return canEditSessionCount ? (
                                <button
                                  type="button"
                                  onClick={(e) => handleOpenSeancesModal(patient, e)}
                                  title="Modifier le nombre de séances prescrites"
                                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-slate-50 hover:bg-primary-50 border border-slate-200 hover:border-primary-200 text-xs font-semibold text-slate-700 hover:text-primary-700 transition-colors cursor-pointer tabular-nums"
                                >
                                  <span>
                                    {prescribed > 0
                                      ? `${doneCount}/${prescribed} séance(s)`
                                      : doneCount > 0
                                      ? `${doneCount} réalisée(s) • Fixer total`
                                      : '+ Fixer séances'}
                                  </span>
                                  <Edit2 className="h-2.5 w-2.5 opacity-70" />
                                </button>
                              ) : prescribed > 0 || doneCount > 0 ? (
                                <span className="inline-flex items-center px-2 py-0.5 rounded-md bg-slate-50 border border-slate-200 text-xs font-semibold text-slate-600 tabular-nums">
                                  {prescribed > 0
                                    ? `${doneCount}/${prescribed} séance(s)`
                                    : `${doneCount} séance(s)`}
                                </span>
                              ) : null;
                            })()}
                            {(() => {
                              const fus = (patient as any).follow_up_status;
                              let score: number | null = null;
                              let dateStr = '';
                              let noteStr = '';

                              if (fus && String(fus).startsWith('PAIN:')) {
                                const parts = String(fus).replace('PAIN:', '').split('|');
                                score = parseInt(parts[0], 10);
                                dateStr = parts[1] || '';
                                noteStr = parts[2] || '';
                              } else if ((patient as any).notes_antecedents) {
                                try {
                                  const parsed = typeof (patient as any).notes_antecedents === 'string'
                                    ? JSON.parse((patient as any).notes_antecedents)
                                    : (patient as any).notes_antecedents;
                                  if (parsed && Array.isArray(parsed.painLogs) && parsed.painLogs.length > 0) {
                                    score = Number(parsed.painLogs[0].score);
                                    dateStr = parsed.painLogs[0].date?.split('T')[0] || '';
                                    noteStr = parsed.painLogs[0].note || '';
                                  }
                                } catch {}
                              }

                              if (score === null || isNaN(score)) return null;

                              const todayStr = getMoroccoTodayStr();
                              const isToday = dateStr === todayStr;
                              const isYesterday = (() => {
                                const y = new Date();
                                y.setDate(y.getDate() - 1);
                                return dateStr === y.toISOString().split('T')[0];
                              })();

                              const timeLabel = isToday ? "Aujourd'hui" : isYesterday ? "Hier" : dateStr ? new Date(dateStr).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' }) : '';

                              const colorCls =
                                score <= 2
                                  ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                  : score <= 4
                                  ? 'bg-lime-50 text-lime-700 border-lime-200'
                                  : score <= 6
                                  ? 'bg-amber-50 text-amber-700 border-amber-200'
                                  : score <= 8
                                  ? 'bg-orange-50 text-orange-700 border-orange-200'
                                  : 'bg-rose-50 text-rose-700 border-rose-200';

                              return (
                                <div
                                  className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-bold border ${colorCls} shadow-2xs`}
                                  title={`Douleur EVA : ${score}/10 (${dateStr})${noteStr ? ' — ' + noteStr : ''}`}
                                >
                                  <span>EVA : {score}/10</span>
                                  {timeLabel && <span className="opacity-75 font-medium">({timeLabel})</span>}
                                </div>
                              );
                            })()}
                          </div>
                        </td>
                        <td className="px-4 py-4 text-slate-500">
                          {new Date(patient.created_at).toLocaleDateString('fr-FR', {
                            day: '2-digit',
                            month: 'short',
                            year: 'numeric',
                          })}
                        </td>
                        <td className="px-4 py-4 text-right" onClick={(e) => e.stopPropagation()}>
                          <div className="inline-flex items-center justify-end gap-1">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                if (onSelectPatient) {
                                  onSelectPatient(patient.id);
                                } else {
                                  openPatientDossier(patient.id, 'patients');
                                }
                              }}
                              className="text-primary-600 hover:text-primary-700 hover:bg-primary-50 h-8 px-2.5 text-xs font-semibold rounded-lg gap-1"
                              title="Ouvrir le dossier du patient"
                            >
                              <FolderOpen className="h-3.5 w-3.5" />
                              <span className="hidden xl:inline">Dossier</span>
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                setPatientToDelete(patient);
                                setIsDeleteModalOpen(true);
                              }}
                              className="text-rose-500 hover:text-rose-700 hover:bg-rose-50 h-8 w-8 p-0 rounded-full"
                              title="Supprimer le patient"
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Modal : Gérer les Clubs Sportifs Conventionnés */}
      <Modal
        isOpen={isClubsModalOpen}
        onClose={() => {
          if (!clubSaving) setIsClubsModalOpen(false);
        }}
        title="Clubs sportifs conventionnés"
      >
        <div className="space-y-5">
          <p className="text-xs text-slate-500 leading-relaxed">
            Ajoutez vos clubs partenaires pour y regrouper vos athlètes et suivre automatiquement leur comptabilité dans l'onglet <strong>Finance → Clubs Conventionnés</strong>.
          </p>

          {clubModalMessage.text && (
            <div
              className={`p-3 rounded-xl text-sm flex items-center gap-2 ${
                clubModalMessage.type === 'error'
                  ? 'bg-rose-50 text-rose-700 border border-rose-200'
                  : 'bg-emerald-50 text-emerald-700 border border-emerald-200'
              }`}
            >
              {clubModalMessage.type === 'error' ? (
                <AlertCircle className="h-4 w-4 flex-shrink-0" />
              ) : (
                <CheckCircle2 className="h-4 w-4 flex-shrink-0" />
              )}
              <span>{clubModalMessage.text}</span>
            </div>
          )}

          <form onSubmit={handleAddPartnerClub} className="space-y-3 p-4 rounded-xl bg-slate-50 border border-slate-200">
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-600">
              Nouveau club conventionné
            </h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-700">Nom du club *</label>
                <input
                  type="text"
                  required
                  value={newClubForm.name}
                  onChange={(e) => setNewClubForm({ ...newClubForm, name: e.target.value })}
                  placeholder="Ex: HUSA Agadir"
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:border-indigo-500 outline-none"
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-700">Discipline</label>
                <select
                  value={newClubForm.sport}
                  onChange={(e) => setNewClubForm({ ...newClubForm, sport: e.target.value })}
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:border-indigo-500 outline-none"
                >
                  {SPORTS_DISCIPLINES.map((sp) => (
                    <option key={sp} value={sp}>
                      {sp}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-700">
                  Tarif séance conventionné (DH)
                </label>
                <input
                  type="number"
                  min="0"
                  value={newClubForm.tarifConvention}
                  onChange={(e) => setNewClubForm({ ...newClubForm, tarifConvention: e.target.value })}
                  placeholder="Ex: 150"
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:border-indigo-500 outline-none"
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-700">Note / Contact</label>
                <input
                  type="text"
                  value={newClubForm.note}
                  onChange={(e) => setNewClubForm({ ...newClubForm, note: e.target.value })}
                  placeholder="Ex: Facturation mensuelle"
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:border-indigo-500 outline-none"
                />
              </div>
            </div>
            <div className="flex justify-end pt-1">
              <Button type="submit" size="sm" disabled={clubSaving} className="gap-1.5">
                <Plus className="h-4 w-4" />
                {clubSaving ? 'Ajout...' : 'Ajouter le club'}
              </Button>
            </div>
          </form>

          <div className="space-y-2 max-h-60 overflow-y-auto">
            {partnerClubs.length === 0 ? (
              <p className="text-center text-sm text-slate-500 py-4">
                Aucun club enregistré pour le moment.
              </p>
            ) : (
              partnerClubs.map((club) => {
                const count = statsCounts.perClub.get(club.name) || 0;
                const clubMembers = patients.filter(
                  (p) =>
                    (parsePatientMutuelle(p, mutuelleBillingIds).club || '').toLowerCase() ===
                    club.name.toLowerCase()
                );
                return (
                  <div
                    key={club.name}
                    className="p-3 rounded-xl border border-slate-200 bg-white space-y-2"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <Trophy className="h-4 w-4 text-indigo-600" />
                          <span className="font-bold text-sm text-slate-900">{club.name}</span>
                          <span className="text-[11px] font-semibold bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full">
                            {club.sport}
                          </span>
                          {club.hasAccess && (
                            <span className="inline-flex items-center gap-1 text-[11px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200 px-2 py-0.5 rounded-full">
                              <CheckCircle2 className="h-3 w-3" />
                              Accès actif{club.loginId ? ` (${club.loginId})` : ''}
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-slate-500 mt-0.5">
                          {count} patient(s) affilié(s)
                          {club.tarifConvention ? ` • Tarif : ${club.tarifConvention} DH/séance` : ''}
                          {club.note ? ` • ${club.note}` : ''}
                        </p>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => setClubForAccessModal(club)}
                          className={`h-8 text-xs gap-1 ${
                            club.hasAccess
                              ? 'border-indigo-200 text-indigo-700 bg-indigo-50/50 hover:bg-indigo-100/60'
                              : 'border-slate-200 text-slate-700'
                          }`}
                          title="Créer ou modifier l'accès portail de ce club"
                        >
                          <Key className="h-3.5 w-3.5" />
                          {club.hasAccess ? 'Gérer accès' : 'Accès Club'}
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            setIsClubsModalOpen(false);
                            openClubPortalPreview(club.name, 'patients');
                          }}
                          className="h-8 text-xs gap-1 border-slate-200 text-slate-700"
                          title="Ouvrir le portail de suivi du club"
                        >
                          <ExternalLink className="h-3.5 w-3.5" />
                          Portail
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          disabled={clubSaving}
                          onClick={() => handleDeletePartnerClub(club.name)}
                          className="text-rose-500 hover:bg-rose-50 hover:text-rose-600"
                          title="Supprimer ce club"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                    {clubMembers.length > 0 && (
                      <div className="flex flex-wrap gap-1.5 pt-1.5 border-t border-slate-100">
                        {clubMembers.map((m) => (
                          <PatientNameLink
                            key={m.id}
                            patientId={m.id}
                            name={`${m.nom} ${m.prenom}`}
                            fromRoute="patients"
                            onBeforeNavigate={() => setIsClubsModalOpen(false)}
                            className="px-2 py-0.5 rounded-md bg-slate-50 hover:bg-primary-50 border border-slate-200 text-xs font-semibold text-slate-700"
                          />
                        ))}
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>
      </Modal>

      {/* Modal modification rapide Club + Mutuelle */}
      <Modal
        isOpen={isMutuelleModalOpen}
        onClose={() => {
          if (!savingMutuelle) {
            setIsMutuelleModalOpen(false);
            setPatientForMutuelle(null);
          }
        }}
        title="Club sportif & Couverture mutuelle"
      >
        <form onSubmit={handleSaveQuickMutuelle} className="space-y-5">
          <div className="text-sm text-slate-600 flex items-center gap-1.5 flex-wrap">
            <span>Patient :</span>
            <PatientNameLink
              patientId={patientForMutuelle?.id}
              name={`${patientForMutuelle?.nom || ''} ${patientForMutuelle?.prenom || ''}`.trim()}
              fromRoute="patients"
              showIconAlways
              onBeforeNavigate={() => {
                setIsMutuelleModalOpen(false);
                setPatientForMutuelle(null);
              }}
              className="font-bold text-slate-900"
            />
          </div>

          {/* Club Sportif Conventionné */}
          <div className="space-y-2 p-3.5 rounded-xl bg-indigo-50/60 border border-indigo-100">
            <label className="text-sm font-semibold text-indigo-900 flex items-center gap-1.5">
              <Trophy className="h-4 w-4 text-indigo-600" />
              Club sportif conventionné
            </label>
            <select
              value={modalClubSelect}
              onChange={(e) => setModalClubSelect(e.target.value)}
              className="w-full rounded-xl border border-indigo-200 px-3 py-2 text-sm bg-white focus:border-indigo-500 focus:outline-none"
            >
              <option value="">Aucun club (Patient particulier)</option>
              {partnerClubs.map((c) => (
                <option key={c.name} value={c.name}>
                  {c.name} ({c.sport})
                </option>
              ))}
              <option value="__new__">+ Créer un nouveau club...</option>
            </select>

            {modalClubSelect === '__new__' && (
              <input
                type="text"
                required
                value={modalCustomClub}
                onChange={(e) => setModalCustomClub(e.target.value)}
                placeholder="Nom du club sportif..."
                className="w-full rounded-xl border border-indigo-300 px-3 py-2 text-sm bg-white focus:border-indigo-500 focus:outline-none"
              />
            )}
          </div>

          {/* Couverture Mutuelle */}
          <div className="space-y-3">
            <label className="text-sm font-semibold text-slate-700 block">
              Statut Mutuelle
            </label>
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setModalIsMutualiste(false)}
                className={`flex items-center justify-center gap-2 p-2.5 rounded-xl border text-sm font-semibold transition-all ${
                  !modalIsMutualiste
                    ? 'bg-slate-800 text-white border-slate-800 shadow-xs'
                    : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                }`}
              >
                <ShieldOff className="h-4 w-4" />
                Non mutualiste
              </button>
              <button
                type="button"
                onClick={() => setModalIsMutualiste(true)}
                className={`flex items-center justify-center gap-2 p-2.5 rounded-xl border text-sm font-semibold transition-all ${
                  modalIsMutualiste
                    ? 'bg-emerald-600 text-white border-emerald-600 shadow-xs'
                    : 'bg-white text-emerald-700 border-emerald-200 hover:bg-emerald-50'
                }`}
              >
                <ShieldCheck className="h-4 w-4" />
                Mutualiste
              </button>
            </div>

            {modalIsMutualiste && (
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-600">
                  Organisme / Assurance
                </label>
                <select
                  value={modalOrganisme}
                  onChange={(e) => setModalOrganisme(e.target.value)}
                  className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm bg-white focus:border-primary-500 focus:outline-none"
                >
                  {ORGANISMES_MUTUELLE.map((org) => (
                    <option key={org} value={org}>
                      {org}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <Button
              type="button"
              variant="outline"
              disabled={savingMutuelle}
              onClick={() => {
                setIsMutuelleModalOpen(false);
                setPatientForMutuelle(null);
              }}
            >
              Annuler
            </Button>
            <Button type="submit" disabled={savingMutuelle}>
              {savingMutuelle ? 'Enregistrement...' : 'Enregistrer'}
            </Button>
          </div>
        </form>
      </Modal>

      {/* Modal modification rapide du nombre de séances prescrites (Admin & Secrétaire uniquement) */}
      <Modal
        isOpen={Boolean(canEditSessionCount && patientForSeances)}
        onClose={() => {
          if (!savingSeancesModal) {
            setPatientForSeances(null);
          }
        }}
        title="Modifier le nombre de séances prescrites"
        maxWidth="sm"
      >
        {patientForSeances && (
          <form onSubmit={handleSaveQuickSeances} className="space-y-4">
            <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-600 flex items-center justify-between gap-2">
              <div>
                Patient :{' '}
                <strong className="text-slate-900">
                  {patientForSeances.nom} {patientForSeances.prenom}
                </strong>
              </div>
              <span className="font-bold text-primary-700 tabular-nums">
                {
                  appointments.filter(
                    (a) =>
                      a.patient_id === patientForSeances.id &&
                      (a.statut === 'Effectué' || a.statut === 'Impayé')
                  ).length
                }{' '}
                réalisée(s)
              </span>
            </div>

            <div className="space-y-2">
              <label className="text-xs font-bold uppercase text-slate-600 block">
                Nombre de séances prescrites
              </label>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() =>
                    setSeancesModalValue((prev) =>
                      String(Math.max(0, (parseInt(prev, 10) || 0) - 1))
                    )
                  }
                  className="h-10 w-10 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 flex items-center justify-center text-slate-700 shrink-0"
                >
                  <Minus className="h-4 w-4" />
                </button>
                <input
                  type="number"
                  min="0"
                  required
                  value={seancesModalValue}
                  onChange={(e) => setSeancesModalValue(e.target.value)}
                  className="w-full h-10 px-3 text-center font-bold text-base border border-slate-200 rounded-xl bg-white text-slate-900 focus:ring-2 focus:ring-primary-500 outline-none tabular-nums"
                />
                <button
                  type="button"
                  onClick={() =>
                    setSeancesModalValue((prev) =>
                      String((parseInt(prev, 10) || 0) + 1)
                    )
                  }
                  className="h-10 w-10 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 flex items-center justify-center text-slate-700 shrink-0"
                >
                  <Plus className="h-4 w-4" />
                </button>
              </div>

              <div className="flex flex-wrap items-center gap-1.5 pt-1">
                {[5, 10, 15, 20, 30].map((preset) => (
                  <button
                    key={preset}
                    type="button"
                    onClick={() => setSeancesModalValue(String(preset))}
                    className="px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-xs font-semibold text-slate-700 tabular-nums"
                  >
                    {preset} séances
                  </button>
                ))}
                <button
                  type="button"
                  onClick={() =>
                    setSeancesModalValue((prev) =>
                      String((parseInt(prev, 10) || 0) + 5)
                    )
                  }
                  className="px-2.5 py-1 rounded-lg bg-primary-50 border border-primary-200 hover:bg-primary-100 text-xs font-bold text-primary-700 tabular-nums"
                >
                  +5 séances
                </button>
                <button
                  type="button"
                  onClick={() =>
                    setSeancesModalValue((prev) =>
                      String((parseInt(prev, 10) || 0) + 10)
                    )
                  }
                  className="px-2.5 py-1 rounded-lg bg-primary-50 border border-primary-200 hover:bg-primary-100 text-xs font-bold text-primary-700 tabular-nums"
                >
                  +10 séances
                </button>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
              <Button
                type="button"
                variant="outline"
                disabled={savingSeancesModal}
                onClick={() => setPatientForSeances(null)}
              >
                Annuler
              </Button>
              <Button type="submit" disabled={savingSeancesModal}>
                {savingSeancesModal ? 'Enregistrement...' : 'Enregistrer'}
              </Button>
            </div>
          </form>
        )}
      </Modal>

      {/* Modal de confirmation de suppression */}
      <Modal
        isOpen={isDeleteModalOpen}
        onClose={() => {
          if (!deleteLoading) {
            setIsDeleteModalOpen(false);
            setPatientToDelete(null);
          }
        }}
        title="Confirmer la suppression"
      >
        <div className="space-y-4">
          <p className="text-sm text-slate-600">
            Êtes-vous sûr de vouloir supprimer définitivement le patient{' '}
            <PatientNameLink
              patientId={patientToDelete?.id}
              name={`${patientToDelete?.nom || ''} ${patientToDelete?.prenom || ''}`.trim()}
              fromRoute="patients"
              showIconAlways
              onBeforeNavigate={() => {
                setIsDeleteModalOpen(false);
                setPatientToDelete(null);
              }}
              className="text-slate-900 font-bold"
            />{' '}
            de la base de données ?
          </p>
          <div className="p-3 bg-rose-50 text-rose-800 rounded-lg text-sm flex gap-2 border border-rose-100">
            <AlertCircle className="h-5 w-5 text-rose-500 flex-shrink-0" />
            <span>
              <strong>Attention :</strong> Cette action est irréversible. Toutes les données
              associées (séances, rendez-vous, factures, et historique de traitements) seront
              définitivement supprimées.
            </span>
          </div>
          <div className="flex justify-end gap-3 pt-3">
            <Button
              variant="outline"
              onClick={() => {
                setIsDeleteModalOpen(false);
                setPatientToDelete(null);
              }}
              disabled={deleteLoading}
            >
              Annuler
            </Button>
            <Button
              onClick={handleDeletePatient}
              disabled={deleteLoading}
              className="bg-rose-600 hover:text-rose-700 text-white font-medium"
            >
              {deleteLoading ? 'Suppression en cours...' : 'Supprimer définitivement'}
            </Button>
          </div>
        </div>
      </Modal>

      {/* Modal rapide : Générer / Réinitialiser l'accès Espace Patient */}
      <Modal
        isOpen={isQuickAccessModalOpen}
        onClose={() => {
          if (!quickAccessLoading) {
            setIsQuickAccessModalOpen(false);
            setPatientForAccess(null);
          }
        }}
        title={
          patientForAccess?.has_access
            ? "Réinitialiser l'accès Espace Patient"
            : "Générer un accès Espace Patient"
        }
      >
        {patientForAccess && (
          <form onSubmit={handleQuickGenerateAccess} className="space-y-4">
            <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 text-sm text-slate-700 space-y-1">
              <PatientNameLink
                patientId={patientForAccess.id}
                name={`${patientForAccess.prenom} ${patientForAccess.nom}`}
                fromRoute="patients"
                showIconAlways
                onBeforeNavigate={() => {
                  setIsQuickAccessModalOpen(false);
                  setPatientForAccess(null);
                }}
                className="font-bold text-slate-900"
              />
              <div className="text-xs text-slate-600">
                Identifiant téléphone :{' '}
                <strong className="font-mono text-slate-900">
                  {normalizePatientPhone(patientForAccess.telephone || '') ||
                    patientForAccess.telephone ||
                    'Non renseigné'}
                </strong>
              </div>
            </div>

            {quickAccessMessage.text && (
              <div
                className={`p-3.5 rounded-xl text-sm border space-y-2.5 ${
                  quickAccessMessage.type === 'success'
                    ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                    : 'bg-rose-50 text-rose-700 border-rose-200'
                }`}
              >
                <p className="font-semibold">{quickAccessMessage.text}</p>
                {quickAccessMessage.type === 'success' && lastQuickCreds && (
                  <div className="p-2.5 rounded-lg bg-white border border-emerald-200 text-xs text-slate-800 space-y-1">
                    <div>
                      Identifiant : <strong className="font-mono text-slate-900">{lastQuickCreds.phone}</strong>
                    </div>
                    <div>
                      Mot de passe : <strong className="font-mono text-slate-900">{lastQuickCreds.password}</strong>
                    </div>
                  </div>
                )}
                {quickAccessMessage.type === 'success' && (
                  <Button
                    type="button"
                    size="sm"
                    className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-semibold gap-1.5"
                    onClick={() => {
                      try {
                        localStorage.setItem('reforme_preview_patient_id', patientForAccess.id);
                      } catch {}
                      setIsQuickAccessModalOpen(false);
                      setPatientForAccess(null);
                      window.location.hash = 'espace-patient';
                    }}
                  >
                    <ExternalLink className="h-3.5 w-3.5" />
                    Ouvrir l'Espace Patient de {patientForAccess.prenom}
                  </Button>
                )}
              </div>
            )}

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-sm font-semibold text-slate-700 flex items-center gap-1.5">
                  <Key className="h-4 w-4 text-primary-600" />
                  {patientForAccess.has_access ? 'Nouveau mot de passe' : 'Mot de passe provisoire'}
                </label>
                <button
                  type="button"
                  onClick={() => {
                    const last4 =
                      normalizePatientPhone(patientForAccess.telephone || '').slice(-4) || '2025';
                    setQuickAccessPassword(`Reforme${last4}`);
                    setShowQuickAccessPassword(true);
                  }}
                  className="text-xs font-semibold text-primary-600 hover:text-primary-700"
                >
                  Suggérer un mot de passe
                </button>
              </div>
              <div className="relative">
                <input
                  type={showQuickAccessPassword ? 'text' : 'password'}
                  required
                  minLength={6}
                  value={quickAccessPassword}
                  onChange={(e) => setQuickAccessPassword(e.target.value)}
                  placeholder="Ex: Reforme1234"
                  className="w-full px-3 py-2.5 pr-10 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 outline-none"
                />
                <button
                  type="button"
                  onClick={() => setShowQuickAccessPassword((v) => !v)}
                  className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-400 hover:text-slate-600"
                  tabIndex={-1}
                >
                  {showQuickAccessPassword ? (
                    <EyeOff className="h-4 w-4" />
                  ) : (
                    <Eye className="h-4 w-4" />
                  )}
                </button>
              </div>
              <p className="text-xs text-slate-500">
                Minimum 6 caractères. Si le patient avait déjà un compte, ce nouveau mot de passe remplace immédiatement l'ancien.
              </p>
            </div>

            <div className="flex justify-end gap-3 pt-3 border-t border-slate-100">
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setIsQuickAccessModalOpen(false);
                  setPatientForAccess(null);
                }}
                disabled={quickAccessLoading}
              >
                Fermer
              </Button>
              <Button
                type="submit"
                disabled={quickAccessLoading || !patientForAccess.telephone}
              >
                {quickAccessLoading
                  ? 'Enregistrement...'
                  : patientForAccess.has_access
                  ? 'Mettre à jour le mot de passe'
                  : "Activer l'accès"}
              </Button>
            </div>
          </form>
        )}
      </Modal>

      <ClubAccessModal
        isOpen={Boolean(clubForAccessModal)}
        club={clubForAccessModal}
        fromRoute="patients"
        onClose={() => setClubForAccessModal(null)}
        onUpdated={async () => {
          const updatedClubs = await fetchPartnerClubs(supabase, patients);
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
