import { Link } from 'react-router-dom';
import { CalendarDays, ChevronRight, Bell, ArrowRight } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@core/api/supabase.js';
import { useSession } from '@shared/hooks/useSession.js';

// ─── Corrective pass (2026-07-25) ──────────────────────────────────────────────
//
// notification_rules — the real, live-dispatched booking notification config —
// confirm_sms/confirm_email/reminder_sms/reminder_email used to be saved to
// organizations.settings.bookings_schema, a JSONB blob nothing ever read.
// The actual dispatch gate is notification_rules (communication-worker's
// runNotify reads it by organization_id + trigger_event + channel + enabled).
// Every org is seeded with these rows on creation — see
// supabase/migrations/20260724000014_notification_rules_tenant_config.sql.
// notification_rules already has a full, dedicated admin UI at
// /communication/rules (NotificationRulesPage) — this page only shows a
// read-only status for the two booking-related triggers and links out for
// editing, so there is exactly one editable surface.
//
// The remaining 9 fields (reminder_mode, reminder_time, attendance_sort,
// export_text, show_full_name, show_debt_badge, group_display, days_back,
// resource_conflict) were left in place during that first pass without being
// re-checked. Re-verified for this corrective pass — fresh grep across
// supabase/functions and apps/web/src confirms zero consumers for every one
// of them, and no equivalent real behavior exists under a different name:
//   - reminder timing: event-worker's reminder dispatch uses hardcoded
//     offsets (reminder_2h/reminder_1h), not any org-level mode/time setting.
//   - attendance-list sort, booking-list group/days-back, export text: no
//     matching logic in BokningarPage or anywhere else in scheduling.
//   - full-name/debt-badge display: SlotEventCard has no such conditional
//     rendering at all.
//   - resource-conflict override ("schemalägg ändå"): no override/conflict
//     logic exists anywhere in the scheduling module.
// All 9 are disclosed as not implemented rather than kept as controls that
// silently saved to nothing.

type BookingTrigger = 'booking_confirmed' | 'booking_reminder_24h';

interface NotificationRuleRow {
  trigger_event: BookingTrigger;
  channel:       'sms' | 'email';
  enabled:       boolean;
}

function useBookingNotificationRules(orgId: string | undefined) {
  return useQuery<NotificationRuleRow[]>({
    queryKey: ['settings-booking-notification-rules', orgId],
    queryFn: async () => {
      if (!orgId) return [];
      const { data, error } = await supabase
        .from('notification_rules')
        .select('trigger_event, channel, enabled')
        .eq('organization_id', orgId)
        .eq('recipient_type', 'student')
        .in('trigger_event', ['booking_confirmed', 'booking_reminder_24h']);
      if (error) throw error;
      return (data ?? []) as NotificationRuleRow[];
    },
    enabled:   !!orgId,
    staleTime: 30_000,
  });
}

function NotificationStatusLink({ rules, trigger }: { rules: NotificationRuleRow[]; trigger: BookingTrigger }) {
  const smsOn   = rules.find(r => r.trigger_event === trigger && r.channel === 'sms')?.enabled ?? false;
  const emailOn = rules.find(r => r.trigger_event === trigger && r.channel === 'email')?.enabled ?? false;
  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border border-border bg-muted/30 px-3 py-2.5">
      <div className="flex items-center gap-2 text-xs text-foreground">
        <Bell className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
        <span>SMS: <strong className={smsOn ? 'text-green-600' : 'text-muted-foreground'}>{smsOn ? 'Aktiv' : 'Inaktiv'}</strong></span>
        <span className="text-border">·</span>
        <span>E-post: <strong className={emailOn ? 'text-green-600' : 'text-muted-foreground'}>{emailOn ? 'Aktiv' : 'Inaktiv'}</strong></span>
      </div>
      <Link to="/communication/rules" className="inline-flex items-center gap-1 text-xs text-primary hover:underline shrink-0">
        Hantera <ArrowRight className="w-3 h-3" />
      </Link>
    </div>
  );
}

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

