import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Search, Plus, Coins, RefreshCw } from 'lucide-react';
import {
  Button, Badge, Input, Label,
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
  toast,
} from '@platform/ui';
import { humanizeIdentifier } from '@platform/utils';
import { PageLayout, PageHeader, PageContent } from '@shared/components/layout/PageLayout/PageLayout.js';
import { PermissionGate } from '@core/rbac/PermissionGate.js';
import { Permissions } from '@core/rbac/permissions.js';
import { useStudentWallet } from '../hooks/useFinance.js';
import { useWalletLedger, useGrantCredits } from '../hooks/useWallet.js';
import type { LedgerParams } from '../hooks/useWallet.js';
import { formatDateTime } from '../lib/financeUtils.js';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const LESSON_CATEGORIES = [
  { value: 'B',          label: 'Klass B — Personbil' },
  { value: 'A',          label: 'Klass A — Motorcykel' },
  { value: 'A1',         label: 'Klass A1' },
  { value: 'A2',         label: 'Klass A2' },
  { value: 'AM',         label: 'Klass AM — Moped' },
  { value: 'C',          label: 'Klass C — Lastbil' },
  { value: 'CE',         label: 'Klass CE — Lastbil med släp' },
  { value: 'D',          label: 'Klass D — Buss' },
  { value: 'risk1',      label: 'Riskettan' },
  { value: 'risk2',      label: 'Risktvåan' },
  { value: 'introduction', label: 'Introduktionslektion' },
];

const ENTRY_TYPE_LABELS: Record<string, string> = {
  purchase:   'Köp',
  debit:      'Debitering',
  bonus:      'Bonus',
  refund:     'Återbetalning',
  adjustment: 'Justering',
  expiry:     'Utgång',
};

function entryTypeLabel(t: string): string {
  return ENTRY_TYPE_LABELS[t] ?? humanizeIdentifier(t);
}

