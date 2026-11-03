import React, { useState, useEffect, useRef } from 'react';
import { supabase, supabaseUrl, supabaseAnonKey } from '../lib/supabaseClient';
import {
  Shield,
  Users,
  UserPlus,
  Mail,
  Lock,
  AlertCircle,
  AlertTriangle,
  CheckCircle,
  Activity,
  CheckSquare,
  Square,
  Stethoscope,
  Plus,
  Trash2,
  Database,
  Upload,
  Phone,
  Pencil,
  Eye,
  EyeOff,
  User,
  KeyRound,
  Ban,
  Unlock,
  FileText,
} from 'lucide-react';
import { Modal } from '../components/ui/modal';
import Papa from 'papaparse';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { DocumentTemplateEditor } from '../components/settings/DocumentTemplateEditor';
import {
  PERMISSIONS_LIST,
  ParsedCollaboratorProfile,
  parseCollaboratorProfile,
  parseAllTeamProfiles,
  buildProfilePermissionsArray,
  getDefaultPermissionsForRole,
  upsertPendingCollaboratorInAdmin,
  removePendingCollaboratorFromAdmin,
  extractBlockedEmails,
  blockCollaboratorEmail,
  unblockCollaboratorEmail,
  provisionCollaboratorCredentials,
  isPrimaryAdminEmail,
} from '../lib/teamUtils';

