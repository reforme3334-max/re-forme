import React, { useState, useEffect, useRef } from 'react';
import {
  FileText,
  Calendar,
  Upload,
  Trash2,
  Download,
  RotateCcw,
  Save,
  CheckCircle2,
  AlertCircle,
  LayoutTemplate,
  PanelTop,
  PanelBottom,
  Printer,
} from 'lucide-react';
import { supabase } from '../../lib/supabaseClient';
import { Button } from '../ui/button';
import {
  DocumentTemplatesConfig,
  DEFAULT_DOCUMENT_TEMPLATES,
  COLORLESS_ACCENT,
  isColorlessAccent,
  fetchDocumentTemplates,
  saveDocumentTemplates,
  resizeLogoToDataUrl,
  exportPatientInvoicePDF,
  exportCareCalendarPDF,
  formatInvoiceReference,
  HeaderLayoutStyle,
  TableVisualTheme,
  PageFormat,
  PageOrientation,
  MarginPreset,
  PdfFontFamily,
  InvoiceReferenceFormat,
} from '../../lib/documentTemplates';

interface ThemePaletteItem {
  hex: string;
  label: string;
  isColorless?: boolean;
  swatchBg: string;
  accentText: string;
  accentBg: string;
  accentBorder: string;
  softBg: string;
}

const ACCENT_PALETTE: ThemePaletteItem[] = [
  {
    hex: COLORLESS_ACCENT,
    label: 'Incolore (Sans couleur)',
    isColorless: true,
    swatchBg: 'bg-white border border-slate-400',
    accentText: 'text-slate-900',
    accentBg: 'bg-white',
    accentBorder: 'border-slate-900',
    softBg: 'bg-white',
  },
  {
    hex: '#0d9488',
    label: 'Teal ReForme',
    swatchBg: 'bg-teal-600',
    accentText: 'text-teal-700',
    accentBg: 'bg-teal-600',
    accentBorder: 'border-teal-600',
    softBg: 'bg-teal-50/60',
  },
  {
    hex: '#1e293b',
    label: 'Ardoise Classique',
    swatchBg: 'bg-slate-800',
    accentText: 'text-slate-800',
    accentBg: 'bg-slate-800',
    accentBorder: 'border-slate-800',
    softBg: 'bg-slate-100/80',
  },
  {
    hex: '#2563eb',
    label: 'Bleu Médical',
    swatchBg: 'bg-blue-600',
    accentText: 'text-blue-700',
    accentBg: 'bg-blue-600',
    accentBorder: 'border-blue-600',
    softBg: 'bg-blue-50/60',
  },
  {
    hex: '#4f46e5',
    label: 'Indigo Cabinet',
    swatchBg: 'bg-indigo-600',
    accentText: 'text-indigo-700',
    accentBg: 'bg-indigo-600',
    accentBorder: 'border-indigo-600',
    softBg: 'bg-indigo-50/60',
  },
  {
    hex: '#059669',
    label: 'Émeraude Santé',
    swatchBg: 'bg-emerald-600',
    accentText: 'text-emerald-700',
    accentBg: 'bg-emerald-600',
    accentBorder: 'border-emerald-600',
    softBg: 'bg-emerald-50/60',
  },
  {
    hex: '#be123c',
    label: 'Bordeaux',
    swatchBg: 'bg-rose-700',
    accentText: 'text-rose-700',
    accentBg: 'bg-rose-700',
    accentBorder: 'border-rose-700',
    softBg: 'bg-rose-50/60',
  },
  {
    hex: '#b45309',
    label: 'Ambre Doré',
    swatchBg: 'bg-amber-700',
    accentText: 'text-amber-700',
    accentBg: 'bg-amber-700',
    accentBorder: 'border-amber-700',
    softBg: 'bg-amber-50/60',
  },
];

function getPaletteForHex(hex: string): ThemePaletteItem {
  if (isColorlessAccent(hex)) {
    return ACCENT_PALETTE.find((p) => p.isColorless) || ACCENT_PALETTE[0];
  }
  const lower = (hex || '').toLowerCase();
  return (
    ACCENT_PALETTE.find((p) => !p.isColorless && p.hex.toLowerCase() === lower) ||
    ACCENT_PALETTE.find((p) => p.hex === '#0d9488') ||
    ACCENT_PALETTE[0]
  );
}

function getHeaderBlankHeightClass(mm: number): string {
  if (mm <= 15) return 'h-8';
  if (mm <= 25) return 'h-12';
  if (mm <= 35) return 'h-16';
  if (mm <= 45) return 'h-20';
  return 'h-24';
}

function getFooterBlankHeightClass(mm: number): string {
  if (mm <= 15) return 'h-8';
  if (mm <= 25) return 'h-12';
  if (mm <= 35) return 'h-16';
  return 'h-20';
}