function entryTypeBadgeClass(t: string): string {
  if (t === 'purchase') return 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400';
  if (t === 'bonus')    return 'bg-blue-100  text-blue-700  dark:bg-blue-900/30  dark:text-blue-400';
  if (t === 'debit')    return 'bg-red-100   text-red-700   dark:bg-red-900/30   dark:text-red-400';
  if (t === 'refund')   return 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400';
  if (t === 'expiry')   return 'bg-gray-100  text-gray-600  dark:bg-gray-800     dark:text-gray-400';
  return 'bg-muted text-muted-foreground';
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// ─── Grant credits dialog ──────────────────────────────────────────────────────

interface GrantDialogProps {
  open:          boolean;
  studentId:     string;
  onClose:       () => void;
}

function GrantCreditsDialog({ open, studentId, onClose }: GrantDialogProps) {
  const [category,    setCategory]    = useState('');
  const [quantity,    setQuantity]    = useState('');
  const [description, setDescription] = useState('');
  const [expiresAt,   setExpiresAt]   = useState('');
  const grant = useGrantCredits();

  function reset() {
    setCategory(''); setQuantity(''); setDescription(''); setExpiresAt('');
  }

  function handleClose() {
    reset();
    onClose();
  }

  function handleSubmit() {
    const qty = parseInt(quantity, 10);
    if (!category || !qty || qty <= 0) {
      toast({ title: 'Fel', description: 'Välj kategori och ange ett positivt antal.', variant: 'destructive' });
      return;
    }

    grant.mutate(
      {
        student_id:      studentId,
        lesson_category: category,
        quantity:        qty,
        description:     description.trim() || undefined,
        expires_at:      expiresAt || undefined,
      },
      {
        onSuccess: () => {
          toast({ title: 'Kreditering beviljad', description: `${qty} kredit(er) i kategorin ${category} har lagts till.` });
          handleClose();
        },
        onError: (e) => {
          toast({ title: 'Fel', description: String(e), variant: 'destructive' });
        },
      },
    );
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) handleClose(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Bevilja bonuskreditering</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label>Körkortskategori</Label>
            <Select value={category} onValueChange={setCategory}>
              <SelectTrigger>
                <SelectValue placeholder="Välj kategori…" />
              </SelectTrigger>
              <SelectContent>
                {LESSON_CATEGORIES.map((c) => (
                  <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label>Antal krediter</Label>
            <Input
              type="number"
              min="1"
              placeholder="t.ex. 1"
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
            />
          </div>

          <div className="space-y-1.5">
            <Label>Beskrivning (valfri)</Label>
            <Input
              placeholder="Orsak till kreditering…"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>

          <div className="space-y-1.5">
            <Label>Utgångsdatum (valfri)</Label>
            <Input
              type="date"
              value={expiresAt}
              onChange={(e) => setExpiresAt(e.target.value)}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={handleClose}>Avbryt</Button>
          <Button onClick={handleSubmit} disabled={grant.isPending}>
            {grant.isPending ? 'Beviljar…' : 'Bevilja kreditering'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Wallet summary bar ────────────────────────────────────────────────────────

function WalletSummaryBar({ studentId }: { studentId: string }) {
  const { data: wallet, isLoading } = useStudentWallet(studentId);

  if (isLoading) {
    return <div className="h-10 bg-muted rounded animate-pulse" />;
  }
  if (!wallet) return null;

  return (
    <div className="flex items-center gap-4 p-3 bg-muted/40 rounded-lg border border-border flex-wrap">
      <div className="flex items-center gap-1.5 text-sm">
        <Coins className="w-4 h-4 text-muted-foreground" />
        <span className="font-medium">Totalt: {wallet.total_credits} kredit{wallet.total_credits !== 1 ? 'er' : ''}</span>
      </div>
      {wallet.balances.map((b) => (
        <Badge key={b.lesson_category} variant="outline" className="text-xs font-mono">
          {b.lesson_category}: {b.balance}
        </Badge>
      ))}
    </div>
  );
}

// ─── Ledger table ─────────────────────────────────────────────────────────────

interface LedgerTableProps {
  studentId: string;
  filters:   { category: string; entryType: string; from: string; to: string };
  page:      number;
  onPageChange: (p: number) => void;
}

function LedgerTable({ studentId, filters, page, onPageChange }: LedgerTableProps) {
  const params: LedgerParams = {
    student_id:       studentId,
    page,
    per_page:         50,
    lesson_category:  filters.category  || undefined,
    entry_type:       filters.entryType || undefined,
    from:             filters.from      || undefined,
    to:               filters.to        || undefined,
  };
  const { data, isLoading, refetch, isFetching } = useWalletLedger(params);
  const entries = data?.data ?? [];
  const meta    = data?.meta;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {meta ? `${meta.total} poster` : '…'}
        </p>
        <Button variant="outline" size="sm" onClick={() => void refetch()} disabled={isFetching}>
          <RefreshCw className={`w-3.5 h-3.5 mr-1.5 ${isFetching ? 'animate-spin' : ''}`} />
          Uppdatera
        </Button>
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {[1, 2, 3, 4, 5].map((i) => <div key={i} className="h-12 bg-muted rounded animate-pulse" />)}
        </div>
      ) : entries.length === 0 ? (
        <p className="text-sm text-muted-foreground py-8 text-center">
          Inga kredittransaktioner hittades för de valda filtren.
        </p>
      ) : (
        <>
          <div className="rounded-lg border border-border overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-muted/50 border-b border-border">
                  <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Datum</th>
                  <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Typ</th>
                  <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Kategori</th>
                  <th className="text-right px-4 py-2.5 font-medium text-muted-foreground">Antal</th>
                  <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Beskrivning</th>
                  <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Utgår</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {entries.map((entry) => (
                  <tr key={entry.id} className="hover:bg-muted/20 transition-colors">
                    <td className="px-4 py-2.5 text-muted-foreground text-xs">
                      {formatDateTime(entry.created_at)}
                    </td>
                    <td className="px-4 py-2.5">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${entryTypeBadgeClass(entry.entry_type)}`}>
                        {entryTypeLabel(entry.entry_type)}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 font-mono text-xs font-medium">
                      {entry.lesson_category}
                    </td>
                    <td className={`px-4 py-2.5 text-right font-mono font-semibold ${entry.quantity > 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                      {entry.quantity > 0 ? '+' : ''}{entry.quantity}
                    </td>
                    <td className="px-4 py-2.5 text-muted-foreground text-xs max-w-xs truncate">
                      {entry.description ?? '—'}
                    </td>
                    <td className="px-4 py-2.5 text-xs text-muted-foreground">
                      {entry.expires_at ? formatDateTime(entry.expires_at) : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {meta && meta.total > meta.per_page && (
            <div className="flex items-center justify-between text-sm">
              <Button
                variant="outline"
                size="sm"
                onClick={() => onPageChange(page - 1)}
                disabled={page <= 1}
              >
                Föregående
              </Button>
              <span className="text-muted-foreground">
                Sida {page} av {Math.ceil(meta.total / meta.per_page)}
              </span>
              <Button
                variant="outline"
                size="sm"
                onClick={() => onPageChange(page + 1)}
                disabled={page >= Math.ceil(meta.total / meta.per_page)}
              >
                Nästa
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export function WalletAdminPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const urlStudentId = searchParams.get('student_id') ?? '';

  const [inputId,      setInputId]      = useState(urlStudentId);
  const [activeId,     setActiveId]     = useState(UUID_RE.test(urlStudentId) ? urlStudentId : '');
  const [showGrant,    setShowGrant]    = useState(false);
  const [page,         setPage]         = useState(1);
  const [filterCat,    setFilterCat]    = useState('');
  const [filterType,   setFilterType]   = useState('');
  const [filterFrom,   setFilterFrom]   = useState('');
  const [filterTo,     setFilterTo]     = useState('');

  function handleSearch() {
    const trimmed = inputId.trim();
    if (UUID_RE.test(trimmed)) {
      setActiveId(trimmed);
      setPage(1);
      setSearchParams({ student_id: trimmed });
    } else {
      toast({ title: 'Ogiltigt format', description: 'Ange ett giltigt student-UUID.', variant: 'destructive' });
    }
  }

  return (
    <PageLayout>
      <PageHeader
        title="Plånbok & kredithistorik"
        description="Visa och hantera elevens kreditsaldo och transaktionshistorik"
        breadcrumbs={[
          { label: 'Ekonomi', href: '/finance' },
          { label: 'Plånbok' },
        ]}
        actions={
          activeId ? (
            <PermissionGate permission={Permissions.FINANCE_WALLET_MANAGE}>
              <Button size="sm" onClick={() => setShowGrant(true)}>
                <Plus className="w-4 h-4 mr-1.5" />
                Bevilja kreditering
              </Button>
            </PermissionGate>
          ) : undefined
        }
      />

      <PageContent>
        <div className="space-y-6">

          {/* Student ID lookup */}
          <div className="flex items-end gap-3 max-w-lg">
            <div className="flex-1 space-y-1.5">
              <Label htmlFor="student-id">Elev-ID (UUID)</Label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  id="student-id"
                  className="pl-9 font-mono text-sm"
                  placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
                  value={inputId}
                  onChange={(e) => setInputId(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') handleSearch(); }}
                />
              </div>
            </div>
            <Button onClick={handleSearch}>Sök</Button>
          </div>

          {activeId ? (
            <PermissionGate permission={Permissions.FINANCE_WALLET_READ}>
              <div className="space-y-5">
                {/* Wallet summary */}
                <WalletSummaryBar studentId={activeId} />

                {/* Filters */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <div className="space-y-1">
                    <Label className="text-xs">Kategori</Label>
                    <Select value={filterCat} onValueChange={(v) => { setFilterCat(v === '__all' ? '' : v); setPage(1); }}>
                      <SelectTrigger className="h-8 text-xs">
                        <SelectValue placeholder="Alla kategorier" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__all">Alla kategorier</SelectItem>
                        {LESSON_CATEGORIES.map((c) => (
                          <SelectItem key={c.value} value={c.value}>{c.value}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-1">
                    <Label className="text-xs">Transaktionstyp</Label>
                    <Select value={filterType} onValueChange={(v) => { setFilterType(v === '__all' ? '' : v); setPage(1); }}>
                      <SelectTrigger className="h-8 text-xs">
                        <SelectValue placeholder="Alla typer" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__all">Alla typer</SelectItem>
                        {Object.entries(ENTRY_TYPE_LABELS).map(([v, l]) => (
                          <SelectItem key={v} value={v}>{l}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-1">
                    <Label className="text-xs">Från datum</Label>
                    <Input
                      type="date"
                      className="h-8 text-xs"
                      value={filterFrom}
                      onChange={(e) => { setFilterFrom(e.target.value); setPage(1); }}
                    />
                  </div>

                  <div className="space-y-1">
                    <Label className="text-xs">Till datum</Label>
                    <Input
                      type="date"
                      className="h-8 text-xs"
                      value={filterTo}
                      onChange={(e) => { setFilterTo(e.target.value); setPage(1); }}
                    />
                  </div>
                </div>

                {/* Ledger table */}
                <LedgerTable
                  studentId={activeId}
                  filters={{ category: filterCat, entryType: filterType, from: filterFrom, to: filterTo }}
                  page={page}
                  onPageChange={setPage}
                />
              </div>
            </PermissionGate>
          ) : (
            <div className="flex flex-col items-center justify-center py-20 text-center">
              <Coins className="w-10 h-10 text-muted-foreground mb-3" />
              <p className="text-sm font-medium text-foreground">Ange ett elev-ID för att visa kredithistorik</p>
              <p className="text-xs text-muted-foreground mt-1 max-w-xs">
                Du kan navigera hit direkt från elevens detaljsida via länken i plånboksöversikten.
              </p>
            </div>
          )}
        </div>
      </PageContent>

      {activeId && (
        <GrantCreditsDialog
          open={showGrant}
          studentId={activeId}
          onClose={() => setShowGrant(false)}
        />
      )}
    </PageLayout>
  );
}
