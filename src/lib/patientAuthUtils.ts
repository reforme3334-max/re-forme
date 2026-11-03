import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { fetchAllRows } from './financeUtils';

const INVISIBLE_UNICODE_REGEX = /[\u200B-\u200F\u202A-\u202E\u2066-\u2069\uFEFF\u00A0]/g;

export const PATIENT_ID_TAG_PREFIX = '__patient_id:';
export const PATIENT_PHONE_TAG_PREFIX = '__patient_phone:';
export const PATIENT_EMAIL_TAG_PREFIX = '__patient_email:';
export const PATIENT_UPDATED_TAG_PREFIX = '__patient_updated:';

/**
 * Strips invisible directional/zero-width Unicode marks (e.g. WhatsApp/iOS copy-paste)
 * and trims surrounding whitespace.
 */
export function stripInvisibleChars(input: string): string {
  return String(input || '').replace(INVISIBLE_UNICODE_REGEX, '').trim();
}

/**
 * Normalizes a Moroccan or general phone number into a canonical login identifier
 * (e.g. "+212 6 61 65 32 07" -> "0661653207", "06-61-65-32-07" -> "0661653207",
 * "661653207" -> "0661653207").
 */
export function normalizePatientPhone(rawPhone: string): string {
  const cleaned = stripInvisibleChars(rawPhone);
  if (!cleaned) return '';

  const digits = cleaned.replace(/\D/g, '');
  if (!digits) return '';

  // 00212XXXXXXXXX -> 0XXXXXXXXX (when 9 digits follow 00212)
  if (digits.startsWith('00212') && digits.length === 14) {
    return '0' + digits.slice(5);
  }

  // 212XXXXXXXXX -> 0XXXXXXXXX (when 9 digits follow 212)
  if (digits.startsWith('212') && digits.length === 12) {
    return '0' + digits.slice(3);
  }

  // 9-digit local Moroccan mobile/landline without leading 0 (e.g. 661653207 -> 0661653207)
  if (digits.length === 9 && /^[5678]/.test(digits)) {
    return '0' + digits;
  }

  return digits;
}

/**
 * Checks whether an email is a synthetic patient portal email
 * (including versioned aliases such as 0612345678.vabc@patient.reforme.center).
 */
export function isPatientSyntheticEmail(email?: string | null): boolean {
  const clean = stripInvisibleChars(email || '').toLowerCase();
  return clean.endsWith('@patient.reforme.center');
}

/**
 * Extracts the normalized phone number from a synthetic patient auth email
 * (strips optional `.v<token>` reset suffix before `@patient.reforme.center`).
 */
export function extractPhoneFromPatientAuthEmail(email?: string | null): string {
  const clean = stripInvisibleChars(email || '').toLowerCase();
  if (!clean.endsWith('@patient.reforme.center')) return '';
  const localPart = clean.slice(0, -'@patient.reforme.center'.length);
  const basePhone = localPart.replace(/\.v[a-z0-9]+$/i, '');
  return normalizePatientPhone(basePhone) || basePhone;
}

export interface PatientProfileAuthMeta {
  profileId: string;
  patientId: string;
  phone: string;
  authEmail: string;
  updatedAt: string;
}

export function parsePatientProfileAuthMeta(rawProfile: any): PatientProfileAuthMeta | null {
  if (!rawProfile || rawProfile.role !== 'patient') return null;
  const perms: string[] = Array.isArray(rawProfile.permissions)
    ? rawProfile.permissions.filter((x: any) => typeof x === 'string')
    : [];
  if (perms.length === 0) return null;

  let patientId = '';
  let phone = '';
  let authEmail = '';
  let updatedAt = '';

  for (const item of perms) {
    if (item.startsWith(PATIENT_ID_TAG_PREFIX)) {
      patientId = item.slice(PATIENT_ID_TAG_PREFIX.length).trim();
    } else if (item.startsWith(PATIENT_PHONE_TAG_PREFIX)) {
      phone = item.slice(PATIENT_PHONE_TAG_PREFIX.length).trim();
    } else if (item.startsWith(PATIENT_EMAIL_TAG_PREFIX)) {
      authEmail = item.slice(PATIENT_EMAIL_TAG_PREFIX.length).trim().toLowerCase();
    } else if (item.startsWith(PATIENT_UPDATED_TAG_PREFIX)) {
      updatedAt = item.slice(PATIENT_UPDATED_TAG_PREFIX.length).trim();
    }
  }

  if (!patientId && !phone && !authEmail) return null;

  return {
    profileId: rawProfile.id,
    patientId,
    phone,
    authEmail,
    updatedAt: updatedAt || rawProfile.created_at || '',
  };
}