export function Settings() {
  const [activeTab, setActiveTab] = useState<'equipe' | 'praticiens' | 'create' | 'documents' | 'import'>(() => {
    try {
      const requested = sessionStorage.getItem('reforme_settings_tab');
      if (requested === 'documents') {
        sessionStorage.removeItem('reforme_settings_tab');
        return 'documents';
      }
    } catch {}
    return 'equipe';
  });
  const [profiles, setProfiles] = useState<ParsedCollaboratorProfile[]>([]);
  const [blockedEmails, setBlockedEmails] = useState<string[]>([]);
  const [emailToBlockInput, setEmailToBlockInput] = useState('');
  const [blockActionLoading, setBlockActionLoading] = useState(false);
  const [therapists, setTherapists] = useState<any[]>([]);
  const [currentUser, setCurrentUser] = useState<{ id: string; email?: string } | null>(null);
  const [loading, setLoading] = useState(true);

  // Team management feedback & modals
  const [teamFeedback, setTeamFeedback] = useState<{ type: '' | 'success' | 'error'; text: string }>({
    type: '',
    text: '',
  });
  const [savingProfileId, setSavingProfileId] = useState<string | null>(null);

  // Edit collaborator modal
  const [isEditCollabModalOpen, setIsEditCollabModalOpen] = useState(false);
  const [collabToEdit, setCollabToEdit] = useState<ParsedCollaboratorProfile | null>(null);
  const [editCollabData, setEditCollabData] = useState({
    name: '',
    email: '',
    phone: '',
    role: 'therapeute',
    newPassword: '',
  });
  const [showEditCollabPassword, setShowEditCollabPassword] = useState(false);
  const [editCollabLoading, setEditCollabLoading] = useState(false);
  const [editCollabError, setEditCollabError] = useState('');

  // Delete collaborator modal
  const [isDeleteCollabModalOpen, setIsDeleteCollabModalOpen] = useState(false);
  const [collabToDelete, setCollabToDelete] = useState<ParsedCollaboratorProfile | null>(null);
  const [deleteCollabLoading, setDeleteCollabLoading] = useState(false);
  const [deleteCollabError, setDeleteCollabError] = useState('');

  // Form state for new collaborator
  const [collabPrenom, setCollabPrenom] = useState('');
  const [collabNom, setCollabNom] = useState('');
  const [collabPhone, setCollabPhone] = useState('');
  const [collabSpecialite, setCollabSpecialite] = useState('');
  const [alsoAddAsTherapist, setAlsoAddAsTherapist] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [role, setRole] = useState('therapeute');
  const [newCollabPermissions, setNewCollabPermissions] = useState<string[]>(() =>
    getDefaultPermissionsForRole('therapeute')
  );
  const [createLoading, setCreateLoading] = useState(false);
  const [message, setMessage] = useState<{ type: '' | 'success' | 'error'; text: string }>({ type: '', text: '' });

  // Delete therapist confirmation modal
  const [isDeleteTherapistModalOpen, setIsDeleteTherapistModalOpen] = useState(false);
  const [therapistToDelete, setTherapistToDelete] = useState<any | null>(null);
  const [deleteTherapistLoading, setDeleteTherapistLoading] = useState(false);
  const [deleteTherapistError, setDeleteTherapistError] = useState('');

  // Form state for practitioners
  const [newTherapist, setNewTherapist] = useState({ nom: '', prenom: '', specialite: '', email: '', tel: '' });
  const [therapistLoading, setTherapistLoading] = useState(false);
  const [therapistMessage, setTherapistMessage] = useState<{ type: '' | 'success' | 'error'; text: string }>({
    type: '',
    text: '',
  });

  // Edit therapist states
  const [isEditTherapistModalOpen, setIsEditTherapistModalOpen] = useState(false);
  const [therapistToEdit, setTherapistToEdit] = useState<any | null>(null);
  const [editTherapistData, setEditTherapistData] = useState({
    nom: '',
    prenom: '',
    specialite: '',
    email: '',
    tel: '',
  });
  const [editTherapistLoading, setEditTherapistLoading] = useState(false);
  const [editTherapistError, setEditTherapistError] = useState('');

  // Form state for import
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [importLoading, setImportLoading] = useState(false);
  const [importMessage, setImportMessage] = useState<{ type: '' | 'success' | 'error'; text: string }>({
    type: '',
    text: '',
  });

  // Dedup state
  const [dedupLoading, setDedupLoading] = useState(false);
  const [dedupMessage, setDedupMessage] = useState<{ type: '' | 'success' | 'error'; text: string }>({
    type: '',
    text: '',
  });

  useEffect(() => {
    loadAllData();
  }, []);

  const showTeamToast = (type: 'success' | 'error', text: string) => {
    setTeamFeedback({ type, text });
    if (type === 'success') {
      setTimeout(() => {
        setTeamFeedback((prev) => (prev.text === text ? { type: '', text: '' } : prev));
      }, 4000);
    }
  };

  const loadAllData = async () => {
    setLoading(true);
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const sessionUser = session?.user ? { id: session.user.id, email: session.user.email } : null;
      setCurrentUser(sessionUser);

      const [therapistsRes, profilesRes] = await Promise.all([
        supabase.from('therapists').select('*').order('nom'),
        supabase.from('profiles').select('*').neq('role', 'patient').order('created_at', { ascending: false }),
      ]);

      const loadedTherapists = therapistsRes.data || [];
      if (therapistsRes.error) {
        setTherapistMessage({
          type: 'error',
          text: `Erreur de chargement des praticiens : ${therapistsRes.error.message}`,
        });
      } else {
        setTherapists(loadedTherapists);
      }

      if (profilesRes.error) {
        showTeamToast('error', `Erreur de chargement de l'équipe : ${profilesRes.error.message}`);
      } else if (profilesRes.data) {
        const parsedList = parseAllTeamProfiles(profilesRes.data, loadedTherapists, sessionUser);
        setProfiles(parsedList);
        setBlockedEmails(extractBlockedEmails(profilesRes.data));

        // Auto-save current logged-in user's email/name metadata once so other sessions see it too
        if (sessionUser?.email) {
          const ownRaw = profilesRes.data.find((r) => r.id === sessionUser.id);
          const ownParsed = parsedList.find((p) => p.id === sessionUser.id);
          const rawPerms: string[] = Array.isArray(ownRaw?.permissions) ? ownRaw.permissions : [];
          const hasStoredEmail = rawPerms.some((x) => typeof x === 'string' && x.startsWith('__meta_email:'));
          if (ownParsed && !hasStoredEmail) {
            const enrichedPerms = buildProfilePermissionsArray(
              ownParsed.permissions,
              {
                name: ownParsed.name,
                email: sessionUser.email,
                phone: ownParsed.phone,
                configured: ownParsed.configured,
              },
              rawPerms
            );
            await supabase.from('profiles').update({ permissions: enrichedPerms }).eq('id', sessionUser.id);
          }
        }
      }
    } catch (err: any) {
      console.error('Settings load error:', err);
    } finally {
      setLoading(false);
    }
  };

  const fetchProfiles = async (overrideTherapists?: any[]) => {
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .neq('role', 'patient')
        .order('created_at', { ascending: false });

      if (error) {
        showTeamToast('error', `Erreur profils : ${error.message}`);
        return;
      }

      if (data) {
        const thList = overrideTherapists ?? therapists;
        setProfiles(parseAllTeamProfiles(data, thList, currentUser));
        setBlockedEmails(extractBlockedEmails(data));
      }
    } catch (err) {
      console.error('Fetch profiles failed:', err);
    }
  };

  const fetchTherapists = async (): Promise<any[]> => {
    try {
      const { data, error } = await supabase.from('therapists').select('*').order('nom');
      if (error) {
        setTherapistMessage({
          type: 'error',
          text: `Erreur de chargement des praticiens : ${error.message}`,
        });
        return therapists;
      }
      const list = data || [];
      setTherapists(list);
      return list;
    } catch (err) {
      console.error('Fetch therapists failed:', err);
      return therapists;
    }
  };

  // ============================================================================
  // 1. GESTION DES PRATICIENS
  // ============================================================================

  const handleAddTherapist = async (e: React.FormEvent) => {
    e.preventDefault();

    const nom = newTherapist.nom.trim();
    const prenom = newTherapist.prenom.trim();

    if (!nom || !prenom) {
      setTherapistMessage({ type: 'error', text: 'Le nom et le prénom sont obligatoires.' });
      return;
    }

    setTherapistLoading(true);
    setTherapistMessage({ type: '', text: '' });

    try {
      const therapistToInsert = {
        nom,
        prenom,
        specialite: newTherapist.specialite.trim(),
        email: newTherapist.email.trim().toLowerCase(),
        tel: newTherapist.tel.trim(),
      };

      const { data: inserted, error } = await supabase
        .from('therapists')
        .insert([therapistToInsert])
        .select('*')
        .single();

      if (error) throw error;

      setNewTherapist({ nom: '', prenom: '', specialite: '', email: '', tel: '' });
      const updatedTherapists = await fetchTherapists();
      await fetchProfiles(updatedTherapists);

      setTherapistMessage({
        type: 'success',
        text: `Praticien ${inserted?.prenom || prenom} ${inserted?.nom || nom} ajouté avec succès !`,
      });

      setTimeout(() => {
        setTherapistMessage((prev) => (prev.type === 'success' ? { type: '', text: '' } : prev));
      }, 4500);
    } catch (err: any) {
      console.error('Error adding therapist:', err);
      setTherapistMessage({
        type: 'error',
        text: `Échec de l'ajout : ${err.message || 'Erreur inattendue'}`,
      });
    } finally {
      setTherapistLoading(false);
    }
  };

  const handleOpenEditTherapist = (therapist: any) => {
    setTherapistToEdit(therapist);
    setEditTherapistError('');
    setEditTherapistData({
      nom: therapist.nom || '',
      prenom: therapist.prenom || '',
      specialite: therapist.specialite || '',
      email: therapist.email || '',
      tel: therapist.tel || '',
    });
    setIsEditTherapistModalOpen(true);
  };

  const executeEditTherapist = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!therapistToEdit) return;

    const nom = editTherapistData.nom.trim();
    const prenom = editTherapistData.prenom.trim();

    if (!nom || !prenom) {
      setEditTherapistError('Le nom et le prénom sont obligatoires.');
      return;
    }

    setEditTherapistLoading(true);
    setEditTherapistError('');
    setTherapistMessage({ type: '', text: '' });

    try {
      const { data: updatedRows, error } = await supabase
        .from('therapists')
        .update({
          nom,
          prenom,
          specialite: editTherapistData.specialite.trim(),
          email: editTherapistData.email.trim().toLowerCase(),
          tel: editTherapistData.tel.trim(),
        })
        .eq('id', therapistToEdit.id)
        .select('*');

      if (error) throw error;
      if (!updatedRows || updatedRows.length === 0) {
        throw new Error('Aucune modification enregistrée (praticien introuvable ou accès refusé).');
      }

      const updatedTherapists = await fetchTherapists();
      await fetchProfiles(updatedTherapists);

      setIsEditTherapistModalOpen(false);
      setTherapistToEdit(null);
      setTherapistMessage({
        type: 'success',
        text: `Informations de ${prenom} ${nom} mises à jour avec succès !`,
      });

      setTimeout(() => {
        setTherapistMessage((prev) => (prev.type === 'success' ? { type: '', text: '' } : prev));
      }, 4500);
    } catch (err: any) {
      console.error('Error editing therapist:', err);
      setEditTherapistError(err.message || 'Erreur lors de la modification du praticien.');
    } finally {
      setEditTherapistLoading(false);
    }
  };

  const handleOpenDeleteTherapist = (therapist: any) => {
    setTherapistToDelete(therapist);
    setDeleteTherapistError('');
    setIsDeleteTherapistModalOpen(true);
  };

  const executeDeleteTherapist = async () => {
    if (!therapistToDelete) return;
    setDeleteTherapistLoading(true);
    setDeleteTherapistError('');
    setTherapistMessage({ type: '', text: '' });

    try {
      // Clean any serialized ||TH_ID:<id>|| tags in appointments.notes_seance
      const tagPrefix = `||TH_ID:${therapistToDelete.id}||`;
      const { data: taggedAppointments } = await supabase
        .from('appointments')
        .select('id, notes_seance')
        .ilike('notes_seance', `%${tagPrefix}%`);

      if (taggedAppointments && taggedAppointments.length > 0) {
        await Promise.all(
          taggedAppointments.map((app) =>
            supabase
              .from('appointments')
              .update({ notes_seance: (app.notes_seance || '').replace(tagPrefix, '') })
              .eq('id', app.id)
          )
        );
      }

      const { error } = await supabase.from('therapists').delete().eq('id', therapistToDelete.id);
      if (error) throw error;

      const updatedTherapists = await fetchTherapists();
      await fetchProfiles(updatedTherapists);

      const deletedName = `${therapistToDelete.prenom || ''} ${therapistToDelete.nom || ''}`.trim();
      setIsDeleteTherapistModalOpen(false);
      setTherapistToDelete(null);
      setTherapistMessage({
        type: 'success',
        text: `Le praticien ${deletedName} a été supprimé avec succès.`,
      });

      setTimeout(() => {
        setTherapistMessage((prev) => (prev.type === 'success' ? { type: '', text: '' } : prev));
      }, 4500);
    } catch (err: any) {
      console.error('Delete therapist failed:', err);
      setDeleteTherapistError(
        `Impossible de supprimer ce praticien : ${err.message || 'Erreur inattendue'}`
      );
    } finally {
      setDeleteTherapistLoading(false);
    }
  };

  const handlePrepareCollaboratorFromTherapist = (therapist: any) => {
    setCollabPrenom(therapist.prenom || '');
    setCollabNom(therapist.nom || '');
    setCollabPhone(therapist.tel || '');
    setCollabSpecialite(therapist.specialite || '');
    setEmail(therapist.email || '');
    setPassword('');
    setRole('therapeute');
    setNewCollabPermissions(getDefaultPermissionsForRole('therapeute'));
    setAlsoAddAsTherapist(false);
    setMessage({ type: '', text: '' });
    setActiveTab('create');
  };

  // ============================================================================
  // 2. GESTION DE L'ÉQUIPE (COLLABORATEURS, RÔLES & PERMISSIONS)
  // ============================================================================

  const handleUpdateRole = async (profile: ParsedCollaboratorProfile, newRole: string) => {
    setSavingProfileId(profile.id);
    try {
      const nextModulePerms =
        newRole === 'admin'
          ? PERMISSIONS_LIST.map((p) => p.id)
          : profile.permissions.length > 0
          ? profile.permissions
          : getDefaultPermissionsForRole(newRole);

      // Optimistic update
      setProfiles((prev) =>
        prev.map((p) =>
          p.id === profile.id ? { ...p, role: newRole, permissions: nextModulePerms, configured: true } : p
        )
      );

      if (profile.isPendingBind) {
        await upsertPendingCollaboratorInAdmin(supabase, {
          email: profile.email,
          name: profile.name,
          phone: profile.phone,
          role: newRole,
          permissions: nextModulePerms,
          created_at: profile.created_at,
        });
      } else {
        const serializedPerms = buildProfilePermissionsArray(
          nextModulePerms,
          {
            name: profile.name,
            email: profile.email,
            phone: profile.phone,
            configured: true,
          },
          profile.rawPermissions
        );

        const { data: updated, error } = await supabase
          .from('profiles')
          .update({ role: newRole, permissions: serializedPerms })
          .eq('id', profile.id)
          .select('*');

        if (error) throw error;
        if (!updated || updated.length === 0) {
          throw new Error('Mise à jour refusée ou profil introuvable.');
        }
      }

      await fetchProfiles();
      window.dispatchEvent(new Event('reforme-team-updated'));
      showTeamToast('success', 'Rôle du collaborateur mis à jour avec succès.');
    } catch (err: any) {
      console.error('Role update error:', err);
      showTeamToast('error', `Erreur lors de la mise à jour du rôle : ${err.message}`);
      await fetchProfiles();
    } finally {
      setSavingProfileId(null);
    }
  };

  const handleTogglePermission = async (profile: ParsedCollaboratorProfile, permissionId: string) => {
    if (profile.role === 'admin') return;

    const currentPermissions = profile.permissions || [];
    const newPermissions = currentPermissions.includes(permissionId)
      ? currentPermissions.filter((p) => p !== permissionId)
      : [...currentPermissions, permissionId];

    // Optimistic update
    setProfiles((prev) =>
      prev.map((p) => (p.id === profile.id ? { ...p, permissions: newPermissions, configured: true } : p))
    );
    setSavingProfileId(profile.id);

    try {
      if (profile.isPendingBind) {
        await upsertPendingCollaboratorInAdmin(supabase, {
          email: profile.email,
          name: profile.name,
          phone: profile.phone,
          role: profile.role,
          permissions: newPermissions,
          created_at: profile.created_at,
        });
      } else {
        const serializedPerms = buildProfilePermissionsArray(
          newPermissions,
          {
            name: profile.name,
            email: profile.email,
            phone: profile.phone,
            configured: true,
          },
          profile.rawPermissions
        );

        const { data: updated, error } = await supabase
          .from('profiles')
          .update({ permissions: serializedPerms })
          .eq('id', profile.id)
          .select('*');

        if (error) throw error;
        if (!updated || updated.length === 0) {
          throw new Error('Mise à jour refusée ou profil introuvable.');
        }
      }

      await fetchProfiles();
      window.dispatchEvent(new Event('reforme-team-updated'));
      showTeamToast('success', 'Permissions enregistrées avec succès.');
    } catch (err: any) {
      console.error('Permission update error:', err);
      showTeamToast('error', `Erreur lors de la sauvegarde des permissions : ${err.message}`);
      await fetchProfiles();
    } finally {
      setSavingProfileId(null);
    }
  };

  const handleOpenEditCollab = (profile: ParsedCollaboratorProfile) => {
    setCollabToEdit(profile);
    setEditCollabError('');
    setShowEditCollabPassword(false);
    setEditCollabData({
      name: profile.name || '',
      email: profile.email || '',
      phone: profile.phone || '',
      role: profile.role || 'therapeute',
      newPassword: '',
    });
    setIsEditCollabModalOpen(true);
  };

  const executeEditCollab = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!collabToEdit) return;

    setEditCollabLoading(true);
    setEditCollabError('');

    try {
      const nextRole = isPrimaryAdminEmail(editCollabData.email) ? 'admin' : editCollabData.role;
      const nextEmail = editCollabData.email.trim().toLowerCase();
      const trimmedNewPassword = editCollabData.newPassword.trim();

      if (trimmedNewPassword.length > 0 && trimmedNewPassword.length < 6) {
        throw new Error('Le nouveau mot de passe doit contenir au moins 6 caractères.');
      }

      const nextModulePerms =
        nextRole === 'admin'
          ? PERMISSIONS_LIST.map((p) => p.id)
          : collabToEdit.permissions.length > 0
          ? collabToEdit.permissions
          : getDefaultPermissionsForRole(nextRole);

      const isEditingOwnActiveSession =
        !collabToEdit.isPendingBind && Boolean(currentUser?.id && currentUser.id === collabToEdit.id);

      let passwordWasUpdated = false;

      if (trimmedNewPassword.length >= 6 && !isEditingOwnActiveSession) {
        if (!nextEmail || !nextEmail.includes('@')) {
          throw new Error('Veuillez saisir une adresse email valide pour définir un mot de passe.');
        }
        if (blockedEmails.includes(nextEmail)) {
          throw new Error(`L'adresse ${nextEmail} figure dans les accès bloqués.`);
        }
        if (collabToEdit.isPendingBind && collabToEdit.email && collabToEdit.email.toLowerCase() !== nextEmail) {
          await removePendingCollaboratorFromAdmin(supabase, collabToEdit.email);
        }

        await provisionCollaboratorCredentials(supabase, supabaseUrl, supabaseAnonKey, {
          displayEmail: nextEmail,
          password: trimmedNewPassword,
          role: nextRole,
          modulePermissions: nextModulePerms,
          name: editCollabData.name.trim(),
          phone: editCollabData.phone.trim(),
          existingProfile: collabToEdit,
        });
        passwordWasUpdated = true;
      } else {
        if (trimmedNewPassword.length >= 6 && isEditingOwnActiveSession) {
          const { error: pwErr } = await supabase.auth.updateUser({ password: trimmedNewPassword });
          if (pwErr) throw pwErr;
          passwordWasUpdated = true;
        }

        if (collabToEdit.isPendingBind) {
          if (!nextEmail || !nextEmail.includes('@')) {
            throw new Error('Veuillez saisir une adresse email valide.');
          }
          if (collabToEdit.email && collabToEdit.email.toLowerCase() !== nextEmail) {
            await removePendingCollaboratorFromAdmin(supabase, collabToEdit.email);
          }
          await upsertPendingCollaboratorInAdmin(supabase, {
            email: nextEmail,
            name: editCollabData.name.trim(),
            phone: editCollabData.phone.trim(),
            role: nextRole,
            permissions: nextModulePerms,
            created_at: collabToEdit.created_at,
          });
        } else {
          const serializedPerms = buildProfilePermissionsArray(
            nextModulePerms,
            {
              name: editCollabData.name.trim(),
              email: nextEmail,
              phone: editCollabData.phone.trim(),
              configured: true,
            },
            collabToEdit.rawPermissions
          );

          const { data: updated, error } = await supabase
            .from('profiles')
            .update({
              role: nextRole,
              permissions: serializedPerms,
            })
            .eq('id', collabToEdit.id)
            .select('*');

          if (error) throw error;
          if (!updated || updated.length === 0) {
            throw new Error('Aucune ligne mise à jour.');
          }
        }
      }

      await fetchProfiles();
      window.dispatchEvent(new Event('reforme-team-updated'));
      setIsEditCollabModalOpen(false);
      setCollabToEdit(null);
      showTeamToast(
        'success',
        passwordWasUpdated
          ? 'Collaborateur et nouveau mot de passe enregistrés avec succès.'
          : 'Informations du collaborateur enregistrées avec succès.'
      );
    } catch (err: any) {
      console.error('Edit collab error:', err);
      setEditCollabError(err.message || 'Erreur lors de la modification.');
    } finally {
      setEditCollabLoading(false);
    }
  };

  const handleOpenDeleteCollab = (profile: ParsedCollaboratorProfile) => {
    setCollabToDelete(profile);
    setDeleteCollabError('');
    setIsDeleteCollabModalOpen(true);
  };

  const executeDeleteCollab = async () => {
    if (!collabToDelete) return;
    if (currentUser && collabToDelete.id === currentUser.id) {
      setDeleteCollabError('Vous ne pouvez pas supprimer votre propre compte administrateur actif.');
      return;
    }

    setDeleteCollabLoading(true);
    setDeleteCollabError('');

    try {
      if (collabToDelete.isPendingBind) {
        await removePendingCollaboratorFromAdmin(supabase, collabToDelete.email);
      } else {
        const { error } = await supabase.from('profiles').delete().eq('id', collabToDelete.id);
        if (error) throw error;
        if (collabToDelete.email) {
          await removePendingCollaboratorFromAdmin(supabase, collabToDelete.email);
        }
      }

      await fetchProfiles();
      setIsDeleteCollabModalOpen(false);
      setCollabToDelete(null);
      showTeamToast('success', 'Accès collaborateur révoqué et supprimé avec succès.');
    } catch (err: any) {
      console.error('Delete collab error:', err);
      setDeleteCollabError(err.message || 'Impossible de supprimer ce collaborateur.');
    } finally {
      setDeleteCollabLoading(false);
    }
  };

  const handleBlockEmailSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const target = emailToBlockInput.trim().toLowerCase();
    if (!target || !target.includes('@')) {
      showTeamToast('error', 'Veuillez saisir une adresse email valide à bloquer.');
      return;
    }
    if (isPrimaryAdminEmail(target) || (currentUser?.email && currentUser.email.trim().toLowerCase() === target)) {
      showTeamToast('error', 'Vous ne pouvez pas bloquer un compte administrateur principal.');
      return;
    }

    setBlockActionLoading(true);
    try {
      await blockCollaboratorEmail(supabase, target);
      setEmailToBlockInput('');
      await fetchProfiles();
      showTeamToast('success', `L'accès pour ${target} est désormais bloqué.`);
    } catch (err: any) {
      showTeamToast('error', err.message || 'Erreur lors du blocage de cette adresse email.');
    } finally {
      setBlockActionLoading(false);
    }
  };

  const handleBlockCollaboratorRow = async (profile: ParsedCollaboratorProfile) => {
    if (!profile.email) {
      showTeamToast('error', "Veuillez d'abord renseigner l'email de ce collaborateur ou supprimer directement son profil.");
      return;
    }
    if (isPrimaryAdminEmail(profile.email) || currentUser?.id === profile.id) {
      showTeamToast('error', 'Vous ne pouvez pas bloquer un compte administrateur principal.');
      return;
    }

    setBlockActionLoading(true);
    try {
      await blockCollaboratorEmail(supabase, profile.email);
      if (!profile.isPendingBind) {
        await supabase.from('profiles').delete().eq('id', profile.id);
      }
      await fetchProfiles();
      showTeamToast('success', `L'accès de ${profile.email} a été immédiatement bloqué.`);
    } catch (err: any) {
      showTeamToast('error', err.message || 'Erreur lors du blocage du collaborateur.');
    } finally {
      setBlockActionLoading(false);
    }
  };

  const handleUnblockEmail = async (targetEmail: string) => {
    setBlockActionLoading(true);
    try {
      await unblockCollaboratorEmail(supabase, targetEmail);
      await fetchProfiles();
      showTeamToast('success', `Le blocage de ${targetEmail} a été levé.`);
    } catch (err: any) {
      showTeamToast('error', err.message || 'Erreur lors du déblocage.');
    } finally {
      setBlockActionLoading(false);
    }
  };

  // ============================================================================
  // 3. NOUVEAU COLLABORATEUR (CRÉATION DE COMPTE + PROFIL + PRATICIEN)
  // ============================================================================

  const handleSelectNewCollabRole = (selectedRole: string) => {
    setRole(selectedRole);
    setNewCollabPermissions(getDefaultPermissionsForRole(selectedRole));
  };

  const handleToggleNewCollabPerm = (permId: string) => {
    if (role === 'admin') return;
    setNewCollabPermissions((prev) =>
      prev.includes(permId) ? prev.filter((p) => p !== permId) : [...prev, permId]
    );
  };

  const handleCreateAccount = async (e: React.FormEvent) => {
    e.preventDefault();

    const cleanEmail = email.trim().toLowerCase();
    const cleanPrenom = collabPrenom.trim();
    const cleanNom = collabNom.trim();
    const cleanPhone = collabPhone.trim();
    const cleanSpecialite = collabSpecialite.trim();
    const fullName = `${cleanPrenom} ${cleanNom}`.trim();

    if (!cleanEmail || !cleanEmail.includes('@')) {
      setMessage({ type: 'error', text: 'Veuillez saisir une adresse email valide (ex: nom@cabinet.ma).' });
      return;
    }
    if (blockedEmails.includes(cleanEmail)) {
      setMessage({
        type: 'error',
        text: `L'adresse ${cleanEmail} figure dans les accès bloqués. Débloquez-la d'abord dans « Gestion de l'équipe » si vous souhaitez lui redonner accès.`,
      });
      return;
    }
    if (!password || password.length < 6) {
      setMessage({ type: 'error', text: 'Le mot de passe doit contenir au moins 6 caractères.' });
      return;
    }
    if (role === 'therapeute' && alsoAddAsTherapist && (!cleanNom || !cleanPrenom)) {
      setMessage({
        type: 'error',
        text: 'Veuillez renseigner le Prénom et le Nom pour ajouter ce thérapeute à la liste des praticiens.',
      });
      return;
    }

    setCreateLoading(true);
    setMessage({ type: '', text: '' });

    try {
      const effectiveRole = isPrimaryAdminEmail(cleanEmail) ? 'admin' : role;
      const modulePerms =
        effectiveRole === 'admin' ? PERMISSIONS_LIST.map((p) => p.id) : newCollabPermissions;

      const existingMatch = profiles.find(
        (p) => p.email && p.email.trim().toLowerCase() === cleanEmail
      );

      let provisionResult: { userId: string; authEmail: string; usedVersionedAlias: boolean };
      try {
        provisionResult = await provisionCollaboratorCredentials(
          supabase,
          supabaseUrl,
          supabaseAnonKey,
          {
            displayEmail: cleanEmail,
            password,
            role: effectiveRole,
            modulePermissions: modulePerms,
            name: fullName,
            phone: cleanPhone,
            existingProfile: existingMatch || null,
          }
        );
      } catch (provErr: any) {
        if ((provErr?.message || '').toLowerCase().includes('rate limit')) {
          throw new Error(
            "Limite d'envoi d'emails Supabase atteinte temporairement. Astuce : utilisez une adresse interne du type prenom.nom@reforme.center."
          );
        }
        throw provErr;
      }

      // Optionally add to `therapists` if role is 'therapeute' and not already registered
      let addedPractitioner = false;
      if (effectiveRole === 'therapeute' && alsoAddAsTherapist && cleanNom && cleanPrenom) {
        const alreadyExists = therapists.some(
          (t) =>
            (t.email && t.email.trim().toLowerCase() === cleanEmail) ||
            (t.nom?.trim().toLowerCase() === cleanNom.toLowerCase() &&
              t.prenom?.trim().toLowerCase() === cleanPrenom.toLowerCase())
        );

        if (!alreadyExists) {
          const { error: thError } = await supabase.from('therapists').insert([
            {
              nom: cleanNom,
              prenom: cleanPrenom,
              specialite: cleanSpecialite || 'Kinésithérapeute',
              email: cleanEmail,
              tel: cleanPhone,
            },
          ]);
          if (!thError) {
            addedPractitioner = true;
          }
        }
      }

      const updatedTherapists = await fetchTherapists();
      await fetchProfiles(updatedTherapists);

      setMessage({
        type: 'success',
        text: provisionResult.usedVersionedAlias
          ? `Accès collaborateur (${cleanEmail}) mis à jour avec le nouveau mot de passe défini !`
          : addedPractitioner
          ? `Compte collaborateur (${cleanEmail}) créé avec succès et ajouté à la liste des praticiens !`
          : `Compte collaborateur (${cleanEmail}) créé et configuré avec succès !`,
      });

      setCollabPrenom('');
      setCollabNom('');
      setCollabPhone('');
      setCollabSpecialite('');
      setEmail('');
      setPassword('');
    } catch (err: any) {
      console.error('Error creating collaborator:', err);
      setMessage({
        type: 'error',
        text: err.message || 'Erreur lors de la création du compte collaborateur.',
      });
    } finally {
      setCreateLoading(false);
    }
  };

  // ============================================================================
  // 4. IMPORT CSV & NETTOYAGE DOUBLONS
  // ============================================================================

  const handleImportCSV = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setImportLoading(true);
    setImportMessage({ type: '', text: '' });

    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: async (results) => {
        try {
          const { data: existingPatients, error: pError } = await supabase
            .from('patients')
            .select('id, nom, prenom');
          if (pError) throw pError;

          const rows = results.data as any[];
          const newAppointments = [];
          const billingsMap: { [key: string]: any } = {};
          let errorCount = 0;
          let currentAppIndex = 0;

          for (const row of rows) {
            const findVal = (keys: string[]) => {
              const key = Object.keys(row).find((k) => keys.includes(k.toLowerCase().trim()));
              return key ? row[key] : null;
            };

            const nomPatient = findVal(['nom patient', 'nom', 'patient nom', 'last name'])?.trim();
            const prenomPatient = findVal([
              'prenom patient',
              'prénom patient',
              'prenom',
              'prénom',
              'first name',
            ])?.trim();
            const dateSeance = findVal(['date', 'date seance', 'date de séance', 'appointment date']);
            const heureSeance =
              findVal(['heure', 'time', 'heure seance', 'appointment time']) || '08:00';
            const motif =
              findVal(['motif', 'notes', 'notes seance', 'description', 'raison']) ||
              'Séance de suivi';
            const statut = findVal(['statut', 'status', 'état']) || 'Effectué';

            const montantStr = findVal([
              'montant',
              'prix',
              'tarif',
              'price',
              'amount',
              'règlement',
              'reglement',
            ]);
            const typePaiementStr = findVal([
              'type paiement',
              'methode paiement',
              'moyen de paiement',
              'type de règlement',
              'type de reglement',
            ]);
            const statutPaiementStr = findVal([
              'statut paiement',
              'etat paiement',
              'payment status',
              'statut règlement',
            ]);

            if (!nomPatient || !dateSeance) {
              errorCount++;
              continue;
            }

            const patient = existingPatients.find(
              (p) =>
                p.nom?.toLowerCase() === nomPatient.toLowerCase() &&
                p.prenom?.toLowerCase() === prenomPatient?.toLowerCase()
            );

            if (!patient) {
              errorCount++;
              continue;
            }

            let isoDate = null;
            try {
              let datePart = dateSeance;
              if (dateSeance.includes('/')) {
                const parts = dateSeance.split('/');
                if (parts.length === 3) {
                  datePart = `${parts[2]}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`;
                }
              }
              const dateTimeString = `${datePart}T${heureSeance.padStart(5, '0')}:00`;
              isoDate = new Date(dateTimeString).toISOString();
            } catch {
              errorCount++;
              continue;
            }

            let finalStatut = 'Effectué';
            const sLow = statut.toLowerCase();
            if (sLow.includes('annul') || sLow.includes('cancel')) finalStatut = 'Annulé';
            if (sLow.includes('confirm')) finalStatut = 'Confirmé';
            if (sLow.includes('impay') || sLow.includes('non pay')) finalStatut = 'Impayé';

            newAppointments.push({
              patient_id: patient.id,
              date_heure: isoDate,
              duree: 30,
              notes_seance: motif,
              statut: finalStatut,
            });

            if (montantStr) {
              const montantNum = parseFloat(
                montantStr
                  .toString()
                  .replace(',', '.')
                  .replace(/[^0-9.-]+/g, '')
              );
              if (!isNaN(montantNum)) {
                let finalTypePaiement = 'Patient';
                if (typePaiementStr) {
                  const tpLow = typePaiementStr.toString().toLowerCase();
                  if (tpLow.includes('tiers') || tpLow.includes('payant'))
                    finalTypePaiement = 'Tiers-payant';
                  if (tpLow.includes('hors') || tpLow.includes('nomenclature'))
                    finalTypePaiement = 'Hors nomenclature';
                  if (tpLow.includes('mutuelle')) finalTypePaiement = 'Mutuelle';
                }

                let finalStatutPaiement = 'En attente';
                if (statutPaiementStr) {
                  const spLow = statutPaiementStr.toString().toLowerCase();
                  if (spLow.includes('payé') || spLow.includes('reglé') || spLow.includes('réglé'))
                    finalStatutPaiement = 'Payé';
                  if (spLow.includes('rejet')) finalStatutPaiement = 'Rejeté';
                } else {
                  finalStatutPaiement = 'Payé';
                }

                billingsMap[currentAppIndex] = {
                  patient_id: patient.id,
                  montant: montantNum,
                  type_paiement: finalTypePaiement,
                  statut: finalStatutPaiement,
                  date_facturation: isoDate,
                };
              }
            }

            currentAppIndex++;
          }

          if (newAppointments.length === 0) {
            throw new Error(
              `Aucune séance valide trouvée. ${errorCount} lignes ignorées (patient non trouvé ou format date invalide).`
            );
          }

          const { data: insertedApps, error: insertError } = await supabase
            .from('appointments')
            .insert(newAppointments)
            .select('id');
          if (insertError) throw insertError;

          let totalBillings = 0;
          if (insertedApps && insertedApps.length > 0) {
            const billingsToInsert = [];
            for (let i = 0; i < insertedApps.length; i++) {
              if (billingsMap[i]) {
                billingsToInsert.push({
                  ...billingsMap[i],
                  appointment_id: insertedApps[i].id,
                });
              }
            }

            if (billingsToInsert.length > 0) {
              const { error: billError } = await supabase.from('billings').insert(billingsToInsert);
              if (!billError) {
                totalBillings = billingsToInsert.length;
              }
            }
          }

          setImportMessage({
            type: 'success',
            text: `${newAppointments.length} séances importées avec succès (et ${totalBillings} règlements) ! ${
              errorCount > 0 ? `(${errorCount} ignorées).` : ''
            }`,
          });
        } catch (err: any) {
          setImportMessage({ type: 'error', text: err.message || "Erreur lors de l'import." });
        } finally {
          setImportLoading(false);
          if (fileInputRef.current) fileInputRef.current.value = '';
        }
      },
      error: (error) => {
        setImportMessage({
          type: 'error',
          text: 'Erreur de lecture du fichier CSV : ' + error.message,
        });
        setImportLoading(false);
        if (fileInputRef.current) fileInputRef.current.value = '';
      },
    });
  };

  const handleRemoveDuplicates = async () => {
    setDedupLoading(true);
    setDedupMessage({ type: '', text: '' });
    try {
      const { data, error } = await supabase
        .from('appointments')
        .select('id, patient_id, date_heure, created_at')
        .order('created_at', { ascending: true });

      if (error) throw error;

      if (!data || data.length === 0) {
        setDedupMessage({ type: 'success', text: 'Aucune séance trouvée.' });
        return;
      }

      const seen = new Set();
      const toDelete: string[] = [];

      for (const app of data) {
        const key = `${app.patient_id}_${app.date_heure}`;
        if (seen.has(key)) {
          toDelete.push(app.id);
        } else {
          seen.add(key);
        }
      }

      if (toDelete.length === 0) {
        setDedupMessage({ type: 'success', text: 'Aucun doublon trouvé. Votre base est saine !' });
        return;
      }

      let deletedCount = 0;
      const batchSize = 100;
      for (let i = 0; i < toDelete.length; i += batchSize) {
        const batch = toDelete.slice(i, i + batchSize);
        const { error: delError } = await supabase.from('appointments').delete().in('id', batch);
        if (delError) throw delError;
        deletedCount += batch.length;
      }

      setDedupMessage({
        type: 'success',
        text: `${deletedCount} séance(s) en doublon supprimée(s) avec succès !`,
      });
    } catch (e: any) {
      setDedupMessage({ type: 'error', text: e.message || 'Erreur lors du nettoyage.' });
    } finally {
      setDedupLoading(false);
    }
  };

  const getRoleBadge = (roleName: string) => {
    if (roleName === 'admin') {
      return (
        <span className="bg-purple-100 text-purple-700 text-xs font-bold px-2.5 py-0.5 rounded-full">
          Administrateur
        </span>
      );
    }
    if (roleName === 'secretaire') {
      return (
        <span className="bg-amber-100 text-amber-800 text-xs font-bold px-2.5 py-0.5 rounded-full">
          Secrétaire
        </span>
      );
    }
    return (
      <span className="bg-sky-100 text-sky-700 text-xs font-bold px-2.5 py-0.5 rounded-full">
        Thérapeute
      </span>
    );
  };

  const getCollaboratorTitle = (p: ParsedCollaboratorProfile, index: number) => {
    if (p.name) return p.name;
    if (p.email) return p.email;
    const roleLabel =
      p.role === 'admin' ? 'Administrateur' : p.role === 'secretaire' ? 'Secrétaire' : 'Thérapeute';
    return `${roleLabel} #${index + 1}`;
  };

  return (
    <div className="p-4 sm:p-8 max-w-7xl mx-auto font-sans">
      <div className="mb-8 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Paramètres du cabinet</h1>
          <p className="text-slate-500 mt-1">
            Gérez votre équipe, vos praticiens, les permissions et la mise en page de vos documents.
          </p>
        </div>
        <Button
          type="button"
          onClick={() => {
            setMessage({ type: '', text: '' });
            setActiveTab('create');
          }}
          className="w-full sm:w-auto gap-2"
        >
          <UserPlus className="h-4 w-4" />
          Nouveau collaborateur
        </Button>
      </div>

      <div className="flex flex-col md:flex-row gap-8">
        {/* Sidebar Settings */}
        <div className="w-full md:w-64 flex-shrink-0 space-y-2">
          <button
            type="button"
            onClick={() => setActiveTab('equipe')}
            className={`w-full flex items-center justify-between px-4 py-3 rounded-xl text-sm font-semibold transition-colors ${
              activeTab === 'equipe'
                ? 'bg-primary-50 text-primary-700'
                : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
            }`}
          >
            <span className="flex items-center gap-3">
              <Users className={`h-5 w-5 ${activeTab === 'equipe' ? 'text-primary-600' : 'text-slate-400'}`} />
              Gestion de l'équipe
            </span>
            <span className="text-xs font-bold bg-white/80 text-slate-600 px-2 py-0.5 rounded-full border border-slate-200">
              {profiles.length}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('praticiens')}
            className={`w-full flex items-center justify-between px-4 py-3 rounded-xl text-sm font-semibold transition-colors ${
              activeTab === 'praticiens'
                ? 'bg-primary-50 text-primary-700'
                : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
            }`}
          >
            <span className="flex items-center gap-3">
              <Stethoscope
                className={`h-5 w-5 ${activeTab === 'praticiens' ? 'text-primary-600' : 'text-slate-400'}`}
              />
              Gestion des praticiens
            </span>
            <span className="text-xs font-bold bg-white/80 text-slate-600 px-2 py-0.5 rounded-full border border-slate-200">
              {therapists.length}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('create')}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-semibold transition-colors ${
              activeTab === 'create'
                ? 'bg-primary-50 text-primary-700'
                : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
            }`}
          >
            <UserPlus className={`h-5 w-5 ${activeTab === 'create' ? 'text-primary-600' : 'text-slate-400'}`} />
            Nouveau collaborateur
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('documents')}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-semibold transition-colors ${
              activeTab === 'documents'
                ? 'bg-primary-50 text-primary-700'
                : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
            }`}
          >
            <FileText className={`h-5 w-5 ${activeTab === 'documents' ? 'text-primary-600' : 'text-slate-400'}`} />
            Factures & Calendrier
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('import')}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-semibold transition-colors ${
              activeTab === 'import'
                ? 'bg-primary-50 text-primary-700'
                : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
            }`}
          >
            <Database className={`h-5 w-5 ${activeTab === 'import' ? 'text-primary-600' : 'text-slate-400'}`} />
            Import CSV
          </button>
        </div>

        {/* Content Area */}
        <div className="flex-1 min-w-0">
          {/* ============================================================== */}
          {/* TAB 1 : GESTION DE L'ÉQUIPE                                    */}
          {/* ============================================================== */}
          {activeTab === 'equipe' && (
            <div className="space-y-6">
            <Card className="border-0 shadow-sm rounded-2xl overflow-hidden">
              <CardHeader className="bg-white border-b border-slate-100 pb-5">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                  <div>
                    <CardTitle className="text-lg flex items-center gap-2">
                      <Shield className="h-5 w-5 text-primary-500" />
                      Répartition des rôles et permissions
                    </CardTitle>
                    <p className="text-sm text-slate-500 mt-1">
                      Cochez les modules autorisés, modifiez l'identité ou révoquez un accès collaborateur.
                    </p>
                  </div>
                </div>

                {teamFeedback.text && (
                  <div
                    className={`mt-4 p-3 rounded-xl flex items-center gap-2.5 text-sm ${
                      teamFeedback.type === 'error'
                        ? 'bg-rose-50 text-rose-700 border border-rose-200'
                        : 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                    }`}
                  >
                    {teamFeedback.type === 'error' ? (
                      <AlertCircle className="h-4 w-4 flex-shrink-0" />
                    ) : (
                      <CheckCircle className="h-4 w-4 flex-shrink-0" />
                    )}
                    <span className="font-medium">{teamFeedback.text}</span>
                  </div>
                )}
              </CardHeader>

              <CardContent className="p-0">
                {loading ? (
                  <div className="p-10 flex flex-col items-center justify-center gap-2">
                    <Activity className="h-8 w-8 text-primary-500 animate-pulse" />
                    <span className="text-sm text-slate-500">Chargement de l'équipe...</span>
                  </div>
                ) : (
                  <div className="divide-y divide-slate-100">
                    {profiles.length === 0 ? (
                      <div className="p-8 text-center text-slate-500">
                        Aucun collaborateur enregistré. Cliquez sur « Nouveau collaborateur » pour ajouter un membre.
                      </div>
                    ) : (
                      profiles.map((profile, idx) => {
                        const isSelf = currentUser?.id === profile.id;
                        const displayTitle = getCollaboratorTitle(profile, idx);
                        const initials = displayTitle
                          .split(' ')
                          .map((part) => part[0])
                          .join('')
                          .slice(0, 2)
                          .toUpperCase();

                        return (
                          <div
                            key={profile.id}
                            className="p-6 flex flex-col gap-4 bg-white hover:bg-slate-50/70 transition-colors"
                          >
                            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                              <div className="flex items-start gap-3.5">
                                <div className="h-11 w-11 rounded-full bg-primary-100 text-primary-700 flex items-center justify-center font-bold text-sm flex-shrink-0">
                                  {initials || 'EQ'}
                                </div>
                                <div>
                                  <div className="flex flex-wrap items-center gap-2">
                                    <p className="font-bold text-slate-900 text-base">{displayTitle}</p>
                                    {getRoleBadge(profile.role)}
                                    {isSelf && (
                                      <span className="bg-emerald-100 text-emerald-800 text-[11px] font-bold px-2 py-0.5 rounded-full">
                                        Votre compte
                                      </span>
                                    )}
                                    {savingProfileId === profile.id && (
                                      <span className="text-xs text-primary-600 font-medium animate-pulse">
                                        Enregistrement...
                                      </span>
                                    )}
                                  </div>

                                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-1 text-xs text-slate-500">
                                    {profile.email ? (
                                      <span className="flex items-center gap-1 font-medium text-slate-600">
                                        <Mail className="h-3.5 w-3.5 text-slate-400" />
                                        {profile.email}
                                      </span>
                                    ) : (
                                      <button
                                        type="button"
                                        onClick={() => handleOpenEditCollab(profile)}
                                        className="text-primary-600 hover:underline font-medium flex items-center gap-1"
                                      >
                                        <Pencil className="h-3 w-3" /> Renseigner le nom / email
                                      </button>
                                    )}
                                    {profile.phone && (
                                      <span className="flex items-center gap-1 font-medium text-slate-600">
                                        <Phone className="h-3.5 w-3.5 text-slate-400" />
                                        {profile.phone}
                                      </span>
                                    )}
                                    <span>
                                      Ajouté le {new Date(profile.created_at).toLocaleDateString('fr-FR')}
                                    </span>
                                  </div>
                                </div>
                              </div>

                              <div className="flex items-center gap-2 self-end sm:self-center">
                                <select
                                  value={profile.role}
                                  disabled={savingProfileId === profile.id}
                                  onChange={(e) => handleUpdateRole(profile, e.target.value)}
                                  className="text-sm border border-slate-200 rounded-lg px-3 py-2 bg-white font-medium text-slate-700 focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 outline-none"
                                >
                                  <option value="admin">Administrateur</option>
                                  <option value="therapeute">Thérapeute</option>
                                  <option value="secretaire">Secrétaire</option>
                                </select>

                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="icon"
                                  onClick={() => handleOpenEditCollab(profile)}
                                  className="text-slate-500 hover:bg-slate-100 hover:text-primary-600"
                                  title="Modifier le nom, l'email ou le rôle"
                                >
                                  <Pencil className="h-4 w-4" />
                                </Button>

                                {!isSelf && profile.email && (
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    size="icon"
                                    disabled={blockActionLoading}
                                    onClick={() => handleBlockCollaboratorRow(profile)}
                                    className="text-amber-600 hover:bg-amber-50 hover:text-amber-700"
                                    title="Bloquer immédiatement cet email"
                                  >
                                    <Ban className="h-4 w-4" />
                                  </Button>
                                )}

                                {!isSelf && (
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    size="icon"
                                    onClick={() => handleOpenDeleteCollab(profile)}
                                    className="text-rose-500 hover:bg-rose-50 hover:text-rose-600"
                                    title="Supprimer ce collaborateur"
                                  >
                                    <Trash2 className="h-4 w-4" />
                                  </Button>
                                )}
                              </div>
                            </div>

                            {/* Permissions Checklist */}
                            <div className="mt-1 pt-4 border-t border-slate-100">
                              <div className="flex items-center justify-between mb-3">
                                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                                  Permissions d'accès aux modules
                                </p>
                                {profile.role === 'admin' && (
                                  <span className="text-xs text-purple-600 font-medium">
                                    Accès intégral activé d'office pour l'Administrateur
                                  </span>
                                )}
                              </div>
                              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
                                {PERMISSIONS_LIST.map((perm) => {
                                  const isAdmin = profile.role === 'admin';
                                  const hasPermission = isAdmin || profile.permissions?.includes(perm.id);
                                  return (
                                    <button
                                      type="button"
                                      key={perm.id}
                                      disabled={isAdmin || savingProfileId === profile.id}
                                      onClick={() => handleTogglePermission(profile, perm.id)}
                                      className={`flex items-center gap-2.5 p-2.5 rounded-xl border text-left transition-colors ${
                                        hasPermission
                                          ? 'bg-primary-50/80 border-primary-200 text-primary-800'
                                          : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                                      } ${isAdmin ? 'opacity-80 cursor-default' : 'cursor-pointer'}`}
                                    >
                                      {hasPermission ? (
                                        <CheckSquare className="h-4 w-4 text-primary-600 flex-shrink-0" />
                                      ) : (
                                        <Square className="h-4 w-4 text-slate-400 flex-shrink-0" />
                                      )}
                                      <span className="text-xs sm:text-sm font-medium">{perm.label}</span>
                                    </button>
                                  );
                                })}
                              </div>
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Blocked Emails / Revoked Access Section */}
            <Card className="border-0 shadow-sm rounded-2xl overflow-hidden">
              <CardHeader className="bg-white border-b border-slate-100 pb-5">
                <CardTitle className="text-lg flex items-center gap-2 text-slate-900">
                  <Ban className="h-5 w-5 text-rose-500" />
                  Accès bloqués ({blockedEmails.length})
                </CardTitle>
                <p className="text-sm text-slate-500 mt-1">
                  Toute adresse email figurant dans cette liste est immédiatement déconnectée et ne peut plus accéder à l'application.
                </p>
              </CardHeader>
              <CardContent className="p-6 space-y-5">
                <form onSubmit={handleBlockEmailSubmit} className="flex flex-col sm:flex-row gap-3">
                  <div className="relative flex-1">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                      <Mail className="h-4 w-4 text-slate-400" />
                    </div>
                    <input
                      type="email"
                      value={emailToBlockInput}
                      onChange={(e) => setEmailToBlockInput(e.target.value)}
                      placeholder="Ex: ancien.collaborateur@reforme.com"
                      className="block w-full pl-9 pr-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-rose-500/20 focus:border-rose-500 outline-none"
                    />
                  </div>
                  <Button
                    type="submit"
                    disabled={blockActionLoading || !emailToBlockInput.trim()}
                    className="bg-rose-600 hover:bg-rose-700 text-white gap-2"
                  >
                    <Ban className="h-4 w-4" />
                    Bloquer cet email
                  </Button>
                </form>

                {blockedEmails.length === 0 ? (
                  <p className="text-sm text-slate-500">Aucune adresse email bloquée actuellement.</p>
                ) : (
                  <div className="divide-y divide-slate-100 border border-slate-200 rounded-xl overflow-hidden">
                    {blockedEmails.map((blockedMail) => (
                      <div
                        key={blockedMail}
                        className="px-4 py-3 bg-rose-50/40 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                      >
                        <div className="flex items-center gap-2.5">
                          <Ban className="h-4 w-4 text-rose-600 flex-shrink-0" />
                          <span className="text-sm font-semibold text-slate-800">{blockedMail}</span>
                          <span className="bg-rose-100 text-rose-800 text-[11px] font-bold px-2 py-0.5 rounded-full">
                            Accès bloqué
                          </span>
                        </div>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          disabled={blockActionLoading}
                          onClick={() => handleUnblockEmail(blockedMail)}
                          className="bg-white border-slate-200 text-slate-700 hover:bg-slate-50 gap-1.5 self-end sm:self-center"
                        >
                          <Unlock className="h-3.5 w-3.5" />
                          Débloquer
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
            </div>
          )}

          {/* ============================================================== */}
          {/* TAB 2 : GESTION DES PRATICIENS                                 */}
          {/* ============================================================== */}
          {activeTab === 'praticiens' && (
            <div className="space-y-6">
              <Card className="border-0 shadow-sm rounded-2xl overflow-hidden">
                <CardHeader className="bg-white border-b border-slate-100 pb-6">
                  <CardTitle className="text-lg flex items-center gap-2">
                    <Stethoscope className="h-5 w-5 text-primary-500" />
                    Ajouter un praticien
                  </CardTitle>
                  <p className="text-sm text-slate-500 mt-1.5">
                    Définissez les praticiens qui apparaîtront dans l'agenda, les statistiques et les dossiers patients.
                  </p>
                </CardHeader>
                <CardContent className="p-6">
                  <form onSubmit={handleAddTherapist} className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {therapistMessage.text && (
                      <div
                        className={`sm:col-span-2 p-3.5 rounded-xl flex items-center gap-3 text-sm ${
                          therapistMessage.type === 'error'
                            ? 'bg-rose-50 text-rose-700 border border-rose-200'
                            : 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                        }`}
                      >
                        {therapistMessage.type === 'error' ? (
                          <AlertCircle className="h-4 w-4 flex-shrink-0" />
                        ) : (
                          <CheckCircle className="h-4 w-4 flex-shrink-0" />
                        )}
                        <span className="font-medium">{therapistMessage.text}</span>
                      </div>
                    )}

                    <div className="space-y-1.5">
                      <label className="text-sm font-semibold text-slate-700">Nom *</label>
                      <input
                        type="text"
                        required
                        value={newTherapist.nom}
                        onChange={(e) => setNewTherapist({ ...newTherapist, nom: e.target.value })}
                        className="block w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 outline-none"
                        placeholder="Ex: HADDAOUI"
                      />
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-sm font-semibold text-slate-700">Prénom *</label>
                      <input
                        type="text"
                        required
                        value={newTherapist.prenom}
                        onChange={(e) => setNewTherapist({ ...newTherapist, prenom: e.target.value })}
                        className="block w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 outline-none"
                        placeholder="Ex: Younes"
                      />
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-sm font-semibold text-slate-700">Spécialité</label>
                      <input
                        type="text"
                        value={newTherapist.specialite}
                        onChange={(e) => setNewTherapist({ ...newTherapist, specialite: e.target.value })}
                        className="block w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 outline-none"
                        placeholder="Ex: Kinésithérapeute du sport"
                      />
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-sm font-semibold text-slate-700">Téléphone</label>
                      <input
                        type="tel"
                        value={newTherapist.tel}
                        onChange={(e) => setNewTherapist({ ...newTherapist, tel: e.target.value })}
                        className="block w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 outline-none"
                        placeholder="06..."
                      />
                    </div>

                    <div className="space-y-1.5 sm:col-span-2">
                      <label className="text-sm font-semibold text-slate-700">Email</label>
                      <input
                        type="email"
                        value={newTherapist.email}
                        onChange={(e) => setNewTherapist({ ...newTherapist, email: e.target.value })}
                        className="block w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 outline-none"
                        placeholder="praticien@cabinet.ma"
                      />
                    </div>

                    <div className="sm:col-span-2 pt-1">
                      <Button type="submit" disabled={therapistLoading} className="w-full sm:w-auto">
                        <Plus className="h-4 w-4 mr-2" />
                        {therapistLoading ? 'Ajout en cours...' : 'Ajouter le praticien'}
                      </Button>
                    </div>
                  </form>
                </CardContent>
              </Card>

              <Card className="border-0 shadow-sm rounded-2xl overflow-hidden">
                <CardHeader className="bg-white border-b border-slate-100 pb-5">
                  <CardTitle className="text-lg">
                    Liste des praticiens ({therapists.length})
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                  <div className="divide-y divide-slate-100">
                    {therapists.length === 0 ? (
                      <div className="p-8 text-center text-slate-500">Aucun praticien enregistré.</div>
                    ) : (
                      therapists.map((t) => {
                        const initials = `${t.prenom?.[0] || ''}${t.nom?.[0] || ''}`.toUpperCase() || 'PR';
                        const hasCollabAccount =
                          t.email &&
                          profiles.some(
                            (p) => p.email && p.email.trim().toLowerCase() === t.email.trim().toLowerCase()
                          );

                        return (
                          <div
                            key={t.id}
                            className="p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 hover:bg-slate-50 transition-colors"
                          >
                            <div className="flex items-center gap-3.5">
                              <div className="h-11 w-11 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-700 font-bold text-sm flex-shrink-0">
                                {initials}
                              </div>
                              <div>
                                <div className="flex flex-wrap items-center gap-2">
                                  <p className="font-bold text-slate-900">
                                    {t.prenom} {t.nom}
                                  </p>
                                  {hasCollabAccount && (
                                    <span className="bg-emerald-50 text-emerald-700 border border-emerald-200 text-[11px] font-semibold px-2 py-0.5 rounded-full">
                                      Accès actif
                                    </span>
                                  )}
                                </div>
                                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500 mt-1">
                                  <span className="bg-slate-100 px-2 py-0.5 rounded text-slate-600 border border-slate-200">
                                    {t.specialite || 'Kinésithérapeute'}
                                  </span>
                                  {t.tel && (
                                    <span className="flex items-center gap-1 font-medium">
                                      <Phone className="h-3 w-3" /> {t.tel}
                                    </span>
                                  )}
                                  {t.email && (
                                    <span className="flex items-center gap-1 font-medium">
                                      <Mail className="h-3 w-3" /> {t.email}
                                    </span>
                                  )}
                                </div>
                              </div>
                            </div>

                            <div className="flex items-center gap-1.5 self-end sm:self-center">
                              {!hasCollabAccount && (
                                <Button
                                  type="button"
                                  variant="outline"
                                  size="sm"
                                  onClick={() => handlePrepareCollaboratorFromTherapist(t)}
                                  className="text-xs gap-1.5 mr-1"
                                  title="Créer un compte de connexion pour ce praticien"
                                >
                                  <KeyRound className="h-3.5 w-3.5 text-primary-600" />
                                  Créer un accès
                                </Button>
                              )}
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                onClick={() => handleOpenEditTherapist(t)}
                                className="text-slate-500 hover:bg-slate-100 hover:text-indigo-600"
                                title="Modifier"
                              >
                                <Pencil className="h-4 w-4" />
                              </Button>
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                onClick={() => handleOpenDeleteTherapist(t)}
                                className="text-rose-500 hover:bg-rose-50 hover:text-rose-600"
                                title="Supprimer"
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>
                </CardContent>
              </Card>
            </div>
          )}

          {/* ============================================================== */}
          {/* TAB 3 : NOUVEAU COLLABORATEUR                                  */}
          {/* ============================================================== */}
          {activeTab === 'create' && (
            <Card className="border-0 shadow-sm rounded-2xl overflow-hidden">
              <CardHeader className="bg-white border-b border-slate-100 pb-6">
                <CardTitle className="text-lg flex items-center gap-2">
                  <UserPlus className="h-5 w-5 text-primary-500" />
                  Créer un compte collaborateur
                </CardTitle>
                <p className="text-sm text-slate-500 mt-1.5">
                  Créez les identifiants de connexion d'un membre de l'équipe (Thérapeute, Secrétaire ou Administrateur) et choisissez ses permissions.
                </p>
              </CardHeader>

              <CardContent className="p-6">
                <form onSubmit={handleCreateAccount} className="space-y-6 max-w-2xl">
                  {message.text && (
                    <div
                      className={`p-4 rounded-xl flex items-start gap-3 text-sm ${
                        message.type === 'error'
                          ? 'bg-rose-50 text-rose-700 border border-rose-200'
                          : 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                      }`}
                    >
                      {message.type === 'error' ? (
                        <AlertCircle className="h-5 w-5 flex-shrink-0 mt-0.5" />
                      ) : (
                        <CheckCircle className="h-5 w-5 flex-shrink-0 mt-0.5" />
                      )}
                      <p className="font-medium">{message.text}</p>
                    </div>
                  )}

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <label className="text-sm font-semibold text-slate-700">Prénom</label>
                      <div className="relative">
                        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                          <User className="h-4 w-4 text-slate-400" />
                        </div>
                        <input
                          type="text"
                          value={collabPrenom}
                          onChange={(e) => setCollabPrenom(e.target.value)}
                          className="block w-full pl-9 pr-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 bg-slate-50 focus:bg-white outline-none"
                          placeholder="Ex: Hasna"
                        />
                      </div>
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-sm font-semibold text-slate-700">Nom</label>
                      <input
                        type="text"
                        value={collabNom}
                        onChange={(e) => setCollabNom(e.target.value)}
                        className="block w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 bg-slate-50 focus:bg-white outline-none"
                        placeholder="Ex: JAKOUM"
                      />
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-sm font-semibold text-slate-700">Adresse email de connexion *</label>
                      <div className="relative">
                        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                          <Mail className="h-4 w-4 text-slate-400" />
                        </div>
                        <input
                          type="email"
                          required
                          value={email}
                          onChange={(e) => setEmail(e.target.value)}
                          className="block w-full pl-9 pr-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 bg-slate-50 focus:bg-white outline-none"
                          placeholder="collaborateur@reforme.center"
                        />
                      </div>
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-sm font-semibold text-slate-700">Téléphone</label>
                      <div className="relative">
                        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                          <Phone className="h-4 w-4 text-slate-400" />
                        </div>
                        <input
                          type="tel"
                          value={collabPhone}
                          onChange={(e) => setCollabPhone(e.target.value)}
                          className="block w-full pl-9 pr-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 bg-slate-50 focus:bg-white outline-none"
                          placeholder="06..."
                        />
                      </div>
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-sm font-semibold text-slate-700">Mot de passe provisoire *</label>
                      <div className="relative">
                        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                          <Lock className="h-4 w-4 text-slate-400" />
                        </div>
                        <input
                          type={showPassword ? 'text' : 'password'}
                          required
                          minLength={6}
                          value={password}
                          onChange={(e) => setPassword(e.target.value)}
                          className="block w-full pl-9 pr-10 py-2.5 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 bg-slate-50 focus:bg-white outline-none"
                          placeholder="Minimum 6 caractères"
                        />
                        <button
                          type="button"
                          onClick={() => setShowPassword((prev) => !prev)}
                          className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-400 hover:text-slate-600"
                          title={showPassword ? 'Masquer' : 'Afficher'}
                        >
                          {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                        </button>
                      </div>
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-sm font-semibold text-slate-700">Rôle attribué *</label>
                      <select
                        value={role}
                        onChange={(e) => handleSelectNewCollabRole(e.target.value)}
                        className="block w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 bg-slate-50 focus:bg-white outline-none"
                      >
                        <option value="therapeute">Thérapeute</option>
                        <option value="secretaire">Secrétaire</option>
                        <option value="admin">Administrateur</option>
                      </select>
                    </div>
                  </div>

                  {role === 'therapeute' && (
                    <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-3">
                      <button
                        type="button"
                        onClick={() => setAlsoAddAsTherapist((prev) => !prev)}
                        className="flex items-center gap-2.5 text-sm font-semibold text-slate-800"
                      >
                        {alsoAddAsTherapist ? (
                          <CheckSquare className="h-4 w-4 text-primary-600 flex-shrink-0" />
                        ) : (
                          <Square className="h-4 w-4 text-slate-400 flex-shrink-0" />
                        )}
                        <span>Ajouter également ce thérapeute dans la liste des praticiens (Agenda)</span>
                      </button>

                      {alsoAddAsTherapist && (
                        <div className="space-y-1.5 pt-1">
                          <label className="text-xs font-semibold text-slate-600">Spécialité du praticien</label>
                          <input
                            type="text"
                            value={collabSpecialite}
                            onChange={(e) => setCollabSpecialite(e.target.value)}
                            className="block w-full px-3 py-2 border border-slate-200 rounded-xl text-sm bg-white focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 outline-none"
                            placeholder="Ex: Kinésithérapeute du sport"
                          />
                        </div>
                      )}
                    </div>
                  )}

                  {/* Initial Permissions Selector */}
                  <div className="space-y-2.5">
                    <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider block">
                      Permissions attribuées au compte
                    </label>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                      {PERMISSIONS_LIST.map((perm) => {
                        const isAdmin = role === 'admin';
                        const checked = isAdmin || newCollabPermissions.includes(perm.id);
                        return (
                          <button
                            type="button"
                            key={perm.id}
                            disabled={isAdmin}
                            onClick={() => handleToggleNewCollabPerm(perm.id)}
                            className={`flex items-center gap-2.5 p-2.5 rounded-xl border text-left transition-colors ${
                              checked
                                ? 'bg-primary-50 border-primary-200 text-primary-800'
                                : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                            } ${isAdmin ? 'opacity-80 cursor-default' : 'cursor-pointer'}`}
                          >
                            {checked ? (
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

                  <Button
                    type="submit"
                    className="w-full sm:w-auto h-11 px-8 text-base font-semibold"
                    disabled={createLoading}
                  >
                    {createLoading ? 'Création en cours...' : 'Créer le compte collaborateur'}
                  </Button>
                </form>
              </CardContent>
            </Card>
          )}

          {/* ============================================================== */}
          {/* TAB 4 : IMPORT CSV                                             */}
          {/* ============================================================== */}
          {activeTab === 'import' && (
            <Card className="border-0 shadow-sm rounded-2xl overflow-hidden">
              <CardHeader className="bg-white border-b border-slate-100 pb-6">
                <CardTitle className="text-lg flex items-center gap-2">
                  <Database className="h-5 w-5 text-primary-500" />
                  Importation des données
                </CardTitle>
                <p className="text-sm text-slate-500 mt-1.5">
                  Récupérez vos historiques de séances depuis d'anciens logiciels via un fichier Excel/CSV.
                </p>
              </CardHeader>
              <CardContent className="p-6">
                <div className="space-y-6">
                  {importMessage.text && (
                    <div
                      className={`p-4 rounded-xl flex items-start gap-3 text-sm ${
                        importMessage.type === 'success'
                          ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                          : 'bg-rose-50 text-rose-700 border border-rose-200'
                      }`}
                    >
                      {importMessage.type === 'success' ? (
                        <CheckCircle className="h-5 w-5 mt-0.5 flex-shrink-0" />
                      ) : (
                        <AlertCircle className="h-5 w-5 mt-0.5 flex-shrink-0" />
                      )}
                      <p>{importMessage.text}</p>
                    </div>
                  )}

                  <div className="bg-slate-50 p-6 rounded-xl border border-slate-200">
                    <h3 className="font-semibold text-slate-800 mb-2">
                      Import Historique des Séances (Agenda)
                    </h3>
                    <p className="text-sm text-slate-600 mb-4 leading-relaxed">
                      Associez vos anciennes séances à vos patients actuels. Le fichier (format <b>.csv</b>) doit contenir les colonnes suivantes :
                      <br />
                      <br />
                      <span className="font-mono bg-white px-2 py-1 rounded text-xs border border-slate-200 break-words mb-1 inline-block">
                        Date
                      </span>
                      <span className="font-mono bg-white px-2 py-1 rounded text-xs border border-slate-200 ml-2 mb-1 inline-block">
                        Heure
                      </span>
                      <span className="font-mono bg-white px-2 py-1 rounded text-xs border border-slate-200 ml-2 mb-1 inline-block">
                        Nom patient
                      </span>
                      <span className="font-mono bg-white px-2 py-1 rounded text-xs border border-slate-200 ml-2 mb-1 inline-block">
                        Prénom patient
                      </span>
                      <span className="font-mono bg-white px-2 py-1 rounded text-xs border border-slate-200 ml-2 mb-1 inline-block">
                        Motif
                      </span>
                      <span className="font-mono bg-white px-2 py-1 rounded text-xs border border-slate-200 ml-2 mb-1 inline-block">
                        Statut
                      </span>
                      <span className="font-mono bg-blue-50 px-2 py-1 rounded text-xs border border-blue-200 ml-2 mb-1 inline-block text-blue-700">
                        Montant (ex: 50)
                      </span>
                      <span className="font-mono bg-blue-50 px-2 py-1 rounded text-xs border border-blue-200 ml-2 mb-1 inline-block text-blue-700">
                        Type de paiement
                      </span>
                      <span className="font-mono bg-blue-50 px-2 py-1 rounded text-xs border border-blue-200 ml-2 mb-1 inline-block text-blue-700">
                        Statut paiement
                      </span>
                    </p>
                    <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 text-amber-800 p-3 flex-col sm:flex-row text-sm rounded-lg mb-6">
                      <AlertCircle className="h-4 w-4 mt-0.5 flex-shrink-0" />
                      <p>
                        <b>Attention :</b> Le patient <b>doit déjà exister</b> dans la base de données (onglet Patients) avec exactement la même orthographe pour nom et prénom.
                      </p>
                    </div>

                    <input
                      type="file"
                      ref={fileInputRef}
                      onChange={handleImportCSV}
                      accept=".csv"
                      className="hidden"
                    />

                    <Button
                      type="button"
                      variant="outline"
                      disabled={importLoading}
                      onClick={() => fileInputRef.current?.click()}
                      className="bg-white hover:bg-slate-50 w-full sm:w-auto"
                    >
                      {importLoading ? (
                        <>Importation en cours...</>
                      ) : (
                        <>
                          <Upload className="h-4 w-4 mr-2" />
                          Sélectionner le fichier CSV des séances
                        </>
                      )}
                    </Button>
                  </div>

                  {/* Deduplication Section */}
                  <div className="bg-white border border-slate-200 p-6 rounded-xl mt-8">
                    <h3 className="font-semibold text-slate-800 mb-2 flex items-center gap-2">
                      <Trash2 className="h-5 w-5 text-rose-500" />
                      Nettoyer les doublons
                    </h3>
                    <p className="text-sm text-slate-600 mb-4">
                      Si des doublons ont été créés lors d'une importation précédente (même patient, même date, même heure), vous pouvez les supprimer automatiquement.
                    </p>

                    {dedupMessage.text && (
                      <div
                        className={`p-3 rounded-xl flex items-start gap-2 mb-4 text-sm ${
                          dedupMessage.type === 'success'
                            ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                            : 'bg-rose-50 text-rose-700 border border-rose-200'
                        }`}
                      >
                        {dedupMessage.type === 'success' ? (
                          <CheckCircle className="h-4 w-4 mt-0.5" />
                        ) : (
                          <AlertCircle className="h-4 w-4 mt-0.5" />
                        )}
                        <p>{dedupMessage.text}</p>
                      </div>
                    )}

                    <Button
                      type="button"
                      variant="outline"
                      onClick={handleRemoveDuplicates}
                      disabled={dedupLoading}
                      className="text-rose-600 hover:text-rose-700 hover:bg-rose-50 border-rose-200 w-full sm:w-auto"
                    >
                      {dedupLoading ? 'Recherche et suppression...' : 'Rechercher et supprimer les doublons'}
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {activeTab === 'documents' && <DocumentTemplateEditor />}
        </div>
      </div>

      {/* ==================================================================== */}
      {/* MODAL : MODIFIER UN COLLABORATEUR (ÉQUIPE)                           */}
      {/* ==================================================================== */}
      <Modal
        isOpen={isEditCollabModalOpen}
        onClose={() => {
          if (!editCollabLoading) setIsEditCollabModalOpen(false);
        }}
        title="Modifier le collaborateur"
      >
        <form onSubmit={executeEditCollab} className="space-y-4">
          {editCollabError && (
            <div className="p-3 rounded-xl bg-rose-50 text-rose-700 border border-rose-200 text-sm flex items-center gap-2">
              <AlertCircle className="h-4 w-4 flex-shrink-0" />
              <span>{editCollabError}</span>
            </div>
          )}

          <div className="space-y-1.5">
            <label className="text-sm font-semibold text-slate-700">Nom complet (Prénom & Nom)</label>
            <input
              type="text"
              value={editCollabData.name}
              onChange={(e) => setEditCollabData({ ...editCollabData, name: e.target.value })}
              className="block w-full px-3 py-2 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 outline-none"
              placeholder="Ex: Hasna Jakoum"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-semibold text-slate-700">Email du collaborateur</label>
            <input
              type="email"
              value={editCollabData.email}
              onChange={(e) => setEditCollabData({ ...editCollabData, email: e.target.value })}
              className="block w-full px-3 py-2 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 outline-none"
              placeholder="collaborateur@reforme.center"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-semibold text-slate-700">Téléphone</label>
            <input
              type="tel"
              value={editCollabData.phone}
              onChange={(e) => setEditCollabData({ ...editCollabData, phone: e.target.value })}
              className="block w-full px-3 py-2 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 outline-none"
              placeholder="06..."
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-semibold text-slate-700">Rôle</label>
            <select
              value={editCollabData.role}
              onChange={(e) => setEditCollabData({ ...editCollabData, role: e.target.value })}
              className="block w-full px-3 py-2 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 outline-none bg-white"
            >
              <option value="admin">Administrateur</option>
              <option value="therapeute">Thérapeute</option>
              <option value="secretaire">Secrétaire</option>
            </select>
          </div>

          <div className="space-y-1.5 pt-2 border-t border-slate-100">
            <label className="text-sm font-semibold text-slate-700 flex items-center gap-1.5">
              <KeyRound className="h-4 w-4 text-primary-600" />
              Nouveau mot de passe (optionnel)
            </label>
            <div className="relative">
              <input
                type={showEditCollabPassword ? 'text' : 'password'}
                value={editCollabData.newPassword}
                onChange={(e) => setEditCollabData({ ...editCollabData, newPassword: e.target.value })}
                className="block w-full px-3 py-2 pr-10 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 outline-none"
                placeholder="Laisser vide pour conserver le mot de passe actuel"
                minLength={6}
              />
              <button
                type="button"
                onClick={() => setShowEditCollabPassword((v) => !v)}
                className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-400 hover:text-slate-600"
                tabIndex={-1}
              >
                {showEditCollabPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
            <p className="text-xs text-slate-500">
              Renseignez un mot de passe (min. 6 caractères) uniquement si vous souhaitez le réinitialiser immédiatement.
            </p>
          </div>

          <div className="flex justify-end gap-3 pt-4 border-t border-slate-100">
            <Button
              type="button"
              variant="outline"
              onClick={() => setIsEditCollabModalOpen(false)}
              disabled={editCollabLoading}
            >
              Annuler
            </Button>
            <Button type="submit" disabled={editCollabLoading}>
              {editCollabLoading ? 'Enregistrement...' : 'Enregistrer'}
            </Button>
          </div>
        </form>
      </Modal>

      {/* ==================================================================== */}
      {/* MODAL : SUPPRIMER UN COLLABORATEUR (ÉQUIPE)                          */}
      {/* ==================================================================== */}
      <Modal
        isOpen={isDeleteCollabModalOpen}
        onClose={() => {
          if (!deleteCollabLoading) setIsDeleteCollabModalOpen(false);
        }}
        title="Supprimer l'accès collaborateur"
      >
        <div className="space-y-4">
          {deleteCollabError && (
            <div className="p-3 rounded-xl bg-rose-50 text-rose-700 border border-rose-200 text-sm flex items-center gap-2">
              <AlertCircle className="h-4 w-4 flex-shrink-0" />
              <span>{deleteCollabError}</span>
            </div>
          )}

          <p className="text-slate-600 text-sm">
            Êtes-vous sûr de vouloir supprimer l'accès de{' '}
            <strong className="text-slate-900 font-semibold">
              {collabToDelete?.name || collabToDelete?.email || 'ce collaborateur'}
            </strong>{' '}
            ? Il ne pourra plus se connecter à l'espace équipe du cabinet.
          </p>

          <div className="flex justify-end gap-3 pt-4 border-t border-slate-100">
            <Button
              type="button"
              variant="outline"
              onClick={() => setIsDeleteCollabModalOpen(false)}
              disabled={deleteCollabLoading}
            >
              Annuler
            </Button>
            <Button
              type="button"
              className="bg-rose-600 hover:bg-rose-700 text-white font-medium"
              onClick={executeDeleteCollab}
              disabled={deleteCollabLoading}
            >
              {deleteCollabLoading ? 'Suppression...' : 'Supprimer définitivement'}
            </Button>
          </div>
        </div>
      </Modal>

      {/* ==================================================================== */}
      {/* MODAL : SUPPRIMER UN PRATICIEN                                       */}
      {/* ==================================================================== */}
      <Modal
        isOpen={isDeleteTherapistModalOpen}
        onClose={() => {
          if (!deleteTherapistLoading) setIsDeleteTherapistModalOpen(false);
        }}
        title="Supprimer le praticien"
      >
        <div className="space-y-4">
          {deleteTherapistError && (
            <div className="p-3 rounded-xl bg-rose-50 text-rose-700 border border-rose-200 text-sm flex items-center gap-2">
              <AlertCircle className="h-4 w-4 flex-shrink-0" />
              <span>{deleteTherapistError}</span>
            </div>
          )}

          <p className="text-slate-600 text-sm">
            Êtes-vous sûr de vouloir supprimer définitivement le praticien{' '}
            <strong className="text-slate-900 font-semibold">
              {therapistToDelete?.prenom} {therapistToDelete?.nom}
            </strong>{' '}
            ?
          </p>
          <div className="p-3 bg-amber-50 text-amber-800 rounded-lg text-xs flex gap-2 border border-amber-100">
            <AlertTriangle className="h-5 w-5 text-amber-500 flex-shrink-0" />
            <span>
              <strong>Note importante :</strong> L'agenda conservera l'historique des rendez-vous passés et futurs, mais ceux-ci ne seront plus rattachés à ce praticien.
            </span>
          </div>
          <div className="flex justify-end gap-3 pt-4 border-t border-slate-100">
            <Button
              type="button"
              variant="outline"
              onClick={() => setIsDeleteTherapistModalOpen(false)}
              disabled={deleteTherapistLoading}
            >
              Annuler
            </Button>
            <Button
              type="button"
              className="bg-rose-600 hover:bg-rose-700 text-white font-medium"
              onClick={executeDeleteTherapist}
              disabled={deleteTherapistLoading}
            >
              {deleteTherapistLoading ? 'Suppression...' : 'Supprimer définitivement'}
            </Button>
          </div>
        </div>
      </Modal>

      {/* ==================================================================== */}
      {/* MODAL : MODIFIER UN PRATICIEN                                        */}
      {/* ==================================================================== */}
      <Modal
        isOpen={isEditTherapistModalOpen}
        onClose={() => {
          if (!editTherapistLoading) setIsEditTherapistModalOpen(false);
        }}
        title="Modifier le praticien"
      >
        <form onSubmit={executeEditTherapist} className="space-y-4">
          {editTherapistError && (
            <div className="p-3 rounded-xl bg-rose-50 text-rose-700 border border-rose-200 text-sm flex items-center gap-2">
              <AlertCircle className="h-4 w-4 flex-shrink-0" />
              <span>{editTherapistError}</span>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-sm font-semibold text-slate-700">Nom *</label>
              <input
                type="text"
                required
                value={editTherapistData.nom}
                onChange={(e) => setEditTherapistData({ ...editTherapistData, nom: e.target.value })}
                className="block w-full px-3 py-2 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 outline-none"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-semibold text-slate-700">Prénom *</label>
              <input
                type="text"
                required
                value={editTherapistData.prenom}
                onChange={(e) => setEditTherapistData({ ...editTherapistData, prenom: e.target.value })}
                className="block w-full px-3 py-2 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 outline-none"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-semibold text-slate-700">Spécialité</label>
            <input
              type="text"
              value={editTherapistData.specialite}
              onChange={(e) => setEditTherapistData({ ...editTherapistData, specialite: e.target.value })}
              className="block w-full px-3 py-2 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 outline-none"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-semibold text-slate-700">Téléphone</label>
            <input
              type="tel"
              value={editTherapistData.tel}
              onChange={(e) => setEditTherapistData({ ...editTherapistData, tel: e.target.value })}
              className="block w-full px-3 py-2 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 outline-none"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-semibold text-slate-700">Email</label>
            <input
              type="email"
              value={editTherapistData.email}
              onChange={(e) => setEditTherapistData({ ...editTherapistData, email: e.target.value })}
              className="block w-full px-3 py-2 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 outline-none"
            />
          </div>

          <div className="flex justify-end gap-3 pt-4 border-t border-slate-100">
            <Button
              type="button"
              variant="outline"
              onClick={() => setIsEditTherapistModalOpen(false)}
              disabled={editTherapistLoading}
            >
              Annuler
            </Button>
            <Button
              type="submit"
              className="bg-indigo-600 hover:bg-indigo-700 text-white font-medium"
              disabled={editTherapistLoading}
            >
              {editTherapistLoading ? 'Enregistrement...' : 'Enregistrer'}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
