import { SupabaseClient } from '@supabase/supabase-js';

export interface ProfileMetadata {
  name: string;
  email: string;
  phone: string;
  configured: boolean;
}

export interface PendingCollaboratorEntry {
  email: string;
  name: string;
  phone: string;
  role: 'admin' | 'therapeute' | 'secretaire' | string;
  permissions: string[];
  created_at: string;
}

export interface ParsedCollaboratorProfile {
  id: string;
  role: 'admin' | 'therapeute' | 'secretaire' | string;
  created_at: string;
  rawPermissions: string[];
  permissions: string[];
  name: string;
  email: string;
  phone: string;
  configured: boolean;
  isPendingBind?: boolean;
}

export const PENDING_COLLAB_PREFIX = '__pending_collab:';
export const BLOCKED_EMAIL_PREFIX = '__blocked_email:';

export const PERMISSIONS_LIST = [
  { id: 'agenda', label: 'Agenda' },
  { id: 'patients', label: 'Dossiers Patients' },
  { id: 'finance_stats', label: 'Finance (Statistiques & CA)' },
  { id: 'finance_recettes', label: 'Finance (Recettes)' },
  { id: 'finance_depenses_view', label: 'Finance (Dépenses - Lecture seule)' },
  { id: 'finance_depenses_edit', label: 'Finance (Dépenses - Modification)' },
  { id: 'settings', label: 'Paramètres du cabinet' },
];

export function getDefaultPermissionsForRole(role: string): string[] {
  if (role === 'admin') {
    return PERMISSIONS_LIST.map((p) => p.id);
  }
  if (role === 'secretaire') {
    return ['agenda', 'patients', 'finance_recettes', 'finance_depenses_edit'];
  }
  if (role === 'therapeute') {
    return ['agenda', 'patients'];
  }
  return [];
}

function isInternalSystemTag(value: string): boolean {
  return (
    value.startsWith('__meta_') ||
    value.startsWith(PENDING_COLLAB_PREFIX) ||
    value.startsWith(BLOCKED_EMAIL_PREFIX) ||
    value.startsWith('__club_conv:') ||
    value.startsWith('__doc_templates:')
  );
}

/**
 * Extracts clean module permissions and embedded metadata tags (__meta_*)
 * from the `profiles.permissions` array column.
 */
export function parseCollaboratorProfile(
  rawProfile: any,
  therapists: any[] = [],
  currentUser?: { id: string; email?: string } | null
): ParsedCollaboratorProfile {
  const rawArr: string[] = Array.isArray(rawProfile?.permissions)
    ? rawProfile.permissions.filter((x: any) => typeof x === 'string')
    : [];

  let metaName = '';
  let metaEmail = '';
  let metaPhone = '';
  let configured = false;
  const cleanPermissions: string[] = [];

  for (const item of rawArr) {
    if (item.startsWith('__meta_name:')) {
      metaName = item.slice('__meta_name:'.length).trim();
    } else if (item.startsWith('__meta_email:')) {
      metaEmail = item.slice('__meta_email:'.length).trim();
    } else if (item.startsWith('__meta_phone:')) {
      metaPhone = item.slice('__meta_phone:'.length).trim();
    } else if (item === '__meta_configured:1') {
      configured = true;
    } else if (!isInternalSystemTag(item)) {
      cleanPermissions.push(item);
    }
  }

  // Fallback email from active session if this profile belongs to the logged-in user
  if (!metaEmail && currentUser && rawProfile?.id === currentUser.id && currentUser.email) {
    metaEmail = currentUser.email;
  }
  if (!metaEmail && typeof rawProfile?.email === 'string' && rawProfile.email.trim()) {
    metaEmail = rawProfile.email.trim();
  }

  // Match against therapists table by email if name/phone not yet stored
  if (metaEmail && therapists.length > 0) {
    const matchedTherapist = therapists.find(
      (t) => t?.email && t.email.trim().toLowerCase() === metaEmail.toLowerCase()
    );
    if (matchedTherapist) {
      if (!metaName) {
        metaName = `${matchedTherapist.prenom || ''} ${matchedTherapist.nom || ''}`.trim();
      }
      if (!metaPhone && matchedTherapist.tel) {
        metaPhone = matchedTherapist.tel;
      }
    }
  }

  const role = rawProfile?.role || 'therapeute';

  // Effective permissions:
  // - Admin always has all permissions
  // - Legacy unconfigured secretaire/therapeute with empty array defaults to ['agenda', 'patients']
  let effectivePermissions = cleanPermissions;
  if (role === 'admin') {
    effectivePermissions = PERMISSIONS_LIST.map((p) => p.id);
  } else if (!configured && cleanPermissions.length === 0 && (role === 'secretaire' || role === 'therapeute')) {
    effectivePermissions = ['agenda', 'patients'];
  }

  return {
    id: rawProfile?.id || '',
    role,
    created_at: rawProfile?.created_at || new Date().toISOString(),
    rawPermissions: rawArr,
    permissions: Array.from(new Set(effectivePermissions)),
    name: metaName,
    email: metaEmail,
    phone: metaPhone,
    configured,
    isPendingBind: false,
  };
}

