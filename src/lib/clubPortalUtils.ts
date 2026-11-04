import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { PartnerClub, fetchPartnerClubs, upsertPartnerClub } from './mutuelleUtils';
import { stripInvisibleChars } from './patientAuthUtils';

export const CLUB_PORTAL_DOMAIN = '@club.reforme.center';
export const CLUB_PORTAL_FLAG = '__club_portal:1';
export const CLUB_REVOKED_FLAG = '__club_revoked:1';
export const CLUB_NAME_PREFIX = '__club_name:';
export const CLUB_LOGIN_PREFIX = '__club_login:';
export const CLUB_AUTH_EMAIL_PREFIX = '__club_auth_email:';
export const CLUB_UPDATED_PREFIX = '__club_updated:';

export interface ClubProfileAuthMeta {
  profileId: string;
  clubName: string;
  loginId: string;
  authEmail: string;
  updatedAt: string;
  revoked: boolean;
}

/**
 * Checks whether an email belongs to the internal `@club.reforme.center` namespace.
 */
export function isClubSyntheticEmail(email?: string | null): boolean {
  if (!email) return false;
  return stripInvisibleChars(email).toLowerCase().endsWith(CLUB_PORTAL_DOMAIN);
}

/**
 * Checks whether a `public.profiles` row represents an active Partner Club portal account.
 */
export function isClubProfile(rawProfile: any): boolean {
  const perms: string[] = Array.isArray(rawProfile?.permissions) ? rawProfile.permissions : [];
  if (perms.includes(CLUB_REVOKED_FLAG)) return false;
  return perms.includes(CLUB_PORTAL_FLAG);
}

/**
 * Checks whether a `public.profiles` row was explicitly revoked as a Club account.
 */
export function isRevokedClubProfile(rawProfile: any): boolean {
  const perms: string[] = Array.isArray(rawProfile?.permissions) ? rawProfile.permissions : [];
  return perms.includes(CLUB_REVOKED_FLAG);
}

/**
 * Parses club authentication metadata stored in `public.profiles.permissions`.
 */
export function parseClubProfileMeta(rawProfile: any): ClubProfileAuthMeta | null {
  const perms: string[] = Array.isArray(rawProfile?.permissions) ? rawProfile.permissions : [];
  const isPortal = perms.includes(CLUB_PORTAL_FLAG);
  const isRevoked = perms.includes(CLUB_REVOKED_FLAG);
  if (!isPortal && !isRevoked) return null;

  let clubName = '';
  let loginId = '';
  let authEmail = '';
  let updatedAt = rawProfile?.created_at || '';

  for (const item of perms) {
    if (typeof item !== 'string') continue;
    if (item.startsWith(CLUB_NAME_PREFIX)) {
      clubName = item.slice(CLUB_NAME_PREFIX.length).trim();
    } else if (item.startsWith(CLUB_LOGIN_PREFIX)) {
      loginId = item.slice(CLUB_LOGIN_PREFIX.length).trim().toLowerCase();
    } else if (item.startsWith(CLUB_AUTH_EMAIL_PREFIX)) {
      authEmail = item.slice(CLUB_AUTH_EMAIL_PREFIX.length).trim().toLowerCase();
    } else if (item.startsWith(CLUB_UPDATED_PREFIX)) {
      updatedAt = item.slice(CLUB_UPDATED_PREFIX.length).trim();
    }
  }

  if (!clubName && !loginId && !authEmail) return null;

  return {
    profileId: rawProfile?.id || '',
    clubName,
    loginId,
    authEmail,
    updatedAt,
    revoked: isRevoked && !isPortal,
  };
}

/**
 * Converts a club name or login string into a clean ASCII slug suitable for synthetic auth emails.
 */
export function slugifyClubIdentifier(raw?: string | null): string {
  const cleaned = stripInvisibleChars(raw || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/@/g, '-at-')
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^[._-]+|[._-]+$/g, '');

  return cleaned.slice(0, 36) || 'club';
}

/**
 * Normalizes a human-facing login identifier (either a short code like `club.husa` or an email like `direction@husa.ma`).
 */
