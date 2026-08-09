import { useEffect, useState } from 'react';
import { ShieldOff, ShieldCheck, Ban, CalendarPlus, ArrowUpCircle, Trash2 } from 'lucide-react';
import {
  Skeleton, toast, Button,
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
  Input,
} from '@platform/ui';
import { cn } from '@/lib/utils.js';
import { usePlatformOrgDetail } from '../hooks/usePlatformOrgDetail.js';
import {
  useSuspendOrg, useReactivateOrg, useTerminateOrg, useExtendTrial, useEndTrial, useDeleteOrg,
} from '../hooks/usePlatformOrgMutations.js';

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

// ─── Extend trial dialog (mirrors PlatformOrganizationsPage's TrialDaysDialog) ─

function ExtendTrialDialog({
  open, orgName, loading, onConfirm, onCancel,
}: {
  open: boolean; orgName: string; loading: boolean;
  onConfirm: (days: number) => void; onCancel: () => void;
}) {
  const [days, setDays] = useState(14);
  useEffect(() => { if (open) setDays(14); }, [open]);
  return (
    <Dialog open={open} onOpenChange={o => { if (!o) onCancel(); }}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader><DialogTitle>Förläng testperiod — {orgName}</DialogTitle></DialogHeader>
        <div className="space-y-2">
          <label className="text-sm font-medium text-foreground" htmlFor="trial-extend-days">Antal dagar</label>
          <Input id="trial-extend-days" type="number" min={1} max={365} value={days}
            onChange={e => setDays(Math.max(1, Math.min(365, e.target.valueAsNumber || 1)))} />
        </div>
        <DialogFooter className="pt-2">
          <Button variant="outline" onClick={onCancel} disabled={loading}>Avbryt</Button>
          <Button onClick={() => onConfirm(days)} disabled={loading || days < 1}>{loading ? 'Vänta…' : 'Förläng'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Convert to customer dialog (mirrors PlatformOrganizationsPage's EndTrialDialog)

function ConvertToCustomerDialog({
  open, orgName, loading, onConfirm, onCancel,
}: {
  open: boolean; orgName: string; loading: boolean;
  onConfirm: (targetTier: string) => void; onCancel: () => void;
}) {
  const [tier, setTier] = useState('starter');
  useEffect(() => { if (open) setTier('starter'); }, [open]);
  return (
    <Dialog open={open} onOpenChange={o => { if (!o) onCancel(); }}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader><DialogTitle>Konvertera till kund — {orgName}</DialogTitle></DialogHeader>
        <div className="space-y-1.5">
          <label className="text-sm font-medium text-foreground" htmlFor="convert-tier">Prenumerationsnivå</label>
          <Select value={tier} onValueChange={setTier}>
            <SelectTrigger id="convert-tier"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="starter">Starter</SelectItem>
              <SelectItem value="professional">Professional</SelectItem>
              <SelectItem value="enterprise">Enterprise</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <DialogFooter className="pt-2">
          <Button variant="outline" onClick={onCancel} disabled={loading}>Avbryt</Button>
          <Button onClick={() => onConfirm(tier)} disabled={loading}>{loading ? 'Vänta…' : 'Konvertera till kund'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Delete tenant dialog (mirrors PlatformOrganizationsPage's DeleteOrgDialog) ─
// Same typed-name confirmation — this permanently removes vehicles,
// instructors, branches, and every user's account (see handleDeleteTenantData).

function DeleteTenantDialog({
  open, orgName, loading, onConfirm, onCancel,
}: {
  open: boolean; orgName: string; loading: boolean;
  onConfirm: () => void; onCancel: () => void;
}) {
  const [confirmText, setConfirmText] = useState('');
  useEffect(() => { if (open) setConfirmText(''); }, [open]);
  const matches = confirmText.trim() === orgName;
  return (
    <Dialog open={open} onOpenChange={o => { if (!o) onCancel(); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader><DialogTitle>Ta bort tenant</DialogTitle></DialogHeader>
        <p className="text-sm text-muted-foreground">
          {orgName}s fordon, instruktörer och filialer tas bort, och alla användares konton raderas permanent.
          Fakturor, bokföring och granskningslogg bevaras. Detta kan endast återställas av en utvecklare direkt i databasen.
        </p>
        <div className="space-y-1.5">
          <label className="text-sm font-medium text-foreground" htmlFor="delete-tenant-confirm">
            Skriv <span className="font-semibold">{orgName}</span> för att bekräfta
          </label>
          <Input id="delete-tenant-confirm" value={confirmText} onChange={e => setConfirmText(e.target.value)} autoComplete="off" />
        </div>
        <DialogFooter className="pt-2">
          <Button variant="outline" onClick={onCancel} disabled={loading}>Avbryt</Button>
          <Button variant="destructive" onClick={onConfirm} disabled={loading || !matches}>{loading ? 'Tar bort…' : 'Ta bort tenant'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Tenant lifecycle control panel ────────────────────────────────────────
//
// The ONE Platform Admin surface for tenant-level lifecycle actions (Suspend/
// Restore/Cancel/Delete/Extend Trial/Convert to Customer) — distinct from
// administrator-ACCOUNT actions (password reset, etc.), which stay wherever
// they already live. Rendered wherever Platform Admin views a specific
// tenant: the Organization Detail page's Onboarding tab
// (OnboardingJourneyPanel.tsx) and the Trial Requests detail view
// (TrialRequestsPage.tsx) both embed this same component — one
// implementation, reusing the exact same mutations as Organisationer's own
// row actions (useSuspendOrg/useReactivateOrg/useTerminateOrg/useExtendTrial/
// useEndTrial/useDeleteOrg in usePlatformOrgMutations.ts). No second
// lifecycle, no page-specific state — org.status (read live via
// usePlatformOrgDetail) is the only source of truth for which actions show.
//
// "Cancel" here calls the same operation PlatformOrganizationsPage labels
// "Avsluta organisation" (terminate) — one backend transition, two approved
// Swedish labels for the same thing depending on context (trial vs. general
// org lifecycle), not two implementations.

type TenantModal =
  | null
  | { type: 'suspend' | 'restore' | 'cancel' | 'extend' | 'convert' | 'delete' };

export function TenantLifecyclePanel({ orgId, orgName }: { orgId: string; orgName: string }) {
  const { data: org, isLoading } = usePlatformOrgDetail(orgId);
  const [modal, setModal] = useState<TenantModal>(null);
  const suspendOrg = useSuspendOrg();
  const reactivateOrg = useReactivateOrg();
  const terminateOrg = useTerminateOrg();
  const extendTrial = useExtendTrial();
  const endTrial = useEndTrial();
  const deleteOrg = useDeleteOrg();

  if (isLoading || !org) {
    return <Skeleton className="h-24 rounded-xl" />;
  }

  const isActive = org.status === 'active';
  const isSuspended = org.status === 'suspended';
  const isTerminated = org.status === 'terminated';
  const isTrialing = org.subscription_status === 'trialing';

  function close() { setModal(null); }

  return (
    <div className="rounded-xl border-2 border-border bg-card px-4 py-3.5 space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Tenantstyrning</h3>
        <span className={cn('inline-flex items-center text-[11px] font-semibold px-1.5 py-0.5 rounded leading-none',
          isActive ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
            : isSuspended ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
            : 'bg-gray-100 text-gray-500 dark:bg-gray-800/40 dark:text-gray-400')}>
          {isActive ? (isTrialing ? 'Aktiv · Trial' : 'Aktiv') : isSuspended ? 'Suspenderad' : 'Avslutad'}
        </span>
      </div>
      <div className="flex flex-wrap gap-2">
        {isActive && (
          <Button variant="outline" size="sm" onClick={() => setModal({ type: 'suspend' })}>
            <ShieldOff className="w-3.5 h-3.5 mr-1.5" /> Suspendera / Återkalla åtkomst
          </Button>
        )}
        {isSuspended && (
          <Button variant="outline" size="sm" onClick={() => setModal({ type: 'restore' })}>
            <ShieldCheck className="w-3.5 h-3.5 mr-1.5" /> Återställ
          </Button>
        )}
        {isActive && (
          <Button variant="outline" size="sm" className="text-destructive" onClick={() => setModal({ type: 'cancel' })}>
            <Ban className="w-3.5 h-3.5 mr-1.5" /> Avsluta testperiod
          </Button>
        )}
        {isActive && isTrialing && (
          <>
            <Button variant="outline" size="sm" onClick={() => setModal({ type: 'extend' })}>
              <CalendarPlus className="w-3.5 h-3.5 mr-1.5" /> Förläng testperiod
            </Button>
            <Button variant="outline" size="sm" onClick={() => setModal({ type: 'convert' })}>
              <ArrowUpCircle className="w-3.5 h-3.5 mr-1.5" /> Konvertera till kund
            </Button>
          </>
        )}
        {(isSuspended || isTerminated) && (
          <Button variant="outline" size="sm" className="text-destructive" onClick={() => setModal({ type: 'delete' })}>
            <Trash2 className="w-3.5 h-3.5 mr-1.5" /> Radera tenant
          </Button>
        )}
      </div>

      <ConfirmDialog
        open={modal?.type === 'suspend'}
        title="Suspendera / återkalla åtkomst"
        description={`Tenanten kan inte logga in eller använda plattformen. Kan återställas när som helst.\n\nOrganisation: ${orgName}`}
        confirmLabel="Suspendera"
        loading={suspendOrg.isPending}
        onConfirm={() => suspendOrg.mutate(orgId, { onSuccess: () => { toast({ title: 'Suspenderad' }); close(); }, onError: e => toast({ title: 'Kunde inte suspendera', description: e.message, variant: 'destructive' }) })}
        onCancel={close}
      />
      <ConfirmDialog
        open={modal?.type === 'restore'}
        title="Återställ tenant"
        description={`Tenanten återfår full åtkomst till plattformen omedelbart.\n\nOrganisation: ${orgName}`}
        confirmLabel="Återställ"
        confirmVariant="default"
        loading={reactivateOrg.isPending}
        onConfirm={() => reactivateOrg.mutate(orgId, { onSuccess: () => { toast({ title: 'Återställd' }); close(); }, onError: e => toast({ title: 'Kunde inte återställa', description: e.message, variant: 'destructive' }) })}
        onCancel={close}
      />
      <ConfirmDialog
        open={modal?.type === 'cancel'}
        title="Avsluta testperiod"
        description={`Testperioden avbryts och tenanten kan inte längre logga in eller använda plattformen. Kan inte ångras via gränssnittet.\n\nOrganisation: ${orgName}`}
        confirmLabel="Avsluta testperiod"
        loading={terminateOrg.isPending}
        onConfirm={() => terminateOrg.mutate(orgId, { onSuccess: () => { toast({ title: 'Testperiod avslutad' }); close(); }, onError: e => toast({ title: 'Kunde inte avsluta', description: e.message, variant: 'destructive' }) })}
        onCancel={close}
      />
      <ExtendTrialDialog
        open={modal?.type === 'extend'}
        orgName={orgName}
        loading={extendTrial.isPending}
        onConfirm={days => extendTrial.mutate({ orgId, days, currentTrialEndsAt: org.trial_ends_at ?? new Date().toISOString() }, {
          onSuccess: () => { toast({ title: 'Testperiod förlängd' }); close(); },
          onError: e => toast({ title: 'Kunde inte förlänga', description: e.message, variant: 'destructive' }),
        })}
        onCancel={close}
      />
      <ConvertToCustomerDialog
        open={modal?.type === 'convert'}
        orgName={orgName}
        loading={endTrial.isPending}
        onConfirm={targetTier => endTrial.mutate({ orgId, targetTier }, {
          onSuccess: () => { toast({ title: 'Konverterad till kund' }); close(); },
          onError: e => toast({ title: 'Kunde inte konvertera', description: e.message, variant: 'destructive' }),
        })}
        onCancel={close}
      />
      <DeleteTenantDialog
        open={modal?.type === 'delete'}
        orgName={orgName}
        loading={deleteOrg.isPending}
        onConfirm={() => deleteOrg.mutate(orgId, { onSuccess: () => { toast({ title: 'Tenant borttagen' }); close(); }, onError: e => toast({ title: 'Kunde inte ta bort', description: e.message, variant: 'destructive' }) })}
        onCancel={close}
      />
    </div>
  );
}
