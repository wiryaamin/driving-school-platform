import { useState, useMemo } from 'react';
import { Search, FileText, AlertCircle, Clock, ChevronRight } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@core/api/supabase.js';
import { PageLayout, PageHeader } from '@shared/components/layout/PageLayout/PageLayout.js';
import { Skeleton } from '@platform/ui';
import { InvoiceStatusBadge } from '../components/InvoiceStatusBadge.js';
import { cn } from '@/lib/utils.js';
import type { Invoice, InvoiceStatus } from '../hooks/useFinance.js';

// ─── Types ────────────────────────────────────────────────────────────────────

interface StudentRef {
  id:         string;
  first_name: string;
  last_name:  string;
  email:      string | null;
}

type StatusFilter = 'all' | 'issued' | 'overdue' | 'partially_paid';

const STATUS_FILTER_OPTIONS: { value: StatusFilter; label: string }[] = [
  { value: 'all',           label: 'Visa alla' },
  { value: 'issued',        label: 'Skickade' },
  { value: 'overdue',       label: 'Förfallna' },
  { value: 'partially_paid', label: 'Delbetalda' },
];

const UNPAID_STATUSES: InvoiceStatus[] = ['draft', 'issued', 'overdue', 'partially_paid'];
const REQUEST_STATUSES: InvoiceStatus[] = ['issued', 'overdue', 'partially_paid'];

// ─── Data hooks ───────────────────────────────────────────────────────────────