/**
 * Serializes clean module permissions + collaborator metadata back into
 * the `profiles.permissions` array column while preserving any `__pending_collab:`
 * and `__blocked_email:` registry entries stored on an admin profile.
 */
export function buildProfilePermissionsArray(
  modulePermissions: string[],
  meta: { name?: string; email?: string; phone?: string; configured?: boolean },
  existingRawPermissions: string[] = []
): string[] {
  const clean = Array.from(
    new Set(
      (modulePermissions || []).filter(
        (p) => typeof p === 'string' && p.trim() !== '' && !isInternalSystemTag(p)
      )
    )
  );

  if (meta.configured !== false) {
    clean.push('__meta_configured:1');
  }
  if (meta.name && meta.name.trim()) {
    clean.push(`__meta_name:${meta.name.trim()}`);
  }
  if (meta.email && meta.email.trim()) {
    clean.push(`__meta_email:${meta.email.trim().toLowerCase()}`);
  }
  if (meta.phone && meta.phone.trim()) {
    clean.push(`__meta_phone:${meta.phone.trim()}`);
  }

  // Preserve any pending collaborator, blocked email, partner club, or document template entries stored on this profile
  const preservedRegistryTags = (existingRawPermissions || []).filter(
    (item) =>
      typeof item === 'string' &&
      (item.startsWith(PENDING_COLLAB_PREFIX) ||
        item.startsWith(BLOCKED_EMAIL_PREFIX) ||
        item.startsWith('__club_conv:') ||
        item.startsWith('__doc_templates:'))
  );

  return [...clean, ...preservedRegistryTags];
}

/**
 * Extracts all blocked email addresses from admin profiles.
 */
export function extractBlockedEmails(rawProfiles: any[]): string[] {
  const blocked = new Set<string>();
  for (const raw of rawProfiles || []) {
    const rawArr: string[] = Array.isArray(raw?.permissions) ? raw.permissions : [];
    for (const item of rawArr) {
      if (typeof item === 'string' && item.startsWith(BLOCKED_EMAIL_PREFIX)) {
        const email = item.slice(BLOCKED_EMAIL_PREFIX.length).trim().toLowerCase();
        if (email) blocked.add(email);
      }
    }
  }
  return Array.from(blocked);
}

/**
 * Checks whether an email address is explicitly blocked by the cabinet administrator.
 */
export async function isEmailBlocked(
  supabaseClient: SupabaseClient,
  email?: string | null
): Promise<boolean> {
  const cleanEmail = (email || '').trim().toLowerCase();
  if (!cleanEmail) return false;

  const { data: admins, error } = await supabaseClient
    .from('profiles')
    .select('permissions')
    .eq('role', 'admin');

  if (error || !admins) return false;
  const blockedList = extractBlockedEmails(admins);
  return blockedList.includes(cleanEmail);
}

/**
 * Blocks an email address completely:
 * 1. Adds `__blocked_email:<email>` to the primary admin profile
 * 2. Removes any pending collaborator invitation for that email
 * 3. Deletes any non-admin `profiles` row matching that email so active sessions lose access immediately
 */
