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

export interface ParsedPatientMutuelle {
  isMutualiste: boolean;
  organisme: string;
  cleanAtcd: string;
  hasExplicitTag: boolean;
}

const MUTUELLE_TAG_REGEX = /\s*\[\[MUTUELLE:(OUI|NON)(?:\|([^\]]*))?\]\]\s*/gi;

/**
 * Extracts mutuelle status, organism name, and clean medical history (`cleanAtcd`)
 * from a patient record without altering database table columns.
 */
export function parsePatientMutuelle(
  patient: any,
  mutuelleBillingPatientIds?: Set<string>
): ParsedPatientMutuelle {
  const rawAtcd = typeof patient?.atcd === 'string' ? patient.atcd : '';

  let hasExplicitTag = false;
  let isMutualiste = false;
  let organisme = '';

  const match = /\[\[MUTUELLE:(OUI|NON)(?:\|([^\]]*))?\]\]/i.exec(rawAtcd);
  if (match) {
    hasExplicitTag = true;
    isMutualiste = match[1].toUpperCase() === 'OUI';
    organisme = isMutualiste ? (match[2] || '').trim() : '';
  } else if (patient?.id && mutuelleBillingPatientIds?.has(patient.id)) {
    isMutualiste = true;
    organisme = 'Mutuelle';
  }

  const cleanAtcd = rawAtcd.replace(MUTUELLE_TAG_REGEX, ' ').trim();

  return {
    isMutualiste,
    organisme,
    cleanAtcd,
    hasExplicitTag,
  };
}

/**
 * Strips any existing `[[MUTUELLE:...]]` tag from `atcdText` and appends
 * the updated mutuelle status tag.
 */
export function serializeAtcdWithMutuelle(
  atcdText: string,
  isMutualiste: boolean,
  organisme?: string
): string {
  const clean = (atcdText || '').replace(MUTUELLE_TAG_REGEX, ' ').trim();
  const cleanOrg = (organisme || '').replace(/[\[\]\|]/g, '').trim();

  const tag = isMutualiste
    ? cleanOrg
      ? `[[MUTUELLE:OUI|${cleanOrg}]]`
      : `[[MUTUELLE:OUI]]`
    : `[[MUTUELLE:NON]]`;

  return clean ? `${clean} ${tag}` : tag;
}
