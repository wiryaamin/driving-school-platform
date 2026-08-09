import { useState } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import {
  Building2, Users, BookOpen, Car, Package, BarChart3,
  Clock, User, History, ChevronLeft, Calendar, ShieldCheck,
  AlertCircle, UserPlus, MoreHorizontal, ShieldAlert, ScrollText,
  RefreshCw, StickyNote, LogOut, HeartPulse, Mail, CreditCard, MessageSquare,
  Rocket, Settings as SettingsIcon, Pencil,
} from 'lucide-react';
import {
  Skeleton, Badge, Tabs, TabsList, TabsTrigger, TabsContent,
  Avatar, AvatarFallback,
  Table, TableHeader, TableBody, TableHead, TableRow, TableCell,
  Button, toast, Textarea,
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem,
} from '@platform/ui';
import { cn } from '@/lib/utils.js';
import { PageLayout, PageHeader } from '@shared/components/layout/PageLayout/PageLayout.js';
import {
  usePlatformOrgDetail,
  usePlatformOrgStats,
  usePlatformOrgUsers,
  usePlatformOrgTimeline,
  usePlatformOrgSecurity,
  usePlatformOrgCompliance,
  usePlatformOrgOperations,
} from '../hooks/usePlatformOrgDetail.js';
import { useOrgAuditHistory } from '../hooks/usePlatformOrganizations.js';
import { usePlatformOrgHealth } from '../hooks/usePlatformOpsCenter.js';
import type {
  PlatformOrgTimelineEvent, PlatformOrgAdmin, PlatformOrgSecurityEvent, PlatformOrgDeadLetter,
} from '../hooks/usePlatformOrgDetail.js';
import type { OrgHealth } from '../hooks/usePlatformOpsCenter.js';
import type { AuditLogEntry } from '../hooks/usePlatformOrganizations.js';
import {
  useDisableAdmin, useReactivateAdmin, useTransferOwnership, useResendInvitation, useCancelInvitation,
  useSendPasswordReset, useForcePasswordReset, useForceLogout,
  useRetryOrgOperations, useUpdateOrgNotes,
  useExtendTrial, useSuspendOrg, useReactivateOrg, useEndTrial,
} from '../hooks/usePlatformOrgMutations.js';
import { InviteAdminDialog } from '../components/InviteAdminDialog.js';
import { ChangeAdminRoleDialog } from '../components/ChangeAdminRoleDialog.js';
import { EditOrgDialog } from '../components/EditOrgDialog.js';
import { OnboardingJourneyPanel } from '../components/OnboardingJourneyPanel.js';
import { useOnboardingJourney } from '../hooks/usePlatformOnboardingJourney.js';
import { TIER_LABEL } from '../lib/tierDisplay.js';

// ─── Display maps ─────────────────────────────────────────────────────────────

const STATUS_CLASS: Record<string, string> = {
  active:    'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
  suspended: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
  terminated:'bg-gray-100 text-gray-500 dark:bg-gray-800/40 dark:text-gray-400',
};

const STATUS_LABEL: Record<string, string> = {
  active:    'Aktiv',
  suspended: 'Suspenderad',
  terminated:'Avslutad',
};

const SUB_STATUS_LABEL: Record<string, string> = {
  trialing:  'Testperiod',
  active:    'Aktiv',
  past_due:  'Förfallen',
  cancelled: 'Avslutad',
  suspended: 'Suspenderad',
};

const ROLE_LABEL: Record<string, string> = {
  org_owner:   'Ägare',
  org_admin:   'Admin',
  org_manager: 'Chef',
};

const INVITATION_STATUS_LABEL: Record<string, string> = {
  pending:  'Väntande',
  accepted: 'Accepterad',
};

const INVITATION_STATUS_CLASS: Record<string, string> = {
  pending:  'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
  accepted: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
};

// ─── Timeline event label ─────────────────────────────────────────────────────

function timelineEventLabel(e: PlatformOrgTimelineEvent): string {
  switch (e.event_type) {
    case 'org_created':    return 'Organisation skapad';
    case 'org_suspended':  return 'Organisation suspenderad';
    case 'org_reactivated':return 'Organisation återaktiverad';
    case 'org_terminated': return 'Organisation avslutad';
    case 'trial_started':  return 'Testperiod startad';
    case 'trial_ended':    return 'Testperiod avslutad';
    case 'trial_extended': return 'Testperiod förlängd';
    case 'tier_changed':   return 'Prenumerationsnivå ändrad';
    case 'admin_invited': {
      const email = (e.new_values?.['admin_email'] as string | undefined);
      return email ? `Administratör inbjuden (${email})` : 'Administratör inbjuden';
    }
    case 'admin_invitation_resent':    return 'Inbjudan skickad igen';
    case 'admin_invitation_accepted':  return 'Inbjudan accepterad';
    case 'admin_invitation_cancelled': return 'Inbjudan avbruten';
    default:               return 'Organisation uppdaterad';
  }
}

const TIMELINE_EVENT_COLOR: Record<string, string> = {
  org_created:    'bg-primary',
  org_suspended:  'bg-destructive',
  org_reactivated:'bg-green-500',
  org_terminated: 'bg-gray-400',
  trial_started:  'bg-amber-400',
  trial_ended:    'bg-emerald-500',
  trial_extended: 'bg-amber-300',
  tier_changed:   'bg-blue-400',
  org_updated:    'bg-muted-foreground',
  admin_invited:             'bg-indigo-400',
  admin_invitation_resent:   'bg-indigo-300',
  admin_invitation_accepted: 'bg-emerald-500',
  admin_invitation_cancelled:'bg-destructive',
};

// ─── Audit event label ────────────────────────────────────────────────────────

function auditEventLabel(entry: AuditLogEntry): string {
  if (entry.operation === 'INSERT') return 'Organisation skapad';
  if (entry.operation === 'DELETE') return 'Organisation raderad';
  const fields  = entry.changed_fields ?? [];
  const newVals = entry.new_values ?? {};
  if (fields.includes('status')) {
    const s = newVals['status'] as string | undefined;
    if (s === 'suspended')  return 'Organisation suspenderad';
    if (s === 'active')     return 'Organisation återaktiverad';
    if (s === 'terminated') return 'Organisation avslutad';
  }
  if (fields.includes('subscription_status')) {
    const ss = newVals['subscription_status'] as string | undefined;
    if (ss === 'trialing') return 'Testperiod startad';
    if (ss === 'active')   return 'Testperiod avslutad';
  }
  if (fields.includes('trial_ends_at') && !fields.includes('subscription_status')) {
    return 'Testperiod förlängd';
  }
  return 'Organisation uppdaterad';
}

// ─── Security event label ─────────────────────────────────────────────────────

function securityEventLabel(eventType: string): string {
  switch (eventType) {
    case 'invite.created':              return 'Administratör bjöds in';
    case 'invite.resent':               return 'Inbjudan skickad igen';
    case 'password_reset.sent':         return 'Lösenordsåterställning skickad';
    case 'password_reset.forced':       return 'Lösenord återställt (tvingat)';
    case 'session.force_logout':        return 'Administratör utloggad';
    case 'operations.retry_triggered':  return 'Misslyckade händelser återköades';
    default:                            return eventType;
  }
}

// ─── Customer health heuristic ────────────────────────────────────────────────
// A lightweight, honest signal derived entirely from data already fetched for
// the Overview tab — not a new health-scoring subsystem. Deliberately coarse
// (3 states) rather than a numeric score, since there's no validated model
// backing anything more precise yet.

function customerHealthLabel(health: OrgHealth): string {
  if (health.org_status === 'suspended' || health.org_status === 'terminated') return 'Riskabel';
  if (health.subscription_status === 'trialing' && health.trial_ends_at && new Date(health.trial_ends_at) < new Date()) return 'Riskabel';
  const lastActivity = health.last_activity_at ? new Date(health.last_activity_at).getTime() : null;
  if (!lastActivity || Date.now() - lastActivity > 30 * 86_400_000) return 'Inaktiv';
  if (Date.now() - lastActivity <= 7 * 86_400_000) return 'Frisk';
  return 'Måttlig';
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function InfoRow({ label, value }: { label: string; value: string | null | undefined }) {
  if (!value) return null;
  return (
    <div className="flex items-start justify-between gap-4 py-2.5 border-b border-border last:border-0">
      <p className="text-sm text-muted-foreground shrink-0 w-40">{label}</p>
      <p className="text-sm font-medium text-foreground text-right break-all">{value}</p>
    </div>
  );
}

function StatCard({
  label, value, icon: Icon, loading,
}: {
  label: string; value: number | string; icon: React.ElementType; loading: boolean;
}) {
  return (
    <div className="rounded-xl border border-border bg-card p-4 flex items-start gap-3">
      <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
        <Icon className="w-4 h-4 text-primary" />
      </div>
      <div>
        <p className="text-[11px] text-muted-foreground uppercase tracking-wide font-medium">{label}</p>
        {loading ? (
          <Skeleton className="h-6 w-10 mt-1" />
        ) : (
          <p className="text-2xl font-bold text-foreground mt-0.5">{value}</p>
        )}
      </div>
    </div>
  );
}

function SectionError({ message }: { message: string }) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-3">
      <AlertCircle className="w-4 h-4 text-destructive shrink-0" />
      <p className="text-sm text-destructive">{message}</p>
    </div>
  );
}