export async function blockCollaboratorEmail(
  supabaseClient: SupabaseClient,
  emailToBlock: string
): Promise<void> {
  const targetEmail = (emailToBlock || '').trim().toLowerCase();
  if (!targetEmail || !targetEmail.includes('@')) {
    throw new Error('Veuillez saisir une adresse email valide à bloquer.');
  }

  const { data: allStaffProfiles, error: fetchError } = await supabaseClient
    .from('profiles')
    .select('*')
    .neq('role', 'patient')
    .order('created_at', { ascending: true });

  if (fetchError) throw fetchError;

  const admins = (allStaffProfiles || []).filter((p) => p.role === 'admin');
  if (admins.length === 0) {
    throw new Error('Aucun profil administrateur trouvé.');
  }

  // Prevent blocking the primary admin's own email
  for (const admin of admins) {
    const parsedAdmin = parseCollaboratorProfile(admin);
    if (parsedAdmin.email && parsedAdmin.email.toLowerCase() === targetEmail) {
      throw new Error('Impossible de bloquer le compte administrateur principal du cabinet.');
    }
  }

  // Remove any bound non-admin profile matching this email
  for (const prof of allStaffProfiles || []) {
    if (prof.role === 'admin') continue;
    const parsed = parseCollaboratorProfile(prof);
    if (parsed.email && parsed.email.toLowerCase() === targetEmail) {
      await supabaseClient.from('profiles').delete().eq('id', prof.id);
    }
  }

  // Update primary admin profile: remove any pending entry for targetEmail and add blocked tag
  const primaryAdmin = admins[0];
  const rawArr: string[] = Array.isArray(primaryAdmin.permissions)
    ? primaryAdmin.permissions.filter((x: any) => typeof x === 'string')
    : [];

  const cleaned = rawArr.filter((item) => {
    if (item === `${BLOCKED_EMAIL_PREFIX}${targetEmail}`) return false;
    if (item.startsWith(PENDING_COLLAB_PREFIX)) {
      try {
        const data = JSON.parse(item.slice(PENDING_COLLAB_PREFIX.length));
        if ((data?.email || '').trim().toLowerCase() === targetEmail) {
          return false;
        }
      } catch {
        return false;
      }
    }
    return true;
  });

  cleaned.push(`${BLOCKED_EMAIL_PREFIX}${targetEmail}`);

  const { error: updateError } = await supabaseClient
    .from('profiles')
    .update({ permissions: cleaned })
    .eq('id', primaryAdmin.id);

  if (updateError) throw updateError;
}

/**
 * Unblocks a previously blocked email address.
 */
export async function unblockCollaboratorEmail(
  supabaseClient: SupabaseClient,
  emailToUnblock: string
): Promise<void> {
  const targetEmail = (emailToUnblock || '').trim().toLowerCase();
  if (!targetEmail) return;

  const { data: admins, error } = await supabaseClient
    .from('profiles')
    .select('*')
    .eq('role', 'admin');

  if (error || !admins) throw error || new Error('Impossible de charger le profil administrateur.');

  for (const admin of admins) {
    const rawArr: string[] = Array.isArray(admin.permissions)
      ? admin.permissions.filter((x: any) => typeof x === 'string')
      : [];

    const nextArr = rawArr.filter(
      (item) => item.trim().toLowerCase() !== `${BLOCKED_EMAIL_PREFIX}${targetEmail}`
    );

    if (nextArr.length !== rawArr.length) {
      const { error: updErr } = await supabaseClient
        .from('profiles')
        .update({ permissions: nextArr })
        .eq('id', admin.id);
      if (updErr) throw updErr;
    }
  }
}

/**
 * Extracts pre-authorized collaborator entries stored in admin `profiles.permissions`.
 */
export function extractPendingCollaborators(
  rawProfiles: any[],
  therapists: any[] = []
): ParsedCollaboratorProfile[] {
  const blockedSet = new Set(extractBlockedEmails(rawProfiles));
  const byEmail = new Map<string, ParsedCollaboratorProfile>();

  for (const raw of rawProfiles || []) {
    const rawArr: string[] = Array.isArray(raw?.permissions) ? raw.permissions : [];
    for (const item of rawArr) {
      if (typeof item !== 'string' || !item.startsWith(PENDING_COLLAB_PREFIX)) continue;
      try {
        const parsedJson: PendingCollaboratorEntry = JSON.parse(item.slice(PENDING_COLLAB_PREFIX.length));
        const cleanEmail = (parsedJson.email || '').trim().toLowerCase();
        if (!cleanEmail || blockedSet.has(cleanEmail)) continue;

        let name = (parsedJson.name || '').trim();
        let phone = (parsedJson.phone || '').trim();

        if (therapists.length > 0) {
          const matchedTherapist = therapists.find(
            (t) => t?.email && t.email.trim().toLowerCase() === cleanEmail
          );
          if (matchedTherapist) {
            if (!name) {
              name = `${matchedTherapist.prenom || ''} ${matchedTherapist.nom || ''}`.trim();
            }
            if (!phone && matchedTherapist.tel) {
              phone = matchedTherapist.tel;
            }
          }
        }

        const role = parsedJson.role || 'secretaire';
        const perms =
          role === 'admin'
            ? PERMISSIONS_LIST.map((p) => p.id)
            : Array.isArray(parsedJson.permissions)
            ? parsedJson.permissions.filter((p) => typeof p === 'string' && !p.startsWith('__'))
            : getDefaultPermissionsForRole(role);

        byEmail.set(cleanEmail, {
          id: `pending:${cleanEmail}`,
          role,
          created_at: parsedJson.created_at || new Date().toISOString(),
          rawPermissions: [],
          permissions: Array.from(new Set(perms)),
          name,
          email: cleanEmail,
          phone,
          configured: true,
          isPendingBind: true,
        });
      } catch {
        // Ignore malformed tag
      }
    }
  }

  return Array.from(byEmail.values());
}

