import { SupabaseClient } from '@supabase/supabase-js';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';
import { formatMoney, getBillDate, isPaidBillingStatus, isUnpaidBillingStatus, roundMoney, sumMoney } from './financeUtils';
import { parseClinicDate } from './timeUtils';
import { parsePatientMutuelle } from './mutuelleUtils';

export const DOC_TEMPLATE_PREFIX = '__doc_templates:';
export const INV_REFS_PREFIX = '__inv_refs:';
export const COLORLESS_ACCENT = 'incolore';
const LOCAL_STORAGE_KEY = 'reforme_document_templates_v1';
const CUSTOM_INV_REFS_KEY = 'reforme_custom_invoice_refs_v1';

export function isColorlessAccent(color?: string | null): boolean {
  const normalized = (color || '').trim().toLowerCase();
  return (
    normalized === COLORLESS_ACCENT ||
    normalized === 'none' ||
    normalized === 'transparent' ||
    normalized === 'sans-couleur'
  );
}

export type HeaderLayoutStyle = 'split' | 'centered' | 'banner';
export type TableVisualTheme = 'grid' | 'striped' | 'plain';
export type PageFormat = 'a5' | 'a4';
export type PageOrientation = 'portrait' | 'landscape';
export type MarginPreset = 'compact' | 'normal' | 'large';
export type PdfFontFamily = 'helvetica' | 'times' | 'courier';
export type InvoiceReferenceFormat =
  | 'prefix-year-seq'
  | 'prefix-slash-year-seq'
  | 'prefix-year-month-seq'
  | 'year-seq'
  | 'prefix-seq'
  | 'custom';

export interface CustomInvoiceRefsStore {
  patients: Record<string, string>;
  billings: Record<string, string>;
}

export interface DocumentHeaderConfig {
  showHeader: boolean;
  headerBlankSpaceMm: number;
  clinicName: string;
  clinicSubtitle: string;
  practitionerLine: string;
  address: string;
  phone: string;
  email: string;
  iceOrInpe: string;
  logoDataUrl: string;
  showLogo: boolean;
  headerStyle: HeaderLayoutStyle;
}

export interface DocumentLayoutConfig {
  pageFormat: PageFormat;
  accentColor: string;
  tableTheme: TableVisualTheme;
  orientation: PageOrientation;
  marginSize: MarginPreset;
  fontFamily: PdfFontFamily;
}

export interface InvoiceTemplateConfig {
  documentTitle: string;
  receiptTitle: string;
  showReference: boolean;
  referencePrefix: string;
  referenceFormat: InvoiceReferenceFormat;
  customReferencePattern: string;
  nextSequenceNumber: number;
  sequencePadding: number;
  defaultActLabel: string;
  showSessionDetails: boolean;
  showUnpaidBalance: boolean;
  showPatientMeta: boolean;
  paymentNote: string;
}

export interface CareCalendarTemplateConfig {
  documentTitle: string;
  subtitle: string;
  includePlannedSessions: boolean;
  showSignatureColumn: boolean;
  showTreatmentSummary: boolean;
  defaultSessionLabel: string;
}

export interface DocumentFooterConfig {
  showFooter: boolean;
  footerBlankSpaceMm: number;
  showSignatureBox: boolean;
  signatureLabel: string;
  showPatientSignatureBox: boolean;
  patientSignatureLabel: string;
  footerLine1: string;
  footerLine2: string;
  showPageNumbers: boolean;
}

export interface DocumentTemplatesConfig {
  header: DocumentHeaderConfig;
  layout: DocumentLayoutConfig;
  invoice: InvoiceTemplateConfig;
  calendar: CareCalendarTemplateConfig;
  footer: DocumentFooterConfig;
}

export const DEFAULT_DOCUMENT_TEMPLATES: DocumentTemplatesConfig = {
  header: {
    showHeader: true,
    headerBlankSpaceMm: 25,
    clinicName: 'Re Forme Center',
    clinicSubtitle: 'Centre de Kinésithérapie, Rééducation & Sport',
    practitionerLine: 'Mr HADDAOUI Younes — Kinésithérapeute D.E.',
    address: 'Agadir, Maroc',
    phone: '',
    email: 'contact@reforme.center',
    iceOrInpe: '',
    logoDataUrl: '',
    showLogo: true,
    headerStyle: 'split',
  },
  layout: {
    pageFormat: 'a5',
    accentColor: '#0d9488',
    tableTheme: 'grid',
    orientation: 'portrait',
    marginSize: 'normal',
    fontFamily: 'helvetica',
  },
  invoice: {
    documentTitle: "FACTURE D'HONORAIRES",
    receiptTitle: 'REÇU DE PAIEMENT',
    showReference: true,
    referencePrefix: 'FAC',
    referenceFormat: 'prefix-year-seq',
    customReferencePattern: '{PREFIX}-{ANNEE}-{NUM}',
    nextSequenceNumber: 1,
    sequencePadding: 4,
    defaultActLabel: 'Séance de kinésithérapie et rééducation',
    showSessionDetails: true,
    showUnpaidBalance: true,
    showPatientMeta: true,
    paymentNote: 'Arrêtée la présente facture à la somme indiquée ci-dessus.',
  },
  calendar: {
    documentTitle: 'CALENDRIER DE SOINS',
    subtitle: 'Suivi des séances de kinésithérapie et rééducation fonctionnelle',
    includePlannedSessions: false,
    showSignatureColumn: true,
    showTreatmentSummary: true,
    defaultSessionLabel: 'Séance de rééducation',
  },
  footer: {
    showFooter: true,
    footerBlankSpaceMm: 18,
    showSignatureBox: true,
    signatureLabel: 'Cachet et Signature du Praticien',
    showPatientSignatureBox: false,
    patientSignatureLabel: 'Signature du Patient',
    footerLine1: 'Re Forme Center — Centre de Kinésithérapie & Rééducation',
    footerLine2: 'Document délivré pour servir et valoir ce que de droit (Mutuelle / Assurance).',
    showPageNumbers: true,
  },
};

export function mergeWithDefaults(partial?: Partial<DocumentTemplatesConfig> | null): DocumentTemplatesConfig {
  if (!partial || typeof partial !== 'object') {
    return structuredCloneConfig(DEFAULT_DOCUMENT_TEMPLATES);
  }
  const rawCal: any = partial.calendar || {};
  const rawLayout: any = partial.layout || {};
  const resolvedPageFormat: PageFormat =
    rawLayout.pageFormat === 'a4' || rawLayout.pageFormat === 'a5'
      ? rawLayout.pageFormat
      : 'a5';

  return {
    header: { ...DEFAULT_DOCUMENT_TEMPLATES.header, ...(partial.header || {}) },
    layout: {
      ...DEFAULT_DOCUMENT_TEMPLATES.layout,
      ...rawLayout,
      pageFormat: resolvedPageFormat,
    },
    invoice: { ...DEFAULT_DOCUMENT_TEMPLATES.invoice, ...(partial.invoice || {}) },
    calendar: {
      documentTitle: rawCal.documentTitle ?? DEFAULT_DOCUMENT_TEMPLATES.calendar.documentTitle,
      subtitle: rawCal.subtitle ?? DEFAULT_DOCUMENT_TEMPLATES.calendar.subtitle,
      includePlannedSessions:
        rawCal.includePlannedSessions ?? DEFAULT_DOCUMENT_TEMPLATES.calendar.includePlannedSessions,
      showSignatureColumn:
        rawCal.showSignatureColumn ?? DEFAULT_DOCUMENT_TEMPLATES.calendar.showSignatureColumn,
      showTreatmentSummary:
        rawCal.showTreatmentSummary ?? DEFAULT_DOCUMENT_TEMPLATES.calendar.showTreatmentSummary,
      defaultSessionLabel:
        rawCal.defaultSessionLabel ?? DEFAULT_DOCUMENT_TEMPLATES.calendar.defaultSessionLabel,
    },
    footer: { ...DEFAULT_DOCUMENT_TEMPLATES.footer, ...(partial.footer || {}) },
  };
}

function structuredCloneConfig(cfg: DocumentTemplatesConfig): DocumentTemplatesConfig {
  return JSON.parse(JSON.stringify(cfg));
}

