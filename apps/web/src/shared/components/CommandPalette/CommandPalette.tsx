import { useState, useEffect, useRef, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, ArrowRight } from 'lucide-react';
import { useStudentList } from '@modules/students/hooks/useStudents.js';
import { NAVIGATION } from '../layout/Sidebar/Sidebar.js';
import { cn } from '@/lib/utils.js';

// ─── Debounce ─────────────────────────────────────────────────────────────────

function useDebounce<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debounced;
}

// ─── Flat navigation items ────────────────────────────────────────────────────

const NAV_ITEMS = NAVIGATION.flatMap((section) =>
  section.items
    .filter((item) => item.path && !item.comingSoon)
    .map((item) => ({
      key:   item.key,
      label: item.labelSv,
      path:  item.path!,
      icon:  item.icon,
      group: section.labelSv,
    })),
);

// ─── CommandPalette ───────────────────────────────────────────────────────────

export function CommandPalette() {
  const [open,        setOpen]        = useState(false);
  const [query,       setQuery]       = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef  = useRef<HTMLInputElement>(null);
  const listRef   = useRef<HTMLDivElement>(null);
  const navigate  = useNavigate();

  const debouncedQuery = useDebounce(query.trim(), 180);
  const searchEnabled  = debouncedQuery.length >= 2;

  const { data: studentData, isLoading: studentLoading } = useStudentList(
    { search: debouncedQuery, per_page: 5 },
    { enabled: searchEnabled },
  );
  const students = studentData?.data ?? [];

  const filteredNav = useMemo(() => {
    if (!debouncedQuery) return NAV_ITEMS.slice(0, 8);
    const q = debouncedQuery.toLowerCase();
    return NAV_ITEMS.filter(
      (n) => n.label.toLowerCase().includes(q) || n.group.toLowerCase().includes(q),
    ).slice(0, 6);
  }, [debouncedQuery]);

  const allItems = useMemo(() => [
    ...filteredNav.map((n) => ({ type: 'nav'     as const, key: n.key, path: n.path, label: n.label, icon: n.icon, group: n.group, email: null })),
    ...students.map((s)   => ({ type: 'student'  as const, key: s.id,  path: `/students/${s.id}`, label: `${s.first_name} ${s.last_name}`, icon: null, group: null, email: s.email ?? null })),
  ], [filteredNav, students]);

  const safeIndex = allItems.length > 0 ? Math.min(activeIndex, allItems.length - 1) : 0;

  // ── Global keyboard shortcut ──────────────────────────────────────────────

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        setOpen((v) => !v);
      }
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, []);

  // ── Focus on open ─────────────────────────────────────────────────────────

  useEffect(() => {
    if (open) {
      setQuery('');
      setActiveIndex(0);
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [open]);

  // ── Scroll active item into view ──────────────────────────────────────────

  useEffect(() => {
    if (!listRef.current) return;
    const el = listRef.current.querySelector<HTMLElement>('[data-active="true"]');
    el?.scrollIntoView({ block: 'nearest' });
  }, [safeIndex]);

  // ── Handlers ──────────────────────────────────────────────────────────────

  function close() {
    setOpen(false);
    setQuery('');
    setActiveIndex(0);
  }

  function handleNavigate(path: string) {
    navigate(path);
    close();
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Escape') { close(); return; }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIndex((i) => Math.min(i + 1, allItems.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Enter') {
      const item = allItems[safeIndex];
      if (item) handleNavigate(item.path);
    }
  }

  if (!open) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm"
        onClick={close}
        aria-hidden
      />

      {/* Palette panel */}
      <div
        role="dialog"
        aria-label="Kommandopalett"
        aria-modal="true"
        className="fixed left-1/2 top-[18%] z-50 w-full max-w-lg -translate-x-1/2 rounded-2xl border border-border bg-popover shadow-2xl overflow-hidden"
        onKeyDown={handleKeyDown}
      >
        {/* Search row */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-border">
          <Search className="w-4 h-4 text-muted-foreground shrink-0" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => { setQuery(e.target.value); setActiveIndex(0); }}
            placeholder="Sök elever, sidor, åtgärder…"
            className="flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground outline-none"
            aria-autocomplete="list"
            aria-controls="cmdpal-list"
          />
          <kbd className="shrink-0 text-[10px] font-mono text-muted-foreground bg-muted px-1.5 py-0.5 rounded border border-border">
            ESC
          </kbd>
        </div>

        {/* Results */}
        <div id="cmdpal-list" ref={listRef} className="max-h-72 overflow-y-auto py-1.5">

          {/* Navigation section */}
          {filteredNav.length > 0 && (
            <div>
              <p className="px-4 py-1 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/60">
                {debouncedQuery ? 'Sidor' : 'Snabbnavigering'}
              </p>
              {filteredNav.map((item, i) => {
                const Icon     = item.icon;
                const isActive = safeIndex === i;
                return (
                  <button
                    key={item.key}
                    type="button"
                    data-active={isActive ? 'true' : undefined}
                    onClick={() => handleNavigate(item.path)}
                    className={cn(
                      'w-full flex items-center gap-3 px-4 py-2.5 text-sm transition-colors text-left',
                      isActive
                        ? 'bg-accent text-accent-foreground'
                        : 'text-popover-foreground hover:bg-accent/60',
                    )}
                  >
                    <div className="w-6 h-6 rounded-md bg-muted flex items-center justify-center shrink-0">
                      <Icon className="w-3.5 h-3.5 text-muted-foreground" />
                    </div>
                    <span className="flex-1">{item.label}</span>
                    <span className="text-[10px] text-muted-foreground/60 shrink-0">{item.group}</span>
                    {isActive && <ArrowRight className="w-3.5 h-3.5 text-muted-foreground shrink-0" />}
                  </button>
                );
              })}
            </div>
          )}

          {/* Student search section */}
          {searchEnabled && (
            <div>
              <p className="px-4 py-1 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/60 mt-1">
                Elever
              </p>
              {studentLoading ? (
                <div className="px-4 py-3 text-xs text-muted-foreground">Söker…</div>
              ) : students.length === 0 ? (
                <div className="px-4 py-3 text-xs text-muted-foreground">Inga elever hittades</div>
              ) : (
                students.map((student, i) => {
                  const idx      = filteredNav.length + i;
                  const isActive = safeIndex === idx;
                  const initials = `${student.first_name[0] ?? ''}${student.last_name[0] ?? ''}`.toUpperCase();
                  return (
                    <button
                      key={student.id}
                      type="button"
                      data-active={isActive ? 'true' : undefined}
                      onClick={() => handleNavigate(`/students/${student.id}`)}
                      className={cn(
                        'w-full flex items-center gap-3 px-4 py-2.5 text-sm transition-colors text-left',
                        isActive
                          ? 'bg-accent text-accent-foreground'
                          : 'text-popover-foreground hover:bg-accent/60',
                      )}
                    >
                      <div className="w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center shrink-0 text-[10px] font-bold text-primary">
                        {initials}
                      </div>
                      <div className="flex-1 min-w-0">
                        <span className="block font-medium">{student.first_name} {student.last_name}</span>
                        {student.email && (
                          <span className="block text-xs text-muted-foreground truncate">{student.email}</span>
                        )}
                      </div>
                      {isActive && <ArrowRight className="w-3.5 h-3.5 text-muted-foreground shrink-0" />}
                    </button>
                  );
                })
              )}
            </div>
          )}

          {/* Empty state */}
          {filteredNav.length === 0 && !searchEnabled && (
            <div className="px-4 py-8 text-center">
              <p className="text-sm text-muted-foreground">Inga resultat</p>
            </div>
          )}
        </div>

        {/* Keyboard hint footer */}
        <div className="flex items-center justify-between px-4 py-2 border-t border-border bg-muted/20 text-[10px] text-muted-foreground">
          <div className="flex items-center gap-3">
            <span className="flex items-center gap-1">
              <kbd className="font-mono bg-muted px-1 rounded border border-border">↑</kbd>
              <kbd className="font-mono bg-muted px-1 rounded border border-border">↓</kbd>
              navigera
            </span>
            <span className="flex items-center gap-1">
              <kbd className="font-mono bg-muted px-1.5 rounded border border-border">↵</kbd>
              välj
            </span>
          </div>
          <span>Ctrl+K för att öppna/stänga</span>
        </div>
      </div>
    </>
  );
}
