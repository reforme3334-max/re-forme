import { supabase } from './supabaseClient';

export interface ExerciseItem {
  id: string;
  title: string;
  url: string; // Embed URL (for iframe / video element)
  originalUrl?: string; // Direct link to open in YouTube app or web
  thumbnailUrl?: string; // YouTube thumbnail preview
  instructions?: string; // Practitioner instructions (e.g. "3x10 répétitions")
  date: string;
  type?: 'video' | 'youtube';
}

export interface PainLogItem {
  id: string;
  score: number;
  note: string;
  date: string;
  author?: 'patient' | 'praticien';
}

/**
 * Normalizes YouTube and video URLs into proper embed, watch, and thumbnail links.
 */
export function parseYouTubeUrl(url: string): {
  embedUrl: string;
  watchUrl: string;
  videoId?: string;
  thumbnailUrl?: string;
} {
  if (!url) return { embedUrl: '', watchUrl: '' };
  const trimmed = url.trim();

  // Check if it's a local video data URL
  if (trimmed.startsWith('data:video')) {
    return { embedUrl: trimmed, watchUrl: trimmed };
  }

  // Google Drive video link support
  const driveMatch = trimmed.match(/drive\.google\.com\/file\/d\/([a-zA-Z0-9_-]+)/i);
  if (driveMatch && driveMatch[1]) {
    const fileId = driveMatch[1];
    return {
      embedUrl: `https://drive.google.com/file/d/${fileId}/preview`,
      watchUrl: trimmed
    };
  }

  let videoId: string | null = null;

  // Pattern 1: youtu.be/ID
  const youtuBeMatch = trimmed.match(/youtu\.be\/([a-zA-Z0-9_-]+)/i);
  if (youtuBeMatch && youtuBeMatch[1]) {
    videoId = youtuBeMatch[1].split('?')[0].split('&')[0];
  }

  // Pattern 2: youtube.com/shorts/ID or youtube.com/live/ID
  if (!videoId) {
    const shortsMatch = trimmed.match(/youtube\.com\/(?:shorts|live)\/([a-zA-Z0-9_-]+)/i);
    if (shortsMatch && shortsMatch[1]) {
      videoId = shortsMatch[1].split('?')[0].split('&')[0];
    }
  }

  // Pattern 3: youtube.com/embed/ID
  if (!videoId) {
    const embedMatch = trimmed.match(/youtube\.com\/embed\/([a-zA-Z0-9_-]+)/i);
    if (embedMatch && embedMatch[1]) {
      videoId = embedMatch[1].split('?')[0].split('&')[0];
    }
  }

  // Pattern 4: watch?v=ID or v=ID
  if (!videoId) {
    const vMatch = trimmed.match(/[?&]v=([a-zA-Z0-9_-]+)/i);
    if (vMatch && vMatch[1]) {
      videoId = vMatch[1].split('&')[0];
    }
  }

  if (videoId) {
    return {
      videoId,
      embedUrl: `https://www.youtube.com/embed/${videoId}?rel=0&playsinline=1`,
      watchUrl: `https://www.youtube.com/watch?v=${videoId}`,
      thumbnailUrl: `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`
    };
  }

  return {
    embedUrl: trimmed,
    watchUrl: trimmed
  };
}

/**
 * Safely parses exercises stored in the database (or localStorage fallback).
 */
