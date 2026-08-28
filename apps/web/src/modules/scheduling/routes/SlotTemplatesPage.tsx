import { useState, useMemo } from 'react';
import {
  Plus, Trash2, ChevronLeft, ChevronRight, Zap,
  Loader2, CalendarDays, ToggleLeft, ToggleRight,
} from 'lucide-react';
import { toast, Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, Button, ScrollArea } from '@platform/ui';
import { useInstructorList } from '@modules/instructors/index.js';
import { useVehicles } from '@modules/resources/index.js';
import { useLessonTypes } from '../hooks/useLessonTypes.js';
import { useLocations } from '../hooks/useLocations.js';
import {
  useSlotTemplates, useCreateSlotTemplate, useToggleSlotTemplate,
  useDeleteSlotTemplate, useGenerateSlotsFromTemplates,
  type SlotTemplate, type CreateSlotTemplateInput,
} from '../hooks/useSlotTemplates.js';
import { cn } from '@/lib/utils.js';

// ─── Constants ────────────────────────────────────────────────────────────────

const DAY_LABELS: Record<number, string> = {
  1: 'Måndag', 2: 'Tisdag', 3: 'Onsdag',
  4: 'Torsdag', 5: 'Fredag', 6: 'Lördag', 7: 'Söndag',
};

const DAY_SHORT: Record<number, string> = {
  1: 'Mån', 2: 'Tis', 3: 'Ons', 4: 'Tor', 5: 'Fre', 6: 'Lör', 7: 'Sön',
};

// ─── Week helpers ─────────────────────────────────────────────────────────────

function getMondayStr(d: Date): string {
  const copy = new Date(d);
  copy.setHours(12, 0, 0, 0);
  const dow = copy.getDay(); // 0=Sun
  const diff = dow === 0 ? -6 : 1 - dow;
  copy.setDate(copy.getDate() + diff);
  return copy.toISOString().slice(0, 10);
}

function addWeekDays(mondayStr: string, n: number): string {
  const d = new Date(`${mondayStr}T12:00:00`);
  d.setDate(d.getDate() + n * 7);
  return d.toISOString().slice(0, 10);
}

function formatWeekLabel(mondayStr: string): string {
  const mon = new Date(`${mondayStr}T12:00:00`);
  const sun = new Date(mon);
  sun.setDate(mon.getDate() + 6);
  return `v.${weekNumber(mon)} · ${mon.toLocaleDateString('sv-SE', { day: 'numeric', month: 'short' })} – ${sun.toLocaleDateString('sv-SE', { day: 'numeric', month: 'short', year: 'numeric' })}`;
}

function weekNumber(d: Date): number {
  const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  date.setUTCDate(date.getUTCDate() + 4 - (date.getUTCDay() || 7));
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  return Math.ceil((((date.getTime() - yearStart.getTime()) / 86_400_000) + 1) / 7);
}

function formatTime(hms: string): string {
  return hms.slice(0, 5); // "HH:MM:SS" → "HH:MM"
}

// ─── Create sheet ─────────────────────────────────────────────────────────────

const EMPTY_FORM: CreateSlotTemplateInput = {
  name:           '',
  day_of_week:    1,
  start_time:     '08:30',
  end_time:       '10:00',
  max_bookings:   1,
  instructor_id:  null,
  vehicle_id:     null,
  location_id:    null,
  lesson_type_id: null,
  notes:          null,
};

function CreateTemplateSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [form, setForm] = useState<CreateSlotTemplateInput>(EMPTY_FORM);
  const create = useCreateSlotTemplate();

  const { data: instructors } = useInstructorList({});
  const { data: vehicles }    = useVehicles();
  const { data: lessonTypes } = useLessonTypes();
  const { data: locations }   = useLocations();

  const canSubmit =
    form.name.trim().length > 0 &&
    form.start_time < form.end_time &&
    !create.isPending;

  function handleSubmit() {
    if (!canSubmit) return;
    const payload: CreateSlotTemplateInput = {
      ...form,
      name:       form.name.trim(),
      start_time: `${form.start_time}:00`,
      end_time:   `${form.end_time}:00`,
    };
    create.mutate(payload, {
      onSuccess: () => {
        toast({ title: 'Mall sparad' });
        setForm(EMPTY_FORM);
        onClose();
      },
      onError: (e) => toast({ title: 'Fel', description: e instanceof Error ? e.message : 'Okänt fel', variant: 'destructive' }),
    });
  }

  function set<K extends keyof CreateSlotTemplateInput>(k: K, v: CreateSlotTemplateInput[K]) {
    setForm(f => ({ ...f, [k]: v }));
  }

  const inputCls = 'w-full text-sm border border-input rounded-md px-3 py-2 bg-background text-foreground focus:outline-none focus:ring-1 focus:ring-primary/40';
  const labelCls = 'text-xs font-medium text-muted-foreground';

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v && !create.isPending) { setForm(EMPTY_FORM); onClose(); } }} aria-describedby={undefined}>
      <DialogContent className="max-w-md max-h-[90vh] flex flex-col p-0 gap-0 overflow-hidden">
        <DialogHeader className="px-6 pt-5 pb-4 border-b border-border shrink-0">
          <DialogTitle>Ny slotmall</DialogTitle>
        </DialogHeader>

        <ScrollArea className="flex-1 min-h-0">
          <div className="px-6 py-5 space-y-4">

            <div className="space-y-1.5">
              <label className={labelCls}>Namn <span className="text-destructive">*</span></label>
              <input
                value={form.name}
                onChange={e => set('name', e.target.value)}
                placeholder="T.ex. Tisdag morgon körkort"
                className={inputCls}
              />
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1.5">
                <label className={labelCls}>Dag</label>
                <select value={form.day_of_week} onChange={e => set('day_of_week', Number(e.target.value))} className={inputCls}>
                  {[1,2,3,4,5,6,7].map(d => <option key={d} value={d}>{DAY_LABELS[d]}</option>)}
                </select>
              </div>
              <div className="space-y-1.5">
                <label className={labelCls}>Start</label>
                <input type="time" value={form.start_time} onChange={e => set('start_time', e.target.value)} className={inputCls} />
              </div>
              <div className="space-y-1.5">
                <label className={labelCls}>Slut</label>
                <input type="time" value={form.end_time} onChange={e => set('end_time', e.target.value)} className={inputCls} />
              </div>
            </div>
            {form.start_time >= form.end_time && form.start_time && form.end_time && (
              <p className="text-xs text-destructive -mt-2">Sluttiden måste vara efter starttiden.</p>
            )}

            <div className="space-y-1.5">
              <label className={labelCls}>Max bokningar</label>
              <input
                type="number" min={1} max={20} value={form.max_bookings}
                onChange={e => set('max_bookings', Math.max(1, Number(e.target.value)))}
                className={inputCls}
              />
            </div>

            <div className="space-y-1.5">
              <label className={labelCls}>Instruktör</label>
              <select value={form.instructor_id ?? ''} onChange={e => set('instructor_id', e.target.value || null)} className={inputCls}>
                <option value="">— Ingen specifik —</option>
                {(instructors?.data ?? []).map(i => (
                  <option key={i.id} value={i.id}>{i.first_name} {i.last_name}</option>
                ))}
              </select>
            </div>

            <div className="space-y-1.5">
              <label className={labelCls}>Lektionstyp</label>
              <select value={form.lesson_type_id ?? ''} onChange={e => set('lesson_type_id', e.target.value || null)} className={inputCls}>
                <option value="">— Ingen specifik —</option>
                {(lessonTypes ?? []).map(lt => <option key={lt.id} value={lt.id}>{lt.name}</option>)}
              </select>
            </div>

            <div className="space-y-1.5">
              <label className={labelCls}>Plats</label>
              <select value={form.location_id ?? ''} onChange={e => set('location_id', e.target.value || null)} className={inputCls}>
                <option value="">— Ingen specifik —</option>
                {(locations ?? []).map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
              </select>
            </div>

            <div className="space-y-1.5">
              <label className={labelCls}>Fordon</label>
              <select value={form.vehicle_id ?? ''} onChange={e => set('vehicle_id', e.target.value || null)} className={inputCls}>
                <option value="">— Inget specifikt —</option>
                {(vehicles ?? []).map(v => <option key={v.id} value={v.id}>{v.registration_number} — {v.make} {v.model}</option>)}
              </select>
            </div>

            <div className="space-y-1.5">
              <label className={labelCls}>Anteckning</label>
              <textarea
                value={form.notes ?? ''} rows={2}
                onChange={e => set('notes', e.target.value || null)}
                placeholder="Valfri intern notering..."
                className={`${inputCls} resize-none`}
              />
            </div>

          </div>
        </ScrollArea>

        <DialogFooter className="px-6 py-4 border-t border-border shrink-0">
          <Button variant="outline" onClick={() => { setForm(EMPTY_FORM); onClose(); }} disabled={create.isPending}>
            Avbryt
          </Button>
          <Button onClick={handleSubmit} disabled={!canSubmit}>
            {create.isPending && <Loader2 className="w-3.5 h-3.5 mr-2 animate-spin" />}
            Spara mall
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Generate week card ───────────────────────────────────────────────────────

function GenerateWeekCard() {
  const [weekStart, setWeekStart]     = useState(() => getMondayStr(new Date()));
  const [lastResult, setLastResult]   = useState<number | null>(null);
  const generate = useGenerateSlotsFromTemplates();

  function handleGenerate() {
    setLastResult(null);
    generate.mutate(weekStart, {
      onSuccess: (count) => {
        setLastResult(count);
        toast({
          title: count > 0 ? `${count} pass skapades` : 'Inga nya pass',
          description: count > 0
            ? `${count} pass genererades för ${formatWeekLabel(weekStart)}.`
            : 'Alla pass finns redan eller inga mallar är aktiva.',
        });
      },
      onError: (e) => toast({
        title: 'Fel vid generering',
        description: e instanceof Error ? e.message : 'Okänt fel',
        variant: 'destructive',
      }),
    });
  }

  return (
    <div className="bg-gradient-to-br from-blue-50 to-indigo-50 dark:from-blue-900/20 dark:to-indigo-900/20 rounded-2xl border border-blue-100 dark:border-blue-800/60 p-5 space-y-4">
      <div className="flex items-center gap-2.5">
        <div className="w-8 h-8 rounded-xl bg-blue-600 flex items-center justify-center shrink-0">
          <Zap className="w-4 h-4 text-white" />
        </div>
        <div>
          <p className="text-sm font-bold text-gray-900 dark:text-gray-100">Generera vecka</p>
          <p className="text-xs text-gray-500 dark:text-gray-400">Skapar pass från aktiva mallar</p>
        </div>
      </div>

      {/* Week navigator */}
      <div className="flex items-center gap-2">
        <button
          onClick={() => setWeekStart(w => addWeekDays(w, -1))}
          className="p-1.5 rounded-lg hover:bg-blue-100 dark:hover:bg-blue-800 text-blue-600 dark:text-blue-400 transition-colors"
        >
          <ChevronLeft className="w-4 h-4" />
        </button>
        <p className="flex-1 text-center text-sm font-semibold text-gray-800 dark:text-gray-200">
          {formatWeekLabel(weekStart)}
        </p>
        <button
          onClick={() => setWeekStart(w => addWeekDays(w, 1))}
          className="p-1.5 rounded-lg hover:bg-blue-100 dark:hover:bg-blue-800 text-blue-600 dark:text-blue-400 transition-colors"
        >
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>

      <button
        onClick={handleGenerate}
        disabled={generate.isPending}
        className="w-full py-2.5 bg-action hover:bg-action-hover disabled:opacity-50 text-action-foreground font-semibold text-sm rounded-xl transition-colors flex items-center justify-center gap-2"
      >
        {generate.isPending
          ? <Loader2 className="w-4 h-4 animate-spin" />
          : <Zap className="w-4 h-4" />
        }
        {generate.isPending ? 'Genererar…' : 'Generera pass'}
      </button>

      {lastResult !== null && !generate.isPending && (
        <p className={cn(
          'text-center text-xs font-semibold',
          lastResult > 0 ? 'text-green-600 dark:text-green-400' : 'text-gray-500 dark:text-gray-400',
        )}>
          {lastResult > 0 ? `✓ ${lastResult} pass skapades` : 'Inga nya pass (allt finns redan)'}
        </p>
      )}
    </div>
  );
}

// ─── Template row ─────────────────────────────────────────────────────────────

function TemplateRow({ template }: { template: SlotTemplate }) {
  const toggle  = useToggleSlotTemplate();
  const remove  = useDeleteSlotTemplate();
  const [confirmDelete, setConfirmDelete] = useState(false);

  const instructorName = template.instructor
    ? `${template.instructor.first_name} ${template.instructor.last_name}`
    : null;

  return (
    <div className={cn(
      'bg-white dark:bg-gray-900 rounded-2xl border p-4 flex items-start gap-4 transition-opacity',
      template.is_active
        ? 'border-gray-100 dark:border-gray-800'
        : 'border-gray-100 dark:border-gray-800 opacity-60',
    )}>
      {/* Day badge */}
      <div className={cn(
        'shrink-0 w-10 h-10 rounded-xl flex items-center justify-center text-xs font-bold',
        template.is_active
          ? 'bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400'
          : 'bg-gray-50 dark:bg-gray-800 text-gray-400',
      )}>
        {DAY_SHORT[template.day_of_week] ?? '?'}
      </div>

      {/* Details */}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-gray-900 dark:text-gray-100 truncate">{template.name}</p>
        <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
          {formatTime(template.start_time)}–{formatTime(template.end_time)}
          {instructorName ? ` · ${instructorName}` : ''}
          {template.lesson_type ? ` · ${template.lesson_type.name}` : ''}
        </p>
        <div className="flex items-center gap-2 mt-1.5">
          {template.location && (
            <span className="text-[10px] text-gray-400 dark:text-gray-500">{template.location.name}</span>
          )}
          <span className="text-[10px] text-gray-400 dark:text-gray-500">max {template.max_bookings} bok.</span>
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-2 shrink-0">
        {/* Toggle active */}
        <button
          onClick={() => toggle.mutate({ id: template.id, is_active: !template.is_active })}
          disabled={toggle.isPending}
          title={template.is_active ? 'Inaktivera' : 'Aktivera'}
          className="p-1.5 rounded-lg text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors disabled:opacity-50"
        >
          {toggle.isPending
            ? <Loader2 className="w-4 h-4 animate-spin" />
            : template.is_active
            ? <ToggleRight className="w-5 h-5 text-blue-500" />
            : <ToggleLeft className="w-5 h-5" />
          }
        </button>

        {/* Delete */}
        {confirmDelete ? (
          <div className="flex items-center gap-1">
            <button
              onClick={() => remove.mutate(template.id, { onSuccess: () => setConfirmDelete(false) })}
              disabled={remove.isPending}
              className="px-2.5 py-1 bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white text-xs font-semibold rounded-lg transition-colors"
            >
              {remove.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : 'Ta bort'}
            </button>
            <button
              onClick={() => setConfirmDelete(false)}
              className="px-2.5 py-1 text-xs font-semibold text-gray-500 hover:text-gray-800 dark:hover:text-gray-200 transition-colors"
            >
              Avbryt
            </button>
          </div>
        ) : (
          <button
            onClick={() => setConfirmDelete(true)}
            className="p-1.5 rounded-lg text-gray-400 hover:bg-red-50 dark:hover:bg-red-900/20 hover:text-red-500 transition-colors"
            title="Ta bort mall"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        )}
      </div>
    </div>
  );
}

// ─── Grouped template list ────────────────────────────────────────────────────

function TemplateList({ templates }: { templates: SlotTemplate[] }) {
  const grouped = useMemo(() => {
    const map = new Map<number, SlotTemplate[]>();
    for (const t of templates) {
      const arr = map.get(t.day_of_week) ?? [];
      arr.push(t);
      map.set(t.day_of_week, arr);
    }
    return map;
  }, [templates]);

  return (
    <div className="space-y-4">
      {[1, 2, 3, 4, 5, 6, 7].map(day => {
        const dayTemplates = grouped.get(day);
        if (!dayTemplates || dayTemplates.length === 0) return null;
        return (
          <div key={day}>
            <p className="text-xs font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500 mb-2 px-1">
              {DAY_LABELS[day]}
            </p>
            <div className="space-y-2">
              {dayTemplates.map(t => <TemplateRow key={t.id} template={t} />)}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── SlotTemplatesPage ────────────────────────────────────────────────────────

export function SlotTemplatesPage() {
  const { data: templates, isLoading, isError } = useSlotTemplates();
  const [showCreate, setShowCreate] = useState(false);

  const activeCount   = (templates ?? []).filter(t => t.is_active).length;
  const inactiveCount = (templates ?? []).filter(t => !t.is_active).length;

  return (
    <div className="max-w-2xl mx-auto px-4 py-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100">Slotmallar</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
            {activeCount} aktiva · {inactiveCount} inaktiva
          </p>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          className="flex items-center gap-2 px-4 py-2.5 bg-action hover:bg-action-hover text-action-foreground text-sm font-semibold rounded-xl transition-colors"
        >
          <Plus className="w-4 h-4" />
          Ny mall
        </button>
      </div>

      {/* Generate week card */}
      <GenerateWeekCard />

      {/* Template list */}
      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3, 4].map(i => (
            <div key={i} className="h-20 bg-gray-100 dark:bg-gray-800 rounded-2xl animate-pulse" />
          ))}
        </div>
      ) : isError ? (
        <div className="p-5 bg-red-50 dark:bg-red-900/20 rounded-2xl border border-red-100 dark:border-red-900/40 text-sm text-red-600 dark:text-red-400">
          Kunde inte ladda mallar. Försök igen.
        </div>
      ) : !templates || templates.length === 0 ? (
        <div className="flex flex-col items-center py-16 text-center gap-3">
          <CalendarDays className="w-12 h-12 text-gray-200 dark:text-gray-700" />
          <p className="font-semibold text-gray-500 dark:text-gray-400">Inga mallar ännu</p>
          <p className="text-sm text-gray-400 dark:text-gray-500 max-w-xs">
            Skapa mallar för dina vanligaste pass. De kan sedan genereras med ett klick för valfri vecka.
          </p>
          <button
            onClick={() => setShowCreate(true)}
            className="mt-2 flex items-center gap-2 px-4 py-2.5 bg-action hover:bg-action-hover text-action-foreground text-sm font-semibold rounded-xl transition-colors"
          >
            <Plus className="w-4 h-4" />
            Skapa din första mall
          </button>
        </div>
      ) : (
        <TemplateList templates={templates} />
      )}

      <CreateTemplateSheet open={showCreate} onClose={() => setShowCreate(false)} />
    </div>
  );
}