export function getCachedDocumentTemplates(): DocumentTemplatesConfig {
  try {
    const raw = localStorage.getItem(LOCAL_STORAGE_KEY);
    if (raw) {
      return mergeWithDefaults(JSON.parse(raw));
    }
  } catch {
    // Ignore storage read errors
  }
  return structuredCloneConfig(DEFAULT_DOCUMENT_TEMPLATES);
}

export async function fetchDocumentTemplates(
  supabaseClient: SupabaseClient
): Promise<DocumentTemplatesConfig> {
  try {
    const { data: admins, error } = await supabaseClient
      .from('profiles')
      .select('permissions, created_at')
      .eq('role', 'admin')
      .order('created_at', { ascending: true });

    if (!error && admins) {
      for (const admin of admins) {
        const rawArr: string[] = Array.isArray(admin?.permissions) ? admin.permissions : [];
        const found = rawArr.find(
          (item) => typeof item === 'string' && item.startsWith(DOC_TEMPLATE_PREFIX)
        );
        if (found) {
          const parsed = JSON.parse(found.slice(DOC_TEMPLATE_PREFIX.length));
          const merged = mergeWithDefaults(parsed);
          try {
            localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(merged));
          } catch {
            // Ignore local cache quota
          }
          return merged;
        }
      }
    }
  } catch (err) {
    console.warn('Could not load document templates from Supabase, using local cache:', err);
  }

  return getCachedDocumentTemplates();
}

export async function saveDocumentTemplates(
  supabaseClient: SupabaseClient,
  config: DocumentTemplatesConfig
): Promise<DocumentTemplatesConfig> {
  const cleanConfig = mergeWithDefaults(config);

  try {
    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(cleanConfig));
  } catch {
    // Ignore local storage errors
  }

  const { data: admins, error } = await supabaseClient
    .from('profiles')
    .select('*')
    .eq('role', 'admin')
    .order('created_at', { ascending: true });

  if (error) throw error;
  if (!admins || admins.length === 0) {
    throw new Error('Aucun profil administrateur trouvé pour sauvegarder le modèle.');
  }

  const serializedTag = `${DOC_TEMPLATE_PREFIX}${JSON.stringify(cleanConfig)}`;

  // Store on primary admin and strip stale copies on any secondary admin profiles
  for (let i = 0; i < admins.length; i++) {
    const admin = admins[i];
    const rawArr: string[] = Array.isArray(admin?.permissions) ? admin.permissions : [];
    const withoutOld = rawArr.filter(
      (item) => !(typeof item === 'string' && item.startsWith(DOC_TEMPLATE_PREFIX))
    );
    const updated = i === 0 ? [...withoutOld, serializedTag] : withoutOld;

    if (i === 0 || withoutOld.length !== rawArr.length) {
      const { error: updErr } = await supabaseClient
        .from('profiles')
        .update({ permissions: updated })
        .eq('id', admin.id);
      if (updErr) throw updErr;
    }
  }

  return cleanConfig;
}

/**
 * Formats an invoice reference string using the configured template rules
 * (prefix, format preset or custom token pattern, sequence number, and zero-padding).
 */
export function formatInvoiceReference(
  config: DocumentTemplatesConfig,
  options?: { sequenceNumber?: number; date?: Date }
): string {
  const inv = config?.invoice || DEFAULT_DOCUMENT_TEMPLATES.invoice;
  const dt = options?.date && !isNaN(options.date.getTime()) ? options.date : new Date();
  const yearFull = String(dt.getFullYear());
  const yearShort = yearFull.slice(-2);
  const month = String(dt.getMonth() + 1).padStart(2, '0');
  const day = String(dt.getDate()).padStart(2, '0');

  const rawSeq =
    options?.sequenceNumber !== undefined
      ? Math.max(1, Math.floor(Number(options.sequenceNumber) || 1))
      : Math.max(1, Math.floor(Number(inv.nextSequenceNumber) || 1));
  const padLen = Math.min(8, Math.max(1, Math.floor(Number(inv.sequencePadding) || 4)));
  const paddedSeq = String(rawSeq).padStart(padLen, '0');
  const prefix = (inv.referencePrefix ?? 'FAC').trim();
  const fmt: InvoiceReferenceFormat = inv.referenceFormat || 'prefix-year-seq';

  switch (fmt) {
    case 'prefix-slash-year-seq':
      return prefix ? `${prefix}/${yearFull}/${paddedSeq}` : `${yearFull}/${paddedSeq}`;
    case 'prefix-year-month-seq':
      return prefix
        ? `${prefix}-${yearFull}-${month}-${paddedSeq}`
        : `${yearFull}-${month}-${paddedSeq}`;
    case 'year-seq':
      return `${yearFull}-${paddedSeq}`;
    case 'prefix-seq':
      return prefix ? `${prefix}-${paddedSeq}` : paddedSeq;
    case 'custom': {
      const pattern = (inv.customReferencePattern || '{PREFIX}-{ANNEE}-{NUM}').trim();
      if (!pattern) return prefix ? `${prefix}-${yearFull}-${paddedSeq}` : `${yearFull}-${paddedSeq}`;
      return pattern
        .replace(/\{PREFIX\}/gi, prefix)
        .replace(/\{ANNEE\}|\{YYYY\}/gi, yearFull)
        .replace(/\{AA\}|\{YY\}/gi, yearShort)
        .replace(/\{MOIS\}|\{MM\}/gi, month)
        .replace(/\{JOUR\}|\{DD\}/gi, day)
        .replace(/\{NUM\}|\{SEQ\}/gi, paddedSeq);
    }
    case 'prefix-year-seq':
    default:
      return prefix ? `${prefix}-${yearFull}-${paddedSeq}` : `${yearFull}-${paddedSeq}`;
  }
}

/**
 * Generates a deterministic default reference for an individual billing row
 * using the configured prefix and billing date, when no custom override is stored.
 */
export function getDefaultBillingReference(bill: any, config: DocumentTemplatesConfig): string {
  const dt = getBillDate(bill);
  const yearFull = String(dt.getFullYear());
  const month = String(dt.getMonth() + 1).padStart(2, '0');
  const shortCode = String(bill?.id || '0001')
    .replace(/[^a-zA-Z0-9]/g, '')
    .slice(0, 4)
    .toUpperCase();
  const inv = config?.invoice || DEFAULT_DOCUMENT_TEMPLATES.invoice;
  const prefix = (inv.referencePrefix ?? 'FAC').trim();
  const fmt = inv.referenceFormat || 'prefix-year-seq';

  if (fmt === 'prefix-slash-year-seq') {
    return prefix ? `${prefix}/${yearFull}/${shortCode}` : `${yearFull}/${shortCode}`;
  }
  if (fmt === 'prefix-year-month-seq') {
    return prefix ? `${prefix}-${yearFull}-${month}-${shortCode}` : `${yearFull}-${month}-${shortCode}`;
  }
  if (fmt === 'year-seq') {
    return `${yearFull}-${shortCode}`;
  }
  if (fmt === 'prefix-seq') {
    return prefix ? `${prefix}-${shortCode}` : shortCode;
  }
  return prefix ? `${prefix}-${yearFull}-${shortCode}` : `${yearFull}-${shortCode}`;
}

export function getBillingDisplayReference(
  bill: any,
  config: DocumentTemplatesConfig,
  customRefs?: CustomInvoiceRefsStore | null
): string {
  const custom = bill?.id && customRefs?.billings?.[bill.id]?.trim();
  if (custom) return custom;
  return getDefaultBillingReference(bill, config);
}

function normalizeCustomRefs(raw: any): CustomInvoiceRefsStore {
  return {
    patients: raw?.patients && typeof raw.patients === 'object' ? { ...raw.patients } : {},
    billings: raw?.billings && typeof raw.billings === 'object' ? { ...raw.billings } : {},
  };
}

export function getCachedCustomInvoiceRefs(): CustomInvoiceRefsStore {
  try {
    const raw = localStorage.getItem(CUSTOM_INV_REFS_KEY);
    if (raw) {
      return normalizeCustomRefs(JSON.parse(raw));
    }
  } catch {
    // Ignore storage read errors
  }
  return { patients: {}, billings: {} };
}