/**
 * Combines bound `public.profiles` rows with pre-authorized pending collaborators
 * (excluding any blocked emails).
 */
export function parseAllTeamProfiles(
  rawProfiles: any[],
  therapists: any[] = [],
  currentUser?: { id: string; email?: string } | null
): ParsedCollaboratorProfile[] {
  const blockedSet = new Set(extractBlockedEmails(rawProfiles));
  const bound = (rawProfiles || [])
    .map((raw) => parseCollaboratorProfile(raw, therapists, currentUser))
    .filter((b) => !b.email || !blockedSet.has(b.email.trim().toLowerCase()) || b.role === 'admin');

  const boundEmails = new Set(
    bound.map((b) => b.email.trim().toLowerCase()).filter(Boolean)
  );

  const pending = extractPendingCollaborators(rawProfiles, therapists).filter(
    (p) => !boundEmails.has(p.email.trim().toLowerCase())
  );

  return [...bound, ...pending];
}

/**
 * Saves or updates a pre-authorized collaborator inside the primary admin profile's
 * `permissions` array.
 */
export async function upsertPendingCollaboratorInAdmin(
  supabaseClient: SupabaseClient,
  entry: PendingCollaboratorEntry
): Promise<void> {
  const targetEmail = entry.email.trim().toLowerCase();
  if (!targetEmail) throw new Error('Email collaborateur invalide.');

  const { data: admins, error: fetchError } = await supabaseClient
    .from('profiles')
    .select('*')
    .eq('role', 'admin')
    .order('created_at', { ascending: true });

  if (fetchError) throw fetchError;
  if (!admins || admins.length === 0) {
    throw new Error('Aucun profil administrateur trouvé pour enregistrer ce collaborateur.');
  }

  const primaryAdmin = admins[0];
  const rawArr: string[] = Array.isArray(primaryAdmin.permissions)
    ? primaryAdmin.permissions.filter((x: any) => typeof x === 'string')
    : [];

  const filtered = rawArr.filter((item) => {
    if (!item.startsWith(PENDING_COLLAB_PREFIX)) return true;
    try {
      const data = JSON.parse(item.slice(PENDING_COLLAB_PREFIX.length));
      return (data?.email || '').trim().toLowerCase() !== targetEmail;
    } catch {
      return false;
    }
  });

  const payload: PendingCollaboratorEntry = {
    email: targetEmail,
    name: (entry.name || '').trim(),
    phone: (entry.phone || '').trim(),
    role: entry.role || 'secretaire',
    permissions:
      entry.role === 'admin'
        ? PERMISSIONS_LIST.map((p) => p.id)
        : Array.from(
            new Set(
              (entry.permissions || []).filter(
                (p) => typeof p === 'string' && !p.startsWith('__')
              )
            )
          ),
    created_at: entry.created_at || new Date().toISOString(),
  };

  filtered.push(`${PENDING_COLLAB_PREFIX}${JSON.stringify(payload)}`);

  const { error: updateError } = await supabaseClient
    .from('profiles')
    .update({ permissions: filtered })
    .eq('id', primaryAdmin.id);

  if (updateError) throw updateError;
}

/**
 * Removes a pre-authorized collaborator entry by email from all admin profiles.
 */
