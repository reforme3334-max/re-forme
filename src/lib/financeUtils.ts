import { supabase } from './supabaseClient';
import { getMoroccoNow, parseClinicDate, parseUtcToMoroccoDate } from './timeUtils';

export interface DateRange {
  startDate: Date | null;
  endDate: Date | null;
  label: string;
  monthKeys?: Set<string>;
}

const SHORT_FR_MONTHS = [
  'Janv.',
  'Févr.',
  'Mars',
  'Avr.',
  'Mai',
  'Juin',
  'Juil.',
  'Août',
  'Sept.',
  'Oct.',
  'Nov.',
  'Déc.',
];

export function formatSelectedMonthsLabel(monthKeys: string[]): string {
  const valid = Array.from(new Set(monthKeys.filter((k) => /^\d{4}-\d{2}$/.test(k)))).sort();
  if (valid.length === 0) return 'Aucun mois';

  const parsed = valid.map((k) => {
    const [y, m] = k.split('-').map(Number);
    return { key: k, year: y, monthIndex: m - 1, name: SHORT_FR_MONTHS[m - 1] || k };
  });

  const years = Array.from(new Set(parsed.map((p) => p.year)));
  const sameYear = years.length === 1;

  if (parsed.length === 1) {
    return `${parsed[0].name} ${parsed[0].year}`;
  }
  if (parsed.length <= 3) {
    if (sameYear) {
      return `${parsed.map((p) => p.name).join(', ')} ${years[0]}`;
    }
    return parsed.map((p) => `${p.name} ${p.year}`).join(', ');
  }
  if (sameYear) {
    return `${parsed.length} mois (${years[0]})`;
  }
  return `${parsed.length} mois sélectionnés`;
}

/**
 * Arrondit un montant monétaire au centime près (évite les erreurs IEEE-754 type 199.99999994).
 */
export function roundMoney(value: unknown): number {
  const num = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(num)) return 0;
  return Math.round((num + Number.EPSILON) * 100) / 100;
}

/**
 * Additionne une liste de montants en centimes entiers pour garantir zéro dérive flottante.
 */
export function sumMoney<T = any>(
  items: readonly T[] | null | undefined,
  selector: (item: unknown extends T ? any : T) => unknown = (x: any) => x
): number {
  if (!items || items.length === 0) return 0;
  let totalCents = 0;
  for (const item of items) {
    const raw = selector(item as any);
    const num = typeof raw === 'number' ? raw : Number(raw);
    if (Number.isFinite(num)) {
      totalCents += Math.round((num + Number.EPSILON) * 100);
    }
  }
  return totalCents / 100;
}

/**
 * Formate proprement un montant en Dirhams (ex: "61 520" ou "150,50") sans décimales parasites.
 */
export function formatMoney(value: unknown): string {
  const clean = roundMoney(value);
  return clean.toLocaleString('fr-FR', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  });
}

export function isPaidBillingStatus(statut: string | null | undefined): boolean {
  return statut === 'Payé' || statut === 'Effectué';
}

export function isUnpaidBillingStatus(statut: string | null | undefined): boolean {
  return statut === 'En attente' || statut === 'Impayé' || statut === 'Rejeté';
}

/**
 * Nettoie, dédoublonne et normalise les règlements (billings) :
 * - Exclut les règlements rattachés à un rendez-vous annulé ('Annulé')
 * - Dédoublonne par ID et par appointment_id (conserve le règlement cohérent avec le statut du RDV ou le plus récent)
 * - Normalise chaque montant au centime près
 */