export async function fetchCustomInvoiceRefs(
  supabaseClient: SupabaseClient
): Promise<CustomInvoiceRefsStore> {
  const local = getCachedCustomInvoiceRefs();
  try {
    const { data: admins, error } = await supabaseClient
      .from('profiles')
      .select('permissions, created_at')
      .eq('role', 'admin')
      .order('created_at', { ascending: true });

    if (!error && admins) {
      for (const admin of admins) {
        const rawArr: string[] = Array.isArray(admin?.permissions) ? admin.permissions : [];
        const found = rawArr.find(
          (item) => typeof item === 'string' && item.startsWith(INV_REFS_PREFIX)
        );
        if (found) {
          const parsed = normalizeCustomRefs(JSON.parse(found.slice(INV_REFS_PREFIX.length)));
          const merged: CustomInvoiceRefsStore = {
            patients: { ...parsed.patients, ...local.patients },
            billings: { ...parsed.billings, ...local.billings },
          };
          // Cloud takes precedence if non-empty, while keeping any unsynced local keys
          const resolved: CustomInvoiceRefsStore = {
            patients: { ...merged.patients, ...parsed.patients },
            billings: { ...merged.billings, ...parsed.billings },
          };
          try {
            localStorage.setItem(CUSTOM_INV_REFS_KEY, JSON.stringify(resolved));
          } catch {
            // Ignore quota
          }
          return resolved;
        }
      }
    }
  } catch (err) {
    console.warn('Could not load custom invoice refs from Supabase, using local cache:', err);
  }
  return local;
}

export async function saveCustomInvoiceRefs(
  supabaseClient: SupabaseClient,
  store: CustomInvoiceRefsStore
): Promise<CustomInvoiceRefsStore> {
  const clean = normalizeCustomRefs(store);
  try {
    localStorage.setItem(CUSTOM_INV_REFS_KEY, JSON.stringify(clean));
  } catch {
    // Ignore storage errors
  }

  try {
    const { data: admins, error } = await supabaseClient
      .from('profiles')
      .select('*')
      .eq('role', 'admin')
      .order('created_at', { ascending: true });

    if (!error && admins && admins.length > 0) {
      const serializedTag = `${INV_REFS_PREFIX}${JSON.stringify(clean)}`;
      for (let i = 0; i < admins.length; i++) {
        const admin = admins[i];
        const rawArr: string[] = Array.isArray(admin?.permissions) ? admin.permissions : [];
        const withoutOld = rawArr.filter(
          (item) => !(typeof item === 'string' && item.startsWith(INV_REFS_PREFIX))
        );
        const updated = i === 0 ? [...withoutOld, serializedTag] : withoutOld;
        if (i === 0 || withoutOld.length !== rawArr.length) {
          await supabaseClient.from('profiles').update({ permissions: updated }).eq('id', admin.id);
        }
      }
    }
  } catch (err) {
    console.warn('Saved custom invoice refs locally (cloud sync skipped):', err);
  }

  return clean;
}

export async function savePatientCustomInvoiceRef(
  supabaseClient: SupabaseClient,
  patientId: string,
  ref: string
): Promise<CustomInvoiceRefsStore> {
  const current = await fetchCustomInvoiceRefs(supabaseClient);
  const nextPatients = { ...current.patients };
  const trimmed = (ref || '').trim();
  if (trimmed) {
    nextPatients[patientId] = trimmed;
  } else {
    delete nextPatients[patientId];
  }
  return saveCustomInvoiceRefs(supabaseClient, {
    ...current,
    patients: nextPatients,
  });
}

export async function saveBillingCustomInvoiceRef(
  supabaseClient: SupabaseClient,
  billingId: string,
  ref: string
): Promise<CustomInvoiceRefsStore> {
  const current = await fetchCustomInvoiceRefs(supabaseClient);
  const nextBillings = { ...current.billings };
  const trimmed = (ref || '').trim();
  if (trimmed) {
    nextBillings[billingId] = trimmed;
  } else {
    delete nextBillings[billingId];
  }
  return saveCustomInvoiceRefs(supabaseClient, {
    ...current,
    billings: nextBillings,
  });
}

export async function incrementInvoiceSequence(
  supabaseClient: SupabaseClient,
  currentConfig: DocumentTemplatesConfig,
  dateForRef?: Date
): Promise<{ nextConfig: DocumentTemplatesConfig; formattedRef: string }> {
  const currentSeq = Math.max(1, Math.floor(Number(currentConfig.invoice.nextSequenceNumber) || 1));
  const nextSeq = currentSeq + 1;
  const updatedConfig: DocumentTemplatesConfig = {
    ...currentConfig,
    invoice: {
      ...currentConfig.invoice,
      nextSequenceNumber: nextSeq,
    },
  };

  let persisted = updatedConfig;
  try {
    persisted = await saveDocumentTemplates(supabaseClient, updatedConfig);
  } catch {
    try {
      localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(updatedConfig));
    } catch {
      // Ignore storage error
    }
  }

  return {
    nextConfig: persisted,
    formattedRef: formatInvoiceReference(persisted, { sequenceNumber: nextSeq, date: dateForRef }),
  };
}

/**
 * Compresses an uploaded image file to a lightweight Data URL (~240x110 max)
 * so it stores cleanly in Supabase and renders sharply inside PDFs.
 */
export function resizeLogoToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Impossible de lire le fichier image.'));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('Format image invalide.'));
      img.onload = () => {
        const maxW = 240;
        const maxH = 110;
        let width = img.width;
        let height = img.height;
        if (width > maxW || height > maxH) {
          const ratio = Math.min(maxW / width, maxH / height);
          width = Math.max(1, Math.round(width * ratio));
          height = Math.max(1, Math.round(height * ratio));
        }
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve(reader.result as string);
          return;
        }
        ctx.clearRect(0, 0, width, height);
        ctx.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL('image/png', 0.9));
      };
      img.src = reader.result as string;
    };
    reader.readAsDataURL(file);
  });
}

// ============================================================================
// PDF & EXCEL RENDERING HELPERS
// ============================================================================

export function hexToRgb(hex: string): [number, number, number] {
  if (isColorlessAccent(hex)) {
    return [15, 23, 42];
  }
  const clean = (hex || '#0d9488').replace('#', '').trim();
  if (clean.length === 3) {
    const r = parseInt(clean[0] + clean[0], 16);
    const g = parseInt(clean[1] + clean[1], 16);
    const b = parseInt(clean[2] + clean[2], 16);
    return [r || 13, g || 148, b || 136];
  }
  const r = parseInt(clean.substring(0, 2), 16);
  const g = parseInt(clean.substring(2, 4), 16);
  const b = parseInt(clean.substring(4, 6), 16);
  return [
    Number.isFinite(r) ? r : 13,
    Number.isFinite(g) ? g : 148,
    Number.isFinite(b) ? b : 136,
  ];
}

function isA5Format(config: DocumentTemplatesConfig): boolean {
  return (config.layout.pageFormat || 'a5') === 'a5';
}

function getMarginMm(preset: MarginPreset, pageFormat: PageFormat = 'a5'): number {
  if (pageFormat === 'a5') {
    if (preset === 'compact') return 8;
    if (preset === 'large') return 14;
    return 10;
  }
  if (preset === 'compact') return 12;
  if (preset === 'large') return 22;
  return 16;
}

function getTopReservedMm(config: DocumentTemplatesConfig): number {
  const isA5 = isA5Format(config);
  const baseMargin = getMarginMm(config.layout.marginSize, config.layout.pageFormat);
  if (config.header.showHeader === false) {
    return Math.max(baseMargin, Number(config.header.headerBlankSpaceMm) || (isA5 ? 25 : 35));
  }
  return baseMargin;
}

function getBottomReservedMm(config: DocumentTemplatesConfig): number {
  const isA5 = isA5Format(config);
  const baseMargin = getMarginMm(config.layout.marginSize, config.layout.pageFormat);
  if (config.footer.showFooter === false) {
    return Math.max(baseMargin, Number(config.footer.footerBlankSpaceMm) || (isA5 ? 18 : 25));
  }
  return isA5 ? 14 : 20;
}