export async function removePendingCollaboratorFromAdmin(
  supabaseClient: SupabaseClient,
  emailToRemove: string
): Promise<void> {
  const targetEmail = (emailToRemove || '').trim().toLowerCase();
  if (!targetEmail) return;

  const { data: admins, error: fetchError } = await supabaseClient
    .from('profiles')
    .select('*')
    .eq('role', 'admin');

  if (fetchError || !admins) return;

  for (const admin of admins) {
    const rawArr: string[] = Array.isArray(admin.permissions)
      ? admin.permissions.filter((x: any) => typeof x === 'string')
      : [];

    const nextArr = rawArr.filter((item) => {
      if (!item.startsWith(PENDING_COLLAB_PREFIX)) return true;
      try {
        const data = JSON.parse(item.slice(PENDING_COLLAB_PREFIX.length));
        return (data?.email || '').trim().toLowerCase() !== targetEmail;
      } catch {
        return false;
      }
    });

    if (nextArr.length !== rawArr.length) {
      await supabaseClient
        .from('profiles')
        .update({ permissions: nextArr })
        .eq('id', admin.id);
    }
  }
}

/**
 * Resolves a logged-in user's `public.profiles` row, or returns `{ __blocked: true }`
 * if the user's email has been blocked by the administrator.
 */
export async function resolveOrBindCollaboratorSession(
  supabaseClient: SupabaseClient,
  authUser: { id: string; email?: string | null }
): Promise<any | null> {
  if (!authUser?.id) return null;
  const cleanEmail = (authUser.email || '').trim().toLowerCase();

  // 1. Check explicit email blocklist first
  if (cleanEmail && !cleanEmail.endsWith('@patient.reforme.center')) {
    const blocked = await isEmailBlocked(supabaseClient, cleanEmail);
    if (blocked) {
      // Ensure any leftover non-admin profile row is purged
      await supabaseClient
        .from('profiles')
        .delete()
        .eq('id', authUser.id)
        .neq('role', 'admin');
      return { __blocked: true };
    }
  }

  const { data: existingProfile } = await supabaseClient
    .from('profiles')
    .select('*')
    .eq('id', authUser.id)
    .maybeSingle();

  if (existingProfile) {
    if (cleanEmail && existingProfile.role !== 'patient' && !cleanEmail.endsWith('@patient.reforme.center')) {
      const rawPerms: string[] = Array.isArray(existingProfile.permissions) ? existingProfile.permissions : [];
      const hasEmailMeta = rawPerms.some(
        (x) => typeof x === 'string' && x.startsWith('__meta_email:')
      );
      if (!hasEmailMeta) {
        const parsed = parseCollaboratorProfile(existingProfile, [], { id: authUser.id, email: cleanEmail });
        const enriched = buildProfilePermissionsArray(
          parsed.permissions,
          {
            name: parsed.name,
            email: cleanEmail,
            phone: parsed.phone,
            configured: parsed.configured,
          },
          rawPerms
        );
        await supabaseClient
          .from('profiles')
          .update({ permissions: enriched })
          .eq('id', authUser.id);
        existingProfile.permissions = enriched;
      }
      await removePendingCollaboratorFromAdmin(supabaseClient, cleanEmail).catch(() => {});
    }
    return existingProfile;
  }

  // No row in `profiles` yet — check if pre-authorized in team registry by email
  if (!cleanEmail || cleanEmail.endsWith('@patient.reforme.center')) {
    return null;
  }

  const { data: adminRows } = await supabaseClient
    .from('profiles')
    .select('*')
    .eq('role', 'admin');

  const pendingList = extractPendingCollaborators(adminRows || []);
  const matchedPending = pendingList.find((p) => p.email.toLowerCase() === cleanEmail);

  if (matchedPending) {
    const serializedPerms = buildProfilePermissionsArray(matchedPending.permissions, {
      name: matchedPending.name,
      email: cleanEmail,
      phone: matchedPending.phone,
      configured: true,
    });

    const newRow = {
      id: authUser.id,
      role: matchedPending.role,
      permissions: serializedPerms,
    };

    const { data: upserted, error: upsertErr } = await supabaseClient
      .from('profiles')
      .upsert([newRow])
      .select('*')
      .maybeSingle();

    if (!upsertErr) {
      await removePendingCollaboratorFromAdmin(supabaseClient, cleanEmail).catch(() => {});
      return upserted || newRow;
    }
  }

  return null;
}
