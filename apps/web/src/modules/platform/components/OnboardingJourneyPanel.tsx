import {
  Rocket, Mail, Phone, User, CheckCircle2, Circle, Lock,
  AlertTriangle, RefreshCw, Send, XCircle, KeyRound, ShieldAlert, Activity, ClipboardCheck, CreditCard,
} from 'lucide-react';
import { Skeleton, Button, Badge, toast } from '@platform/ui';
import { cn } from '@/lib/utils.js';
import {
  useOnboardingJourney, type OnboardingActionKey, type OnboardingRecoveryAction,
} from '../hooks/usePlatformOnboardingJourney.js';
import {
  useResendInvitation, useCancelInvitation, useSendPasswordReset, useForcePasswordReset, useRetryOrgOperations, useVerifyPayment,
} from '../hooks/usePlatformOrgMutations.js';
import { useMarkDemoRequestReviewed, useApproveDemoRequestOnboarding } from '../hooks/useDemoRequestMutations.js';
import { useApproveGoLive } from '../hooks/usePlatformTenantOnboarding.js';
import { TenantLifecyclePanel } from './TenantLifecyclePanel.js';

// ─── Display maps ─────────────────────────────────────────────────────────────

const OWNER_LABEL_SV: Record<string, string> = {
  Platform: 'Plattformen', Customer: 'Kunden', 'Customer Success': 'Customer Success',
};

const HEALTH_DOT: Record<string, string> = { green: 'bg-emerald-500', yellow: 'bg-amber-500', red: 'bg-red-500' };
const HEALTH_BORDER: Record<string, string> = {
  green: 'border-emerald-200 dark:border-emerald-900/50 bg-emerald-50/50 dark:bg-emerald-950/10',
  yellow: 'border-amber-200 dark:border-amber-900/50 bg-amber-50/50 dark:bg-amber-950/10',
  red: 'border-red-200 dark:border-red-900/50 bg-red-50/50 dark:bg-red-950/10',
};

const ACTION_ICON: Record<OnboardingActionKey, React.ElementType> = {
  'mark-reviewed':        ClipboardCheck,
  'approve-onboarding':   CheckCircle2,
  'resend-invitation':    Send,
  'cancel-invitation':    XCircle,
  'contact-customer':     Phone,
  'verify-payment':       CreditCard,
  'send-password-reset':  KeyRound,
  'force-password-reset': ShieldAlert,
  'approve-go-live':      Rocket,
  'retry-communication':  RefreshCw,
};

function SectionCard({ icon: Icon, title, children, action }: { icon: React.ElementType; title: string; children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-border bg-card">
      <div className="flex items-center gap-2 px-4 py-3 border-b border-border">
        <Icon className="w-4 h-4 text-muted-foreground" />
        <p className="text-sm font-semibold text-foreground">{title}</p>
        {action && <div className="ml-auto">{action}</div>}
      </div>
      <div className="px-4 py-4">{children}</div>
    </div>
  );
}

/**
 * Onboarding Command Center — a true state-driven wizard over the Product
 * Owner's mandatory 10-step workflow (Review Customer → Approve Onboarding →
 * Choose Subscription → Create Organization → Create Administrator → Send
 * Invitation → Administrator Activated → School Configuration → Verify
 * Payment → Go Live Approval → Complete). Steps are never merged, removed,
 * or reordered — three of them (Choose Subscription / Create Organization /
 * Create Administrator) complete simultaneously because the backend performs
 * them as one atomic transaction, shown honestly as three tracker entries
 * sharing a timestamp rather than collapsed into one.
 *
 * Deliberately NOT a checklist: only the compact step tracker (labels +
 * status, no per-step detail) and the single current step are shown at
 * full detail. Completed steps collapse into the tracker; future steps stay
 * dimmed placeholders until they become current.
 */
