/**
 * Utilitaires de gestion du fuseau horaire Maroc (GMT+1 / Africa/Casablanca).
 * Garantit que l'heure actuelle dans l'application web correspond toujours
 * à l'heure officielle du Maroc (UTC+1), même si l'ordinateur ou le navigateur
 * a son système réglé sur UTC+0 (cas fréquent sous Windows au Maroc).
 */

/**
 * Retourne un objet Date dont les méthodes locales (.getHours(), .getMinutes(), format(), etc.)
 * reflètent exactement l'heure actuelle au Maroc (GMT+1 / UTC+1), quel que soit le réglage
 * de fuseau horaire du système d'exploitation.
 */
export function getMoroccoNow(): Date {
  const now = new Date();
  const utcMs = now.getTime() + now.getTimezoneOffset() * 60000;
  // Heure officielle du Maroc : GMT+1 (UTC + 60 minutes)
  return new Date(utcMs + 60 * 60000);
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
 * Convertit un timestamp système UTC (ex: created_at de Supabase) en heure du Maroc (GMT+1) au format 'HH:mm'
 */
export function formatUtcToMoroccoTime(utcInput: string | Date | null | undefined): string {
  if (!utcInput) return getMoroccoTimeStr();
  const d = utcInput instanceof Date ? utcInput : new Date(utcInput);
  if (isNaN(d.getTime())) return getMoroccoTimeStr();
  const utcMs = d.getTime() + d.getTimezoneOffset() * 60000;
  const moroccoDate = new Date(utcMs + 60 * 60000);
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