async function fetchUnpaidInvoices(): Promise<Invoice[]> {
  const { data, error } = await supabase
    .from('invoices')
    .select('*')
    .in('status', UNPAID_STATUSES)
    .order('created_at', { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as unknown as Invoice[];
}

async function fetchStudentsByIds(ids: string[]): Promise<StudentRef[]> {
  if (ids.length === 0) return [];
  const { data, error } = await supabase
    .from('students')
    .select('id, first_name, last_name, email')
    .in('id', ids)
    .is('deleted_at', null);
  if (error) throw new Error(error.message);
  return (data ?? []) as StudentRef[];
}

function useBetalningsdata() {
  const invoicesQ = useQuery({
    queryKey: ['betalningsbegäran', 'invoices'],
    queryFn:  fetchUnpaidInvoices,
    staleTime: 2 * 60_000,
  });

  const studentIds = useMemo(() => {
    const ids = new Set((invoicesQ.data ?? []).map(i => i.student_id));
    return [...ids];
  }, [invoicesQ.data]);

  const studentsQ = useQuery({
    queryKey: ['betalningsbegäran', 'students', studentIds],
    queryFn:  () => fetchStudentsByIds(studentIds),
    enabled:  studentIds.length > 0,
    staleTime: 5 * 60_000,
  });

  return {
    invoices: invoicesQ.data ?? [],
    students: studentsQ.data ?? [],
    isLoading: invoicesQ.isLoading || studentsQ.isLoading,
    error: invoicesQ.error ?? studentsQ.error,
  };
}

// ─── Formatting helpers ───────────────────────────────────────────────────────

const SEK = new Intl.NumberFormat('sv-SE', { style: 'currency', currency: 'SEK', maximumFractionDigits: 0 });
const DATE_FMT = new Intl.DateTimeFormat('sv-SE', { day: 'numeric', month: 'short', year: 'numeric' });

function fmtSek(amount: number): string {
  return SEK.format(amount);
}

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return '–';
  try { return DATE_FMT.format(new Date(iso)); }
  catch { return iso; }
}

function isOverdue(invoice: Invoice): boolean {
  if (!invoice.due_date) return false;
  return new Date(invoice.due_date) < new Date() && invoice.outstanding_amount > 0;
}

// ─── BetalningsbegäranPage ────────────────────────────────────────────────────

export function BetalningsbegäranPage() {
  const navigate = useNavigate();
  const { invoices, students, isLoading } = useBetalningsdata();

  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [search, setSearch]             = useState('');
  const [selectedStudentId, setSelectedStudentId] = useState<string | null>(null);

  // Build student lookup map
  const studentMap = useMemo(() => {
    const m: Record<string, StudentRef> = {};
    for (const s of students) m[s.id] = s;
    return m;
  }, [students]);

  // Left panel: students who ONLY have draft invoices (no sent payment requests yet)
  const studentsNeedingRequest = useMemo(() => {
    const requestedStudentIds = new Set(
      invoices.filter(i => REQUEST_STATUSES.includes(i.status)).map(i => i.student_id)
    );
    const draftByStudent = new Map<string, Invoice[]>();
    for (const inv of invoices) {
      if (inv.status === 'draft') {
        if (!draftByStudent.has(inv.student_id)) draftByStudent.set(inv.student_id, []);
        draftByStudent.get(inv.student_id)!.push(inv);
      }
    }
    return [...draftByStudent.entries()]
      .filter(([sid]) => !requestedStudentIds.has(sid))
      .map(([sid, invs]) => ({
        studentId: sid,
        student:   studentMap[sid],
        invoices:  invs,
        totalOwed: invs.reduce((s, i) => s + i.outstanding_amount, 0),
      }))
      .filter(e => e.totalOwed > 0);
  }, [invoices, studentMap]);

  // Right panel: sent payment requests (issued / overdue / partially_paid)
  const requestInvoices = useMemo(() => {
    let list = invoices.filter(i => REQUEST_STATUSES.includes(i.status));
    if (statusFilter !== 'all') list = list.filter(i => i.status === statusFilter);
    if (selectedStudentId) list = list.filter(i => i.student_id === selectedStudentId);
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter(i => {
        const s = studentMap[i.student_id];
        const name = s ? `${s.first_name} ${s.last_name}`.toLowerCase() : '';
        const num  = (i.invoice_number ?? '').toLowerCase();
        return name.includes(q) || num.includes(q) || (s?.email ?? '').toLowerCase().includes(q);
      });
    }
    return list;
  }, [invoices, statusFilter, selectedStudentId, search, studentMap]);

  return (
    <PageLayout>
      <PageHeader
        title="Betalningsbegäran"
        breadcrumbs={[{ label: 'Ekonomi', href: '/finance/invoices' }, { label: 'Betalningsbegäran' }]}
      />

      {/* ── Filter bar ─────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative">
          <select
            value={statusFilter}
            onChange={e => setStatusFilter(e.target.value as StatusFilter)}
            className="h-9 text-sm border border-border rounded-md pl-3 pr-8 bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40 appearance-none"
          >
            {STATUS_FILTER_OPTIONS.map(o => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
          <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
            </svg>
          </span>
        </div>

        <div className="relative flex-1 min-w-[260px] max-w-lg">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Sök efter siffrorna på ordernummer, förnamn, efternamn, e-post..."
            className="w-full h-9 pl-8 pr-3 text-sm border border-border rounded-md bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/40"
          />
        </div>
      </div>

      {/* ── Two-panel layout ───────────────────────────────────────────── */}
      <div className="flex gap-4 min-h-[400px]">

        {/* Left panel – customers without a payment request */}
        <div className="w-[280px] shrink-0 rounded-lg border border-border bg-card overflow-hidden flex flex-col">
          <div className="px-4 py-3 border-b border-border bg-muted/30">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide leading-none">
              Kunder i skuld utan betalningsbegäran
            </p>
          </div>

          <div className="flex-1 overflow-y-auto">
            {isLoading ? (
              <div className="p-3 space-y-2">
                {[...Array(5)].map((_, i) => <Skeleton key={i} className="h-14 rounded-lg" />)}
              </div>
            ) : studentsNeedingRequest.length === 0 ? (
              <div className="flex flex-col items-center justify-center gap-2 py-12 px-4 text-center">
                <div className="w-10 h-10 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
                  <FileText className="w-5 h-5 text-green-600 dark:text-green-400" />
                </div>
                <p className="text-sm text-muted-foreground">Inga kunder i skuld utan betalningsbegäran.</p>
              </div>
            ) : (
              <div className="divide-y divide-border">
                {studentsNeedingRequest.map(({ studentId, student, invoices: invs, totalOwed }) => {
                  const name = student
                    ? `${student.first_name} ${student.last_name}`
                    : 'Okänd kund';
                  const isSelected = selectedStudentId === studentId;
                  return (
                    <button
                      key={studentId}
                      onClick={() => setSelectedStudentId(isSelected ? null : studentId)}
                      className={cn(
                        'w-full text-left px-4 py-3 transition-colors hover:bg-accent/50',
                        isSelected && 'bg-accent'
                      )}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-foreground truncate">{name}</p>
                          <p className="text-xs text-muted-foreground">
                            {invs.length} faktura{invs.length !== 1 ? 'or' : ''}
                          </p>
                        </div>
                        <div className="text-right shrink-0">
                          <p className="text-sm font-semibold text-destructive">{fmtSek(totalOwed)}</p>
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Right panel – sent payment requests */}
        <div className="flex-1 rounded-lg border border-border bg-card overflow-hidden flex flex-col">
          <div className="px-4 py-3 border-b border-border bg-muted/30 flex items-center justify-between">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide leading-none">
              Betalningsbegäran
              {requestInvoices.length > 0 && (
                <span className="ml-2 inline-flex items-center justify-center w-5 h-5 rounded-full bg-primary text-primary-foreground text-[10px] font-bold">
                  {requestInvoices.length}
                </span>
              )}
            </p>
            {selectedStudentId && (
              <button
                onClick={() => setSelectedStudentId(null)}
                className="text-xs text-muted-foreground hover:text-foreground underline underline-offset-2"
              >
                Visa alla
              </button>
            )}
          </div>

          <div className="flex-1 overflow-y-auto">
            {isLoading ? (
              <div className="p-4 space-y-2">
                {[...Array(6)].map((_, i) => <Skeleton key={i} className="h-16 rounded-lg" />)}
              </div>
            ) : requestInvoices.length === 0 ? (
              <div className="flex flex-col items-center justify-center gap-2 py-16 px-4 text-center">
                <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center">
                  <Clock className="w-5 h-5 text-muted-foreground" />
                </div>
                <p className="text-sm text-muted-foreground">Det finns inga betalningsbegäran att visa för närvarande.</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border bg-muted/20">
                      <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">Kund</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">Fakturanr</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">Status</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">Förfallodatum</th>
                      <th className="px-4 py-3 text-right text-xs font-semibold text-muted-foreground uppercase tracking-wide">Kvar att betala</th>
                      <th className="px-4 py-3" />
                    </tr>
                  </thead>
                  <tbody>
                    {requestInvoices.map(inv => {
                      const s    = studentMap[inv.student_id];
                      const name = s ? `${s.first_name} ${s.last_name}` : '–';
                      const overdue = isOverdue(inv);
                      return (
                        <tr
                          key={inv.id}
                          className={cn(
                            'border-b border-border last:border-0 transition-colors hover:bg-muted/30 cursor-pointer',
                            overdue && 'bg-red-50/40 dark:bg-red-950/10'
                          )}
                          onClick={() => navigate(`/finance/invoices/${inv.id}`)}
                        >
                          <td className="px-4 py-3">
                            <div>
                              <p className="font-medium text-foreground">{name}</p>
                              {s?.email && (
                                <p className="text-xs text-muted-foreground truncate max-w-[180px]">{s.email}</p>
                              )}
                            </div>
                          </td>
                          <td className="px-4 py-3 text-muted-foreground font-mono text-xs">
                            {inv.invoice_number ?? <span className="text-muted-foreground/60 italic">–</span>}
                          </td>
                          <td className="px-4 py-3">
                            <InvoiceStatusBadge status={inv.status} />
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-1">
                              {overdue && <AlertCircle className="w-3.5 h-3.5 text-destructive shrink-0" />}
                              <span className={cn('text-sm', overdue && 'text-destructive font-medium')}>
                                {fmtDate(inv.due_date)}
                              </span>
                            </div>
                          </td>
                          <td className="px-4 py-3 text-right">
                            <span className={cn(
                              'font-semibold tabular-nums',
                              overdue ? 'text-destructive' : 'text-foreground'
                            )}>
                              {fmtSek(inv.outstanding_amount)}
                            </span>
                          </td>
                          <td className="px-4 py-3">
                            <ChevronRight className="w-4 h-4 text-muted-foreground ml-auto" />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Summary footer */}
          {requestInvoices.length > 0 && (
            <div className="border-t border-border px-4 py-3 bg-muted/20 flex items-center justify-between">
              <span className="text-xs text-muted-foreground">
                {requestInvoices.length} betalningsbegäran
              </span>
              <span className="text-sm font-semibold text-foreground">
                Totalt: {fmtSek(requestInvoices.reduce((s, i) => s + i.outstanding_amount, 0))}
              </span>
            </div>
          )}
        </div>
      </div>
    </PageLayout>
  );
}
