import { ShieldCheck, Lock, FileCheck2, ServerCog } from 'lucide-react';

/**
 * Scene 8 — Security & Architecture ("TRUSTED BY DRIVING SCHOOLS" band in the
 * reference layout).
 *
 * Visual Redesign Pass: rebuilt from the centered heading + single activity-
 * log screenshot into the reference's dark trust band — eyebrow, heading,
 * and five icon+label trust points.
 *
 * The reference uses a real city photograph behind this band. No licensed
 * photo asset exists in this repo, so this uses a plain gradient in its
 * place rather than an unlicensed stock image — swap in a real photo via the
 * `photoSrc` prop once one is sourced.
 */
function SwedenFlagIcon({ className }: { className?: string; strokeWidth?: number; 'aria-hidden'?: boolean }) {
  return (
    <span className={className} aria-hidden>
      🇸🇪
    </span>
  );
}

const TRUST_POINTS = [
  { icon: SwedenFlagIcon, title: 'Sverige först', description: 'Byggt för svenska trafikskolor och regelverk.' },
  { icon: Lock, title: 'Företagssäkerhet', description: 'Avancerad säkerhet med kryptering och övervakning.' },
  { icon: ShieldCheck, title: 'GDPR-kompatibel', description: 'Full efterlevnad av GDPR och dataskydd.' },
  { icon: FileCheck2, title: 'Redo för granskning', description: 'Kompletta granskningsloggar och spårbarhet.' },
  { icon: ServerCog, title: 'Pålitlig plattform', description: 'Hög drifttillförlitlighet med skalbar infrastruktur.' },
] as const;

export function SecurityArchitecture({ photoSrc }: { photoSrc?: string }) {
  return (
    <section className="relative w-full overflow-hidden bg-[#0d1b2e] px-8 py-16 md:py-20 lg:py-24">
      {photoSrc ? (
        <img src={photoSrc} alt="" aria-hidden className="absolute inset-0 h-full w-full object-cover opacity-30" />
      ) : (
        <div
          aria-hidden
          className="absolute inset-0"
          style={{ background: 'linear-gradient(120deg, hsl(210 60% 12%) 0%, hsl(207 70% 20%) 60%, hsl(207 80% 28%) 100%)' }}
        />
      )}

      <div className="relative mx-auto max-w-[1120px] xl:max-w-[1320px]">
        <p className="text-xs font-medium uppercase tracking-wide text-white/60">Betrott av trafikskolor</p>
        <h2 className="mt-2 max-w-xl text-balance text-[26px] font-medium leading-[1.15] tracking-[-0.015em] text-white md:text-[32px] lg:text-[38px]">
          Säkerhet. Efterlevnad. Byggt för Sverige.
        </h2>

        <div className="mt-10 grid grid-cols-2 gap-6 sm:grid-cols-3 md:mt-14 lg:grid-cols-5">
          {TRUST_POINTS.map(({ icon: Icon, title, description }) => (
            <div key={title} className="flex flex-col items-start gap-2 text-left">
              <span className="text-lg text-white">
                <Icon className="h-5 w-5" strokeWidth={1.75} aria-hidden />
              </span>
              <p className="text-sm font-medium text-white">{title}</p>
              <p className="text-xs leading-[1.4] text-white/60">{description}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