export function normalizeClubLoginId(raw?: string | null): string {
  return stripInvisibleChars(raw || '')
    .replace(/\s+/g, '')
    .toLowerCase();
}

/**
 * Suggests a clean, memorable default login identifier for a partnered sports club.
 */
export function suggestDefaultClubLoginId(clubName: string): string {
  const baseSlug = stripInvisibleChars(clubName || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\([^)]*\)/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 22);

  return `club.${baseSlug || 'equipe'}`;
}

/**
 * Builds the internal `@club.reforme.center` Supabase Auth email.
 */
export function buildClubSyntheticEmail(loginOrName: string, versionSuffix?: string): string {
  const slug = slugifyClubIdentifier(loginOrName);
  if (versionSuffix) {
    return `${slug}.v${versionSuffix}${CLUB_PORTAL_DOMAIN}`;
  }
  return `${slug}${CLUB_PORTAL_DOMAIN}`;
}

export interface ClubLoginResolution {
  candidateEmails: string[];
  matchedClubName: string;
  revoked: boolean;
}

/**
 * Resolves ordered Supabase Auth `@club.reforme.center` email candidates when a club administration
 * signs in on `#login` using its assigned `loginId` (code or email) or club name.
 */
export async function resolveClubLoginCandidates(
  supabaseClient: SupabaseClient,
  rawIdentifier: string
): Promise<ClubLoginResolution> {
  const normInput = normalizeClubLoginId(rawIdentifier);
  if (!normInput) {
    return { candidateEmails: [], matchedClubName: '', revoked: false };
  }

  const inputSlug = slugifyClubIdentifier(normInput);
  const candidates: string[] = [];
  const addCandidate = (email?: string | null) => {
    const clean = stripInvisibleChars(email || '').toLowerCase();
    if (clean && clean.includes('@') && !candidates.includes(clean)) {
      candidates.push(clean);
    }
  };

  let matchedClub: PartnerClub | undefined;
  let matchedClubName = '';
  let revoked = false;

  try {
    const [clubs, profilesRes] = await Promise.all([
      fetchPartnerClubs(supabaseClient),
      supabaseClient
        .from('profiles')
        .select('id, role, permissions, created_at')
        .eq('role', 'patient')
        .order('created_at', { ascending: false }),
    ]);

    for (const club of clubs) {
      const clubLogin = normalizeClubLoginId(club.loginId || '');
      const clubAuth = normalizeClubLoginId(club.authEmail || '');
      const clubNameLower = club.name.trim().toLowerCase();
      const clubDefaultId = suggestDefaultClubLoginId(club.name);

      const isDirectMatch =
        (clubLogin && clubLogin === normInput) ||
        (clubAuth && clubAuth === normInput) ||
        (club.hasAccess !== undefined &&
          (clubNameLower === stripInvisibleChars(rawIdentifier).toLowerCase() ||
            clubDefaultId === normInput));

      if (isDirectMatch) {
        matchedClub = club;
        matchedClubName = club.name;
        if (club.hasAccess === false) {
          revoked = true;
        }
        break;
      }
    }

    if (revoked) {
      return { candidateEmails: [], matchedClubName, revoked: true };
    }

    if (matchedClub) {
      if (matchedClub.authEmail) {
        addCandidate(matchedClub.authEmail);
      }
      if (matchedClub.loginId) {
        addCandidate(buildClubSyntheticEmail(matchedClub.loginId));
      }
      addCandidate(buildClubSyntheticEmail(matchedClub.name));
    }

    // Also inspect `profiles` rows tagged with `__club_portal:1` (newest first)
    const metas: ClubProfileAuthMeta[] = [];
    for (const row of profilesRes.data || []) {
      const meta = parseClubProfileMeta(row);
      if (!meta) continue;
      const matchesMeta =
        (meta.loginId && meta.loginId === normInput) ||
        (meta.authEmail && meta.authEmail === normInput) ||
        (matchedClubName && meta.clubName.toLowerCase() === matchedClubName.toLowerCase()) ||
        (isClubSyntheticEmail(normInput) &&
          slugifyClubIdentifier(meta.loginId) === inputSlug);

      if (matchesMeta) {
        metas.push(meta);
      }
    }

    metas.sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''));

    for (const m of metas) {
      if (m.revoked && candidates.length === 0) {
        revoked = true;
        matchedClubName = matchedClubName || m.clubName;
      } else if (!m.revoked) {
        revoked = false;
        matchedClubName = matchedClubName || m.clubName;
        addCandidate(m.authEmail);
        if (m.loginId) {
          addCandidate(buildClubSyntheticEmail(m.loginId));
        }
      }
    }

    if (isClubSyntheticEmail(normInput) && !revoked) {
      addCandidate(normInput);
    }
  } catch (err) {
    console.warn('Avertissement résolution identifiant club:', err);
  }

  return {
    candidateEmails: revoked ? [] : candidates,
    matchedClubName,
    revoked,
  };
}

