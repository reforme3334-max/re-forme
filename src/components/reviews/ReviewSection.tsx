import { Star } from 'lucide-react';

interface ReviewSectionProps {
  patientName?: string;
}

export function ReviewSection({ patientName }: ReviewSectionProps) {
  return (
    <section className="space-y-6">
      <h2 className="text-lg font-bold text-slate-900 px-1">Avis de nos patients</h2>
      
      <div className="space-y-4">
        {/* Static Review 1 */}
        <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-5">
          <div className="flex gap-1 mb-3">
            {[...Array(5)].map((_, i) => (
              <Star key={i} className="h-4 w-4 fill-yellow-400 text-yellow-400" />
            ))}
          </div>
          <p className="text-slate-700 text-sm italic mb-3">
            "Super cabinet, équipe très professionnelle et à l'écoute. Ma rééducation s'est super bien passée, je recommande vivement !"
          </p>
          <p className="text-xs font-semibold text-slate-900">— Marie L.</p>
        </div>

        {/* Static Review 2 */}
        <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-5">
          <div className="flex gap-1 mb-3">
            {[...Array(5)].map((_, i) => (
              <Star key={i} className="h-4 w-4 fill-yellow-400 text-yellow-400" />
            ))}
          </div>
          <p className="text-slate-700 text-sm italic mb-3">
            "Excellente prise en charge suite à mon opération. Locaux propres, matériel au top et kinésithérapeutes très compétents."
          </p>
          <p className="text-xs font-semibold text-slate-900">— Thomas D.</p>
        </div>
      </div>

      {/* Google Review Button */}
      <div className="pt-2">
        <a 
          href="https://search.google.com/local/writereview?placeid=ChIJ97t8Ip3Jsw0RsPyY33BpOi4"
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center justify-center gap-3 w-full bg-white border border-slate-200 shadow-sm hover:bg-slate-50 text-slate-800 font-semibold h-12 rounded-xl transition-all"
        >
          <svg className="w-5 h-5" viewBox="0 0 24 24">
            <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
            <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
            <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
            <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
          </svg>
          Laissez-nous un avis sur Google
        </a>
      </div>
    </section>
  );
}