export function sanitizeBillings<T extends Record<string, any>>(
  billings: T[] | null | undefined,
  appointments?: any[] | null
): T[] {
  if (!billings || billings.length === 0) return [];

  const apptMap = new Map<string, any>();
  if (appointments && appointments.length > 0) {
    for (const app of appointments) {
      if (app?.id) apptMap.set(app.id, app);
    }
  }

  const seenBillIds = new Set<string>();
  const byAppointmentId = new Map<string, T>();
  const standaloneBills: T[] = [];

  const getEmbeddedAppt = (b: any) => {
    if (b?.appointment_id && apptMap.has(b.appointment_id)) {
      return apptMap.get(b.appointment_id);
    }
    if (b?.appointments) {
      return Array.isArray(b.appointments) ? b.appointments[0] : b.appointments;
    }
    return null;
  };

  const scoreBillingCandidate = (b: any, linkedAppt: any): number => {
    let score = 0;
    const apptStatut = linkedAppt?.statut;
    if (apptStatut === 'Effectué' && isPaidBillingStatus(b.statut)) score += 100;
    else if (apptStatut === 'Impayé' && isUnpaidBillingStatus(b.statut)) score += 100;
    else if (isPaidBillingStatus(b.statut)) score += 50;

    const ts = b.date_facturation ? new Date(b.date_facturation).getTime() : 0;
    if (Number.isFinite(ts)) score += ts / 1e13;
    return score;
  };

  for (const rawBill of billings) {
    if (!rawBill) continue;
    if (rawBill.id) {
      if (seenBillIds.has(rawBill.id)) continue;
      seenBillIds.add(rawBill.id);
    }

    const linkedAppt = getEmbeddedAppt(rawBill);
    if (linkedAppt?.statut === 'Annulé') {
      continue;
    }

    const normalizedBill = {
      ...rawBill,
      montant: roundMoney(rawBill.montant),
    } as T;

    const appId = rawBill.appointment_id || linkedAppt?.id;
    if (appId) {
      const existing = byAppointmentId.get(appId);
      if (!existing) {
        byAppointmentId.set(appId, normalizedBill);
      } else {
        const existingAppt = getEmbeddedAppt(existing) || linkedAppt;
        if (scoreBillingCandidate(normalizedBill, linkedAppt) >= scoreBillingCandidate(existing, existingAppt)) {
          byAppointmentId.set(appId, normalizedBill);
        }
      }
    } else {
      standaloneBills.push(normalizedBill);
    }
  }

  return [...Array.from(byAppointmentId.values()), ...standaloneBills];
}

/**
 * Robustly fetches all rows from a Supabase table by paginating with range().
 * Uses a deterministic secondary order on `id` to prevent skipped or duplicated rows across page boundaries.
 */
export async function fetchAllRows<T = any>(
  tableName: string,
  selectQuery: string,
  orderBy?: { column: string; ascending?: boolean },
  pageSize = 1000
): Promise<T[]> {
  const allRows: T[] = [];
  let page = 0;
  const maxRetries = 3;

  while (true) {
    let pageData: T[] | null = null;
    let pageError: any = null;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        let query = supabase
          .from(tableName)
          .select(selectQuery)
          .range(page * pageSize, (page + 1) * pageSize - 1);

        if (orderBy) {
          query = query.order(orderBy.column, { ascending: orderBy.ascending ?? false });
          if (orderBy.column !== 'id') {
            query = query.order('id', { ascending: true });
          }
        } else {
          query = query.order('id', { ascending: true });
        }

        const { data, error } = await query;
        if (!error && data) {
          pageData = data as T[];
          pageError = null;
          break;
        }

        pageError = error;
      } catch (err) {
        pageError = err;
      }

      if (attempt < maxRetries) {
        await new Promise((resolve) => setTimeout(resolve, attempt * 300));
      }
    }

    if (pageError) {
      console.warn(
        `[fetchAllRows] Notice: page ${page} of ${tableName} could not be loaded after ${maxRetries} attempts:`,
        pageError?.message || pageError
      );
      break;
    }

    if (!pageData || pageData.length === 0) break;
    allRows.push(...pageData);

    if (pageData.length < pageSize) break;
    page++;
  }

  return allRows;
}

/**
 * Standardizes extraction of billing date across the entire application.
 * Prioritizes date_facturation (converted to Morocco clinic timezone), then appointment date, then created_at.
 */
