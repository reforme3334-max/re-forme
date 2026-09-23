import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '../lib/supabaseClient';
import { playNotificationChime } from '../lib/audio';

export interface AppointmentRequest {
  id: string;
  patient_id: string;
  patient_name: string;
  patient_phone: string;
  patient_email?: string;
  date_heure: string;
  statut: string;
  type: 'nouveau_rdv' | 'changement_rdv';
  requested_date?: string;
  requested_time?: string;
  motif?: string;
  notes_seance: string;
  created_at: string;
}

interface AppointmentNotificationsContextType {
  requests: AppointmentRequest[];
  pendingCount: number;
  loading: boolean;
  soundEnabled: boolean;
  setSoundEnabled: (enabled: boolean) => void;
  refreshRequests: () => Promise<void>;
  approveRequest: (request: AppointmentRequest) => Promise<boolean>;
  rejectRequest: (request: AppointmentRequest) => Promise<boolean>;
  latestNotification: AppointmentRequest | null;
  clearLatestNotification: () => void;
}

const AppointmentNotificationsContext = createContext<AppointmentNotificationsContextType | undefined>(undefined);

export function AppointmentNotificationsProvider({ children }: { children: React.ReactNode }) {
  const [requests, setRequests] = useState<AppointmentRequest[]>([]);
  const [loading, setLoading] = useState(false);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [latestNotification, setLatestNotification] = useState<AppointmentRequest | null>(null);
  
  const prevCountRef = useRef<number>(0);
  const isInitialLoad = useRef<boolean>(true);

  const fetchRequests = useCallback(async () => {
    try {
      // Fetch appointments that are either in 'En attente' OR contain 'DEMANDE' in notes_seance
      const { data: apptData, error: apptError } = await supabase
        .from('appointments')
        .select('*')
        .or('statut.eq.En attente,notes_seance.ilike.%DEMANDE%,notes_seance.ilike.%REPORT%')
        .order('created_at', { ascending: false });

      if (apptError) {
        console.error('Erreur chargement demandes:', apptError.message);
        return;
      }

      if (!apptData || apptData.length === 0) {
        setRequests([]);
        prevCountRef.current = 0;
        isInitialLoad.current = false;
        return;
      }

      // Filter only those that are genuinely pending (statut is 'En attente' or contains active demand tags and not completed/cancelled)
      const pendingAppointments = apptData.filter(a => {
        if (a.statut === 'Effectué' || a.statut === 'Annulé') return false;
        if (a.statut === 'En attente') return true;
        const notes = (a.notes_seance || '').toUpperCase();
        return notes.includes('[DEMANDE_RDV]') || notes.includes('[DEMANDE EN LIGNE]') || notes.includes('[DEMANDE_REPORT]');
      });

      if (pendingAppointments.length === 0) {
        setRequests([]);
        prevCountRef.current = 0;
        isInitialLoad.current = false;
        return;
      }

      // Fetch patient details for pending appointments
      const patientIds = [...new Set(pendingAppointments.map(a => a.patient_id))];
      const { data: patientsData } = await supabase
        .from('patients')
        .select('id, nom, prenom, telephone, email')
        .in('id', patientIds);

      const patientMap = new Map(patientsData ? patientsData.map(p => [p.id, p]) : []);

      // Map into structured requests
      const parsedRequests: AppointmentRequest[] = pendingAppointments.map(app => {
        const patient = patientMap.get(app.patient_id);
        const notes = app.notes_seance || '';
        const isChange = notes.includes('[DEMANDE_REPORT]') || notes.toUpperCase().includes('REPORT');

        let requestedDate = '';
        let requestedTime = '';
        let motif = '';

        if (isChange) {
          // Parse report details: e.g. [DEMANDE_REPORT] Date souhaitée: 2026-09-25 à 15:00 | Motif: Raison
          const dateMatch = notes.match(/Date souhaitée:\s*([^\s|]+)\s*(?:à|a)?\s*([^\s|]+)?/i);
          if (dateMatch) {
            requestedDate = dateMatch[1] || '';
            requestedTime = dateMatch[2] || '';
          }
          const motifMatch = notes.match(/Motif:\s*([^|]+)/i);
          motif = motifMatch ? motifMatch[1].trim() : notes.replace(/\[.*?\]/g, '').trim();
        } else {
          // Parse new appointment request
          const motifMatch = notes.match(/Motif:\s*(.*)/i);
          motif = motifMatch ? motifMatch[1].trim() : notes.replace(/\[.*?\]/g, '').trim();
        }

        return {
          id: app.id,
          patient_id: app.patient_id,
          patient_name: patient ? `${patient.prenom} ${patient.nom}` : 'Patient non identifié',
          patient_phone: patient?.telephone || '',
          patient_email: patient?.email || '',
          date_heure: app.date_heure,
          statut: app.statut,
          type: isChange ? 'changement_rdv' : 'nouveau_rdv',
          requested_date: requestedDate,
          requested_time: requestedTime,
          motif: motif || (isChange ? 'Changement d’horaire demandé' : 'Consultation'),
          notes_seance: notes,
          created_at: app.created_at || app.date_heure
        };
      });

      // Sort by creation time (most recent first)
      parsedRequests.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

      // Trigger notification if new request arrived
      if (!isInitialLoad.current && parsedRequests.length > prevCountRef.current) {
        const newest = parsedRequests[0];
        setLatestNotification(newest);
        if (soundEnabled) {
          playNotificationChime();
        }
      }

      prevCountRef.current = parsedRequests.length;
      isInitialLoad.current = false;
      setRequests(parsedRequests);
    } catch (err) {
      console.error('Erreur inattendue dans fetchRequests:', err);
    }
  }, [soundEnabled]);

  useEffect(() => {
    fetchRequests();

    // Polling every 12 seconds for fresh updates
    const interval = setInterval(() => {
      fetchRequests();
    }, 12000);

    return () => clearInterval(interval);
  }, [fetchRequests]);

  const refreshRequests = async () => {
    setLoading(true);
    await fetchRequests();
    setLoading(false);
  };

  const approveRequest = async (request: AppointmentRequest): Promise<boolean> => {
    try {
      let updatePayload: any = {
        statut: 'Programmé'
      };

      if (request.type === 'changement_rdv' && request.requested_date) {
        // Construct the new ISO string
        let newDateStr = request.requested_date;
        let newTimeStr = request.requested_time || '10:00';
        // Clean formats
        if (newTimeStr.length === 5) newTimeStr += ':00';
        updatePayload.date_heure = `${newDateStr}T${newTimeStr}`;
        updatePayload.notes_seance = `Report validé le ${new Date().toLocaleDateString('fr-FR')} - ${request.motif || 'Séance de suivi'}`;
      } else {
        updatePayload.notes_seance = `Confirmé par le secrétariat - ${request.motif || 'Consultation'}`;
      }

      const { error } = await supabase
        .from('appointments')
        .update(updatePayload)
        .eq('id', request.id);

      if (error) throw error;

      // Update local state immediately
      setRequests(prev => prev.filter(r => r.id !== request.id));
      prevCountRef.current = Math.max(0, prevCountRef.current - 1);
      return true;
    } catch (err: any) {
      console.error('Erreur lors de l’approbation de la demande:', err.message);
      alert("Erreur lors de l'approbation : " + err.message);
      return false;
    }
  };

  const rejectRequest = async (request: AppointmentRequest): Promise<boolean> => {
    try {
      const { error } = await supabase
        .from('appointments')
        .update({
          statut: 'Annulé',
          notes_seance: `Demande refusée / annulée par le secrétariat - ${request.motif || ''}`
        })
        .eq('id', request.id);

      if (error) throw error;

      setRequests(prev => prev.filter(r => r.id !== request.id));
      prevCountRef.current = Math.max(0, prevCountRef.current - 1);
      return true;
    } catch (err: any) {
      console.error('Erreur lors du refus de la demande:', err.message);
      alert("Erreur lors de l'annulation : " + err.message);
      return false;
    }
  };

  const clearLatestNotification = () => {
    setLatestNotification(null);
  };

  return (
    <AppointmentNotificationsContext.Provider
      value={{
        requests,
        pendingCount: requests.length,
        loading,
        soundEnabled,
        setSoundEnabled,
        refreshRequests,
        approveRequest,
        rejectRequest,
        latestNotification,
        clearLatestNotification
      }}
    >
      {children}
    </AppointmentNotificationsContext.Provider>
  );
}

export function useAppointmentNotifications() {
  const context = useContext(AppointmentNotificationsContext);
  if (!context) {
    throw new Error('useAppointmentNotifications must be used within an AppointmentNotificationsProvider');
  }
  return context;
}