export function parseExercisesFromPatient(rawNotesAntecedents: any, patientId?: string): ExerciseItem[] {
  let list: ExerciseItem[] = [];

  const extractFromStringOrArray = (input: any) => {
    if (!input) return;
    if (Array.isArray(input)) {
      for (const entry of input) {
        if (entry && typeof entry === 'object' && entry.url) {
          list.push(entry);
        } else if (entry && typeof entry === 'object' && 'notes_antecedents' in entry) {
          extractFromStringOrArray(entry.notes_antecedents);
        }
      }
    } else if (typeof input === 'string') {
      const trimmed = input.trim();
      if (trimmed.startsWith('[') || trimmed.startsWith('{')) {
        try {
          const parsed = JSON.parse(trimmed);
          if (Array.isArray(parsed)) {
            list.push(...parsed);
          } else if (parsed && Array.isArray(parsed.exercises)) {
            list.push(...parsed.exercises);
          }
        } catch (e) {
          console.warn('Could not parse JSON exercises from notes_antecedents', e);
        }
      }
    }
  };

  extractFromStringOrArray(rawNotesAntecedents);

  // Merge with localStorage if present (only in browser environment)
  if (patientId && typeof window !== 'undefined' && typeof window.localStorage !== 'undefined') {
    try {
      const localRaw = window.localStorage.getItem(`reforme_exercises_${patientId}`);
      if (localRaw) {
        const localList: ExerciseItem[] = JSON.parse(localRaw);
        if (Array.isArray(localList) && localList.length > 0) {
          for (const item of localList) {
            list.push(item);
          }
        }
      }
    } catch (err) {
      console.warn('Local storage exercise read warning', err);
    }
  }

  // Deduplicate by id or url
  const seen = new Set<string>();
  const uniqueList: ExerciseItem[] = [];
  for (const item of list) {
    if (!item || !item.url) continue;
    const key = item.id || item.url;
    if (!seen.has(key)) {
      seen.add(key);
      uniqueList.push(item);
    }
  }

  // Ensure URLs and thumbnails are properly formatted
  return uniqueList.map(item => {
    if (item.url && (item.url.includes('youtu') || item.url.includes('youtube') || item.url.includes('drive.google.com'))) {
      const parsed = parseYouTubeUrl(item.url);
      return {
        ...item,
        url: parsed.embedUrl || item.url,
        originalUrl: item.originalUrl || parsed.watchUrl || item.url,
        thumbnailUrl: item.thumbnailUrl || parsed.thumbnailUrl
      };
    }
    return item;
  });
}

/**
 * Safely parses pain evaluation logs stored in the database (notes_antecedents + follow_up_status + localStorage).
 */
export function parsePainLogsFromPatient(rawInput: any, patientId?: string): PainLogItem[] {
  const rawLogs: PainLogItem[] = [];
  const fallbackStatusLogs: PainLogItem[] = [];

  const extractFromInput = (input: any) => {
    if (!input) return;
    if (Array.isArray(input)) {
      for (const entry of input) {
        if (!entry || typeof entry !== 'object') continue;
        if ('score' in entry && 'date' in entry) {
          rawLogs.push({
            id: String(entry.id || Date.now()),
            score: Number(entry.score) || 1,
            note: entry.note ? String(entry.note) : '',
            date: String(entry.date),
            author: entry.author
          });
        } else {
          if ('notes_antecedents' in entry && entry.notes_antecedents) {
            extractFromInput(entry.notes_antecedents);
          }
          if ('follow_up_status' in entry && typeof entry.follow_up_status === 'string' && entry.follow_up_status.startsWith('PAIN:')) {
            const parts = entry.follow_up_status.replace('PAIN:', '').split('|');
            const dbScore = parseInt(parts[0], 10);
            const dbDate = parts[1] || entry.last_follow_up_date || new Date().toISOString();
            const dbNote = parts[2] || '';
            if (!isNaN(dbScore)) {
              fallbackStatusLogs.push({
                id: 'status-' + dbDate.split('T')[0],
                score: dbScore,
                note: dbNote,
                date: dbDate.includes('T') ? dbDate : `${dbDate}T12:00:00.000Z`
              });
            }
          }
        }
      }
    } else if (typeof input === 'object') {
      if ('notes_antecedents' in input || 'follow_up_status' in input) {
        extractFromInput([input]);
      } else if (Array.isArray(input.painLogs)) {
        extractFromInput(input.painLogs);
      }
    } else if (typeof input === 'string') {
      const trimmed = input.trim();
      if (trimmed.startsWith('PAIN:')) {
        const parts = trimmed.replace('PAIN:', '').split('|');
        const dbScore = parseInt(parts[0], 10);
        const dbDate = parts[1] || new Date().toISOString();
        const dbNote = parts[2] || '';
        if (!isNaN(dbScore)) {
          fallbackStatusLogs.push({
            id: 'status-' + dbDate.split('T')[0],
            score: dbScore,
            note: dbNote,
            date: dbDate.includes('T') ? dbDate : `${dbDate}T12:00:00.000Z`
          });
        }
      } else if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
        try {
          const parsed = JSON.parse(trimmed);
          if (parsed && typeof parsed === 'object' && !Array.isArray(parsed) && Array.isArray(parsed.painLogs)) {
            extractFromInput(parsed.painLogs);
          }
        } catch (e) {
          console.warn('Could not parse JSON painLogs from notes_antecedents', e);
        }
      }
    }
  };

  extractFromInput(rawInput);

  // Merge with localStorage if present
  if (patientId && typeof window !== 'undefined' && typeof window.localStorage !== 'undefined') {
    try {
      const localRaw = window.localStorage.getItem(`reforme_pain_${patientId}`);
      if (localRaw) {
        const localList = JSON.parse(localRaw);
        if (Array.isArray(localList)) {
          extractFromInput(localList);
        }
      }
    } catch (err) {
      console.warn('Local storage pain read warning', err);
    }
  }

  // Append fallback follow_up_status logs last so full notes_antecedents logs take priority
  const allLogs = [...rawLogs, ...fallbackStatusLogs];

  // Deduplicate by date (YYYY-MM-DD), keeping the entry with the most recent timestamp or longest note
  const byDay = new Map<string, PainLogItem>();
  for (const item of allLogs) {
    if (!item || typeof item.score !== 'number' || isNaN(item.score) || !item.date) continue;
    const dayKey = item.date.split('T')[0];
    const existing = byDay.get(dayKey);
    if (!existing) {
      byDay.set(dayKey, item);
    } else {
      const existingIsFallback = String(existing.id).startsWith('status-') || String(existing.id).startsWith('db-');
      const itemIsFallback = String(item.id).startsWith('status-') || String(item.id).startsWith('db-');
      if (existingIsFallback && !itemIsFallback) {
        byDay.set(dayKey, item);
      } else if (!existingIsFallback && !itemIsFallback && (item.note?.length || 0) > (existing.note?.length || 0)) {
        byDay.set(dayKey, item);
      }
    }
  }

  return Array.from(byDay.values()).sort(
    (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
  );
}

