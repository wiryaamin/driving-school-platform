import { useState } from 'react';
import { Plus, Loader2, CalendarOff, ToggleLeft, ToggleRight, ChevronDown, ChevronUp, AlertTriangle } from 'lucide-react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
  Button, Label, ScrollArea, toast,
} from '@platform/ui';
import { PermissionGate } from '@core/rbac/PermissionGate.js';
import { Permissions } from '@core/rbac/permissions.js';
import { CancelBookingDialog } from '../components/CancelBookingDialog.js';
import {
  useClosures, useCreateClosure, useUpdateClosure, useToggleClosureActive,
  useBookingsAffectedByClosure,
  type OrganizationClosure, type CreateClosureInput,
} from '../hooks/useClosures.js';
import { cn } from '@/lib/utils.js';

// ─── datetime-local <-> ISO helpers ─────────────────────────────────────────────

function toDatetimeLocal(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function fromDatetimeLocal(local: string): string | null {
  if (!local) return null;
  const d = new Date(local);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

function formatRange(startsAt: string, endsAt: string): string {
  const opts: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' };
  const s = new Date(startsAt).toLocaleString('sv-SE', opts);
  const e = new Date(endsAt).toLocaleString('sv-SE', opts);
  return `${s} – ${e}`;
}

// ─── Affected bookings list (requirement #7) ───────────────────────────────────
// Shown for review only — nothing here ever cancels automatically. The admin
// cancels manually via the existing CancelBookingDialog, picking the existing
// 'school_cancelled' category so F3 credit-restoration behaves as it already
// does everywhere else in the app.

function AffectedBookingsList({ startsAt, endsAt }: { startsAt: string; endsAt: string }) {
  const { data: bookings, isLoading } = useBookingsAffectedByClosure(startsAt, endsAt);
  const [cancelTarget, setCancelTarget] = useState<{ id: string; slotId: string; startsAt: string } | null>(null);

  if (isLoading) {
    return <p className="text-xs text-gray-400 dark:text-gray-500 py-2">Kontrollerar befintliga bokningar…</p>;
  }
  if (!bookings || bookings.length === 0) {
    return <p className="text-xs text-gray-400 dark:text-gray-500 py-2">Inga framtida bokningar påverkas.</p>;
  }

  return (
    <div className="space-y-2 py-2">
      <div className="flex items-center gap-1.5 text-xs font-semibold text-amber-700 dark:text-amber-400">
        <AlertTriangle className="w-3.5 h-3.5" />
        {bookings.length} framtida {bookings.length === 1 ? 'bokning' : 'bokningar'} påverkas — avbokas inte automatiskt
      </div>
      <div className="space-y-1.5">
        {bookings.map((b) => (
          <div key={b.id} className="flex items-center justify-between gap-3 bg-amber-50 dark:bg-amber-900/10 border border-amber-100 dark:border-amber-900/30 rounded-lg px-3 py-2">
            <div className="min-w-0">
              <p className="text-xs font-medium text-gray-900 dark:text-gray-100 truncate">
                {b.student ? `${b.student.first_name} ${b.student.last_name}` : 'Okänd elev'}
                {b.lesson_type ? ` · ${b.lesson_type.name}` : ''}
              </p>
              <p className="text-[11px] text-gray-500 dark:text-gray-400">{formatRange(b.starts_at, b.ends_at)}</p>
            </div>
            <Button
              size="sm"
              variant="outline"
              className="shrink-0 h-7 px-2.5 text-xs"
              onClick={() => setCancelTarget({ id: b.id, slotId: b.slot_id, startsAt: b.starts_at })}
            >
              Avboka
            </Button>
          </div>
        ))}
      </div>

      <CancelBookingDialog
        open={cancelTarget !== null}
        onOpenChange={(open) => { if (!open) setCancelTarget(null); }}
        bookingId={cancelTarget?.id ?? null}
        slotId={cancelTarget?.slotId ?? ''}
        slotStartsAt={cancelTarget?.startsAt}
        onSuccess={() => setCancelTarget(null)}
      />
    </div>
  );
}

// ─── Create / edit dialog ───────────────────────────────────────────────────────

interface ClosureFormState {
  name:      string;
  starts_at: string; // datetime-local value
  ends_at:   string; // datetime-local value
}

const EMPTY_FORM: ClosureFormState = { name: '', starts_at: '', ends_at: '' };

function ClosureFormDialog({ open, onClose, editing }: { open: boolean; onClose: () => void; editing: OrganizationClosure | null }) {
  const [form, setForm] = useState<ClosureFormState>(() =>
    editing ? { name: editing.name, starts_at: toDatetimeLocal(editing.starts_at), ends_at: toDatetimeLocal(editing.ends_at) } : EMPTY_FORM
  );
  const create = useCreateClosure();
  const update = useUpdateClosure();
  const isPending = create.isPending || update.isPending;

  const startsIso = fromDatetimeLocal(form.starts_at);
  const endsIso   = fromDatetimeLocal(form.ends_at);
  const validRange = Boolean(startsIso && endsIso && startsIso < endsIso);
  const canSubmit = form.name.trim().length > 0 && validRange && !isPending;

  function set<K extends keyof ClosureFormState>(k: K, v: ClosureFormState[K]) {
    setForm(f => ({ ...f, [k]: v }));
  }

  function resetAndClose() {
    setForm(EMPTY_FORM);
    onClose();
  }

  function handleSubmit() {
    if (!canSubmit || !startsIso || !endsIso) return;
    const payload: CreateClosureInput = { name: form.name.trim(), starts_at: startsIso, ends_at: endsIso };

    if (editing) {
      update.mutate({ id: editing.id, ...payload }, {
        onSuccess: () => { toast({ title: 'Stängning uppdaterad' }); resetAndClose(); },
        onError: (e) => toast({ title: 'Fel', description: e instanceof Error ? e.message : 'Okänt fel', variant: 'destructive' }),
      });
    } else {
      create.mutate(payload, {
        onSuccess: () => { toast({ title: 'Stängning skapad' }); resetAndClose(); },
        onError: (e) => toast({ title: 'Fel', description: e instanceof Error ? e.message : 'Okänt fel', variant: 'destructive' }),
      });
    }
  }

  const inputCls = 'w-full text-sm border border-input rounded-md px-3 py-2 bg-background text-foreground focus:outline-none focus:ring-1 focus:ring-primary/40';
  const labelCls = 'text-xs font-medium text-muted-foreground';

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v && !isPending) resetAndClose(); }} aria-describedby={undefined}>
      <DialogContent className="max-w-md max-h-[90vh] flex flex-col p-0 gap-0 overflow-hidden">
        <DialogHeader className="px-6 pt-5 pb-4 border-b border-border shrink-0">
          <DialogTitle>{editing ? 'Redigera stängning' : 'Ny stängning'}</DialogTitle>
        </DialogHeader>

        <ScrollArea className="flex-1 min-h-0">
          <div className="px-6 py-5 space-y-4">
            <div className="space-y-1.5">
              <Label className={labelCls}>Namn / anledning <span className="text-destructive">*</span></Label>
              <input
                value={form.name}
                onChange={e => set('name', e.target.value)}
                placeholder="T.ex. Julledighet, Sommarstängt"
                className={inputCls}
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className={labelCls}>Start</Label>
                <input type="datetime-local" value={form.starts_at} onChange={e => set('starts_at', e.target.value)} className={inputCls} />
              </div>
              <div className="space-y-1.5">
                <Label className={labelCls}>Slut</Label>
                <input type="datetime-local" value={form.ends_at} onChange={e => set('ends_at', e.target.value)} className={inputCls} />
              </div>
            </div>
            {!validRange && form.starts_at && form.ends_at && (
              <p className="text-xs text-destructive -mt-2">Sluttiden måste vara efter starttiden.</p>
            )}

            <p className="text-xs text-muted-foreground leading-relaxed">
              Under stängningen kan inga nya pass genereras och inga nya bokningar skapas — varken av personal
              eller elever. Befintliga bokningar påverkas inte automatiskt.
            </p>

            {startsIso && endsIso && validRange && (
              <div className="border-t border-border pt-3">
                <AffectedBookingsList startsAt={startsIso} endsAt={endsIso} />
              </div>
            )}
          </div>
        </ScrollArea>

        <DialogFooter className="px-6 py-4 border-t border-border shrink-0">
          <Button variant="outline" onClick={resetAndClose} disabled={isPending}>Avbryt</Button>
          <Button onClick={handleSubmit} disabled={!canSubmit}>
            {isPending && <Loader2 className="w-3.5 h-3.5 mr-2 animate-spin" />}
            {editing ? 'Spara ändringar' : 'Skapa stängning'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Closure row ────────────────────────────────────────────────────────────────

function ClosureRow({ closure, onEdit }: { closure: OrganizationClosure; onEdit: () => void }) {
  const toggle = useToggleClosureActive();
  const [expanded, setExpanded] = useState(false);
  const isPast = new Date(closure.ends_at) < new Date();

  return (
    <div className={cn(
      'bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-800 transition-opacity',
      (!closure.is_active || isPast) && 'opacity-60',
    )}>
      <div className="p-4 flex items-start gap-4">
        <div className={cn(
          'shrink-0 w-10 h-10 rounded-xl flex items-center justify-center',
          closure.is_active ? 'bg-red-50 dark:bg-red-900/20 text-red-500 dark:text-red-400' : 'bg-gray-50 dark:bg-gray-800 text-gray-400',
        )}>
          <CalendarOff className="w-4.5 h-4.5" />
        </div>

        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-gray-900 dark:text-gray-100 truncate">{closure.name}</p>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{formatRange(closure.starts_at, closure.ends_at)}</p>
          <div className="flex items-center gap-2 mt-1.5">
            <span className={cn(
              'text-[10px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded',
              closure.is_active
                ? 'bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400'
                : 'bg-gray-100 dark:bg-gray-800 text-gray-400',
            )}>
              {closure.is_active ? 'Aktiv' : 'Inaktiv'}
            </span>
            {isPast && <span className="text-[10px] text-gray-400 dark:text-gray-500">Passerad</span>}
          </div>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          <Button size="sm" variant="outline" className="h-7 px-2.5 text-xs" onClick={onEdit}>Redigera</Button>
          <button
            onClick={() => toggle.mutate({ id: closure.id, is_active: !closure.is_active })}
            disabled={toggle.isPending}
            title={closure.is_active ? 'Inaktivera' : 'Aktivera'}
            className="p-1.5 rounded-lg text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors disabled:opacity-50"
          >
            {toggle.isPending
              ? <Loader2 className="w-4 h-4 animate-spin" />
              : closure.is_active
              ? <ToggleRight className="w-5 h-5 text-red-500" />
              : <ToggleLeft className="w-5 h-5" />
            }
          </button>
          <button
            onClick={() => setExpanded(v => !v)}
            className="p-1.5 rounded-lg text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
            title="Visa påverkade bokningar"
          >
            {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {expanded && (
        <div className="px-4 pb-4 -mt-1">
          <AffectedBookingsList startsAt={closure.starts_at} endsAt={closure.ends_at} />
        </div>
      )}
    </div>
  );
}

// ─── ClosuresPage ────────────────────────────────────────────────────────────────

export function ClosuresPage() {
  const { data: closures, isLoading, isError } = useClosures();
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<OrganizationClosure | null>(null);

  const activeCount = (closures ?? []).filter(c => c.is_active).length;

  function openCreate() { setEditing(null); setShowForm(true); }
  function openEdit(c: OrganizationClosure) { setEditing(c); setShowForm(true); }

  return (
    <PermissionGate permission={Permissions.SCHEDULING_AVAILABILITY_READ}>
      <div className="max-w-2xl mx-auto px-4 py-6 space-y-6">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100">Stängningar</h1>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
              {activeCount} aktiva stängningsperioder
            </p>
          </div>
          <PermissionGate permission={Permissions.SCHEDULING_AVAILABILITY_UPDATE}>
            <button
              onClick={openCreate}
              className="flex items-center gap-2 px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold rounded-xl transition-colors"
            >
              <Plus className="w-4 h-4" />
              Ny stängning
            </button>
          </PermissionGate>
        </div>

        <p className="text-xs text-muted-foreground leading-relaxed -mt-2">
          En aktiv stängning blockerar nya pass och nya bokningar under sin period — för personal, elever och
          passgenerering. Befintliga pass och bokningar påverkas inte automatiskt; avboka dem manuellt nedan
          om det behövs.
        </p>

        {isLoading ? (
          <div className="space-y-3">
            {[1, 2].map(i => <div key={i} className="h-20 bg-gray-100 dark:bg-gray-800 rounded-2xl animate-pulse" />)}
          </div>
        ) : isError ? (
          <div className="p-5 bg-red-50 dark:bg-red-900/20 rounded-2xl border border-red-100 dark:border-red-900/40 text-sm text-red-600 dark:text-red-400">
            Kunde inte ladda stängningar. Försök igen.
          </div>
        ) : !closures || closures.length === 0 ? (
          <div className="flex flex-col items-center py-16 text-center gap-3">
            <CalendarOff className="w-12 h-12 text-gray-200 dark:text-gray-700" />
            <p className="font-semibold text-gray-500 dark:text-gray-400">Inga stängningar ännu</p>
            <p className="text-sm text-gray-400 dark:text-gray-500 max-w-xs">
              Lägg till helgdagar eller andra perioder då skolan är stängd för bokning.
            </p>
            <PermissionGate permission={Permissions.SCHEDULING_AVAILABILITY_UPDATE}>
              <button
                onClick={openCreate}
                className="mt-2 flex items-center gap-2 px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold rounded-xl transition-colors"
              >
                <Plus className="w-4 h-4" />
                Skapa din första stängning
              </button>
            </PermissionGate>
          </div>
        ) : (
          <div className="space-y-3">
            {closures.map(c => <ClosureRow key={c.id} closure={c} onEdit={() => openEdit(c)} />)}
          </div>
        )}

        <ClosureFormDialog open={showForm} onClose={() => setShowForm(false)} editing={editing} />
      </div>
    </PermissionGate>
  );
}
