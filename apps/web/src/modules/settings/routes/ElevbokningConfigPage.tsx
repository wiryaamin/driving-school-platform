import { Link } from 'react-router-dom';
import { Settings, ChevronRight, AlertTriangle } from 'lucide-react';

// ─── Audit finding ─────────────────────────────────────────────────────────────
//
// All 24 fields on this page saved to organizations.settings.student_booking, a
// JSONB blob with zero consumers anywhere. This page's copy repeatedly refers
// to "Elevsidan på tctabs.se" — an external domain that appears nowhere else in
// this codebase as a real integration (no Edge Function, webhook, or sync job
// references tctabs/TABSwebb). The platform's own real student-facing booking
// surface is the student-portal module (StudentPortalBokaPage /
// StudentPortalBokningarPage), and it does NOT read this settings blob either —
// it has its own independent, hardcoded rules. Concretely verified:
//
//   - Avbokningsfrist (cancel_hours/allow_cancel/cancel_lesson/cancel_course/
//     respect_holidays/cancel_mode/day_mode/cancel_time): the real student
//     portal hardcodes CANCEL_CUTOFF_MS = 24h in StudentPortalBokningarPage.tsx
//     — this settings page's cancellation-window controls have never affected
//     it. Making them real means changing the actual cancellation cutoff logic
//     the student portal enforces today — a behavioral change to a booking/
//     billing-adjacent flow, not a config-wiring task, so it needs its own
//     explicit, separately-scoped decision rather than being folded in here.
//   - Balance/price display, card payment, discount codes, booking limits
//     (max_upcoming/min_hours_before/weeks_ahead/show_prices/require_balance/
//     book_restriction), education card detail level, and booking-request
//     emails: none of these have any matching logic in the student portal or
//     anywhere else — genuinely unbuilt, not just disconnected.
//   - Avbokningsmeddelanden (notify_instructor + staff search): no
//     notification_rules trigger or event exists for a student-initiated
//     cancellation notifying staff.
//
// Removed the 24 fake controls rather than leaving a settings page that reads
// as if it configures the real student booking portal when it configures
// nothing live.

function NotBuilt({ title, description }: { title: string; description: string }) {
  return (
    <div className="space-y-3">
      <h2 className="text-sm font-semibold text-primary">{title}</h2>
      <div className="rounded-lg border border-border bg-muted/20 p-4">
        <p className="text-xs text-muted-foreground leading-relaxed">{description}</p>
      </div>
    </div>
  );
}

export function ElevbokningConfigPage() {
  return (
    <div className="max-w-xl space-y-8">
      <div className="flex items-center justify-between">
        <nav className="flex items-center gap-1 text-xs text-muted-foreground">
          <Link to="/settings" className="hover:text-foreground">Inställningar</Link>
          <ChevronRight className="w-3 h-3" />
          <Link to="/settings/student-booking/services" className="hover:text-foreground">Elevbokning</Link>
          <ChevronRight className="w-3 h-3" />
          <span className="text-foreground">Inställningar</span>
        </nav>
        <button type="button" className="text-xs text-primary hover:underline">Ge feedback</button>
      </div>

      <div className="flex flex-col items-center text-center gap-2 py-4">
        <div className="w-12 h-12 rounded-xl bg-blue-100 text-blue-600 flex items-center justify-center"><Settings className="w-6 h-6" /></div>
        <h1 className="text-lg font-semibold text-foreground">Inställningar</h1>
        <p className="text-sm text-muted-foreground">Regler för elevbokning, elevavbokning och avbokningsmeddelanden.</p>
      </div>

      <div className="flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/30 px-4 py-3 text-sm">
        <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
        <div className="space-y-1 text-amber-800 dark:text-amber-300">
          <p className="font-medium">Elevportalens verkliga avbokningsfrist är fast 24 timmar</p>
          <p className="text-xs leading-relaxed">
            Elevportalens bokningssida använder en egen, hårdkodad regel oberoende av denna sida. Att göra
            avbokningsfristen konfigurerbar innebär en ändring av verklig avbokningslogik och görs inte i denna omgång.
          </p>
        </div>
      </div>

      <NotBuilt
        title="Ekonomiöversikt på Elevsidan"
        description="Val av vilket saldo/skuld som visas för eleven, samt visning av transaktioner på tidigare behörigheter, är inte implementerade i elevportalen idag."
      />

      <NotBuilt
        title="Betalning"
        description="Kortbetalning på elevsidan är inte implementerad ännu."
      />

      <NotBuilt
        title="Bokningar"
        description="Rabattkoder, e-post för bokningsförfrågningar, samt begränsning av bokning baserat på saldo/kreditgräns/tid-innan-aktivitet är inte implementerade i elevportalens bokningsflöde idag."
      />

      <NotBuilt
        title="Aktiviteter — Avbokning"
        description="Avbokningsfrist, vilka aktivitetstyper som kan avbokas, och hänsyn till helgdagar är inte konfigurerbara — elevportalen använder en fast 24-timmarsregel (se ovan)."
      />

      <NotBuilt
        title="Utbildningskort på Elevsidan"
        description="Detaljnivå för utbildningskortet (standard/detaljerad) är inte implementerad i elevportalen idag."
      />

      <NotBuilt
        title="Elevbokning — gränser"
        description="Max antal kommande bokningar, minsta tid innan bokning, hur många veckor framåt som visas, prisvisning och saldokrav är inte implementerade i elevportalens bokningsflöde idag."
      />

      <NotBuilt
        title="Ombokning"
        description="Ombokning till annan tid för samma lektionstyp är inte implementerad ännu."
      />

      <NotBuilt
        title="Avbokningsmeddelanden"
        description="Notifiering till huvudläraren eller annan personal vid elevavbokning är inte implementerad — det finns ingen händelse eller notisregel kopplad till detta idag."
      />
    </div>
  );
}