export function getBillDate(b: any): Date {
  if (!b) return getMoroccoNow();
  if (b.date_facturation) return parseUtcToMoroccoDate(b.date_facturation);

  const apptDate = Array.isArray(b.appointments)
    ? b.appointments[0]?.date_heure
    : b.appointments?.date_heure;

  if (apptDate) return parseClinicDate(apptDate);
  if (b.created_at) return parseUtcToMoroccoDate(b.created_at);
  return getMoroccoNow();
}

/**
 * Returns exact start and end dates (with boundaries 00:00:00.000 to 23:59:59.999)
 * for a chosen filter period.
 */
export function getDateRange(
  filter: string,
  customDate?: string,
  selectedMonths?: string[]
): DateRange {
  const now = getMoroccoNow();

  if (filter === 'all') {
    return { startDate: null, endDate: null, label: 'Tout le temps' };
  }

  if (filter === 'months') {
    const valid = Array.from(
      new Set((selectedMonths || []).filter((k) => /^\d{4}-\d{2}$/.test(k)))
    ).sort();
    if (valid.length === 0) {
      return {
        startDate: new Date(1970, 0, 2, 0, 0, 0, 0),
        endDate: new Date(1970, 0, 1, 0, 0, 0, 0),
        label: 'Aucun mois sélectionné',
        monthKeys: new Set<string>(),
      };
    }
    const [firstY, firstM] = valid[0].split('-').map(Number);
    const [lastY, lastM] = valid[valid.length - 1].split('-').map(Number);
    const start = new Date(firstY, firstM - 1, 1, 0, 0, 0, 0);
    const end = new Date(lastY, lastM, 0, 23, 59, 59, 999);
    return {
      startDate: start,
      endDate: end,
      label: formatSelectedMonthsLabel(valid),
      monthKeys: new Set<string>(valid),
    };
  }

  if (filter === 'day' || filter === 'today') {
    const start = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
    const end = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
    return { startDate: start, endDate: end, label: "Aujourd'hui" };
  }

  if (filter === '7days') {
    const start = new Date(now);
    start.setDate(now.getDate() - 7);
    start.setHours(0, 0, 0, 0);
    const end = new Date(now);
    end.setHours(23, 59, 59, 999);
    return { startDate: start, endDate: end, label: '7 derniers jours' };
  }

  if (filter === 'week') {
    const day = now.getDay();
    const diff = day === 0 ? -6 : 1 - day; // Monday
    const start = new Date(now);
    start.setDate(now.getDate() + diff);
    start.setHours(0, 0, 0, 0);

    const end = new Date(start);
    end.setDate(start.getDate() + 6);
    end.setHours(23, 59, 59, 999);
    return { startDate: start, endDate: end, label: 'Cette semaine' };
  }

  if (filter === 'month') {
    const start = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
    const end = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
    return { startDate: start, endDate: end, label: 'Ce mois' };
  }

  if (filter === 'year') {
    const start = new Date(now.getFullYear(), 0, 1, 0, 0, 0, 0);
    const end = new Date(now.getFullYear(), 11, 31, 23, 59, 59, 999);
    return { startDate: start, endDate: end, label: 'Cette année' };
  }

  if (filter === 'exact' && customDate) {
    const parts = customDate.split('-');
    if (parts.length === 3) {
      const y = parseInt(parts[0], 10);
      const m = parseInt(parts[1], 10) - 1;
      const d = parseInt(parts[2], 10);
      const start = new Date(y, m, d, 0, 0, 0, 0);
      const end = new Date(y, m, d, 23, 59, 59, 999);
      return {
        startDate: start,
        endDate: end,
        label: start.toLocaleDateString('fr-FR', {
          day: '2-digit',
          month: '2-digit',
          year: 'numeric',
        }),
      };
    }
  }

  return { startDate: null, endDate: null, label: 'Tout le temps' };
}

/**
 * Returns previous period range for calculating period-over-period trends.
 */
