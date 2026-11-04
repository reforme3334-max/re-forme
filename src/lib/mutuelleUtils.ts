import { SupabaseClient } from '@supabase/supabase-js';

export const ORGANISMES_MUTUELLE = [
  'CNOPS',
  'CNSS (AMO)',
  'FAR',
  'AXA Assurance',
  'Sanlam',
  'RMA',
  'Wafa Assurance',
  'AtlantaSanad',
  'CMIM',
  'MGPAP',
  'Autre',
];

export const SPORTS_DISCIPLINES = [
  'Football',
  'Basketball',
  'Handball',
  'Volleyball',
  'Athlétisme',
  'Arts martiaux / Combat',
  'Tennis / Padel',
  'Surf / Sports nautiques',
  'Fitness / CrossFit',
  'Cyclisme',
  'Omnisports',
  'Autre',
];

export interface PartnerClub {
  name: string;
  sport: string;
  tarifConvention?: number | null;
  note?: string;
  hasAccess?: boolean;
  loginId?: string;
  authEmail?: string;
  accessUpdatedAt?: string;
}

export interface ParsedPatientMutuelle {
  isMutualiste: boolean;
  organisme: string;
  club: string;
  cleanAtcd: string;
  hasExplicitTag: boolean;
  hasClubTag: boolean;
}

export const CLUB_CONV_PREFIX = '__club_conv:';

const MUTUELLE_TAG_REGEX = /\s*\[\[MUTUELLE:(OUI|NON)(?:\|([^\]]*))?\]\]\s*/gi;
const CLUB_TAG_REGEX = /\s*\[\[CLUB:([^\]]*)\]\]\s*/gi;

/**
 * Extracts mutuelle status, organism name, affiliated sports club (`club`),
 * and clean medical history (`cleanAtcd`) from a patient record.
 */
export function parsePatientMutuelle(
  patient: any,
  mutuelleBillingPatientIds?: Set<string>
): ParsedPatientMutuelle {
  const rawAtcd = typeof patient?.atcd === 'string' ? patient.atcd : '';

  let hasExplicitTag = false;
  let isMutualiste = false;
  let organisme = '';

  const mutMatch = /\[\[MUTUELLE:(OUI|NON)(?:\|([^\]]*))?\]\]/i.exec(rawAtcd);
  if (mutMatch) {
    hasExplicitTag = true;
    isMutualiste = mutMatch[1].toUpperCase() === 'OUI';
    organisme = isMutualiste ? (mutMatch[2] || '').trim() : '';
  } else if (patient?.id && mutuelleBillingPatientIds?.has(patient.id)) {
    isMutualiste = true;
    organisme = 'Mutuelle';
  }

  let hasClubTag = false;
  let club = '';
  const clubMatch = /\[\[CLUB:([^\]]*)\]\]/i.exec(rawAtcd);
  if (clubMatch) {
    hasClubTag = true;
    club = (clubMatch[1] || '').trim();
  }

  const cleanAtcd = rawAtcd
    .replace(MUTUELLE_TAG_REGEX, ' ')
    .replace(CLUB_TAG_REGEX, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim();

  return {
    isMutualiste,
    organisme,
    club,
    cleanAtcd,
    hasExplicitTag,
    hasClubTag,
  };
}

/**
 * Strips any existing `[[MUTUELLE:...]]` and `[[CLUB:...]]` tags from `atcdText`
 * and appends updated structured tags cleanly.
 * If `club` is `undefined`, any existing `[[CLUB:...]]` inside `atcdText` is preserved!
 */
export function serializeAtcdWithMutuelle(
  atcdText: string,
  isMutualiste: boolean,
  organisme?: string,
  club?: string
): string {
  const raw = atcdText || '';

  // If caller did not pass `club`, preserve any existing club tag in `atcdText`
  let resolvedClub = club;
  if (resolvedClub === undefined) {
    const existingClubMatch = /\[\[CLUB:([^\]]*)\]\]/i.exec(raw);
    resolvedClub = existingClubMatch ? (existingClubMatch[1] || '').trim() : '';
  }

  const clean = raw
    .replace(MUTUELLE_TAG_REGEX, ' ')
    .replace(CLUB_TAG_REGEX, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim();

  const cleanOrg = (organisme || '').replace(/[\[\]\|]/g, '').trim();
  const cleanClub = (resolvedClub || '').replace(/[\[\]\|]/g, '').trim();

  const tags: string[] = [];
  tags.push(
    isMutualiste
      ? cleanOrg
        ? `[[MUTUELLE:OUI|${cleanOrg}]]`
        : `[[MUTUELLE:OUI]]`
      : `[[MUTUELLE:NON]]`
  );

  if (cleanClub) {
    tags.push(`[[CLUB:${cleanClub}]]`);
  }

  return [clean, ...tags].filter(Boolean).join(' ');
}

/**
 * Updates ONLY a patient's sports club affiliation while preserving their existing
 * clean ATCD and Mutuelle status intact.
 */
