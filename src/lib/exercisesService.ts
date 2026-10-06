import { supabase } from './supabaseClient';

export interface ExerciseItem {
  id: string;
  title: string;
  url: string; // Embed URL (for iframe / video element)
  originalUrl?: string; // Direct link to open in YouTube app or web
  instructions?: string; // Practitioner instructions (e.g. "3x10 répétitions")
  date: string;
  type?: 'video' | 'youtube';
}

/**
 * Normalizes YouTube URLs into proper embed and watch links.
 * Supports:
 * - https://www.youtube.com/watch?v=ID
 * - https://youtu.be/ID
 * - https://www.youtube.com/shorts/ID
 * - https://m.youtube.com/watch?v=ID
 * - https://www.youtube.com/embed/ID
 */
export function parseYouTubeUrl(url: string): { embedUrl: string; watchUrl: string; videoId?: string } {
  if (!url) return { embedUrl: '', watchUrl: '' };
  const trimmed = url.trim();

  // Check if it's a local video data URL
  if (trimmed.startsWith('data:video')) {
    return { embedUrl: trimmed, watchUrl: trimmed };
  }

  let videoId: string | null = null;

  // Pattern 1: youtu.be/ID
  const youtuBeMatch = trimmed.match(/youtu\.be\/([a-zA-Z0-9_-]+)/i);
  if (youtuBeMatch && youtuBeMatch[1]) {
    videoId = youtuBeMatch[1].split('?')[0].split('&')[0];
  }

  // Pattern 2: youtube.com/shorts/ID
  if (!videoId) {
    const shortsMatch = trimmed.match(/youtube\.com\/shorts\/([a-zA-Z0-9_-]+)/i);
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
      videoId = vMatch[1];
    }
  }

  // Fallback if videoId was found
  if (videoId) {
    return {
      videoId,
      embedUrl: `https://www.youtube.com/embed/${videoId}?rel=0`,
      watchUrl: `https://www.youtube.com/watch?v=${videoId}`
    };
  }

  // If cannot extract videoId, return trimmed URL as fallback
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

  if (rawNotesAntecedents) {
    if (Array.isArray(rawNotesAntecedents)) {
      list = rawNotesAntecedents;
    } else if (typeof rawNotesAntecedents === 'string') {
      const trimmed = rawNotesAntecedents.trim();
      if (trimmed.startsWith('[') || trimmed.startsWith('{')) {
        try {
          const parsed = JSON.parse(trimmed);
          if (Array.isArray(parsed)) {
            list = parsed;
          } else if (parsed && Array.isArray(parsed.exercises)) {
            list = parsed.exercises;
          }
        } catch (e) {
          console.warn('Could not parse JSON exercises from notes_antecedents', e);
        }
      }
    }
  }

  // Merge with localStorage if present (for backward compatibility or offline)
  if (patientId) {
    try {
      const localRaw = localStorage.getItem(`reforme_exercises_${patientId}`);
      if (localRaw) {
        const localList: ExerciseItem[] = JSON.parse(localRaw);
        if (Array.isArray(localList) && localList.length > 0) {
          // Add any missing items from local storage to database list
          const existingIds = new Set(list.map(item => item.id));
          for (const item of localList) {
            if (!existingIds.has(item.id)) {
              list.push(item);
            }
          }
        }
      }
    } catch (err) {
      console.warn('Local storage exercise read error', err);
    }
  }

  // Ensure URLs are properly formatted
  return list.map(item => {
    if (item.url && (item.url.includes('youtu') || item.url.includes('youtube'))) {
      const parsed = parseYouTubeUrl(item.url);
      return {
        ...item,
        url: parsed.embedUrl || item.url,
        originalUrl: item.originalUrl || parsed.watchUrl || item.url
      };
    }
    return item;
  });
}

/**
 * Saves exercises both in Supabase (notes_antecedents) and localStorage.
 */
export async function saveExercisesForPatient(
  patientId: string,
  exercises: ExerciseItem[]
): Promise<{ success: boolean; error?: string }> {
  try {
    // 1. Save in localStorage for fast local cache
    try {
      localStorage.setItem(`reforme_exercises_${patientId}`, JSON.stringify(exercises));
    } catch (e) {
      console.warn('LocalStorage save warning', e);
    }

    // 2. Persist in Supabase so that patient sees it on ANY device/phone.
    // Guard against huge base64 video data URLs that would bloat the patients table and cause SQL timeouts.
    const cloudSafeExercises = exercises.filter(
      item => !(item.url && item.url.startsWith('data:') && item.url.length > 40000)
    );
    const payload = JSON.stringify(cloudSafeExercises);
    if (payload.length > 60000) {
      return {
        success: false,
        error: 'Le volume de données est trop important pour la base de données. Privilégiez les liens YouTube.'
      };
    }

    const { error } = await supabase
      .from('patients')
      .update({ notes_antecedents: payload })
      .eq('id', patientId);

    if (error) {
      console.error('Error saving exercises to Supabase:', error);
      return { success: false, error: error.message };
    }

    return { success: true };
  } catch (err: any) {
    console.error('Fatal error saving exercises:', err);
    return { success: false, error: err.message || 'Erreur inattendue' };
  }
}
