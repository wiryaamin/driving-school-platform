import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Settings, ChevronRight, Save } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { Button, Input, Label, toast } from '@platform/ui';
import { supabase } from '@core/api/supabase.js';
import { useSession } from '@shared/hooks/useSession.js';
import { useCancellationDeadlineHours, DEFAULT_CANCELLATION_DEADLINE_HOURS } from '@modules/scheduling/hooks/useCancellationPolicy.js';

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
//   - Avbokningsfrist: WAS hardcoded (CANCEL_CUTOFF_MS = 24h in
//     StudentPortalBokningarPage.tsx), with zero effect from this page's
//     control. F3 (2026-08-18) made this real — the control below now reads
//     and writes the exact same organizations.settings.student_booking
//     .cancellation_deadline_hours path the student portal, the staff
//     cancel-dialog warning, and both booking/reschedule Edge Functions all
//     read. Every other control that used to exist here remains removed —
//     see below — this is the one field made real, not a general revival.
//   - Balance/price display, card payment, discount codes, booking limits
//     (max_upcoming/min_hours_before/weeks_ahead/show_prices/require_balance/
//     book_restriction), education card detail level, and booking-request
//     emails: none of these have any matching logic in the student portal or
//     anywhere else — genuinely unbuilt, not just disconnected.
//   - Avbokningsmeddelanden (notify_instructor + staff search): no
//     notification_rules trigger or event exists for a student-initiated
//     cancellation notifying staff.
//
// Removed the other 23 fake controls rather than leaving a settings page that
// reads as if it configures the real student booking portal when most of it
// configures nothing live.

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

// ─── Avbokningsfrist (F3 V1) — the one real, wired control on this page ───────
//
// Reads/writes organizations.settings.student_booking.cancellation_deadline_hours
// directly (same pattern as KassaSettingsPage's pay_terms_days — the other
// real field on a similarly-audited settings page), merging into the existing
// settings blob rather than overwriting it.

function CancellationDeadlineControl() {
  const { organization } = useSession();
  const orgId = organization?.id;
  const qc = useQueryClient();

  const { data: currentHours, isLoading } = useCancellationDeadlineHours(orgId);
  const [hours, setHours] = useState(DEFAULT_CANCELLATION_DEADLINE_HOURS);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (currentHours !== undefined) setHours(currentHours);
  }, [currentHours]);

  async function handleSave() {
    if (!orgId || hours < 0) return;
    setSaving(true);
    const { data: org } = await supabase.from('organizations').select('settings').eq('id', orgId).single();
    const existingSettings = ((org as unknown as { settings?: Record<string, unknown> } | null)?.settings) ?? {};
    const existingStudentBooking = (existingSettings['student_booking'] as Record<string, unknown> | undefined) ?? {};

    const { error } = await supabase.from('organizations').update({
      settings: {
        ...existingSettings,
        student_booking: { ...existingStudentBooking, cancellation_deadline_hours: hours },
      },
    } as never).eq('id', orgId);

    setSaving(false);
    if (error) {
      toast({ title: 'Kunde inte spara', variant: 'destructive' });
      return;
    }
    toast({ title: 'Sparat', description: 'Avbokningsfristen har uppdaterats.' });
    void qc.invalidateQueries({ queryKey: ['org-settings', 'cancellation-deadline-hours', orgId] });
  }

  return (
    <div className="space-y-3">
      <h2 className="text-sm font-semibold text-primary">Avbokningsfrist</h2>
      <div className="rounded-lg border border-border bg-card p-4 space-y-3">
        <p className="text-xs text-muted-foreground leading-relaxed">
          Om en elev avbokar eller uteblir från en lektion inom denna tidsgräns återställs inte lektionskrediten.
          Personalens avbokningar (t.ex. sjukdom, väder) påverkas inte av denna gräns.
        </p>
        <div className="flex items-end gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="cancel-deadline-hours">Timmar före lektionsstart</Label>
            <Input
              id="cancel-deadline-hours"
              type="number"
              min={0}
              max={168}
              value={hours}
              disabled={isLoading}
              onChange={(e) => setHours(Math.max(0, Number(e.target.value) || 0))}
              className="w-28"
            />
          </div>
          <Button size="sm" onClick={handleSave} disabled={saving || isLoading} className="gap-1.5">
            <Save className="w-3.5 h-3.5" />
            {saving ? 'Sparar...' : 'Spara'}
          </Button>
        </div>
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

      <CancellationDeadlineControl />

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
        description="Avbokningsfristen konfigureras ovan. Vilka aktivitetstyper som kan avbokas, och hänsyn till helgdagar, är fortfarande inte konfigurerbara."
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