/**
 * Provisions or resets a partnered sports club's portal credentials without disturbing the
 * currently logged-in cabinet administrator's session.
 */
export async function provisionOrResetClubAccess(params: {
  supabaseClient: SupabaseClient;
  supabaseUrl: string;
  supabaseAnonKey: string;
  club: PartnerClub;
  loginIdentifier: string;
  rawPassword: string;
}): Promise<{
  userId: string;
  loginId: string;
  authEmail: string;
  clubName: string;
}> {
  const { supabaseClient, supabaseUrl, supabaseAnonKey, club } = params;
  const cleanClubName = (club?.name || '').trim();
  if (!cleanClubName) {
    throw new Error('Nom du club manquant.');
  }

  const cleanLogin = normalizeClubLoginId(params.loginIdentifier);
  if (!cleanLogin || cleanLogin.length < 3) {
    throw new Error("Veuillez saisir un identifiant de connexion valide (minimum 3 caractères).");
  }

  const cleanPassword = stripInvisibleChars(params.rawPassword);
  if (!cleanPassword || cleanPassword.length < 6) {
    throw new Error('Le mot de passe doit contenir au moins 6 caractères.');
  }

  // Isolated non-persisting Supabase client so cabinet staff session is never overwritten
  const tempClient = createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
      lock: async (_name: string, _acquireTimeout: number, fn: () => Promise<any>) => await fn(),
    },
  });

  const canonicalAuthEmail = buildClubSyntheticEmail(cleanLogin);
  let resolvedUserId = '';
  let resolvedAuthEmail = canonicalAuthEmail;

  // Step 1: Attempt signUp on canonical `@club.reforme.center` email
  const { data: signUpData, error: signUpErr } = await tempClient.auth.signUp({
    email: canonicalAuthEmail,
    password: cleanPassword,
  });

  if (!signUpErr && signUpData?.user?.id) {
    resolvedUserId = signUpData.user.id;
    resolvedAuthEmail = canonicalAuthEmail;
  } else if (signUpErr && signUpErr.message?.toLowerCase().includes('already registered')) {
    // Step 2: Check if existing account already has this exact password
    const { data: signInData, error: signInErr } = await tempClient.auth.signInWithPassword({
      email: canonicalAuthEmail,
      password: cleanPassword,
    });

    if (!signInErr && signInData?.user?.id) {
      resolvedUserId = signInData.user.id;
      resolvedAuthEmail = canonicalAuthEmail;
    } else {
      // Step 3: Password reset -> create fresh versioned `@club.reforme.center` account immediately
      const versionToken = Date.now().toString(36);
      const versionedEmail = buildClubSyntheticEmail(cleanLogin, versionToken);
      const { data: vSignUp, error: vErr } = await tempClient.auth.signUp({
        email: versionedEmail,
        password: cleanPassword,
      });

      if (vErr) {
        throw new Error(
          vErr.message || "Impossible de réinitialiser l'accès du club pour le moment."
        );
      }
      if (!vSignUp?.user?.id) {
        throw new Error("Impossible d'obtenir l'identifiant du nouveau compte club.");
      }

      resolvedUserId = vSignUp.user.id;
      resolvedAuthEmail = versionedEmail;
    }
  } else if (signUpErr) {
    throw new Error(signUpErr.message || "Erreur lors de la création de l'accès club.");
  }

  await tempClient.auth.signOut({ scope: 'local' }).catch(() => {});

  if (!resolvedUserId) {
    throw new Error("Impossible d'initialiser le compte d'administration du club.");
  }

  const nowIso = new Date().toISOString();
  const profilePerms = [
    CLUB_PORTAL_FLAG,
    `${CLUB_NAME_PREFIX}${cleanClubName}`,
    `${CLUB_LOGIN_PREFIX}${cleanLogin}`,
    `${CLUB_AUTH_EMAIL_PREFIX}${resolvedAuthEmail}`,
    `${CLUB_UPDATED_PREFIX}${nowIso}`,
  ];

  // Upsert the club's `profiles` row using `role: 'patient'` (passes DB check constraints & stays out of staff lists)
  const { error: profileErr } = await supabaseClient
    .from('profiles')
    .upsert([{ id: resolvedUserId, role: 'patient', permissions: profilePerms }]);

  if (profileErr) {
    console.warn('Avertissement écriture profil club:', profileErr.message);
  }

  // Mark any older `profiles` rows for this same club as replaced so old credentials cannot be reused
  try {
    const { data: existingRows } = await supabaseClient
      .from('profiles')
      .select('id, role, permissions')
      .eq('role', 'patient');

    const clubLower = cleanClubName.toLowerCase();
    for (const row of existingRows || []) {
      if (row.id === resolvedUserId) continue;
      const meta = parseClubProfileMeta(row);
      if (
        meta &&
        (meta.clubName.toLowerCase() === clubLower ||
          (meta.loginId && meta.loginId === cleanLogin))
      ) {
        await supabaseClient
          .from('profiles')
          .update({
            permissions: [CLUB_REVOKED_FLAG, `${CLUB_NAME_PREFIX}${cleanClubName}`],
          })
          .eq('id', row.id);
      }
    }
  } catch {
    // Non-blocking cleanup
  }

  // Persist active access metadata onto the PartnerClub registry so all staff see it
  await upsertPartnerClub(supabaseClient, {
    ...club,
    name: cleanClubName,
    hasAccess: true,
    loginId: cleanLogin,
    authEmail: resolvedAuthEmail,
    accessUpdatedAt: nowIso,
  });

  return {
    userId: resolvedUserId,
    loginId: cleanLogin,
    authEmail: resolvedAuthEmail,
    clubName: cleanClubName,
  };
}