function SkeletonRows({ count = 3 }: { count?: number }) {
  return (
    <div className="space-y-3 p-4">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="flex items-center gap-4">
          <Skeleton className="h-4 flex-1" />
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-4 w-20" />
        </div>
      ))}
    </div>
  );
}

// ─── Confirm dialog ───────────────────────────────────────────────────────────
// Same local pattern as PlatformOrganizationsPage.tsx's ConfirmDialog — this
// codebase's established convention for a gated, auditable admin action.
// Always mounted by the caller; only `open` toggles (Platform UI Stability
// Hardening Sprint).

function ConfirmDialog({
  open, title, description, confirmLabel, confirmVariant = 'destructive', loading, onConfirm, onCancel,
}: {
  open: boolean; title: string; description: string; confirmLabel: string;
  confirmVariant?: 'default' | 'destructive'; loading: boolean;
  onConfirm: () => void; onCancel: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={open => { if (!open) onCancel(); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader><DialogTitle>{title}</DialogTitle></DialogHeader>
        <p className="text-sm text-muted-foreground">{description}</p>
        <DialogFooter className="pt-2">
          <Button variant="outline" onClick={onCancel} disabled={loading}>Avbryt</Button>
          <Button variant={confirmVariant} onClick={onConfirm} disabled={loading}>
            {loading ? 'Vänta…' : confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Administrator row actions ────────────────────────────────────────────────

type AdminModal =
  | null
  | { type: 'invite' }
  | { type: 'change-role';         admin: PlatformOrgAdmin }
  | { type: 'disable';             admin: PlatformOrgAdmin }
  | { type: 'reactivate';          admin: PlatformOrgAdmin }
  | { type: 'transfer-ownership';  admin: PlatformOrgAdmin }
  | { type: 'resend-invitation';   admin: PlatformOrgAdmin }
  | { type: 'cancel-invitation';   admin: PlatformOrgAdmin }
  | { type: 'send-password-reset'; admin: PlatformOrgAdmin }
  | { type: 'force-password-reset';admin: PlatformOrgAdmin }
  | { type: 'force-logout';        admin: PlatformOrgAdmin };

function AdminRowActions({ admin, onAction }: { admin: PlatformOrgAdmin; onAction: (modal: AdminModal) => void }) {
  const isPending = admin.invitation_status === 'pending';
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="w-8 h-8 rounded-lg flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors"
          aria-label="Fler alternativ"
        >
          <MoreHorizontal className="w-3.5 h-3.5" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-52">
        {isPending && (
          <DropdownMenuItem onClick={() => onAction({ type: 'resend-invitation', admin })}>Skicka inbjudan igen</DropdownMenuItem>
        )}
        <DropdownMenuItem onClick={() => onAction({ type: 'change-role', admin })}>Ändra roll</DropdownMenuItem>
        {admin.role !== 'org_owner' && (
          <DropdownMenuItem onClick={() => onAction({ type: 'transfer-ownership', admin })}>Gör till ägare</DropdownMenuItem>
        )}
        {!isPending && (
          <>
            <DropdownMenuItem onClick={() => onAction({ type: 'send-password-reset', admin })}>
              Skicka lösenordsåterställning
            </DropdownMenuItem>
            <DropdownMenuItem className="text-destructive focus:text-destructive" onClick={() => onAction({ type: 'force-password-reset', admin })}>
              Tvinga lösenordsåterställning
            </DropdownMenuItem>
            <DropdownMenuItem className="text-destructive focus:text-destructive" onClick={() => onAction({ type: 'force-logout', admin })}>
              Logga ut administratör
            </DropdownMenuItem>
          </>
        )}
        {isPending ? (
          <DropdownMenuItem className="text-destructive focus:text-destructive" onClick={() => onAction({ type: 'cancel-invitation', admin })}>
            Avbryt inbjudan
          </DropdownMenuItem>
        ) : admin.membership_status === 'active' ? (
          <DropdownMenuItem className="text-destructive focus:text-destructive" onClick={() => onAction({ type: 'disable', admin })}>
            Inaktivera
          </DropdownMenuItem>
        ) : (
          <DropdownMenuItem onClick={() => onAction({ type: 'reactivate', admin })}>Återaktivera</DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export function PlatformOrganizationDetailPage() {
  const { id }   = useParams<{ id: string }>();
  const navigate  = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const activeTab = searchParams.get('tab') || 'overview';
  function setActiveTab(tab: string) {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      if (tab === 'overview') next.delete('tab'); else next.set('tab', tab);
      return next;
    });
  }

  const { data: org,      isLoading: orgLoading,      error: orgError }      = usePlatformOrgDetail(id);
  const { data: stats,    isLoading: statsLoading,    error: statsError }    = usePlatformOrgStats(id);
  const { data: admins,   isLoading: adminsLoading,   error: adminsError }   = usePlatformOrgUsers(id);
  const { data: timeline, isLoading: timelineLoading, error: timelineError } = usePlatformOrgTimeline(id);
  const { data: audit,    isLoading: auditLoading,    error: auditError }    = useOrgAuditHistory(id ?? null);
  const { data: health,   isLoading: healthLoading,   error: healthError }   = usePlatformOrgHealth(id);
  const { data: security, isLoading: securityLoading, error: securityError } = usePlatformOrgSecurity(id);
  const { data: compliance, isLoading: complianceLoading, error: complianceError } = usePlatformOrgCompliance(id);
  const { data: operations, isLoading: operationsLoading, error: operationsError } = usePlatformOrgOperations(id);
  const { data: journey } = useOnboardingJourney(id);

  const [adminModal, setAdminModal] = useState<AdminModal>(null);
  const [editOrgOpen, setEditOrgOpen] = useState(false);
  const closeAdminModal = () => setAdminModal(null);
  const disableAdmin    = useDisableAdmin(id ?? '');
  const reactivateAdmin = useReactivateAdmin(id ?? '');
  const transferOwnership = useTransferOwnership(id ?? '');
  const resendInvitation  = useResendInvitation(id ?? '');
  const cancelInvitation  = useCancelInvitation(id ?? '');
  const sendPasswordReset  = useSendPasswordReset(id ?? '');
  const forcePasswordReset = useForcePasswordReset(id ?? '');
  const forceLogout        = useForceLogout(id ?? '');
  const retryOperations     = useRetryOrgOperations(id ?? '');
  const updateNotes         = useUpdateOrgNotes(id ?? '');
  const [notesDraft, setNotesDraft] = useState<string | null>(null);

  // ── Subscription operations — existing mutations, never wired to any UI
  // before this pass except the separate Subscription Detail page.
  const extendTrial     = useExtendTrial();
  const suspendOrg      = useSuspendOrg();
  const reactivateOrg   = useReactivateOrg();
  const endTrial        = useEndTrial();

  function adminDisplayName(admin: PlatformOrgAdmin): string {
    return [admin.first_name, admin.last_name].filter(Boolean).join(' ') || admin.email || admin.user_id.substring(0, 8);
  }

  function handleDisableAdmin() {
    if (adminModal?.type !== 'disable') return;
    const { admin } = adminModal;
    disableAdmin.mutate(admin.user_id, {
      onSuccess: () => { toast({ title: 'Inaktiverad', description: `${adminDisplayName(admin)} har inaktiverats` }); closeAdminModal(); },
      onError: (err) => toast({ title: 'Fel', description: err.message, variant: 'destructive' }),
    });
  }

  function handleReactivateAdmin() {
    if (adminModal?.type !== 'reactivate') return;
    const { admin } = adminModal;
    reactivateAdmin.mutate(admin.user_id, {
      onSuccess: () => { toast({ title: 'Återaktiverad', description: `${adminDisplayName(admin)} har återaktiverats` }); closeAdminModal(); },
      onError: (err) => toast({ title: 'Fel', description: err.message, variant: 'destructive' }),
    });
  }

  function handleTransferOwnership() {
    if (adminModal?.type !== 'transfer-ownership') return;
    const { admin } = adminModal;
    transferOwnership.mutate(admin.user_id, {
      onSuccess: () => { toast({ title: 'Ägarskap överfört', description: `${adminDisplayName(admin)} är nu ägare` }); closeAdminModal(); },
      onError: (err) => toast({ title: 'Fel', description: err.message, variant: 'destructive' }),
    });
  }

  function handleResendInvitation() {
    if (adminModal?.type !== 'resend-invitation') return;
    const { admin } = adminModal;
    resendInvitation.mutate(admin.user_id, {
      onSuccess: () => { toast({ title: 'Inbjudan skickad igen', description: `En ny inbjudan har skapats för ${adminDisplayName(admin)}` }); closeAdminModal(); },
      onError: (err) => toast({ title: 'Fel', description: err.message, variant: 'destructive' }),
    });
  }

  function handleCancelInvitation() {
    if (adminModal?.type !== 'cancel-invitation') return;
    const { admin } = adminModal;
    cancelInvitation.mutate(admin.user_id, {
      onSuccess: () => { toast({ title: 'Inbjudan avbruten', description: `Inbjudan till ${adminDisplayName(admin)} har avbrutits` }); closeAdminModal(); },
      onError: (err) => toast({ title: 'Fel', description: err.message, variant: 'destructive' }),
    });
  }

  function handleSendPasswordReset() {
    if (adminModal?.type !== 'send-password-reset') return;
    const { admin } = adminModal;
    sendPasswordReset.mutate(admin.user_id, {
      onSuccess: () => { toast({ title: 'Lösenordsåterställning skickad', description: `Ett e-postmeddelande har skickats till ${adminDisplayName(admin)}` }); closeAdminModal(); },
      onError: (err) => toast({ title: 'Fel', description: err.message, variant: 'destructive' }),
    });
  }

  function handleForcePasswordReset() {
    if (adminModal?.type !== 'force-password-reset') return;
    const { admin } = adminModal;
    forcePasswordReset.mutate(admin.user_id, {
      onSuccess: () => { toast({ title: 'Lösenord återställt', description: `${adminDisplayName(admin)}s tidigare lösenord fungerar inte längre — ett nytt återställningsmejl har skickats` }); closeAdminModal(); },
      onError: (err) => toast({ title: 'Fel', description: err.message, variant: 'destructive' }),
    });
  }

  function handleForceLogout() {
    if (adminModal?.type !== 'force-logout') return;
    const { admin } = adminModal;
    forceLogout.mutate(admin.user_id, {
      onSuccess: () => { toast({ title: 'Utloggad', description: `${adminDisplayName(admin)} har loggats ut från alla enheter` }); closeAdminModal(); },
      onError: (err) => toast({ title: 'Fel', description: err.message, variant: 'destructive' }),
    });
  }

  function handleRetryOperations() {
    retryOperations.mutate(undefined, {
      onSuccess: (result) => toast({
        title: 'Återköat',
        description: `${result.events_requeued} händelser och ${result.messages_requeued} meddelanden köades om`,
      }),
      onError: (err) => toast({ title: 'Fel', description: err.message, variant: 'destructive' }),
    });
  }

  function handleSaveNotes() {
    if (notesDraft === null) return;
    updateNotes.mutate(notesDraft, {
      onSuccess: () => toast({ title: 'Anteckningar sparade' }),
      onError: (err) => toast({ title: 'Fel', description: err.message, variant: 'destructive' }),
    });
  }

  // ── Subscription actions — existing mutations, wired inline for the first time ──
  const [trialExtendDays, setTrialExtendDays] = useState('30');

  function handleExtendTrial() {
    if (!id || !org?.trial_ends_at) return;
    const days = parseInt(trialExtendDays, 10);
    if (!Number.isFinite(days) || days <= 0) return;
    extendTrial.mutate({ orgId: id, days, currentTrialEndsAt: org.trial_ends_at }, {
      onSuccess: () => toast({ title: 'Testperiod förlängd', description: `${days} dagar tillagda` }),
      onError: (err) => toast({ title: 'Fel', description: err.message, variant: 'destructive' }),
    });
  }

  function handleSuspendOrg() {
    if (!id) return;
    suspendOrg.mutate(id, {
      onSuccess: () => toast({ title: 'Organisation suspenderad' }),
      onError: (err) => toast({ title: 'Fel', description: err.message, variant: 'destructive' }),
    });
  }

  function handleReactivateOrg() {
    if (!id) return;
    reactivateOrg.mutate(id, {
      onSuccess: () => toast({ title: 'Organisation återaktiverad' }),
      onError: (err) => toast({ title: 'Fel', description: err.message, variant: 'destructive' }),
    });
  }

  function handleEndTrial() {
    if (!id) return;
    endTrial.mutate({ orgId: id, targetTier: org?.subscription_tier ?? 'starter' }, {
      onSuccess: () => toast({ title: 'Testperiod avslutad', description: 'Organisationen är nu en betalande kund' }),
      onError: (err) => toast({ title: 'Fel', description: err.message, variant: 'destructive' }),
    });
  }

  // ── Org not found / load error ─────────────────────────────────────────────
  if (!orgLoading && orgError) {
    return (
      <PageLayout>
        <div className="flex flex-col items-center justify-center py-20 gap-4">
          <Building2 className="w-12 h-12 text-muted-foreground" />
          <p className="text-sm font-medium text-foreground">Organisation hittades inte</p>
          <p className="text-xs text-muted-foreground">{orgError.message}</p>
          <button
            type="button"
            onClick={() => navigate('/platform/organizations')}
            className="flex items-center gap-1.5 text-sm text-primary hover:underline"
          >
            <ChevronLeft className="w-4 h-4" />
            Tillbaka till organisationer
          </button>
        </div>
      </PageLayout>
    );
  }

  const contactEmail = org?.settings?.['contact_email'] as string | undefined;

  return (
    <PageLayout>
      {/* Header */}
      <div>
        <button
          type="button"
          onClick={() => navigate('/platform/organizations')}
          className="flex items-center gap-1 text-xs text-muted-foreground hover:text-primary transition-colors mb-3"
        >
          <ChevronLeft className="w-3.5 h-3.5" />
          Organisationer
        </button>

        <div className="flex items-start justify-between gap-4">
          <PageHeader
            title={orgLoading ? '…' : (org?.name ?? 'Organisation')}
            description={orgLoading ? undefined : (org?.slug ?? undefined)}
          />
          {org && (
            <Button variant="outline" size="sm" onClick={() => navigate(`/platform/subscriptions/${org.id}`)}>
              Öppna prenumeration
            </Button>
          )}
        </div>

        {/* Status chips */}
        <div className="flex items-center gap-2 flex-wrap mt-3">
          {orgLoading ? (
            <>
              <Skeleton className="h-5 w-16 rounded-full" />
              <Skeleton className="h-5 w-20 rounded-full" />
              <Skeleton className="h-5 w-14 rounded-full" />
            </>
          ) : org ? (
            <>
              <span className={cn(
                'inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold',
                STATUS_CLASS[org.status] ?? 'bg-muted text-muted-foreground',
              )}>
                {STATUS_LABEL[org.status] ?? org.status}
              </span>
              <Badge variant="outline" className="text-xs">
                {TIER_LABEL[org.subscription_tier] ?? org.subscription_tier}
              </Badge>
              <Badge variant="secondary" className="text-xs">
                {SUB_STATUS_LABEL[org.subscription_status] ?? org.subscription_status}
              </Badge>
              {org.trial_ends_at && (
                <span className="flex items-center gap-1 text-xs text-amber-600 dark:text-amber-400">
                  <Calendar className="w-3 h-3" />
                  Trial: {new Date(org.trial_ends_at).toLocaleDateString('sv-SE')}
                </span>
              )}
            </>
          ) : null}
        </div>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="w-full justify-start overflow-x-auto">
          <TabsTrigger value="overview">Översikt</TabsTrigger>
          <TabsTrigger value="onboarding">Onboarding</TabsTrigger>
          <TabsTrigger value="admins">Användare</TabsTrigger>
          <TabsTrigger value="subscription">Prenumeration</TabsTrigger>
          <TabsTrigger value="security">Säkerhet</TabsTrigger>
          <TabsTrigger value="communications">Kommunikation</TabsTrigger>
          <TabsTrigger value="operations">Drift</TabsTrigger>
          <TabsTrigger value="compliance">Efterlevnad</TabsTrigger>
          <TabsTrigger value="support">Support</TabsTrigger>
          <TabsTrigger value="stats">Statistik</TabsTrigger>
          <TabsTrigger value="timeline">Tidslinje</TabsTrigger>
          <TabsTrigger value="audit">Revisionslogg</TabsTrigger>
          <TabsTrigger value="settings">Inställningar</TabsTrigger>
        </TabsList>

        <TabsContent value="onboarding" className="mt-4">
          {id && <OnboardingJourneyPanel orgId={id} onGoLiveApproved={() => setActiveTab('overview')} />}
        </TabsContent>

        {/* ── Overview tab ─────────────────────────────────────────────────── */}
        <TabsContent value="overview" className="space-y-4 mt-4">
          {/* Customer Summary — must immediately answer: what stage, is
              onboarding complete, is anything blocking, what's next. Reuses
              the same onboarding-journey data as the Onboarding tab; never a
              second, independent computation of stage/next-action. */}
          {journey && journey.stage !== 'Complete' && (
            <div className="rounded-xl border-2 border-amber-200 dark:border-amber-900/50 bg-amber-50/50 dark:bg-amber-950/10 p-4 flex items-center justify-between gap-4 flex-wrap">
              <div>
                <p className="text-xs text-amber-700 dark:text-amber-400 uppercase tracking-wide font-semibold mb-0.5">
                  Onboarding pågår — {journey.stage}
                </p>
                <p className="text-base font-bold text-foreground">{journey.next_recommended_action.label}</p>
              </div>
              <Button size="sm" onClick={() => setActiveTab('onboarding')}>
                Gå till onboarding
              </Button>
            </div>
          )}
          {journey && journey.stage === 'Complete' && (
            <div className="rounded-xl border border-emerald-200 dark:border-emerald-900/50 bg-emerald-50/50 dark:bg-emerald-950/10 p-4 flex items-center gap-3">
              <Rocket className="w-5 h-5 text-emerald-500 shrink-0" />
              <p className="text-sm font-medium text-foreground">Onboarding klar — aktiv kund.</p>
            </div>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

            {/* Profile card */}
            <div className="rounded-xl border border-border bg-card">
              <div className="flex items-center gap-2 px-4 py-3 border-b border-border">
                <Building2 className="w-4 h-4 text-muted-foreground" />
                <p className="text-sm font-semibold text-foreground">Organisationsprofil</p>
              </div>
              {orgLoading ? (
                <div className="px-4 py-4 space-y-3">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <div key={i} className="flex justify-between">
                      <Skeleton className="h-4 w-32" />
                      <Skeleton className="h-4 w-40" />
                    </div>
                  ))}
                </div>
              ) : org ? (
                <div className="px-4">
                  <InfoRow label="Juridiskt namn"   value={org.legal_name} />
                  <InfoRow label="Org.nummer"       value={org.org_number} />
                  <InfoRow label="Slug"             value={org.slug} />
                  <InfoRow label="Kontakt-e-post"   value={contactEmail} />
                  <InfoRow label="ID"               value={org.id} />
                  <InfoRow label="Skapad"           value={new Date(org.created_at).toLocaleDateString('sv-SE', { dateStyle: 'long' })} />
                  <InfoRow label="Senast uppdaterad" value={new Date(org.updated_at).toLocaleDateString('sv-SE', { dateStyle: 'long' })} />
                </div>
              ) : null}
            </div>

            {/* Subscription card */}
            <div className="rounded-xl border border-border bg-card">
              <div className="flex items-center gap-2 px-4 py-3 border-b border-border">
                <ShieldCheck className="w-4 h-4 text-muted-foreground" />
                <p className="text-sm font-semibold text-foreground">Prenumeration</p>
              </div>
              {orgLoading ? (
                <div className="px-4 py-4 space-y-3">
                  {Array.from({ length: 4 }).map((_, i) => (
                    <div key={i} className="flex justify-between">
                      <Skeleton className="h-4 w-28" />
                      <Skeleton className="h-4 w-32" />
                    </div>
                  ))}
                </div>
              ) : org ? (
                <div className="px-4">
                  <InfoRow label="Prenumerationsnivå"   value={TIER_LABEL[org.subscription_tier] ?? org.subscription_tier} />
                  <InfoRow label="Prenumerationsstatus" value={SUB_STATUS_LABEL[org.subscription_status] ?? org.subscription_status} />
                  <InfoRow label="Organisationsstatus"  value={STATUS_LABEL[org.status] ?? org.status} />
                  <InfoRow label="Max antal användare"  value={String(org.max_users)} />
                  <InfoRow label="Max antal filialer"   value={String(org.max_locations)} />
                  {org.trial_ends_at && (
                    <InfoRow
                      label="Testperiod slutar"
                      value={new Date(org.trial_ends_at).toLocaleDateString('sv-SE', { dateStyle: 'long' })}
                    />
                  )}
                </div>
              ) : null}
            </div>

            {/* Activity & health card */}
            <div className="rounded-xl border border-border bg-card">
              <div className="flex items-center gap-2 px-4 py-3 border-b border-border">
                <HeartPulse className="w-4 h-4 text-muted-foreground" />
                <p className="text-sm font-semibold text-foreground">Kundhälsa &amp; aktivitet</p>
              </div>
              {healthError && <div className="p-4"><SectionError message="Hälsodata ej tillgänglig" /></div>}
              {healthLoading && (
                <div className="px-4 py-4 space-y-3">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <div key={i} className="flex justify-between">
                      <Skeleton className="h-4 w-32" />
                      <Skeleton className="h-4 w-40" />
                    </div>
                  ))}
                </div>
              )}
              {!healthLoading && !healthError && health && (
                <div className="px-4">
                  <InfoRow label="Hälsostatus" value={customerHealthLabel(health)} />
                  <InfoRow
                    label="Senaste inloggning"
                    value={health.last_login_at ? new Date(health.last_login_at).toLocaleString('sv-SE', { dateStyle: 'short', timeStyle: 'short' }) : 'Aldrig'}
                  />
                  <InfoRow
                    label="Senaste aktivitet"
                    value={health.last_activity_at ? new Date(health.last_activity_at).toLocaleString('sv-SE', { dateStyle: 'short', timeStyle: 'short' }) : 'Ingen registrerad'}
                  />
                  <InfoRow
                    label="Primär administratör"
                    value={health.primary_contact ? `${[health.primary_contact.first_name, health.primary_contact.last_name].filter(Boolean).join(' ') || health.primary_contact.email} (${health.primary_contact.role_display})` : '—'}
                  />
                  <InfoRow label="Kontakt-e-post" value={health.primary_contact?.email} />
                </div>
              )}
            </div>

            {/* Usage counts card */}
            <div className="rounded-xl border border-border bg-card lg:col-span-2">
              <div className="flex items-center gap-2 px-4 py-3 border-b border-border">
                <BarChart3 className="w-4 h-4 text-muted-foreground" />
                <p className="text-sm font-semibold text-foreground">Användning</p>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 p-4">
                <StatCard label="Användare"   value={health?.member_count     ?? 0} icon={Users}    loading={healthLoading} />
                <StatCard label="Elever"      value={health?.student_count    ?? 0} icon={BookOpen} loading={healthLoading} />
                <StatCard label="Lärare"      value={health?.instructor_count ?? 0} icon={Users}     loading={healthLoading} />
                <StatCard label="Fordon"      value={health?.vehicle_count    ?? 0} icon={Car}       loading={healthLoading} />
                <StatCard label="Bokningar"   value={health?.booking_count    ?? 0} icon={Calendar}  loading={healthLoading} />
              </div>
            </div>
          </div>
        </TabsContent>

        {/* ── Administrators tab ────────────────────────────────────────────── */}
        <TabsContent value="admins" className="mt-4">
          <div className="rounded-xl border border-border bg-card overflow-hidden">
            <div className="flex items-center gap-2 px-4 py-3 border-b border-border">
              <Users className="w-4 h-4 text-muted-foreground" />
              <p className="text-sm font-semibold text-foreground">Alla användare</p>
              <Button size="sm" className="ml-auto" onClick={() => setAdminModal({ type: 'invite' })}>
                <UserPlus className="w-3.5 h-3.5 mr-1.5" />
                Bjud in administratör
              </Button>
            </div>

            {adminsError && <div className="p-4"><SectionError message="Kunde inte hämta administratörer" /></div>}
            {adminsLoading && <SkeletonRows count={3} />}

            {!adminsLoading && !adminsError && (admins ?? []).length === 0 && (
              <div className="px-4 py-10 text-center">
                <Users className="w-7 h-7 text-muted-foreground mx-auto mb-2" />
                <p className="text-sm text-muted-foreground">Inga administratörer registrerade</p>
              </div>
            )}

            {!adminsLoading && !adminsError && (admins ?? []).length > 0 && (
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead>Namn</TableHead>
                    <TableHead>Roll</TableHead>
                    <TableHead className="hidden lg:table-cell">Inbjudan</TableHead>
                    <TableHead className="hidden md:table-cell">Senaste inloggning</TableHead>
                    <TableHead className="hidden sm:table-cell">Tilldelad</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="w-10" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(admins as PlatformOrgAdmin[]).map(admin => {
                    const initials = [admin.first_name?.[0], admin.last_name?.[0]]
                      .filter(Boolean).join('').toUpperCase() || '?';
                    const displayName = adminDisplayName(admin);
                    const isActive = admin.membership_status === 'active';
                    return (
                      <TableRow key={admin.user_id}>
                        <TableCell>
                          <div className="flex items-center gap-2.5">
                            <Avatar className="w-7 h-7 shrink-0">
                              <AvatarFallback className="text-[10px] font-semibold">{initials}</AvatarFallback>
                            </Avatar>
                            <div className="min-w-0">
                              <p className="text-sm font-medium text-foreground truncate">{displayName}</p>
                              <p className="text-xs text-muted-foreground truncate">{admin.email ?? '—'}</p>
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className="text-[10px]">
                            {ROLE_LABEL[admin.role] ?? admin.role_display ?? admin.role}
                          </Badge>
                        </TableCell>
                        <TableCell className="hidden lg:table-cell">
                          <span className={cn(
                            'inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold',
                            INVITATION_STATUS_CLASS[admin.invitation_status] ?? 'bg-muted text-muted-foreground',
                          )}>
                            {INVITATION_STATUS_LABEL[admin.invitation_status] ?? admin.invitation_status}
                          </span>
                        </TableCell>
                        <TableCell className="hidden md:table-cell text-xs text-muted-foreground">
                          {admin.last_sign_in_at
                            ? new Date(admin.last_sign_in_at).toLocaleString('sv-SE', { dateStyle: 'short', timeStyle: 'short' })
                            : 'Aldrig'}
                        </TableCell>
                        <TableCell className="hidden sm:table-cell text-xs text-muted-foreground">
                          {new Date(admin.assigned_at).toLocaleDateString('sv-SE')}
                        </TableCell>
                        <TableCell>
                          <span className={cn(
                            'inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold',
                            isActive
                              ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                              : 'bg-gray-100 text-gray-500 dark:bg-gray-800/40 dark:text-gray-400',
                          )}>
                            {isActive ? 'Aktiv' : 'Inaktiverad'}
                          </span>
                        </TableCell>
                        <TableCell>
                          <AdminRowActions admin={admin} onAction={setAdminModal} />
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}
          </div>
        </TabsContent>

        {/* ── Subscription tab ─────────────────────────────────────────────── */}
        <TabsContent value="subscription" className="mt-4 space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="rounded-xl border border-border bg-card">
              <div className="flex items-center gap-2 px-4 py-3 border-b border-border">
                <CreditCard className="w-4 h-4 text-muted-foreground" />
                <p className="text-sm font-semibold text-foreground">Prenumeration</p>
                <Button variant="outline" size="sm" className="ml-auto" onClick={() => navigate(`/platform/subscriptions/${id}`)}>
                  Fullständig detaljvy
                </Button>
              </div>
              {org && (
                <div className="px-4">
                  <InfoRow label="Nivå" value={TIER_LABEL[org.subscription_tier] ?? org.subscription_tier} />
                  <InfoRow label="Status" value={SUB_STATUS_LABEL[org.subscription_status] ?? org.subscription_status} />
                  <InfoRow label="Organisationsstatus" value={STATUS_LABEL[org.status] ?? org.status} />
                  <InfoRow label="Max antal användare" value={String(org.max_users)} />
                  <InfoRow label="Max antal filialer" value={String(org.max_locations)} />
                  {org.trial_ends_at && (
                    <InfoRow label="Testperiod slutar" value={new Date(org.trial_ends_at).toLocaleDateString('sv-SE', { dateStyle: 'long' })} />
                  )}
                </div>
              )}
            </div>

            <div className="rounded-xl border border-border bg-card">
              <div className="flex items-center gap-2 px-4 py-3 border-b border-border">
                <RefreshCw className="w-4 h-4 text-muted-foreground" />
                <p className="text-sm font-semibold text-foreground">Åtgärder</p>
              </div>
              <div className="px-4 py-4 space-y-3">
                {org?.subscription_status === 'trialing' && org.trial_ends_at && (
                  <div className="flex items-center gap-2">
                    <input
                      type="number" min={1} value={trialExtendDays}
                      onChange={(e) => setTrialExtendDays(e.target.value)}
                      className="w-20 h-9 px-2 rounded-md border border-input bg-background text-sm"
                    />
                    <Button size="sm" variant="outline" disabled={extendTrial.isPending} onClick={handleExtendTrial}>
                      Förläng testperiod (dagar)
                    </Button>
                  </div>
                )}
                {org?.subscription_status === 'trialing' && (
                  <Button size="sm" variant="outline" className="w-full justify-start" disabled={endTrial.isPending} onClick={handleEndTrial}>
                    Avsluta testperiod — bli betalande kund
                  </Button>
                )}
                {org?.status === 'active' ? (
                  <Button size="sm" variant="outline" className="w-full justify-start text-destructive" disabled={suspendOrg.isPending} onClick={handleSuspendOrg}>
                    Suspendera organisation
                  </Button>
                ) : (
                  <Button size="sm" variant="outline" className="w-full justify-start" disabled={reactivateOrg.isPending} onClick={handleReactivateOrg}>
                    Återaktivera organisation
                  </Button>
                )}
              </div>
            </div>
          </div>
        </TabsContent>

        {/* ── Communications tab ───────────────────────────────────────────── */}
        <TabsContent value="communications" className="mt-4">
          <div className="rounded-xl border border-border bg-card overflow-hidden">
            <div className="flex items-center gap-2 px-4 py-3 border-b border-border">
              <MessageSquare className="w-4 h-4 text-muted-foreground" />
              <p className="text-sm font-semibold text-foreground">Kommunikation med kunden</p>
              <span className="ml-auto text-[10px] text-muted-foreground">Inbjudningar och lösenordsåterställningar</span>
            </div>
            {securityError && <div className="p-4"><SectionError message="Kommunikationshistorik ej tillgänglig" /></div>}
            {securityLoading && <SkeletonRows count={3} />}
            {!securityLoading && !securityError && (security ?? []).filter((e) => e.event_type.startsWith('invite.') || e.event_type.startsWith('password_reset.')).length === 0 && (
              <div className="px-4 py-10 text-center">
                <MessageSquare className="w-7 h-7 text-muted-foreground mx-auto mb-2" />
                <p className="text-sm text-muted-foreground">Ingen kommunikation registrerad ännu</p>
              </div>
            )}
            {!securityLoading && !securityError && (
              <div className="divide-y divide-border">
                {(security ?? [])
                  .filter((e) => e.event_type.startsWith('invite.') || e.event_type.startsWith('password_reset.'))
                  .map((e) => (
                    <div key={e.id} className="flex items-center justify-between gap-3 px-4 py-3">
                      <p className="text-sm text-foreground">{securityEventLabel(e.event_type)}</p>
                      <p className="text-xs text-muted-foreground">{new Date(e.occurred_at).toLocaleString('sv-SE', { dateStyle: 'short', timeStyle: 'short' })}</p>
                    </div>
                  ))}
              </div>
            )}
          </div>
        </TabsContent>

        {/* ── Security tab ─────────────────────────────────────────────────── */}
        <TabsContent value="security" className="mt-4 space-y-4">
          <div className="rounded-xl border border-border bg-card">
            <div className="flex items-center gap-2 px-4 py-3 border-b border-border">
              <ShieldAlert className="w-4 h-4 text-muted-foreground" />
              <p className="text-sm font-semibold text-foreground">Administratörskonton</p>
            </div>
            {!adminsLoading && !adminsError && (
              <div className="divide-y divide-border">
                {(admins ?? []).map((admin) => {
                  const isActive = admin.membership_status === 'active';
                  return (
                    <div key={admin.user_id} className="flex items-center justify-between gap-3 px-4 py-3">
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-foreground truncate">{adminDisplayName(admin)}</p>
                        <p className="text-xs text-muted-foreground truncate">{admin.email ?? '—'}</p>
                      </div>
                      <div className="flex items-center gap-3 shrink-0 text-xs text-muted-foreground">
                        <span>{admin.last_sign_in_at ? `Inloggad ${new Date(admin.last_sign_in_at).toLocaleDateString('sv-SE')}` : 'Aldrig inloggad'}</span>
                        <span className={cn(
                          'inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold',
                          isActive ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' : 'bg-gray-100 text-gray-500 dark:bg-gray-800/40 dark:text-gray-400',
                        )}>
                          {isActive ? 'Aktivt' : 'Inaktiverat'}
                        </span>
                      </div>
                    </div>
                  );
                })}
                {(admins ?? []).length === 0 && (
                  <p className="px-4 py-6 text-sm text-muted-foreground text-center">Inga administratörer</p>
                )}
              </div>
            )}
          </div>

          <div className="rounded-xl border border-border bg-card">
            <div className="flex items-center gap-2 px-4 py-3 border-b border-border">
              <ScrollText className="w-4 h-4 text-muted-foreground" />
              <p className="text-sm font-semibold text-foreground">Säkerhetshändelser</p>
              <span className="ml-auto text-[10px] text-muted-foreground">Inloggningar, inbjudningar, lösenordsåterställningar</span>
            </div>

            {securityError && <div className="p-4"><SectionError message="Säkerhetshändelser ej tillgängliga" /></div>}
            {securityLoading && <SkeletonRows count={4} />}

            {!securityLoading && !securityError && (security ?? []).length === 0 && (
              <div className="px-4 py-10 text-center">
                <ScrollText className="w-7 h-7 text-muted-foreground mx-auto mb-2" />
                <p className="text-sm text-muted-foreground">Inga säkerhetshändelser registrerade</p>
              </div>
            )}

            {!securityLoading && !securityError && (security ?? []).length > 0 && (
              <div className="divide-y divide-border">
                {(security as PlatformOrgSecurityEvent[]).map((event) => (
                  <div key={event.id} className="flex items-center justify-between gap-3 px-4 py-3">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-foreground">{securityEventLabel(event.event_type)}</p>
                      {event.actor_email && <p className="text-xs text-muted-foreground truncate">{event.actor_email}</p>}
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {event.severity !== 'info' && (
                        <Badge variant={event.severity === 'critical' ? 'destructive' : 'secondary'} className="text-[10px]">
                          {event.severity === 'critical' ? 'Kritisk' : 'Varning'}
                        </Badge>
                      )}
                      <span className="text-[11px] text-muted-foreground whitespace-nowrap">
                        {new Date(event.occurred_at).toLocaleString('sv-SE', { dateStyle: 'short', timeStyle: 'short' })}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </TabsContent>

        {/* ── Operations (Drift) tab ────────────────────────────────────────── */}
        <TabsContent value="operations" className="mt-4 space-y-4">
          {operationsError && <SectionError message="Driftdata ej tillgänglig" />}

          {!operationsError && (
            <>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <StatCard label="Väntande"          value={operations?.pending_count      ?? 0} icon={Clock}        loading={operationsLoading} />
                <StatCard label="Bearbetas"         value={operations?.processing_count   ?? 0} icon={RefreshCw}    loading={operationsLoading} />
                <StatCard label="Dead-letter"       value={operations?.dead_letter_count  ?? 0} icon={AlertCircle}  loading={operationsLoading} />
                <StatCard label="Misslyckade (24h)" value={operations?.failed_last_24h    ?? 0} icon={ShieldAlert}  loading={operationsLoading} />
              </div>

              <div className="rounded-xl border border-border bg-card">
                <div className="flex items-center gap-2 px-4 py-3 border-b border-border">
                  <RefreshCw className="w-4 h-4 text-muted-foreground" />
                  <p className="text-sm font-semibold text-foreground">Dead-letter-händelser</p>
                  <Button
                    size="sm" variant="outline" className="ml-auto"
                    disabled={retryOperations.isPending || !operations?.dead_letter_count}
                    onClick={handleRetryOperations}
                  >
                    <RefreshCw className="w-3.5 h-3.5 mr-1.5" />
                    {retryOperations.isPending ? 'Köar om…' : 'Försök igen'}
                  </Button>
                </div>

                {!operationsLoading && (operations?.recent_dead_letters ?? []).length === 0 && (
                  <div className="px-4 py-10 text-center">
                    <RefreshCw className="w-7 h-7 text-muted-foreground mx-auto mb-2" />
                    <p className="text-sm text-muted-foreground">Inga misslyckade händelser</p>
                  </div>
                )}

                {(operations?.recent_dead_letters ?? []).length > 0 && (
                  <div className="divide-y divide-border">
                    {(operations!.recent_dead_letters as PlatformOrgDeadLetter[]).map((d) => (
                      <div key={d.id} className="px-4 py-3">
                        <div className="flex items-center justify-between gap-3">
                          <p className="text-sm font-medium text-foreground">{d.event_type}</p>
                          <span className="text-[11px] text-muted-foreground whitespace-nowrap">
                            {new Date(d.dead_lettered_at).toLocaleString('sv-SE', { dateStyle: 'short', timeStyle: 'short' })}
                          </span>
                        </div>
                        {d.last_error && <p className="text-xs text-destructive mt-0.5 truncate">{d.last_error}</p>}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}
        </TabsContent>

        {/* ── Compliance (Efterlevnad) tab ──────────────────────────────────── */}
        <TabsContent value="compliance" className="mt-4 space-y-4">
          {complianceError && <SectionError message="Efterlevnadsdata ej tillgänglig" />}

          {!complianceError && (
            <>
              <div className="rounded-xl border border-border bg-card">
                <div className="flex items-center gap-2 px-4 py-3 border-b border-border">
                  <ShieldCheck className="w-4 h-4 text-muted-foreground" />
                  <p className="text-sm font-semibold text-foreground">GDPR &amp; samtycke (elever)</p>
                </div>
                {complianceLoading ? (
                  <div className="px-4 py-4"><SkeletonRows count={4} /></div>
                ) : compliance ? (
                  <div className="px-4">
                    <InfoRow label="Totalt antal elever"        value={String(compliance.student_consent.total_students)} />
                    <InfoRow label="GDPR-samtycke lämnat"        value={`${compliance.student_consent.gdpr_consent_given_count} / ${compliance.student_consent.total_students}`} />
                    <InfoRow label="Databehandlingssamtycke"     value={`${compliance.student_consent.data_processing_consent_count} / ${compliance.student_consent.total_students}`} />
                    <InfoRow label="Marknadsföringssamtycke"     value={`${compliance.student_consent.marketing_consent_count} / ${compliance.student_consent.total_students}`} />
                    <InfoRow label="E-post opt-in"               value={`${compliance.student_consent.email_opt_in_count} / ${compliance.student_consent.total_students}`} />
                    <InfoRow label="SMS opt-in"                  value={`${compliance.student_consent.sms_opt_in_count} / ${compliance.student_consent.total_students}`} />
                  </div>
                ) : null}
              </div>

              <div className="rounded-xl border border-border bg-card">
                <div className="flex items-center gap-2 px-4 py-3 border-b border-border">
                  <ScrollText className="w-4 h-4 text-muted-foreground" />
                  <p className="text-sm font-semibold text-foreground">Regulatoriska ärenden</p>
                </div>
                {complianceLoading ? (
                  <div className="px-4 py-4"><SkeletonRows count={3} /></div>
                ) : compliance ? (
                  <div className="px-4">
                    <InfoRow label="Totalt"    value={String(compliance.regulatory_workflows.total)} />
                    <InfoRow label="Försenade" value={String(compliance.regulatory_workflows.overdue)} />
                    <InfoRow label="Bekräftade" value={String(compliance.regulatory_workflows.confirmed)} />
                  </div>
                ) : null}
              </div>
            </>
          )}
        </TabsContent>

        {/* ── Support tab ───────────────────────────────────────────────────── */}
        <TabsContent value="support" className="mt-4 space-y-4">
          <div className="rounded-xl border border-border bg-card">
            <div className="flex items-center gap-2 px-4 py-3 border-b border-border">
              <StickyNote className="w-4 h-4 text-muted-foreground" />
              <p className="text-sm font-semibold text-foreground">Interna anteckningar</p>
              {org?.internal_notes_updated_at && (
                <span className="ml-auto text-[10px] text-muted-foreground">
                  Senast sparad {new Date(org.internal_notes_updated_at).toLocaleString('sv-SE', { dateStyle: 'short', timeStyle: 'short' })}
                </span>
              )}
            </div>
            <div className="p-4 space-y-3">
              <Textarea
                rows={6}
                placeholder="Anteckningar synliga endast för plattformsadministratörer…"
                value={notesDraft ?? org?.internal_notes ?? ''}
                onChange={(e) => setNotesDraft(e.target.value)}
                disabled={orgLoading}
              />
              <div className="flex justify-end">
                <Button size="sm" onClick={handleSaveNotes} disabled={updateNotes.isPending || notesDraft === null}>
                  {updateNotes.isPending ? 'Sparar…' : 'Spara anteckningar'}
                </Button>
              </div>
            </div>
          </div>

          <div className="rounded-xl border border-border bg-card">
            <div className="flex items-center gap-2 px-4 py-3 border-b border-border">
              <Mail className="w-4 h-4 text-muted-foreground" />
              <p className="text-sm font-semibold text-foreground">Primär kontakt</p>
            </div>
            {healthLoading ? (
              <div className="px-4 py-4"><SkeletonRows count={2} /></div>
            ) : health?.primary_contact ? (
              <div className="px-4">
                <InfoRow label="Namn" value={[health.primary_contact.first_name, health.primary_contact.last_name].filter(Boolean).join(' ') || null} />
                <InfoRow label="E-post" value={health.primary_contact.email} />
                <InfoRow label="Roll" value={health.primary_contact.role_display} />
                <InfoRow
                  label="Välkomstinbjudan"
                  value={health.primary_contact.last_sign_in_at ? 'Accepterad' : 'Väntande — se fliken Administratörer för att skicka igen'}
                />
              </div>
            ) : (
              <p className="px-4 py-6 text-sm text-muted-foreground text-center">Ingen primär kontakt registrerad</p>
            )}
          </div>

          <div className="rounded-xl border border-border bg-card p-4">
            <div className="flex items-start gap-3">
              <LogOut className="w-4 h-4 text-muted-foreground shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-medium text-foreground">Logga in som användare (impersonering)</p>
                <p className="text-xs text-muted-foreground mt-1 max-w-2xl">
                  Inte implementerat i denna version. Att låta en plattformsadministratör logga in som en
                  kund kräver en separat, kortlivad sessionsmekanism (utfärdande och återkallande av token,
                  automatisk utgång, en tydlig banderoll i gränssnittet under hela sessionen) utöver det som
                  finns idag — databasens skrivskydd för denna typ av session finns redan förberett
                  (`is_impersonating()`), men själva inloggningsmekanismen är medvetet inte byggd än.
                  Branschstandarden istället: använd Administratörer-fliken (Skicka lösenordsåterställning,
                  Tvinga fram återställning) för att hjälpa en kund direkt, eller granska kontot via
                  Säkerhet/Drift-flikarna utan att logga in som dem.
                </p>
              </div>
            </div>
          </div>
        </TabsContent>

        {/* ── Statistics tab ────────────────────────────────────────────────── */}
        <TabsContent value="stats" className="mt-4 space-y-4">
          {statsError && <SectionError message="Statistik ej tillgänglig — platform-admin Edge Function är inte driftsatt ännu." />}

          {!statsError && (
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              <StatCard label="Elever"      value={stats?.student_count    ?? 0} icon={BookOpen}  loading={statsLoading} />
              <StatCard label="Lärare"      value={stats?.instructor_count ?? 0} icon={Users}     loading={statsLoading} />
              <StatCard label="Fordon"      value={stats?.vehicle_count    ?? 0} icon={Car}       loading={statsLoading} />
              <StatCard label="Bokningar"   value={stats?.booking_count    ?? 0} icon={Calendar}  loading={statsLoading} />
              <StatCard label="Paket"       value={stats?.package_count    ?? 0} icon={Package}   loading={statsLoading} />
              <StatCard label="Användare"   value={stats?.member_count     ?? 0} icon={BarChart3} loading={statsLoading} />
            </div>
          )}
        </TabsContent>

        {/* ── Timeline tab ──────────────────────────────────────────────────── */}
        <TabsContent value="timeline" className="mt-4">
          <div className="rounded-xl border border-border bg-card">
            <div className="flex items-center gap-2 px-4 py-3 border-b border-border">
              <Clock className="w-4 h-4 text-muted-foreground" />
              <p className="text-sm font-semibold text-foreground">Händelsetidslinje</p>
            </div>

            {timelineError && <div className="p-4"><SectionError message="Tidslinje ej tillgänglig — platform-admin Edge Function är inte driftsatt ännu." /></div>}
            {timelineLoading && (
              <div className="px-4 py-4 space-y-4">
                {Array.from({ length: 4 }).map((_, i) => (
                  <div key={i} className="flex gap-3">
                    <Skeleton className="w-2.5 h-2.5 rounded-full mt-1.5 shrink-0" />
                    <div className="space-y-1 flex-1">
                      <Skeleton className="h-4 w-48" />
                      <Skeleton className="h-3 w-32" />
                    </div>
                  </div>
                ))}
              </div>
            )}

            {!timelineLoading && !timelineError && (timeline ?? []).length === 0 && (
              <div className="px-4 py-10 text-center">
                <Clock className="w-7 h-7 text-muted-foreground mx-auto mb-2" />
                <p className="text-sm text-muted-foreground">Ingen händelsehistorik</p>
              </div>
            )}

            {!timelineLoading && !timelineError && (timeline ?? []).length > 0 && (
              <div className="px-4 py-4">
                <div className="relative pl-5 space-y-5">
                  {/* Vertical line */}
                  <div className="absolute left-[5px] top-2 bottom-2 w-px bg-border" />

                  {(timeline as PlatformOrgTimelineEvent[]).map((event, idx) => {
                    const dotColor = TIMELINE_EVENT_COLOR[event.event_type] ?? 'bg-muted-foreground';
                    return (
                      <div key={event.id ?? idx} className="relative flex gap-3">
                        {/* Dot */}
                        <div className={cn('w-2.5 h-2.5 rounded-full shrink-0 mt-1.5 -ml-5 relative z-10 ring-2 ring-background', dotColor)} />
                        {/* Content */}
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium text-foreground leading-snug">
                            {timelineEventLabel(event)}
                          </p>
                          <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                            {(event.actor_email ?? event.actor_id) && (
                              <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
                                <User className="w-3 h-3 shrink-0" />
                                {event.actor_email ?? `${event.actor_id?.substring(0, 8) ?? ''}…`}
                              </span>
                            )}
                            <span className="text-[11px] text-muted-foreground">
                              {new Date(event.occurred_at).toLocaleString('sv-SE', {
                                dateStyle: 'short', timeStyle: 'short',
                              })}
                            </span>
                          </div>
                          {event.new_values && event.event_type === 'tier_changed' && (
                            <p className="text-[11px] text-muted-foreground mt-0.5">
                              Ny nivå: {TIER_LABEL[event.new_values['subscription_tier'] as string] ?? String(event.new_values['subscription_tier'])}
                            </p>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </TabsContent>

        {/* ── Audit tab ─────────────────────────────────────────────────────── */}
        <TabsContent value="audit" className="mt-4">
          <div className="rounded-xl border border-border bg-card">
            <div className="flex items-center gap-2 px-4 py-3 border-b border-border">
              <History className="w-4 h-4 text-muted-foreground" />
              <p className="text-sm font-semibold text-foreground">Revisionslogg</p>
              <span className="ml-auto text-[10px] text-muted-foreground">Senaste 20 händelserna</span>
            </div>

            {auditError && <div className="p-4"><SectionError message="Kunde inte hämta revisionslogg" /></div>}
            {auditLoading && (
              <div className="px-4 py-4 space-y-3">
                {Array.from({ length: 4 }).map((_, i) => (
                  <div key={i} className="space-y-1">
                    <Skeleton className="h-3.5 w-52" />
                    <Skeleton className="h-3 w-36" />
                  </div>
                ))}
              </div>
            )}

            {!auditLoading && !auditError && (!audit || audit.length === 0) && (
              <div className="px-4 py-10 text-center">
                <History className="w-7 h-7 text-muted-foreground mx-auto mb-2" />
                <p className="text-sm text-muted-foreground">Ingen revisionslogg</p>
              </div>
            )}

            {!auditLoading && !auditError && audit && audit.length > 0 && (
              <div className="divide-y divide-border">
                {(audit as AuditLogEntry[]).map(entry => (
                  <div key={entry.id} className="px-4 py-3">
                    <p className="text-xs font-medium text-foreground">{auditEventLabel(entry)}</p>
                    <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                      <User className="w-3 h-3 text-muted-foreground shrink-0" />
                      <p className="text-[11px] text-muted-foreground truncate">
                        {entry.actor_display
                          ?? (entry.actor_id
                            ? `Admin (${entry.actor_id.substring(0, 8)}…)`
                            : 'System')}
                      </p>
                      <span className="text-[11px] text-muted-foreground shrink-0 ml-auto">
                        {new Date(entry.occurred_at).toLocaleString('sv-SE', {
                          dateStyle: 'short', timeStyle: 'short',
                        })}
                      </span>
                    </div>
                    {entry.changed_fields && entry.changed_fields.length > 0 && (
                      <p className="text-[10px] text-muted-foreground mt-0.5">
                        Fält: {entry.changed_fields.join(', ')}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </TabsContent>

        {/* ── Settings tab — reuses the existing EditOrgDialog/useUpdateOrg
             mutation (already used from the Organizations list); no second
             org-profile write path. ────────────────────────────────────── */}
        <TabsContent value="settings" className="mt-4">
          <div className="rounded-xl border border-border bg-card">
            <div className="flex items-center gap-2 px-4 py-3 border-b border-border">
              <SettingsIcon className="w-4 h-4 text-muted-foreground" />
              <p className="text-sm font-semibold text-foreground">Organisationsinställningar</p>
              <Button size="sm" variant="outline" className="ml-auto" onClick={() => setEditOrgOpen(true)} disabled={!org}>
                <Pencil className="w-3.5 h-3.5 mr-1.5" />
                Redigera
              </Button>
            </div>
            {orgLoading ? (
              <div className="px-4 py-4"><SkeletonRows count={5} /></div>
            ) : org ? (
              <div className="px-4">
                <InfoRow label="Organisationsnamn"    value={org.name} />
                <InfoRow label="Juridiskt namn"        value={org.legal_name} />
                <InfoRow label="Org.nummer"            value={org.org_number} />
                <InfoRow label="Kontakt-e-post"        value={contactEmail} />
                <InfoRow label="Prenumerationsnivå"    value={TIER_LABEL[org.subscription_tier] ?? org.subscription_tier} />
                <InfoRow label="Max antal användare"   value={String(org.max_users)} />
                <InfoRow label="Max antal filialer"    value={String(org.max_locations)} />
              </div>
            ) : null}
          </div>
        </TabsContent>
      </Tabs>

      {/* ── Administrator management modals ── */}
      {/* Always mounted; only `open` toggles (Platform UI Stability Hardening
          Sprint) — see PlatformOrganizationsPage.tsx's ConfirmDialog for the
          reference implementation of this pattern. */}
      <InviteAdminDialog
        open={adminModal?.type === 'invite' && !!org}
        orgId={org?.id ?? ''} orgName={org?.name ?? ''}
        onClose={closeAdminModal}
      />
      <ChangeAdminRoleDialog
        open={adminModal?.type === 'change-role' && !!org}
        orgId={org?.id ?? ''}
        admin={adminModal?.type === 'change-role' ? adminModal.admin : null}
        onClose={closeAdminModal}
      />
      <EditOrgDialog
        open={editOrgOpen && !!org}
        org={org ?? null}
        onClose={() => setEditOrgOpen(false)}
      />
      <ConfirmDialog
        open={
          adminModal?.type === 'disable' || adminModal?.type === 'reactivate' ||
          adminModal?.type === 'transfer-ownership' || adminModal?.type === 'resend-invitation' ||
          adminModal?.type === 'cancel-invitation' || adminModal?.type === 'send-password-reset' ||
          adminModal?.type === 'force-password-reset' || adminModal?.type === 'force-logout'
        }
        title={
          adminModal?.type === 'disable'              ? 'Inaktivera administratör' :
          adminModal?.type === 'reactivate'            ? 'Återaktivera administratör' :
          adminModal?.type === 'transfer-ownership'    ? 'Överför ägarskap' :
          adminModal?.type === 'resend-invitation'     ? 'Skicka inbjudan igen' :
          adminModal?.type === 'cancel-invitation'     ? 'Avbryt inbjudan' :
          adminModal?.type === 'send-password-reset'   ? 'Skicka lösenordsåterställning' :
          adminModal?.type === 'force-password-reset'  ? 'Tvinga fram lösenordsåterställning' :
          adminModal?.type === 'force-logout'          ? 'Logga ut administratör' : ''
        }
        description={
          adminModal?.type === 'disable'
            ? `${adminDisplayName(adminModal.admin)} förlorar omedelbart åtkomst till organisationen. Kan återaktiveras när som helst.`
          : adminModal?.type === 'reactivate'
            ? `${adminDisplayName(adminModal.admin)} får åter åtkomst till organisationen.`
          : adminModal?.type === 'transfer-ownership'
            ? `${adminDisplayName(adminModal.admin)} blir organisationens nya ägare. Den nuvarande ägaren behåller admin-åtkomst.`
          : adminModal?.type === 'resend-invitation'
            ? `En ny inbjudan skickas till ${adminDisplayName(adminModal.admin)}. Den tidigare länken slutar fungera.`
          : adminModal?.type === 'cancel-invitation'
            ? `Inbjudan till ${adminDisplayName(adminModal.admin)} avbryts och kontot tas bort permanent. Detta kan inte ångras.`
          : adminModal?.type === 'send-password-reset'
            ? `${adminDisplayName(adminModal.admin)} får ett e-postmeddelande med en länk för att välja ett nytt lösenord. Det nuvarande lösenordet fortsätter fungera tills dess.`
          : adminModal?.type === 'force-password-reset'
            ? `${adminDisplayName(adminModal.admin)}s nuvarande lösenord slutar fungera omedelbart. Ett e-postmeddelande med en länk för att välja ett nytt lösenord skickas samtidigt.`
          : adminModal?.type === 'force-logout'
            ? `${adminDisplayName(adminModal.admin)} loggas ut från alla enheter omedelbart. Lösenordet ändras inte — de kan logga in igen direkt.`
          : ''
        }
        confirmLabel={
          adminModal?.type === 'disable'              ? 'Inaktivera' :
          adminModal?.type === 'reactivate'            ? 'Återaktivera' :
          adminModal?.type === 'transfer-ownership'    ? 'Överför ägarskap' :
          adminModal?.type === 'resend-invitation'     ? 'Skicka igen' :
          adminModal?.type === 'cancel-invitation'     ? 'Avbryt inbjudan' :
          adminModal?.type === 'send-password-reset'   ? 'Skicka' :
          adminModal?.type === 'force-password-reset'  ? 'Tvinga fram återställning' :
          adminModal?.type === 'force-logout'          ? 'Logga ut' : ''
        }
        confirmVariant={
          adminModal?.type === 'reactivate' || adminModal?.type === 'resend-invitation' ||
          adminModal?.type === 'send-password-reset'
            ? 'default' : 'destructive'
        }
        loading={
          disableAdmin.isPending || reactivateAdmin.isPending || transferOwnership.isPending ||
          resendInvitation.isPending || cancelInvitation.isPending ||
          sendPasswordReset.isPending || forcePasswordReset.isPending || forceLogout.isPending
        }
        onConfirm={
          adminModal?.type === 'disable'              ? handleDisableAdmin :
          adminModal?.type === 'reactivate'            ? handleReactivateAdmin :
          adminModal?.type === 'transfer-ownership'    ? handleTransferOwnership :
          adminModal?.type === 'resend-invitation'     ? handleResendInvitation :
          adminModal?.type === 'cancel-invitation'     ? handleCancelInvitation :
          adminModal?.type === 'send-password-reset'   ? handleSendPasswordReset :
          adminModal?.type === 'force-password-reset'  ? handleForcePasswordReset :
          adminModal?.type === 'force-logout'          ? handleForceLogout : closeAdminModal
        }
        onCancel={closeAdminModal}
      />
    </PageLayout>
  );
}