function renderPdfHeader(
  doc: jsPDF,
  config: DocumentTemplatesConfig,
  docTitle: string,
  docSubMetaLines: string[]
): number {
  const pageWidth = doc.internal.pageSize.getWidth();
  const isA5 = isA5Format(config);
  const margin = getMarginMm(config.layout.marginSize, config.layout.pageFormat);
  const colorless = isColorlessAccent(config.layout.accentColor);
  const accent = hexToRgb(config.layout.accentColor);
  const font = config.layout.fontFamily || 'helvetica';
  const h = config.header;

  // Pre-printed stationery mode: leave blank top space and print only document title & reference
  if (h.showHeader === false) {
    const startY = getTopReservedMm(config);
    if (h.headerStyle === 'centered') {
      const centerX = pageWidth / 2;
      let curY = startY + (isA5 ? 3 : 4);
      doc.setFont(font, 'bold');
      doc.setFontSize(isA5 ? 11.5 : 14);
      doc.setTextColor(15, 23, 42);
      doc.text(docTitle, centerX, curY, { align: 'center' });
      curY += isA5 ? 4.2 : 5;

      if (docSubMetaLines.length > 0) {
        doc.setFont(font, 'normal');
        doc.setFontSize(isA5 ? 7.8 : 9);
        doc.setTextColor(100, 116, 139);
        doc.text(docSubMetaLines.join('   |   '), centerX, curY, { align: 'center' });
        curY += isA5 ? 4 : 5;
      }
      return curY + (isA5 ? 1.5 : 2);
    }

    const titleY = startY + (isA5 ? 3 : 4);
    doc.setFont(font, 'bold');
    doc.setFontSize(isA5 ? 11.5 : 14);
    doc.setTextColor(15, 23, 42);
    doc.text(docTitle, margin, titleY);

    let metaY = titleY;
    doc.setFont(font, 'normal');
    doc.setFontSize(isA5 ? 7.8 : 9);
    doc.setTextColor(100, 116, 139);
    for (const line of docSubMetaLines) {
      doc.text(line, pageWidth - margin, metaY, { align: 'right' });
      metaY += isA5 ? 3.8 : 4.5;
    }

    const dividerY = Math.max(titleY + (isA5 ? 3 : 4), metaY) + 1.2;
    doc.setDrawColor(colorless ? 148 : 226, colorless ? 163 : 232, colorless ? 184 : 240);
    doc.setLineWidth(0.35);
    doc.line(margin, dividerY, pageWidth - margin, dividerY);

    return dividerY + (isA5 ? 4 : 6);
  }

  const contactParts = [
    h.address?.trim(),
    h.phone?.trim() ? `Tél : ${h.phone.trim()}` : '',
    h.email?.trim(),
    h.iceOrInpe?.trim(),
  ].filter(Boolean);

  const hasLogo = Boolean(h.showLogo && h.logoDataUrl && h.logoDataUrl.startsWith('data:image'));

  if (h.headerStyle === 'banner') {
    const bannerHeight = isA5 ? 28 : 36;
    if (!colorless) {
      doc.setFillColor(accent[0], accent[1], accent[2]);
      doc.rect(0, 0, pageWidth, bannerHeight, 'F');
    }

    let textLeft = margin;
    if (hasLogo) {
      const logoSize = isA5 ? 15 : 22;
      try {
        doc.addImage(h.logoDataUrl, 'PNG', margin, isA5 ? 5 : 6, logoSize, logoSize);
        textLeft = margin + logoSize + (isA5 ? 3 : 4);
      } catch {
        // Fallback cleanly if image encoding fails
      }
    }

    doc.setFont(font, 'bold');
    doc.setFontSize(isA5 ? 12.5 : 16);
    if (colorless) {
      doc.setTextColor(15, 23, 42);
    } else {
      doc.setTextColor(255, 255, 255);
    }
    doc.text(h.clinicName || 'Re Forme Center', textLeft, isA5 ? 10.5 : 13);

    let leftY = isA5 ? 15 : 19;
    if (h.clinicSubtitle) {
      doc.setFont(font, 'normal');
      doc.setFontSize(isA5 ? 7.6 : 9.5);
      if (colorless) {
        doc.setTextColor(71, 85, 105);
      } else {
        doc.setTextColor(240, 253, 250);
      }
      doc.text(h.clinicSubtitle, textLeft, leftY);
      leftY += isA5 ? 3.8 : 5;
    }
    if (h.practitionerLine) {
      doc.setFont(font, colorless ? 'bold' : 'normal');
      doc.setFontSize(isA5 ? 7 : 8.5);
      if (colorless) {
        doc.setTextColor(51, 65, 85);
      }
      doc.text(h.practitionerLine, textLeft, leftY);
      leftY += isA5 ? 3.6 : 4.5;
    }
    if (contactParts.length > 0) {
      doc.setFont(font, 'normal');
      doc.setFontSize(isA5 ? 6.6 : 8);
      if (colorless) {
        doc.setTextColor(100, 116, 139);
      }
      doc.text(contactParts.join('  •  '), textLeft, Math.min(leftY, bannerHeight - 3.5));
    }

    doc.setFont(font, 'bold');
    doc.setFontSize(isA5 ? 10 : 13);
    if (colorless) {
      doc.setTextColor(15, 23, 42);
    } else {
      doc.setTextColor(255, 255, 255);
    }
    doc.text(docTitle, pageWidth - margin, isA5 ? 11 : 14, { align: 'right' });

    doc.setFont(font, 'normal');
    doc.setFontSize(isA5 ? 7.4 : 8.5);
    if (colorless) {
      doc.setTextColor(100, 116, 139);
    }
    let metaY = isA5 ? 15.8 : 20;
    for (const line of docSubMetaLines) {
      doc.text(line, pageWidth - margin, metaY, { align: 'right' });
      metaY += isA5 ? 3.6 : 4.5;
    }

    if (colorless) {
      doc.setDrawColor(15, 23, 42);
      doc.setLineWidth(0.4);
      doc.line(margin, bannerHeight - 1, pageWidth - margin, bannerHeight - 1);
    }

    return bannerHeight + (isA5 ? 5 : 8);
  }

  if (h.headerStyle === 'centered') {
    let curY = margin;
    const centerX = pageWidth / 2;

    if (hasLogo) {
      const logoSize = isA5 ? 16 : 22;
      try {
        doc.addImage(h.logoDataUrl, 'PNG', centerX - logoSize / 2, curY - 2, logoSize, logoSize);
        curY += logoSize + 2;
      } catch {
        // Ignore logo error
      }
    }

    doc.setFont(font, 'bold');
    doc.setFontSize(isA5 ? 13 : 17);
    doc.setTextColor(accent[0], accent[1], accent[2]);
    doc.text(h.clinicName || 'Re Forme Center', centerX, curY, { align: 'center' });
    curY += isA5 ? 4.3 : 5.5;

    if (h.clinicSubtitle) {
      doc.setFont(font, 'normal');
      doc.setFontSize(isA5 ? 8 : 10);
      doc.setTextColor(71, 85, 105);
      doc.text(h.clinicSubtitle, centerX, curY, { align: 'center' });
      curY += isA5 ? 3.8 : 5;
    }
    if (h.practitionerLine) {
      doc.setFont(font, 'bold');
      doc.setFontSize(isA5 ? 7.4 : 9);
      doc.setTextColor(51, 65, 85);
      doc.text(h.practitionerLine, centerX, curY, { align: 'center' });
      curY += isA5 ? 3.6 : 4.5;
    }
    if (contactParts.length > 0) {
      doc.setFont(font, 'normal');
      doc.setFontSize(isA5 ? 6.8 : 8.5);
      doc.setTextColor(100, 116, 139);
      doc.text(contactParts.join('  •  '), centerX, curY, { align: 'center' });
      curY += isA5 ? 3.8 : 5;
    }

    doc.setDrawColor(accent[0], accent[1], accent[2]);
    doc.setLineWidth(colorless ? 0.4 : 0.5);
    doc.line(margin, curY, pageWidth - margin, curY);
    curY += isA5 ? 5 : 7;

    doc.setFont(font, 'bold');
    doc.setFontSize(isA5 ? 11.5 : 14);
    doc.setTextColor(15, 23, 42);
    doc.text(docTitle, centerX, curY, { align: 'center' });
    curY += isA5 ? 4 : 5;

    if (docSubMetaLines.length > 0) {
      doc.setFont(font, 'normal');
      doc.setFontSize(isA5 ? 7.8 : 9);
      doc.setTextColor(100, 116, 139);
      doc.text(docSubMetaLines.join('   |   '), centerX, curY, { align: 'center' });
      curY += isA5 ? 4.2 : 6;
    }

    return curY + (isA5 ? 1.5 : 2);
  }

  // Default: 'split' (Clinic on left, Document title & ref on right)
  let leftX = margin;
  const topY = margin;

  if (hasLogo) {
    const logoSize = isA5 ? 15 : 20;
    try {
      doc.addImage(h.logoDataUrl, 'PNG', margin, topY - 2, logoSize, logoSize);
      leftX = margin + logoSize + (isA5 ? 3 : 4);
    } catch {
      // Ignore logo error
    }
  }

  let curLeftY = topY + (isA5 ? 2.5 : 3);
  doc.setFont(font, 'bold');
  doc.setFontSize(isA5 ? 12.5 : 16);
  doc.setTextColor(accent[0], accent[1], accent[2]);
  doc.text(h.clinicName || 'Re Forme Center', leftX, curLeftY);
  curLeftY += isA5 ? 4.2 : 5.5;

  if (h.clinicSubtitle) {
    doc.setFont(font, 'normal');
    doc.setFontSize(isA5 ? 7.8 : 9.5);
    doc.setTextColor(71, 85, 105);
    doc.text(h.clinicSubtitle, leftX, curLeftY);
    curLeftY += isA5 ? 3.6 : 4.5;
  }
  if (h.practitionerLine) {
    doc.setFont(font, 'bold');
    doc.setFontSize(isA5 ? 7.2 : 8.5);
    doc.setTextColor(51, 65, 85);
    doc.text(h.practitionerLine, leftX, curLeftY);
    curLeftY += isA5 ? 3.5 : 4.5;
  }
  for (const part of contactParts) {
    doc.setFont(font, 'normal');
    doc.setFontSize(isA5 ? 6.8 : 8);
    doc.setTextColor(100, 116, 139);
    doc.text(part, leftX, curLeftY);
    curLeftY += isA5 ? 3.2 : 4;
  }

  let curRightY = topY + (isA5 ? 2.5 : 3);
  doc.setFont(font, 'bold');
  doc.setFontSize(isA5 ? 10.5 : 14);
  doc.setTextColor(15, 23, 42);
  doc.text(docTitle, pageWidth - margin, curRightY, { align: 'right' });
  curRightY += isA5 ? 4.5 : 6;

  doc.setFont(font, 'normal');
  doc.setFontSize(isA5 ? 7.6 : 9);
  doc.setTextColor(100, 116, 139);
  for (const line of docSubMetaLines) {
    doc.text(line, pageWidth - margin, curRightY, { align: 'right' });
    curRightY += isA5 ? 3.6 : 4.5;
  }

  const dividerY = Math.max(curLeftY, curRightY, topY + (isA5 ? 15 : 22)) + 1.5;
  doc.setDrawColor(accent[0], accent[1], accent[2]);
  doc.setLineWidth(colorless ? 0.4 : 0.6);
  doc.line(margin, dividerY, pageWidth - margin, dividerY);

  return dividerY + (isA5 ? 4.5 : 7);
}

