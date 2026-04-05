export const mockPatients = [
  {
    id: '1',
    nom: 'Martin',
    prenom: 'Sophie',
    date_naissance: '1985-04-12',
    tel: '06 12 34 56 78',
    email: 'sophie.martin@email.com',
    notes_antecedents: 'Entorse cheville droite en 2020. Pas d\'allergies connues.',
    active_treatment: {
      motif: 'Rééducation post-opératoire LCA genou gauche',
      seances_prescrites: 20,
      seances_effectuees: 8,
    }
  },
  {
    id: '2',
    nom: 'Dubois',
    prenom: 'Thomas',
    date_naissance: '1992-08-25',
    tel: '06 98 76 54 32',
    email: 't.dubois@email.com',
    notes_antecedents: 'Asthme léger.',
    active_treatment: {
      motif: 'Lombalgie chronique',
      seances_prescrites: 15,
      seances_effectuees: 12,
    }
  },
  {
    id: '3',
    nom: 'Leroy',
    prenom: 'Marie',
    date_naissance: '1960-11-03',
    tel: '07 11 22 33 44',
    email: 'marie.leroy@email.com',
    notes_antecedents: 'Hypertension traitée. Prothèse hanche droite (2018).',
    active_treatment: {
      motif: 'Arthrose cervicale',
      seances_prescrites: 10,
      seances_effectuees: 2,
    }
  }
];

export const mockAppointments = [
  {
    id: '1',
    patient_id: '1',
    patient_name: 'Sophie Martin',
    date_heure: new Date(new Date().setHours(9, 0, 0, 0)).toISOString(),
    duree: 30,
    statut: 'Confirmé',
    motif: 'Rééducation LCA'
  },
  {
    id: '2',
    patient_id: '2',
    patient_name: 'Thomas Dubois',
    date_heure: new Date(new Date().setHours(10, 30, 0, 0)).toISOString(),
    duree: 30,
    statut: 'Effectué',
    motif: 'Lombalgie'
  },
  {
    id: '3',
    patient_id: '3',
    patient_name: 'Marie Leroy',
    date_heure: new Date(new Date().setHours(14, 0, 0, 0)).toISOString(),
    duree: 30,
    statut: 'Confirmé',
    motif: 'Arthrose cervicale'
  },
  {
    id: '4',
    patient_id: '1',
    patient_name: 'Sophie Martin',
    date_heure: new Date(new Date(new Date().setDate(new Date().getDate() + 1)).setHours(11, 0, 0, 0)).toISOString(),
    duree: 30,
    statut: 'Confirmé',
    motif: 'Rééducation LCA'
  }
];

export const mockRevenueData = [
  { name: 'Jan', total: 4200 },
  { name: 'Fév', total: 4800 },
  { name: 'Mar', total: 5100 },
  { name: 'Avr', total: 4600 },
  { name: 'Mai', total: 5400 },
  { name: 'Juin', total: 5800 },
];