export function serializeAtcdWithClubOnly(patient: any, newClub: string): string {
  const info = parsePatientMutuelle(patient);
  const cleanClub = (newClub || '').replace(/[\[\]\|]/g, '').trim();

  if (info.hasExplicitTag) {
    return serializeAtcdWithMutuelle(info.cleanAtcd, info.isMutualiste, info.organisme, cleanClub);
  }

  // Preserve untagged mutuelle state if mutuelle wasn't explicitly set yet
  const parts = [info.cleanAtcd];
  if (cleanClub) {
    parts.push(`[[CLUB:${cleanClub}]]`);
  }
  return parts.filter(Boolean).join(' ');
}

/**
 * Loads all partner sports clubs saved in Supabase (from admin profile registry)
 * merged with any club names already assigned on patient records.
 */
export async function fetchPartnerClubs(
  supabaseClient: SupabaseClient,
  patientsList: any[] = []
): Promise<PartnerClub[]> {
  const clubMap = new Map<string, PartnerClub>();

  try {
    const { data: admins } = await supabaseClient
      .from('profiles')
      .select('permissions')
      .eq('role', 'admin')
      .order('created_at', { ascending: true });

    for (const admin of admins || []) {
      const rawArr: string[] = Array.isArray(admin?.permissions) ? admin.permissions : [];
      for (const item of rawArr) {
        if (typeof item === 'string' && item.startsWith(CLUB_CONV_PREFIX)) {
          try {
            const parsed: PartnerClub = JSON.parse(item.slice(CLUB_CONV_PREFIX.length));
            const cleanName = (parsed?.name || '').trim();
            if (cleanName) {
              const key = cleanName.toLowerCase();
              const prev = clubMap.get(key);
              clubMap.set(key, {
                name: cleanName,
                sport: (parsed.sport || prev?.sport || 'Omnisports').trim(),
                tarifConvention:
                  parsed.tarifConvention !== undefined && parsed.tarifConvention !== null
                    ? Number(parsed.tarifConvention)
                    : prev?.tarifConvention ?? null,
                note: (parsed.note ?? prev?.note ?? '').trim(),
                hasAccess:
                  parsed.hasAccess !== undefined ? Boolean(parsed.hasAccess) : prev?.hasAccess,
                loginId: parsed.loginId ? String(parsed.loginId).trim() : prev?.loginId,
                authEmail: parsed.authEmail ? String(parsed.authEmail).trim() : prev?.authEmail,
                accessUpdatedAt: parsed.accessUpdatedAt
                  ? String(parsed.accessUpdatedAt).trim()
                  : prev?.accessUpdatedAt,
              });
            }
          } catch {
            // Ignore malformed entry
          }
        }
      }
    }
  } catch (err) {
    console.warn('Could not load partner clubs from profiles:', err);
  }

  // Merge any club names found directly on patients
  for (const p of patientsList || []) {
    const info = parsePatientMutuelle(p);
    if (info.club) {
      const key = info.club.toLowerCase();
      if (!clubMap.has(key)) {
        clubMap.set(key, {
          name: info.club,
          sport: 'Omnisports',
          tarifConvention: null,
          note: '',
        });
      }
    }
  }

  return Array.from(clubMap.values()).sort((a, b) => a.name.localeCompare(b.name, 'fr'));
}

/**
 * Saves or updates a partner sports club in Supabase so all staff accounts see it.
 * Preserves existing portal access credentials (`hasAccess`, `loginId`, `authEmail`) unless explicitly updated.
 */