export function getPreviousDateRange(
  filter: string,
  customDate?: string,
  selectedMonths?: string[]
): DateRange {
  const current = getDateRange(filter, customDate, selectedMonths);
  if (!current.startDate || !current.endDate || filter === 'all') {
    return { startDate: null, endDate: null, label: '' };
  }

  if (filter === 'months') {
    const valid = Array.from(current.monthKeys || []).sort();
    if (valid.length === 0) {
      return { startDate: null, endDate: null, label: '' };
    }
    const shift = valid.length;
    const prevKeys = valid.map((k) => {
      const [y, m] = k.split('-').map(Number);
      const d = new Date(y, m - 1 - shift, 1);
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    });
    const [firstY, firstM] = prevKeys[0].split('-').map(Number);
    const [lastY, lastM] = prevKeys[prevKeys.length - 1].split('-').map(Number);
    return {
      startDate: new Date(firstY, firstM - 1, 1, 0, 0, 0, 0),
      endDate: new Date(lastY, lastM, 0, 23, 59, 59, 999),
      label: formatSelectedMonthsLabel(prevKeys),
      monthKeys: new Set<string>(prevKeys),
    };
  }

  const now = getMoroccoNow();

  if (filter === 'day' || filter === 'today') {
    const yesterday = new Date(now);
    yesterday.setDate(now.getDate() - 1);
    const start = new Date(
      yesterday.getFullYear(),
      yesterday.getMonth(),
      yesterday.getDate(),
      0,
      0,
      0,
      0
    );
    const end = new Date(
      yesterday.getFullYear(),
      yesterday.getMonth(),
      yesterday.getDate(),
      23,
      59,
      59,
      999
    );
    return { startDate: start, endDate: end, label: 'Hier' };
  }

  if (filter === '7days') {
    const end = new Date(current.startDate);
    end.setMilliseconds(-1);
    const start = new Date(end);
    start.setDate(start.getDate() - 7);
    start.setHours(0, 0, 0, 0);
    return { startDate: start, endDate: end, label: '7 jours précédents' };
  }

  if (filter === 'week') {
    const start = new Date(current.startDate);
    start.setDate(start.getDate() - 7);
    const end = new Date(current.endDate);
    end.setDate(end.getDate() - 7);
    return { startDate: start, endDate: end, label: 'Semaine précédente' };
  }

  if (filter === 'month') {
    const start = new Date(now.getFullYear(), now.getMonth() - 1, 1, 0, 0, 0, 0);
    const end = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999);
    return { startDate: start, endDate: end, label: 'Mois précédent' };
  }

  if (filter === 'year') {
    const start = new Date(now.getFullYear() - 1, 0, 1, 0, 0, 0, 0);
    const end = new Date(now.getFullYear() - 1, 11, 31, 23, 59, 59, 999);
    return { startDate: start, endDate: end, label: 'Année précédente' };
  }

  if (filter === 'exact' && current.startDate && current.endDate) {
    const diff = current.endDate.getTime() - current.startDate.getTime();
    const end = new Date(current.startDate.getTime() - 1);
    const start = new Date(end.getTime() - diff);
    return { startDate: start, endDate: end, label: 'Période précédente' };
  }

  return { startDate: null, endDate: null, label: '' };
}

/**
 * Checks if a given date is within a date range (including multi-month sets).
 */
export function isDateInRange(
  dateInput: string | Date | null | undefined,
  range: DateRange
): boolean {
  if (!dateInput) return false;

  if (range.monthKeys !== undefined) {
    if (range.monthKeys.size === 0) return false;
    const d = typeof dateInput === 'string' ? parseClinicDate(dateInput) : dateInput;
    const ym = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    return range.monthKeys.has(ym);
  }

  if (!range.startDate || !range.endDate) return true; // 'all' filter matches everything

  const d = typeof dateInput === 'string' ? parseClinicDate(dateInput) : dateInput;
  const time = d.getTime();
  return time >= range.startDate.getTime() && time <= range.endDate.getTime();
}

/**
 * Calculates percentage trend between current and previous period values.
 */
export function calcTrend(current: number, prev: number | undefined): number | undefined {
  if (prev === undefined || prev === null) return undefined;
  if (prev === 0) return current > 0 ? 100 : 0;
  return Math.round(((current - prev) / prev) * 100);
}
