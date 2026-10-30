import React, { useState, useEffect, useRef, useMemo } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { fetchAllRows } from '@/lib/financeUtils';
import { getMoroccoNow, parseClinicDate } from '@/lib/timeUtils';
import {
  ORGANISMES_MUTUELLE,
  parsePatientMutuelle,
  serializeAtcdWithMutuelle,
} from '@/lib/mutuelleUtils';
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
} from 'lucide-react';
import { Modal } from '@/components/ui/modal';
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

  // UI states
  const [loading, setLoading] = useState(false);
  const [fetching, setFetching] = useState(false);
  const [success, setSuccess] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Data state
  const [patients, setPatients] = useState<Patient[]>([]);
  const [appointments, setAppointments] = useState<any[]>([]);
  const [treatments, setTreatments] = useState<any[]>([]);
  const [mutuelleBillingIds, setMutuelleBillingIds] = useState<Set<string>>(new Set());

  // Search & Filter states
  const [searchQuery, setSearchQuery] = useState('');
  const [mutuelleFilter, setMutuelleFilter] = useState<'all' | 'mutualiste' | 'non_mutualiste'>('all');
  const [organismeFilter, setOrganismeFilter] = useState<string>('all');
  const [searchDateNaissance, setSearchDateNaissance] = useState('');
  const [searchTelephone, setSearchTelephone] = useState('');
  const [searchPathologie, setSearchPathologie] = useState('');
  const [showAdvancedSearch, setShowAdvancedSearch] = useState(false);

  // Quick Mutuelle Edit Modal state (from table badge)
  const [isMutuelleModalOpen, setIsMutuelleModalOpen] = useState(false);
  const [patientForMutuelle, setPatientForMutuelle] = useState<Patient | null>(null);
  const [modalIsMutualiste, setModalIsMutualiste] = useState(false);
  const [modalOrganisme, setModalOrganisme] = useState('CNOPS');
  const [savingMutuelle, setSavingMutuelle] = useState(false);

  // Import state
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [importLoading, setImportLoading] = useState(false);

  // Delete states
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [patientToDelete, setPatientToDelete] = useState<Patient | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);

  // Fetch patients on component mount
  useEffect(() => {
    fetchPatients();
  }, []);

  const fetchPatients = async () => {
    setFetching(true);
    setError(null);

    try {
      const patientColumns =
        'id, nom, prenom, telephone, email, date_naissance, cin, adresse, pathologie, nombre_seances, atcd, forfait_seances, has_access, last_follow_up_date, follow_up_status, created_at';

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

      setPatients((pData as Patient[]) || []);

      const [appData, treatData, billData] = await Promise.all([
        fetchAllRows('appointments', 'patient_id, statut, date_heure', {
          column: 'date_heure',
          ascending: false,
        }),
        fetchAllRows('treatments', 'patient_id, statut, nombre_seances_prescrites'),
        fetchAllRows('billings', 'patient_id, type_paiement'),
      ]);

      setAppointments(appData || []);
      setTreatments(treatData || []);

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

              const finalAtcd = mutLow
                ? serializeAtcdWithMutuelle(atcdRaw, hasMutuelleInCsv, orgInCsv)
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

    const serializedAtcd = serializeAtcdWithMutuelle(
      atcd,
      isMutualiste,
      isMutualiste ? organismeMutuelle : ''
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
        nombre_seances: nombreSeances ? parseInt(nombreSeances, 10) : null,
        atcd: serializedAtcd,
      },
    ]);

    setLoading(false);

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
      fetchPatients();

      setTimeout(() => setSuccess(null), 3000);
    }
  };

  const handleOpenMutuelleModal = (patient: Patient, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const info = parsePatientMutuelle(patient, mutuelleBillingIds);
    setPatientForMutuelle(patient);
    setModalIsMutualiste(info.isMutualiste);
    setModalOrganisme(info.organisme || 'CNOPS');
    setIsMutuelleModalOpen(true);
  };

  const handleSaveQuickMutuelle = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!patientForMutuelle) return;

    setSavingMutuelle(true);
    try {
      const info = parsePatientMutuelle(patientForMutuelle, mutuelleBillingIds);
      const updatedAtcd = serializeAtcdWithMutuelle(
        info.cleanAtcd,
        modalIsMutualiste,
        modalIsMutualiste ? modalOrganisme : ''
      );

      const { error: updErr } = await supabase
        .from('patients')
        .update({ atcd: updatedAtcd })
        .eq('id', patientForMutuelle.id);

      if (updErr) throw updErr;

      setPatients((prev) =>
        prev.map((p) => (p.id === patientForMutuelle.id ? { ...p, atcd: updatedAtcd } : p))
      );
      setIsMutuelleModalOpen(false);
      setPatientForMutuelle(null);
    } catch (err: any) {
      setError(`Impossible de mettre à jour le statut mutuelle : ${err.message}`);
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
    const completedAppts = pAppts.filter((a) => a.statut === 'Effectué');

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

  // Counts for Mutuelle filter pills
  const mutuelleCounts = useMemo(() => {
    let mutualistes = 0;
    let nonMutualistes = 0;
    for (const p of patients) {
      const info = parsePatientMutuelle(p, mutuelleBillingIds);
      if (info.isMutualiste) {
        mutualistes++;
      } else {
        nonMutualistes++;
      }
    }
    return {
      total: patients.length,
      mutualistes,
      nonMutualistes,
    };
  }, [patients, mutuelleBillingIds]);

  const filteredPatients = patients.filter((p) => {
    const nomStr = (p.nom || '').toLowerCase();
    const prenomStr = (p.prenom || '').toLowerCase();
    const telStr = (p.telephone || '').toLowerCase();
    const cinStr = (p.cin || '').toLowerCase();
    const queryStr = searchQuery.trim().toLowerCase();

    const mutInfo = parsePatientMutuelle(p, mutuelleBillingIds);

    const matchQuery =
      !queryStr ||
      `${nomStr} ${prenomStr}`.includes(queryStr) ||
      `${prenomStr} ${nomStr}`.includes(queryStr) ||
      telStr.includes(queryStr) ||
      cinStr.includes(queryStr) ||
      (mutInfo.organisme && mutInfo.organisme.toLowerCase().includes(queryStr));

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

    const matchDate = searchDateNaissance ? p.date_naissance === searchDateNaissance : true;
    const matchTel = searchTelephone ? Boolean(p.telephone?.includes(searchTelephone)) : true;
    const matchPatho = searchPathologie
      ? Boolean(p.pathologie?.toLowerCase().includes(searchPathologie.toLowerCase()))
      : true;

    return matchQuery && matchMutuelle && matchOrganisme && matchDate && matchTel && matchPatho;
  });

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
                  Nombre de séances *
                </label>
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
              </div>

              {/* Couverture Médicale / Mutuelle */}
              <div className="space-y-2 md:col-span-2 p-4 rounded-xl bg-slate-50 border border-slate-200">
                <label className="block text-sm font-semibold text-slate-700">
                  Couverture médicale (Mutuelle)
                </label>
                <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                  <div className="inline-flex rounded-lg border border-slate-200 bg-white p-1">
                    <button
                      type="button"
                      onClick={() => setIsMutualiste(false)}
                      className={`px-3.5 py-1.5 rounded-md text-xs font-semibold transition-all ${
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
                      className={`px-3.5 py-1.5 rounded-md text-xs font-semibold transition-all ${
                        isMutualiste
                          ? 'bg-emerald-600 text-white shadow-xs'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      Patient mutualiste
                    </button>
                  </div>

                  {isMutualiste && (
                    <div className="flex items-center gap-2 flex-1">
                      <label className="text-xs font-semibold text-slate-600 whitespace-nowrap">
                        Organisme :
                      </label>
                      <select
                        value={organismeMutuelle}
                        onChange={(e) => setOrganismeMutuelle(e.target.value)}
                        className="block w-full sm:w-56 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500/20"
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
          <div className="flex items-center gap-2">
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
                placeholder="Rechercher par nom, prénom, téléphone, CIN ou mutuelle..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="block w-full rounded-md border border-slate-300 bg-white pl-10 pr-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500/20"
              />
            </div>

            {/* Quick Filter Bar: Tous / Mutualistes / Non mutualistes */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setMutuelleFilter('all');
                    setOrganismeFilter('all');
                  }}
                  className={`inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-semibold border transition-colors ${
                    mutuelleFilter === 'all'
                      ? 'bg-slate-900 text-white border-slate-900'
                      : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-100'
                  }`}
                >
                  Tous les patients
                  <span
                    className={`px-1.5 py-0.5 rounded text-[11px] font-bold ${
                      mutuelleFilter === 'all'
                        ? 'bg-white/20 text-white'
                        : 'bg-slate-100 text-slate-700'
                    }`}
                  >
                    {mutuelleCounts.total}
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => setMutuelleFilter('mutualiste')}
                  className={`inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-semibold border transition-colors ${
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
                    {mutuelleCounts.mutualistes}
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setMutuelleFilter('non_mutualiste');
                    setOrganismeFilter('all');
                  }}
                  className={`inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-semibold border transition-colors ${
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
                    {mutuelleCounts.nonMutualistes}
                  </span>
                </button>
              </div>

              {mutuelleFilter === 'mutualiste' && (
                <div className="flex items-center gap-2">
                  <label className="text-xs font-medium text-slate-600 whitespace-nowrap">
                    Organisme :
                  </label>
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
                </div>
              )}
            </div>

            {showAdvancedSearch && (
              <div className="grid grid-cols-1 sm:grid-cols-4 gap-4 pt-2 border-t border-slate-200/70">
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-slate-600">Statut Mutuelle</label>
                  <select
                    value={mutuelleFilter}
                    onChange={(e) =>
                      setMutuelleFilter(e.target.value as 'all' | 'mutualiste' | 'non_mutualiste')
                    }
                    className="block w-full rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500/20"
                  >
                    <option value="all">Tous</option>
                    <option value="mutualiste">Mutualistes uniquement</option>
                    <option value="non_mutualiste">Non mutualistes uniquement</option>
                  </select>
                </div>
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
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead className="text-xs text-slate-500 uppercase bg-slate-50 border-b border-slate-200">
                <tr>
                  <th className="px-6 py-4 font-medium">Patient</th>
                  <th className="px-6 py-4 font-medium">Contact</th>
                  <th className="px-6 py-4 font-medium">Mutuelle</th>
                  <th className="px-6 py-4 font-medium">Accès Portail</th>
                  <th className="px-6 py-4 font-medium">Détails Médicaux</th>
                  <th className="px-6 py-4 font-medium">Date d'ajout</th>
                  <th className="px-6 py-4 font-medium text-right font-semibold">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredPatients.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-6 py-8 text-center text-slate-500">
                      {fetching ? 'Chargement des patients...' : 'Aucun patient correspondant à ce filtre.'}
                    </td>
                  </tr>
                ) : (
                  filteredPatients.map((patient) => {
                    const alertBadge = getPatientAlertBadge(patient);
                    const mutInfo = parsePatientMutuelle(patient, mutuelleBillingIds);

                    return (
                      <tr
                        key={patient.id}
                        className={`bg-white hover:bg-slate-50 transition-colors ${
                          onSelectPatient ? 'cursor-pointer' : ''
                        }`}
                        onClick={() => onSelectPatient && onSelectPatient(patient.id)}
                      >
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-3">
                            <div className="h-9 w-9 rounded-full bg-primary-100 flex items-center justify-center text-primary-700 font-bold text-sm">
                              {patient.prenom?.[0]}
                              {patient.nom?.[0]}
                            </div>
                            <div>
                              <div className="flex flex-wrap items-center gap-1.5">
                                <span className="font-medium text-slate-900">
                                  {patient.nom} {patient.prenom}
                                </span>
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
                        <td className="px-6 py-4">
                          <div className="space-y-1">
                            {patient.telephone && (
                              <div className="flex items-center gap-2 text-slate-600">
                                <Phone className="h-3 w-3" /> {patient.telephone}
                              </div>
                            )}
                            {patient.adresse && (
                              <div
                                className="text-xs text-slate-500 truncate max-w-[150px]"
                                title={patient.adresse}
                              >
                                {patient.adresse}
                              </div>
                            )}
                          </div>
                        </td>
                        <td className="px-6 py-4" onClick={(e) => e.stopPropagation()}>
                          <button
                            type="button"
                            onClick={(e) => handleOpenMutuelleModal(patient, e)}
                            title="Cliquer pour modifier le statut mutuelle"
                            className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold border transition-colors ${
                              mutInfo.isMutualiste
                                ? 'bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100'
                                : 'bg-slate-100 text-slate-600 border-slate-200 hover:bg-slate-200'
                            }`}
                          >
                            {mutInfo.isMutualiste ? (
                              <>
                                <ShieldCheck className="h-3.5 w-3.5 text-emerald-600" />
                                <span>
                                  {mutInfo.organisme && mutInfo.organisme !== 'Mutuelle'
                                    ? mutInfo.organisme
                                    : 'Mutualiste'}
                                </span>
                              </>
                            ) : (
                              <>
                                <ShieldOff className="h-3.5 w-3.5 text-slate-400" />
                                <span>Non mutualiste</span>
                              </>
                            )}
                          </button>
                        </td>
                        <td className="px-6 py-4">
                          {(patient as any).has_access ? (
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-mint-50 text-mint-700 border border-mint-200">
                              <CheckCircle2 className="h-3 w-3" /> Actif
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-amber-50 text-amber-700 border border-amber-200">
                              <Lock className="h-3 w-3" /> Non généré
                            </span>
                          )}
                        </td>
                        <td className="px-6 py-4">
                          <div className="space-y-1">
                            {patient.pathologie ? (
                              <div
                                className="text-sm font-medium text-slate-700 truncate max-w-[150px]"
                                title={patient.pathologie}
                              >
                                {patient.pathologie}
                              </div>
                            ) : (
                              <span className="text-slate-400 italic text-xs">Non renseigné</span>
                            )}
                            {patient.nombre_seances && (
                              <div className="text-xs text-slate-500">
                                {patient.nombre_seances} séance(s)
                              </div>
                            )}
                            {(patient as any).follow_up_status &&
                              String((patient as any).follow_up_status).startsWith('PAIN:') &&
                              (() => {
                                const parts = String((patient as any).follow_up_status)
                                  .replace('PAIN:', '')
                                  .split('|');
                                const score = parseInt(parts[0], 10);
                                const dateStr = parts[1] || '';
                                const noteStr = parts[2] || '';
                                if (isNaN(score)) return null;
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
                                    className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold border ${colorCls}`}
                                    title={`Douleur EVA ${score}/10 (${dateStr})${
                                      noteStr ? ' : ' + noteStr : ''
                                    }`}
                                  >
                                    <span>EVA : {score}/10</span>
                                  </div>
                                );
                              })()}
                          </div>
                        </td>
                        <td className="px-6 py-4 text-slate-500">
                          {new Date(patient.created_at).toLocaleDateString('fr-FR', {
                            day: '2-digit',
                            month: 'short',
                            year: 'numeric',
                          })}
                        </td>
                        <td className="px-6 py-4 text-right" onClick={(e) => e.stopPropagation()}>
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

      {/* Modal modification rapide du statut Mutuelle */}
      <Modal
        isOpen={isMutuelleModalOpen}
        onClose={() => {
          if (!savingMutuelle) {
            setIsMutuelleModalOpen(false);
            setPatientForMutuelle(null);
          }
        }}
        title="Couverture médicale (Mutuelle)"
      >
        <form onSubmit={handleSaveQuickMutuelle} className="space-y-4">
          <p className="text-sm text-slate-600">
            Patient :{' '}
            <strong className="text-slate-900">
              {patientForMutuelle?.nom} {patientForMutuelle?.prenom}
            </strong>
          </p>

          <div className="grid grid-cols-2 gap-3">
            <button
              type="button"
              onClick={() => setModalIsMutualiste(false)}
              className={`flex items-center justify-center gap-2 p-3 rounded-xl border text-sm font-semibold transition-all ${
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
              className={`flex items-center justify-center gap-2 p-3 rounded-xl border text-sm font-semibold transition-all ${
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
              <label className="text-sm font-semibold text-slate-700">
                Organisme / Assurance
              </label>
              <select
                value={modalOrganisme}
                onChange={(e) => setModalOrganisme(e.target.value)}
                className="w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm bg-white focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500/20"
              >
                {ORGANISMES_MUTUELLE.map((org) => (
                  <option key={org} value={org}>
                    {org}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div className="flex justify-end gap-3 pt-3">
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
            <strong className="text-slate-900 font-bold">
              {patientToDelete?.nom} {patientToDelete?.prenom}
            </strong>{' '}
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
    </div>
  );
}
