import { useState } from 'react';
import {
  AlertTriangle,
  Box,
  Calendar,
  ChevronRight,
  Package,
  Plus,
  RefreshCw,
  Trash2,
  TrendingDown,
} from 'lucide-react';
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Label,
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  Textarea,
  toast,
} from '@platform/ui';
import { PageLayout, PageHeader, PageContent } from '@shared/components/layout/PageLayout/PageLayout.js';
import { PermissionGate } from '@core/rbac/PermissionGate.js';
import { SubscriptionGate } from '@core/rbac/SubscriptionGate.js';
import { Permissions } from '@core/rbac/permissions.js';
import {
  useAssetClasses,
  useFixedAssets,
  useAssetSchedule,
  useRegisterAsset,
  useDepreciateAsset,
  useDisposeAsset,
  useImpairAsset,
  useGenerateSchedule,
  type FixedAsset,
  type FixedAssetStatus,
  type DisposalType,
} from '../hooks/useFixedAssets.js';
import { useFinancialPeriods } from '../hooks/useReconciliation.js';
import { formatDate, formatCurrency } from '../lib/financeUtils.js';

// ─── Helpers ─────────────────────────────────────────────────────────────────

const SEK = (n: number) => formatCurrency(n, 'SEK');

function depMethodLabel(m: string) {
  return m === 'straight_line' ? 'Linjär' : m === 'declining_balance' ? 'Degressiv' : m;
}

const DISPOSAL_TYPES: { value: DisposalType; label: string }[] = [
  { value: 'sale',      label: 'Försäljning' },
  { value: 'scrapped',  label: 'Skrotning' },
  { value: 'write_off', label: 'Utrangering' },
];

// ─── Status badge ─────────────────────────────────────────────────────────────

