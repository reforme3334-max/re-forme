import React from 'react';
import { FolderOpen } from 'lucide-react';
import { openPatientDossier } from '../../lib/patientNavigation';

interface PatientNameLinkProps {
  key?: React.Key;
  patientId?: string | null;
  name: string;
  fromRoute?: string;
  onBeforeNavigate?: () => void;
  stopPropagation?: boolean;
  showIconOnHover?: boolean;
  showIconAlways?: boolean;
  variant?: 'default' | 'dark';
  className?: string;
}

export function PatientNameLink({
  patientId,
  name,
  fromRoute,
  onBeforeNavigate,
  stopPropagation = true,
  showIconOnHover = true,
  showIconAlways = false,
  variant = 'default',
  className = '',
}: PatientNameLinkProps) {
  if (!patientId) {
    return <span className={className}>{name}</span>;
  }

  const hoverStyles =
    variant === 'dark'
      ? 'hover:text-amber-300 hover:underline decoration-amber-400/80'
      : 'hover:text-primary-600 hover:underline decoration-primary-400';

  return (
    <button
      type="button"
      title={`Accéder au dossier de ${name}`}
      onClick={(e) => {
        if (stopPropagation) {
          e.stopPropagation();
        }
        onBeforeNavigate?.();
        openPatientDossier(patientId, fromRoute);
      }}
      className={`inline-flex items-center gap-1.5 text-left underline-offset-2 transition-colors cursor-pointer group/pname focus:outline-none ${hoverStyles} ${className}`}
    >
      <span className="truncate">{name}</span>
      {(showIconAlways || showIconOnHover) && (
        <FolderOpen
          className={`h-3.5 w-3.5 shrink-0 transition-opacity ${
            variant === 'dark' ? 'text-amber-400' : 'text-primary-500'
          } ${
            showIconAlways
              ? 'opacity-85 group-hover/pname:opacity-100'
              : 'opacity-0 group-hover/pname:opacity-100'
          }`}
        />
      )}
    </button>
  );
}
