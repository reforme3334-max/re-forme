export interface SelectPatientEventDetail {
  patientId: string;
  fromRoute: string;
}

export const SELECT_PATIENT_EVENT = 'reforme-select-patient';

export function resolveCurrentReturnRoute(explicitFromRoute?: string): string {
  if (explicitFromRoute && explicitFromRoute !== 'patient-detail') {
    return explicitFromRoute;
  }
  if (typeof window !== 'undefined') {
    const currentHash = window.location.hash.replace(/^#/, '');
    if (
      currentHash &&
      currentHash !== 'patient-detail' &&
      currentHash !== 'login' &&
      currentHash !== 'espace-patient'
    ) {
      return currentHash;
    }
    try {
      const saved = sessionStorage.getItem('reforme_patient_return_route');
      if (saved && saved !== 'patient-detail') {
        return saved;
      }
    } catch {}
  }
  return 'patients';
}

export function openPatientDossier(patientId?: string | null, fromRoute?: string): void {
  if (!patientId) return;
  const origin = resolveCurrentReturnRoute(fromRoute);
  try {
    sessionStorage.setItem('reforme_patient_return_route', origin);
    localStorage.setItem('reforme_preview_patient_id', patientId);
  } catch {}
  if (typeof window !== 'undefined') {
    window.dispatchEvent(
      new CustomEvent<SelectPatientEventDetail>(SELECT_PATIENT_EVENT, {
        detail: { patientId, fromRoute: origin },
      })
    );
    window.location.hash = 'patient-detail';
  }
}
