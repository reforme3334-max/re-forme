/**
 * Utilitaires de gestion du fuseau horaire Maroc (GMT+1 / Africa/Casablanca)
 * avec possibilité de modifier manuellement l'heure actuelle ou le fuseau (GMT+1, GMT+0 Ramadan, ou heure personnalisée).
 */

const STORAGE_MODE_KEY = 'reforme_time_mode'; // 'GMT+1' | 'GMT+0' | 'SYSTEM' | 'CUSTOM'
const STORAGE_OFFSET_KEY = 'reforme_custom_offset_min'; // décalage supplémentaire en minutes par rapport à UTC

export type ClinicTimeMode = 'GMT+1' | 'GMT+0' | 'SYSTEM' | 'CUSTOM';

export function getClinicTimeMode(): ClinicTimeMode {
  try {
    const saved = localStorage.getItem(STORAGE_MODE_KEY) as ClinicTimeMode | null;
    if (saved === 'GMT+1' || saved === 'GMT+0' || saved === 'SYSTEM' || saved === 'CUSTOM') {
      return saved;
    }
  } catch {}
  return 'GMT+1';
}

export function getClinicOffsetMinutes(): number {
  try {
    const mode = getClinicTimeMode();
    if (mode === 'GMT+1') return 60;
    if (mode === 'GMT+0') return 0;
    if (mode === 'SYSTEM') {
      return -new Date().getTimezoneOffset();
    }
    if (mode === 'CUSTOM') {
      const raw = localStorage.getItem(STORAGE_OFFSET_KEY);
      if (raw !== null && !isNaN(Number(raw))) {
        return Number(raw);
      }
    }
  } catch {}
  return 60; // Par défaut GMT+1 (Maroc)
}

/**
 * Permet de choisir un mode de fuseau ('GMT+1', 'GMT+0', 'SYSTEM')
 */
export function setClinicTimeMode(mode: ClinicTimeMode, customOffsetMin?: number): void {
  try {
    localStorage.setItem(STORAGE_MODE_KEY, mode);
    if (typeof customOffsetMin === 'number') {
      localStorage.setItem(STORAGE_OFFSET_KEY, String(customOffsetMin));
    }
    window.dispatchEvent(new CustomEvent('reforme-time-updated'));
  } catch (e) {
    console.warn('Impossible de sauvegarder le réglage horaire', e);
  }
}

/**
 * Permet à l'utilisateur de saisir directement l'heure actuelle souhaitée (ex: "16:58")
 * et calcule automatiquement le décalage exact par rapport à l'horloge système.
 */
export function setClinicCustomTime(targetHHmm: string): void {
  const parts = targetHHmm.trim().split(':');
  if (parts.length < 2) return;
  const targetH = parseInt(parts[0], 10);
  const targetM = parseInt(parts[1], 10);
  if (isNaN(targetH) || isNaN(targetM)) return;

  const now = new Date();
  const utcMs = now.getTime() + now.getTimezoneOffset() * 60000;
  const utcDate = new Date(utcMs);
  const utcTotalMinutes = utcDate.getHours() * 60 + utcDate.getMinutes();
  const targetTotalMinutes = targetH * 60 + targetM;

  let diffMinutes = targetTotalMinutes - utcTotalMinutes;
  // Normaliser entre -720 et +720 minutes (-12h à +12h)
  if (diffMinutes > 720) diffMinutes -= 1440;
  if (diffMinutes < -720) diffMinutes += 1440;

  setClinicTimeMode('CUSTOM', diffMinutes);
}

/**
 * Retourne un objet Date dont les méthodes locales (.getHours(), .getMinutes(), format(), etc.)
 * reflètent exactement l'heure configurée du cabinet au Maroc.
 */
export function getMoroccoNow(): Date {
  const now = new Date();
  const utcMs = now.getTime() + now.getTimezoneOffset() * 60000;
  const offsetMin = getClinicOffsetMinutes();
  return new Date(utcMs + offsetMin * 60000);
}