function renderPatientCardPdf(
  doc: jsPDF,
  config: DocumentTemplatesConfig,
  patient: any,
  startY: number,
  extraRightLines: string[] = []
): number {
  const pageWidth = doc.internal.pageSize.getWidth();
  const isA5 = isA5Format(config);
  const margin = getMarginMm(config.layout.marginSize, config.layout.pageFormat);
  const colorless = isColorlessAccent(config.layout.accentColor);
  const font = config.layout.fontFamily || 'helvetica';
  const mutInfo = parsePatientMutuelle(patient);

  const leftLines: string[] = [
    `Patient : ${patient?.prenom || ''} ${patient?.nom || ''}`.trim(),
  ];
  if (patient?.telephone) leftLines.push(`Téléphone : ${patient.telephone}`);
  if (patient?.email) leftLines.push(`Email : ${patient.email}`);

  const rightLines = [...extraRightLines];
  if (config.invoice.showPatientMeta) {
    if (patient?.cin) rightLines.push(`CIN : ${patient.cin}`);
    if (mutInfo.isMutualiste) {
      rightLines.push(`Mutuelle : ${mutInfo.organisme || 'Oui'}`);
    }
    if (mutInfo.club) {
      rightLines.push(`Club conventionné : ${mutInfo.club}`);
    }
  }

  const lineStep = isA5 ? 4.1 : 5;
  const padV = isA5 ? 5 : 7;
  const padH = isA5 ? 3 : 4;
  const maxLines = Math.max(leftLines.length, rightLines.length, 1);
  const boxHeight = maxLines * lineStep + padV;

  if (colorless) {
    doc.setDrawColor(148, 163, 184);
    doc.setLineWidth(0.3);
    doc.roundedRect(margin, startY, pageWidth - margin * 2, boxHeight, 2, 2, 'S');
  } else {
    doc.setFillColor(248, 250, 252);
    doc.setDrawColor(226, 232, 240);
    doc.setLineWidth(0.3);
    doc.roundedRect(margin, startY, pageWidth - margin * 2, boxHeight, 2, 2, 'FD');
  }

  let ly = startY + (isA5 ? 4.4 : 5.5);
  leftLines.forEach((line, idx) => {
    doc.setFont(font, idx === 0 ? 'bold' : 'normal');
    doc.setFontSize(idx === 0 ? (isA5 ? 9 : 10.5) : isA5 ? 7.6 : 9);
    doc.setTextColor(idx === 0 ? 15 : 71, idx === 0 ? 23 : 85, idx === 0 ? 42 : 105);
    doc.text(line, margin + padH, ly);
    ly += lineStep;
  });

  let ry = startY + (isA5 ? 4.4 : 5.5);
  rightLines.forEach((line) => {
    doc.setFont(font, 'normal');
    doc.setFontSize(isA5 ? 7.6 : 9);
    doc.setTextColor(71, 85, 105);
    doc.text(line, pageWidth - margin - padH, ry, { align: 'right' });
    ry += lineStep;
  });

  return startY + boxHeight + (isA5 ? 4 : 6);
}

