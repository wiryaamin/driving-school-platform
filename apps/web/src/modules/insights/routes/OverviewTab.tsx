import { ChevronRight, Users, Calendar } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useSession } from '@shared/hooks/useSession.js';
import {
  useOverviewSummary,
  useUpcomingSlots,
  useUpcomingBirthdays,
} from '../hooks/useInsightsOverview.js';
import { cn } from '@/lib/utils.js';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatSek(n: number): string {
  return new Intl.NumberFormat('sv-SE', { style: 'currency', currency: 'SEK', maximumFractionDigits: 0 }).format(n);
}

function formatSlotDate(iso: string): string {
  return new Date(iso).toLocaleDateString('sv-SE', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Europe/Stockholm',
  });
}

function formatSlotTime(s: string, e: string): string {
  const tz = 'Europe/Stockholm';
  const st = new Date(s).toLocaleTimeString('sv-SE', { hour: '2-digit', minute: '2-digit', timeZone: tz });
  const et = new Date(e).toLocaleTimeString('sv-SE', { hour: '2-digit', minute: '2-digit', timeZone: tz });
  return `${st} - ${et}`;
}

function capitalize(str: string): string {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

// ─── Overview Tab ─────────────────────────────────────────────────────────────

export function OverviewTab() {
  const navigate = useNavigate();
  const { profile } = useSession();
  const firstName = profile?.first_name ?? '';

  const { data: summary, isLoading: sumLoading } = useOverviewSummary();
  const { data: slots   = [] }                    = useUpcomingSlots();
  const { data: birthdays = [] }                  = useUpcomingBirthdays();

  return (
    <div className="space-y-6">

      {/* Greeting */}
      <h1 className="text-xl font-semibold text-foreground">
        Hej {firstName}, kul att se dig igen!
      </h1>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

        {/* ── Att göra ─────────────────────────────────────────────────── */}
        <section>
          <h2 className="text-sm font-semibold text-primary mb-2">Att göra</h2>

          {/* Kunder i skuld */}
          <button
            onClick={() => navigate('/finance')}
            className="w-full text-left bg-card border border-border rounded-lg px-4 py-3 mb-2 flex items-start justify-between hover:bg-accent/40 transition-colors"
          >
            <div>
              <p className="text-sm font-medium text-foreground">
                Kunder i skuld utan betalningsbegäran
              </p>
              <div className="flex items-center gap-6 mt-1">
                <span className="text-xs text-muted-foreground">
                  Antal kunder
                  <span className="block text-base font-semibold text-foreground">
                    {sumLoading ? '…' : `${summary?.debtCount ?? 0} st`}
                  </span>
                </span>
                <span className="text-xs text-muted-foreground">
                  Total kundskuld
                  <span className="block text-base font-semibold text-foreground">
                    {sumLoading ? '…' : formatSek(summary?.debtSek ?? 0)}
                  </span>
                </span>
              </div>
            </div>
            <ChevronRight className="w-4 h-4 text-muted-foreground/50 mt-1 shrink-0" />
          </button>

          {/* Lediga platser */}
          <button
            onClick={() => navigate('/scheduling')}
            className="w-full text-left bg-card border border-border rounded-lg px-4 py-3 flex items-start justify-between hover:bg-accent/40 transition-colors"
          >
            <div>
              <p className="text-sm font-medium text-foreground">
                Lediga deltagarplatser kommande 7 dagarna (debiterbara)
              </p>
              <p className="text-2xl font-semibold text-foreground mt-1">
                {sumLoading ? '…' : `${summary?.openPlaces ?? 0} st`}
              </p>
            </div>
            <ChevronRight className="w-4 h-4 text-muted-foreground/50 mt-1 shrink-0" />
          </button>

          {/* Tips — birthdays */}
          {birthdays.length > 0 && (
            <div className="mt-4">
              <h2 className="text-sm font-semibold text-primary mb-2">Tips</h2>
              <div className="bg-card border border-border rounded-lg px-4 py-3">
                <p className="text-sm font-medium text-foreground mb-2">Kommande födelsedagar</p>
                <div className="space-y-2">
                  {birthdays.map((b) => (
                    <div key={b.id} className="flex items-center justify-between">
                      <div>
                        <p className="text-sm text-foreground">
                          <button
                            onClick={() => navigate(`/students/${b.id}`)}
                            className="text-primary hover:underline font-medium"
                          >
                            {b.name}
                          </button>
                          {' '}fyller {b.turns_age} år
                        </p>
                        <p className="text-xs text-muted-foreground">{capitalize(b.birthday_this_year)}</p>
                      </div>
                      <span className="text-xs text-muted-foreground whitespace-nowrap">
                        Om {b.days_until} dagar
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </section>

        {/* ── Företaget ────────────────────────────────────────────────── */}
        <section>
          <h2 className="text-sm font-semibold text-primary mb-2">Företaget</h2>

          {/* Nya kunder */}
          <div className="bg-card border border-border rounded-lg px-4 py-3 mb-4">
            <p className="text-xs text-muted-foreground">Nya kunder senaste 30 dagar</p>
            <div className="flex items-baseline gap-3 mt-0.5">
              <span className="text-2xl font-semibold text-foreground">
                {sumLoading ? '…' : `${summary?.newLast30 ?? 0} st`}
              </span>
              {!sumLoading && summary && summary.growthPct !== null && (
                <span className={cn(
                  'text-sm font-medium',
                  summary.growthPct >= 0 ? 'text-green-600 dark:text-green-400' : 'text-destructive',
                )}>
                  {summary.growthPct >= 0 ? '+' : ''}{summary.growthPct}%
                  <span className="text-muted-foreground font-normal ml-1">vs föregående 30 dagar</span>
                </span>
              )}
            </div>
          </div>

          {/* Kommande lediga kurser */}
          <div className="bg-card border border-border rounded-lg px-4 py-3">
            <p className="text-sm font-medium text-foreground mb-3 flex items-center gap-2">
              <Calendar className="w-3.5 h-3.5 text-muted-foreground" />
              Kommande lediga kurser
            </p>
            {slots.length === 0 ? (
              <p className="text-sm text-muted-foreground">Inga kommande kurser hittades.</p>
            ) : (
              <div className="space-y-2">
                {slots.map((slot) => {
                  const pct = slot.max_bookings > 0
                    ? Math.round((slot.current_bookings / slot.max_bookings) * 100)
                    : 0;
                  return (
                    <button
                      key={slot.id}
                      onClick={() => navigate('/scheduling')}
                      className="w-full text-left border border-border rounded-md px-3 py-2.5 hover:bg-accent/40 transition-colors"
                    >
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-sm font-medium text-foreground">{slot.lesson_type_name}</p>
                          <p className="text-xs text-muted-foreground mt-0.5">
                            {capitalize(formatSlotDate(slot.starts_at))}{' '}
                            {formatSlotTime(slot.starts_at, slot.ends_at)}
                          </p>
                        </div>
                        <div className="text-right shrink-0 ml-4">
                          <p className="text-sm font-medium text-foreground">
                            {slot.current_bookings} av {slot.max_bookings}
                          </p>
                          <p className="text-xs text-muted-foreground">{pct}% bokat</p>
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Students quick stat */}
          <button
            onClick={() => navigate('/students')}
            className="mt-3 w-full text-left bg-card border border-border rounded-lg px-4 py-3 flex items-center gap-3 hover:bg-accent/40 transition-colors"
          >
            <Users className="w-4 h-4 text-muted-foreground shrink-0" />
            <span className="text-sm text-foreground">Visa alla elever</span>
            <ChevronRight className="w-4 h-4 text-muted-foreground/50 ml-auto" />
          </button>
        </section>
      </div>
    </div>
  );
}