/**
 * Retourne la date du jour au Maroc au format 'YYYY-MM-DD'
 */
export function getMoroccoTodayStr(): string {
  const m = getMoroccoNow();
  const year = m.getFullYear();
  const month = String(m.getMonth() + 1).padStart(2, '0');
  const day = String(m.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Retourne l'heure actuelle au Maroc au format 'HH:mm'
 */
export function getMoroccoTimeStr(): string {
  const m = getMoroccoNow();
  const hours = String(m.getHours()).padStart(2, '0');
  const minutes = String(m.getMinutes()).padStart(2, '0');
  return `${hours}:${minutes}`;
}

/**
 * Convertit un timestamp système UTC (ex: created_at de Supabase) en heure du cabinet au format 'HH:mm'
 */
export function formatUtcToMoroccoTime(utcInput: string | Date | null | undefined): string {
  if (!utcInput) return getMoroccoTimeStr();
  const d = utcInput instanceof Date ? utcInput : new Date(utcInput);
  if (isNaN(d.getTime())) return getMoroccoTimeStr();
  const utcMs = d.getTime() + d.getTimezoneOffset() * 60000;
  const offsetMin = getClinicOffsetMinutes();
  const moroccoDate = new Date(utcMs + offsetMin * 60000);
  const hours = String(moroccoDate.getHours()).padStart(2, '0');
  const minutes = String(moroccoDate.getMinutes()).padStart(2, '0');
  return `${hours}:${minutes}`;
}

/**
 * Parse une date de rendez-vous stockée en base (ex: '2026-10-06T16:00:00+00:00')
 * en conservant l'heure murale exacte du cabinet (16:00 -> 16h00) sur tous les appareils
 * (PC en GMT+0 comme smartphones en GMT+1).
 */
export function parseClinicDate(dateInput: string | Date | null | undefined): Date {
  if (!dateInput) return getMoroccoNow();
  if (dateInput instanceof Date) return dateInput;

  const str = String(dateInput).trim();
  const match = str.match(/^(\d{4})-(\d{2})-(\d{2})(?:[T\s](\d{2}):(\d{2})(?::(\d{2}))?)?/);
  if (match) {
    const year = parseInt(match[1], 10);
    const month = parseInt(match[2], 10) - 1;
    const day = parseInt(match[3], 10);
    const hours = match[4] ? parseInt(match[4], 10) : 0;
    const minutes = match[5] ? parseInt(match[5], 10) : 0;
    const seconds = match[6] ? parseInt(match[6], 10) : 0;
    return new Date(year, month, day, hours, minutes, seconds, 0);
  }

  return new Date(str);
}

/**
 * Formate une date et une heure (ex: Date + '14:30' ou '2026-10-07' + '14:30')
 * en chaîne ISO standardisée ('YYYY-MM-DDTHH:mm:00+00:00') pour Supabase,
 * afin que l'heure choisie reste identique quel que soit l'appareil qui l'enregistre.
 */
export function toClinicIsoString(datePart: Date | string, timePart?: string): string {
  let year: number;
  let month: string;
  let day: string;
  let hours = '09';
  let minutes = '00';

  if (typeof datePart === 'string') {
    const cleanDate = datePart.split('T')[0];
    const parts = cleanDate.split('-');
    year = parseInt(parts[0], 10);
    month = (parts[1] || '01').padStart(2, '0');
    day = (parts[2] || '01').padStart(2, '0');
  } else {
    year = datePart.getFullYear();
    month = String(datePart.getMonth() + 1).padStart(2, '0');
    day = String(datePart.getDate()).padStart(2, '0');
    hours = String(datePart.getHours()).padStart(2, '0');
    minutes = String(datePart.getMinutes()).padStart(2, '0');
  }

  if (timePart) {
    const tParts = timePart.split(':');
    hours = (tParts[0] || '09').padStart(2, '0');
    minutes = (tParts[1] || '00').padStart(2, '0');
  }

  return `${year}-${month}-${day}T${hours}:${minutes}:00+00:00`;
}
