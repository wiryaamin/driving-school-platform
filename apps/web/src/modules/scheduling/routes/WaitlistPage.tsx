import { useState, useMemo } from 'react';
import { Clock, Plus, Loader2, CalendarCheck, Bell, CheckCircle2 } from 'lucide-react';
import { PageLayout, PageHeader } from '@shared/components/layout/PageLayout/PageLayout.js';
import { Button, Skeleton, toast, Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, Label, Input, Textarea } from '@platform/ui';
import { PermissionGate } from '@core/rbac/PermissionGate.js';
import { Permissions } from '@core/rbac/permissions.js';
import { useInstructorList } from '@modules/instructors/index.js';
import { useLessonTypes } from '../hooks/useLessonTypes.js';
import { useWaitlistList, usePromoteFromWaitlist, useMarkWaitlistNotified, useAddToWaitlist, useRemoveFromWaitlist } from '../hooks/useWaitlist.js';
import type { WaitlistTab, WaitlistEntryRich } from '../hooks/useWaitlist.js';
import { useSendMessage } from '@modules/communication/hooks/useCommunication.js';
import { useStudentList } from '@modules/students/hooks/useStudents.js';
import { useSlotList } from '../hooks/useSlots.js';
import { cn } from '@/lib/utils.js';

// ─── Constants ────────────────────────────────────────────────────────────────

const PER_PAGE = 25;

const TABS: { key: WaitlistTab; label: string }[] = [
  { key: 'aktiva',   label: 'Aktiva'   },
  { key: 'utgångna', label: 'Utgångna' },
  { key: 'raderade', label: 'Raderade' },
];

// ─── Formatters ───────────────────────────────────────────────────────────────

const _STO_DATETIME = new Intl.DateTimeFormat('sv-SE', {
  timeZone: 'Europe/Stockholm',
  year:     'numeric',
  month:    '2-digit',
  day:      '2-digit',
  hour:     '2-digit',
  minute:   '2-digit',
});

const _STO_DATE = new Intl.DateTimeFormat('sv-SE', {
  timeZone: 'Europe/Stockholm',
  year:     'numeric',
  month:    '2-digit',
  day:      '2-digit',
});

function fmtDatetime(iso: string | null | undefined): string {
  if (!iso) return '–';
  try { return _STO_DATETIME.format(new Date(iso)); } catch { return '–'; }
}

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return '–';
  try { return _STO_DATE.format(new Date(iso)); } catch { return '–'; }
}

// ─── WaitlistPage ─────────────────────────────────────────────────────────────

// ─── Promote button ───────────────────────────────────────────────────────────

function PromoteBtn({ entry }: { entry: WaitlistEntryRich }) {
  const promote = usePromoteFromWaitlist();
  if (!entry.lesson_slots || !entry.student_id) return null;

  function handlePromote() {
    promote.mutate(
      { waitlistEntryId: entry.id, slotId: entry.slot_id, studentId: entry.student_id },
      {
        onSuccess: () => toast({ title: 'Bokning skapad från väntelista' }),
        onError:   (err) => toast({
          title:       'Kunde inte boka',
          description: err instanceof Error ? err.message : 'Platsen kan vara fullbokad.',
          variant:     'destructive',
        }),
      },
    );
  }

  return (
    <button
      onClick={handlePromote}
      disabled={promote.isPending}
      className="flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-medium bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
    >
      {promote.isPending
        ? <Loader2 className="w-3 h-3 animate-spin" />
        : <CalendarCheck className="w-3 h-3" />}
      Boka
    </button>
  );
}

// ─── Notify button (SMS slot-available offer) ─────────────────────────────────