function renderSignatureAndFootersPdf(
  doc: jsPDF,
  config: DocumentTemplatesConfig,
  afterTableY: number,
  noteAboveSignatures?: string
) {
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const isA5 = isA5Format(config);
  const margin = getMarginMm(config.layout.marginSize, config.layout.pageFormat);
  const font = config.layout.fontFamily || 'helvetica';
  const f = config.footer;

  const topReserved = getTopReservedMm(config);
  const bottomReserved = getBottomReservedMm(config);
  const contentWidth = pageWidth - margin * 2;

  const wrappedNote: string[] =
    noteAboveSignatures && noteAboveSignatures.trim()
      ? doc.splitTextToSize(noteAboveSignatures.trim(), contentWidth)
      : [];
  const noteLineStep = isA5 ? 3.6 : 4.2;
  const noteBlockH = wrappedNote.length > 0 ? wrappedNote.length * noteLineStep + (isA5 ? 2.5 : 4) : 0;
  const sigBoxH = isA5 ? 18 : 24;

  let curY = afterTableY + (isA5 ? 4.5 : 6);
  const contentHeight =
    noteBlockH + (f.showSignatureBox || f.showPatientSignatureBox ? sigBoxH + 2 : 0);

  if (contentHeight > 0 && curY + contentHeight > pageHeight - bottomReserved) {
    doc.addPage();
    curY = topReserved + 2;
  }

  if (wrappedNote.length > 0) {
    doc.setFont(font, 'italic');
    doc.setFontSize(isA5 ? 7.6 : 9);
    doc.setTextColor(71, 85, 105);
    doc.text(wrappedNote, margin, curY);
    curY += noteBlockH + (isA5 ? 1.5 : 2);
  }

  if (f.showSignatureBox || f.showPatientSignatureBox) {
    const maxHalfW = (contentWidth - 6) / 2;
    const boxW = Math.min(isA5 ? 54 : 68, maxHalfW);

    if (f.showPatientSignatureBox) {
      doc.setDrawColor(203, 213, 225);
      doc.setLineWidth(0.3);
      doc.roundedRect(margin, curY, boxW, sigBoxH, 1.5, 1.5, 'S');
      doc.setFont(font, 'bold');
      doc.setFontSize(isA5 ? 7.2 : 8.5);
      doc.setTextColor(71, 85, 105);
      doc.text(
        f.patientSignatureLabel || 'Signature du Patient',
        margin + boxW / 2,
        curY + (isA5 ? 4.2 : 5),
        { align: 'center', maxWidth: boxW - 3 }
      );
    }

    if (f.showSignatureBox) {
      const rightX = pageWidth - margin - boxW;
      doc.setDrawColor(203, 213, 225);
      doc.setLineWidth(0.3);
      doc.roundedRect(rightX, curY, boxW, sigBoxH, 1.5, 1.5, 'S');
      doc.setFont(font, 'bold');
      doc.setFontSize(isA5 ? 7.2 : 8.5);
      doc.setTextColor(71, 85, 105);
      doc.text(
        f.signatureLabel || 'Cachet et Signature',
        rightX + boxW / 2,
        curY + (isA5 ? 4.2 : 5),
        { align: 'center', maxWidth: boxW - 3 }
      );
    }
  }

  // Draw bottom footer on every page only when footer is enabled
  if (f.showFooter !== false) {
    const totalPages = doc.getNumberOfPages();
    const footerOffset = isA5 ? 12 : 15;
    const footerMaxW = f.showPageNumbers
      ? contentWidth - (isA5 ? 28 : 34)
      : contentWidth;

    for (let p = 1; p <= totalPages; p++) {
      doc.setPage(p);
      const footerTop = pageHeight - footerOffset;
      doc.setDrawColor(226, 232, 240);
      doc.setLineWidth(0.3);
      doc.line(margin, footerTop, pageWidth - margin, footerTop);

      doc.setFont(font, 'normal');
      doc.setFontSize(isA5 ? 6.8 : 8);
      doc.setTextColor(100, 116, 139);

      if (f.footerLine1?.trim()) {
        doc.text(f.footerLine1.trim(), pageWidth / 2, footerTop + (isA5 ? 3.8 : 4.5), {
          align: 'center',
          maxWidth: footerMaxW,
        });
      }
      if (f.footerLine2?.trim()) {
        doc.text(f.footerLine2.trim(), pageWidth / 2, footerTop + (isA5 ? 7 : 8.5), {
          align: 'center',
          maxWidth: footerMaxW,
        });
      }
      if (f.showPageNumbers) {
        doc.text(`Page ${p} / ${totalPages}`, pageWidth - margin, footerTop + (isA5 ? 5.2 : 6.5), {
          align: 'right',
        });
      }
    }
  }
}

// ============================================================================
// PUBLIC DOCUMENT EXPORTERS
// ============================================================================

export function exportPatientInvoicePDF(
  config: DocumentTemplatesConfig,
  params: {
    patient: any;
    billings: any[];
    invoiceNumber?: string;
    invoiceDate?: string;
  }
) {
  const { patient, billings } = params;
  const pageFormat = config.layout.pageFormat || 'a5';
  const isA5 = pageFormat === 'a5';
  const doc = new jsPDF({
    orientation: config.layout.orientation,
    unit: 'mm',
    format: pageFormat,
  });

  const margin = getMarginMm(config.layout.marginSize, pageFormat);
  const pageWidth = doc.internal.pageSize.getWidth();
  const colorless = isColorlessAccent(config.layout.accentColor);
  const accent = hexToRgb(config.layout.accentColor);
  const font = config.layout.fontFamily || 'helvetica';

  const parsedDate = params.invoiceDate ? parseClinicDate(params.invoiceDate) : new Date();
  const validDate = !isNaN(parsedDate.getTime()) ? parsedDate : new Date();
  const ref = (params.invoiceNumber ?? '').trim() || formatInvoiceReference(config, { date: validDate });
  const dateStr = validDate.toLocaleDateString('fr-FR');

  const paidBills = billings.filter((b) => isPaidBillingStatus(b.statut));
  const unpaidBills = billings.filter((b) => isUnpaidBillingStatus(b.statut));
  const totalPaid = sumMoney(paidBills, (b) => b.montant);
  const totalUnpaid = sumMoney(unpaidBills, (b) => b.montant);
  const totalBilled = roundMoney(totalPaid + totalUnpaid);

  const headerMeta: string[] = [];
  if (config.invoice.showReference !== false && ref) {
    headerMeta.push(`Réf : ${ref}`);
  }
  headerMeta.push(`Date : ${dateStr}`);

  let curY = renderPdfHeader(
    doc,
    config,
    config.invoice.documentTitle || "FACTURE D'HONORAIRES",
    headerMeta
  );

  curY = renderPatientCardPdf(doc, config, patient, curY);

  const actLabel = config.invoice.defaultActLabel || 'Séance de kinésithérapie';
  let head: string[][] = [];
  let body: string[][] = [];

  if (config.invoice.showSessionDetails && billings.length > 0) {
    head = [['N°', 'Date', 'Désignation des actes', 'Mode', 'Statut', 'Montant']];
    const sorted = [...billings].sort(
      (a, b) => getBillDate(a).getTime() - getBillDate(b).getTime()
    );
    body = sorted.map((bill, idx) => {
      const linkedAppt = Array.isArray(bill.appointments)
        ? bill.appointments[0]
        : bill.appointments;
      const dStr = linkedAppt?.date_heure
        ? parseClinicDate(linkedAppt.date_heure).toLocaleDateString('fr-FR')
        : getBillDate(bill).toLocaleDateString('fr-FR');
      const statusLabel = isPaidBillingStatus(bill.statut) ? 'Réglé' : 'En attente';
      return [
        String(idx + 1),
        dStr,
        actLabel,
        bill.type_paiement || 'Direct',
        statusLabel,
        `${formatMoney(bill.montant)} DH`,
      ];
    });
  } else {
    head = [['Désignation des actes', 'Quantité', 'Statut', 'Total']];
    body = [
      [
        `${actLabel} (Réglées)`,
        String(paidBills.length),
        'Payé',
        `${formatMoney(totalPaid)} DH`,
      ],
    ];
    if (unpaidBills.length > 0 && config.invoice.showUnpaidBalance) {
      body.push([
        `${actLabel} (En attente)`,
        String(unpaidBills.length),
        'En attente',
        `${formatMoney(totalUnpaid)} DH`,
      ]);
    }
  }

  const pageHeight = doc.internal.pageSize.getHeight();
  const topReserved = getTopReservedMm(config);
  const bottomReserved = getBottomReservedMm(config);

  autoTable(doc, {
    startY: curY,
    margin: { left: margin, right: margin, top: topReserved, bottom: bottomReserved },
    head,
    body,
    theme: config.layout.tableTheme,
    styles: {
      font,
      fontSize: isA5 ? 7.8 : 9,
      cellPadding: isA5 ? 2 : 3,
      ...(colorless ? { textColor: [15, 23, 42], lineColor: [148, 163, 184] } : {}),
    },
    headStyles: colorless
      ? {
          fillColor: [255, 255, 255],
          textColor: [15, 23, 42],
          fontStyle: 'bold',
          lineColor: [15, 23, 42],
          lineWidth: 0.3,
        }
      : {
          fillColor: accent,
          textColor: [255, 255, 255],
          fontStyle: 'bold',
        },
    alternateRowStyles: colorless ? { fillColor: [255, 255, 255] } : undefined,
  });

  let afterTableY = (doc as any).lastAutoTable?.finalY || curY + 16;
  afterTableY += isA5 ? 3.5 : 5;

  // Totals summary box on right
  const summaryW = isA5 ? 62 : 78;
  const summaryX = pageWidth - margin - summaryW;
  const showUnpaidLine = config.invoice.showUnpaidBalance && totalUnpaid > 0;
  const summaryLines = showUnpaidLine ? 3 : 2;
  const sumStep = isA5 ? 5.2 : 6.5;
  const summaryH = summaryLines * sumStep + (isA5 ? 4 : 5);
  const sumPadX = isA5 ? 3 : 4;

  if (afterTableY + summaryH > pageHeight - bottomReserved) {
    doc.addPage();
    afterTableY = topReserved + 2;
  }

  if (colorless) {
    doc.setDrawColor(148, 163, 184);
    doc.setLineWidth(0.3);
    doc.roundedRect(summaryX, afterTableY, summaryW, summaryH, 1.5, 1.5, 'S');
  } else {
    doc.setFillColor(248, 250, 252);
    doc.setDrawColor(226, 232, 240);
    doc.roundedRect(summaryX, afterTableY, summaryW, summaryH, 1.5, 1.5, 'FD');
  }

  let sy = afterTableY + (isA5 ? 4.8 : 6);
  doc.setFont(font, 'normal');
  doc.setFontSize(isA5 ? 8.2 : 9.5);
  doc.setTextColor(71, 85, 105);
  doc.text('Total Facturé :', summaryX + sumPadX, sy);
  doc.setFont(font, 'bold');
  doc.setTextColor(15, 23, 42);
  doc.text(`${formatMoney(totalBilled)} DH`, summaryX + summaryW - sumPadX, sy, { align: 'right' });

  sy += sumStep;
  doc.setFont(font, 'normal');
  doc.setTextColor(71, 85, 105);
  doc.text('Total Réglé :', summaryX + sumPadX, sy);
  doc.setFont(font, 'bold');
  doc.setTextColor(accent[0], accent[1], accent[2]);
  doc.text(`${formatMoney(totalPaid)} DH`, summaryX + summaryW - sumPadX, sy, { align: 'right' });

  if (showUnpaidLine) {
    sy += sumStep;
    doc.setFont(font, 'normal');
    if (colorless) {
      doc.setTextColor(51, 65, 85);
    } else {
      doc.setTextColor(190, 18, 60);
    }
    doc.text('Reste à Payer :', summaryX + sumPadX, sy);
    doc.setFont(font, 'bold');
    if (colorless) {
      doc.setTextColor(15, 23, 42);
    }
    doc.text(`${formatMoney(totalUnpaid)} DH`, summaryX + summaryW - sumPadX, sy, { align: 'right' });
  }

  renderSignatureAndFootersPdf(
    doc,
    config,
    afterTableY + summaryH + 2,
    config.invoice.paymentNote
  );

  const safeNom = `${patient?.nom || 'Patient'}_${patient?.prenom || ''}`.replace(/\s+/g, '_');
  doc.save(`Facture_${safeNom}.pdf`);
}

