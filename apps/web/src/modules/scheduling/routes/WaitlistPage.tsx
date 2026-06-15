import { useState, useMemo } from 'react';
import { Clock, Plus } from 'lucide-react';
import { PageLayout, PageHeader } from '@shared/components/layout/PageLayout/PageLayout.js';
import { Button, Skeleton } from '@platform/ui';
import { useInstructorList } from '@modules/instructors/index.js';
import { useLessonTypes } from '../hooks/useLessonTypes.js';
import { useWaitlistList } from '../hooks/useWaitlist.js';
import type { WaitlistTab } from '../hooks/useWaitlist.js';
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

export function WaitlistPage() {
  const [tab,      setTab]      = useState<WaitlistTab>('aktiva');
  const [ltFilter, setLtFilter] = useState<string>('');
  const [page,     setPage]     = useState(1);

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
  const { data, isLoading } = useWaitlistList({ tab });

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
    <PageLayout>
      <PageHeader
        title="Väntelista"
        breadcrumbs={[{ label: 'Väntelista' }]}
        actions={
          <Button size="sm" className="gap-1.5">
            <Plus className="w-3.5 h-3.5" />
            Skapa ny
          </Button>
        }
      />

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
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                [...Array(8)].map((_, i) => (
                  <tr key={i} className="border-b border-border last:border-0">
                    {[...Array(6)].map((_, j) => (
                      <td key={j} className="px-4 py-3">
                        <Skeleton className="h-4 w-full rounded" />
                      </td>
                    ))}
                  </tr>
                ))
              ) : pageEntries.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-14 text-center">
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
    </PageLayout>
  );
}
