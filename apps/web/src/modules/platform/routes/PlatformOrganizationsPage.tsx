import { useState, useTransition, useMemo, useRef, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  Search, Building2, ArrowRightLeft, MoreHorizontal, Plus,
  ChevronLeft, ChevronRight, ArrowUpDown, ArrowUp, ArrowDown,
} from 'lucide-react';
import {
  Input, Skeleton, toast, Button,
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuSeparator,
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@platform/ui';
import { cn } from '@/lib/utils.js';
import { PageLayout, PageHeader } from '@shared/components/layout/PageLayout/PageLayout.js';
import type { PlatformOrganization } from '../hooks/usePlatformOrganizations.js';
import { usePlatformOrganizations } from '../hooks/usePlatformOrganizations.js';
import { usePlatformOrgCounts } from '../hooks/usePlatformOrgDetail.js';
import type { OrgCounts } from '../hooks/usePlatformOrgDetail.js';
import { useSuspendOrg, useReactivateOrg, useTerminateOrg, useDeleteOrg, useStartTrial, useExtendTrial, useEndTrial } from '../hooks/usePlatformOrgMutations.js';
import { useSwitchTenant } from '@modules/auth/hooks/useSwitchTenant.js';
import { CreateOrgDialog } from '../components/CreateOrgDialog.js';
import { EditOrgDialog } from '../components/EditOrgDialog.js';
import { OrgDetailSheet } from '../components/OrgDetailSheet.js';
import { TIER_LABEL } from '../lib/tierDisplay.js';

// ─── Types ────────────────────────────────────────────────────────────────────

type OrgWithCounts = PlatformOrganization & {
  member_count:     number;
  student_count:    number;
  instructor_count: number;
};

type SortField = 'name' | 'created_at' | 'student_count' | 'instructor_count';
type SortDir   = 'asc' | 'desc';

type PageModal =
  | null
  | { type: 'create' }
  | { type: 'detail';       org: PlatformOrganization }
  | { type: 'edit';         org: PlatformOrganization }
  | { type: 'suspend';      org: PlatformOrganization }
  | { type: 'reactivate';   org: PlatformOrganization }
  | { type: 'terminate';    org: PlatformOrganization }
  | { type: 'delete';       org: PlatformOrganization }
  | { type: 'trial-start';  org: PlatformOrganization }
  | { type: 'trial-extend'; org: PlatformOrganization }
  | { type: 'trial-end';    org: PlatformOrganization };

// ─── Constants ────────────────────────────────────────────────────────────────

const PAGE_SIZE = 25;

const STATUS_FILTERS = [
  { value: '',           label: 'Alla statusar' },
  { value: 'active',     label: 'Aktiv' },
  { value: 'suspended',  label: 'Suspenderad' },
  { value: 'terminated', label: 'Avslutad' },
];

const TIER_FILTERS = [
  { value: '',             label: 'Alla nivåer' },
  { value: 'trial',        label: 'Trial' },
  { value: 'starter',      label: 'Starter' },
  { value: 'professional', label: 'Professional' },
  { value: 'enterprise',   label: 'Enterprise' },
];

const SUB_STATUS_FILTERS = [
  { value: '',          label: 'Alla prenumerationer' },
  { value: 'trialing',  label: 'Testperiod' },
  { value: 'active',    label: 'Aktiv' },
  { value: 'past_due',  label: 'Förfallen' },
  { value: 'cancelled', label: 'Avslutad' },
];

// ─── Display maps ─────────────────────────────────────────────────────────────

const STATUS_BADGE_CLASS: Record<string, string> = {
  active:    'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
  suspended: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
  terminated:'bg-gray-100 text-gray-500 dark:bg-gray-800/40 dark:text-gray-400',
};

const ORG_STATUS_LABEL: Record<string, string> = {
  active:    'Aktiv',
  suspended: 'Suspenderad',
  terminated:'Avslutad',
};

const SUB_STATUS_LABEL: Record<string, string> = {
  active:    'Aktiv',
  trialing:  'Testperiod',
  past_due:  'Förfallen',
  cancelled: 'Avslutad',
  suspended: 'Suspenderad',
};

const SUB_STATUS_CLASS: Record<string, string> = {
  past_due:  'text-destructive',
  trialing:  'text-amber-500',
  cancelled: 'text-muted-foreground',
  suspended: 'text-muted-foreground',
};

// ─── Confirm dialog ───────────────────────────────────────────────────────────

// All three dialogs below take an explicit `open` prop and are rendered
// exactly once each, always mounted (see the "Modals" section at the bottom
// of this file) — never conditionally mounted/unmounted by the caller.
// Radix's Dialog renders through a Portal into document.body and owns its
// own close/exit-animation cleanup; conditionally mounting/unmounting the
// component that wraps it from the parent races React's own removal of that
// portaled node against Radix's, producing "Failed to execute 'removeChild'
// on 'Node'". Reused for suspend/reactivate/terminate, trial-start/
// trial-extend, and trial-end respectively (previously 6 separate
// conditionally-mounted instances).

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

// ─── Trial days dialog ────────────────────────────────────────────────────────

function TrialDaysDialog({
  open, title, defaultDays, loading, onConfirm, onCancel,
}: {
  open: boolean; title: string; defaultDays: number; loading: boolean;
  onConfirm: (days: number) => void; onCancel: () => void;
}) {
  const [days, setDays] = useState(defaultDays);
  // Reused across two modal types (trial-start, trial-extend) without
  // unmounting — reset the field whenever the dialog (re-)opens rather than
  // relying on useState's one-time initializer.
  useEffect(() => { if (open) setDays(defaultDays); }, [open, defaultDays]);
  return (
    <Dialog open={open} onOpenChange={open => { if (!open) onCancel(); }}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader><DialogTitle>{title}</DialogTitle></DialogHeader>
        <div className="space-y-2">
          <label className="text-sm font-medium text-foreground" htmlFor="trial-days-input">Antal dagar</label>
          <Input
            id="trial-days-input" type="number" min={1} max={365} value={days}
            onChange={e => setDays(Math.max(1, Math.min(365, e.target.valueAsNumber || 1)))}
          />
          <p className="text-xs text-muted-foreground">1–365 dagar</p>
        </div>
        <DialogFooter className="pt-2">
          <Button variant="outline" onClick={onCancel} disabled={loading}>Avbryt</Button>
          <Button onClick={() => onConfirm(days)} disabled={loading || days < 1}>
            {loading ? 'Vänta…' : 'Bekräfta'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── End trial dialog ─────────────────────────────────────────────────────────

function EndTrialDialog({
  open, orgName, loading, onConfirm, onCancel,
}: {
  open: boolean; orgName: string; loading: boolean;
  onConfirm: (targetTier: string) => void; onCancel: () => void;
}) {
  const [tier, setTier] = useState('starter');
  useEffect(() => { if (open) setTier('starter'); }, [open]);
  return (
    <Dialog open={open} onOpenChange={open => { if (!open) onCancel(); }}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader><DialogTitle>Avsluta testperiod — {orgName}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">Välj prenumerationsnivå när testperioden avslutas.</p>
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-foreground" htmlFor="end-trial-tier">Prenumerationsnivå</label>
            <Select onValueChange={setTier} value={tier}>
              <SelectTrigger id="end-trial-tier"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="starter">Starter</SelectItem>
                <SelectItem value="professional">Professional</SelectItem>
                <SelectItem value="enterprise">Enterprise</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter className="pt-2">
          <Button variant="outline" onClick={onCancel} disabled={loading}>Avbryt</Button>
          <Button onClick={() => onConfirm(tier)} disabled={loading}>
            {loading ? 'Vänta…' : 'Avsluta testperiod'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Delete organization dialog ───────────────────────────────────────────────
//
// Stronger confirmation than ConfirmDialog (type the org's name) — this is
// the least reversible action here: every vehicle, instructor, and branch
// is soft-deleted and every user's access (membership + auth account) is
// permanently removed, on top of removing the organization from every
// platform-admin list/report. Finance/audit records are never touched (see
// handleDeleteTenantData). Only reachable once already suspended or
// terminated, so access was already cut off before this runs.

function DeleteOrgDialog({
  open, orgName, loading, onConfirm, onCancel,
}: {
  open: boolean; orgName: string; loading: boolean;
  onConfirm: () => void; onCancel: () => void;
}) {
  const [confirmText, setConfirmText] = useState('');
  useEffect(() => { if (open) setConfirmText(''); }, [open]);
  const matches = confirmText.trim() === orgName;

  return (
    <Dialog open={open} onOpenChange={open => { if (!open) onCancel(); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader><DialogTitle>Ta bort organisation</DialogTitle></DialogHeader>
        <p className="text-sm text-muted-foreground">
          {orgName} tas bort från organisationslistan och alla rapporter. Fordon, instruktörer och filialer tas bort, och alla användares konton raderas permanent. Fakturor, bokföring och granskningslogg bevaras. Detta kan endast återställas av en utvecklare direkt i databasen — inte via gränssnittet.
        </p>
        <div className="space-y-1.5">
          <label className="text-sm font-medium text-foreground" htmlFor="delete-org-confirm">
            Skriv <span className="font-semibold">{orgName}</span> för att bekräfta
          </label>
          <Input id="delete-org-confirm" value={confirmText} onChange={e => setConfirmText(e.target.value)} autoComplete="off" />
        </div>
        <DialogFooter className="pt-2">
          <Button variant="outline" onClick={onCancel} disabled={loading}>Avbryt</Button>
          <Button variant="destructive" onClick={onConfirm} disabled={loading || !matches}>
            {loading ? 'Tar bort…' : 'Ta bort organisation'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Sort header button ───────────────────────────────────────────────────────

function SortHeader({
  label, field, currentField, currentDir, onSort,
}: {
  label: string; field: SortField;
  currentField: SortField; currentDir: SortDir;
  onSort: (f: SortField) => void;
}) {
  const active = currentField === field;
  const Icon   = active ? (currentDir === 'asc' ? ArrowUp : ArrowDown) : ArrowUpDown;
  return (
    <button
      type="button"
      onClick={() => onSort(field)}
      className="flex items-center gap-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground hover:text-foreground transition-colors"
    >
      {label}
      <Icon className={cn('w-3 h-3', active && 'text-primary')} />
    </button>
  );
}

// ─── Row actions ──────────────────────────────────────────────────────────────

function OrgRowActions({
  org, isSwitching, onSwitch, onAction, onNavigate,
}: {
  org:        PlatformOrganization;
  isSwitching: boolean;
  onSwitch:   () => void;
  onAction:   (modal: PageModal) => void;
  onNavigate: () => void;
}) {
  const isActive     = org.status === 'active';
  const isSuspended  = org.status === 'suspended';
  const isTerminated = org.status === 'terminated';
  const isTrialing   = org.subscription_status === 'trialing';
  const hasTrialEnd  = org.trial_ends_at !== null;

  return (
    <div className="flex items-center gap-1 justify-end">
      <button
        type="button"
        onClick={onSwitch}
        disabled={isSwitching || !isActive}
        className="w-8 h-8 rounded-lg flex items-center justify-center text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors disabled:opacity-40"
        title={isActive ? `Byt till ${org.name}` : 'Ej tillgänglig'}
        aria-label={`Byt till ${org.name}`}
      >
        <ArrowRightLeft className="w-3.5 h-3.5" />
      </button>

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
        <DropdownMenuContent align="end" className="w-48">
          <DropdownMenuItem onClick={onNavigate}>Öppna detalj</DropdownMenuItem>
          <DropdownMenuItem onClick={() => onAction({ type: 'edit', org })}>Redigera</DropdownMenuItem>
          <DropdownMenuSeparator />
          {isActive && (
            <DropdownMenuItem className="text-destructive focus:text-destructive" onClick={() => onAction({ type: 'suspend', org })}>
              Suspendera
            </DropdownMenuItem>
          )}
          {isSuspended && (
            <DropdownMenuItem onClick={() => onAction({ type: 'reactivate', org })}>Återaktivera</DropdownMenuItem>
          )}
          {isActive && (
            <DropdownMenuItem className="text-destructive focus:text-destructive" onClick={() => onAction({ type: 'terminate', org })}>
              Avsluta organisation
            </DropdownMenuItem>
          )}
          {(isSuspended || isTerminated) && (
            <DropdownMenuItem className="text-destructive focus:text-destructive" onClick={() => onAction({ type: 'delete', org })}>
              Ta bort organisation
            </DropdownMenuItem>
          )}
          <DropdownMenuSeparator />
          {!isTrialing ? (
            <DropdownMenuItem onClick={() => onAction({ type: 'trial-start', org })}>Starta testperiod</DropdownMenuItem>
          ) : (
            <>
              {hasTrialEnd && (
                <DropdownMenuItem onClick={() => onAction({ type: 'trial-extend', org })}>Förläng testperiod</DropdownMenuItem>
              )}
              <DropdownMenuItem className="text-destructive focus:text-destructive" onClick={() => onAction({ type: 'trial-end', org })}>
                Avsluta testperiod
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export function PlatformOrganizationsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate   = useNavigate();
  const [, startTransition] = useTransition();

  // ── URL-persisted state ────────────────────────────────────────────────────
  const qParam         = searchParams.get('q')          ?? '';
  const statusFilter   = searchParams.get('status')     ?? '';
  const tierFilter     = searchParams.get('tier')       ?? '';
  const subFilter      = searchParams.get('sub_status') ?? '';
  const page           = Math.max(1, parseInt(searchParams.get('page') ?? '1', 10));

  // ── Local state ────────────────────────────────────────────────────────────
  const [localSearch, setLocalSearch] = useState(qParam);
  const [sortField, setSortField]     = useState<SortField>('created_at');
  const [sortDir, setSortDir]         = useState<SortDir>('desc');
  const [modal, setModal]             = useState<PageModal>(null);
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Sync localSearch when URL q changes externally
  useEffect(() => { setLocalSearch(qParam); }, [qParam]);

  // Clear pending debounce on unmount
  useEffect(() => () => { if (searchTimer.current) clearTimeout(searchTimer.current); }, []);

  // ── Data ───────────────────────────────────────────────────────────────────
  const { data: orgs,   isLoading: orgsLoading,   error: orgsError }  = usePlatformOrganizations(qParam);
  const { data: counts, isError: countsError }                         = usePlatformOrgCounts();
  const { switchTenant, isPending: isSwitching }                        = useSwitchTenant();
  const suspendOrg    = useSuspendOrg();
  const reactivateOrg = useReactivateOrg();
  const terminateOrg  = useTerminateOrg();
  const deleteOrg      = useDeleteOrg();
  const startTrial    = useStartTrial();
  const extendTrial   = useExtendTrial();
  const endTrial      = useEndTrial();

  // ── Enrich: merge counts ───────────────────────────────────────────────────
  const countsMap = useMemo(() => {
    const m: Record<string, OrgCounts> = {};
    for (const c of counts ?? []) m[c.org_id] = c;
    return m;
  }, [counts]);

  const enriched = useMemo<OrgWithCounts[]>(() =>
    (orgs ?? []).map(org => ({
      ...org,
      member_count:     countsMap[org.id]?.member_count     ?? 0,
      student_count:    countsMap[org.id]?.student_count    ?? 0,
      instructor_count: countsMap[org.id]?.instructor_count ?? 0,
    })),
    [orgs, countsMap],
  );

  // ── Filter ─────────────────────────────────────────────────────────────────
  const filtered = useMemo(() => {
    let r = enriched;
    if (statusFilter) r = r.filter(o => o.status === statusFilter);
    if (tierFilter)   r = r.filter(o => o.subscription_tier === tierFilter);
    if (subFilter)    r = r.filter(o => o.subscription_status === subFilter);
    return r;
  }, [enriched, statusFilter, tierFilter, subFilter]);

  // ── Sort ───────────────────────────────────────────────────────────────────
  const sorted = useMemo<OrgWithCounts[]>(() =>
    [...filtered].sort((a, b) => {
      let av: string | number = a.created_at;
      let bv: string | number = b.created_at;
      if (sortField === 'name')          { av = a.name;          bv = b.name; }
      if (sortField === 'student_count')    { av = a.student_count;    bv = b.student_count; }
      if (sortField === 'instructor_count') { av = a.instructor_count; bv = b.instructor_count; }
      const cmp = av < bv ? -1 : av > bv ? 1 : 0;
      return sortDir === 'asc' ? cmp : -cmp;
    }),
    [filtered, sortField, sortDir],
  );

  // ── Paginate ───────────────────────────────────────────────────────────────
  const totalPages   = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));
  const currentPage  = Math.min(page, totalPages);
  const paginated    = sorted.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);
  const showingFrom  = sorted.length === 0 ? 0 : (currentPage - 1) * PAGE_SIZE + 1;
  const showingTo    = Math.min(currentPage * PAGE_SIZE, sorted.length);

  // ── Handlers ──────────────────────────────────────────────────────────────
  function handleSearch(val: string) {
    setLocalSearch(val);
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => {
      startTransition(() => {
        setSearchParams(prev => {
          const next = new URLSearchParams(prev);
          if (val) next.set('q', val); else next.delete('q');
          next.delete('page');
          return next;
        });
      });
    }, 300);
  }

  function setFilter(key: string, value: string) {
    setSearchParams(prev => {
      const next = new URLSearchParams(prev);
      if (value) next.set(key, value); else next.delete(key);
      next.delete('page');
      return next;
    });
  }

  function setPage(p: number) {
    setSearchParams(prev => {
      const next = new URLSearchParams(prev);
      if (p > 1) next.set('page', String(p)); else next.delete('page');
      return next;
    });
  }

  function handleSort(field: SortField) {
    if (sortField === field) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDir('desc');
    }
  }

  async function handleSwitchTenant(orgId: string, orgName: string) {
    const result = await switchTenant(orgId);
    if (result.success) {
      toast({ title: 'Klientbyte', description: `Bytte till ${orgName}` });
      navigate('/dashboard');
    } else {
      toast({ title: 'Klientbyte misslyckades', description: result.error ?? 'Försök igen', variant: 'destructive' });
    }
  }

  function closeModal() { setModal(null); }

  function handleSuspend() {
    if (modal?.type !== 'suspend') return;
    const { org } = modal;
    suspendOrg.mutate(org.id, {
      onSuccess: () => { toast({ title: 'Suspenderat', description: `${org.name} har suspenderats` }); closeModal(); },
      onError: err => toast({ title: 'Fel', description: err.message, variant: 'destructive' }),
    });
  }

  function handleReactivate() {
    if (modal?.type !== 'reactivate') return;
    const { org } = modal;
    reactivateOrg.mutate(org.id, {
      onSuccess: () => { toast({ title: 'Återaktiverat', description: `${org.name} är nu aktiv` }); closeModal(); },
      onError: err => toast({ title: 'Fel', description: err.message, variant: 'destructive' }),
    });
  }

  function handleTerminate() {
    if (modal?.type !== 'terminate') return;
    const { org } = modal;
    terminateOrg.mutate(org.id, {
      onSuccess: () => { toast({ title: 'Avslutad', description: `${org.name} har avslutats` }); closeModal(); },
      onError: err => toast({ title: 'Fel', description: err.message, variant: 'destructive' }),
    });
  }

  function handleDelete() {
    if (modal?.type !== 'delete') return;
    const { org } = modal;
    deleteOrg.mutate(org.id, {
      onSuccess: () => { toast({ title: 'Borttagen', description: `${org.name} har tagits bort` }); closeModal(); },
      onError: err => toast({ title: 'Fel', description: err.message, variant: 'destructive' }),
    });
  }

  function handleStartTrial(days: number) {
    if (modal?.type !== 'trial-start') return;
    const { org } = modal;
    startTrial.mutate({ orgId: org.id, days }, {
      onSuccess: () => { toast({ title: 'Testperiod startad', description: `${org.name}: ${days} dagar` }); closeModal(); },
      onError: err => toast({ title: 'Fel', description: err.message, variant: 'destructive' }),
    });
  }

  function handleExtendTrial(days: number) {
    if (modal?.type !== 'trial-extend') return;
    const { org } = modal;
    extendTrial.mutate({ orgId: org.id, days, currentTrialEndsAt: org.trial_ends_at ?? new Date().toISOString() }, {
      onSuccess: () => { toast({ title: 'Testperiod förlängd', description: `${org.name}: +${days} dagar` }); closeModal(); },
      onError: err => toast({ title: 'Fel', description: err.message, variant: 'destructive' }),
    });
  }

  function handleEndTrial(targetTier: string) {
    if (modal?.type !== 'trial-end') return;
    const { org } = modal;
    endTrial.mutate({ orgId: org.id, targetTier }, {
      onSuccess: () => { toast({ title: 'Testperiod avslutad', description: `${org.name} övergår till ${TIER_LABEL[targetTier] ?? targetTier}` }); closeModal(); },
      onError: err => toast({ title: 'Fel', description: err.message, variant: 'destructive' }),
    });
  }

  const activeFilters = [statusFilter, tierFilter, subFilter].filter(Boolean).length;

  return (
    <PageLayout>
      <div className="flex items-start justify-between gap-4">
        <PageHeader
          title="Organisationer"
          description="Alla registrerade trafikskolor på plattformen"
        />
        <Button className="shrink-0 mt-1" onClick={() => setModal({ type: 'create' })}>
          <Plus className="w-4 h-4 mr-1.5" />
          Ny organisation
        </Button>
      </div>

      {/* Search + filter row */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:flex-wrap">
        {/* Search */}
        <div className="relative flex-1 min-w-0 max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
          <Input
            value={localSearch}
            onChange={e => handleSearch(e.target.value)}
            placeholder="Sök organisation…"
            className="pl-9"
          />
        </div>

        {/* Filter selects */}
        <div className="flex items-center gap-2 flex-wrap">
          <Select value={statusFilter || '__all__'} onValueChange={v => setFilter('status', v === '__all__' ? '' : v)}>
            <SelectTrigger className="h-9 w-[160px] text-xs">
              <SelectValue placeholder="Alla statusar" />
            </SelectTrigger>
            <SelectContent>
              {STATUS_FILTERS.map(f => (
                <SelectItem key={f.value || '__all__'} value={f.value || '__all__'} className="text-xs">{f.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={tierFilter || '__all__'} onValueChange={v => setFilter('tier', v === '__all__' ? '' : v)}>
            <SelectTrigger className="h-9 w-[160px] text-xs">
              <SelectValue placeholder="Alla nivåer" />
            </SelectTrigger>
            <SelectContent>
              {TIER_FILTERS.map(f => (
                <SelectItem key={f.value || '__all__'} value={f.value || '__all__'} className="text-xs">{f.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={subFilter || '__all__'} onValueChange={v => setFilter('sub_status', v === '__all__' ? '' : v)}>
            <SelectTrigger className="h-9 w-[190px] text-xs">
              <SelectValue placeholder="Alla prenumerationer" />
            </SelectTrigger>
            <SelectContent>
              {SUB_STATUS_FILTERS.map(f => (
                <SelectItem key={f.value || '__all__'} value={f.value || '__all__'} className="text-xs">{f.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          {activeFilters > 0 && (
            <Button
              variant="ghost"
              size="sm"
              className="h-9 text-xs text-muted-foreground"
              onClick={() => {
                setSearchParams(prev => {
                  const next = new URLSearchParams(prev);
                  next.delete('status'); next.delete('tier'); next.delete('sub_status'); next.delete('page');
                  return next;
                });
              }}
            >
              Rensa filter ({activeFilters})
            </Button>
          )}
        </div>
      </div>

      {/* Table card */}
      <div className="rounded-xl border border-border bg-card overflow-hidden">

        {/* Header row */}
        <div className="grid grid-cols-[1fr_100px_100px_90px_60px_60px_90px_72px] gap-3 px-4 py-2.5 bg-muted/40 border-b border-border items-center">
          <SortHeader label="Organisation" field="name"          currentField={sortField} currentDir={sortDir} onSort={handleSort} />
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Status</p>
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground hidden md:block">Nivå</p>
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground hidden lg:block">Trial slutar</p>
          <SortHeader label="Elever"    field="student_count" currentField={sortField} currentDir={sortDir} onSort={handleSort} />
          <SortHeader label="Lärare"    field="instructor_count" currentField={sortField} currentDir={sortDir} onSort={handleSort} />
          <SortHeader label="Skapad"    field="created_at"    currentField={sortField} currentDir={sortDir} onSort={handleSort} />
          <span />
        </div>

        {/* Loading */}
        {orgsLoading && (
          <div className="divide-y divide-border">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="grid grid-cols-[1fr_100px_100px_90px_60px_60px_90px_72px] gap-3 px-4 py-3 items-center">
                <div className="space-y-1">
                  <Skeleton className="h-4 w-40" />
                  <Skeleton className="h-3 w-24" />
                </div>
                <Skeleton className="h-5 w-18 rounded-full" />
                <Skeleton className="h-4 w-16 hidden md:block" />
                <Skeleton className="h-4 w-20 hidden lg:block" />
                <Skeleton className="h-4 w-8" />
                <Skeleton className="h-4 w-8" />
                <Skeleton className="h-4 w-20" />
                <Skeleton className="h-7 w-16 rounded-lg ml-auto" />
              </div>
            ))}
          </div>
        )}

        {/* Error */}
        {!orgsLoading && orgsError && (
          <div className="px-4 py-8 text-center">
            <p className="text-sm text-destructive">Kunde inte hämta organisationer</p>
            <p className="text-xs text-muted-foreground mt-1">{orgsError.message}</p>
          </div>
        )}

        {/* Empty */}
        {!orgsLoading && !orgsError && sorted.length === 0 && (
          <div className="px-4 py-12 text-center">
            <Building2 className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
            <p className="text-sm text-muted-foreground">
              {(qParam || activeFilters > 0) ? 'Inga organisationer matchar sökningen eller filtren' : 'Inga organisationer registrerade'}
            </p>
            {!qParam && activeFilters === 0 && (
              <Button variant="outline" size="sm" className="mt-3" onClick={() => setModal({ type: 'create' })}>
                <Plus className="w-3.5 h-3.5 mr-1" />
                Skapa din första organisation
              </Button>
            )}
          </div>
        )}

        {/* Rows */}
        {!orgsLoading && !orgsError && paginated.length > 0 && (
          <div className="divide-y divide-border">
            {paginated.map(org => (
              <div
                key={org.id}
                className="grid grid-cols-[1fr_100px_100px_90px_60px_60px_90px_72px] gap-3 px-4 py-3 items-center hover:bg-muted/30 transition-colors"
              >
                {/* Name + org number */}
                <div className="min-w-0">
                  <button
                    type="button"
                    className="text-sm font-medium text-foreground truncate hover:text-primary transition-colors text-left w-full block"
                    onClick={() => navigate(`/platform/organizations/${org.id}`)}
                  >
                    {org.name}
                  </button>
                  <p className="text-xs text-muted-foreground truncate">
                    {org.org_number ?? org.slug}
                  </p>
                </div>

                {/* Status */}
                <div>
                  <span className={cn(
                    'inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold',
                    STATUS_BADGE_CLASS[org.status] ?? 'bg-muted text-muted-foreground',
                  )}>
                    {ORG_STATUS_LABEL[org.status] ?? org.status}
                  </span>
                  {org.subscription_status && org.subscription_status !== 'active' && (
                    <p className={cn('text-[10px] mt-0.5', SUB_STATUS_CLASS[org.subscription_status] ?? 'text-muted-foreground')}>
                      {SUB_STATUS_LABEL[org.subscription_status] ?? org.subscription_status}
                    </p>
                  )}
                </div>

                {/* Tier */}
                <p className="text-xs text-muted-foreground hidden md:block">
                  {TIER_LABEL[org.subscription_tier] ?? org.subscription_tier}
                </p>

                {/* Trial end date */}
                <p className="text-xs text-muted-foreground hidden lg:block">
                  {org.trial_ends_at
                    ? new Date(org.trial_ends_at).toLocaleDateString('sv-SE')
                    : '—'}
                </p>

                {/* Students */}
                <p className={cn('text-xs font-medium', countsError ? 'text-muted-foreground' : 'text-foreground')}>
                  {countsError ? '—' : org.student_count}
                </p>

                {/* Instructors */}
                <p className={cn('text-xs font-medium', countsError ? 'text-muted-foreground' : 'text-foreground')}>
                  {countsError ? '—' : org.instructor_count}
                </p>

                {/* Created */}
                <p className="text-xs text-muted-foreground">
                  {new Date(org.created_at).toLocaleDateString('sv-SE')}
                </p>

                {/* Actions */}
                <OrgRowActions
                  org={org}
                  isSwitching={isSwitching}
                  onSwitch={() => void handleSwitchTenant(org.id, org.name)}
                  onAction={setModal}
                  onNavigate={() => navigate(`/platform/organizations/${org.id}`)}
                />
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Footer: count + pagination */}
      {!orgsLoading && !orgsError && sorted.length > 0 && (
        <div className="flex items-center justify-between">
          <p className="text-xs text-muted-foreground">
            Visar {showingFrom}–{showingTo} av {sorted.length} organisation{sorted.length !== 1 ? 'er' : ''}
            {activeFilters > 0 && <span className="text-primary"> (filtrerat)</span>}
          </p>

          {totalPages > 1 && (
            <div className="flex items-center gap-1">
              <Button
                variant="outline" size="sm"
                onClick={() => setPage(currentPage - 1)}
                disabled={currentPage <= 1}
                className="h-8 px-2"
              >
                <ChevronLeft className="w-3.5 h-3.5" />
              </Button>
              <span className="text-xs text-muted-foreground px-2">
                {currentPage} / {totalPages}
              </span>
              <Button
                variant="outline" size="sm"
                onClick={() => setPage(currentPage + 1)}
                disabled={currentPage >= totalPages}
                className="h-8 px-2"
              >
                <ChevronRight className="w-3.5 h-3.5" />
              </Button>
            </div>
          )}
        </div>
      )}

      {/* ── Modals ── */}
      <CreateOrgDialog open={modal?.type === 'create'} onClose={closeModal} />
      <EditOrgDialog
        open={modal?.type === 'edit'}
        org={modal?.type === 'edit' ? modal.org : null}
        onClose={closeModal}
      />
      <OrgDetailSheet
        open={modal?.type === 'detail'}
        org={modal?.type === 'detail' ? modal.org : null}
        onClose={closeModal}
      />

      <ConfirmDialog
        open={modal?.type === 'suspend' || modal?.type === 'reactivate' || modal?.type === 'terminate'}
        title={
          modal?.type === 'suspend'    ? 'Suspendera organisation' :
          modal?.type === 'reactivate' ? 'Återaktivera organisation' :
          modal?.type === 'terminate'  ? 'Avsluta organisation' : ''
        }
        description={
          modal?.type === 'suspend'
            ? `Suspenderade organisationer kan inte logga in eller använda plattformen. Du kan återaktivera när som helst.\n\nOrganisation: ${modal.org.name}`
          : modal?.type === 'reactivate'
            ? `Organisationen och dess användare får åter tillgång till plattformen.\n\nOrganisation: ${modal.org.name}`
          : modal?.type === 'terminate'
            ? `Organisationen avslutas permanent. Data behålls, men organisationen kan endast återaktiveras manuellt av en plattformsadministratör.\n\nOrganisation: ${modal.org.name}`
          : ''
        }
        confirmLabel={
          modal?.type === 'suspend'    ? 'Suspendera' :
          modal?.type === 'reactivate' ? 'Återaktivera' :
          modal?.type === 'terminate'  ? 'Avsluta organisation' : ''
        }
        confirmVariant={modal?.type === 'reactivate' ? 'default' : 'destructive'}
        loading={suspendOrg.isPending || reactivateOrg.isPending || terminateOrg.isPending}
        onConfirm={
          modal?.type === 'suspend'    ? handleSuspend :
          modal?.type === 'reactivate' ? handleReactivate :
          modal?.type === 'terminate'  ? handleTerminate : closeModal
        }
        onCancel={closeModal}
      />
      <DeleteOrgDialog
        open={modal?.type === 'delete'}
        orgName={modal?.type === 'delete' ? modal.org.name : ''}
        loading={deleteOrg.isPending}
        onConfirm={handleDelete}
        onCancel={closeModal}
      />
      <TrialDaysDialog
        open={modal?.type === 'trial-start' || modal?.type === 'trial-extend'}
        title={
          modal?.type === 'trial-start'  ? `Starta testperiod — ${modal.org.name}` :
          modal?.type === 'trial-extend' ? `Förläng testperiod — ${modal.org.name}` : ''
        }
        defaultDays={modal?.type === 'trial-extend' ? 14 : 30}
        loading={startTrial.isPending || extendTrial.isPending}
        onConfirm={modal?.type === 'trial-extend' ? handleExtendTrial : handleStartTrial}
        onCancel={closeModal}
      />
      <EndTrialDialog
        open={modal?.type === 'trial-end'}
        orgName={modal?.type === 'trial-end' ? modal.org.name : ''}
        loading={endTrial.isPending}
        onConfirm={handleEndTrial}
        onCancel={closeModal}
      />
    </PageLayout>
  );
}
