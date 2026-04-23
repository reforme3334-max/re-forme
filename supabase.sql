-- Script d'initialisation Supabase pour Re Forme Center

-- Activer l'extension UUID
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Table des patients
CREATE TABLE patients (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    nom VARCHAR(100) NOT NULL,
    prenom VARCHAR(100) NOT NULL,
    date_naissance DATE,
    tel VARCHAR(20),
    email VARCHAR(255),
    notes_antecedents TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW())
);

-- Table des traitements (ordonnances/motifs de consultation)
CREATE TABLE treatments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    patient_id UUID REFERENCES patients(id) ON DELETE CASCADE,
    motif VARCHAR(255) NOT NULL,
    nombre_seances_prescrites INTEGER NOT NULL DEFAULT 0,
    date_debut DATE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW())
);

CREATE TABLE therapists (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    nom VARCHAR(100) NOT NULL,
    prenom VARCHAR(100) NOT NULL,
    specialite VARCHAR(100),
    email VARCHAR(255),
    tel VARCHAR(20),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW())
);

-- Table des profils (étendu pour les rôles et permissions)
CREATE TABLE profiles (
    id UUID PRIMARY KEY REFERENCES auth.users ON DELETE CASCADE,
    role VARCHAR(20) DEFAULT 'therapeute',
    permissions TEXT[] DEFAULT '{}',
    email VARCHAR(255),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW())
);

-- Table des rendez-vous
CREATE TYPE appointment_status AS ENUM ('Confirmé', 'Effectué', 'Annulé', 'Impayé');

CREATE TABLE appointments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    patient_id UUID REFERENCES patients(id) ON DELETE CASCADE,
    treatment_id UUID REFERENCES treatments(id) ON DELETE SET NULL,
    therapist_id UUID REFERENCES therapists(id) ON DELETE SET NULL,
    date_heure TIMESTAMP WITH TIME ZONE NOT NULL,
    duree INTEGER NOT NULL DEFAULT 30, -- durée en minutes
    statut appointment_status DEFAULT 'Confirmé',
    notes_seance TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW())
);

-- Table pour la facturation (simplifiée)
CREATE TYPE payment_status AS ENUM ('En attente', 'Payé', 'Rejeté');
CREATE TYPE payment_type AS ENUM ('Tiers-payant', 'Hors nomenclature', 'Mutuelle', 'Patient');

CREATE TABLE billings (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    patient_id UUID REFERENCES patients(id) ON DELETE CASCADE,
    appointment_id UUID REFERENCES appointments(id) ON DELETE SET NULL,
    montant DECIMAL(10, 2) NOT NULL,
    type_paiement payment_type NOT NULL,
    statut payment_status DEFAULT 'En attente',
    date_facturation TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW())
);

-- Index pour optimiser les requêtes fréquentes
CREATE INDEX idx_appointments_date ON appointments(date_heure);
CREATE INDEX idx_appointments_patient ON appointments(patient_id);
CREATE INDEX idx_treatments_patient ON treatments(patient_id);
CREATE INDEX idx_billings_patient ON billings(patient_id);

-- Politiques de sécurité RLS (Row Level Security)
-- Pour le développement sans authentification, on autorise l'accès anonyme (anon)
ALTER TABLE patients ENABLE ROW LEVEL SECURITY;
ALTER TABLE treatments ENABLE ROW LEVEL SECURITY;
ALTER TABLE therapists ENABLE ROW LEVEL SECURITY;
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE appointments ENABLE ROW LEVEL SECURITY;
ALTER TABLE billings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow public full access to patients" ON patients FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow public full access to treatments" ON treatments FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow public full access to therapists" ON therapists FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow public full access to profiles" ON profiles FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow public full access to appointments" ON appointments FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow public full access to billings" ON billings FOR ALL USING (true) WITH CHECK (true);