export function buildPatientProfilePermissions(meta: {
  patientId: string;
  phone: string;
  authEmail: string;
  updatedAt?: string;
}): string[] {
  const out: string[] = [];
  if (meta.patientId) out.push(`${PATIENT_ID_TAG_PREFIX}${meta.patientId}`);
  if (meta.phone) out.push(`${PATIENT_PHONE_TAG_PREFIX}${meta.phone}`);
  if (meta.authEmail) out.push(`${PATIENT_EMAIL_TAG_PREFIX}${meta.authEmail.toLowerCase()}`);
  out.push(`${PATIENT_UPDATED_TAG_PREFIX}${meta.updatedAt || new Date().toISOString()}`);
  return out;
}

/**
 * Resolves all candidate Supabase Auth emails to try when a patient logs in
 * with their phone number (handles password resets via versioned aliases,
 * +212 / 00212 / spaces / dashes / WhatsApp formatting, and legacy accounts).
 */
export async function resolvePatientLoginCandidates(
  supabaseClient: SupabaseClient,
  rawPhoneInput: string
): Promise<string[]> {
  const stripped = stripInvisibleChars(rawPhoneInput);
  const rawNoSpaces = stripped.replace(/\s+/g, '');
  const rawDigits = stripped.replace(/\D/g, '');
  const canonicalPhone = normalizePatientPhone(stripped);
  const tail = canonicalPhone.slice(-8);
  const validTail = tail.length === 8 && !/^0+$/.test(tail);

  const candidates: string[] = [];
  const addCandidate = (email?: string | null) => {
    const clean = stripInvisibleChars(email || '').toLowerCase();
    if (clean && clean.includes('@') && !candidates.includes(clean)) {
      candidates.push(clean);
    }
  };

  // 1. Check `profiles` (role = 'patient') for any explicit/versioned auth emails (most recent reset first)
  try {
    const { data: patientProfiles } = await supabaseClient
      .from('profiles')
      .select('id, role, created_at, permissions')
      .eq('role', 'patient')
      .not('permissions', 'eq', '{}');

    if (patientProfiles && patientProfiles.length > 0) {
      const matchedMetas = patientProfiles
        .map(parsePatientProfileAuthMeta)
        .filter((m): m is PatientProfileAuthMeta => {
          if (!m || !m.authEmail) return false;
          const mNorm = normalizePatientPhone(m.phone);
          if (canonicalPhone && mNorm === canonicalPhone) return true;
          if (validTail && mNorm.slice(-8) === tail) return true;
          return false;
        })
        .sort((a, b) => new Date(b.updatedAt || 0).getTime() - new Date(a.updatedAt || 0).getTime());

      for (const meta of matchedMetas) {
        addCandidate(meta.authEmail);
      }
    }
  } catch {
    // Non-blocking fallback to standard candidates
  }

  // 2. Canonical Moroccan format (e.g. 0612345678@patient.reforme.center)
  if (canonicalPhone) {
    addCandidate(`${canonicalPhone}@patient.reforme.center`);
  }

  // 3. Check `patients` table for exact stored telephone format or real email
  try {
    const allPatients = await fetchAllRows(
      'patients',
      'id, telephone, email, has_access, created_at'
    );
    const matchingPatients = (allPatients || [])
      .filter((p: any) => {
        const pNorm = normalizePatientPhone(p.telephone || '');
        if (!pNorm) return false;
        if (canonicalPhone && pNorm === canonicalPhone) return true;
        if (validTail && pNorm.slice(-8) === tail) return true;
        return false;
      })
      .sort((a: any, b: any) => Number(Boolean(b.has_access)) - Number(Boolean(a.has_access)));

    for (const p of matchingPatients) {
      const exactStored = stripInvisibleChars(p.telephone || '').replace(/\s+/g, '');
      if (exactStored) {
        addCandidate(`${exactStored}@patient.reforme.center`);
      }
      if (p.email && String(p.email).includes('@')) {
        addCandidate(p.email);
      }
    }
  } catch {
    // Ignore table lookup errors and rely on computed variants
  }

  // 4. Fallback phone variants (+212, 212, 00212, raw digits, raw non-space input)
  if (/^0[5678]\d{8}$/.test(canonicalPhone)) {
    const withoutZero = canonicalPhone.slice(1);
    addCandidate(`+212${withoutZero}@patient.reforme.center`);
    addCandidate(`212${withoutZero}@patient.reforme.center`);
    addCandidate(`00212${withoutZero}@patient.reforme.center`);
    addCandidate(`${withoutZero}@patient.reforme.center`);
  }

  if (rawDigits) {
    addCandidate(`${rawDigits}@patient.reforme.center`);
  }
  if (rawNoSpaces && !rawNoSpaces.includes('@')) {
    addCandidate(`${rawNoSpaces}@patient.reforme.center`);
  }

  return candidates;
}

