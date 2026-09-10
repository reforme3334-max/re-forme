import { supabase } from './supabaseClient';

export interface DateRange {
  startDate: Date | null;
  endDate: Date | null;
  label: string;
}

/**
 * Robustly fetches all rows from a Supabase table by paginating with range().
 * Bypasses the default PostgREST 1000-row response limit with automatic
 * retry and exponential backoff on transient network glitches.
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

      // If this attempt failed and we have retries left, back off and retry
      if (attempt < maxRetries) {
        await new Promise(resolve => setTimeout(resolve, attempt * 300));
      }
    }

    if (pageError) {
      console.warn(`[fetchAllRows] Notice: page ${page} of ${tableName} could not be loaded after ${maxRetries} attempts:`, pageError?.message || pageError);
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
 * Prioritizes date_facturation, then appointment date, then created_at.
 */
export function getBillDate(b: any): Date {
  if (!b) return new Date();
  if (b.date_facturation) return new Date(b.date_facturation);
  
  const apptDate = Array.isArray(b.appointments) 
    ? b.appointments[0]?.date_heure 
    : b.appointments?.date_heure;
    
  if (apptDate) return new Date(apptDate);
  if (b.created_at) return new Date(b.created_at);
  return new Date();
}

/**
 * Returns exact start and end dates (with boundaries 00:00:00.000 to 23:59:59.999)
 * for a chosen filter period.
 */
export function getDateRange(filter: string, customDate?: string): DateRange {
  const now = new Date();

  if (filter === 'all') {
    return { startDate: null, endDate: null, label: "Tout le temps" };
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
    return { startDate: start, endDate: end, label: "7 derniers jours" };
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
    return { startDate: start, endDate: end, label: "Cette semaine" };
  }

  if (filter === 'month') {
    const start = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
    const end = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
    return { startDate: start, endDate: end, label: "Ce mois" };
  }

  if (filter === 'year') {
    const start = new Date(now.getFullYear(), 0, 1, 0, 0, 0, 0);
    const end = new Date(now.getFullYear(), 11, 31, 23, 59, 59, 999);
    return { startDate: start, endDate: end, label: "Cette année" };
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
        label: start.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' }) 
      };
    }
  }

  return { startDate: null, endDate: null, label: "Tout le temps" };
}

/**
 * Returns previous period range for calculating period-over-period trends.
 */
export function getPreviousDateRange(filter: string, customDate?: string): DateRange {
  const current = getDateRange(filter, customDate);
  if (!current.startDate || !current.endDate || filter === 'all') {
    return { startDate: null, endDate: null, label: '' };
  }

  const now = new Date();

  if (filter === 'day' || filter === 'today') {
    const yesterday = new Date(now);
    yesterday.setDate(now.getDate() - 1);
    const start = new Date(yesterday.getFullYear(), yesterday.getMonth(), yesterday.getDate(), 0, 0, 0, 0);
    const end = new Date(yesterday.getFullYear(), yesterday.getMonth(), yesterday.getDate(), 23, 59, 59, 999);
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
 * Checks if a given date is within a date range.
 */
export function isDateInRange(
  dateInput: string | Date | null | undefined, 
  range: DateRange
): boolean {
  if (!dateInput) return false;
  if (!range.startDate || !range.endDate) return true; // 'all' filter matches everything

  const d = typeof dateInput === 'string' ? new Date(dateInput) : dateInput;
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
