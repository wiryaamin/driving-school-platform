import { useState } from 'react';
import { ChevronRight, MoreHorizontal, Mail, RotateCw, CheckCircle2 } from 'lucide-react';
import {
  Skeleton, toast, Button,
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator,
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
  Input,
} from '@platform/ui';
import { cn } from '@/lib/utils.js';
import { PageLayout, PageHeader } from '@shared/components/layout/PageLayout/PageLayout.js';
import {
  useTrialRequests, useTrialRequestDetail, useApproveTrialRequest,
  useRejectTrialRequest, useCancelTrialRequest, useExpireTrialRequest, useDeleteTrialRequest,
  useResendTrialVerification, useResendTrialQuestionnaire,
  type TrialRequest, type TrialRequestStatus, type TrialRejectionReason,
} from '../hooks/useTrialRequests.js';
import { TenantLifecyclePanel } from '../components/TenantLifecyclePanel.js';

// ─── Display maps ─────────────────────────────────────────────────────────────

const STATUS_LABEL: Record<TrialRequestStatus, string> = {
  pending_verification:     'Väntar på e-postbekräftelse',
  email_verified:           'E-post bekräftad',
  questionnaire_in_progress:'Fyller i formulär',
  questionnaire_completed:  'Väntar på godkännande',
  approved:                 'Godkänd',
  provisioning:             'Konfigurerar',
  provisioning_failed:      'Konfiguration misslyckades',
  active:                   'Aktiv testperiod',
  rejected:                 'Avvisad',
  cancelled:                'Avbruten',
  expired:                  'Utgången',
};

const STATUS_BADGE_CLASS: Record<TrialRequestStatus, string> = {
  pending_verification:      'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
  email_verified:            'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  questionnaire_in_progress: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  questionnaire_completed:   'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400',
  approved:                  'bg-teal-100 text-teal-700 dark:bg-teal-900/30 dark:text-teal-400',
  provisioning:               'bg-teal-100 text-teal-700 dark:bg-teal-900/30 dark:text-teal-400',
  provisioning_failed:        'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
  active:                     'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
  rejected:                   'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
  cancelled:                  'bg-gray-100 text-gray-500 dark:bg-gray-800/40 dark:text-gray-400',
  expired:                    'bg-gray-100 text-gray-500 dark:bg-gray-800/40 dark:text-gray-400',
};

const STATUS_FILTERS: Array<{ value: string; label: string }> = [
  { value: '', label: 'Alla statusar' },
  ...(Object.keys(STATUS_LABEL) as TrialRequestStatus[]).map(s => ({ value: s, label: STATUS_LABEL[s] })),
];

const REJECTION_REASON_LABEL: Record<TrialRejectionReason, string> = {
  duplicate_email:           'E-postadressen är redan registrerad',
  duplicate_request:         'Dubblettförfrågan',
  spam_or_fraud:             'Spam eller bedräglig förfrågan',
  incomplete_invalid_info:   'Ofullständig eller felaktig information',
  not_target_market:         'Passar inte plattformens målgrupp',
  unable_to_verify_business: 'Kunde inte verifiera verksamheten',
  outside_service_area:      'Utanför vårt verksamhetsområde',
  other:                     'Annat',
};
const REJECTION_REASON_OPTIONS = Object.keys(REJECTION_REASON_LABEL) as TrialRejectionReason[];

const TERMINAL_STATUSES: TrialRequestStatus[] = ['active', 'rejected', 'cancelled', 'expired'];

