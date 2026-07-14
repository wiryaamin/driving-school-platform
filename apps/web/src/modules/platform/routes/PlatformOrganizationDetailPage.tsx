import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Building2, Users, BookOpen, Car, Package, BarChart3,
  Clock, User, History, ChevronLeft, Calendar, ShieldCheck,
  AlertCircle, UserPlus, MoreHorizontal,
} from 'lucide-react';
import {
  Skeleton, Badge, Tabs, TabsList, TabsTrigger, TabsContent,
  Avatar, AvatarFallback,
  Table, TableHeader, TableBody, TableHead, TableRow, TableCell,
  Button, toast,
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem,
} from '@platform/ui';
import { cn } from '@/lib/utils.js';
import { PageLayout, PageHeader } from '@shared/components/layout/PageLayout/PageLayout.js';
import {
  usePlatformOrgDetail,
  usePlatformOrgStats,
  usePlatformOrgAdmins,
  usePlatformOrgTimeline,
} from '../hooks/usePlatformOrgDetail.js';
import { useOrgAuditHistory } from '../hooks/usePlatformOrganizations.js';
import type { PlatformOrgTimelineEvent, PlatformOrgAdmin } from '../hooks/usePlatformOrgDetail.js';
import type { AuditLogEntry } from '../hooks/usePlatformOrganizations.js';
import { useDisableAdmin, useReactivateAdmin, useTransferOwnership, useResendInvitation, useCancelInvitation } from '../hooks/usePlatformOrgMutations.js';
import { InviteAdminDialog } from '../components/InviteAdminDialog.js';
import { ChangeAdminRoleDialog } from '../components/ChangeAdminRoleDialog.js';
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
  | { type: 'change-role';        admin: PlatformOrgAdmin }
  | { type: 'disable';            admin: PlatformOrgAdmin }
  | { type: 'reactivate';         admin: PlatformOrgAdmin }
  | { type: 'transfer-ownership'; admin: PlatformOrgAdmin }
  | { type: 'resend-invitation';  admin: PlatformOrgAdmin }
  | { type: 'cancel-invitation';  admin: PlatformOrgAdmin };

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

  const { data: org,      isLoading: orgLoading,      error: orgError }      = usePlatformOrgDetail(id);
  const { data: stats,    isLoading: statsLoading,    error: statsError }    = usePlatformOrgStats(id);
  const { data: admins,   isLoading: adminsLoading,   error: adminsError }   = usePlatformOrgAdmins(id);
  const { data: timeline, isLoading: timelineLoading, error: timelineError } = usePlatformOrgTimeline(id);
  const { data: audit,    isLoading: auditLoading,    error: auditError }    = useOrgAuditHistory(id ?? null);

  const [adminModal, setAdminModal] = useState<AdminModal>(null);
  const closeAdminModal = () => setAdminModal(null);
  const disableAdmin    = useDisableAdmin(id ?? '');
  const reactivateAdmin = useReactivateAdmin(id ?? '');
  const transferOwnership = useTransferOwnership(id ?? '');
  const resendInvitation  = useResendInvitation(id ?? '');
  const cancelInvitation  = useCancelInvitation(id ?? '');

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
      <Tabs defaultValue="overview">
        <TabsList className="w-full justify-start overflow-x-auto">
          <TabsTrigger value="overview">Översikt</TabsTrigger>
          <TabsTrigger value="admins">Administratörer</TabsTrigger>
          <TabsTrigger value="stats">Statistik</TabsTrigger>
          <TabsTrigger value="timeline">Tidslinje</TabsTrigger>
          <TabsTrigger value="audit">Revisionslogg</TabsTrigger>
        </TabsList>

        {/* ── Overview tab ─────────────────────────────────────────────────── */}
        <TabsContent value="overview" className="space-y-4 mt-4">
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
          </div>
        </TabsContent>

        {/* ── Administrators tab ────────────────────────────────────────────── */}
        <TabsContent value="admins" className="mt-4">
          <div className="rounded-xl border border-border bg-card overflow-hidden">
            <div className="flex items-center gap-2 px-4 py-3 border-b border-border">
              <Users className="w-4 h-4 text-muted-foreground" />
              <p className="text-sm font-semibold text-foreground">Organisationsadministratörer</p>
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
      <ConfirmDialog
        open={
          adminModal?.type === 'disable' || adminModal?.type === 'reactivate' ||
          adminModal?.type === 'transfer-ownership' || adminModal?.type === 'resend-invitation' ||
          adminModal?.type === 'cancel-invitation'
        }
        title={
          adminModal?.type === 'disable'            ? 'Inaktivera administratör' :
          adminModal?.type === 'reactivate'          ? 'Återaktivera administratör' :
          adminModal?.type === 'transfer-ownership'  ? 'Överför ägarskap' :
          adminModal?.type === 'resend-invitation'   ? 'Skicka inbjudan igen' :
          adminModal?.type === 'cancel-invitation'   ? 'Avbryt inbjudan' : ''
        }
        description={
          adminModal?.type === 'disable'
            ? `${adminDisplayName(adminModal.admin)} förlorar omedelbart åtkomst till organisationen. Kan återaktiveras när som helst.`
          : adminModal?.type === 'reactivate'
            ? `${adminDisplayName(adminModal.admin)} får åter åtkomst till organisationen.`
          : adminModal?.type === 'transfer-ownership'
            ? `${adminDisplayName(adminModal.admin)} blir organisationens nya ägare. Den nuvarande ägaren behåller admin-åtkomst.`
          : adminModal?.type === 'resend-invitation'
            ? `Ett nytt konto-lösenord skapas för ${adminDisplayName(adminModal.admin)} och en ny inbjudan köas. Den tidigare inbjudan avbryts.`
          : adminModal?.type === 'cancel-invitation'
            ? `Inbjudan till ${adminDisplayName(adminModal.admin)} avbryts och kontot tas bort permanent. Detta kan inte ångras.`
          : ''
        }
        confirmLabel={
          adminModal?.type === 'disable'            ? 'Inaktivera' :
          adminModal?.type === 'reactivate'          ? 'Återaktivera' :
          adminModal?.type === 'transfer-ownership'  ? 'Överför ägarskap' :
          adminModal?.type === 'resend-invitation'   ? 'Skicka igen' :
          adminModal?.type === 'cancel-invitation'   ? 'Avbryt inbjudan' : ''
        }
        confirmVariant={
          adminModal?.type === 'reactivate' || adminModal?.type === 'resend-invitation' ? 'default' : 'destructive'
        }
        loading={
          disableAdmin.isPending || reactivateAdmin.isPending || transferOwnership.isPending ||
          resendInvitation.isPending || cancelInvitation.isPending
        }
        onConfirm={
          adminModal?.type === 'disable'            ? handleDisableAdmin :
          adminModal?.type === 'reactivate'          ? handleReactivateAdmin :
          adminModal?.type === 'transfer-ownership'  ? handleTransferOwnership :
          adminModal?.type === 'resend-invitation'   ? handleResendInvitation :
          adminModal?.type === 'cancel-invitation'   ? handleCancelInvitation : closeAdminModal
        }
        onCancel={closeAdminModal}
      />
    </PageLayout>
  );
}
