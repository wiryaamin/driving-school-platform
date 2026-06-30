import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@core/api/supabase.js';
import { Button, Skeleton } from '@platform/ui';

// ─── Month picker helpers ─────────────────────────────────────────────────────

function getMonthOptions(): { value: string; label: string }[] {
  const opts = [];
  for (let i = 0; i < 24; i++) {
    const d = new Date();
    d.setDate(1);
    d.setMonth(d.getMonth() - i);
    const value = d.toISOString().slice(0, 7);
    const label = d.toLocaleDateString('sv-SE', { month: 'long', year: 'numeric' });
    opts.push({ value, label: label.charAt(0).toUpperCase() + label.slice(1) });
  }
  return opts;
}

function currentMonth() {
  return new Date().toISOString().slice(0, 7);
}

// ─── Data types ───────────────────────────────────────────────────────────────

interface StudentRow {
  id: string;
  first_name: string;
  last_name: string;
  email: string | null;
  target_licence_category: string | null;
  created_at: string;
}

interface OrgRow { name: string; org_number: string | null; }

// ─── Fetch ────────────────────────────────────────────────────────────────────

async function fetchFakturaunderlag(month: string): Promise<{ students: StudentRow[]; org: OrgRow | null }> {
  const from = `${month}-01T00:00:00`;
  const lastDay = new Date(parseInt(month.slice(0, 4)), parseInt(month.slice(5, 7)), 0).getDate();
  const to   = `${month}-${String(lastDay).padStart(2, '0')}T23:59:59`;

  const [studentsRes, orgRes] = await Promise.all([
    supabase
      .from('students')
      .select('id, first_name, last_name, email, target_licence_category, created_at')
      .gte('created_at', from)
      .lte('created_at', to)
      .is('deleted_at', null)
      .order('created_at', { ascending: true }),
    supabase
      .from('organizations')
      .select('name, org_number')
      .limit(1)
      .single(),
  ]);

  return {
    students: (studentsRes.data ?? []) as StudentRow[],
    org: orgRes.data as OrgRow | null,
  };
}

// ─── Formatting ───────────────────────────────────────────────────────────────

const DATETIME_FMT = new Intl.DateTimeFormat('sv-SE', { dateStyle: 'short', timeStyle: 'medium' });

// ─── FakturaunderlagPage ──────────────────────────────────────────────────────