export function DocumentTemplateEditor() {
  const [config, setConfig] = useState<DocumentTemplatesConfig>(() =>
    JSON.parse(JSON.stringify(DEFAULT_DOCUMENT_TEMPLATES))
  );
  const [editorSection, setEditorSection] = useState<'layout' | 'header' | 'footer'>('layout');
  const [previewDoc, setPreviewDoc] = useState<'invoice' | 'calendar'>('invoice');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);
  const [feedback, setFeedback] = useState<{ type: '' | 'success' | 'error'; text: string }>({
    type: '',
    text: '',
  });

  const logoInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let active = true;
    fetchDocumentTemplates(supabase)
      .then((loaded) => {
        if (active) setConfig(loaded);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const showToast = (type: 'success' | 'error', text: string) => {
    setFeedback({ type, text });
    if (type === 'success') {
      setTimeout(() => {
        setFeedback((prev) => (prev.text === text ? { type: '', text: '' } : prev));
      }, 4000);
    }
  };

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const dataUrl = await resizeLogoToDataUrl(file);
      setConfig((prev) => ({
        ...prev,
        header: {
          ...prev.header,
          logoDataUrl: dataUrl,
          showLogo: true,
        },
      }));
      showToast('success', 'Logo importé dans l’aperçu. Cliquez sur Enregistrer pour valider.');
    } catch (err: any) {
      showToast('error', err.message || 'Impossible de charger ce logo.');
    } finally {
      if (logoInputRef.current) logoInputRef.current.value = '';
    }
  };

  const handleSave = async () => {
    setSaving(true);
    setConfirmReset(false);
    try {
      const saved = await saveDocumentTemplates(supabase, config);
      setConfig(saved);
      showToast(
        'success',
        'Mise en page enregistrée. Toutes vos prochaines factures et calendriers de soins utiliseront ce modèle.'
      );
    } catch (err: any) {
      showToast('error', err.message || 'Erreur lors de la sauvegarde de la mise en page.');
    } finally {
      setSaving(false);
    }
  };

  const handleResetDefaults = async () => {
    const defaults: DocumentTemplatesConfig = JSON.parse(
      JSON.stringify(DEFAULT_DOCUMENT_TEMPLATES)
    );
    setConfig(defaults);
    setConfirmReset(false);
    setSaving(true);
    try {
      await saveDocumentTemplates(supabase, defaults);
      showToast('success', 'Modèle restauré aux valeurs par défaut.');
    } catch (err: any) {
      showToast('error', err.message || 'Erreur lors de la réinitialisation.');
    } finally {
      setSaving(false);
    }
  };

  const handleDownloadSamplePdf = () => {
    const demoPatient = {
      nom: 'ALAOUI',
      prenom: 'Karim',
      telephone: '06 61 23 45 67',
      email: 'karim.alaoui@exemple.ma',
      cin: 'JB123456',
      pathologie: 'Rééducation entorse cheville',
      nombre_seances: 10,
      atcd: '[[MUTUELLE:OUI|CNOPS]]',
    };

    if (previewDoc === 'invoice') {
      exportPatientInvoicePDF(config, {
        patient: demoPatient,
        invoiceNumber: formatInvoiceReference(config),
        billings: [
          {
            id: 'demo-1',
            montant: 200,
            type_paiement: 'Mutuelle',
            statut: 'Payé',
            date_facturation: '2026-10-20T10:00:00Z',
            appointments: { date_heure: '2026-10-20T10:00:00' },
          },
          {
            id: 'demo-2',
            montant: 200,
            type_paiement: 'Mutuelle',
            statut: 'Payé',
            date_facturation: '2026-10-24T10:00:00Z',
            appointments: { date_heure: '2026-10-24T10:00:00' },
          },
          {
            id: 'demo-3',
            montant: 200,
            type_paiement: 'Patient',
            statut: 'En attente',
            date_facturation: '2026-10-28T10:00:00Z',
            appointments: { date_heure: '2026-10-28T10:00:00' },
          },
        ],
      });
    } else {
      exportCareCalendarPDF(config, {
        patient: demoPatient,
        treatments: [
          {
            statut: 'En cours',
            motif: 'Rééducation entorse cheville droite',
            nombre_seances_prescrites: 10,
            medecin_prescripteur: 'Dr BENNANI',
          },
        ],
        appointments: [
          {
            id: 's1',
            date_heure: '2026-10-20T10:00:00',
            statut: 'Effectué',
            notes_seance: 'Bilan initial & physiothérapie antalgique',
          },
          {
            id: 's2',
            date_heure: '2026-10-24T10:30:00',
            statut: 'Effectué',
            notes_seance: 'Mobilisation articulaire & proprioception',
          },
          {
            id: 's3',
            date_heure: '2026-10-28T11:00:00',
            statut: 'Effectué',
            notes_seance: 'Renforcement musculaire progressif',
          },
          {
            id: 's4',
            date_heure: '2026-11-04T10:00:00',
            statut: 'Confirmé',
            notes_seance: 'Réathlétisation fonctionnelle',
          },
        ],
      });
    }
  };

  const isA5 = (config.layout.pageFormat || 'a5') === 'a5';
  const isColorless = isColorlessAccent(config.layout.accentColor);
  const palette = getPaletteForHex(config.layout.accentColor);
  const previewPaddingClass = isA5
    ? config.layout.marginSize === 'compact'
      ? 'p-3'
      : config.layout.marginSize === 'large'
        ? 'p-5'
        : 'p-4'
    : config.layout.marginSize === 'compact'
      ? 'p-4'
      : config.layout.marginSize === 'large'
        ? 'p-8'
        : 'p-6';
  const previewFontClass =
    config.layout.fontFamily === 'times'
      ? 'font-serif'
      : config.layout.fontFamily === 'courier'
        ? 'font-mono'
        : 'font-sans';

  const contactLine = [
    config.header.address?.trim(),
    config.header.phone?.trim() ? `Tél : ${config.header.phone.trim()}` : '',
    config.header.email?.trim(),
    config.header.iceOrInpe?.trim(),
  ]
    .filter(Boolean)
    .join(' · ');

  const previewInvoiceRef = formatInvoiceReference(config);
  const showPreviewInvoiceRef = config.invoice.showReference !== false && Boolean(previewInvoiceRef);

  if (loading) {
    return (
      <div className="bg-white rounded-2xl border border-slate-200 p-8 space-y-4">
        <div className="h-6 w-64 bg-slate-100 rounded animate-pulse" />
        <div className="h-4 w-96 bg-slate-100 rounded animate-pulse" />
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 pt-4">
          <div className="h-96 bg-slate-50 rounded-xl border border-slate-100 animate-pulse" />
          <div className="h-96 bg-slate-50 rounded-xl border border-slate-100 animate-pulse" />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Top Toolbar */}
      <div className="bg-white rounded-2xl border border-slate-200 p-5 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        <div>
          <h2 className="text-lg font-bold text-slate-900">
            Mise en page des Factures & Calendrier de Soins
          </h2>
          <p className="text-sm text-slate-500 mt-0.5">
            Personnalisez l'en-tête, la présentation des tableaux et le bas de page de vos documents PDF et Excel.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5 shrink-0">
          <Button
            type="button"
            variant="outline"
            onClick={handleDownloadSamplePdf}
            className="gap-2 whitespace-nowrap shrink-0"
          >
            <Download className="h-4 w-4" />
            Tester le PDF ({previewDoc === 'invoice' ? 'Facture' : 'Calendrier'})
          </Button>

          {!confirmReset ? (
            <Button
              type="button"
              variant="outline"
              onClick={() => setConfirmReset(true)}
              className="gap-1.5 text-slate-600 whitespace-nowrap shrink-0"
            >
              <RotateCcw className="h-4 w-4" />
              Par défaut
            </Button>
          ) : (
            <div className="flex items-center gap-1.5">
              <Button
                type="button"
                variant="outline"
                onClick={handleResetDefaults}
                disabled={saving}
                className="text-rose-600 border-rose-200 hover:bg-rose-50 whitespace-nowrap shrink-0"
              >
                Confirmer réinitialisation
              </Button>
              <Button
                type="button"
                variant="ghost"
                onClick={() => setConfirmReset(false)}
                className="text-slate-500 whitespace-nowrap shrink-0"
              >
                Annuler
              </Button>
            </div>
          )}

          <Button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="gap-2 whitespace-nowrap shrink-0"
          >
            <Save className="h-4 w-4" />
            {saving ? 'Enregistrement...' : 'Enregistrer le modèle'}
          </Button>
        </div>
      </div>

      {feedback.text && (
        <div
          className={`p-4 rounded-xl border text-sm flex items-center gap-2.5 ${
            feedback.type === 'success'
              ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
              : 'bg-rose-50 border-rose-200 text-rose-800'
          }`}
        >
          {feedback.type === 'success' ? (
            <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />
          ) : (
            <AlertCircle className="h-4 w-4 shrink-0 text-rose-600" />
          )}
          <span className="font-medium">{feedback.text}</span>
        </div>
      )}

      {/* Main 2-column Workspace: Left Controls + Right Live A4 Preview */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">
        {/* LEFT COLUMN : CONTROLS */}
        <div className="xl:col-span-6 bg-white rounded-2xl border border-slate-200 overflow-hidden">
          {/* Segmented Section Tabs */}
          <div className="p-2 bg-slate-50 border-b border-slate-200 grid grid-cols-3 gap-1">
            <button
              type="button"
              onClick={() => setEditorSection('layout')}
              className={`flex items-center justify-center gap-2 py-2.5 px-3 rounded-xl text-xs sm:text-sm font-semibold transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                editorSection === 'layout'
                  ? 'bg-white text-slate-900 shadow-xs border border-slate-200/80'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <LayoutTemplate className="h-4 w-4" />
              Mise en page
            </button>
            <button
              type="button"
              onClick={() => setEditorSection('header')}
              className={`flex items-center justify-center gap-2 py-2.5 px-3 rounded-xl text-xs sm:text-sm font-semibold transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                editorSection === 'header'
                  ? 'bg-white text-slate-900 shadow-xs border border-slate-200/80'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <PanelTop className="h-4 w-4" />
              En-tête
            </button>
            <button
              type="button"
              onClick={() => setEditorSection('footer')}
              className={`flex items-center justify-center gap-2 py-2.5 px-3 rounded-xl text-xs sm:text-sm font-semibold transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                editorSection === 'footer'
                  ? 'bg-white text-slate-900 shadow-xs border border-slate-200/80'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <PanelBottom className="h-4 w-4" />
              Bas de page
            </button>
          </div>

          <div className="p-5 sm:p-6 space-y-6">
            {/* ============================================================ */}
            {/* SECTION 1 : MISE EN PAGE                                     */}
            {/* ============================================================ */}
            {editorSection === 'layout' && (
              <div className="space-y-6">
                {/* Format du papier d'impression (A5 / A4) */}
                <div className="space-y-2.5">
                  <label className="block text-sm font-semibold text-slate-800">
                    Format du papier d'impression
                  </label>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    {(
                      [
                        {
                          id: 'a5',
                          title: 'Format A5 (148 × 210 mm)',
                          desc: 'Impression cabinet / demi-feuille A4',
                        },
                        {
                          id: 'a4',
                          title: 'Format A4 (210 × 297 mm)',
                          desc: 'Feuille standard grand format',
                        },
                      ] as { id: PageFormat; title: string; desc: string }[]
                    ).map((fmt) => {
                      const active = (config.layout.pageFormat || 'a5') === fmt.id;
                      return (
                        <button
                          key={fmt.id}
                          type="button"
                          onClick={() =>
                            setConfig((prev) => ({
                              ...prev,
                              layout: { ...prev.layout, pageFormat: fmt.id },
                            }))
                          }
                          className={`p-3 rounded-xl border text-left transition-colors cursor-pointer ${
                            active
                              ? 'border-primary-600 bg-primary-50/40'
                              : 'border-slate-200 hover:border-slate-300 bg-white'
                          }`}
                        >
                          <div className="text-xs font-bold text-slate-900">{fmt.title}</div>
                          <div className="text-[11px] text-slate-500 mt-0.5">{fmt.desc}</div>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Papier pré-imprimé (Annuler en-tête et/ou bas de page) */}
                <div className="p-4 rounded-xl border border-slate-200 bg-slate-50/60 space-y-3.5">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="flex items-start gap-2.5">
                      <Printer className="h-4 w-4 text-teal-600 mt-0.5 shrink-0" />
                      <div>
                        <div className="text-sm font-semibold text-slate-900">
                          Papier à en-tête pré-imprimé ({isA5 ? 'A5' : 'A4'})
                        </div>
                        <p className="text-xs text-slate-500">
                          Désactivez l'en-tête et/ou le bas de page si vos feuilles portent déjà vos coordonnées imprimées.
                        </p>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => {
                        const bothHidden =
                          config.header.showHeader === false &&
                          config.footer.showFooter === false;
                        setConfig((prev) => ({
                          ...prev,
                          header: { ...prev.header, showHeader: bothHidden },
                          footer: { ...prev.footer, showFooter: bothHidden },
                        }));
                      }}
                      className={`px-3 py-1.5 rounded-xl border text-xs font-semibold transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                        config.header.showHeader === false && config.footer.showFooter === false
                          ? 'bg-teal-600 border-teal-600 text-white'
                          : 'bg-white border-slate-200 text-slate-700 hover:border-slate-300'
                      }`}
                    >
                      {config.header.showHeader === false && config.footer.showFooter === false
                        ? 'Mode pré-imprimé actif'
                        : 'Tout masquer (Pré-imprimé)'}
                    </button>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="bg-white rounded-xl border border-slate-200 p-3 space-y-2.5">
                      <label className="flex items-center justify-between gap-2 cursor-pointer">
                        <span className="text-xs font-semibold text-slate-800">
                          Imprimer l'en-tête
                        </span>
                        <input
                          type="checkbox"
                          checked={config.header.showHeader !== false}
                          onChange={(e) =>
                            setConfig((prev) => ({
                              ...prev,
                              header: { ...prev.header, showHeader: e.target.checked },
                            }))
                          }
                          className="h-4 w-4 rounded accent-teal-600"
                        />
                      </label>
                      {config.header.showHeader === false && (
                        <div className="space-y-1 pt-1 border-t border-slate-100">
                          <label className="block text-[11px] font-medium text-slate-500">
                            Espace haut réservé au papier pré-imprimé
                          </label>
                          <select
                            value={config.header.headerBlankSpaceMm || (isA5 ? 25 : 35)}
                            onChange={(e) =>
                              setConfig((prev) => ({
                                ...prev,
                                header: {
                                  ...prev.header,
                                  headerBlankSpaceMm: Number(e.target.value),
                                },
                              }))
                            }
                            className="w-full px-2.5 py-1.5 border border-slate-200 rounded-lg text-xs bg-white outline-none focus:border-primary-500 tabular-nums"
                          >
                            <option value={15}>15 mm (Petit en-tête)</option>
                            <option value={20}>20 mm (Compact A5)</option>
                            <option value={25}>25 mm (Standard A5)</option>
                            <option value={30}>30 mm (Moyen)</option>
                            <option value={35}>35 mm (Standard A4)</option>
                            <option value={45}>45 mm (Grand en-tête)</option>
                            <option value={55}>55 mm (Très grand)</option>
                          </select>
                        </div>
                      )}
                    </div>

                    <div className="bg-white rounded-xl border border-slate-200 p-3 space-y-2.5">
                      <label className="flex items-center justify-between gap-2 cursor-pointer">
                        <span className="text-xs font-semibold text-slate-800">
                          Imprimer le bas de page
                        </span>
                        <input
                          type="checkbox"
                          checked={config.footer.showFooter !== false}
                          onChange={(e) =>
                            setConfig((prev) => ({
                              ...prev,
                              footer: { ...prev.footer, showFooter: e.target.checked },
                            }))
                          }
                          className="h-4 w-4 rounded accent-teal-600"
                        />
                      </label>
                      {config.footer.showFooter === false && (
                        <div className="space-y-1 pt-1 border-t border-slate-100">
                          <label className="block text-[11px] font-medium text-slate-500">
                            Espace bas réservé au papier pré-imprimé
                          </label>
                          <select
                            value={config.footer.footerBlankSpaceMm || (isA5 ? 18 : 25)}
                            onChange={(e) =>
                              setConfig((prev) => ({
                                ...prev,
                                footer: {
                                  ...prev.footer,
                                  footerBlankSpaceMm: Number(e.target.value),
                                },
                              }))
                            }
                            className="w-full px-2.5 py-1.5 border border-slate-200 rounded-lg text-xs bg-white outline-none focus:border-primary-500 tabular-nums"
                          >
                            <option value={12}>12 mm (Très compact)</option>
                            <option value={15}>15 mm (Petit pied)</option>
                            <option value={18}>18 mm (Standard A5)</option>
                            <option value={25}>25 mm (Standard A4)</option>
                            <option value={35}>35 mm (Grand pied)</option>
                            <option value={45}>45 mm (Très grand)</option>
                          </select>
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* Couleur principale */}
                <div className="space-y-2.5">
                  <label className="block text-sm font-semibold text-slate-800">
                    Couleur principale des documents
                  </label>
                  <div className="flex flex-wrap items-center gap-2.5">
                    {ACCENT_PALETTE.map((item) => {
                      const selected = item.isColorless
                        ? isColorless
                        : !isColorless &&
                          config.layout.accentColor.toLowerCase() === item.hex.toLowerCase();
                      return (
                        <button
                          key={item.hex}
                          type="button"
                          onClick={() =>
                            setConfig((prev) => ({
                              ...prev,
                              layout: { ...prev.layout, accentColor: item.hex },
                            }))
                          }
                          title={item.label}
                          className={`flex items-center gap-2 px-3 py-1.5 rounded-xl border text-xs font-medium transition-all cursor-pointer whitespace-nowrap shrink-0 ${
                            selected
                              ? 'border-slate-900 bg-slate-900 text-white'
                              : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300'
                          }`}
                        >
                          {item.isColorless ? (
                            <span className="relative h-3.5 w-3.5 rounded-full bg-white border border-slate-400 overflow-hidden shrink-0">
                              <span className="absolute top-1/2 -left-[20%] w-[140%] h-[1.5px] bg-slate-500 -translate-y-1/2 -rotate-45" />
                            </span>
                          ) : (
                            <span className={`h-3.5 w-3.5 rounded-full shrink-0 ${item.swatchBg}`} />
                          )}
                          <span>{item.label}</span>
                        </button>
                      );
                    })}
                  </div>
                  {isColorless && (
                    <p className="text-xs text-slate-500">
                      Mode incolore actif : vos factures, reçus et calendriers de soins sont générés sur fond blanc sans aplats colorés (économie d'encre).
                    </p>
                  )}
                </div>

                {/* Disposition de l'en-tête */}
                {config.header.showHeader !== false && (
                  <div className="space-y-2.5 pt-4 border-t border-slate-100">
                    <label className="block text-sm font-semibold text-slate-800">
                      Disposition de l'en-tête
                    </label>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                      {(
                        [
                          {
                            id: 'split',
                            title: 'Classique (2 colonnes)',
                            desc: 'Cabinet à gauche, réf. à droite',
                          },
                          {
                            id: 'centered',
                            title: 'Centré',
                            desc: 'Logo et coordonnées centrés',
                          },
                          {
                            id: 'banner',
                            title: isColorless ? 'Bandeau sobre' : 'Bandeau coloré',
                            desc: isColorless
                              ? 'En-tête pleine largeur sur fond blanc'
                              : 'En-tête plein avec contraste',
                          },
                        ] as { id: HeaderLayoutStyle; title: string; desc: string }[]
                      ).map((opt) => (
                        <button
                          key={opt.id}
                          type="button"
                          onClick={() =>
                            setConfig((prev) => ({
                              ...prev,
                              header: { ...prev.header, headerStyle: opt.id },
                            }))
                          }
                          className={`p-3 rounded-xl border text-left transition-colors cursor-pointer ${
                            config.header.headerStyle === opt.id
                              ? 'border-primary-600 bg-primary-50/40'
                              : 'border-slate-200 hover:border-slate-300 bg-white'
                          }`}
                        >
                          <div className="text-xs font-bold text-slate-900">{opt.title}</div>
                          <div className="text-[11px] text-slate-500 mt-0.5">{opt.desc}</div>
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Style du tableau, Orientation, Marges, Police */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-4 border-t border-slate-100">
                  <div className="space-y-1.5">
                    <label className="block text-xs font-semibold text-slate-700">
                      Style des tableaux
                    </label>
                    <select
                      value={config.layout.tableTheme}
                      onChange={(e) =>
                        setConfig((prev) => ({
                          ...prev,
                          layout: {
                            ...prev.layout,
                            tableTheme: e.target.value as TableVisualTheme,
                          },
                        }))
                      }
                      className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm bg-white outline-none focus:border-primary-500"
                    >
                      <option value="grid">Quadrillé complet (Mutuelle)</option>
                      <option value="striped">Lignes alternées modernes</option>
                      <option value="plain">Épuré minimaliste</option>
                    </select>
                  </div>

                  <div className="space-y-1.5">
                    <label className="block text-xs font-semibold text-slate-700">
                      Orientation ({isA5 ? 'A5' : 'A4'})
                    </label>
                    <select
                      value={config.layout.orientation}
                      onChange={(e) =>
                        setConfig((prev) => ({
                          ...prev,
                          layout: {
                            ...prev.layout,
                            orientation: e.target.value as PageOrientation,
                          },
                        }))
                      }
                      className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm bg-white outline-none focus:border-primary-500"
                    >
                      <option value="portrait">Portrait (Vertical)</option>
                      <option value="landscape">Paysage (Horizontal)</option>
                    </select>
                  </div>

                  <div className="space-y-1.5">
                    <label className="block text-xs font-semibold text-slate-700">
                      Marges de la page
                    </label>
                    <select
                      value={config.layout.marginSize}
                      onChange={(e) =>
                        setConfig((prev) => ({
                          ...prev,
                          layout: {
                            ...prev.layout,
                            marginSize: e.target.value as MarginPreset,
                          },
                        }))
                      }
                      className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm bg-white outline-none focus:border-primary-500"
                    >
                      <option value="compact">
                        Compactes ({isA5 ? '8 mm' : '12 mm'})
                      </option>
                      <option value="normal">
                        Standard ({isA5 ? '10 mm' : '16 mm'})
                      </option>
                      <option value="large">
                        Larges / Aérées ({isA5 ? '14 mm' : '22 mm'})
                      </option>
                    </select>
                  </div>

                  <div className="space-y-1.5">
                    <label className="block text-xs font-semibold text-slate-700">
                      Police du document PDF
                    </label>
                    <select
                      value={config.layout.fontFamily}
                      onChange={(e) =>
                        setConfig((prev) => ({
                          ...prev,
                          layout: {
                            ...prev.layout,
                            fontFamily: e.target.value as PdfFontFamily,
                          },
                        }))
                      }
                      className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm bg-white outline-none focus:border-primary-500"
                    >
                      <option value="helvetica">Sans-serif moderne</option>
                      <option value="times">Classique (Serif)</option>
                      <option value="courier">Monospace tabulaire</option>
                    </select>
                  </div>
                </div>

                {/* Contenu des colonnes : Factures vs Calendrier de soins */}
                <div className="pt-4 border-t border-slate-100 space-y-4">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-semibold text-slate-800">
                      Options d'affichage du contenu
                    </span>
                    <div className="inline-flex p-1 bg-slate-100 rounded-lg gap-1">
                      <button
                        type="button"
                        onClick={() => setPreviewDoc('invoice')}
                        className={`px-2.5 py-1 rounded-md text-xs font-semibold transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                          previewDoc === 'invoice'
                            ? 'bg-white text-slate-900 shadow-xs'
                            : 'text-slate-600 hover:text-slate-900'
                        }`}
                      >
                        Factures
                      </button>
                      <button
                        type="button"
                        onClick={() => setPreviewDoc('calendar')}
                        className={`px-2.5 py-1 rounded-md text-xs font-semibold transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                          previewDoc === 'calendar'
                            ? 'bg-white text-slate-900 shadow-xs'
                            : 'text-slate-600 hover:text-slate-900'
                        }`}
                      >
                        Calendrier de soins
                      </button>
                    </div>
                  </div>

                  {previewDoc === 'invoice' ? (
                    <div className="space-y-3">
                      <label className="flex items-center justify-between gap-3 p-3 rounded-xl border border-slate-200 cursor-pointer hover:bg-slate-50/70">
                        <div>
                          <div className="text-sm font-medium text-slate-800">
                            Détail séance par séance
                          </div>
                          <div className="text-xs text-slate-500">
                            Liste chaque date de séance sur la facture plutôt qu'une ligne groupée
                          </div>
                        </div>
                        <input
                          type="checkbox"
                          checked={config.invoice.showSessionDetails}
                          onChange={(e) =>
                            setConfig((prev) => ({
                              ...prev,
                              invoice: { ...prev.invoice, showSessionDetails: e.target.checked },
                            }))
                          }
                          className="h-4 w-4 rounded accent-teal-600"
                        />
                      </label>

                      <label className="flex items-center justify-between gap-3 p-3 rounded-xl border border-slate-200 cursor-pointer hover:bg-slate-50/70">
                        <div>
                          <div className="text-sm font-medium text-slate-800">
                            Afficher CIN, Mutuelle & Club conventionné
                          </div>
                          <div className="text-xs text-slate-500">
                            Ajoute les informations administratives du patient dans l'encadré client
                          </div>
                        </div>
                        <input
                          type="checkbox"
                          checked={config.invoice.showPatientMeta}
                          onChange={(e) =>
                            setConfig((prev) => ({
                              ...prev,
                              invoice: { ...prev.invoice, showPatientMeta: e.target.checked },
                            }))
                          }
                          className="h-4 w-4 rounded accent-teal-600"
                        />
                      </label>

                      <label className="flex items-center justify-between gap-3 p-3 rounded-xl border border-slate-200 cursor-pointer hover:bg-slate-50/70">
                        <div>
                          <div className="text-sm font-medium text-slate-800">
                            Afficher le solde « Reste à payer »
                          </div>
                          <div className="text-xs text-slate-500">
                            Mentionne les séances non encore réglées dans le récapitulatif
                          </div>
                        </div>
                        <input
                          type="checkbox"
                          checked={config.invoice.showUnpaidBalance}
                          onChange={(e) =>
                            setConfig((prev) => ({
                              ...prev,
                              invoice: { ...prev.invoice, showUnpaidBalance: e.target.checked },
                            }))
                          }
                          className="h-4 w-4 rounded accent-teal-600"
                        />
                      </label>

                      {/* Personnalisation de la Référence des Factures */}
                      <div className="p-4 rounded-xl border border-slate-200 bg-slate-50/60 space-y-3.5">
                        <label className="flex items-center justify-between gap-3 cursor-pointer">
                          <div>
                            <div className="text-sm font-semibold text-slate-900">
                              Référence & Numérotation des factures
                            </div>
                            <div className="text-xs text-slate-500">
                              Personnalisez la structure par défaut de la mention « Réf : ... » (modifiable aussi sur chaque facture)
                            </div>
                          </div>
                          <input
                            type="checkbox"
                            checked={config.invoice.showReference !== false}
                            onChange={(e) =>
                              setConfig((prev) => ({
                                ...prev,
                                invoice: { ...prev.invoice, showReference: e.target.checked },
                              }))
                            }
                            className="h-4 w-4 rounded accent-teal-600"
                          />
                        </label>

                        {config.invoice.showReference !== false && (
                          <div className="space-y-3 pt-2 border-t border-slate-200/80">
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                              <div className="space-y-1">
                                <label className="block text-xs font-semibold text-slate-700">
                                  Format de la référence
                                </label>
                                <select
                                  value={config.invoice.referenceFormat || 'prefix-year-seq'}
                                  onChange={(e) =>
                                    setConfig((prev) => ({
                                      ...prev,
                                      invoice: {
                                        ...prev.invoice,
                                        referenceFormat: e.target.value as InvoiceReferenceFormat,
                                      },
                                    }))
                                  }
                                  className="w-full px-3 py-2 border border-slate-200 rounded-xl text-xs bg-white outline-none focus:border-primary-500 font-medium"
                                >
                                  <option value="prefix-year-seq">
                                    Préfixe - Année - N° (ex: FAC-2026-0001)
                                  </option>
                                  <option value="prefix-slash-year-seq">
                                    Préfixe / Année / N° (ex: FAC/2026/0001)
                                  </option>
                                  <option value="prefix-year-month-seq">
                                    Préfixe - Année - Mois - N° (ex: FAC-2026-11-0001)
                                  </option>
                                  <option value="year-seq">
                                    Année - N° sans préfixe (ex: 2026-0001)
                                  </option>
                                  <option value="prefix-seq">
                                    Préfixe - N° court (ex: FAC-0001)
                                  </option>
                                  <option value="custom">Format libre personnalisé</option>
                                </select>
                              </div>

                              <div className="space-y-1">
                                <label className="block text-xs font-semibold text-slate-700">
                                  Préfixe (ex: FAC, FACT, RF)
                                </label>
                                <input
                                  type="text"
                                  value={config.invoice.referencePrefix}
                                  onChange={(e) =>
                                    setConfig((prev) => ({
                                      ...prev,
                                      invoice: {
                                        ...prev.invoice,
                                        referencePrefix: e.target.value,
                                      },
                                    }))
                                  }
                                  placeholder="FAC"
                                  className="w-full px-3 py-2 border border-slate-200 rounded-xl text-xs font-mono bg-white outline-none focus:border-primary-500"
                                />
                              </div>
                            </div>

                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                              <div className="space-y-1">
                                <label className="block text-xs font-semibold text-slate-700">
                                  Prochain numéro (Compteur)
                                </label>
                                <input
                                  type="number"
                                  min={1}
                                  step={1}
                                  onWheel={(e) => e.currentTarget.blur()}
                                  value={config.invoice.nextSequenceNumber ?? 1}
                                  onChange={(e) =>
                                    setConfig((prev) => ({
                                      ...prev,
                                      invoice: {
                                        ...prev.invoice,
                                        nextSequenceNumber: Math.max(
                                          1,
                                          Math.floor(Number(e.target.value) || 1)
                                        ),
                                      },
                                    }))
                                  }
                                  className="w-full px-3 py-2 border border-slate-200 rounded-xl text-xs font-mono bg-white outline-none focus:border-primary-500 tabular-nums"
                                />
                              </div>

                              <div className="space-y-1">
                                <label className="block text-xs font-semibold text-slate-700">
                                  Formatage des chiffres
                                </label>
                                <select
                                  value={config.invoice.sequencePadding ?? 4}
                                  onChange={(e) =>
                                    setConfig((prev) => ({
                                      ...prev,
                                      invoice: {
                                        ...prev.invoice,
                                        sequencePadding: Number(e.target.value),
                                      },
                                    }))
                                  }
                                  className="w-full px-3 py-2 border border-slate-200 rounded-xl text-xs bg-white outline-none focus:border-primary-500 tabular-nums"
                                >
                                  <option value={1}>Sans zéros (ex: 1, 2, 15)</option>
                                  <option value={2}>2 chiffres (ex: 01, 02)</option>
                                  <option value={3}>3 chiffres (ex: 001, 002)</option>
                                  <option value={4}>4 chiffres (ex: 0001, 0002)</option>
                                  <option value={5}>5 chiffres (ex: 00001)</option>
                                </select>
                              </div>
                            </div>

                            {config.invoice.referenceFormat === 'custom' && (
                              <div className="space-y-2 pt-1">
                                <label className="block text-xs font-semibold text-slate-700">
                                  Modèle libre de référence
                                </label>
                                <input
                                  type="text"
                                  value={
                                    config.invoice.customReferencePattern ??
                                    '{PREFIX}-{ANNEE}-{NUM}'
                                  }
                                  onChange={(e) =>
                                    setConfig((prev) => ({
                                      ...prev,
                                      invoice: {
                                        ...prev.invoice,
                                        customReferencePattern: e.target.value,
                                      },
                                    }))
                                  }
                                  placeholder="{PREFIX}-{ANNEE}-{NUM}"
                                  className="w-full px-3 py-2 border border-slate-200 rounded-xl text-xs font-mono bg-white outline-none focus:border-primary-500"
                                />
                                <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-slate-500">
                                  <span>Insérer :</span>
                                  {['{PREFIX}', '{ANNEE}', '{AA}', '{MOIS}', '{JOUR}', '{NUM}'].map(
                                    (tok) => (
                                      <button
                                        key={tok}
                                        type="button"
                                        onClick={() =>
                                          setConfig((prev) => ({
                                            ...prev,
                                            invoice: {
                                              ...prev.invoice,
                                              customReferencePattern: `${
                                                prev.invoice.customReferencePattern || ''
                                              }${tok}`,
                                            },
                                          }))
                                        }
                                        className="px-2 py-0.5 rounded-md border border-slate-200 bg-white hover:bg-slate-100 font-mono text-[11px] text-slate-700 transition-colors cursor-pointer"
                                      >
                                        {tok}
                                      </button>
                                    )
                                  )}
                                </div>
                              </div>
                            )}

                            <div className="text-xs text-slate-600 pt-1 flex items-center justify-between gap-2">
                              <span>Aperçu de la prochaine référence :</span>
                              <span className="font-mono font-bold text-slate-900">
                                Réf : {previewInvoiceRef}
                              </span>
                            </div>
                          </div>
                        )}
                      </div>

                      <div className="space-y-1 pt-1">
                        <label className="block text-xs font-semibold text-slate-700">
                          Libellé par défaut de l'acte
                        </label>
                        <input
                          type="text"
                          value={config.invoice.defaultActLabel}
                          onChange={(e) =>
                            setConfig((prev) => ({
                              ...prev,
                              invoice: { ...prev.invoice, defaultActLabel: e.target.value },
                            }))
                          }
                          className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm outline-none focus:border-primary-500"
                        />
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      <label className="flex items-center justify-between gap-3 p-3 rounded-xl border border-slate-200 cursor-pointer hover:bg-slate-50/70">
                        <div>
                          <div className="text-sm font-medium text-slate-800">
                            Colonne « Émargement / Cachet »
                          </div>
                          <div className="text-xs text-slate-500">
                            Ajoute une case de signature/tampon à chaque séance (dossiers mutuelle)
                          </div>
                        </div>
                        <input
                          type="checkbox"
                          checked={config.calendar.showSignatureColumn}
                          onChange={(e) =>
                            setConfig((prev) => ({
                              ...prev,
                              calendar: {
                                ...prev.calendar,
                                showSignatureColumn: e.target.checked,
                              },
                            }))
                          }
                          className="h-4 w-4 rounded accent-teal-600"
                        />
                      </label>

                      <label className="flex items-center justify-between gap-3 p-3 rounded-xl border border-slate-200 cursor-pointer hover:bg-slate-50/70">
                        <div>
                          <div className="text-sm font-medium text-slate-800">
                            Inclure les séances programmées à venir
                          </div>
                          <div className="text-xs text-slate-500">
                            Affiche aussi les prochains RDV confirmés avec leur statut
                          </div>
                        </div>
                        <input
                          type="checkbox"
                          checked={config.calendar.includePlannedSessions}
                          onChange={(e) =>
                            setConfig((prev) => ({
                              ...prev,
                              calendar: {
                                ...prev.calendar,
                                includePlannedSessions: e.target.checked,
                              },
                            }))
                          }
                          className="h-4 w-4 rounded accent-teal-600"
                        />
                      </label>

                      <label className="flex items-center justify-between gap-3 p-3 rounded-xl border border-slate-200 cursor-pointer hover:bg-slate-50/70">
                        <div>
                          <div className="text-sm font-medium text-slate-800">
                            Afficher les informations de prescription
                          </div>
                          <div className="text-xs text-slate-500">
                            Mentionne le nombre de séances prescrites, le motif et le médecin prescripteur
                          </div>
                        </div>
                        <input
                          type="checkbox"
                          checked={config.calendar.showTreatmentSummary}
                          onChange={(e) =>
                            setConfig((prev) => ({
                              ...prev,
                              calendar: {
                                ...prev.calendar,
                                showTreatmentSummary: e.target.checked,
                              },
                            }))
                          }
                          className="h-4 w-4 rounded accent-teal-600"
                        />
                      </label>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* ============================================================ */}
            {/* SECTION 2 : EN-TÊTE                                          */}
            {/* ============================================================ */}
            {editorSection === 'header' && (
              <div className="space-y-5">
                {/* Activer / Annuler l'en-tête */}
                <label className="flex items-center justify-between gap-3 p-3.5 rounded-xl border border-slate-200 bg-slate-50/60 cursor-pointer hover:bg-slate-50">
                  <div>
                    <div className="text-sm font-semibold text-slate-900">
                      Afficher l'en-tête du cabinet sur les documents
                    </div>
                    <div className="text-xs text-slate-500">
                      Décochez cette option si vous imprimez sur du papier déjà doté d'un en-tête pré-imprimé
                    </div>
                  </div>
                  <input
                    type="checkbox"
                    checked={config.header.showHeader !== false}
                    onChange={(e) =>
                      setConfig((prev) => ({
                        ...prev,
                        header: { ...prev.header, showHeader: e.target.checked },
                      }))
                    }
                    className="h-4 w-4 rounded accent-teal-600 shrink-0"
                  />
                </label>

                {config.header.showHeader === false ? (
                  <div className="p-4 rounded-xl border border-amber-200 bg-amber-50/60 space-y-3">
                    <div className="text-xs font-semibold text-amber-900">
                      En-tête désactivé (Mode papier pré-imprimé)
                    </div>
                    <p className="text-xs text-amber-800 leading-relaxed">
                      Aucun logo ni coordonnée du cabinet ne sera imprimé en haut de la feuille. Choisissez la hauteur vierge à laisser en haut pour ne pas chevaucher votre en-tête papier :
                    </p>
                    <div className="max-w-xs space-y-1">
                      <label className="block text-xs font-semibold text-amber-900">
                        Hauteur vierge réservée en haut
                      </label>
                      <select
                        value={config.header.headerBlankSpaceMm || (isA5 ? 25 : 35)}
                        onChange={(e) =>
                          setConfig((prev) => ({
                            ...prev,
                            header: {
                              ...prev.header,
                              headerBlankSpaceMm: Number(e.target.value),
                            },
                          }))
                        }
                        className="w-full px-3 py-2 border border-amber-300 rounded-xl text-sm bg-white text-slate-800 outline-none focus:border-primary-500 tabular-nums"
                      >
                        <option value={15}>15 mm (Petit en-tête)</option>
                        <option value={20}>20 mm (Compact A5)</option>
                        <option value={25}>25 mm (Standard A5)</option>
                        <option value={30}>30 mm (Intermédiaire)</option>
                        <option value={35}>35 mm (Standard A4)</option>
                        <option value={45}>45 mm (Grand en-tête)</option>
                        <option value={55}>55 mm (Très grand)</option>
                      </select>
                    </div>
                  </div>
                ) : (
                  <>
                    {/* Logo du cabinet */}
                    <div className="p-4 rounded-xl border border-slate-200 bg-slate-50/50 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                      <div className="flex items-center gap-3.5">
                        {config.header.logoDataUrl ? (
                          <img
                            src={config.header.logoDataUrl}
                            alt="Logo du cabinet"
                            referrerPolicy="no-referrer"
                            className="h-14 w-14 object-contain rounded-lg bg-white border border-slate-200 p-1"
                          />
                        ) : (
                          <div className="h-14 w-14 rounded-lg bg-white border border-dashed border-slate-300 flex items-center justify-center text-xs font-bold text-slate-400">
                            LOGO
                          </div>
                        )}
                        <div>
                          <div className="text-sm font-semibold text-slate-800">Logo du cabinet</div>
                          <p className="text-xs text-slate-500">
                            Format PNG ou JPG affiché en haut des factures et calendriers
                          </p>
                          {config.header.logoDataUrl && (
                            <label className="inline-flex items-center gap-1.5 text-xs text-slate-600 mt-1 cursor-pointer">
                              <input
                                type="checkbox"
                                checked={config.header.showLogo}
                                onChange={(e) =>
                                  setConfig((prev) => ({
                                    ...prev,
                                    header: { ...prev.header, showLogo: e.target.checked },
                                  }))
                                }
                                className="h-3.5 w-3.5 rounded accent-teal-600"
                              />
                              Afficher le logo sur les documents
                            </label>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        <input
                          ref={logoInputRef}
                          type="file"
                          accept="image/png,image/jpeg,image/webp"
                          onChange={handleLogoUpload}
                          className="hidden"
                        />
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => logoInputRef.current?.click()}
                          className="gap-1.5 bg-white whitespace-nowrap shrink-0"
                        >
                          <Upload className="h-3.5 w-3.5" />
                          {config.header.logoDataUrl ? 'Changer' : 'Importer logo'}
                        </Button>
                        {config.header.logoDataUrl && (
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() =>
                              setConfig((prev) => ({
                                ...prev,
                                header: { ...prev.header, logoDataUrl: '' },
                              }))
                            }
                            className="text-rose-600 hover:bg-rose-50"
                            title="Supprimer le logo"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        )}
                      </div>
                    </div>

                    {/* Identité du cabinet */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div className="space-y-1.5">
                        <label className="block text-xs font-semibold text-slate-700">
                          Nom du cabinet
                        </label>
                        <input
                          type="text"
                          value={config.header.clinicName}
                          onChange={(e) =>
                            setConfig((prev) => ({
                              ...prev,
                              header: { ...prev.header, clinicName: e.target.value },
                            }))
                          }
                          className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm outline-none focus:border-primary-500"
                        />
                      </div>

                      <div className="space-y-1.5">
                        <label className="block text-xs font-semibold text-slate-700">
                          Sous-titre / Spécialité
                        </label>
                        <input
                          type="text"
                          value={config.header.clinicSubtitle}
                          onChange={(e) =>
                            setConfig((prev) => ({
                              ...prev,
                              header: { ...prev.header, clinicSubtitle: e.target.value },
                            }))
                          }
                          className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm outline-none focus:border-primary-500"
                        />
                      </div>

                      <div className="sm:col-span-2 space-y-1.5">
                        <label className="block text-xs font-semibold text-slate-700">
                          Nom du praticien responsable / Diplôme
                        </label>
                        <input
                          type="text"
                          value={config.header.practitionerLine}
                          onChange={(e) =>
                            setConfig((prev) => ({
                              ...prev,
                              header: { ...prev.header, practitionerLine: e.target.value },
                            }))
                          }
                          placeholder="Ex: Mr HADDAOUI Younes — Kinésithérapeute D.E."
                          className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm outline-none focus:border-primary-500"
                        />
                      </div>

                      <div className="sm:col-span-2 space-y-1.5">
                        <label className="block text-xs font-semibold text-slate-700">
                          Adresse complète du cabinet
                        </label>
                        <input
                          type="text"
                          value={config.header.address}
                          onChange={(e) =>
                            setConfig((prev) => ({
                              ...prev,
                              header: { ...prev.header, address: e.target.value },
                            }))
                          }
                          placeholder="Ex: Av. Hassan II, Imm. Atlas, Agadir"
                          className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm outline-none focus:border-primary-500"
                        />
                      </div>

                      <div className="space-y-1.5">
                        <label className="block text-xs font-semibold text-slate-700">Téléphone</label>
                        <input
                          type="text"
                          value={config.header.phone}
                          onChange={(e) =>
                            setConfig((prev) => ({
                              ...prev,
                              header: { ...prev.header, phone: e.target.value },
                            }))
                          }
                          placeholder="Ex: 05 28 00 00 00"
                          className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm outline-none focus:border-primary-500"
                        />
                      </div>

                      <div className="space-y-1.5">
                        <label className="block text-xs font-semibold text-slate-700">Email</label>
                        <input
                          type="text"
                          value={config.header.email}
                          onChange={(e) =>
                            setConfig((prev) => ({
                              ...prev,
                              header: { ...prev.header, email: e.target.value },
                            }))
                          }
                          placeholder="contact@reforme.center"
                          className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm outline-none focus:border-primary-500"
                        />
                      </div>

                      <div className="sm:col-span-2 space-y-1.5">
                        <label className="block text-xs font-semibold text-slate-700">
                          Identifiants professionnels (INPE / ICE / Patente / IF)
                        </label>
                        <input
                          type="text"
                          value={config.header.iceOrInpe}
                          onChange={(e) =>
                            setConfig((prev) => ({
                              ...prev,
                              header: { ...prev.header, iceOrInpe: e.target.value },
                            }))
                          }
                          placeholder="Ex: INPE : 000000000 • ICE : 001234567000089"
                          className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm outline-none focus:border-primary-500"
                        />
                      </div>
                    </div>
                  </>
                )}

                {/* Titres des documents */}
                <div className="pt-4 border-t border-slate-100 grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="block text-xs font-semibold text-slate-700">
                      Titre du document Facture
                    </label>
                    <input
                      type="text"
                      value={config.invoice.documentTitle}
                      onChange={(e) =>
                        setConfig((prev) => ({
                          ...prev,
                          invoice: { ...prev.invoice, documentTitle: e.target.value },
                        }))
                      }
                      className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm outline-none focus:border-primary-500"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="block text-xs font-semibold text-slate-700">
                      Titre du Calendrier de soins
                    </label>
                    <input
                      type="text"
                      value={config.calendar.documentTitle}
                      onChange={(e) =>
                        setConfig((prev) => ({
                          ...prev,
                          calendar: { ...prev.calendar, documentTitle: e.target.value },
                        }))
                      }
                      className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm outline-none focus:border-primary-500"
                    />
                  </div>

                  <div className="sm:col-span-2 space-y-1.5">
                    <label className="block text-xs font-semibold text-slate-700">
                      Sous-titre du Calendrier de soins
                    </label>
                    <input
                      type="text"
                      value={config.calendar.subtitle}
                      onChange={(e) =>
                        setConfig((prev) => ({
                          ...prev,
                          calendar: { ...prev.calendar, subtitle: e.target.value },
                        }))
                      }
                      className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm outline-none focus:border-primary-500"
                    />
                  </div>
                </div>
              </div>
            )}

            {/* ============================================================ */}
            {/* SECTION 3 : BAS DE PAGE                                      */}
            {/* ============================================================ */}
            {editorSection === 'footer' && (
              <div className="space-y-5">
                {/* Activer / Annuler le bas de page */}
                <label className="flex items-center justify-between gap-3 p-3.5 rounded-xl border border-slate-200 bg-slate-50/60 cursor-pointer hover:bg-slate-50">
                  <div>
                    <div className="text-sm font-semibold text-slate-900">
                      Afficher le bas de page sur les documents
                    </div>
                    <div className="text-xs text-slate-500">
                      Décochez cette option si votre papier comporte déjà un bas de page pré-imprimé
                    </div>
                  </div>
                  <input
                    type="checkbox"
                    checked={config.footer.showFooter !== false}
                    onChange={(e) =>
                      setConfig((prev) => ({
                        ...prev,
                        footer: { ...prev.footer, showFooter: e.target.checked },
                      }))
                    }
                    className="h-4 w-4 rounded accent-teal-600 shrink-0"
                  />
                </label>

                {config.footer.showFooter === false && (
                  <div className="p-4 rounded-xl border border-amber-200 bg-amber-50/60 space-y-3">
                    <div className="text-xs font-semibold text-amber-900">
                      Bas de page désactivé (Mode papier pré-imprimé)
                    </div>
                    <p className="text-xs text-amber-800 leading-relaxed">
                      Les lignes de pied de page et la numérotation ne seront pas imprimées. Choisissez la marge basse réservée pour éviter que les tableaux ne débordent sur votre bas de page pré-imprimé :
                    </p>
                    <div className="max-w-xs space-y-1">
                      <label className="block text-xs font-semibold text-amber-900">
                        Hauteur vierge réservée en bas
                      </label>
                      <select
                        value={config.footer.footerBlankSpaceMm || (isA5 ? 18 : 25)}
                        onChange={(e) =>
                          setConfig((prev) => ({
                            ...prev,
                            footer: {
                              ...prev.footer,
                              footerBlankSpaceMm: Number(e.target.value),
                            },
                          }))
                        }
                        className="w-full px-3 py-2 border border-amber-300 rounded-xl text-sm bg-white text-slate-800 outline-none focus:border-primary-500 tabular-nums"
                      >
                        <option value={12}>12 mm (Minimal A5)</option>
                        <option value={15}>15 mm (Petit pied)</option>
                        <option value={18}>18 mm (Standard A5)</option>
                        <option value={25}>25 mm (Standard A4)</option>
                        <option value={35}>35 mm (Grand pied)</option>
                        <option value={45}>45 mm (Très grand)</option>
                      </select>
                    </div>
                  </div>
                )}

                <div className="space-y-3">
                  <label className="flex items-center justify-between gap-3 p-3 rounded-xl border border-slate-200 cursor-pointer hover:bg-slate-50/70">
                    <div>
                      <div className="text-sm font-medium text-slate-800">
                        Encadré Cachet & Signature du Praticien
                      </div>
                      <div className="text-xs text-slate-500">
                        Affiche un cadre dédié au tampon officiel en bas à droite
                      </div>
                    </div>
                    <input
                      type="checkbox"
                      checked={config.footer.showSignatureBox}
                      onChange={(e) =>
                        setConfig((prev) => ({
                          ...prev,
                          footer: { ...prev.footer, showSignatureBox: e.target.checked },
                        }))
                      }
                      className="h-4 w-4 rounded accent-teal-600"
                    />
                  </label>

                  {config.footer.showSignatureBox && (
                    <div className="space-y-1">
                      <label className="block text-xs font-semibold text-slate-700">
                        Intitulé du cadre praticien
                      </label>
                      <input
                        type="text"
                        value={config.footer.signatureLabel}
                        onChange={(e) =>
                          setConfig((prev) => ({
                            ...prev,
                            footer: { ...prev.footer, signatureLabel: e.target.value },
                          }))
                        }
                        className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm outline-none focus:border-primary-500"
                      />
                    </div>
                  )}

                  <label className="flex items-center justify-between gap-3 p-3 rounded-xl border border-slate-200 cursor-pointer hover:bg-slate-50/70">
                    <div>
                      <div className="text-sm font-medium text-slate-800">
                        Encadré Signature du Patient
                      </div>
                      <div className="text-xs text-slate-500">
                        Affiche un second cadre en bas à gauche pour la signature du patient
                      </div>
                    </div>
                    <input
                      type="checkbox"
                      checked={config.footer.showPatientSignatureBox}
                      onChange={(e) =>
                        setConfig((prev) => ({
                          ...prev,
                          footer: { ...prev.footer, showPatientSignatureBox: e.target.checked },
                        }))
                      }
                      className="h-4 w-4 rounded accent-teal-600"
                    />
                  </label>

                  {config.footer.showPatientSignatureBox && (
                    <div className="space-y-1">
                      <label className="block text-xs font-semibold text-slate-700">
                        Intitulé du cadre patient
                      </label>
                      <input
                        type="text"
                        value={config.footer.patientSignatureLabel}
                        onChange={(e) =>
                          setConfig((prev) => ({
                            ...prev,
                            footer: { ...prev.footer, patientSignatureLabel: e.target.value },
                          }))
                        }
                        className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm outline-none focus:border-primary-500"
                      />
                    </div>
                  )}
                </div>

                <div className="pt-4 border-t border-slate-100 space-y-4">
                  <div className="space-y-1.5">
                    <label className="block text-xs font-semibold text-slate-700">
                      Mention légale sous le total de la facture
                    </label>
                    <input
                      type="text"
                      value={config.invoice.paymentNote}
                      onChange={(e) =>
                        setConfig((prev) => ({
                          ...prev,
                          invoice: { ...prev.invoice, paymentNote: e.target.value },
                        }))
                      }
                      className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm outline-none focus:border-primary-500"
                    />
                  </div>

                  {config.footer.showFooter !== false && (
                    <>
                      <div className="space-y-1.5">
                        <label className="block text-xs font-semibold text-slate-700">
                          Pied de page — Ligne 1
                        </label>
                        <input
                          type="text"
                          value={config.footer.footerLine1}
                          onChange={(e) =>
                            setConfig((prev) => ({
                              ...prev,
                              footer: { ...prev.footer, footerLine1: e.target.value },
                            }))
                          }
                          placeholder="Nom, adresse ou coordonnées bancaires..."
                          className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm outline-none focus:border-primary-500"
                        />
                      </div>

                      <div className="space-y-1.5">
                        <label className="block text-xs font-semibold text-slate-700">
                          Pied de page — Ligne 2
                        </label>
                        <input
                          type="text"
                          value={config.footer.footerLine2}
                          onChange={(e) =>
                            setConfig((prev) => ({
                              ...prev,
                              footer: { ...prev.footer, footerLine2: e.target.value },
                            }))
                          }
                          placeholder="Mention remboursement mutuelle / assurance..."
                          className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm outline-none focus:border-primary-500"
                        />
                      </div>

                      <label className="flex items-center justify-between gap-3 p-3 rounded-xl border border-slate-200 cursor-pointer hover:bg-slate-50/70">
                        <span className="text-sm font-medium text-slate-800">
                          Afficher la numérotation des pages (Page 1 / 1)
                        </span>
                        <input
                          type="checkbox"
                          checked={config.footer.showPageNumbers}
                          onChange={(e) =>
                            setConfig((prev) => ({
                              ...prev,
                              footer: { ...prev.footer, showPageNumbers: e.target.checked },
                            }))
                          }
                          className="h-4 w-4 rounded accent-teal-600"
                        />
                      </label>
                    </>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* RIGHT COLUMN : LIVE DOCUMENT PREVIEW */}
        <div className="xl:col-span-6 space-y-3 xl:sticky xl:top-6">
          {/* Preview Document Switcher */}
          <div className="flex items-center justify-between gap-3 bg-white p-2.5 rounded-xl border border-slate-200">
            <span className="text-xs font-semibold text-slate-500 pl-2 tabular-nums">
              Aperçu en direct ({isA5 ? 'A5 · 148 × 210 mm' : 'A4 · 210 × 297 mm'} ·{' '}
              {config.layout.orientation === 'landscape' ? 'Paysage' : 'Portrait'})
            </span>
            <div className="inline-flex p-1 bg-slate-100 rounded-lg gap-1">
              <button
                type="button"
                onClick={() => setPreviewDoc('invoice')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  previewDoc === 'invoice'
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <FileText className="h-3.5 w-3.5" />
                Facture
              </button>
              <button
                type="button"
                onClick={() => setPreviewDoc('calendar')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  previewDoc === 'calendar'
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <Calendar className="h-3.5 w-3.5" />
                Calendrier de soins
              </button>
            </div>
          </div>

          {/* Simulated A5 / A4 Sheet */}
          <div className="bg-slate-200/70 p-3 sm:p-5 rounded-2xl border border-slate-200 overflow-x-auto">
            <div
              className={`bg-white mx-auto shadow-md border border-slate-200/90 flex flex-col justify-between transition-all ${previewFontClass} ${
                isA5
                  ? config.layout.orientation === 'landscape'
                    ? 'max-w-[520px] min-h-[365px]'
                    : 'max-w-[420px] min-h-[580px]'
                  : config.layout.orientation === 'landscape'
                    ? 'min-w-[540px] min-h-[400px]'
                    : 'max-w-[540px] min-h-[680px]'
              }`}
            >
              {/* TOP + BODY */}
              <div>
                {/* HEADER PREVIEW */}
                {config.header.showHeader === false ? (
                  <div>
                    <div
                      className={`${getHeaderBlankHeightClass(
                        config.header.headerBlankSpaceMm || (isA5 ? 25 : 35)
                      )} border-b border-dashed border-slate-300 bg-slate-50/80 flex items-center justify-center px-4 text-[10px] text-slate-400 tabular-nums text-center`}
                    >
                      Zone vierge réservée à votre en-tête pré-imprimé (
                      {config.header.headerBlankSpaceMm || (isA5 ? 25 : 35)} mm — non imprimé)
                    </div>
                    <div className={`${previewPaddingClass} pt-3 pb-2`}>
                      {config.header.headerStyle === 'centered' ? (
                        <div className="text-center">
                          <div className="font-bold text-xs text-slate-900">
                            {previewDoc === 'invoice'
                              ? config.invoice.documentTitle || "FACTURE D'HONORAIRES"
                              : config.calendar.documentTitle || 'CALENDRIER DE SOINS'}
                          </div>
                          <div className="text-[10px] text-slate-500 mt-0.5 tabular-nums">
                            {previewDoc === 'invoice'
                              ? showPreviewInvoiceRef
                                ? `Réf : ${previewInvoiceRef} · Date : 01/11/2026`
                                : 'Date : 01/11/2026'
                              : `${config.calendar.subtitle || ''} · 01/11/2026`}
                          </div>
                        </div>
                      ) : (
                        <>
                          <div className="flex items-start justify-between gap-4">
                            <div className="font-bold text-xs text-slate-900">
                              {previewDoc === 'invoice'
                                ? config.invoice.documentTitle || "FACTURE D'HONORAIRES"
                                : config.calendar.documentTitle || 'CALENDRIER DE SOINS'}
                            </div>
                            <div className="text-[10px] text-slate-500 text-right tabular-nums">
                              {previewDoc === 'invoice' ? (
                                <>
                                  {showPreviewInvoiceRef && (
                                    <div>Réf : {previewInvoiceRef}</div>
                                  )}
                                  <div>Date : 01/11/2026</div>
                                </>
                              ) : (
                                <>
                                  {config.calendar.subtitle && (
                                    <div className="max-w-[200px] truncate">
                                      {config.calendar.subtitle}
                                    </div>
                                  )}
                                  <div>Édité le 01/11/2026</div>
                                </>
                              )}
                            </div>
                          </div>
                          <div className="border-b border-slate-200 mt-2.5" />
                        </>
                      )}
                    </div>
                  </div>
                ) : config.header.headerStyle === 'banner' ? (
                  <div
                    className={`${
                      isColorless
                        ? 'bg-white text-slate-900 border-b border-slate-900'
                        : `${palette.accentBg} text-white`
                    } px-6 py-4 flex items-start justify-between gap-4`}
                  >
                    <div className="flex items-start gap-3">
                      {config.header.showLogo && config.header.logoDataUrl && (
                        <img
                          src={config.header.logoDataUrl}
                          alt="Logo"
                          referrerPolicy="no-referrer"
                          className={`h-11 w-11 object-contain bg-white rounded-md p-1 shrink-0 ${
                            isColorless ? 'border border-slate-200' : ''
                          }`}
                        />
                      )}
                      <div>
                        <div className="font-bold text-base leading-tight">
                          {config.header.clinicName || 'Re Forme Center'}
                        </div>
                        {config.header.clinicSubtitle && (
                          <div
                            className={`text-[11px] mt-0.5 ${
                              isColorless ? 'text-slate-600' : 'text-white/90'
                            }`}
                          >
                            {config.header.clinicSubtitle}
                          </div>
                        )}
                        {config.header.practitionerLine && (
                          <div
                            className={`text-[10px] mt-0.5 font-medium ${
                              isColorless ? 'text-slate-700 font-semibold' : 'text-white/85'
                            }`}
                          >
                            {config.header.practitionerLine}
                          </div>
                        )}
                        {contactLine && (
                          <div
                            className={`text-[9px] mt-1 ${
                              isColorless ? 'text-slate-500' : 'text-white/80'
                            }`}
                          >
                            {contactLine}
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="text-right shrink-0">
                      <div className="font-bold text-xs tracking-wide">
                        {previewDoc === 'invoice'
                          ? config.invoice.documentTitle || "FACTURE D'HONORAIRES"
                          : config.calendar.documentTitle || 'CALENDRIER DE SOINS'}
                      </div>
                      <div
                        className={`text-[10px] mt-1 tabular-nums ${
                          isColorless ? 'text-slate-500' : 'text-white/85'
                        }`}
                      >
                        {previewDoc === 'invoice'
                          ? showPreviewInvoiceRef
                            ? `Réf : ${previewInvoiceRef}`
                            : 'Date : 01/11/2026'
                          : 'Édité le 01/11/2026'}
                      </div>
                    </div>
                  </div>
                ) : config.header.headerStyle === 'centered' ? (
                  <div className={`${previewPaddingClass} pb-3 text-center`}>
                    {config.header.showLogo && config.header.logoDataUrl && (
                      <img
                        src={config.header.logoDataUrl}
                        alt="Logo"
                        referrerPolicy="no-referrer"
                        className="h-12 w-auto object-contain mx-auto mb-2"
                      />
                    )}
                    <div className={`font-bold text-base ${palette.accentText}`}>
                      {config.header.clinicName || 'Re Forme Center'}
                    </div>
                    {config.header.clinicSubtitle && (
                      <div className="text-[11px] text-slate-600 mt-0.5">
                        {config.header.clinicSubtitle}
                      </div>
                    )}
                    {config.header.practitionerLine && (
                      <div className="text-[10px] font-semibold text-slate-700 mt-0.5">
                        {config.header.practitionerLine}
                      </div>
                    )}
                    {contactLine && (
                      <div className="text-[9px] text-slate-500 mt-1">{contactLine}</div>
                    )}
                    <div
                      className={`${
                        isColorless ? 'border-b border-slate-900' : `border-b-2 ${palette.accentBorder}`
                      } my-3`}
                    />
                    <div className="font-bold text-xs text-slate-900">
                      {previewDoc === 'invoice'
                        ? config.invoice.documentTitle || "FACTURE D'HONORAIRES"
                        : config.calendar.documentTitle || 'CALENDRIER DE SOINS'}
                    </div>
                    <div className="text-[10px] text-slate-500 mt-0.5 tabular-nums">
                      {previewDoc === 'invoice'
                        ? showPreviewInvoiceRef
                          ? `Réf : ${previewInvoiceRef} · Date : 01/11/2026`
                          : 'Date : 01/11/2026'
                        : `${config.calendar.subtitle || ''} · 01/11/2026`}
                    </div>
                  </div>
                ) : (
                  <div className={`${previewPaddingClass} pb-3`}>
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex items-start gap-3">
                        {config.header.showLogo && config.header.logoDataUrl && (
                          <img
                            src={config.header.logoDataUrl}
                            alt="Logo"
                            referrerPolicy="no-referrer"
                            className="h-11 w-11 object-contain shrink-0"
                          />
                        )}
                        <div>
                          <div className={`font-bold text-base leading-tight ${palette.accentText}`}>
                            {config.header.clinicName || 'Re Forme Center'}
                          </div>
                          {config.header.clinicSubtitle && (
                            <div className="text-[11px] text-slate-600 mt-0.5">
                              {config.header.clinicSubtitle}
                            </div>
                          )}
                          {config.header.practitionerLine && (
                            <div className="text-[10px] font-semibold text-slate-700 mt-0.5">
                              {config.header.practitionerLine}
                            </div>
                          )}
                          {contactLine && (
                            <div className="text-[9px] text-slate-500 mt-1">{contactLine}</div>
                          )}
                        </div>
                      </div>

                      <div className="text-right shrink-0">
                        <div className="font-bold text-xs text-slate-900">
                          {previewDoc === 'invoice'
                            ? config.invoice.documentTitle || "FACTURE D'HONORAIRES"
                            : config.calendar.documentTitle || 'CALENDRIER DE SOINS'}
                        </div>
                        <div className="text-[10px] text-slate-500 mt-1 tabular-nums">
                          {previewDoc === 'invoice' ? (
                            <>
                              {showPreviewInvoiceRef && (
                                <div>Réf : {previewInvoiceRef}</div>
                              )}
                              <div>Date : 01/11/2026</div>
                            </>
                          ) : (
                            <>
                              {config.calendar.subtitle && (
                                <div className="max-w-[170px] truncate">
                                  {config.calendar.subtitle}
                                </div>
                              )}
                              <div>Édité le 01/11/2026</div>
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                    <div
                      className={`${
                        isColorless ? 'border-b border-slate-900' : `border-b-2 ${palette.accentBorder}`
                      } mt-3`}
                    />
                  </div>
                )}

                {/* BODY CONTENT */}
                <div className={`${previewPaddingClass} pt-2 space-y-4`}>
                  {/* Patient Card */}
                  <div
                    className={`${
                      isColorless ? 'bg-white border-slate-300' : 'bg-slate-50 border-slate-200'
                    } border rounded-lg p-3 flex items-start justify-between gap-3 text-[10px]`}
                  >
                    <div className="space-y-0.5">
                      <div className="font-bold text-slate-900 text-[11px]">
                        Patient : Karim ALAOUI
                      </div>
                      <div className="text-slate-600 tabular-nums">Tél : 06 61 23 45 67</div>
                      <div className="text-slate-500">karim.alaoui@exemple.ma</div>
                    </div>
                    <div className="text-right text-slate-600 space-y-0.5">
                      {config.invoice.showPatientMeta && (
                        <>
                          <div>CIN : JB123456</div>
                          <div>Mutuelle : CNOPS</div>
                        </>
                      )}
                      {previewDoc === 'calendar' && config.calendar.showTreatmentSummary && (
                        <>
                          <div className="font-semibold text-slate-700">
                            Séances prescrites : 10
                          </div>
                          <div>Prescripteur : Dr BENNANI</div>
                        </>
                      )}
                    </div>
                  </div>

                  {/* Document Table */}
                  {previewDoc === 'invoice' ? (
                    <div className="space-y-3">
                      <table
                        className={`w-full text-[10px] border-collapse ${
                          config.layout.tableTheme === 'grid'
                            ? isColorless
                              ? 'border border-slate-300'
                              : 'border border-slate-200'
                            : ''
                        }`}
                      >
                        <thead>
                          <tr
                            className={
                              isColorless
                                ? 'bg-white text-slate-900 border-y border-slate-900'
                                : `${palette.accentBg} text-white`
                            }
                          >
                            {config.invoice.showSessionDetails ? (
                              <>
                                <th className="py-1.5 px-2 text-left font-semibold">N°</th>
                                <th className="py-1.5 px-2 text-left font-semibold">Date</th>
                                <th className="py-1.5 px-2 text-left font-semibold">Désignation</th>
                                <th className="py-1.5 px-2 text-left font-semibold">Statut</th>
                                <th className="py-1.5 px-2 text-right font-semibold">Montant</th>
                              </>
                            ) : (
                              <>
                                <th className="py-1.5 px-2 text-left font-semibold">Désignation</th>
                                <th className="py-1.5 px-2 text-center font-semibold">Qté</th>
                                <th className="py-1.5 px-2 text-left font-semibold">Statut</th>
                                <th className="py-1.5 px-2 text-right font-semibold">Total</th>
                              </>
                            )}
                          </tr>
                        </thead>
                        <tbody className="text-slate-700 tabular-nums">
                          {config.invoice.showSessionDetails ? (
                            [
                              { n: '1', d: '20/10/2026', s: 'Réglé', m: '200 DH' },
                              { n: '2', d: '24/10/2026', s: 'Réglé', m: '200 DH' },
                              { n: '3', d: '28/10/2026', s: 'En attente', m: '200 DH' },
                            ].map((r, idx) => (
                              <tr
                                key={r.n}
                                className={`${
                                  isColorless
                                    ? 'border-b border-slate-200 bg-white'
                                    : config.layout.tableTheme === 'grid'
                                      ? 'border-b border-slate-200'
                                      : config.layout.tableTheme === 'striped' && idx % 2 === 1
                                        ? 'bg-slate-50'
                                        : 'border-b border-slate-100'
                                }`}
                              >
                                <td className="py-1.5 px-2">{r.n}</td>
                                <td className="py-1.5 px-2">{r.d}</td>
                                <td className="py-1.5 px-2">
                                  {config.invoice.defaultActLabel || 'Séance de kinésithérapie'}
                                </td>
                                <td className="py-1.5 px-2">{r.s}</td>
                                <td className="py-1.5 px-2 text-right font-semibold">{r.m}</td>
                              </tr>
                            ))
                          ) : (
                            <>
                              <tr className="border-b border-slate-200">
                                <td className="py-1.5 px-2">
                                  {config.invoice.defaultActLabel || 'Séance de kinésithérapie'} (Réglées)
                                </td>
                                <td className="py-1.5 px-2 text-center">2</td>
                                <td className="py-1.5 px-2">Payé</td>
                                <td className="py-1.5 px-2 text-right font-semibold">400 DH</td>
                              </tr>
                              {config.invoice.showUnpaidBalance && (
                                <tr className="border-b border-slate-200">
                                  <td className="py-1.5 px-2">
                                    {config.invoice.defaultActLabel || 'Séance de kinésithérapie'} (En attente)
                                  </td>
                                  <td className="py-1.5 px-2 text-center">1</td>
                                  <td className="py-1.5 px-2">En attente</td>
                                  <td className="py-1.5 px-2 text-right font-semibold">200 DH</td>
                                </tr>
                              )}
                            </>
                          )}
                        </tbody>
                      </table>

                      {/* Totals box */}
                      <div className="flex justify-end">
                        <div
                          className={`w-48 ${
                            isColorless ? 'bg-white border-slate-300' : 'bg-slate-50 border-slate-200'
                          } border rounded-lg p-2.5 space-y-1 text-[10px] tabular-nums`}
                        >
                          <div className="flex justify-between text-slate-600">
                            <span>Total Facturé :</span>
                            <span className="font-bold text-slate-900">600 DH</span>
                          </div>
                          <div className="flex justify-between text-slate-600">
                            <span>Total Réglé :</span>
                            <span className={`font-bold ${palette.accentText}`}>400 DH</span>
                          </div>
                          {config.invoice.showUnpaidBalance && (
                            <div
                              className={`flex justify-between ${
                                isColorless ? 'text-slate-700' : 'text-rose-600'
                              }`}
                            >
                              <span>Reste à Payer :</span>
                              <span
                                className={`font-bold ${isColorless ? 'text-slate-900' : ''}`}
                              >
                                200 DH
                              </span>
                            </div>
                          )}
                        </div>
                      </div>

                      {config.invoice.paymentNote && (
                        <p className="text-[9.5px] italic text-slate-500">
                          {config.invoice.paymentNote}
                        </p>
                      )}
                    </div>
                  ) : (
                    <div className="space-y-3">
                      <table
                        className={`w-full text-[10px] border-collapse ${
                          config.layout.tableTheme === 'grid'
                            ? isColorless
                              ? 'border border-slate-300'
                              : 'border border-slate-200'
                            : ''
                        }`}
                      >
                        <thead>
                          <tr
                            className={
                              isColorless
                                ? 'bg-white text-slate-900 border-y border-slate-900'
                                : `${palette.accentBg} text-white`
                            }
                          >
                            <th className="py-1.5 px-2 text-left font-semibold">N°</th>
                            <th className="py-1.5 px-2 text-left font-semibold">Date</th>
                            <th className="py-1.5 px-2 text-left font-semibold">Nature des soins</th>
                            {config.calendar.includePlannedSessions && (
                              <th className="py-1.5 px-2 text-left font-semibold">Statut</th>
                            )}
                            {config.calendar.showSignatureColumn && (
                              <th className="py-1.5 px-2 text-center font-semibold">Émargement</th>
                            )}
                          </tr>
                        </thead>
                        <tbody className="text-slate-700 tabular-nums">
                          {[
                            {
                              n: '1',
                              d: '20/10/2026',
                              care: 'Bilan initial & physiothérapie',
                              st: 'Effectuée',
                            },
                            {
                              n: '2',
                              d: '24/10/2026',
                              care: 'Mobilisation & proprioception',
                              st: 'Effectuée',
                            },
                            ...(config.calendar.includePlannedSessions
                              ? [
                                  {
                                    n: '3',
                                    d: '04/11/2026',
                                    care: 'Réathlétisation fonctionnelle',
                                    st: 'Programmée',
                                  },
                                ]
                              : []),
                          ].map((row, idx) => (
                            <tr
                              key={row.n}
                              className={`${
                                isColorless
                                  ? 'border-b border-slate-200 bg-white'
                                  : config.layout.tableTheme === 'grid'
                                    ? 'border-b border-slate-200'
                                    : config.layout.tableTheme === 'striped' && idx % 2 === 1
                                      ? 'bg-slate-50'
                                      : 'border-b border-slate-100'
                              }`}
                            >
                              <td className="py-1.5 px-2">{row.n}</td>
                              <td className="py-1.5 px-2">{row.d}</td>
                              <td className="py-1.5 px-2">{row.care}</td>
                              {config.calendar.includePlannedSessions && (
                                <td className="py-1.5 px-2">{row.st}</td>
                              )}
                              {config.calendar.showSignatureColumn && (
                                <td className="py-2.5 px-2 text-center text-slate-300">_____</td>
                              )}
                            </tr>
                          ))}
                        </tbody>
                      </table>

                      <p className="text-[9.5px] italic text-slate-500">
                        Total des séances effectuées à ce jour : 2 séance(s).
                      </p>
                    </div>
                  )}

                  {/* Signature Boxes */}
                  {(config.footer.showSignatureBox || config.footer.showPatientSignatureBox) && (
                    <div className="pt-2 flex items-start justify-between gap-3">
                      <div>
                        {config.footer.showPatientSignatureBox && (
                          <div
                            className={`${
                              isA5 ? 'w-36 h-14' : 'w-40 h-16'
                            } border border-slate-300 rounded-md p-1.5 text-center`}
                          >
                            <span className="text-[9px] font-semibold text-slate-600">
                              {config.footer.patientSignatureLabel || 'Signature du Patient'}
                            </span>
                          </div>
                        )}
                      </div>
                      <div>
                        {config.footer.showSignatureBox && (
                          <div
                            className={`${
                              isA5 ? 'w-36 h-14' : 'w-44 h-16'
                            } border border-slate-300 rounded-md p-1.5 text-center`}
                          >
                            <span className="text-[9px] font-semibold text-slate-600">
                              {config.footer.signatureLabel || 'Cachet et Signature'}
                            </span>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* BOTTOM PAGE FOOTER */}
              {config.footer.showFooter === false ? (
                <div
                  className={`${getFooterBlankHeightClass(
                    config.footer.footerBlankSpaceMm || (isA5 ? 18 : 25)
                  )} border-t border-dashed border-slate-300 bg-slate-50/80 flex items-center justify-center px-4 text-[10px] text-slate-400 tabular-nums text-center`}
                >
                  Zone vierge réservée à votre bas de page pré-imprimé (
                  {config.footer.footerBlankSpaceMm || (isA5 ? 18 : 25)} mm — non imprimé)
                </div>
              ) : (
                <div className={`${previewPaddingClass} pt-3`}>
                  <div className="border-t border-slate-200 pt-2 flex items-center justify-between gap-2 text-[8.5px] text-slate-500">
                    <div className="flex-1 text-center space-y-0.5">
                      {config.footer.footerLine1 && <div>{config.footer.footerLine1}</div>}
                      {config.footer.footerLine2 && <div>{config.footer.footerLine2}</div>}
                    </div>
                    {config.footer.showPageNumbers && (
                      <span className="shrink-0 tabular-nums text-slate-400">Page 1 / 1</span>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