function NotifyWaitlistBtn({ entry, slotDateLabel }: { entry: WaitlistEntryRich; slotDateLabel: string }) {
  const sendMsg      = useSendMessage();
  const markNotified = useMarkWaitlistNotified();
  const phone        = entry.students?.phone;

  if (!phone) return null;

  const alreadyNotified = Boolean(entry.notified_at);

  function handleNotify() {
    const firstName = entry.students?.first_name ?? '';
    sendMsg.mutate(
      {
        channel:           'sms',
        recipient_type:    'student',
        recipient_id:      entry.student_id,
        recipient_address: phone!,
        body:              `Hej ${firstName}, en ledig plats har öppnats ${slotDateLabel}. Kontakta oss snarast för att boka. Platsen är ej reserverad.`,
        metadata:          { event: 'waitlist_slot_available', waitlist_entry_id: entry.id },
      },
      {
        onSuccess: () =>
          markNotified.mutate(entry.id, {
            onSuccess: () => toast({ title: 'SMS-erbjudande skickat' }),
          }),
        onError: (err) => toast({ title: 'Kunde inte skicka SMS', description: err instanceof Error ? err.message : undefined, variant: 'destructive' }),
      },
    );
  }

  const busy = sendMsg.isPending || markNotified.isPending;

  return (
    <button
      onClick={handleNotify}
      disabled={busy}
      title={alreadyNotified ? `Notifierad ${fmtDate(entry.notified_at)}` : 'Skicka SMS-erbjudande om ledig plats'}
      className={cn(
        'flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-medium border transition-colors disabled:opacity-50 disabled:cursor-not-allowed',
        alreadyNotified
          ? 'border-emerald-300 bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-400 dark:border-emerald-800/60'
          : 'border-border text-muted-foreground hover:text-foreground hover:border-primary/40 hover:bg-accent',
      )}
    >
      {busy
        ? <Loader2 className="w-3 h-3 animate-spin" />
        : alreadyNotified
          ? <CheckCircle2 className="w-3 h-3" />
          : <Bell className="w-3 h-3" />}
      {alreadyNotified ? 'Notifierad' : 'Meddela'}
    </button>
  );
}

// ─── Cancel (remove) from waitlist ────────────────────────────────────────────

function CancelWaitlistBtn({ entry }: { entry: WaitlistEntryRich }) {
  const [confirming, setConfirming] = useState(false);
  const remove = useRemoveFromWaitlist();

  function handleConfirm() {
    remove.mutate(entry.id, {
      onSuccess: () => {
        toast({ title: 'Borttagen från väntelistan' });
        setConfirming(false);
      },
      onError: () => {
        toast({ title: 'Kunde inte ta bort från väntelistan', variant: 'destructive' });
        setConfirming(false);
      },
    });
  }

  if (confirming) {
    return (
      <div className="flex items-center gap-1">
        <button
          onClick={handleConfirm}
          disabled={remove.isPending}
          className="flex items-center gap-1 px-2 py-1 rounded text-xs font-medium bg-destructive text-destructive-foreground hover:bg-destructive/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {remove.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : null}
          Bekräfta
        </button>
        <button
          onClick={() => setConfirming(false)}
          disabled={remove.isPending}
          className="px-2 py-1 rounded text-xs border border-border text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
        >
          Avbryt
        </button>
      </div>
    );
  }

  return (
    <button
      onClick={() => setConfirming(true)}
      className="flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-medium border border-border text-muted-foreground hover:text-destructive hover:border-destructive/40 transition-colors"
    >
      Ta bort
    </button>
  );
}

// ─── CreateWaitlistEntryDialog ────────────────────────────────────────────────

function CreateWaitlistEntryDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const todayStr = new Date().toISOString().slice(0, 10);

  const [studentSearch, setStudentSearch] = useState('');
  const [studentId,     setStudentId]     = useState('');
  const [date,          setDate]          = useState(todayStr);
  const [slotId,        setSlotId]        = useState('');
  const [notes,         setNotes]         = useState('');
  const [expiresAt,     setExpiresAt]     = useState('');

  const add = useAddToWaitlist();

  const { data: studentsData } = useStudentList({ per_page: 200 }, { enabled: open });
  const students = studentsData?.data ?? [];

  const filteredStudents = useMemo(() => {
    if (!studentSearch.trim()) return students.slice(0, 40);
    const q = studentSearch.toLowerCase();
    return students.filter(s =>
      `${s.first_name} ${s.last_name}`.toLowerCase().includes(q) ||
      (s.personnummer_last4 ?? '').includes(q)
    ).slice(0, 40);
  }, [students, studentSearch]);

  const { data: slotsData, isLoading: slotsLoading } = useSlotList(
    { from: date, to: date, per_page: 50, status: 'open' },
    { enabled: open && !!date },
  );
  const slots = slotsData?.data ?? [];

  const selectedStudent = students.find(s => s.id === studentId);
  const canSubmit = !!studentId && !!slotId && !add.isPending;

  function reset() {
    setStudentSearch('');
    setStudentId('');
    setDate(todayStr);
    setSlotId('');
    setNotes('');
    setExpiresAt('');
    add.reset();
  }

  function handleClose() {
    reset();
    onOpenChange(false);
  }

  function handleSubmit() {
    if (!canSubmit) return;
    add.mutate(
      {
        slot_id:    slotId,
        student_id: studentId,
        ...(notes.trim()  ? { notes:      notes.trim()            } : {}),
        ...(expiresAt     ? { expires_at: `${expiresAt}T23:59:00` } : {}),
      },
      {
        onSuccess: () => {
          toast({ title: 'Tillagd i väntelistan' });
          handleClose();
        },
        onError: (err) => toast({
          title:       'Kunde inte lägga till',
          description: err instanceof Error ? err.message : 'Försök igen.',
          variant:     'destructive',
        }),
      }
    );
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!add.isPending) { if (!v) handleClose(); else onOpenChange(true); } }}>
      <DialogContent className="max-w-md" aria-describedby={undefined}>
        <DialogHeader>
          <DialogTitle>Ny väntelistepost</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-1">

          {/* Student search */}
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Elev *</Label>
            {selectedStudent ? (
              <div className="flex items-center justify-between rounded-md border border-primary/50 bg-primary/5 px-3 py-2">
                <span className="text-sm font-medium">
                  {selectedStudent.first_name} {selectedStudent.last_name}
                </span>
                <button
                  type="button"
                  onClick={() => { setStudentId(''); setStudentSearch(''); }}
                  className="text-xs text-muted-foreground hover:text-foreground ml-2"
                >
                  Ändra
                </button>
              </div>
            ) : (
              <>
                <Input
                  placeholder="Sök på namn eller personnummer..."
                  value={studentSearch}
                  onChange={e => setStudentSearch(e.target.value)}
                  autoComplete="off"
                />
                {studentSearch.trim().length > 0 && (
                  <div className="max-h-36 overflow-y-auto rounded-md border border-border bg-popover shadow-sm">
                    {filteredStudents.length === 0 ? (
                      <p className="px-3 py-2 text-xs text-muted-foreground">Inga elever hittades</p>
                    ) : filteredStudents.map(s => (
                      <button
                        key={s.id}
                        type="button"
                        onClick={() => { setStudentId(s.id); setStudentSearch(''); }}
                        className="w-full text-left px-3 py-1.5 text-sm hover:bg-accent transition-colors"
                      >
                        {s.first_name} {s.last_name}
                        {s.personnummer_last4 && (
                          <span className="ml-2 text-xs text-muted-foreground">****{s.personnummer_last4}</span>
                        )}
                      </button>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>

          {/* Date + slot picker */}
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Datum *</Label>
            <Input
              type="date"
              value={date}
              onChange={e => { setDate(e.target.value); setSlotId(''); }}
              className="w-44"
            />
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Pass *</Label>
            {slotsLoading ? (
              <div className="h-9 rounded-md border border-border bg-muted/30 animate-pulse" />
            ) : slots.length === 0 ? (
              <p className="text-xs text-muted-foreground">Inga öppna pass på valt datum.</p>
            ) : (
              <select
                value={slotId}
                onChange={e => setSlotId(e.target.value)}
                className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-1 focus:ring-primary/40"
              >
                <option value="">Välj pass...</option>
                {slots.map(s => {
                  const start = new Date(s.starts_at).toLocaleTimeString('sv-SE', { hour: '2-digit', minute: '2-digit' });
                  const end   = new Date(s.ends_at).toLocaleTimeString('sv-SE', { hour: '2-digit', minute: '2-digit' });
                  return (
                    <option key={s.id} value={s.id}>
                      {start}–{end}
                    </option>
                  );
                })}
              </select>
            )}
          </div>

          {/* Optional fields */}
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">
              Giltig till <span className="opacity-50">(valfritt)</span>
            </Label>
            <Input
              type="date"
              value={expiresAt}
              min={todayStr}
              onChange={e => setExpiresAt(e.target.value)}
              className="w-44"
            />
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">
              Anteckningar <span className="opacity-50">(valfritt)</span>
            </Label>
            <Textarea
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder="Intern anteckning..."
              rows={2}
              className="resize-none"
            />
          </div>

        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={handleClose} disabled={add.isPending}>Avbryt</Button>
          <Button onClick={handleSubmit} disabled={!canSubmit}>
            {add.isPending && <Loader2 className="w-3.5 h-3.5 mr-2 animate-spin" />}
            Lägg till
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── WaitlistPage ─────────────────────────────────────────────────────────────

export function WaitlistPage() {
  const [tab,        setTab]        = useState<WaitlistTab>('aktiva');
  const [ltFilter,   setLtFilter]   = useState<string>('');
  const [page,       setPage]       = useState(1);
  const [createOpen, setCreateOpen] = useState(false);

  // ── Reference data ────────────────────────────────────────────────────────
  const { data: instructorsData } = useInstructorList({ per_page: 100 });
  const instructorMap = useMemo(() => {
    const map: Record<string, string> = {};
    for (const i of instructorsData?.data ?? []) {
      map[i.id] = `${i.first_name} ${i.last_name}`;
    }
    return map;
  }, [instructorsData]);

  const { data: lessonTypes = [] } = useLessonTypes();
  const ltMap = useMemo(() => {
    const map: Record<string, string> = {};
    for (const lt of lessonTypes) map[lt.id] = lt.name;
    return map;
  }, [lessonTypes]);

  // ── Waitlist entries ──────────────────────────────────────────────────────
  const { data, isLoading, isError, refetch } = useWaitlistList({ tab });

  const allEntries = data?.data ?? [];

  // Client-side lesson type filter
  const filtered = useMemo(() => {
    if (!ltFilter) return allEntries;
    return allEntries.filter(e => e.lesson_slots?.lesson_type_id === ltFilter);
  }, [allEntries, ltFilter]);

  // Client-side pagination over filtered set
  const totalFiltered = filtered.length;
  const totalPages    = Math.max(1, Math.ceil(totalFiltered / PER_PAGE));
  const pageEntries   = filtered.slice((page - 1) * PER_PAGE, page * PER_PAGE);

  function handleTabChange(newTab: WaitlistTab) {
    setTab(newTab);
    setPage(1);
  }

  function handleLtFilter(value: string) {
    setLtFilter(value);
    setPage(1);
  }

  return (
    <PermissionGate permission={Permissions.SCHEDULING_READ}>
    <PageLayout>
      <PageHeader
        title="Väntelista"
        breadcrumbs={[{ label: 'Väntelista' }]}
        actions={
          <PermissionGate permission={Permissions.SCHEDULING_CREATE}>
            <Button size="sm" className="gap-1.5" onClick={() => setCreateOpen(true)}>
              <Plus className="w-3.5 h-3.5" />
              Skapa ny
            </Button>
          </PermissionGate>
        }
      />

      {/* ── Error state ──────────────────────────────────────────────────── */}
      {isError && (
        <div className="flex items-center justify-between px-4 py-3 rounded-lg border border-destructive/30 bg-destructive/5 text-sm text-destructive">
          <span>Det gick inte att hämta väntelistan.</span>
          <button
            onClick={() => void refetch()}
            className="ml-4 shrink-0 text-xs font-medium underline underline-offset-2 hover:no-underline"
          >
            Försök igen
          </button>
        </div>
      )}

      {/* ── Tabs ─────────────────────────────────────────────────────────── */}
      <div className="border-b border-border -mx-0">
        <div className="flex gap-0">
          {TABS.map(t => (
            <button
              key={t.key}
              onClick={() => handleTabChange(t.key)}
              className={cn(
                'px-5 py-2.5 text-sm font-medium border-b-2 transition-colors',
                tab === t.key
                  ? 'border-primary text-primary'
                  : 'border-transparent text-muted-foreground hover:text-foreground hover:border-border/60'
              )}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* ── Lesson-type filter ────────────────────────────────────────────── */}
      <div className="flex items-center gap-3">
        <select
          value={ltFilter}
          onChange={e => handleLtFilter(e.target.value)}
          className="h-8 text-sm border border-border rounded px-2 bg-background text-foreground focus:outline-none focus:ring-1 focus:ring-primary/40 min-w-[160px]"
        >
          <option value="">Alla tjänster</option>
          {lessonTypes.map(lt => (
            <option key={lt.id} value={lt.id}>{lt.name}</option>
          ))}
        </select>
      </div>

      {/* ── Table ─────────────────────────────────────────────────────────── */}
      <div className="rounded-lg border border-border bg-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/40">
                <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">Kund</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">Plats</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">Lärare</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">Datum</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">Skapad</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">Intern anteckning</th>
                {tab === 'aktiva' && (
                  <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">Åtgärd</th>
                )}
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                [...Array(8)].map((_, i) => (
                  <tr key={i} className="border-b border-border last:border-0">
                    {[...Array(tab === 'aktiva' ? 7 : 6)].map((_, j) => (
                      <td key={j} className="px-4 py-3">
                        <Skeleton className="h-4 w-full rounded" />
                      </td>
                    ))}
                  </tr>
                ))
              ) : pageEntries.length === 0 ? (
                <tr>
                  <td colSpan={tab === 'aktiva' ? 7 : 6} className="px-4 py-14 text-center">
                    <div className="flex flex-col items-center gap-2.5">
                      <Clock className="w-8 h-8 text-muted-foreground/30" />
                      <p className="text-sm text-muted-foreground">Inga kunder hittades.</p>
                    </div>
                  </td>
                </tr>
              ) : (
                pageEntries.map(entry => {
                  const studentName    = entry.students
                    ? `${entry.students.first_name} ${entry.students.last_name}`
                    : '–';
                  const ltName         = entry.lesson_slots
                    ? (ltMap[entry.lesson_slots.lesson_type_id] ?? '–')
                    : '–';
                  const instructorName = entry.lesson_slots?.instructor_id
                    ? (instructorMap[entry.lesson_slots.instructor_id] ?? '–')
                    : '–';
                  const slotDate       = fmtDatetime(entry.lesson_slots?.starts_at);

                  return (
                    <tr
                      key={entry.id}
                      className="border-b border-border last:border-0 hover:bg-muted/30 transition-colors cursor-default"
                    >
                      <td className="px-4 py-3 font-medium text-foreground">{studentName}</td>
                      <td className="px-4 py-3 text-muted-foreground">{ltName}</td>
                      <td className="px-4 py-3 text-muted-foreground">{instructorName}</td>
                      <td className="px-4 py-3 text-muted-foreground whitespace-nowrap">{slotDate}</td>
                      <td className="px-4 py-3 text-muted-foreground whitespace-nowrap">{fmtDate(entry.created_at)}</td>
                      <td className="px-4 py-3 text-muted-foreground max-w-[200px] truncate">
                        {entry.notes ?? '–'}
                      </td>
                      {tab === 'aktiva' && (
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-1.5">
                            <PermissionGate permission={Permissions.SCHEDULING_CREATE}>
                              <PromoteBtn entry={entry} />
                            </PermissionGate>
                            <PermissionGate permission={Permissions.SCHEDULING_UPDATE}>
                              <NotifyWaitlistBtn entry={entry} slotDateLabel={slotDate} />
                              <CancelWaitlistBtn entry={entry} />
                            </PermissionGate>
                          </div>
                        </td>
                      )}
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* ── Pagination ────────────────────────────────────────────────── */}
        {!isLoading && totalFiltered > PER_PAGE && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-border bg-muted/20">
            <span className="text-xs text-muted-foreground">
              Visar {((page - 1) * PER_PAGE) + 1}–{Math.min(page * PER_PAGE, totalFiltered)} av {totalFiltered} resultat
            </span>
            <div className="flex items-center gap-1">
              <button
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={page === 1}
                className="px-2.5 py-1 text-xs rounded border border-border hover:bg-accent disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                Föregående
              </button>
              <button
                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages}
                className="px-2.5 py-1 text-xs rounded border border-border hover:bg-accent disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                Nästa
              </button>
            </div>
          </div>
        )}
      </div>
      <CreateWaitlistEntryDialog open={createOpen} onOpenChange={setCreateOpen} />
    </PageLayout>
    </PermissionGate>
  );
}