export function FakturaunderlagPage() {
  const monthOpts = useMemo(() => getMonthOptions(), []);
  const [selectedMonth, setSelectedMonth] = useState(currentMonth());
  const [fetchKey,      setFetchKey]      = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['fakturaunderlag', fetchKey],
    queryFn:  () => fetchFakturaunderlag(fetchKey!),
    enabled:  !!fetchKey,
    staleTime: 5 * 60_000,
  });

  // eslint-disable-next-line react-hooks/exhaustive-deps -- intentionally reset timestamp on each new fetchKey
  const printedAt = useMemo(() => DATETIME_FMT.format(new Date()), [fetchKey]);

  const byLicence = useMemo(() => {
    const m: Record<string, number> = {};
    for (const s of (data?.students ?? [])) {
      const cat = s.target_licence_category ?? 'Okänd';
      m[cat] = (m[cat] ?? 0) + 1;
    }
    return Object.entries(m).sort((a, b) => b[1] - a[1]);
  }, [data]);

  return (
    <div className="space-y-6 max-w-3xl">
      {/* Month selector */}
      <div className="flex items-center gap-3">
        <div className="relative min-w-[200px]">
          <select
            value={selectedMonth}
            onChange={e => setSelectedMonth(e.target.value)}
            className="h-9 w-full pl-3 pr-8 text-sm border border-border rounded-md bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40 appearance-none"
          >
            {monthOpts.map(o => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
          <svg className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
          </svg>
        </div>
        <Button size="sm" onClick={() => setFetchKey(selectedMonth)}>
          Visa
        </Button>
      </div>

      {/* Report output */}
      {isLoading && (
        <div className="space-y-3">
          {[...Array(5)].map((_, i) => <Skeleton key={i} className="h-16 rounded-lg" />)}
        </div>
      )}

      {data && !isLoading && (
        <div className="rounded-lg border border-border bg-card p-6 space-y-5">
          {/* Header */}
          <div>
            <p className="text-base font-semibold text-foreground">
              {data.org?.name ?? 'Din trafikskola'}
              {data.org?.org_number ? ` (${data.org.org_number})` : ''}
            </p>
            <p className="text-sm text-primary mt-1">Fakturaunderlag för {fetchKey}</p>
            <p className="text-xs text-muted-foreground">Utskriftsdatum: {printedAt}</p>
            <p className="text-xs text-muted-foreground">
              Period: {fetchKey}-01 00:00:00 – {fetchKey?.slice(0, 7)}-{String(new Date(parseInt(fetchKey!.slice(0,4)), parseInt(fetchKey!.slice(5,7)), 0).getDate()).padStart(2,'0')} 23:59:59
            </p>
          </div>

          {/* Section: Kategori */}
          <Section title="Kategori">
            <TRow label="Nya kunder"               value={`${data.students.length} st`} />
            <TRow label="Folkbokföringsuppslag"     value="0 st" muted />
            <TRow label="Organisationsnummeruppslag" value="0 st" muted />
            <TRow label="SMS"                       value="0 st" muted />
          </Section>

          {/* Section: Behörigheter */}
          <Section title="Behörigheter">
            {byLicence.length === 0 ? (
              <TRow label="(inga)" value="0 st" muted />
            ) : (
              byLicence.map(([cat, count]) => (
                <TRow key={cat} label={cat} value={`${count} st`} link />
              ))
            )}
            <TRow label="Totalt" value={`${data.students.length} st`} bold />
          </Section>

          {/* Section: Teorimaterial - frågor */}
          <Section title="Teorimaterial - frågor">
            <TRow label="Totalt" value="0 st" bold />
          </Section>

          {/* Section: Teorimaterial - digital teoribok */}
          <Section title="Teorimaterial - digital teoribok">
            <TRow label="Totalt" value="0 st" bold />
          </Section>

          {/* Section: Kundtaggar */}
          <Section title="Kundtaggar">
            <TRow label="Totalt" value="0 st" bold />
          </Section>

          {/* Section: Student list */}
          {data.students.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full text-xs border-collapse">
                <thead>
                  <tr className="border-b-2 border-border">
                    <th className="py-2 pr-4 text-left font-semibold text-foreground">Namn</th>
                    <th className="py-2 pr-4 text-left font-semibold text-foreground">Kundtaggar</th>
                    <th className="py-2 pr-4 text-left font-semibold text-foreground">E-post</th>
                    <th className="py-2 pr-4 text-left font-semibold text-foreground">Utbildningsbehörighet</th>
                    <th className="py-2 pr-4 text-left font-semibold text-foreground">Teorimaterial</th>
                    <th className="py-2 text-left font-semibold text-foreground">Kunden skapades</th>
                  </tr>
                </thead>
                <tbody>
                  {data.students.map(s => (
                    <tr key={s.id} className="border-b border-border/50 last:border-0">
                      <td className="py-1.5 pr-4 font-medium text-foreground">
                        {s.first_name} {s.last_name}
                      </td>
                      <td className="py-1.5 pr-4 text-muted-foreground">–</td>
                      <td className="py-1.5 pr-4 text-muted-foreground">{s.email ?? '–'}</td>
                      <td className="py-1.5 pr-4">
                        {s.target_licence_category
                          ? <span className="text-primary">{s.target_licence_category} ({s.created_at.slice(0, 10)})</span>
                          : '–'}
                      </td>
                      <td className="py-1.5 pr-4 text-muted-foreground">–</td>
                      <td className="py-1.5 text-muted-foreground">
                        {DATETIME_FMT.format(new Date(s.created_at))}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {data.students.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-4">Inga nya kunder registrerades denna period.</p>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <table className="w-full text-xs border-collapse">
        <thead>
          <tr className="border-b border-border">
            <th className="py-1.5 text-left font-semibold text-foreground">{title}</th>
            <th className="py-1.5 text-right font-semibold text-foreground w-20">Antal</th>
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}

function TRow({
  label,
  value,
  bold = false,
  muted = false,
  link = false,
}: {
  label: string;
  value: string;
  bold?: boolean;
  muted?: boolean;
  link?: boolean;
}) {
  return (
    <tr className="border-b border-border/40 last:border-b-2 last:border-border">
      <td className={`py-1.5 ${bold ? 'font-semibold' : ''} ${muted ? 'text-muted-foreground' : ''} ${link ? 'text-primary' : ''}`}>
        {label}
      </td>
      <td className={`py-1.5 text-right tabular-nums ${bold ? 'font-semibold' : ''} ${muted ? 'text-muted-foreground' : ''}`}>
        {value}
      </td>
    </tr>
  );
}