export function exportPatientInvoiceExcel(
  config: DocumentTemplatesConfig,
  params: {
    patient: any;
    billings: any[];
    invoiceNumber?: string;
    invoiceDate?: string;
  }
) {
  const { patient, billings } = params;
  const parsedDate = params.invoiceDate ? parseClinicDate(params.invoiceDate) : new Date();
  const validDate = !isNaN(parsedDate.getTime()) ? parsedDate : new Date();
  const ref = (params.invoiceNumber ?? '').trim() || formatInvoiceReference(config, { date: validDate });
  const dateStr = validDate.toLocaleDateString('fr-FR');

  const paidBills = billings.filter((b) => isPaidBillingStatus(b.statut));
  const unpaidBills = billings.filter((b) => isUnpaidBillingStatus(b.statut));
  const totalPaid = sumMoney(paidBills, (b) => b.montant);
  const totalUnpaid = sumMoney(unpaidBills, (b) => b.montant);
  const totalBilled = roundMoney(totalPaid + totalUnpaid);
  const mutInfo = parsePatientMutuelle(patient);

  const h = config.header;
  const wsData: any[][] = [];
  if (h.showHeader !== false) {
    wsData.push([h.clinicName || 'Re Forme Center']);
    if (h.clinicSubtitle) wsData.push([h.clinicSubtitle]);
    if (h.practitionerLine) wsData.push([h.practitionerLine]);
    const contactLine = [h.address, h.phone ? `Tél: ${h.phone}` : '', h.email, h.iceOrInpe]
      .filter(Boolean)
      .join(' • ');
    if (contactLine) wsData.push([contactLine]);
    wsData.push([]);
  }

  wsData.push([config.invoice.documentTitle || "FACTURE D'HONORAIRES"]);
  if (config.invoice.showReference !== false && ref) {
    wsData.push(['Réf :', ref]);
  }
  wsData.push(
    ['Date :', dateStr],
    [],
    ['Facturé à :', `${patient?.prenom || ''} ${patient?.nom || ''}`.trim()],
    ['Téléphone :', patient?.telephone || 'Non renseigné'],
    ['Email :', patient?.email || 'Non renseigné']
  );

  if (config.invoice.showPatientMeta) {
    if (patient?.cin) wsData.push(['CIN :', patient.cin]);
    if (mutInfo.isMutualiste) wsData.push(['Mutuelle :', mutInfo.organisme || 'Oui']);
    if (mutInfo.club) wsData.push(['Club conventionné :', mutInfo.club]);
  }

  wsData.push([]);

  const actLabel = config.invoice.defaultActLabel || 'Séance de kinésithérapie';
  if (config.invoice.showSessionDetails && billings.length > 0) {
    wsData.push(['Date', 'Désignation', 'Mode de paiement', 'Statut', 'Montant (DH)']);
    const sorted = [...billings].sort(
      (a, b) => getBillDate(a).getTime() - getBillDate(b).getTime()
    );
    for (const bill of sorted) {
      const linkedAppt = Array.isArray(bill.appointments)
        ? bill.appointments[0]
        : bill.appointments;
      const dStr = linkedAppt?.date_heure
        ? parseClinicDate(linkedAppt.date_heure).toLocaleDateString('fr-FR')
        : getBillDate(bill).toLocaleDateString('fr-FR');
      wsData.push([
        dStr,
        actLabel,
        bill.type_paiement || 'Direct',
        isPaidBillingStatus(bill.statut) ? 'Payé' : 'En attente',
        roundMoney(bill.montant),
      ]);
    }
    wsData.push(
      [],
      ['', '', '', 'Total Facturé :', `${formatMoney(totalBilled)} DH`],
      ['', '', '', 'Total Réglé :', `${formatMoney(totalPaid)} DH`]
    );
    if (config.invoice.showUnpaidBalance && totalUnpaid > 0) {
      wsData.push(['', '', '', 'Reste à Payer :', `${formatMoney(totalUnpaid)} DH`]);
    }
  } else {
    wsData.push(['Désignation', 'Quantité', 'Statut', 'Total']);
    wsData.push([`${actLabel} (Réglées)`, paidBills.length, 'Payé', `${formatMoney(totalPaid)} DH`]);
    if (config.invoice.showUnpaidBalance && unpaidBills.length > 0) {
      wsData.push([
        `${actLabel} (En attente)`,
        unpaidBills.length,
        'En attente',
        `${formatMoney(totalUnpaid)} DH`,
      ]);
    }
    wsData.push(
      [],
      ['', '', 'Total Facturé :', `${formatMoney(totalBilled)} DH`],
      ['', '', 'Total Réglé :', `${formatMoney(totalPaid)} DH`]
    );
    if (config.invoice.showUnpaidBalance && totalUnpaid > 0) {
      wsData.push(['', '', 'Reste à Payer :', `${formatMoney(totalUnpaid)} DH`]);
    }
  }

  if (config.invoice.paymentNote) {
    wsData.push([], [config.invoice.paymentNote]);
  }
  if (config.footer.showFooter !== false) {
    if (config.footer.footerLine1) wsData.push([config.footer.footerLine1]);
    if (config.footer.footerLine2) wsData.push([config.footer.footerLine2]);
  }

  const ws = XLSX.utils.aoa_to_sheet(wsData);
  ws['!cols'] = [{ wch: 24 }, { wch: 36 }, { wch: 18 }, { wch: 18 }, { wch: 18 }];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Facture');
  const safeNom = `${patient?.nom || 'Patient'}_${patient?.prenom || ''}`.replace(/\s+/g, '_');
  XLSX.writeFile(wb, `Facture_${safeNom}.xlsx`);
}

