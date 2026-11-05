export const STANDARD_MOTIFS: string[] = [
  'Kinésithérapie classique',
  'Échographie',
  'Kiné-respiratoire',
  'Réathlétisation',
  'Cupping thérapie',
  'Onde de choc',
  'Tecar thérapie',
  'Récupération',
  'Rééducation vestibulaire',
  'Séance de bilan',
  'Consultation nutritionnelle',
  'Séance de contrôle',
  'Thérapie manuelle',
  'Séance de Suivi',
  'Séance à domicile',
  'Clinique Taghzout',
  'Clinique Chiekhe Essaadi Agadir',
];

export const QUICK_MOTIFS: string[] = [
  'Kinésithérapie classique',
  'Échographie',
  'Tecar thérapie',
  'Onde de choc',
  'Thérapie manuelle',
  'Réathlétisation',
  'Cupping thérapie',
  'Récupération',
  'Séance de bilan',
  'Séance de Suivi',
];

/**
 * Splits a motif string into individual acts (separated by '+' or '&' or '/').
 * Preserves the original casing of each part.
 */
export function splitMotifs(value: string | null | undefined): string[] {
  if (!value) return [];
  // Clean off therapist metadata tags if any
  const cleaned = String(value)
    .replace(/^\|\|TH_ID:[a-f0-9-]+\|\|/i, '')
    .trim();
  if (!cleaned) return [];

  // Split on '+', '&', or '/'
  return cleaned
    .split(/\s*(?:\+|\/|&)\s*/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

/**
 * Formats an array of 1 or 2 motifs into a standardized combined string.
 */
export function combineMotifs(parts: string[]): string {
  const cleanParts = parts.map((p) => p.trim()).filter(Boolean);
  if (cleanParts.length === 0) return '';
  if (cleanParts.length === 1) return cleanParts[0];
  return `${cleanParts[0]} + ${cleanParts[1]}`;
}

/**
 * Checks whether a specific motif is part of the current selection.
 */
export function isMotifSelected(currentValue: string | null | undefined, motif: string): boolean {
  if (!currentValue || !motif) return false;
  const target = motif.trim().toLowerCase();
  const parts = splitMotifs(currentValue).map((p) => p.toLowerCase());
  return parts.includes(target);
}

/**
 * Toggles a motif into or out of the current selection (supporting up to max 2 motifs).
 * - If motif already in selection: removes it.
 * - If 0 motifs: sets it as the first motif.
 * - If 1 motif: adds it as the 2nd motif (combines with ' + ').
 * - If 2 motifs: replaces the second motif with the newly selected one.
 */
export function toggleMotif(
  currentValue: string | null | undefined,
  motifToToggle: string,
  max: number = 2
): string {
  const trimmed = (motifToToggle || '').trim();
  if (!trimmed) return currentValue || '';

  const currentParts = splitMotifs(currentValue);
  const targetLower = trimmed.toLowerCase();

  // If already selected, remove it
  const existingIndex = currentParts.findIndex((p) => p.toLowerCase() === targetLower);
  if (existingIndex >= 0) {
    const nextParts = currentParts.filter((_, idx) => idx !== existingIndex);
    return combineMotifs(nextParts);
  }

  // If empty, set as first
  if (currentParts.length === 0) {
    return trimmed;
  }

  // If 1 motif, append as 2nd motif
  if (currentParts.length < max) {
    return combineMotifs([...currentParts, trimmed]);
  }

  // If already at max (e.g. 2), replace the 2nd motif
  return combineMotifs([currentParts[0], trimmed]);
}
