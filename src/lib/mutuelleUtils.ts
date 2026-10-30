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
      .eq('role', 'admin');

    for (const admin of admins || []) {
      const rawArr: string[] = Array.isArray(admin?.permissions) ? admin.permissions : [];
      for (const item of rawArr) {
        if (typeof item === 'string' && item.startsWith(CLUB_CONV_PREFIX)) {
          try {
            const parsed: PartnerClub = JSON.parse(item.slice(CLUB_CONV_PREFIX.length));
            const cleanName = (parsed?.name || '').trim();
            if (cleanName) {
              clubMap.set(cleanName.toLowerCase(), {
                name: cleanName,
                sport: (parsed.sport || 'Omnisports').trim(),
                tarifConvention:
                  parsed.tarifConvention !== undefined && parsed.tarifConvention !== null
                    ? Number(parsed.tarifConvention)
                    : null,
                note: (parsed.note || '').trim(),
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

  const primaryAdmin = admins[0];
  const rawArr: string[] = Array.isArray(primaryAdmin.permissions)
    ? primaryAdmin.permissions.filter((x: any) => typeof x === 'string')
    : [];

  const targetKey = cleanName.toLowerCase();
  const filtered = rawArr.filter((item) => {
    if (!item.startsWith(CLUB_CONV_PREFIX)) return true;
    try {
      const parsed = JSON.parse(item.slice(CLUB_CONV_PREFIX.length));
      return (parsed?.name || '').trim().toLowerCase() !== targetKey;
    } catch {
      return false;
    }
  });

  const payload: PartnerClub = {
    name: cleanName,
    sport: (club.sport || 'Football').trim(),
    tarifConvention:
      club.tarifConvention !== undefined &&
      club.tarifConvention !== null &&
      !isNaN(Number(club.tarifConvention)) &&
      Number(club.tarifConvention) > 0
        ? Number(club.tarifConvention)
        : null,
    note: (club.note || '').trim(),
  };

  filtered.push(`${CLUB_CONV_PREFIX}${JSON.stringify(payload)}`);

  const { error: updErr } = await supabaseClient
    .from('profiles')
    .update({ permissions: filtered })
    .eq('id', primaryAdmin.id);

  if (updErr) throw updErr;
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

  // Detach patients that were assigned to this club
  for (const p of affiliatedPatients) {
    const info = parsePatientMutuelle(p);
    if (info.club && info.club.toLowerCase() === targetKey) {
      const updatedAtcd = serializeAtcdWithClubOnly(p, '');
      await supabaseClient.from('patients').update({ atcd: updatedAtcd }).eq('id', p.id);
    }
  }
}