function AssetStatusBadge({ status }: { status: FixedAssetStatus }) {
  const map: Record<FixedAssetStatus, { label: string; cls: string }> = {
    active:             { label: 'Aktiv',          cls: 'bg-green-100 text-green-800' },
    disposed:           { label: 'Avyttrad',        cls: 'bg-gray-100 text-gray-700' },
    fully_depreciated:  { label: 'Fullt avskriven', cls: 'bg-blue-100 text-blue-700' },
    impaired:           { label: 'Nedskriven',      cls: 'bg-amber-100 text-amber-800' },
  };
  const s = map[status] ?? { label: status, cls: 'bg-gray-100 text-gray-700' };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${s.cls}`}>
      {s.label}
    </span>
  );
}

// ─── Register asset dialog ────────────────────────────────────────────────────

function RegisterAssetSheet({ onClose }: { onClose: () => void }) {
  const { data: classes = [] } = useAssetClasses();
  const { data: periods = [] } = useFinancialPeriods();
  const register = useRegisterAsset();

  const [periodId,   setPeriodId]   = useState('');
  const [classId,    setClassId]    = useState('');
  const [code,       setCode]       = useState('');
  const [name,       setName]       = useState('');
  const [acqDate,    setAcqDate]    = useState('');
  const [acqCost,    setAcqCost]    = useState('');
  const [residual,   setResidual]   = useState('0');
  const [life,       setLife]       = useState('60');
  const [method,     setMethod]     = useState('straight_line');
  const [creditAcc,  setCreditAcc]  = useState('2440');
  const [desc,       setDesc]       = useState('');
  const [notes,      setNotes]      = useState('');

  const openPeriods = periods.filter((p) => p.status === 'open');
  const canSubmit   = periodId && classId && code && name && acqDate && acqCost;

  async function handleSubmit() {
    try {
      await register.mutateAsync({
        period_id:           periodId,
        asset_class_id:      classId,
        asset_code:          code.trim(),
        asset_name:          name.trim(),
        acquisition_date:    acqDate,
        acquisition_cost:    parseFloat(acqCost),
        residual_value:      parseFloat(residual) || 0,
        useful_life_months:  parseInt(life, 10) || 60,
        depreciation_method: method as 'straight_line' | 'declining_balance',
        credit_account:      creditAcc.trim() || '2440',
        description:         desc.trim() || undefined,
        notes:               notes.trim() || undefined,
      });
      toast({ title: 'Anläggningstillgång registrerad' });
      onClose();
    } catch (e) {
      toast({ title: 'Fel', description: String(e), variant: 'destructive' });
    }
  }

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
        <DialogHeader className="pb-4">
          <DialogTitle>Registrera anläggningstillgång</DialogTitle>
        </DialogHeader>
        <div className="mt-6 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Tillgångskod</Label>
              <Input
                placeholder="t.ex. ANL-001"
                value={code}
                onChange={(e) => setCode(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Tillgångstyp</Label>
              <select
                className="w-full h-9 rounded-md border border-input bg-transparent px-3 text-sm"
                value={classId}
                onChange={(e) => setClassId(e.target.value)}
              >
                <option value="">Välj typ…</option>
                {classes.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.class_code} — {c.class_name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Namn</Label>
            <Input
              placeholder="t.ex. Ford Focus XYZ 123"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Anskaffningsdatum</Label>
              <Input type="date" value={acqDate} onChange={(e) => setAcqDate(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Anskaffningsvärde (kr)</Label>
              <Input
                type="number"
                min="0"
                step="0.01"
                placeholder="0.00"
                value={acqCost}
                onChange={(e) => setAcqCost(e.target.value)}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Restvärde (kr)</Label>
              <Input
                type="number"
                min="0"
                step="0.01"
                value={residual}
                onChange={(e) => setResidual(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Nyttjandeperiod (månader)</Label>
              <Input
                type="number"
                min="1"
                value={life}
                onChange={(e) => setLife(e.target.value)}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Avskrivningsmetod</Label>
              <select
                className="w-full h-9 rounded-md border border-input bg-transparent px-3 text-sm"
                value={method}
                onChange={(e) => setMethod(e.target.value)}
              >
                <option value="straight_line">Linjär avskrivning</option>
                <option value="declining_balance">Degressiv avskrivning</option>
              </select>
            </div>
            <div className="space-y-1.5">
              <Label>Kreditkonto (BAS)</Label>
              <Input
                placeholder="2440"
                value={creditAcc}
                onChange={(e) => setCreditAcc(e.target.value)}
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Bokföringsperiod</Label>
            <select
              className="w-full h-9 rounded-md border border-input bg-transparent px-3 text-sm"
              value={periodId}
              onChange={(e) => setPeriodId(e.target.value)}
            >
              <option value="">Välj period…</option>
              {openPeriods.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </div>

          <div className="space-y-1.5">
            <Label>Beskrivning (valfri)</Label>
            <Textarea
              rows={2}
              value={desc}
              onChange={(e) => setDesc(e.target.value)}
            />
          </div>

          <div className="space-y-1.5">
            <Label>Anteckningar (valfri)</Label>
            <Textarea
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>

          <Button
            className="w-full"
            disabled={!canSubmit || register.isPending}
            onClick={() => void handleSubmit()}
          >
            Registrera tillgång
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── Depreciate dialog ────────────────────────────────────────────────────────

function DepreciateDialog({ asset, onClose }: { asset: FixedAsset; onClose: () => void }) {
  const { data: periods = [] } = useFinancialPeriods();
  const depreciate = useDepreciateAsset(asset.id);
  const [periodId, setPeriodId] = useState('');

  const openPeriods = periods.filter((p) => p.status === 'open');

  const monthlyAmt = asset.useful_life_months > 0
    ? (asset.acquisition_cost - asset.residual_value) / asset.useful_life_months
    : 0;

  async function handleSubmit() {
    if (!periodId) return;
    try {
      await depreciate.mutateAsync(periodId);
      toast({ title: 'Avskrivning bokförd', description: `${SEK(monthlyAmt)} avskrivet` });
      onClose();
    } catch (e) {
      toast({ title: 'Fel', description: String(e), variant: 'destructive' });
    }
  }

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Bokför avskrivning — {asset.asset_name}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="grid grid-cols-2 gap-3 text-sm border rounded-lg p-3 bg-muted/30">
            <div>
              <p className="text-muted-foreground text-xs">Bokfört värde</p>
              <p className="font-mono font-semibold">{SEK(asset.net_book_value)}</p>
            </div>
            <div>
              <p className="text-muted-foreground text-xs">Månatlig avskrivning</p>
              <p className="font-mono font-semibold">{SEK(monthlyAmt)}</p>
            </div>
            <div>
              <p className="text-muted-foreground text-xs">Ackumulerat</p>
              <p className="font-mono">{SEK(asset.accumulated_depreciation)}</p>
            </div>
            <div>
              <p className="text-muted-foreground text-xs">Metod</p>
              <p>{depMethodLabel(asset.depreciation_method)}</p>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Bokföringsperiod</Label>
            <select
              className="w-full h-9 rounded-md border border-input bg-transparent px-3 text-sm"
              value={periodId}
              onChange={(e) => setPeriodId(e.target.value)}
            >
              <option value="">Välj period…</option>
              {openPeriods.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </div>
          <p className="text-xs text-muted-foreground">
            Bokföring: DR Avskrivningskostnad / CR {asset.credit_account}
          </p>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Avbryt</Button>
          <Button
            disabled={!periodId || depreciate.isPending}
            onClick={() => void handleSubmit()}
          >
            Bokför avskrivning
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Dispose dialog ───────────────────────────────────────────────────────────

function DisposeDialog({ asset, onClose }: { asset: FixedAsset; onClose: () => void }) {
  const { data: periods = [] } = useFinancialPeriods();
  const dispose = useDisposeAsset(asset.id);
  const [periodId,     setPeriodId]     = useState('');
  const [disposalType, setDisposalType] = useState<DisposalType>('sale');
  const [disposalDate, setDisposalDate] = useState('');
  const [proceeds,     setProceeds]     = useState('0');
  const [notes,        setNotes]        = useState('');

  const openPeriods = periods.filter((p) => p.status === 'open');
  const canSubmit   = periodId && disposalDate;

  async function handleSubmit() {
    try {
      await dispose.mutateAsync({
        period_id:     periodId,
        disposal_type: disposalType,
        disposal_date: disposalDate,
        proceeds:      parseFloat(proceeds) || 0,
        notes:         notes.trim() || undefined,
      });
      toast({ title: 'Tillgång avyttrad', description: asset.asset_name });
      onClose();
    } catch (e) {
      toast({ title: 'Fel', description: String(e), variant: 'destructive' });
    }
  }

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Avyttra — {asset.asset_name}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Avyttringstyp</Label>
              <select
                className="w-full h-9 rounded-md border border-input bg-transparent px-3 text-sm"
                value={disposalType}
                onChange={(e) => setDisposalType(e.target.value as DisposalType)}
              >
                {DISPOSAL_TYPES.map((d) => (
                  <option key={d.value} value={d.value}>{d.label}</option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label>Avyttringsdatum</Label>
              <Input type="date" value={disposalDate} onChange={(e) => setDisposalDate(e.target.value)} />
            </div>
          </div>
          {disposalType === 'sale' && (
            <div className="space-y-1.5">
              <Label>Försäljningspris (kr)</Label>
              <Input
                type="number"
                min="0"
                step="0.01"
                value={proceeds}
                onChange={(e) => setProceeds(e.target.value)}
              />
            </div>
          )}
          <div className="space-y-1.5">
            <Label>Bokföringsperiod</Label>
            <select
              className="w-full h-9 rounded-md border border-input bg-transparent px-3 text-sm"
              value={periodId}
              onChange={(e) => setPeriodId(e.target.value)}
            >
              <option value="">Välj period…</option>
              {openPeriods.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5">
            <Label>Anteckningar</Label>
            <Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Avbryt</Button>
          <Button
            variant="destructive"
            disabled={!canSubmit || dispose.isPending}
            onClick={() => void handleSubmit()}
          >
            Bekräfta avyttring
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Impair dialog ────────────────────────────────────────────────────────────

function ImpairDialog({ asset, onClose }: { asset: FixedAsset; onClose: () => void }) {
  const { data: periods = [] } = useFinancialPeriods();
  const impair = useImpairAsset(asset.id);
  const [periodId,  setPeriodId]  = useState('');
  const [date,      setDate]      = useState('');
  const [amount,    setAmount]    = useState('');
  const [reason,    setReason]    = useState('');

  const openPeriods = periods.filter((p) => p.status === 'open');
  const canSubmit   = periodId && date && amount;

  async function handleSubmit() {
    try {
      await impair.mutateAsync({
        period_id:         periodId,
        impairment_date:   date,
        impairment_amount: parseFloat(amount),
        reason:            reason.trim() || undefined,
      });
      toast({ title: 'Nedskrivning bokförd' });
      onClose();
    } catch (e) {
      toast({ title: 'Fel', description: String(e), variant: 'destructive' });
    }
  }

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Nedskrivning — {asset.asset_name}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Nedskrivningsdatum</Label>
              <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Nedskrivningsbelopp (kr)</Label>
              <Input
                type="number"
                min="0"
                step="0.01"
                max={String(asset.net_book_value)}
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Bokföringsperiod</Label>
            <select
              className="w-full h-9 rounded-md border border-input bg-transparent px-3 text-sm"
              value={periodId}
              onChange={(e) => setPeriodId(e.target.value)}
            >
              <option value="">Välj period…</option>
              {openPeriods.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5">
            <Label>Orsak</Label>
            <Textarea rows={2} value={reason} onChange={(e) => setReason(e.target.value)} />
          </div>
          <p className="text-xs text-muted-foreground">
            Bokfört värde: {SEK(asset.net_book_value)}. Nedskrivning minskar tillgångens värde direkt.
          </p>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Avbryt</Button>
          <Button
            disabled={!canSubmit || impair.isPending}
            onClick={() => void handleSubmit()}
          >
            Bokför nedskrivning
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Asset detail sheet ───────────────────────────────────────────────────────

function AssetDetailSheet({ asset, onClose }: { asset: FixedAsset; onClose: () => void }) {
  const { data: schedule = [], isLoading: schedLoading } = useAssetSchedule(asset.id);
  const generateSchedule = useGenerateSchedule(asset.id);

  const [deprecModal, setDeprecModal] = useState(false);
  const [disposeModal, setDisposeModal] = useState(false);
  const [impairModal, setImpairModal] = useState(false);

  const postedCount   = schedule.filter((s) => s.is_posted).length;
  const pendingLines  = schedule.filter((s) => !s.is_posted);
  const nextLine      = pendingLines[0];

  async function handleGenerateSchedule() {
    try {
      const result = await generateSchedule.mutateAsync();
      toast({ title: 'Avskrivningsplan genererad', description: `${result.lines_generated} rader skapade` });
    } catch (e) {
      toast({ title: 'Fel', description: String(e), variant: 'destructive' });
    }
  }

  const isActive = asset.status === 'active';

  return (
    <>
      <Sheet open onOpenChange={(o) => { if (!o) onClose(); }}>
        <SheetContent className="w-[560px] sm:w-[640px] overflow-y-auto">
          <SheetHeader>
            <SheetTitle className="flex items-center gap-2">
              <span className="font-mono text-sm text-muted-foreground">{asset.asset_code}</span>
              {asset.asset_name}
            </SheetTitle>
          </SheetHeader>

          {/* Status + action row */}
          <div className="mt-4 flex items-center gap-2 flex-wrap">
            <AssetStatusBadge status={asset.status} />
            {isActive && (
              <>
                <Button size="sm" variant="outline" onClick={() => setDeprecModal(true)}>
                  <TrendingDown className="w-3.5 h-3.5 mr-1.5" />
                  Avskriv
                </Button>
                <Button size="sm" variant="outline" onClick={() => setImpairModal(true)}>
                  <AlertTriangle className="w-3.5 h-3.5 mr-1.5" />
                  Nedskriv
                </Button>
                <Button size="sm" variant="outline" className="text-destructive border-destructive/30" onClick={() => setDisposeModal(true)}>
                  <Trash2 className="w-3.5 h-3.5 mr-1.5" />
                  Avyttra
                </Button>
              </>
            )}
          </div>

          {/* Info grid */}
          <div className="mt-5 grid grid-cols-2 gap-x-4 gap-y-3 text-sm border rounded-lg p-4">
            <div>
              <p className="text-xs text-muted-foreground">Anskaffningsvärde</p>
              <p className="font-mono font-semibold">{SEK(asset.acquisition_cost)}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Bokfört värde</p>
              <p className="font-mono font-semibold">{SEK(asset.net_book_value)}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Ackumulerade avskrivningar</p>
              <p className="font-mono">{SEK(asset.accumulated_depreciation)}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Restvärde</p>
              <p className="font-mono">{SEK(asset.residual_value)}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Nyttjandeperiod</p>
              <p>{asset.useful_life_months} månader</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Avskrivningsmetod</p>
              <p>{depMethodLabel(asset.depreciation_method)}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Anskaffningsdatum</p>
              <p>{formatDate(asset.acquisition_date)}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Senaste avskrivning</p>
              <p>{asset.last_depreciation_date ? formatDate(asset.last_depreciation_date) : '–'}</p>
            </div>
            {asset.bas_account && (
              <div>
                <p className="text-xs text-muted-foreground">BAS-konto</p>
                <p className="font-mono">{asset.bas_account}</p>
              </div>
            )}
            <div>
              <p className="text-xs text-muted-foreground">Kreditkonto</p>
              <p className="font-mono">{asset.credit_account}</p>
            </div>
          </div>

          {asset.description && (
            <p className="mt-3 text-sm text-muted-foreground">{asset.description}</p>
          )}

          {/* Next depreciation callout */}
          {isActive && nextLine && (
            <div className="mt-4 border border-amber-200 bg-amber-50 dark:bg-amber-950/20 rounded-lg p-3 text-sm">
              <p className="font-medium text-amber-800 dark:text-amber-400 flex items-center gap-1.5">
                <Calendar className="w-3.5 h-3.5" />
                Nästa avskrivning
              </p>
              <p className="mt-0.5 text-amber-700 dark:text-amber-500">
                Period {nextLine.period_number} · {formatDate(nextLine.depreciation_date)} · {SEK(nextLine.depreciation_amount)}
              </p>
            </div>
          )}

          {/* Depreciation schedule table */}
          <div className="mt-5">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold">
                Avskrivningsplan ({postedCount}/{schedule.length} bokförda)
              </h3>
              {isActive && (
                <Button
                  size="sm"
                  variant="outline"
                  disabled={generateSchedule.isPending}
                  onClick={() => void handleGenerateSchedule()}
                >
                  <RefreshCw className={`w-3.5 h-3.5 mr-1.5 ${generateSchedule.isPending ? 'animate-spin' : ''}`} />
                  Generera
                </Button>
              )}
            </div>

            {schedLoading ? (
              <div className="space-y-1.5">
                {[1, 2, 3].map((i) => <div key={i} className="h-8 bg-muted rounded animate-pulse" />)}
              </div>
            ) : schedule.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4 text-center border rounded-lg">
                Ingen avskrivningsplan. Klicka "Generera" för att skapa en.
              </p>
            ) : (
              <div className="border rounded-lg overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead className="border-b bg-muted/30">
                      <tr>
                        <th className="text-left px-3 py-2 font-medium text-muted-foreground">Period</th>
                        <th className="text-left px-3 py-2 font-medium text-muted-foreground">Datum</th>
                        <th className="text-right px-3 py-2 font-medium text-muted-foreground">Avskr.</th>
                        <th className="text-right px-3 py-2 font-medium text-muted-foreground">Ack. avskr.</th>
                        <th className="text-right px-3 py-2 font-medium text-muted-foreground">Bokfört värde</th>
                        <th className="text-center px-3 py-2 font-medium text-muted-foreground">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {schedule.map((line) => (
                        <tr
                          key={line.id}
                          className={line.is_posted ? 'text-muted-foreground' : 'text-foreground'}
                        >
                          <td className="px-3 py-1.5 font-mono">{line.period_number}</td>
                          <td className="px-3 py-1.5">{formatDate(line.depreciation_date)}</td>
                          <td className="px-3 py-1.5 text-right font-mono">{SEK(line.depreciation_amount)}</td>
                          <td className="px-3 py-1.5 text-right font-mono">{SEK(line.accumulated_after)}</td>
                          <td className="px-3 py-1.5 text-right font-mono">{SEK(line.net_book_value_after)}</td>
                          <td className="px-3 py-1.5 text-center">
                            {line.is_posted ? (
                              <Badge variant="secondary" className="text-xs">Bokförd</Badge>
                            ) : (
                              <span className="text-xs text-muted-foreground">Planerad</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        </SheetContent>
      </Sheet>

      {deprecModal  && <DepreciateDialog asset={asset} onClose={() => setDeprecModal(false)} />}
      {disposeModal && <DisposeDialog    asset={asset} onClose={() => setDisposeModal(false)} />}
      {impairModal  && <ImpairDialog     asset={asset} onClose={() => setImpairModal(false)} />}
    </>
  );
}

// ─── Asset row ────────────────────────────────────────────────────────────────

function AssetRow({ asset }: { asset: FixedAsset }) {
  const [open, setOpen] = useState(false);

  const pct = asset.acquisition_cost > 0
    ? (asset.accumulated_depreciation / asset.acquisition_cost) * 100
    : 0;

  return (
    <>
      <button
        className="w-full text-left hover:bg-muted/30 transition-colors"
        onClick={() => setOpen(true)}
      >
        <div className="flex items-center justify-between px-6 py-3 gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <Box className="w-4 h-4 text-muted-foreground shrink-0" />
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium truncate">{asset.asset_name}</span>
                <span className="text-xs font-mono text-muted-foreground">{asset.asset_code}</span>
              </div>
              <div className="flex items-center gap-2 mt-0.5">
                <AssetStatusBadge status={asset.status} />
                <span className="text-xs text-muted-foreground">
                  Avskr. {pct.toFixed(0)} %
                </span>
              </div>
            </div>
          </div>
          <div className="text-right shrink-0">
            <p className="text-sm font-mono font-semibold">{SEK(asset.net_book_value)}</p>
            <p className="text-xs text-muted-foreground">av {SEK(asset.acquisition_cost)}</p>
          </div>
          <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
        </div>
      </button>
      {open && <AssetDetailSheet asset={asset} onClose={() => setOpen(false)} />}
    </>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export function FixedAssetsPage() {
  const [statusFilter, setStatusFilter] = useState<FixedAssetStatus | ''>('');
  const [classFilter,  setClassFilter]  = useState('');
  const [registering,  setRegistering]  = useState(false);

  const { data: classes = [] } = useAssetClasses();
  const { data: result, isLoading } = useFixedAssets({
    status:         statusFilter || undefined,
    asset_class_id: classFilter  || undefined,
    per_page:       50,
  });

  const assets = result?.data ?? [];
  const total  = result?.meta.total ?? 0;

  const totalCost  = assets.reduce((s, a) => s + a.acquisition_cost, 0);
  const totalNbv   = assets.reduce((s, a) => s + a.net_book_value, 0);
  const totalAccum = assets.reduce((s, a) => s + a.accumulated_depreciation, 0);
  const activeCount = assets.filter((a) => a.status === 'active').length;

  return (
    <PageLayout>
      <PageHeader
        title="Anläggningstillgångar"
        description="Registrering, avskrivning och avyttring av anläggningstillgångar"
        breadcrumbs={[
          { label: 'Hem' },
          { label: 'Ekonomi', href: '/finance' },
          { label: 'Anläggningstillgångar' },
        ]}
        actions={
          <PermissionGate permission={Permissions.FINANCE_ASSETS_MANAGE}>
            <Button onClick={() => setRegistering(true)}>
              <Plus className="w-4 h-4 mr-2" />
              Registrera tillgång
            </Button>
          </PermissionGate>
        }
      />

      <PageContent>
        <SubscriptionGate feature="finance:fixed-assets:manage">
        <PermissionGate permission={Permissions.FINANCE_ASSETS_READ}>
          <div className="space-y-6">
            {/* Stats */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-1.5">
                    <Package className="w-3.5 h-3.5" />
                    Aktiva tillgångar
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{isLoading ? '…' : activeCount}</div>
                  <p className="text-xs text-muted-foreground mt-0.5">{total} totalt</p>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">Anskaffningsvärde</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold font-mono">{isLoading ? '…' : SEK(totalCost)}</div>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">Bokfört värde (NBV)</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold font-mono">{isLoading ? '…' : SEK(totalNbv)}</div>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">Ackumulerade avskr.</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold font-mono text-muted-foreground">
                    {isLoading ? '…' : SEK(totalAccum)}
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Filters */}
            <div className="flex items-center gap-3 flex-wrap">
              <select
                className="h-9 rounded-md border border-input bg-background px-3 text-sm"
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value as FixedAssetStatus | '')}
              >
                <option value="">Alla statusar</option>
                <option value="active">Aktiva</option>
                <option value="fully_depreciated">Fullt avskrivna</option>
                <option value="impaired">Nedskrivna</option>
                <option value="disposed">Avyttrade</option>
              </select>
              {classes.length > 0 && (
                <select
                  className="h-9 rounded-md border border-input bg-background px-3 text-sm"
                  value={classFilter}
                  onChange={(e) => setClassFilter(e.target.value)}
                >
                  <option value="">Alla tillgångstyper</option>
                  {classes.map((c) => (
                    <option key={c.id} value={c.id}>{c.class_code} — {c.class_name}</option>
                  ))}
                </select>
              )}
            </div>

            {/* Asset list */}
            <Card>
              <CardContent className="p-0">
                {isLoading ? (
                  <div className="px-6 py-4 space-y-3">
                    {[1, 2, 3, 4].map((i) => (
                      <div key={i} className="h-14 bg-muted rounded animate-pulse" />
                    ))}
                  </div>
                ) : assets.length === 0 ? (
                  <div className="px-6 py-10 text-center space-y-2">
                    <Box className="w-8 h-8 text-muted-foreground mx-auto" />
                    <p className="text-sm font-medium">Inga anläggningstillgångar</p>
                    <p className="text-xs text-muted-foreground">
                      Registrera din första tillgång med knappen ovan.
                    </p>
                  </div>
                ) : (
                  <div className="divide-y divide-border">
                    {assets.map((a) => <AssetRow key={a.id} asset={a} />)}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </PermissionGate>
        </SubscriptionGate>
      </PageContent>

      {registering && <RegisterAssetSheet onClose={() => setRegistering(false)} />}
    </PageLayout>
  );
}