export function BokningarSchemaPage() {
  const { organization } = useSession();
  const orgId = organization?.id;

  const { data: notificationRules = [], isLoading: rulesLoading } = useBookingNotificationRules(orgId);

  return (
    <div className="max-w-xl space-y-8">
      <div className="flex items-center justify-between">
        <nav className="flex items-center gap-1 text-xs text-muted-foreground">
          <Link to="/settings" className="hover:text-foreground">Inställningar</Link>
          <ChevronRight className="w-3 h-3" />
          <Link to="/settings/schema/time-templates" className="hover:text-foreground">Schema</Link>
          <ChevronRight className="w-3 h-3" />
          <span className="text-foreground">Bokningar</span>
        </nav>
        <button type="button" className="text-xs text-primary hover:underline">Ge feedback</button>
      </div>

      <div className="rounded-xl border border-border bg-card p-8 flex flex-col items-center text-center gap-2">
        <div className="w-12 h-12 rounded-xl bg-blue-100 text-blue-600 flex items-center justify-center">
          <CalendarDays className="w-6 h-6" />
        </div>
        <h1 className="text-lg font-semibold text-foreground">Bokningar</h1>
        <p className="text-sm text-muted-foreground">Konfigurera bokningsbekräftelser och påminnelser.</p>
      </div>

      <div className="space-y-3">
        <h2 className="text-sm font-semibold text-primary">Bokningsbekräftelser</h2>
        <p className="text-xs text-muted-foreground">
          Vilka kanaler som skickar bokningsbekräftelser styrs av notisregler och hanteras på en gemensam plats för alla händelsetyper.
        </p>
        {rulesLoading ? (
          <p className="text-xs text-muted-foreground">Laddar…</p>
        ) : (
          <NotificationStatusLink rules={notificationRules} trigger="booking_confirmed" />
        )}
      </div>

      <div className="space-y-3">
        <h2 className="text-sm font-semibold text-primary">Bokningspåminnelser</h2>
        <p className="text-xs text-muted-foreground">
          Vilka kanaler som skickar bokningspåminnelser styrs av notisregler och hanteras på en gemensam plats för alla händelsetyper.
        </p>
        {rulesLoading ? (
          <p className="text-xs text-muted-foreground">Laddar…</p>
        ) : (
          <NotificationStatusLink rules={notificationRules} trigger="booking_reminder_24h" />
        )}
      </div>

      <NotBuilt
        title="Tidpunkt för bokningspåminnelser"
        description="Att välja en specifik tid eller ett fast antal timmar innan bokningen för utskick är inte implementerat ännu — påminnelser skickas idag enligt ett fast, hårdkodat schema i systemet."
      />

      <NotBuilt
        title="Sortering av närvarolistan"
        description="Att välja sorteringskolumn (bokningsordning/förnamn/efternamn) för närvarolistan är inte implementerat ännu."
      />

      <NotBuilt
        title="Anpassa text på export av elevens bokningar"
        description="En anpassad text som visas vid export av elevens bokningar är inte implementerad ännu — det finns ingen sådan exportfunktion i plattformen idag."
      />

      <NotBuilt
        title="Bokningsschema — visning"
        description="Att visa kundernas fullständiga namn eller en skuldvarning i bokningsschemat är inte implementerat ännu."
      />

      <NotBuilt
        title="Bokningslista — visning"
        description="Att styra hur tidsluckor i grupper visas, eller hur många dagar bakåt bokningslistan visar som standard, är inte implementerat ännu."
      />

      <NotBuilt
        title="Resurser — bokningskonflikter"
        description={'Att förhindra eller tillåta manuell överbokning via "schemalägg ändå" är inte implementerat ännu — det finns ingen sådan konfliktkontroll i schemaläggningen idag.'}
      />
    </div>
  );
}
