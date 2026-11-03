import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { isPatientSyntheticEmail, stripInvisibleChars } from './patientAuthUtils';

export const PRIMARY_ADMIN_EMAILS = ['admin@reforme.com', 'reforme3334@gmail.com'];
export const OWNER_RECOVERY_EMAIL = 'reforme3334@gmail.com';

export interface ProfileMetadata {
  name: string;
  email: string;
  authEmail?: string;
  phone: string;
  configured: boolean;
}

export interface PendingCollaboratorEntry {
  email: string;
  authEmail?: string;
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
  authEmail?: string;
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

export function isPrimaryAdminEmail(email?: string | null): boolean {
  const clean = stripInvisibleChars(email || '').toLowerCase();
  return PRIMARY_ADMIN_EMAILS.includes(clean);
}

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

export function isInternalSystemTag(value: string): boolean {
  return (
    value.startsWith('__') ||
    value.startsWith(PENDING_COLLAB_PREFIX) ||
    value.startsWith(BLOCKED_EMAIL_PREFIX)
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
  let metaAuthEmail = '';
  let metaPhone = '';
  let configured = false;
  const cleanPermissions: string[] = [];

  for (const item of rawArr) {
    if (item.startsWith('__meta_name:')) {
      metaName = item.slice('__meta_name:'.length).trim();
    } else if (item.startsWith('__meta_email:')) {
      metaEmail = item.slice('__meta_email:'.length).trim();
    } else if (item.startsWith('__meta_auth_email:')) {
      metaAuthEmail = item.slice('__meta_auth_email:'.length).trim().toLowerCase();
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
    if (!currentUser.email.toLowerCase().endsWith('@staff.reforme.center')) {
      metaEmail = currentUser.email;
    }
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

  // Guard against browser-autofilled email inside phone field
  if (metaPhone && metaPhone.includes('@')) {
    metaPhone = '';
  }

  const role = rawProfile?.role || 'therapeute';

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
    authEmail: metaAuthEmail || undefined,
    phone: metaPhone,
    configured,
    isPendingBind: false,
  };
}

/**
 * Serializes clean module permissions + collaborator metadata back into
 * the `profiles.permissions` array column while preserving any `__pending_collab:`,
 * `__blocked_email:`, `__club_conv:`, `__doc_templates:`, and `__inv_refs:` registry entries.
 */
export function buildProfilePermissionsArray(
  modulePermissions: string[],
  meta: {
    name?: string;
    email?: string;
    authEmail?: string;
    phone?: string;
    configured?: boolean;
  },
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

  // Preserve existing __meta_auth_email if caller did not explicitly override it
  const existingAuthEmailTag = (existingRawPermissions || []).find(
    (x) => typeof x === 'string' && x.startsWith('__meta_auth_email:')
  );
  const resolvedAuthEmail =
    meta.authEmail !== undefined
      ? meta.authEmail.trim().toLowerCase()
      : existingAuthEmailTag
      ? existingAuthEmailTag.slice('__meta_auth_email:'.length).trim().toLowerCase()
      : '';

  if (resolvedAuthEmail) {
    clean.push(`__meta_auth_email:${resolvedAuthEmail}`);
  }

  if (meta.phone && meta.phone.trim() && !meta.phone.includes('@')) {
    clean.push(`__meta_phone:${meta.phone.trim()}`);
  }

  const preservedRegistryTags = (existingRawPermissions || []).filter(
    (item) =>
      typeof item === 'string' &&
      !item.startsWith('__meta_') &&
      (item.startsWith('__') ||
        item.startsWith(PENDING_COLLAB_PREFIX) ||
        item.startsWith(BLOCKED_EMAIL_PREFIX))
  );

  return [...clean, ...preservedRegistryTags];
}

/**
 * Extracts all blocked email addresses from admin profiles (never blocking primary admin emails).
 */
export function extractBlockedEmails(rawProfiles: any[]): string[] {
  const blocked = new Set<string>();
  for (const raw of rawProfiles || []) {
    const rawArr: string[] = Array.isArray(raw?.permissions) ? raw.permissions : [];
    for (const item of rawArr) {
      if (typeof item === 'string' && item.startsWith(BLOCKED_EMAIL_PREFIX)) {
        const email = item.slice(BLOCKED_EMAIL_PREFIX.length).trim().toLowerCase();
        if (email && !isPrimaryAdminEmail(email)) {
          blocked.add(email);
        }
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
  const cleanEmail = stripInvisibleChars(email || '').toLowerCase();
  if (!cleanEmail || isPrimaryAdminEmail(cleanEmail)) return false;

  const { data: admins, error } = await supabaseClient
    .from('profiles')
    .select('permissions')
    .eq('role', 'admin');

  if (error || !admins) return false;
  const blockedList = extractBlockedEmails(admins);
  return blockedList.includes(cleanEmail);
}

/**
 * Resolves all candidate Supabase Auth emails for a staff/admin login email
 * (supports versioned staff auth aliases created during password resets).
 */
export async function resolveStaffLoginCandidates(
  supabaseClient: SupabaseClient,
  rawEmailInput: string
): Promise<string[]> {
  const rawClean = stripInvisibleChars(rawEmailInput).toLowerCase();
  const cleanEmail = rawClean === 'admin' ? 'admin@reforme.com' : rawClean;
  const candidates: string[] = [];
  const add = (val?: string | null) => {
    const c = stripInvisibleChars(val || '').toLowerCase();
    if (c && c.includes('@') && !candidates.includes(c)) {
      candidates.push(c);
    }
  };

  if (!cleanEmail) return candidates;

  const targetEmails = isPrimaryAdminEmail(cleanEmail)
    ? Array.from(new Set([cleanEmail, ...PRIMARY_ADMIN_EMAILS]))
    : [cleanEmail];

  try {
    const { data: staffRows } = await supabaseClient
      .from('profiles')
      .select('id, role, created_at, permissions')
      .neq('role', 'patient')
      .order('created_at', { ascending: false });

    if (staffRows) {
      const pending = extractPendingCollaborators(staffRows);
      for (const tEmail of targetEmails) {
        for (const row of staffRows) {
          const parsed = parseCollaboratorProfile(row);
          if (parsed.email && parsed.email.toLowerCase() === tEmail && parsed.authEmail) {
            add(parsed.authEmail);
          }
        }
        for (const p of pending) {
          if (p.email.toLowerCase() === tEmail && p.authEmail) {
            add(p.authEmail);
          }
        }
        add(tEmail);
      }
      return candidates;
    }
  } catch {
    // Fallback to direct emails
  }

  for (const tEmail of targetEmails) {
    add(tEmail);
  }
  return candidates;
}

/**
 * Blocks an email address completely (while protecting primary admin accounts).
 */
export async function blockCollaboratorEmail(
  supabaseClient: SupabaseClient,
  emailToBlock: string
): Promise<void> {
  const targetEmail = stripInvisibleChars(emailToBlock || '').toLowerCase();
  if (!targetEmail || !targetEmail.includes('@')) {
    throw new Error('Veuillez saisir une adresse email valide à bloquer.');
  }
  if (isPrimaryAdminEmail(targetEmail)) {
    throw new Error('Impossible de bloquer le compte administrateur principal du cabinet.');
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

  for (const admin of admins) {
    const parsedAdmin = parseCollaboratorProfile(admin);
    if (parsedAdmin.email && parsedAdmin.email.toLowerCase() === targetEmail) {
      throw new Error('Impossible de bloquer un compte administrateur actif.');
    }
  }

  for (const prof of allStaffProfiles || []) {
    if (prof.role === 'admin') continue;
    const parsed = parseCollaboratorProfile(prof);
    if (parsed.email && parsed.email.toLowerCase() === targetEmail) {
      await supabaseClient.from('profiles').delete().eq('id', prof.id);
    }
  }

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
  const targetEmail = stripInvisibleChars(emailToUnblock || '').toLowerCase();
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

        const role = isPrimaryAdminEmail(cleanEmail) ? 'admin' : parsedJson.role || 'secretaire';
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
          authEmail: parsedJson.authEmail,
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
 * (excluding any blocked emails and deduplicating by email, keeping most recent).
 */
export function parseAllTeamProfiles(
  rawProfiles: any[],
  therapists: any[] = [],
  currentUser?: { id: string; email?: string } | null
): ParsedCollaboratorProfile[] {
  const blockedSet = new Set(extractBlockedEmails(rawProfiles));
  const rawBound = (rawProfiles || [])
    .map((raw) => parseCollaboratorProfile(raw, therapists, currentUser))
    .filter((b) => !b.email || !blockedSet.has(b.email.trim().toLowerCase()) || b.role === 'admin');

  // Deduplicate bound profiles sharing the same display email (prefer active currentUser or newest)
  const byBoundKey = new Map<string, ParsedCollaboratorProfile>();
  for (const b of rawBound) {
    const key = b.email ? b.email.trim().toLowerCase() : `id:${b.id}`;
    const existing = byBoundKey.get(key);
    if (!existing) {
      byBoundKey.set(key, b);
    } else if (currentUser && b.id === currentUser.id) {
      byBoundKey.set(key, b);
    } else if (
      (!currentUser || existing.id !== currentUser.id) &&
      new Date(b.created_at).getTime() > new Date(existing.created_at).getTime()
    ) {
      byBoundKey.set(key, b);
    }
  }

  const bound = Array.from(byBoundKey.values());
  const boundEmails = new Set(bound.map((b) => b.email.trim().toLowerCase()).filter(Boolean));

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
  const targetEmail = stripInvisibleChars(entry.email).toLowerCase();
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

  const effectiveRole = isPrimaryAdminEmail(targetEmail) ? 'admin' : entry.role || 'secretaire';
  const payload: PendingCollaboratorEntry = {
    email: targetEmail,
    ...(entry.authEmail ? { authEmail: entry.authEmail.trim().toLowerCase() } : {}),
    name: (entry.name || '').trim(),
    phone: (entry.phone || '').trim(),
    role: effectiveRole,
    permissions:
      effectiveRole === 'admin'
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
  const targetEmail = stripInvisibleChars(emailToRemove || '').toLowerCase();
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
 * Provisions or resets a collaborator/admin password safely using an isolated client.
 * If the email is already registered in Supabase Auth with a different password,
 * creates an auto-confirmed versioned staff auth alias (`__meta_auth_email:`) so
 * the collaborator can immediately sign in using their normal email and new password.
 */
export async function provisionCollaboratorCredentials(
  supabaseClient: SupabaseClient,
  supabaseUrl: string,
  supabaseAnonKey: string,
  params: {
    displayEmail: string;
    password: string;
    role: string;
    modulePermissions: string[];
    name: string;
    phone: string;
    existingProfile?: ParsedCollaboratorProfile | null;
  }
): Promise<{ userId: string; authEmail: string; usedVersionedAlias: boolean }> {
  const cleanEmail = stripInvisibleChars(params.displayEmail).toLowerCase();
  const cleanPassword = stripInvisibleChars(params.password);
  const effectiveRole = isPrimaryAdminEmail(cleanEmail) ? 'admin' : params.role;
  const effectivePerms =
    effectiveRole === 'admin' ? PERMISSIONS_LIST.map((p) => p.id) : params.modulePermissions;

  const tempAuthClient = createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
      lock: async (_name, _acquireTimeout, fn) => await fn(),
    },
  });

  let userId = '';
  let activeAuthEmail = cleanEmail;
  let usedVersionedAlias = false;

  const { data: signUpData, error: signUpError } = await tempAuthClient.auth.signUp({
    email: cleanEmail,
    password: cleanPassword,
  });

  if (!signUpError && signUpData?.user?.id) {
    userId = signUpData.user.id;
    activeAuthEmail = cleanEmail;
  } else if (signUpError && signUpError.message?.toLowerCase().includes('already registered')) {
    const { data: signInData, error: signInErr } = await tempAuthClient.auth.signInWithPassword({
      email: cleanEmail,
      password: cleanPassword,
    });

    if (!signInErr && signInData?.user?.id) {
      userId = signInData.user.id;
      activeAuthEmail = cleanEmail;
      await tempAuthClient.auth.signOut({ scope: 'local' }).catch(() => {});
    } else {
      usedVersionedAlias = true;
      const localSlug =
        cleanEmail
          .split('@')[0]
          .replace(/[^a-z0-9._-]/gi, '')
          .slice(0, 24) || 'collab';
      const aliasEmail = `${localSlug}.v${Date.now().toString(36)}@staff.reforme.center`;

      const { data: aliasSignUp, error: aliasErr } = await tempAuthClient.auth.signUp({
        email: aliasEmail,
        password: cleanPassword,
      });

      if (aliasErr) {
        throw aliasErr;
      }
      if (!aliasSignUp?.user?.id) {
        throw new Error("Impossible de générer le nouvel identifiant sécurisé du collaborateur.");
      }

      userId = aliasSignUp.user.id;
      activeAuthEmail = aliasEmail;
    }
  } else if (signUpError) {
    throw signUpError;
  }

  if (!userId) {
    throw new Error("Impossible d'obtenir l'identifiant du compte collaborateur.");
  }

  const isReplacingAdminWithNewId =
    Boolean(params.existingProfile) &&
    !params.existingProfile!.isPendingBind &&
    Boolean(params.existingProfile!.id) &&
    params.existingProfile!.id !== userId &&
    params.existingProfile!.role === 'admin';

  const serializedPermissions = buildProfilePermissionsArray(
    effectivePerms,
    {
      name: params.name,
      email: cleanEmail,
      authEmail: usedVersionedAlias ? activeAuthEmail : '',
      phone: params.phone,
      configured: true,
    },
    isReplacingAdminWithNewId ? [] : params.existingProfile?.rawPermissions || []
  );

  const { error: upsertErr } = await supabaseClient
    .from('profiles')
    .upsert([{ id: userId, role: effectiveRole, permissions: serializedPermissions }]);

  if (upsertErr) {
    throw upsertErr;
  }

  // If updating an admin row whose original UUID holds cabinet registry tags, keep that row intact and sync its authEmail pointer
  if (isReplacingAdminWithNewId && params.existingProfile) {
    const syncedPrimaryPerms = buildProfilePermissionsArray(
      effectivePerms,
      {
        name: params.name || params.existingProfile.name,
        email: cleanEmail,
        authEmail: usedVersionedAlias ? activeAuthEmail : '',
        phone: params.phone || params.existingProfile.phone,
        configured: true,
      },
      params.existingProfile.rawPermissions || []
    );
    await supabaseClient
      .from('profiles')
      .update({ permissions: syncedPrimaryPerms })
      .eq('id', params.existingProfile.id);
  } else if (
    params.existingProfile &&
    !params.existingProfile.isPendingBind &&
    params.existingProfile.id &&
    params.existingProfile.id !== userId &&
    params.existingProfile.role !== 'admin'
  ) {
    await supabaseClient.from('profiles').delete().eq('id', params.existingProfile.id);
  }

  await removePendingCollaboratorFromAdmin(supabaseClient, cleanEmail).catch(() => {});

  return {
    userId,
    authEmail: activeAuthEmail,
    usedVersionedAlias,
  };
}

/**
 * Ensures an email exists in Supabase Auth before sending a password recovery link
 * (without modifying the password if the account already exists).
 */
export async function ensureStaffAuthAccountForRecovery(
  supabaseClient: SupabaseClient,
  supabaseUrl: string,
  supabaseAnonKey: string,
  targetEmail: string
): Promise<boolean> {
  const cleanEmail = stripInvisibleChars(targetEmail).toLowerCase();
  if (!cleanEmail || !cleanEmail.includes('@') || isPatientSyntheticEmail(cleanEmail)) {
    return false;
  }

  // Verify that this email is a known admin, collaborator, or practitioner before creating if missing
  let isAuthorizedStaff = isPrimaryAdminEmail(cleanEmail);

  if (!isAuthorizedStaff) {
    const [{ data: staffProfiles }, { data: therapists }] = await Promise.all([
      supabaseClient.from('profiles').select('*').neq('role', 'patient'),
      supabaseClient.from('therapists').select('email'),
    ]);

    const parsedStaff = parseAllTeamProfiles(staffProfiles || []);
    if (parsedStaff.some((p) => p.email && p.email.toLowerCase() === cleanEmail)) {
      isAuthorizedStaff = true;
    } else if (
      (therapists || []).some((t: any) => t?.email && String(t.email).trim().toLowerCase() === cleanEmail)
    ) {
      isAuthorizedStaff = true;
    }
  }

  if (!isAuthorizedStaff) {
    return false;
  }

  const tempAuthClient = createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
      lock: async (_name, _acquireTimeout, fn) => await fn(),
    },
  });

  // Generate an unguessable 32-byte random secret so if the Auth account did not exist yet,
  // it is created safely and ONLY the inbox owner can set the password via the recovery email.
  const bytes = new Uint8Array(24);
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    crypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 256);
  }
  const randomSecret =
    'Rf!' +
    Array.from(bytes)
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');

  const { data: signUpData, error: signUpErr } = await tempAuthClient.auth.signUp({
    email: cleanEmail,
    password: randomSecret,
  });

  if (!signUpErr && signUpData?.user?.id) {
    const role = isPrimaryAdminEmail(cleanEmail) ? 'admin' : 'therapeute';
    const perms = buildProfilePermissionsArray(getDefaultPermissionsForRole(role), {
      name: cleanEmail === OWNER_RECOVERY_EMAIL ? 'Younes Haddaoui' : '',
      email: cleanEmail,
      configured: true,
    });
    await supabaseClient.from('profiles').upsert([{ id: signUpData.user.id, role, permissions: perms }]);
  }

  return true;
}

/**
 * Resolves a logged-in user's `public.profiles` row, automatically upgrading or binding
 * pre-authorized collaborators, clinic administrators (`admin@reforme.com` / `reforme3334@gmail.com`),
 * and registered practitioners even if a default `role: 'patient'` row previously existed.
 */
export async function resolveOrBindCollaboratorSession(
  supabaseClient: SupabaseClient,
  authUser: { id: string; email?: string | null }
): Promise<any | null> {
  if (!authUser?.id) return null;
  const cleanEmail = stripInvisibleChars(authUser.email || '').toLowerCase();
  const isPatientEmail = isPatientSyntheticEmail(cleanEmail);

  // 1. Check explicit email blocklist first (never blocking primary admin accounts)
  if (cleanEmail && !isPatientEmail && !isPrimaryAdminEmail(cleanEmail)) {
    const blocked = await isEmailBlocked(supabaseClient, cleanEmail);
    if (blocked) {
      await supabaseClient
        .from('profiles')
        .delete()
        .eq('id', authUser.id)
        .neq('role', 'admin');
      return { __blocked: true };
    }
  }

  const { data: existingProfile, error: existingErr } = await supabaseClient
    .from('profiles')
    .select('*')
    .eq('id', authUser.id)
    .maybeSingle();

  if (existingErr) {
    console.warn('Avertissement lecture profil:', existingErr.message);
    return { __transientError: true };
  }

  // If existing profile is already a valid staff/admin profile, return it (upgrading primary admin if needed)
  if (existingProfile && existingProfile.role !== 'patient') {
    if (isPrimaryAdminEmail(cleanEmail) && existingProfile.role !== 'admin') {
      const upgradedPerms = buildProfilePermissionsArray(
        PERMISSIONS_LIST.map((p) => p.id),
        {
          name: cleanEmail === OWNER_RECOVERY_EMAIL ? 'Younes Haddaoui' : 'Administrateur',
          email: cleanEmail,
          configured: true,
        },
        existingProfile.permissions || []
      );
      await supabaseClient
        .from('profiles')
        .update({ role: 'admin', permissions: upgradedPerms })
        .eq('id', authUser.id);
      existingProfile.role = 'admin';
      existingProfile.permissions = upgradedPerms;
    } else if (cleanEmail && !isPatientEmail && !cleanEmail.endsWith('@staff.reforme.center')) {
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

  // Patient synthetic accounts immediately resolve to their patient profile (or null so caller treats as patient)
  if (!cleanEmail || isPatientEmail) {
    return existingProfile || null;
  }

  // Non-patient email with NO staff profile yet (either missing row OR default `role: 'patient'` row):
  // Check 1: Primary clinic administrator emails (`admin@reforme.com` / `reforme3334@gmail.com`)
  if (isPrimaryAdminEmail(cleanEmail)) {
    const adminPerms = buildProfilePermissionsArray(
      PERMISSIONS_LIST.map((p) => p.id),
      {
        name: cleanEmail === OWNER_RECOVERY_EMAIL ? 'Younes Haddaoui' : 'Administrateur',
        email: cleanEmail,
        configured: true,
      },
      existingProfile?.permissions || []
    );

    const adminRow = {
      id: authUser.id,
      role: 'admin',
      permissions: adminPerms,
    };

    const { data: upsertedAdmin, error: adminUpsertErr } = await supabaseClient
      .from('profiles')
      .upsert([adminRow])
      .select('*')
      .maybeSingle();

    if (!adminUpsertErr) {
      await removePendingCollaboratorFromAdmin(supabaseClient, cleanEmail).catch(() => {});
      return upsertedAdmin || adminRow;
    }
    return adminRow;
  }

  // Check 2: Pre-authorized collaborator in `__pending_collab` registry
  const { data: adminRows } = await supabaseClient
    .from('profiles')
    .select('*')
    .eq('role', 'admin');

  const pendingList = extractPendingCollaborators(adminRows || []);
  const matchedPending = pendingList.find((p) => p.email.toLowerCase() === cleanEmail);

  if (matchedPending) {
    const serializedPerms = buildProfilePermissionsArray(
      matchedPending.permissions,
      {
        name: matchedPending.name,
        email: cleanEmail,
        phone: matchedPending.phone,
        configured: true,
      },
      existingProfile?.permissions || []
    );

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
    return newRow;
  }

  // Check 3: Registered practitioner in `public.therapists` matching this email
  const { data: matchedTherapists } = await supabaseClient
    .from('therapists')
    .select('*')
    .ilike('email', cleanEmail);

  if (matchedTherapists && matchedTherapists.length > 0) {
    const th = matchedTherapists[0];
    const thRole = isPrimaryAdminEmail(cleanEmail) ? 'admin' : 'therapeute';
    const thPerms = buildProfilePermissionsArray(
      getDefaultPermissionsForRole(thRole),
      {
        name: `${th.prenom || ''} ${th.nom || ''}`.trim(),
        email: cleanEmail,
        phone: th.tel || '',
        configured: true,
      },
      existingProfile?.permissions || []
    );

    const thRow = {
      id: authUser.id,
      role: thRole,
      permissions: thPerms,
    };

    const { data: upsertedTh, error: thUpsertErr } = await supabaseClient
      .from('profiles')
      .upsert([thRow])
      .select('*')
      .maybeSingle();

    if (!thUpsertErr) {
      return upsertedTh || thRow;
    }
    return thRow;
  }

  return existingProfile || null;
}