/**
 * Revokes a partnered sports club's portal access immediately.
 */
export async function revokeClubAccess(
  supabaseClient: SupabaseClient,
  club: PartnerClub
): Promise<void> {
  const cleanClubName = (club?.name || '').trim();
  if (!cleanClubName) return;

  const nowIso = new Date().toISOString();

  await upsertPartnerClub(supabaseClient, {
    ...club,
    name: cleanClubName,
    hasAccess: false,
    authEmail: '',
    accessUpdatedAt: nowIso,
  });

  try {
    const { data: rows } = await supabaseClient
      .from('profiles')
      .select('id, role, permissions')
      .eq('role', 'patient');

    const clubLower = cleanClubName.toLowerCase();
    for (const row of rows || []) {
      const meta = parseClubProfileMeta(row);
      if (meta && meta.clubName.toLowerCase() === clubLower) {
        await supabaseClient
          .from('profiles')
          .update({
            permissions: [CLUB_REVOKED_FLAG, `${CLUB_NAME_PREFIX}${cleanClubName}`],
          })
          .eq('id', row.id);
      }
    }
  } catch (err) {
    console.warn('Avertissement révocation profil club:', err);
  }
}

/**
 * Navigates cabinet staff/admin into preview mode for a specific Partner Club's portal.
 */
export function openClubPortalPreview(clubName: string, fromRoute = 'finance'): void {
  const clean = (clubName || '').trim();
  if (!clean) return;
  try {
    localStorage.setItem('reforme_preview_club_name', clean);
    sessionStorage.setItem('reforme_club_return_route', fromRoute);
  } catch {}
  window.location.hash = 'espace-club';
}