function formatDate(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('sv-SE', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

// ─── Confirm dialog (mirrors PlatformOrganizationsPage's own local one) ──────

function ConfirmDialog({
  open, title, description, confirmLabel, confirmVariant = 'destructive', loading, onConfirm, onCancel,
}: {
  open: boolean; title: string; description: string; confirmLabel: string;
  confirmVariant?: 'default' | 'destructive'; loading: boolean;
  onConfirm: () => void; onCancel: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={o => { if (!o) onCancel(); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader><DialogTitle>{title}</DialogTitle></DialogHeader>
        <p className="text-sm text-muted-foreground whitespace-pre-line">{description}</p>
        <DialogFooter className="pt-2">
          <Button variant="outline" onClick={onCancel} disabled={loading}>Avbryt</Button>
          <Button variant={confirmVariant} onClick={onConfirm} disabled={loading}>{loading ? 'Vänta…' : confirmLabel}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Reject dialog ────────────────────────────────────────────────────────────

function RejectDialog({
  open, schoolName, loading, onConfirm, onCancel,
}: {
  open: boolean; schoolName: string; loading: boolean;
  onConfirm: (reason: TrialRejectionReason, description: string) => void; onCancel: () => void;
}) {
  const [reason, setReason] = useState<TrialRejectionReason>('other');
  const [description, setDescription] = useState('');
  return (
    <Dialog open={open} onOpenChange={o => { if (!o) onCancel(); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader><DialogTitle>Avvisa förfrågan — {schoolName}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-foreground">Anledning</label>
            <Select value={reason} onValueChange={v => setReason(v as TrialRejectionReason)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {REJECTION_REASON_OPTIONS.map(r => <SelectItem key={r} value={r}>{REJECTION_REASON_LABEL[r]}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-foreground">Beskrivning {reason === 'other' && '*'}</label>
            <Input value={description} onChange={e => setDescription(e.target.value)} placeholder="Valfri förklaring som skickas till sökanden" />
          </div>
        </div>
        <DialogFooter className="pt-2">
          <Button variant="outline" onClick={onCancel} disabled={loading}>Avbryt</Button>
          <Button
            variant="destructive" disabled={loading || (reason === 'other' && description.trim().length === 0)}
            onClick={() => onConfirm(reason, description.trim())}
          >
            {loading ? 'Vänta…' : 'Avvisa förfrågan'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Detail sheet ─────────────────────────────────────────────────────────────

function TrialRequestDetailDialog({ id, onClose }: { id: string | null; onClose: () => void }) {
  const { data, isLoading } = useTrialRequestDetail(id);
  return (
    <Dialog open={Boolean(id)} onOpenChange={o => { if (!o) onClose(); }}>
      <DialogContent className="sm:max-w-lg max-h-[80vh] overflow-y-auto">
        <DialogHeader><DialogTitle>{data?.session.driving_school_name ?? 'Förfrågan'}</DialogTitle></DialogHeader>
        {isLoading || !data ? (
          <div className="space-y-2">{[...Array(4)].map((_, i) => <Skeleton key={i} className="h-8 rounded" />)}</div>
        ) : (
          <div className="space-y-5">
            <dl className="text-sm space-y-1.5">
              <div className="flex justify-between"><dt className="text-muted-foreground">E-post</dt><dd className="font-medium text-foreground">{data.session.email}</dd></div>
              <div className="flex justify-between"><dt className="text-muted-foreground">Status</dt><dd className="font-medium text-foreground">{STATUS_LABEL[data.session.status]}</dd></div>
              <div className="flex justify-between"><dt className="text-muted-foreground">E-post bekräftad</dt><dd className="font-medium text-foreground">{formatDate(data.session.email_verified_at)}</dd></div>
              <div className="flex justify-between"><dt className="text-muted-foreground">Skapad</dt><dd className="font-medium text-foreground">{formatDate(data.session.created_at)}</dd></div>
              <div className="flex justify-between"><dt className="text-muted-foreground">Går ut</dt><dd className="font-medium text-foreground">{formatDate(data.session.expires_at)}</dd></div>
              {data.session.organization_id && (
                <div className="flex justify-between"><dt className="text-muted-foreground">Organisation</dt><dd className="font-mono text-xs text-foreground">{data.session.organization_id}</dd></div>
              )}
              {data.session.rejection_reason && (
                <div className="flex justify-between"><dt className="text-muted-foreground">Avvisningsanledning</dt><dd className="font-medium text-foreground">{data.session.rejection_reason}</dd></div>
              )}
              {data.session.cancellation_reason && (
                <div className="flex justify-between"><dt className="text-muted-foreground">Avbrottsanledning</dt><dd className="font-medium text-foreground">{data.session.cancellation_reason}</dd></div>
              )}
            </dl>

            {data.session.organization_id && (
              <TenantLifecyclePanel orgId={data.session.organization_id} orgName={data.session.driving_school_name} />
            )}

            <div>
              <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">Historik</h3>
              <ul className="space-y-2">
                {data.events.map(e => (
                  <li key={e.id} className="text-xs border-l-2 border-border pl-3 py-0.5">
                    <span className="font-medium text-foreground">{e.event_type}</span>
                    <span className="text-muted-foreground"> — {formatDate(e.created_at)} — {e.actor_type}{e.actor_email ? ` (${e.actor_email})` : ''}</span>
                  </li>
                ))}
                {data.events.length === 0 && <li className="text-xs text-muted-foreground">Ingen historik ännu.</li>}
              </ul>
            </div>
          </div>
        )}
        <DialogFooter><Button variant="outline" onClick={onClose}>Stäng</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Row ──────────────────────────────────────────────────────────────────────

type PageModal =
  | null
  | { type: 'approve'; req: TrialRequest }
  | { type: 'reject';  req: TrialRequest }
  | { type: 'cancel';  req: TrialRequest }
  | { type: 'expire';  req: TrialRequest }
  | { type: 'delete';  req: TrialRequest };

const APPROVABLE_STATUSES: TrialRequestStatus[] = ['questionnaire_completed', 'provisioning_failed'];

function RequestRow({ req, onDetail, onAction }: { req: TrialRequest; onDetail: () => void; onAction: (m: PageModal) => void }) {
  const resendVerification = useResendTrialVerification();
  const resendQuestionnaire = useResendTrialQuestionnaire();
  const isTerminal = TERMINAL_STATUSES.includes(req.status) && req.status !== 'active';
  const canResendVerification = !req.email_verified_at && !isTerminal;
  const canResendQuestionnaire = Boolean(req.email_verified_at) && req.status !== 'active' && !isTerminal;
  const canRejectCancel = !TERMINAL_STATUSES.includes(req.status);
  const canApprove = APPROVABLE_STATUSES.includes(req.status);

  return (
    <div className="grid grid-cols-[1.6fr_1fr_140px_140px_140px_140px_100px] items-center gap-3 px-4 py-3 text-sm border-b border-border last:border-0 hover:bg-muted/20">
      <button type="button" onClick={onDetail} className="text-left font-medium text-foreground hover:text-primary truncate">{req.driving_school_name}</button>
      <span className="text-muted-foreground truncate">{req.email}</span>
      <span className={cn('inline-flex items-center text-[11px] font-semibold px-1.5 py-0.5 rounded leading-none w-fit', STATUS_BADGE_CLASS[req.status])}>
        {STATUS_LABEL[req.status]}
      </span>
      <span className="text-xs text-muted-foreground">{req.email_verified_at ? 'Bekräftad' : 'Ej bekräftad'}</span>
      <span className="text-xs text-muted-foreground">{formatDate(req.created_at)}</span>
      <span className="text-xs text-muted-foreground">{req.organization_id ? req.organization_id.slice(0, 8) : '—'}</span>
      <div className="flex justify-end">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button type="button" className="w-8 h-8 rounded-lg flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors" aria-label="Fler alternativ">
              <MoreHorizontal className="w-3.5 h-3.5" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuItem onClick={onDetail}>Visa detaljer</DropdownMenuItem>
            {canApprove && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => onAction({ type: 'approve', req })}>
                  <CheckCircle2 className="w-3.5 h-3.5 mr-2 text-green-600" /> Godkänn och driftsätt
                </DropdownMenuItem>
              </>
            )}
            {canResendVerification && (
              <DropdownMenuItem onClick={() => resendVerification.mutate(req.id, { onSuccess: () => toast({ title: 'Verifieringsmail skickat om' }), onError: (e) => toast({ title: 'Kunde inte skicka', description: e.message, variant: 'destructive' }) })}>
                <Mail className="w-3.5 h-3.5 mr-2" /> Skicka om verifieringsmail
              </DropdownMenuItem>
            )}
            {canResendQuestionnaire && (
              <DropdownMenuItem onClick={() => resendQuestionnaire.mutate(req.id, { onSuccess: () => toast({ title: 'Frågeformulär skickat om' }), onError: (e) => toast({ title: 'Kunde inte skicka', description: e.message, variant: 'destructive' }) })}>
                <RotateCw className="w-3.5 h-3.5 mr-2" /> Skicka om frågeformulär
              </DropdownMenuItem>
            )}
            {canRejectCancel && <DropdownMenuSeparator />}
            {canRejectCancel && (
              <DropdownMenuItem className="text-destructive focus:text-destructive" onClick={() => onAction({ type: 'reject', req })}>Avvisa</DropdownMenuItem>
            )}
            {canRejectCancel && (
              <DropdownMenuItem className="text-destructive focus:text-destructive" onClick={() => onAction({ type: 'cancel', req })}>Avbryt</DropdownMenuItem>
            )}
            {canRejectCancel && (
              <DropdownMenuItem className="text-destructive focus:text-destructive" onClick={() => onAction({ type: 'expire', req })}>Markera som utgången</DropdownMenuItem>
            )}
            <DropdownMenuSeparator />
            <DropdownMenuItem className="text-destructive focus:text-destructive" onClick={() => onAction({ type: 'delete', req })}>Ta bort</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export function TrialRequestsPage() {
  const [statusFilter, setStatusFilter] = useState('');
  const [detailId, setDetailId] = useState<string | null>(null);
  const [modal, setModal] = useState<PageModal>(null);

  const { data: requests, isLoading, error } = useTrialRequests(statusFilter || undefined);
  const approveReq = useApproveTrialRequest();
  const rejectReq = useRejectTrialRequest();
  const cancelReq = useCancelTrialRequest();
  const expireReq = useExpireTrialRequest();
  const deleteReq = useDeleteTrialRequest();

  function closeModal() { setModal(null); }

  function handleApprove() {
    if (modal?.type !== 'approve') return;
    approveReq.mutate(modal.req.id, {
      onSuccess: () => { toast({ title: 'Trafikskola driftsatt', description: `${modal.req.driving_school_name} är nu en aktiv testperiod.` }); closeModal(); },
      onError: (e) => toast({ title: 'Kunde inte driftsätta', description: e.message, variant: 'destructive' }),
    });
  }
  function handleReject(reason: TrialRejectionReason, description: string) {
    if (modal?.type !== 'reject') return;
    rejectReq.mutate({ id: modal.req.id, reason, description }, {
      onSuccess: () => { toast({ title: 'Förfrågan avvisad' }); closeModal(); },
      onError: (e) => toast({ title: 'Kunde inte avvisa', description: e.message, variant: 'destructive' }),
    });
  }
  function handleCancel() {
    if (modal?.type !== 'cancel') return;
    cancelReq.mutate({ id: modal.req.id }, {
      onSuccess: () => { toast({ title: 'Förfrågan avbruten' }); closeModal(); },
      onError: (e) => toast({ title: 'Kunde inte avbryta', description: e.message, variant: 'destructive' }),
    });
  }
  function handleExpire() {
    if (modal?.type !== 'expire') return;
    expireReq.mutate(modal.req.id, {
      onSuccess: () => { toast({ title: 'Förfrågan markerad som utgången' }); closeModal(); },
      onError: (e) => toast({ title: 'Kunde inte markera som utgången', description: e.message, variant: 'destructive' }),
    });
  }
  function handleDelete() {
    if (modal?.type !== 'delete') return;
    deleteReq.mutate(modal.req.id, {
      onSuccess: () => { toast({ title: 'Förfrågan borttagen' }); closeModal(); },
      onError: (e) => toast({ title: 'Kunde inte ta bort', description: e.message, variant: 'destructive' }),
    });
  }

  return (
    <PageLayout>
      <div className="flex items-center justify-between">
        <nav aria-label="Brödsmulor" className="flex items-center gap-1 text-xs text-muted-foreground">
          <span className="hover:text-foreground transition-colors">Platform Admin</span>
          <ChevronRight className="w-3 h-3" aria-hidden="true" />
          <span className="text-foreground font-medium">Testperiodsförfrågningar</span>
        </nav>
      </div>

      <PageHeader
        title="Testperiodsförfrågningar"
        description="Alla self-service registreringar — från formulär till godkänd testperiod. E-postbekräftelse innebär inte automatiskt godkännande; ni behåller full kontroll fram till driftsättning."
      />

      <div className="flex items-center gap-3">
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-56"><SelectValue /></SelectTrigger>
          <SelectContent>
            {STATUS_FILTERS.map(f => <SelectItem key={f.value || 'all'} value={f.value || 'all'}>{f.label}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      <div className="rounded-xl border border-border bg-card overflow-hidden">
        <div className="grid grid-cols-[1.6fr_1fr_140px_140px_140px_140px_100px] gap-3 px-4 py-2.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground border-b border-border bg-muted/10">
          <span>Trafikskola</span><span>E-post</span><span>Status</span><span>Verifiering</span><span>Skapad</span><span>Organisation</span><span />
        </div>
        {isLoading ? (
          <div className="p-4 space-y-2">{[...Array(5)].map((_, i) => <Skeleton key={i} className="h-10 rounded" />)}</div>
        ) : error ? (
          <p className="p-6 text-sm text-destructive">{error instanceof Error ? error.message : 'Kunde inte hämta förfrågningar'}</p>
        ) : (requests ?? []).length === 0 ? (
          <p className="p-6 text-sm text-muted-foreground">Inga förfrågningar hittades.</p>
        ) : (
          (requests ?? []).map(req => (
            <RequestRow key={req.id} req={req} onDetail={() => setDetailId(req.id)} onAction={setModal} />
          ))
        )}
      </div>

      <TrialRequestDetailDialog id={detailId} onClose={() => setDetailId(null)} />

      <ConfirmDialog
        open={modal?.type === 'approve'}
        title="Godkänn och driftsätt"
        description={modal?.type === 'approve' ? `Organisationen skapas nu, med lektionstyper, filial, fordon, instruktörer och administratörskonto utifrån ansökans svar. Detta kan ta några sekunder.\n\nTrafikskola: ${modal.req.driving_school_name}` : ''}
        confirmLabel="Godkänn och driftsätt"
        confirmVariant="default"
        loading={approveReq.isPending}
        onConfirm={handleApprove}
        onCancel={closeModal}
      />
      <RejectDialog
        open={modal?.type === 'reject'}
        schoolName={modal?.type === 'reject' ? modal.req.driving_school_name : ''}
        loading={rejectReq.isPending}
        onConfirm={handleReject}
        onCancel={closeModal}
      />
      <ConfirmDialog
        open={modal?.type === 'cancel'}
        title="Avbryt förfrågan"
        description={modal?.type === 'cancel' ? `Förfrågan avbryts och kan inte fortsätta. Ingen organisation skapas.\n\nTrafikskola: ${modal.req.driving_school_name}` : ''}
        confirmLabel="Avbryt förfrågan"
        loading={cancelReq.isPending}
        onConfirm={handleCancel}
        onCancel={closeModal}
      />
      <ConfirmDialog
        open={modal?.type === 'expire'}
        title="Markera som utgången"
        description={modal?.type === 'expire' ? `Förfrågan markeras som utgången omedelbart, istället för att vänta på den naturliga 7-dagarsgränsen.\n\nTrafikskola: ${modal.req.driving_school_name}` : ''}
        confirmLabel="Markera som utgången"
        loading={expireReq.isPending}
        onConfirm={handleExpire}
        onCancel={closeModal}
      />
      <ConfirmDialog
        open={modal?.type === 'delete'}
        title="Ta bort förfrågan"
        description={modal?.type === 'delete' ? `Förfrågan tas bort permanent. Historiken bevaras i granskningsloggen.\n\nTrafikskola: ${modal.req.driving_school_name}` : ''}
        confirmLabel="Ta bort"
        loading={deleteReq.isPending}
        onConfirm={handleDelete}
        onCancel={closeModal}
      />
    </PageLayout>
  );
}