/**
 * Helper to fetch existing exercises & painLogs on a patient record before updating one of them.
 */
async function getExistingCloudData(patientId: string): Promise<{ exercises: ExerciseItem[]; painLogs: PainLogItem[] }> {
  try {
    const { data } = await supabase
      .from('patients')
      .select('notes_antecedents, follow_up_status, last_follow_up_date')
      .eq('id', patientId)
      .single();
    if (data) {
      return {
        exercises: parseExercisesFromPatient(data.notes_antecedents, patientId),
        painLogs: parsePainLogsFromPatient(data, patientId)
      };
    }
  } catch (e) {
    console.warn('Could not read existing cloud data for merge', e);
  }
  return {
    exercises: parseExercisesFromPatient(null, patientId),
    painLogs: parsePainLogsFromPatient(null, patientId)
  };
}

/**
 * Saves exercises both in Supabase (notes_antecedents) and localStorage,
 * preserving any existing painLogs and syncing across duplicate phone records.
 */
export async function saveExercisesForPatient(
  patientId: string,
  exercises: ExerciseItem[],
  patientTelephone?: string
): Promise<{ success: boolean; error?: string }> {
  try {
    // 1. Save in localStorage for fast local cache
    if (typeof window !== 'undefined' && typeof window.localStorage !== 'undefined') {
      try {
        window.localStorage.setItem(`reforme_exercises_${patientId}`, JSON.stringify(exercises));
      } catch (e) {
        console.warn('LocalStorage save warning', e);
      }
    }

    // 2. Preserve existing painLogs when saving exercises
    const existing = await getExistingCloudData(patientId);

    // Guard against multi-megabyte (>4.5MB) raw video files that would cause SQL statement timeouts.
    const MAX_DATA_URL_LENGTH = 6000000; // ~4.5 MB file
    const cloudSafeExercises = exercises.filter(
      item => !(item.url && item.url.startsWith('data:') && item.url.length > MAX_DATA_URL_LENGTH)
    );
    const payload = JSON.stringify({
      exercises: cloudSafeExercises,
      painLogs: existing.painLogs.slice(0, 90)
    });
    if (payload.length > 6200000) {
      return {
        success: false,
        error: 'Fichier vidéo trop volumineux (> 4.5 Mo). Utilisez un lien YouTube ou une vidéo plus courte pour une visibilité garantie chez le patient.'
      };
    }

    const { error } = await supabase
      .from('patients')
      .update({ notes_antecedents: payload })
      .eq('id', patientId);

    if (error) {
      console.warn('Error saving exercises to Supabase:', error);
      return { success: false, error: error.message };
    }

    // 3. Also sync to any duplicate patient rows that share the same phone number (normalized by last 8 digits)
    const digitsOnly = (patientTelephone || '').replace(/\D/g, '');
    const tail = digitsOnly.slice(-8);
    if (tail.length === 8 && !/^0+$/.test(tail)) {
      const { data: allPhones } = await supabase
        .from('patients')
        .select('id, telephone');
      if (allPhones && allPhones.length > 0) {
        const duplicateIds = allPhones
          .filter(p => p.id !== patientId && (p.telephone || '').replace(/\D/g, '').endsWith(tail))
          .map(p => p.id);
        if (duplicateIds.length > 0) {
          await supabase
            .from('patients')
            .update({ notes_antecedents: payload })
            .in('id', duplicateIds);
        }
      }
    }

    return { success: true };
  } catch (err: any) {
    console.warn('Fatal error saving exercises:', err);
    return { success: false, error: err.message || 'Erreur inattendue' };
  }
}

