import { cn } from '@platform/ui';
import { useInView } from '../hooks/useInView.js';

/**
 * Scene 3's module map — modules as connected nodes, not a feature-icon grid
 * (Final Design Direction Part 3: iconography is "never a decorative feature
 * bullet"; illustration style is "thin, single-weight line drawings, one
 * accent color only, no fills, no gradients, no 3D").
 *
 * Desktop: a radial hub-and-spoke diagram — six modules arranged around a
 * central "Trafikcloud" hub, connection lines drawing in once the diagram
 * scrolls into view, then holding still (Creative Blueprint Scene 3 +
 * Animation Strategy Phase 5).
 *
 * Mobile: per Final Design Direction Part 9 ("simplify to a vertical,
 * sequential reveal rather than the desktop's more spatial, multi-directional
 * diagram — mobile scroll is single-axis"), a completely different, simpler
 * layout — not the same diagram scaled down.
 */
const MODULES = [
  'Schemaläggning',
  'Elever',
  'Instruktörer',
  'Fordon',
  'Ekonomi',
  'Kommunikation',
];

const RADIUS = 210;

function HubMark({ size = 'md' as 'md' | 'sm' }: { size?: 'md' | 'sm' }) {
  const badge = size === 'md' ? 'h-14 w-14' : 'h-10 w-10';
  const icon = size === 'md' ? 'h-7 w-7' : 'h-5 w-5';
  return (
    <div className={cn('flex items-center justify-center rounded-xl bg-primary', badge)}>
      <svg viewBox="0 0 24 24" fill="none" className={cn(icon, 'text-primary-foreground')} stroke="currentColor" strokeWidth={2}>
        <path d="M12 2L2 7l10 5 10-5-10-5z" />
        <path d="M2 17l10 5 10-5" />
        <path d="M2 12l10 5 10-5" />
      </svg>
    </div>
  );
}

export function SystemMap() {
  const { ref, inView } = useInView<HTMLDivElement>(0.35);

  return (
    <div ref={ref} className="mt-16 w-full md:mt-20">
      {/* ── Desktop / tablet: radial hub-and-spoke diagram ─────────────────── */}
      <div className="relative mx-auto hidden h-[520px] w-full max-w-[640px] md:block">
        {/* Hub */}
        <div className="absolute left-1/2 top-1/2 z-10 flex -translate-x-1/2 -translate-y-1/2 flex-col items-center gap-2">
          <HubMark />
          <span className="text-xs font-medium text-foreground">Trafikcloud</span>
        </div>

        {MODULES.map((label, i) => {
          const angle = -90 + i * 60;
          const rad = (angle * Math.PI) / 180;
          const dx = Math.cos(rad) * RADIUS;
          const dy = Math.sin(rad) * RADIUS;

          return (
            <div key={label}>
              {/* Connection line — grows from the hub outward on scroll-into-view */}
              <div
                aria-hidden
                className="absolute left-1/2 top-1/2 h-px bg-border transition-transform duration-700 ease-out motion-reduce:transition-none"
                style={{
                  width: `${RADIUS}px`,
                  transformOrigin: '0% 50%',
                  transform: `rotate(${angle}deg) scaleX(${inView ? 1 : 0})`,
                  transitionDelay: `${i * 80}ms`,
                }}
              />
              {/* Module node */}
              <div
                className={cn(
                  'absolute z-10 -translate-x-1/2 -translate-y-1/2 whitespace-nowrap rounded-lg border border-border bg-background px-4 py-2.5',
                  'text-sm font-medium text-foreground',
                  'transition-opacity duration-500 ease-out motion-reduce:transition-none',
                  inView ? 'opacity-100' : 'opacity-0'
                )}
                style={{
                  left: `calc(50% + ${dx}px)`,
                  top: `calc(50% + ${dy}px)`,
                  transitionDelay: `${i * 80 + 300}ms`,
                }}
              >
                {label}
              </div>
            </div>
          );
        })}
      </div>

      {/* ── Mobile: simple sequential vertical reveal, not the same diagram ── */}
      <div className="mx-auto flex max-w-xs flex-col items-center md:hidden">
        <HubMark size="sm" />
        <span className="mt-2 text-xs font-medium text-foreground">Trafikcloud</span>

        {MODULES.map((label, i) => (
          <div key={label} className="flex flex-col items-center">
            <div
              aria-hidden
              className="w-px bg-border transition-transform duration-500 ease-out motion-reduce:transition-none"
              style={{
                height: '24px',
                transformOrigin: '50% 0%',
                transform: `scaleY(${inView ? 1 : 0})`,
                transitionDelay: `${i * 120}ms`,
              }}
            />
            <div
              className={cn(
                'rounded-lg border border-border bg-background px-4 py-2.5',
                'text-sm font-medium text-foreground',
                'transition-opacity duration-500 ease-out motion-reduce:transition-none',
                inView ? 'opacity-100' : 'opacity-0'
              )}
              style={{ transitionDelay: `${i * 120 + 150}ms` }}
            >
              {label}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
