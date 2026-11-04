import React, { useEffect, useState } from 'react';
import {
  Key,
  Copy,
  Check,
  Eye,
  EyeOff,
  ExternalLink,
  ShieldOff,
  Trophy,
  RefreshCw,
  CheckCircle2,
  AlertCircle,
} from 'lucide-react';
import { Modal } from '../ui/modal';
import { Button } from '../ui/button';
import { PartnerClub } from '../../lib/mutuelleUtils';
import {
  suggestDefaultClubLoginId,
  provisionOrResetClubAccess,
  revokeClubAccess,
  openClubPortalPreview,
} from '../../lib/clubPortalUtils';
import { supabase, supabaseUrl, supabaseAnonKey } from '../../lib/supabaseClient';

interface ClubAccessModalProps {
  isOpen: boolean;
  club: PartnerClub | null;
  fromRoute?: string;
  onClose: () => void;
  onUpdated: () => Promise<void> | void;
}

function generateReadablePassword(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
  let suffix = '';
  for (let i = 0; i < 6; i++) {
    suffix += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return `Club-${suffix}`;
}

export function ClubAccessModal({
  isOpen,
  club,
  fromRoute = 'finance',
  onClose,
  onUpdated,
}: ClubAccessModalProps) {
  const [loginId, setLoginId] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(true);
  const [saving, setSaving] = useState(false);
  const [revoking, setRevoking] = useState(false);
  const [confirmRevoke, setConfirmRevoke] = useState(false);
  const [error, setError] = useState('');
  const [successInfo, setSuccessInfo] = useState<{
    loginId: string;
    password: string;
  } | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (isOpen && club) {
      setLoginId(club.loginId || suggestDefaultClubLoginId(club.name));
      setPassword(generateReadablePassword());
      setShowPassword(true);
      setError('');
      setSuccessInfo(null);
      setConfirmRevoke(false);
      setCopied(false);
    }
  }, [isOpen, club?.name, club?.loginId]);

  if (!club) return null;

  const handleSaveAccess = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccessInfo(null);
    setSaving(true);

    try {
      const res = await provisionOrResetClubAccess({
        supabaseClient: supabase,
        supabaseUrl,
        supabaseAnonKey,
        club,
        loginIdentifier: loginId,
        rawPassword: password,
      });

      setLoginId(res.loginId);
      setSuccessInfo({
        loginId: res.loginId,
        password: password.trim(),
      });
      await onUpdated();
    } catch (err: any) {
      setError(err.message || "Impossible d'activer l'accès pour ce club.");
    } finally {
      setSaving(false);
    }
  };

  const handleRevoke = async () => {
    setError('');
    setRevoking(true);
    try {
      await revokeClubAccess(supabase, club);
      setSuccessInfo(null);
      setConfirmRevoke(false);
      await onUpdated();
      onClose();
    } catch (err: any) {
      setError(err.message || "Erreur lors de la révocation de l'accès.");
    } finally {
      setRevoking(false);
    }
  };

  const handleCopyCredentials = async () => {
    if (!successInfo) return;
    const portalUrl = `${window.location.origin}/#login`;
    const message = [
      `Espace Administration Club — ${club.name}`,
      `Portail Re Forme Center : ${portalUrl}`,
      `Identifiant : ${successInfo.loginId}`,
      `Mot de passe : ${successInfo.password}`,
    ].join('\n');

    try {
      await navigator.clipboard.writeText(message);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      // Fallback ignored silently
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={() => {
        if (!saving && !revoking) onClose();
      }}
      title={`Accès Portail Administration — ${club.name}`}
    >
      <div className="space-y-5">
        {/* Club summary banner */}
        <div className="flex items-start justify-between gap-3 p-3.5 rounded-xl bg-slate-50 border border-slate-200">
          <div className="flex items-start gap-3 min-w-0">
            <div className="h-10 w-10 rounded-xl bg-indigo-100 text-indigo-700 flex items-center justify-center shrink-0">
              <Trophy className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h4 className="font-bold text-slate-900 text-sm truncate">{club.name}</h4>
                <span className="text-[11px] font-semibold bg-white border border-slate-200 text-slate-600 px-2 py-0.5 rounded-md">
                  {club.sport}
                </span>
                {club.hasAccess ? (
                  <span className="inline-flex items-center gap-1 text-[11px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200 px-2 py-0.5 rounded-md">
                    <CheckCircle2 className="h-3 w-3" />
                    Accès actif
                  </span>
                ) : (
                  <span className="text-[11px] font-semibold bg-slate-200/70 text-slate-600 px-2 py-0.5 rounded-md">
                    Accès non activé
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                L'administration du club pourra consulter en lecture seule ses joueurs affiliés :
                pathologie, traitements, évolution clinique/douleur et état des règlements.
              </p>
              {club.hasAccess && club.loginId && (
                <p className="text-xs font-medium text-slate-700 mt-1.5">
                  Identifiant actuel :{' '}
                  <code className="px-1.5 py-0.5 rounded bg-white border border-slate-200 font-mono font-semibold text-indigo-700">
                    {club.loginId}
                  </code>
                </p>
              )}
            </div>
          </div>

          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => {
              onClose();
              openClubPortalPreview(club.name, fromRoute);
            }}
            className="shrink-0 text-xs gap-1.5 border-slate-200 text-slate-700 hover:bg-white"
            title="Voir ce que l'administration du club voit"
          >
            <ExternalLink className="h-3.5 w-3.5" />
            Aperçu Portail
          </Button>
        </div>

        {error && (
          <div className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs font-medium flex items-start gap-2.5">
            <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        {successInfo && (
          <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 text-emerald-800 font-bold text-sm">
                <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
                <span>Accès configuré et prêt à transmettre</span>
              </div>
              <Button
                type="button"
                size="sm"
                onClick={handleCopyCredentials}
                className="bg-emerald-700 hover:bg-emerald-800 text-white text-xs gap-1.5 h-8"
              >
                {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                {copied ? 'Copié !' : 'Copier les accès'}
              </Button>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 text-xs bg-white rounded-lg p-3 border border-emerald-200/80">
              <div>
                <span className="text-slate-500 block">Identifiant de connexion</span>
                <span className="font-mono font-bold text-slate-900 text-sm select-all">
                  {successInfo.loginId}
                </span>
              </div>
              <div>
                <span className="text-slate-500 block">Mot de passe attribué</span>
                <span className="font-mono font-bold text-slate-900 text-sm select-all">
                  {successInfo.password}
                </span>
              </div>
            </div>
          </div>
        )}

        <form onSubmit={handleSaveAccess} className="space-y-4">
          <div className="space-y-1.5">
            <label className="text-xs font-bold uppercase tracking-wide text-slate-600">
              Identifiant ou Email de connexion du club *
            </label>
            <input
              type="text"
              required
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              value={loginId}
              onChange={(e) => setLoginId(e.target.value)}
              placeholder="Ex: club.husa ou direction@husa.ma"
              className="w-full px-3 py-2.5 rounded-xl border border-slate-200 text-sm font-mono focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/15 outline-none"
            />
            <p className="text-[11px] text-slate-500">
              Le club utilisera cet identifiant sur la page de connexion habituelle de l'application.
            </p>
          </div>

          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold uppercase tracking-wide text-slate-600">
                {club.hasAccess ? 'Nouveau mot de passe *' : 'Mot de passe *'}
              </label>
              <button
                type="button"
                onClick={() => {
                  setPassword(generateReadablePassword());
                  setShowPassword(true);
                }}
                className="inline-flex items-center gap-1 text-xs font-semibold text-indigo-600 hover:text-indigo-700 cursor-pointer"
              >
                <RefreshCw className="h-3 w-3" />
                Générer un code
              </button>
            </div>
            <div className="relative">
              <input
                type={showPassword ? 'text' : 'password'}
                required
                minLength={6}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Minimum 6 caractères"
                className="w-full px-3 pr-10 py-2.5 rounded-xl border border-slate-200 text-sm font-mono focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/15 outline-none"
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-400 hover:text-slate-600"
              >
                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-slate-100">
            <div>
              {club.hasAccess && !confirmRevoke && (
                <button
                  type="button"
                  onClick={() => setConfirmRevoke(true)}
                  className="inline-flex items-center gap-1.5 text-xs font-semibold text-rose-600 hover:text-rose-700 px-2.5 py-1.5 rounded-lg hover:bg-rose-50 transition-colors cursor-pointer"
                >
                  <ShieldOff className="h-3.5 w-3.5" />
                  Révoquer l'accès
                </button>
              )}
              {club.hasAccess && confirmRevoke && (
                <div className="flex items-center gap-2">
                  <span className="text-xs font-semibold text-rose-700">Confirmer la désactivation ?</span>
                  <Button
                    type="button"
                    size="sm"
                    disabled={revoking}
                    onClick={handleRevoke}
                    className="bg-rose-600 hover:bg-rose-700 text-white text-xs h-7 px-2.5"
                  >
                    {revoking ? 'Désactivation...' : 'Oui, bloquer'}
                  </Button>
                  <button
                    type="button"
                    onClick={() => setConfirmRevoke(false)}
                    className="text-xs text-slate-500 hover:text-slate-700"
                  >
                    Annuler
                  </button>
                </div>
              )}
            </div>

            <div className="flex items-center gap-2 ml-auto">
              <Button
                type="button"
                variant="outline"
                disabled={saving || revoking}
                onClick={onClose}
              >
                Fermer
              </Button>
              <Button
                type="submit"
                disabled={saving || revoking}
                className="bg-indigo-600 hover:bg-indigo-700 text-white gap-1.5"
              >
                <Key className="h-4 w-4" />
                {saving
                  ? 'Activation...'
                  : club.hasAccess
                  ? "Mettre à jour l'accès"
                  : "Activer l'accès du club"}
              </Button>
            </div>
          </div>
        </form>
      </div>
    </Modal>
  );
}