export async function upsertPartnerClub(
  supabaseClient: SupabaseClient,
  club: PartnerClub
): Promise<void> {
  const cleanName = (club.name || '').replace(/[\[\]\|]/g, '').trim();
  if (!cleanName) {
    throw new Error('Veuillez saisir le nom du club sportif.');
  }

  const { data: admins, error } = await supabaseClient
    .from('profiles')
    .select('*')
    .eq('role', 'admin')
    .order('created_at', { ascending: true });

  if (error) throw error;
  if (!admins || admins.length === 0) {
    throw new Error('Aucun profil administrateur trouvé pour enregistrer ce club.');
  }

  const targetKey = cleanName.toLowerCase();
  let existingClubEntry: PartnerClub | null = null;

  for (const admin of admins) {
    const rawArr: string[] = Array.isArray(admin.permissions)
      ? admin.permissions.filter((x: any) => typeof x === 'string')
      : [];
    for (const item of rawArr) {
      if (item.startsWith(CLUB_CONV_PREFIX)) {
        try {
          const parsed: PartnerClub = JSON.parse(item.slice(CLUB_CONV_PREFIX.length));
          if ((parsed?.name || '').trim().toLowerCase() === targetKey) {
            existingClubEntry = parsed;
          }
        } catch {
          // Ignore malformed entry
        }
      }
    }
  }

  const primaryAdmin = admins[0];
  const rawArr: string[] = Array.isArray(primaryAdmin.permissions)
    ? primaryAdmin.permissions.filter((x: any) => typeof x === 'string')
    : [];

  const filtered = rawArr.filter((item) => {
    if (!item.startsWith(CLUB_CONV_PREFIX)) return true;
    try {
      const parsed = JSON.parse(item.slice(CLUB_CONV_PREFIX.length));
      return (parsed?.name || '').trim().toLowerCase() !== targetKey;
    } catch {
      return false;
    }
  });

  const resolvedHasAccess =
    club.hasAccess !== undefined ? Boolean(club.hasAccess) : existingClubEntry?.hasAccess;
  const resolvedLoginId =
    club.loginId !== undefined ? club.loginId.trim() : existingClubEntry?.loginId;
  const resolvedAuthEmail =
    club.authEmail !== undefined ? club.authEmail.trim() : existingClubEntry?.authEmail;
  const resolvedUpdatedAt =
    club.accessUpdatedAt !== undefined
      ? club.accessUpdatedAt
      : existingClubEntry?.accessUpdatedAt;

  const payload: PartnerClub = {
    name: cleanName,
    sport: (club.sport || existingClubEntry?.sport || 'Football').trim(),
    tarifConvention:
      club.tarifConvention !== undefined
        ? club.tarifConvention !== null &&
          !isNaN(Number(club.tarifConvention)) &&
          Number(club.tarifConvention) > 0
          ? Number(club.tarifConvention)
          : null
        : existingClubEntry?.tarifConvention ?? null,
    note: (club.note !== undefined ? club.note : existingClubEntry?.note || '').trim(),
    ...(resolvedHasAccess !== undefined ? { hasAccess: resolvedHasAccess } : {}),
    ...(resolvedLoginId ? { loginId: resolvedLoginId } : {}),
    ...(resolvedAuthEmail ? { authEmail: resolvedAuthEmail } : {}),
    ...(resolvedUpdatedAt ? { accessUpdatedAt: resolvedUpdatedAt } : {}),
  };

  filtered.push(`${CLUB_CONV_PREFIX}${JSON.stringify(payload)}`);

  const { error: updErr } = await supabaseClient
    .from('profiles')
    .update({ permissions: filtered })
    .eq('id', primaryAdmin.id);

  if (updErr) throw updErr;

  // Clean up duplicate entries for the same club on secondary admin profiles if any
  for (let i = 1; i < admins.length; i++) {
    const secAdmin = admins[i];
    const secArr: string[] = Array.isArray(secAdmin.permissions)
      ? secAdmin.permissions.filter((x: any) => typeof x === 'string')
      : [];
    const secFiltered = secArr.filter((item) => {
      if (!item.startsWith(CLUB_CONV_PREFIX)) return true;
      try {
        const parsed = JSON.parse(item.slice(CLUB_CONV_PREFIX.length));
        return (parsed?.name || '').trim().toLowerCase() !== targetKey;
      } catch {
        return false;
      }
    });
    if (secFiltered.length !== secArr.length) {
      await supabaseClient
        .from('profiles')
        .update({ permissions: secFiltered })
        .eq('id', secAdmin.id);
    }
  }
}

/**
 * Deletes a partner sports club from the registry and optionally detaches affiliated patients.
 */
export async function removePartnerClub(
  supabaseClient: SupabaseClient,
  clubName: string,
  affiliatedPatients: any[] = []
): Promise<void> {
  const targetKey = (clubName || '').trim().toLowerCase();
  if (!targetKey) return;

  const { data: admins } = await supabaseClient
    .from('profiles')
    .select('*')
    .eq('role', 'admin');

  for (const admin of admins || []) {
    const rawArr: string[] = Array.isArray(admin.permissions)
      ? admin.permissions.filter((x: any) => typeof x === 'string')
      : [];

    const nextArr = rawArr.filter((item) => {
      if (!item.startsWith(CLUB_CONV_PREFIX)) return true;
      try {
        const parsed = JSON.parse(item.slice(CLUB_CONV_PREFIX.length));
        return (parsed?.name || '').trim().toLowerCase() !== targetKey;
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

  // Revoke any active portal profile bound to this club
  try {
    const { data: clubProfiles } = await supabaseClient
      .from('profiles')
      .select('id, permissions')
      .eq('role', 'patient');

    for (const row of clubProfiles || []) {
      const perms: string[] = Array.isArray(row?.permissions) ? row.permissions : [];
      if (!perms.includes('__club_portal:1')) continue;
      const nameTag = perms.find(
        (x) => typeof x === 'string' && x.startsWith('__club_name:')
      );
      const rowClub = nameTag ? nameTag.slice('__club_name:'.length).trim().toLowerCase() : '';
      if (rowClub === targetKey) {
        await supabaseClient
          .from('profiles')
          .update({ permissions: ['__club_revoked:1', `__club_name:${clubName.trim()}`] })
          .eq('id', row.id);
      }
    }
  } catch {
    // Non-blocking cleanup
  }

  // Detach patients that were assigned to this club
  for (const p of affiliatedPatients) {
    const info = parsePatientMutuelle(p);
    if (info.club && info.club.toLowerCase() === targetKey) {
      const updatedAtcd = serializeAtcdWithClubOnly(p, '');
      await supabaseClient.from('patients').update({ atcd: updatedAtcd }).eq('id', p.id);
    }
  }
}