export function OnboardingJourneyPanel({ orgId, onGoLiveApproved }: { orgId: string; onGoLiveApproved?: () => void }) {
  const { data: journey, isLoading, error } = useOnboardingJourney(orgId);
  const markReviewed        = useMarkDemoRequestReviewed();
  const approveOnboarding   = useApproveDemoRequestOnboarding();
  const resendInvitation    = useResendInvitation(orgId);
  const cancelInvitation    = useCancelInvitation(orgId);
  const sendPasswordReset   = useSendPasswordReset(orgId);
  const forcePasswordReset  = useForcePasswordReset(orgId);
  const verifyPayment       = useVerifyPayment(orgId);
  const approveGoLive       = useApproveGoLive();
  const retryOperations     = useRetryOrgOperations(orgId);

  const anyActionPending =
    markReviewed.isPending || approveOnboarding.isPending || resendInvitation.isPending || cancelInvitation.isPending ||
    sendPasswordReset.isPending || forcePasswordReset.isPending || verifyPayment.isPending ||
    approveGoLive.isPending || retryOperations.isPending;

  function runAction(action: OnboardingActionKey) {
    if (!journey) return;
    const userId = journey.admin_contact?.user_id;
    const onSuccess = (title: string) => toast({ title });
    const onError = (err: Error) => toast({ title: 'Fel', description: err.message, variant: 'destructive' });

    switch (action) {
      case 'mark-reviewed':
        if (!journey.demo_request_id) return;
        markReviewed.mutate(journey.demo_request_id, { onSuccess: () => onSuccess('Markerad som granskad'), onError });
        break;
      case 'approve-onboarding':
        if (!journey.demo_request_id) return;
        approveOnboarding.mutate(journey.demo_request_id, { onSuccess: () => onSuccess('Onboarding godkänd'), onError });
        break;
      case 'resend-invitation':
        if (!userId) return;
        resendInvitation.mutate(userId, { onSuccess: () => onSuccess('Inbjudan skickad'), onError });
        break;
      case 'cancel-invitation':
        if (!userId) return;
        cancelInvitation.mutate(userId, { onSuccess: () => onSuccess('Inbjudan avbruten'), onError });
        break;
      case 'send-password-reset':
        if (!userId) return;
        sendPasswordReset.mutate(userId, { onSuccess: () => onSuccess('Lösenordsåterställning skickad'), onError });
        break;
      case 'force-password-reset':
        if (!userId) return;
        forcePasswordReset.mutate(userId, { onSuccess: () => onSuccess('Lösenord återställt'), onError });
        break;
      case 'verify-payment':
        verifyPayment.mutate(undefined, { onSuccess: () => onSuccess('Betalning bekräftad som verifierad'), onError });
        break;
      case 'approve-go-live':
        approveGoLive.mutate(orgId, {
          onSuccess: () => { onSuccess('Driftsatt — nu en Live kund'); onGoLiveApproved?.(); },
          onError,
        });
        break;
      case 'retry-communication':
        retryOperations.mutate(undefined, { onSuccess: (r) => onSuccess(`Återköat: ${r.events_requeued} händelser, ${r.messages_requeued} meddelanden`), onError });
        break;
      case 'contact-customer':
        break; // informational only — no system action, see contact details below
    }
  }

  if (isLoading) {
    return (
      <div>
        <Skeleton className="h-24 rounded-xl" />
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
          {[1, 2, 3].map(i => <Skeleton key={i} className="h-40 rounded-xl" />)}
        </div>
      </div>
    );
  }

  if (error || !journey) {
    return (
      <div className="flex flex-col items-center justify-center py-16 gap-3 text-center">
        <AlertTriangle className="w-8 h-8 text-destructive" />
        <p className="text-sm text-destructive">Kunde inte hämta onboarding-resan</p>
      </div>
    );
  }

  const hasAction = Boolean(journey.next_recommended_action.action);

  return (
    <div className="space-y-4">
      {/* ── Next Recommended Action — the primary operational focus ─────── */}
      <div className={cn(
        'rounded-2xl border-2 p-5 flex items-center justify-between gap-4 flex-wrap',
        hasAction ? HEALTH_BORDER[journey.health] : 'border-border bg-card',
      )}>
        <div className="flex items-center gap-3">
          <span className={cn('w-3 h-3 rounded-full shrink-0', hasAction ? HEALTH_DOT[journey.health] : 'bg-emerald-500')} />
          <div>
            <p className="text-xs text-muted-foreground uppercase tracking-wide font-semibold mb-0.5">Nästa rekommenderade åtgärd</p>
            <p className="text-xl font-bold text-foreground leading-tight">{journey.next_recommended_action.label}</p>
            {journey.next_recommended_action.action === 'contact-customer' && journey.customer_contact && (
              <p className="text-sm text-muted-foreground mt-1">
                {journey.customer_contact.name} · {journey.customer_contact.email}
                {journey.customer_contact.phone ? ` · ${journey.customer_contact.phone}` : ''}
              </p>
            )}
          </div>
        </div>
        {hasAction && journey.next_recommended_action.action !== 'contact-customer' && (
          <Button
            size="lg"
            className="bg-amber-500 hover:bg-amber-600 text-white border-0"
            onClick={() => runAction(journey.next_recommended_action.action!)}
            disabled={anyActionPending}
          >
            {anyActionPending ? 'Vänta…' : journey.next_recommended_action.label}
          </Button>
        )}
      </div>

      {/* ── Tenant lifecycle control — Platform Admin's direct control over the
          TENANT (Suspend/Cancel/Delete/Extend/Convert), distinct from and
          positioned above the administrator-ACCOUNT actions further below. ── */}
      <TenantLifecyclePanel orgId={journey.organization_id} orgName={journey.organization_name ?? 'Organisationen'} />

      {/* ── Compact step tracker — completed steps collapse to a checkmark +
          label only, never a checklist with per-row actions or descriptions.
          The current step is highlighted; everything after it stays a dimmed
          placeholder until it becomes current. ─────────────────────────── */}
      <div className="rounded-xl border border-border bg-card px-4 py-3.5">
        <div className="flex items-center justify-between mb-2.5">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Onboarding-resa</p>
          <p className="text-xs text-muted-foreground">{journey.progress_label} · {journey.progress_percent}%</p>
        </div>
        <div className="w-full h-1.5 rounded-full bg-muted overflow-hidden mb-3">
          <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${journey.progress_percent}%` }} />
        </div>
        <div className="flex items-center flex-wrap gap-y-1.5">
          {journey.steps.map((step, i) => {
            const isCurrent = !step.completed && journey.steps.slice(0, i).every(s => s.completed);
            return (
              <div key={step.key} className="flex items-center">
                {i > 0 && <div className={cn('w-4 h-px shrink-0', step.completed || isCurrent ? 'bg-primary/40' : 'bg-border')} />}
                <div
                  className={cn(
                    'flex items-center gap-1 px-1.5 py-1 rounded-md shrink-0',
                    isCurrent && 'bg-primary/10',
                  )}
                  title={step.label}
                >
                  {step.completed
                    ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                    : isCurrent
                      ? <span className="w-3.5 h-3.5 rounded-full bg-amber-500 shrink-0 animate-pulse" />
                      : <Circle className="w-3.5 h-3.5 text-muted-foreground/30 shrink-0" />}
                  <span className={cn(
                    'text-[11px] whitespace-nowrap',
                    isCurrent ? 'font-semibold text-foreground' : step.completed ? 'text-muted-foreground' : 'text-muted-foreground/50',
                  )}>
                    {step.label}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* ── Current step — the ONLY step shown at full detail: owner,
          blocking issue, and its recovery/primary action. ───────────────── */}
      {(() => {
        const currentStep = journey.steps.find(s => !s.completed);
        if (!currentStep) {
          return (
            <div className="rounded-xl border border-emerald-200 dark:border-emerald-900/50 bg-emerald-50/50 dark:bg-emerald-950/10 px-4 py-4 flex items-center gap-3">
              <CheckCircle2 className="w-5 h-5 text-emerald-500 shrink-0" />
              <p className="text-sm font-medium text-foreground">Alla onboarding-steg är klara — kunden är en aktiv kund.</p>
            </div>
          );
        }
        const isBlocked = Boolean(currentStep.blocking_reason);
        // The current step's own primary_action is almost always the exact
        // same action already shown as the big banner button above (both
        // come from the same "first incomplete step" on the backend) — only
        // render it a second time here when it genuinely differs, e.g. the
        // banner is overridden to "Retry Failed Communication" while this
        // step's own action is still something else. One action, one button,
        // never two buttons for the same thing.
        const duplicatesBannerAction = currentStep.primary_action?.action === journey.next_recommended_action.action;
        return (
          <SectionCard icon={isBlocked ? Lock : CheckCircle2} title={`Nuvarande steg: ${currentStep.label}`}>
            <div className="flex items-center gap-2 mb-3 flex-wrap">
              <Badge variant="outline" className="text-[10px]">Ägare: {OWNER_LABEL_SV[currentStep.owner] ?? currentStep.owner}</Badge>
              {currentStep.key === 'administrator_activated' && journey.admin_contact && !journey.admin_contact.activated && (
                <>
                  {journey.admin_contact.invitation_expired && (
                    <Badge className="text-[10px] bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400 border-0">Inbjudan har gått ut</Badge>
                  )}
                  {!journey.admin_contact.invitation_expired && journey.admin_contact.invitation_delivery_status === 'bounced' && (
                    <Badge className="text-[10px] bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400 border-0">E-post studsade</Badge>
                  )}
                  {!journey.admin_contact.invitation_expired && journey.admin_contact.invitation_delivery_status === 'suppressed' && (
                    <Badge className="text-[10px] bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400 border-0">Blockerad av leverantör</Badge>
                  )}
                  {!journey.admin_contact.invitation_expired && journey.admin_contact.invitation_delivery_status === 'delivered' && (
                    <Badge className="text-[10px] bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400 border-0">Levererad</Badge>
                  )}
                </>
              )}
            </div>
            {isBlocked ? (
              <div className="flex items-start gap-2 rounded-lg bg-muted/50 px-3 py-2.5">
                <Lock className="w-4 h-4 text-muted-foreground shrink-0 mt-0.5" />
                <p className="text-sm text-muted-foreground">{currentStep.blocking_reason}</p>
              </div>
            ) : currentStep.primary_action && !duplicatesBannerAction ? (
              <Button
                className="bg-amber-500 hover:bg-amber-600 text-white border-0"
                disabled={anyActionPending}
                onClick={() => runAction(currentStep.primary_action!.action)}
              >
                {(() => { const Icon = ACTION_ICON[currentStep.primary_action.action]; return <Icon className="w-4 h-4 mr-1.5" />; })()}
                {anyActionPending ? 'Vänta…' : currentStep.primary_action.label}
              </Button>
            ) : currentStep.primary_action ? (
              <p className="text-sm text-muted-foreground">Åtgärden finns tillgänglig ovan.</p>
            ) : (
              <p className="text-sm text-muted-foreground">Väntar på kunden — ingen åtgärd tillgänglig från plattformen just nu.</p>
            )}
          </SectionCard>
        );
      })()}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <SectionCard icon={Activity} title="Senaste aktivitet">
          {journey.recent_activity.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">Ingen aktivitet ännu</p>
          ) : (
            <div className="flex flex-col gap-2.5 max-h-64 overflow-y-auto">
              {journey.recent_activity.slice(-8).reverse().map((e, i) => (
                <div key={i} className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm text-foreground">{e.label}</p>
                    {e.actor && <p className="text-xs text-muted-foreground truncate">av {e.actor}</p>}
                  </div>
                  <p className="text-xs text-muted-foreground shrink-0">{new Date(e.occurred_at).toLocaleDateString('sv-SE')}</p>
                </div>
              ))}
            </div>
          )}
        </SectionCard>

        <SectionCard icon={RefreshCw} title="Tillgängliga åtgärder" action={
          journey.customer_contact?.email && (
            <a href={`mailto:${journey.customer_contact.email}`} className="text-xs text-primary hover:underline flex items-center gap-1">
              <Mail className="w-3 h-3" /> {journey.customer_contact.email}
            </a>
          )
        }>
          {(() => {
            // The action already shown as the big banner button (and, when it
            // matches, the current-step button) is never repeated a third
            // time down here — this list is only the OTHER available
            // recovery options, so nothing appears twice on the screen.
            const otherActions = journey.recovery_actions.filter(
              (a) => a !== journey.next_recommended_action.action,
            );
            if (otherActions.length === 0) {
              return <p className="text-sm text-muted-foreground text-center py-4">Inga ytterligare åtgärder tillgängliga just nu</p>;
            }
            return (
            <div className="flex flex-col gap-2">
              {otherActions.map((action: OnboardingRecoveryAction) => {
                const Icon = ACTION_ICON[action];
                const RECOVERY_LABEL: Record<OnboardingRecoveryAction, string> = {
                  'resend-invitation': 'Skicka inbjudan igen',
                  'cancel-invitation': 'Avbryt inbjudan',
                  'send-password-reset': 'Skicka lösenordsåterställning',
                  'force-password-reset': 'Tvinga fram lösenordsåterställning',
                  'approve-go-live': 'Godkänn driftsättning',
                  'retry-communication': 'Försök igen — misslyckad kommunikation',
                };
                return (
                  <Button key={action} variant="outline" size="sm" className="justify-start" disabled={anyActionPending} onClick={() => runAction(action)}>
                    <Icon className="w-3.5 h-3.5 mr-2" />
                    {RECOVERY_LABEL[action]}
                  </Button>
                );
              })}
            </div>
            );
          })()}
          {journey.customer_contact?.phone && (
            <p className="text-xs text-muted-foreground mt-3 flex items-center gap-1.5"><Phone className="w-3 h-3" />{journey.customer_contact.phone}</p>
          )}
          {journey.admin_contact && !journey.customer_contact && (
            <p className="text-xs text-muted-foreground mt-3 flex items-center gap-1.5"><User className="w-3 h-3" />{journey.admin_contact.email}</p>
          )}
          {journey.admin_contact?.activated && (
            <div className="mt-2 flex flex-col gap-0.5 text-xs text-muted-foreground">
              {journey.admin_contact.first_login_at && (
                <span>Första inloggning: {new Date(journey.admin_contact.first_login_at).toLocaleString('sv-SE')}</span>
              )}
              {journey.admin_contact.last_login_at && (
                <span>Senaste inloggning: {new Date(journey.admin_contact.last_login_at).toLocaleString('sv-SE')}</span>
              )}
            </div>
          )}
        </SectionCard>
      </div>
    </div>
  );
}