/**
 * Creates or resets a patient's online portal credentials reliably.
 * Even when `${canonicalPhone}@patient.reforme.center` is already registered in
 * Supabase Auth with an older forgotten password, this provisions a fresh
 * auto-confirmed versioned auth alias and binds it in `public.profiles` so the
 * newly entered password works immediately.
 */
export async function provisionOrResetPatientAccess(
  supabaseClient: SupabaseClient,
  supabaseUrl: string,
  supabaseAnonKey: string,
  patient: { id: string; telephone: string },
  rawPassword: string
): Promise<{ canonicalPhone: string; authEmail: string; isReset: boolean }> {
  const canonicalPhone = normalizePatientPhone(patient.telephone || '');
  if (!canonicalPhone) {
    throw new Error('Le patient doit avoir un numéro de téléphone valide renseigné.');
  }

  const cleanPassword = stripInvisibleChars(rawPassword);
  if (!cleanPassword || cleanPassword.length < 6) {
    throw new Error('Le mot de passe doit contenir au moins 6 caractères.');
  }

  const tempAuthClient = createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
      lock: async (_name, _acquireTimeout, fn) => await fn(),
    },
  });

  const standardEmail = `${canonicalPhone}@patient.reforme.center`;
  let resolvedUserId = '';
  let resolvedAuthEmail = standardEmail;
  let isReset = false;

  // 1. Try creating standard synthetic account first
  const { data: signUpData, error: signUpError } = await tempAuthClient.auth.signUp({
    email: standardEmail,
    password: cleanPassword,
  });

  if (!signUpError && signUpData?.user?.id) {
    resolvedUserId = signUpData.user.id;
    resolvedAuthEmail = standardEmail;
  } else if (signUpError && signUpError.message?.toLowerCase().includes('already registered')) {
    // 2. Check if the standard account already uses this exact password
    const { data: stdSignIn, error: stdSignInErr } = await tempAuthClient.auth.signInWithPassword({
      email: standardEmail,
      password: cleanPassword,
    });

    if (!stdSignInErr && stdSignIn?.user?.id) {
      resolvedUserId = stdSignIn.user.id;
      resolvedAuthEmail = standardEmail;
      await tempAuthClient.auth.signOut({ scope: 'local' }).catch(() => {});
    } else {
      // 3. Password differs (clinic is resetting password or second family member on same phone):
      // create a fresh versioned auth alias that works immediately with `cleanPassword`
      isReset = true;
      const versionTag = Date.now().toString(36);
      const versionedEmail = `${canonicalPhone}.v${versionTag}@patient.reforme.center`;

      const { data: vSignUp, error: vSignUpErr } = await tempAuthClient.auth.signUp({
        email: versionedEmail,
        password: cleanPassword,
      });

      if (vSignUpErr) {
        throw vSignUpErr;
      }
      if (!vSignUp?.user?.id) {
        throw new Error("Impossible de créer le nouvel accès sécurisé pour ce patient.");
      }

      resolvedUserId = vSignUp.user.id;
      resolvedAuthEmail = versionedEmail;
    }
  } else if (signUpError) {
    throw signUpError;
  }

  if (!resolvedUserId) {
    throw new Error("Impossible d'obtenir l'identifiant d'accès du patient.");
  }

  // 4. Bind in `public.profiles` with explicit patient metadata so LoginPage & PatientPortal resolve it first
  const profilePerms = buildPatientProfilePermissions({
    patientId: patient.id,
    phone: canonicalPhone,
    authEmail: resolvedAuthEmail,
    updatedAt: new Date().toISOString(),
  });

  const { error: profileErr } = await supabaseClient
    .from('profiles')
    .upsert([{ id: resolvedUserId, role: 'patient', permissions: profilePerms }]);

  if (profileErr) {
    console.warn('Avertissement liaison profil patient:', profileErr.message);
  }

  // 5. Mark `has_access = true` on the patient record
  const { error: patErr } = await supabaseClient
    .from('patients')
    .update({ has_access: true })
    .eq('id', patient.id);

  if (patErr) {
    throw patErr;
  }

  return {
    canonicalPhone,
    authEmail: resolvedAuthEmail,
    isReset,
  };
}
