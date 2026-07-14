import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Package, ChevronDown, ChevronUp, AlertTriangle, CheckCircle2, Clock, XCircle, RotateCcw, Minus, Plus } from 'lucide-react';
import { toast } from '@platform/ui';
import { PermissionGate } from '@core/rbac/PermissionGate.js';
import { Permissions } from '@core/rbac/permissions.js';
import { usePackageOfferings, usePurchasePackage, type PackageOffering } from '@modules/finance/hooks/usePackages.js';
import {
  useStudentPackages,
  usePackageDetail,
  useConsumeCredit,
  useReverseCredit,
  packageConsumptionKeys,
  packageStatusLabel,
  packageStatusColor,
  consumptionEventLabel,
  consumptionEventColor,
  reversalTypeLabel,
  type StudentPackage,
  type PackageStatusType,
  type ReversalType,
} from '../hooks/usePackageConsumption.js';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('sv-SE', {
    year: 'numeric', month: 'short', day: 'numeric',
  });
}

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString('sv-SE', {
    month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

function lessonCategoryLabel(cat: string): string {
  const map: Record<string, string> = {
    driving:      'Körlektion',
    theory:       'Teorilektion',
    risk1:        'Risk 1',
    risk2:        'Risk 2',
    simulator:    'Simulator',
    assessment:   'Utvärdering',
    intensive:    'Intensivkurs',
    group_theory: 'Grupplektion',
    other:        'Övrigt',
  };
  return map[cat] ?? cat;
}

function StatusIcon({ status }: { status: PackageStatusType }) {
  if (status === 'active')    return <Clock className="w-4 h-4 text-green-500" />;
  if (status === 'completed') return <CheckCircle2 className="w-4 h-4 text-blue-500" />;
  if (status === 'expired')   return <XCircle className="w-4 h-4 text-gray-400" />;
  return <XCircle className="w-4 h-4 text-red-400" />;
}

// ─── Progress bar ─────────────────────────────────────────────────────────────

function ProgressBar({ used, total }: { used: number; total: number }) {
  const pct = total > 0 ? Math.min(100, Math.round((used / total) * 100)) : 0;
  const color =
    pct >= 100 ? 'bg-blue-500' :
    pct >= 75  ? 'bg-orange-400' :
    'bg-green-500';

  return (
    <div className="space-y-1">
      <div className="flex justify-between text-xs text-muted-foreground">
        <span>{used} / {total} lektioner använda</span>
        <span>{pct}%</span>
      </div>
      <div className="h-2 bg-muted rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all ${color}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <p className="text-xs text-muted-foreground">
        {total - used} kredit{total - used !== 1 ? 'er' : ''} kvar
      </p>
    </div>
  );
}

// ─── Reversal dialog ──────────────────────────────────────────────────────────

function ReversalDialog({
  assignmentId,
  onClose,
}: {
  assignmentId: string;
  onClose: () => void;
}) {
  const [reversalType, setReversalType] = useState<ReversalType>('manual');
  const [reason, setReason]             = useState('');
  const reverse = useReverseCredit();

  const TYPES: { value: ReversalType; label: string }[] = [
    { value: 'manual',            label: 'Manuell korrigering' },
    { value: 'late_cancellation', label: 'Sen avbokning' },
    { value: 'no_show_reversal',  label: 'Uteblivande återförd' },
    { value: 'instructor_error',  label: 'Instruktörsfel' },
    { value: 'administrative',    label: 'Administrativ justering' },
  ];

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!reason.trim()) return;
    try {
      await reverse.mutateAsync({ assignment_id: assignmentId, reversal_type: reversalType, reason: reason.trim() });
      toast({ title: 'Kredit återförd', description: 'Krediten har återförts och paketet uppdaterats.' });
      onClose();
    } catch {
      toast({ title: 'Fel', description: 'Kunde inte återföra krediten.', variant: 'destructive' });
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-background border border-border rounded-lg shadow-xl w-full max-w-md p-6">
        <h3 className="text-base font-semibold mb-4">Återför kredit</h3>
        <form onSubmit={(e) => { void handleSubmit(e); }} className="space-y-4">
          <div>
            <label className="text-sm font-medium text-foreground">Typ av återföring</label>
            <select
              value={reversalType}
              onChange={(e) => setReversalType(e.target.value as ReversalType)}
              className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            >
              {TYPES.map((t) => (
                <option key={t.value} value={t.value}>{t.label}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-sm font-medium text-foreground">Anledning <span className="text-destructive">*</span></label>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={3}
              placeholder="Beskriv anledningen till återföringen..."
              className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring resize-none"
              required
            />
          </div>
          <div className="flex gap-2 justify-end pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm rounded-md border border-input hover:bg-accent transition-colors"
            >
              Avbryt
            </button>
            <button
              type="submit"
              disabled={!reason.trim() || reverse.isPending}
              className="px-4 py-2 text-sm rounded-md bg-yellow-600 text-white hover:bg-yellow-700 disabled:opacity-50 transition-colors"
            >
              {reverse.isPending ? 'Återför...' : 'Återför kredit'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Package detail expansion ─────────────────────────────────────────────────

function PackageDetailPanel({ assignmentId }: { assignmentId: string }) {
  const { data, isLoading } = usePackageDetail(assignmentId);
  const [showReversal, setShowReversal] = useState(false);
  const consume = useConsumeCredit();

  if (isLoading) {
    return (
      <div className="pt-3 border-t border-border mt-3">
        <div className="space-y-2">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-6 bg-muted rounded animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  const pkg = data?.data;
  if (!pkg) return null;

  async function handleConsume() {
    if (!pkg) return;
    try {
      await consume.mutateAsync({ assignment_id: pkg.id });
      toast({ title: 'Kredit förbrukad', description: `${pkg.lessons_remaining - 1} kredit${(pkg.lessons_remaining - 1) !== 1 ? 'er' : ''} kvar.` });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Kunde inte förbruka kredit.';
      toast({ title: 'Fel', description: msg, variant: 'destructive' });
    }
  }

  return (
    <div className="pt-3 border-t border-border mt-3 space-y-4">
      {/* Timeline */}
      {pkg.events.length > 0 && (
        <div>
          <h5 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Händelselogg</h5>
          <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
            {pkg.events.map((ev) => (
              <div key={ev.id} className="flex items-start gap-2 text-xs">
                <span className={`mt-0.5 w-1.5 h-1.5 rounded-full flex-shrink-0 ${consumptionEventColor(ev.event_type).replace('text-', 'bg-')}`} />
                <div className="flex-1 min-w-0">
                  <span className="font-medium text-foreground">{consumptionEventLabel(ev.event_type)}</span>
                  {ev.actor_email != null && (
                    <span className="text-muted-foreground"> · {ev.actor_email}</span>
                  )}
                  {ev.metadata['reason'] != null && (
                    <span className="text-muted-foreground"> · {String(ev.metadata['reason'])}</span>
                  )}
                </div>
                <span className="text-muted-foreground flex-shrink-0">{formatDateTime(ev.created_at)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Reversals */}
      {pkg.reversals.length > 0 && (
        <div>
          <h5 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Återföringar</h5>
          <div className="space-y-1">
            {pkg.reversals.map((r) => (
              <div key={r.id} className="flex items-start gap-2 text-xs bg-yellow-50 dark:bg-yellow-900/20 rounded px-2 py-1">
                <RotateCcw className="w-3 h-3 text-yellow-600 mt-0.5 flex-shrink-0" />
                <div className="flex-1">
                  <span className="font-medium">{reversalTypeLabel(r.reversal_type)}</span>
                  <span className="text-muted-foreground"> — {r.reason}</span>
                </div>
                <span className="text-muted-foreground flex-shrink-0">{formatDateTime(r.created_at)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Actions */}
      {pkg.status === 'active' && (
        <div className="flex gap-2 pt-1">
          <PermissionGate permission={Permissions.PACKAGES_CONSUMPTION_RECORD}>
            <button
              onClick={() => { void handleConsume(); }}
              disabled={consume.isPending || pkg.lessons_remaining <= 0}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-md bg-orange-100 text-orange-800 hover:bg-orange-200 disabled:opacity-40 transition-colors"
            >
              <Minus className="w-3 h-3" />
              {consume.isPending ? 'Registrerar...' : 'Registrera kredit'}
            </button>
          </PermissionGate>
          <PermissionGate permission={Permissions.PACKAGES_CONSUMPTION_REVERSE}>
            <button
              onClick={() => setShowReversal(true)}
              disabled={pkg.lessons_used <= 0}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-md bg-yellow-100 text-yellow-800 hover:bg-yellow-200 disabled:opacity-40 transition-colors"
            >
              <RotateCcw className="w-3 h-3" />
              Återför kredit
            </button>
          </PermissionGate>
        </div>
      )}
      {pkg.status === 'completed' && (
        <PermissionGate permission={Permissions.PACKAGES_CONSUMPTION_REVERSE}>
          <button
            onClick={() => setShowReversal(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-md bg-yellow-100 text-yellow-800 hover:bg-yellow-200 transition-colors"
          >
            <RotateCcw className="w-3 h-3" />
            Återför kredit (återaktivera)
          </button>
        </PermissionGate>
      )}

      {showReversal && (
        <ReversalDialog
          assignmentId={pkg.id}
          onClose={() => setShowReversal(false)}
        />
      )}
    </div>
  );
}

// ─── Sell package dialog ──────────────────────────────────────────────────────

function SellPackageDialog({
  studentId,
  onClose,
}: {
  studentId: string;
  onClose: () => void;
}) {
  const [selectedId, setSelectedId] = useState('');
  const qc = useQueryClient();
  const { data, isLoading } = usePackageOfferings({ status: 'active' });
  const purchase = usePurchasePackage();

  const offerings = data?.data ?? [];
  const selected: PackageOffering | undefined = offerings.find((o) => o.id === selectedId);

  function totalInclVat(o: PackageOffering): string {
    const total = Math.round(o.price * (1 + o.vat_rate / 100));
    return `${total.toLocaleString('sv-SE')} kr`;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedId) return;
    try {
      await purchase.mutateAsync({ studentId, offeringId: selectedId });
      void qc.invalidateQueries({ queryKey: packageConsumptionKeys.lists() });
      toast({ title: 'Paket sålt', description: 'Paketet har registrerats och en faktura har skapats.' });
      onClose();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Kunde inte sälja paketet.';
      toast({ title: 'Fel', description: msg, variant: 'destructive' });
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-background border border-border rounded-lg shadow-xl w-full max-w-md p-6 mx-4">
        <h3 className="text-base font-semibold mb-4">Sälj paket till elev</h3>
        <form onSubmit={(e) => { void handleSubmit(e); }} className="space-y-4">
          <div>
            <label className="text-sm font-medium text-foreground">
              Välj erbjudande <span className="text-destructive">*</span>
            </label>
            {isLoading ? (
              <div className="mt-1 h-9 bg-muted rounded animate-pulse" />
            ) : offerings.length === 0 ? (
              <p className="mt-2 text-sm text-muted-foreground">
                Inga aktiva erbjudanden tillgängliga. Aktivera ett paket under Paket-sektionen.
              </p>
            ) : (
              <select
                value={selectedId}
                onChange={(e) => setSelectedId(e.target.value)}
                className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                required
              >
                <option value="">Välj ett paket...</option>
                {offerings.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.name} — {o.quantity} lek. · {totalInclVat(o)}
                  </option>
                ))}
              </select>
            )}
          </div>

          {selected != null && (
            <div className="rounded-md bg-muted/50 px-3 py-2 text-xs space-y-1.5">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Kategori</span>
                <span className="font-medium">{lessonCategoryLabel(selected.lesson_category)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Antal lektioner</span>
                <span className="font-medium">{selected.quantity}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Pris (exkl. moms)</span>
                <span className="font-medium">{selected.price.toLocaleString('sv-SE')} kr</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Moms ({selected.vat_rate}%)</span>
                <span className="font-medium">
                  {Math.round(selected.price * selected.vat_rate / 100).toLocaleString('sv-SE')} kr
                </span>
              </div>
              <div className="flex justify-between font-semibold text-foreground border-t border-border pt-1.5">
                <span>Totalt inkl. moms</span>
                <span>{totalInclVat(selected)}</span>
              </div>
            </div>
          )}

          <div className="flex gap-2 justify-end pt-2">
            <button
              type="button"
              onClick={onClose}
              disabled={purchase.isPending}
              className="px-4 py-2 text-sm rounded-md border border-input hover:bg-accent transition-colors disabled:opacity-50"
            >
              Avbryt
            </button>
            <button
              type="submit"
              disabled={!selectedId || purchase.isPending || offerings.length === 0}
              className="px-4 py-2 text-sm rounded-md bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors"
            >
              {purchase.isPending ? 'Säljer...' : 'Sälj paket'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Package card ─────────────────────────────────────────────────────────────

function PackageCard({ pkg }: { pkg: StudentPackage }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="border border-border rounded-lg overflow-hidden">
      <div className="p-4 bg-card">
        {/* Header row */}
        <div className="flex items-start justify-between gap-3 mb-3">
          <div className="flex items-start gap-2 min-w-0">
            <StatusIcon status={pkg.status} />
            <div className="min-w-0">
              <p className="font-medium text-sm text-foreground truncate">{pkg.package_name}</p>
              <p className="text-xs text-muted-foreground">
                {lessonCategoryLabel(pkg.lesson_category)}
                {pkg.package_code != null && ` · ${pkg.package_code}`}
              </p>
            </div>
          </div>
          <span className={`text-xs font-medium px-2 py-0.5 rounded-full flex-shrink-0 ${packageStatusColor(pkg.status)}`}>
            {packageStatusLabel(pkg.status)}
          </span>
        </div>

        {/* Expiration warning */}
        {pkg.expiration_warning && pkg.status === 'active' && (
          <div className="flex items-center gap-1.5 mb-3 p-2 bg-amber-50 dark:bg-amber-900/20 rounded text-xs text-amber-700 dark:text-amber-400">
            <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0" />
            Löper ut {formatDate(pkg.expires_at)} — uppmana eleven att boka lektioner
          </div>
        )}

        {/* Progress bar */}
        {pkg.status !== 'cancelled' && (
          <ProgressBar used={pkg.lessons_used} total={pkg.package_quantity} />
        )}

        {/* Meta row */}
        <div className="flex items-center justify-between mt-3 text-xs text-muted-foreground">
          <div className="flex items-center gap-3">
            {pkg.campaign_name != null && (
              <span className="bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300 px-1.5 py-0.5 rounded">
                {pkg.campaign_name}
              </span>
            )}
            {pkg.coupon_code != null && (
              <span className="bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300 px-1.5 py-0.5 rounded">
                {pkg.coupon_code}
              </span>
            )}
            {pkg.expires_at != null && pkg.status === 'active' && !pkg.expiration_warning && (
              <span>Giltig till {formatDate(pkg.expires_at)}</span>
            )}
          </div>
          <button
            onClick={() => setExpanded((v) => !v)}
            className="flex items-center gap-1 text-muted-foreground hover:text-foreground transition-colors"
          >
            {expanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
            {expanded ? 'Dölj' : 'Detaljer'}
          </button>
        </div>

        {/* Expanded detail */}
        {expanded && <PackageDetailPanel assignmentId={pkg.id} />}
      </div>
    </div>
  );
}

// ─── Main panel ───────────────────────────────────────────────────────────────

export function StudentPackagePanel({ studentId }: { studentId: string }) {
  const [showSellDialog, setShowSellDialog] = useState(false);
  const { data, isLoading, isError } = useStudentPackages(studentId);

  if (isLoading) {
    return (
      <div className="space-y-3">
        {[1, 2].map((i) => (
          <div key={i} className="h-28 bg-muted rounded-lg animate-pulse" />
        ))}
      </div>
    );
  }

  if (isError) {
    return (
      <div className="p-4 bg-destructive/10 text-destructive rounded-lg text-sm">
        Kunde inte ladda paket. Prova att ladda om sidan.
      </div>
    );
  }

  const packages = data?.data ?? [];

  if (packages.length === 0) {
    return (
      <div>
        <div className="flex justify-end mb-3">
          <PermissionGate permission={Permissions.FINANCE_PACKAGE_CREATE}>
            <button
              onClick={() => setShowSellDialog(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-md bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
            >
              <Plus className="w-3.5 h-3.5" />
              Sälj paket
            </button>
          </PermissionGate>
        </div>
        <div className="flex flex-col items-center justify-center py-10 text-center">
          <Package className="w-10 h-10 text-muted-foreground/40 mb-3" />
          <p className="text-sm font-medium text-muted-foreground">Inga paket tilldelade</p>
          <p className="text-xs text-muted-foreground/70 mt-1">
            Paket kan säljas manuellt eller tilldelas automatiskt vid anmälan.
          </p>
        </div>
        {showSellDialog && (
          <SellPackageDialog studentId={studentId} onClose={() => setShowSellDialog(false)} />
        )}
      </div>
    );
  }

  const active    = packages.filter((p) => p.status === 'active');
  const completed = packages.filter((p) => p.status === 'completed');
  const other     = packages.filter((p) => p.status !== 'active' && p.status !== 'completed');

  return (
    <div className="space-y-6">
      <div className="flex justify-end">
        <PermissionGate permission={Permissions.FINANCE_PACKAGE_CREATE}>
          <button
            onClick={() => setShowSellDialog(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-md bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
          >
            <Plus className="w-3.5 h-3.5" />
            Sälj paket
          </button>
        </PermissionGate>
      </div>
      {active.length > 0 && (
        <div>
          <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">
            Aktiva paket ({active.length})
          </h4>
          <div className="space-y-3">
            {active.map((pkg) => <PackageCard key={pkg.id} pkg={pkg} />)}
          </div>
        </div>
      )}

      {completed.length > 0 && (
        <div>
          <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">
            Avslutade paket ({completed.length})
          </h4>
          <div className="space-y-3">
            {completed.map((pkg) => <PackageCard key={pkg.id} pkg={pkg} />)}
          </div>
        </div>
      )}

      {other.length > 0 && (
        <div>
          <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">
            Övriga ({other.length})
          </h4>
          <div className="space-y-3">
            {other.map((pkg) => <PackageCard key={pkg.id} pkg={pkg} />)}
          </div>
        </div>
      )}
      {showSellDialog && (
        <SellPackageDialog studentId={studentId} onClose={() => setShowSellDialog(false)} />
      )}
    </div>
  );
}