export function exportCareCalendarPDF(
  config: DocumentTemplatesConfig,
  params: {
    patient: any;
    appointments: any[];
    treatments?: any[];
    therapists?: any[];
  }
) {
  const { patient, appointments, treatments = [] } = params;
  const pageFormat = config.layout.pageFormat || 'a5';
  const isA5 = pageFormat === 'a5';
  const doc = new jsPDF({
    orientation: config.layout.orientation,
    unit: 'mm',
    format: pageFormat,
  });

  const margin = getMarginMm(config.layout.marginSize, pageFormat);
  const colorless = isColorlessAccent(config.layout.accentColor);
  const accent = hexToRgb(config.layout.accentColor);
  const font = config.layout.fontFamily || 'helvetica';
  const cal = config.calendar;

  const subMeta: string[] = [`Édité le ${new Date().toLocaleDateString('fr-FR')}`];
  if (cal.subtitle?.trim()) {
    subMeta.unshift(cal.subtitle.trim());
  }

  let curY = renderPdfHeader(doc, config, cal.documentTitle || 'CALENDRIER DE SOINS', subMeta);

  const treatmentRightLines: string[] = [];
  if (cal.showTreatmentSummary) {
    const activeTr = treatments.find((t) => t.statut === 'En cours') || treatments[0];
    const prescribed = activeTr?.nombre_seances_prescrites || patient?.nombre_seances || 0;
    if (prescribed > 0) {
      treatmentRightLines.push(`Séances prescrites : ${prescribed}`);
    }
    if (activeTr?.motif || patient?.pathologie) {
      treatmentRightLines.push(`Motif : ${activeTr?.motif || patient?.pathologie}`);
    }
    if (activeTr?.medecin_prescripteur) {
      treatmentRightLines.push(`Prescripteur : ${activeTr.medecin_prescripteur}`);
    }
  }

  curY = renderPatientCardPdf(doc, config, patient, curY, treatmentRightLines);

  const filteredAppts = appointments
    .filter((a) => {
      if (a.statut === 'Annulé') return false;
      if (cal.includePlannedSessions) {
        return !a.notes_seance?.includes('[DEMANDE');
      }
      return a.statut === 'Effectué';
    })
    .sort((a, b) => parseClinicDate(a.date_heure).getTime() - parseClinicDate(b.date_heure).getTime());

  const headRow: string[] = ['N°', 'Date', 'Nature des soins'];
  if (cal.includePlannedSessions) headRow.push('Statut');
  if (cal.showSignatureColumn) headRow.push('Émargement / Cachet');

  const bodyRows = filteredAppts.map((app, index) => {
    const dt = parseClinicDate(app.date_heure);
    let cleanNote = app.notes_seance || '';
    if (cleanNote.includes('||TH_ID:')) {
      const m = cleanNote.match(/\|\|TH_ID:([a-f0-9-]+)\|\|(.*)/s);
      if (m) {
        cleanNote = m[2];
      }
    }

    const row: string[] = [
      String(index + 1),
      dt.toLocaleDateString('fr-FR'),
      cleanNote.trim() || cal.defaultSessionLabel || 'Séance de suivi',
    ];
    if (cal.includePlannedSessions) {
      row.push(app.statut === 'Effectué' ? 'Effectuée' : 'Programmée');
    }
    if (cal.showSignatureColumn) {
      row.push('');
    }
    return row;
  });

  autoTable(doc, {
    startY: curY,
    margin: {
      left: margin,
      right: margin,
      top: getTopReservedMm(config),
      bottom: getBottomReservedMm(config),
    },
    head: [headRow],
    body:
      bodyRows.length > 0
        ? bodyRows
        : [headRow.map((_, idx) => (idx === 0 ? '-' : idx === 1 ? 'Aucune séance' : ''))],
    theme: config.layout.tableTheme,
    styles: {
      font,
      fontSize: isA5 ? 7.8 : 9,
      cellPadding: isA5
        ? cal.showSignatureColumn
          ? 2.6
          : 2
        : cal.showSignatureColumn
          ? 3.8
          : 3,
      ...(colorless ? { textColor: [15, 23, 42], lineColor: [148, 163, 184] } : {}),
    },
    headStyles: colorless
      ? {
          fillColor: [255, 255, 255],
          textColor: [15, 23, 42],
          fontStyle: 'bold',
          lineColor: [15, 23, 42],
          lineWidth: 0.3,
        }
      : {
          fillColor: accent,
          textColor: [255, 255, 255],
          fontStyle: 'bold',
        },
    alternateRowStyles: colorless ? { fillColor: [255, 255, 255] } : undefined,
  });

  const afterTableY = (doc as any).lastAutoTable?.finalY || curY + 16;
  const completedTotal = appointments.filter((a) => a.statut === 'Effectué').length;
  renderSignatureAndFootersPdf(
    doc,
    config,
    afterTableY,
    `Total des séances effectuées à ce jour : ${completedTotal} séance(s).`
  );

  const safeNom = `${patient?.nom || 'Patient'}_${patient?.prenom || ''}`.replace(/\s+/g, '_');
  doc.save(`Calendrier_Soins_${safeNom}.pdf`);
}

export function exportPatientReceiptPDF(
  config: DocumentTemplatesConfig,
  params: {
    patient: any;
    billing: any;
    appointment?: any;
    receiptNumber?: string;
  }
) {
  const { patient, billing, appointment } = params;
  const pageFormat = config.layout.pageFormat || 'a5';
  const isA5 = pageFormat === 'a5';
  const doc = new jsPDF({
    orientation: config.layout.orientation,
    unit: 'mm',
    format: pageFormat,
  });

  const margin = getMarginMm(config.layout.marginSize, pageFormat);
  const colorless = isColorlessAccent(config.layout.accentColor);
  const accent = hexToRgb(config.layout.accentColor);
  const font = config.layout.fontFamily || 'helvetica';

  const receiptDate = getBillDate(billing).toLocaleDateString('fr-FR');
  const sessionDate = appointment?.date_heure
    ? parseClinicDate(appointment.date_heure).toLocaleDateString('fr-FR')
    : receiptDate;

  const customRefs = getCachedCustomInvoiceRefs();
  const resolvedRef =
    (params.receiptNumber ?? '').trim() ||
    getBillingDisplayReference(billing, config, customRefs);

  const receiptMeta: string[] = [];
  if (config.invoice.showReference !== false && resolvedRef) {
    receiptMeta.push(`Réf : ${resolvedRef}`);
  }
  receiptMeta.push(`Date : ${receiptDate}`);

  let curY = renderPdfHeader(
    doc,
    config,
    config.invoice.receiptTitle || 'REÇU DE PAIEMENT',
    receiptMeta
  );

  curY = renderPatientCardPdf(doc, config, patient, curY);

  autoTable(doc, {
    startY: curY,
    margin: {
      left: margin,
      right: margin,
      top: getTopReservedMm(config),
      bottom: getBottomReservedMm(config),
    },
    head: [['Date de la séance', 'Nature des soins', 'Mode de règlement', 'Montant Réglé']],
    body: [
      [
        sessionDate,
        appointment?.notes_seance || config.invoice.defaultActLabel || 'Soins de kinésithérapie',
        billing?.type_paiement || 'Direct',
        `${formatMoney(billing?.montant)} DH`,
      ],
    ],
    theme: config.layout.tableTheme,
    styles: {
      font,
      fontSize: isA5 ? 8 : 9.5,
      cellPadding: isA5 ? 2.4 : 3.5,
      ...(colorless ? { textColor: [15, 23, 42], lineColor: [148, 163, 184] } : {}),
    },
    headStyles: colorless
      ? {
          fillColor: [255, 255, 255],
          textColor: [15, 23, 42],
          fontStyle: 'bold',
          lineColor: [15, 23, 42],
          lineWidth: 0.3,
        }
      : {
          fillColor: accent,
          textColor: [255, 255, 255],
          fontStyle: 'bold',
        },
    alternateRowStyles: colorless ? { fillColor: [255, 255, 255] } : undefined,
  });

  const afterTableY = (doc as any).lastAutoTable?.finalY || curY + 16;
  renderSignatureAndFootersPdf(
    doc,
    config,
    afterTableY,
    'Ce document tient lieu de reçu officiel pour le règlement des soins dispensés.'
  );

  const safeNom = (patient?.nom || 'Patient').replace(/\s+/g, '_');
  doc.save(`Recu_${safeNom}_${sessionDate.replace(/\//g, '-')}.pdf`);
}