/**
 * Saves the full 30-day pain evaluation history (painLogs) in Supabase (notes_antecedents + follow_up_status)
 * and localStorage, syncing across any duplicate patient rows sharing the same phone number
 * so the Patient, Admin, Secrétaire, and Kiné all see the exact same pain evolution diagram.
 */
export async function savePainLogsForPatient(
  patientId: string,
  painLogs: PainLogItem[],
  patientTelephone?: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const sortedLogs = [...painLogs].sort(
      (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
    );

    if (typeof window !== 'undefined' && typeof window.localStorage !== 'undefined') {
      try {
        window.localStorage.setItem(`reforme_pain_${patientId}`, JSON.stringify(sortedLogs));
      } catch (e) {
        console.warn('LocalStorage pain save warning', e);
      }
    }

    const existing = await getExistingCloudData(patientId);
    const MAX_DATA_URL_LENGTH = 6000000;
    const cloudSafeExercises = existing.exercises.filter(
      item => !(item.url && item.url.startsWith('data:') && item.url.length > MAX_DATA_URL_LENGTH)
    );

    const payload = JSON.stringify({
      exercises: cloudSafeExercises,
      painLogs: sortedLogs.slice(0, 90)
    });

    const latest = sortedLogs[0];
    let followUpStatus: string | null = null;
    let lastFollowUpDate: string | null = null;

    if (latest) {
      const dateStr = latest.date.split('T')[0];
      const shortNote = (latest.note || '').trim().replace(/\|/g, ' ').slice(0, 20);
      followUpStatus = `PAIN:${latest.score}|${dateStr}${shortNote ? '|' + shortNote : ''}`;
      lastFollowUpDate = latest.date;
    }

    const updateData: Record<string, any> = {
      notes_antecedents: payload,
      follow_up_status: followUpStatus,
      last_follow_up_date: lastFollowUpDate
    };

    const { error } = await supabase
      .from('patients')
      .update(updateData)
      .eq('id', patientId);

    if (error) {
      console.warn('Error saving painLogs to Supabase:', error);
      return { success: false, error: error.message };
    }

    // Sync across duplicate patient rows sharing the same phone number
    const digitsOnly = (patientTelephone || '').replace(/\D/g, '');
    const tail = digitsOnly.slice(-8);
    if (tail.length === 8 && !/^0+$/.test(tail)) {
      const { data: allPhones } = await supabase
        .from('patients')
        .select('id, telephone');
      if (allPhones && allPhones.length > 0) {
        const duplicateIds = allPhones
          .filter(p => p.id !== patientId && (p.telephone || '').replace(/\D/g, '').endsWith(tail))
          .map(p => p.id);
        if (duplicateIds.length > 0) {
          await supabase
            .from('patients')
            .update(updateData)
            .in('id', duplicateIds);
        }
      }
    }

    return { success: true };
  } catch (err: any) {
    console.warn('Fatal error saving painLogs:', err);
    return { success: false, error: err.message || 'Erreur inattendue' };
  }
}
