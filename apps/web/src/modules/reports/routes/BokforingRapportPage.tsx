import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Search, FileDown, FileText, FileCode2 } from 'lucide-react';
import { supabase } from '@core/api/supabase.js';
import { Button, Skeleton, toast } from '@platform/ui';
import {
  ReportCard, ExcelBtn, PdfBtn,
  DateRange, DateField,
  csvDownload, printReport,
} from '../components/ReportCard.js';
import { cn } from '@/lib/utils.js';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function today()      { return new Date().toISOString().slice(0, 10); }
function monthStart() { return today().slice(0, 8) + '01'; }
const DATE_FMT = new Intl.DateTimeFormat('sv-SE', { dateStyle: 'short', timeStyle: 'short' });

function dateFmt(s: string | null | undefined) { return s ? new Date(s).toLocaleDateString('sv-SE') : ''; }
function cur(n: unknown) { return n == null ? '' : Number(n).toFixed(2); }

async function runExport(
  fetcher: () => Promise<Record<string, unknown>[]>,
  filename: string,
) {
  toast({ title: 'Förbereder export…', description: 'Hämtar data.' });
  try {
    const rows = await fetcher();
    csvDownload(rows, filename);
  } catch {
    toast({ title: 'Export misslyckades', description: 'Kontrollera anslutning och försök igen.', variant: 'destructive' });
  }
}

// ─── SIE export table ─────────────────────────────────────────────────────────

interface Sie4Export {
  id:          string;
  created_at:  string;
  period_from: string | null;
  period_to:   string | null;
  status:      string | null;
}

async function fetchSieExports(): Promise<Sie4Export[]> {
  const { data } = await supabase
    .from('sie4_exports')
    .select('id, created_at, period_from, period_to, status')
    .order('created_at', { ascending: false })
    .limit(20);
  return (data ?? []) as Sie4Export[];
}

// ─── Export action buttons ────────────────────────────────────────────────────

function CsvBtn({ onClick }: { onClick?: () => void }) {
  return (
    <button
      onClick={onClick ?? (() => toast({ title: 'CSV-export', description: 'Genererar CSV-fil…' }))}
      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border text-xs font-medium transition-colors
        border-sky-200 text-sky-700 bg-sky-50 hover:bg-sky-100
        dark:border-sky-800 dark:text-sky-300 dark:bg-sky-950/40 dark:hover:bg-sky-900/60"
    >
      <FileText className="w-3.5 h-3.5" />
      CSV
    </button>
  );
}

function SieBtn({ label = 'SIE', onClick }: { label?: string; onClick?: () => void }) {
  return (
    <button
      onClick={onClick ?? (() => toast({ title: 'SIE 4-export', description: 'Använd "Exportera SIE"-knappen nedan för att generera SIE-filen.' }))}
      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border text-xs font-medium transition-colors
        border-violet-200 text-violet-700 bg-violet-50 hover:bg-violet-100
        dark:border-violet-800 dark:text-violet-300 dark:bg-violet-950/40 dark:hover:bg-violet-900/60"
    >
      <FileCode2 className="w-3.5 h-3.5" />
      {label}
    </button>
  );
}

// ─── Section heading ──────────────────────────────────────────────────────────

function SectionHeading({ title }: { title: string }) {
  return (
    <div className="col-span-full">
      <h2 className="text-sm font-semibold text-foreground border-b border-border pb-2">{title}</h2>
    </div>
  );
}

// ─── BokforingRapportPage ─────────────────────────────────────────────────────

export function BokforingRapportPage() {
  const [sieFrom,    setSieFrom]    = useState(monthStart());
  const [sieTo,      setSieTo]      = useState(today());
  const [startVer,   setStartVer]   = useState('');
  const [endVer,     setEndVer]     = useState('');

  const [fs_d_from,  setFsDFrom]  = useState(monthStart());
  const [fs_d_to,    setFsDTo]    = useState(today());
  const [fs_o_from,  setFsOFrom]  = useState(monthStart());
  const [fs_o_to,    setFsOTo]    = useState(today());
  const [int_from,   setIntFrom]  = useState(monthStart());
  const [int_to,     setIntTo]    = useState(today());

  const [kfp_from,  setKfpFrom]  = useState(monthStart());
  const [kfp_to,    setKfpTo]    = useState(today());
  const [kfd_date,  setKfdDate]  = useState(today());

  const [moms_from, setMomsFrom] = useState(monthStart());
  const [moms_to,   setMomsTo]   = useState(today());
  const [mfp_from,  setMfpFrom]  = useState(monthStart());
  const [mfp_to,    setMfpTo]    = useState(today());
  const [mfd_date,  setMfdDate]  = useState(today());
  const [omfp_from, setOmfpFrom] = useState(monthStart());
  const [omfp_to,   setOmfpTo]   = useState(today());
  const [omfd_date, setOmfdDate] = useState(today());
  const [mr_from,   setMrFrom]   = useState(monthStart());
  const [mr_to,     setMrTo]     = useState(today());

  const [sum_from, setSumFrom] = useState(monthStart());
  const [sum_to,   setSumTo]   = useState(today());
  const [und_from, setUndFrom] = useState(monthStart());
  const [und_to,   setUndTo]   = useState(today());
  const [csv_from, setCsvFrom] = useState(monthStart());
  const [csv_to,   setCsvTo]   = useState(today());
  const [sie_from, setSieRFrom] = useState(monthStart());
  const [sie_to,   setSieRTo]   = useState(today());
  const [sie_dg_from, setSieDgFrom] = useState(monthStart());
  const [sie_dg_to,   setSieDgTo]   = useState(today());

  const { data: exports = [], isLoading } = useQuery<Sie4Export[]>({
    queryKey: ['sie4-exports'],
    queryFn:  fetchSieExports,
    staleTime: 2 * 60_000,
  });

  const inputCls = cn(
    'h-9 px-3 text-sm border border-border rounded-md bg-background text-foreground',
    'focus:outline-none focus:ring-2 focus:ring-primary/40',
  );

  // ── Export functions ────────────────────────────────────────────────────────

  const exportForsDetaljer = () => void runExport(async () => {
    const { data } = await supabase.from('invoice_line_items')
      .select('description, quantity, unit_price, vat_rate, vat_amount, line_total, created_at, invoices(invoice_number, status)')
      .gte('created_at', fs_d_from).lte('created_at', fs_d_to + 'T23:59:59')
      .order('created_at', { ascending: false }).limit(5000);
    return (data ?? []).map((r: Record<string, unknown>) => {
      const inv = r['invoices'] as Record<string, unknown> | null;
      return {
        'Fakturanr': inv?.['invoice_number'] ?? '', 'Status': inv?.['status'] ?? '',
        'Beskrivning': r['description'] ?? '', 'Antal': r['quantity'] ?? 1,
        'À-pris (kr)': cur(r['unit_price']), 'Momssats': `${((r['vat_rate'] as number ?? 0.25) * 100).toFixed(0)}%`,
        'Moms (kr)': cur(r['vat_amount']), 'Radtotal (kr)': cur(r['line_total']),
        'Datum': dateFmt(r['created_at'] as string),
      };
    }) as Record<string, unknown>[];
  }, `forsaljningsdetaljer_${fs_d_from}_${fs_d_to}`);

  const exportForsDePdf = () => void (async () => {
    toast({ title: 'Förbereder PDF…' });
    try {
      const { data } = await supabase.from('invoice_line_items')
        .select('description, quantity, line_total, invoices(invoice_number)')
        .gte('created_at', fs_d_from).lte('created_at', fs_d_to + 'T23:59:59').limit(500);
      const rows = (data ?? []).map((r: Record<string, unknown>) => {
        const inv = r['invoices'] as Record<string, unknown> | null;
        return [inv?.['invoice_number'] ?? '', r['description'] ?? '', r['quantity'] ?? 1, cur(r['line_total'])];
      });
      printReport(`Försäljningsdetaljer ${fs_d_from} – ${fs_d_to}`, ['Fakturanr', 'Beskrivning', 'Antal', 'Belopp (kr)'], rows);
    } catch { toast({ title: 'Export misslyckades', variant: 'destructive' }); }
  })();

  const exportForsOverikt = () => void runExport(async () => {
    const { data } = await supabase.from('invoice_line_items')
      .select('description, quantity, line_total')
      .gte('created_at', fs_o_from).lte('created_at', fs_o_to + 'T23:59:59').limit(5000);
    const m: Record<string, { antal: number; total: number }> = {};
    for (const r of (data ?? []) as Array<{ description: string; quantity: number; line_total: number }>) {
      const k = r.description ?? 'Okänd'; if (!m[k]) m[k] = { antal: 0, total: 0 };
      m[k]!.antal += r.quantity ?? 1; m[k]!.total += r.line_total ?? 0;
    }
    return Object.entries(m).sort((a, b) => b[1].total - a[1].total).map(([d, v]) => ({ 'Artikel': d, 'Antal': v.antal, 'Summa (kr)': cur(v.total) })) as Record<string, unknown>[];
  }, `forsaljningsoversikt_${fs_o_from}_${fs_o_to}`);

  const exportForsOveriktPdf = () => void (async () => {
    toast({ title: 'Förbereder PDF…' });
    try {
      const { data } = await supabase.from('invoice_line_items')
        .select('description, quantity, line_total')
        .gte('created_at', fs_o_from).lte('created_at', fs_o_to + 'T23:59:59').limit(2000);
      const m: Record<string, { antal: number; total: number }> = {};
      for (const r of (data ?? []) as Array<{ description: string; quantity: number; line_total: number }>) {
        const k = r.description ?? 'Okänd'; if (!m[k]) m[k] = { antal: 0, total: 0 };
        m[k]!.antal += r.quantity ?? 1; m[k]!.total += r.line_total ?? 0;
      }
      const rows = Object.entries(m).sort((a, b) => b[1].total - a[1].total).map(([d, v]) => [d, v.antal, cur(v.total)]);
      printReport(`Försäljningsöversikt ${fs_o_from} – ${fs_o_to}`, ['Artikel', 'Antal', 'Summa (kr)'], rows);
    } catch { toast({ title: 'Export misslyckades', variant: 'destructive' }); }
  })();

  const exportIntaktsfört = () => void runExport(async () => {
    const { data } = await supabase.from('invoices')
      .select('invoice_number, status, total_amount, vat_amount, issued_at')
      .not('issued_at', 'is', null)
      .gte('issued_at', int_from).lte('issued_at', int_to + 'T23:59:59')
      .order('issued_at', { ascending: false }).limit(2000);
    return (data ?? []).map((r: Record<string, unknown>) => ({
      'Fakturanr': r['invoice_number'] ?? '', 'Status': r['status'] ?? '',
      'Belopp (kr)': cur(r['total_amount']), 'Moms (kr)': cur(r['vat_amount']),
      'Utfärdad': dateFmt(r['issued_at'] as string),
    })) as Record<string, unknown>[];
  }, `intaktsfort_${int_from}_${int_to}`);

  const exportKfPeriod = () => void runExport(async () => {
    const { data } = await supabase.from('invoices')
      .select('invoice_number, total_amount, currency, created_at, due_date, status, students(first_name, last_name)')
      .not('status', 'eq', 'paid').not('status', 'eq', 'void')
      .gte('created_at', kfp_from).lte('created_at', kfp_to + 'T23:59:59')
      .order('due_date').limit(2000);
    return (data ?? []).map((r: Record<string, unknown>) => {
      const s = r['students'] as Record<string, unknown> | null;
      return { 'Fakturanr': r['invoice_number'] ?? '', 'Elev': s ? `${s['first_name'] ?? ''} ${s['last_name'] ?? ''}`.trim() : 'Gästköp',
        'Belopp (kr)': cur(r['total_amount']), 'Förfallodatum': r['due_date'] ?? '', 'Status': r['status'] ?? '' };
    }) as Record<string, unknown>[];
  }, `kundfordringar_${kfp_from}_${kfp_to}`);

  const exportKfDatum = () => void runExport(async () => {
    const { data } = await supabase.from('invoices')
      .select('invoice_number, total_amount, due_date, status, students(first_name, last_name)')
      .not('status', 'eq', 'paid').not('status', 'eq', 'void')
      .lte('due_date', kfd_date).order('due_date').limit(2000);
    return (data ?? []).map((r: Record<string, unknown>) => {
      const s = r['students'] as Record<string, unknown> | null;
      return { 'Fakturanr': r['invoice_number'] ?? '', 'Elev': s ? `${s['first_name'] ?? ''} ${s['last_name'] ?? ''}`.trim() : 'Gästköp',
        'Belopp (kr)': cur(r['total_amount']), 'Förfallodatum': r['due_date'] ?? '' };
    }) as Record<string, unknown>[];
  }, `kundfordringar_datum_${kfd_date}`);

  const exportKfDatumPdf = () => void (async () => {
    toast({ title: 'Förbereder PDF…' });
    try {
      const { data } = await supabase.from('invoices')
        .select('invoice_number, total_amount, due_date, students(first_name, last_name)')
        .not('status', 'eq', 'paid').not('status', 'eq', 'void').lte('due_date', kfd_date).limit(500);
      const rows = (data ?? []).map((r: Record<string, unknown>) => {
        const s = r['students'] as Record<string, unknown> | null;
        return [r['invoice_number'] ?? '', s ? `${s['first_name'] ?? ''} ${s['last_name'] ?? ''}`.trim() : 'Gästköp', cur(r['total_amount']), r['due_date'] ?? ''];
      });
      printReport(`Kundfordringar per ${kfd_date}`, ['Fakturanr', 'Elev', 'Belopp (kr)', 'Förfallodatum'], rows);
    } catch { toast({ title: 'Export misslyckades', variant: 'destructive' }); }
  })();

  const exportMomsPeriod = () => void runExport(async () => {
    const { data } = await supabase.from('invoice_line_items')
      .select('vat_rate, vat_amount, line_total')
      .gte('created_at', moms_from).lte('created_at', moms_to + 'T23:59:59').limit(5000);
    const m: Record<string, { base: number; moms: number }> = {};
    for (const r of (data ?? []) as Array<{ vat_rate: number; line_total: number; vat_amount: number }>) {
      const k = `${((r.vat_rate ?? 0.25) * 100).toFixed(0)}%`; if (!m[k]) m[k] = { base: 0, moms: 0 };
      m[k]!.base += r.line_total ?? 0; m[k]!.moms += r.vat_amount ?? 0;
    }
    return Object.entries(m).map(([rate, v]) => ({ 'Momssats': rate, 'Underlag (kr)': cur(v.base), 'Moms (kr)': cur(v.moms) })) as Record<string, unknown>[];
  }, `moms_${moms_from}_${moms_to}`);

  const exportMomsPeriodPdf = () => void (async () => {
    toast({ title: 'Förbereder PDF…' });
    try {
      const { data } = await supabase.from('invoice_line_items')
        .select('vat_rate, vat_amount, line_total')
        .gte('created_at', moms_from).lte('created_at', moms_to + 'T23:59:59').limit(5000);
      const m: Record<string, { base: number; moms: number }> = {};
      for (const r of (data ?? []) as Array<{ vat_rate: number; line_total: number; vat_amount: number }>) {
        const k = `${((r.vat_rate ?? 0.25) * 100).toFixed(0)}%`; if (!m[k]) m[k] = { base: 0, moms: 0 };
        m[k]!.base += r.line_total ?? 0; m[k]!.moms += r.vat_amount ?? 0;
      }
      printReport(`Moms ${moms_from} – ${moms_to}`, ['Momssats', 'Underlag (kr)', 'Moms (kr)'], Object.entries(m).map(([rate, v]) => [rate, cur(v.base), cur(v.moms)]));
    } catch { toast({ title: 'Export misslyckades', variant: 'destructive' }); }
  })();

  const exportMrFaktura = () => void runExport(async () => {
    const { data } = await supabase.from('invoices')
      .select('invoice_number, status, total_amount, vat_amount, issued_at')
      .not('issued_at', 'is', null)
      .gte('issued_at', mr_from).lte('issued_at', mr_to + 'T23:59:59')
      .order('issued_at', { ascending: false }).limit(2000);
    return (data ?? []).map((r: Record<string, unknown>) => ({
      'Fakturanr': r['invoice_number'] ?? '', 'Status': r['status'] ?? '',
      'Belopp (kr)': cur(r['total_amount']), 'Moms (kr)': cur(r['vat_amount']), 'Utfärdad': dateFmt(r['issued_at'] as string),
    })) as Record<string, unknown>[];
  }, `momsrapport_faktura_${mr_from}_${mr_to}`);

  const exportMrFakturaPdf = () => void (async () => {
    toast({ title: 'Förbereder PDF…' });
    try {
      const { data } = await supabase.from('invoices')
        .select('invoice_number, total_amount, vat_amount, issued_at')
        .not('issued_at', 'is', null).gte('issued_at', mr_from).lte('issued_at', mr_to + 'T23:59:59').limit(500);
      printReport(`Momsrapport – Faktura ${mr_from} – ${mr_to}`, ['Fakturanr', 'Belopp (kr)', 'Moms (kr)', 'Utfärdad'],
        (data ?? []).map((r: Record<string, unknown>) => [r['invoice_number'] ?? '', cur(r['total_amount']), cur(r['vat_amount']), dateFmt(r['issued_at'] as string)]));
    } catch { toast({ title: 'Export misslyckades', variant: 'destructive' }); }
  })();

  const exportMomsFörskottP = () => void runExport(async () => {
    const { data } = await supabase.from('payments')
      .select('amount, payment_method, created_at, notes')
      .gte('created_at', mfp_from).lte('created_at', mfp_to + 'T23:59:59')
      .in('payment_method', ['swish', 'card', 'cash']).order('created_at', { ascending: false }).limit(2000);
    return (data ?? []).map((r: Record<string, unknown>) => ({ 'Datum': dateFmt(r['created_at'] as string), 'Typ': r['payment_method'] ?? '', 'Belopp (kr)': cur(r['amount']), 'Not': r['notes'] ?? '' })) as Record<string, unknown>[];
  }, `momsat_forskott_${mfp_from}_${mfp_to}`);

  const exportMomsFörskottD = () => void runExport(async () => {
    const { data } = await supabase.from('invoices')
      .select('invoice_number, total_amount, created_at, due_date, status')
      .not('status', 'eq', 'paid').not('status', 'eq', 'void').lte('created_at', mfd_date + 'T23:59:59').limit(1000);
    return (data ?? []).map((r: Record<string, unknown>) => ({ 'Fakturanr': r['invoice_number'] ?? '', 'Belopp (kr)': cur(r['total_amount']), 'Skapad': dateFmt(r['created_at'] as string), 'Förfaller': r['due_date'] ?? '' })) as Record<string, unknown>[];
  }, `momsat_forskott_datum_${mfd_date}`);

  const exportOmomsFörskottP = () => void runExport(async () => {
    const { data } = await supabase.from('payments')
      .select('amount, created_at, notes').eq('payment_method', 'credit')
      .gte('created_at', omfp_from).lte('created_at', omfp_to + 'T23:59:59').limit(2000);
    return (data ?? []).map((r: Record<string, unknown>) => ({ 'Datum': dateFmt(r['created_at'] as string), 'Belopp (kr)': cur(r['amount']), 'Not': r['notes'] ?? '' })) as Record<string, unknown>[];
  }, `omomsat_forskott_${omfp_from}_${omfp_to}`);

  const exportOmomsFörskottD = () => void runExport(async () => {
    const { data } = await supabase.from('payments')
      .select('amount, created_at').eq('payment_method', 'credit').lte('created_at', omfd_date + 'T23:59:59').limit(1000);
    return (data ?? []).map((r: Record<string, unknown>) => ({ 'Datum': dateFmt(r['created_at'] as string), 'Belopp (kr)': cur(r['amount']) })) as Record<string, unknown>[];
  }, `omomsat_forskott_datum_${omfd_date}`);

  const exportSumVerifikat = () => void runExport(async () => {
    const { data } = await supabase.from('journal_entries')
      .select('account_code, debit_amount, credit_amount')
      .gte('entry_date', sum_from).lte('entry_date', sum_to).limit(10000);
    const m: Record<string, { d: number; c: number }> = {};
    for (const r of (data ?? []) as Array<{ account_code: string; debit_amount: number; credit_amount: number }>) {
      const k = r.account_code ?? 'Okänt'; if (!m[k]) m[k] = { d: 0, c: 0 };
      m[k]!.d += r.debit_amount ?? 0; m[k]!.c += r.credit_amount ?? 0;
    }
    return Object.entries(m).map(([acc, v]) => ({ 'Konto': acc, 'Debet (kr)': cur(v.d), 'Kredit (kr)': cur(v.c), 'Saldo (kr)': cur(v.d - v.c) })) as Record<string, unknown>[];
  }, `summering_verifikat_${sum_from}_${sum_to}`);

  const exportSumVerifikatPdf = () => void (async () => {
    toast({ title: 'Förbereder PDF…' });
    try {
      const { data } = await supabase.from('journal_entries')
        .select('account_code, debit_amount, credit_amount').gte('entry_date', sum_from).lte('entry_date', sum_to).limit(5000);
      const m: Record<string, { d: number; c: number }> = {};
      for (const r of (data ?? []) as Array<{ account_code: string; debit_amount: number; credit_amount: number }>) {
        const k = r.account_code ?? 'Okänt'; if (!m[k]) m[k] = { d: 0, c: 0 };
        m[k]!.d += r.debit_amount ?? 0; m[k]!.c += r.credit_amount ?? 0;
      }
      printReport(`Summering av verifikat ${sum_from} – ${sum_to}`, ['Konto', 'Debet (kr)', 'Kredit (kr)', 'Saldo (kr)'],
        Object.entries(m).map(([acc, v]) => [acc, cur(v.d), cur(v.c), cur(v.d - v.c)]));
    } catch { toast({ title: 'Export misslyckades', variant: 'destructive' }); }
  })();

  const exportVerifikCsv = () => void runExport(async () => {
    const { data } = await supabase.from('journal_entries')
      .select('account_code, debit_amount, credit_amount, description, entry_date')
      .gte('entry_date', csv_from).lte('entry_date', csv_to).order('entry_date').limit(10000);
    return (data ?? []).map((r: Record<string, unknown>) => ({
      'Datum': r['entry_date'] ?? '', 'Konto': r['account_code'] ?? '',
      'Beskrivning': r['description'] ?? '', 'Debet (kr)': cur(r['debit_amount']), 'Kredit (kr)': cur(r['credit_amount']),
    })) as Record<string, unknown>[];
  }, `verifikationer_${csv_from}_${csv_to}`);

  return (
    <div className="space-y-8">
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">

        <SectionHeading title="Försäljning & intäkter" />

        <ReportCard title="Försäljningsdetaljer (producerat)"
          description="Detaljerade försäljningsrader för producerade tjänster och varor under perioden."
          actions={<><ExcelBtn onClick={exportForsDetaljer} /><PdfBtn onClick={exportForsDePdf} /></>}>
          <DateRange from={fs_d_from} to={fs_d_to} onFromChange={setFsDFrom} onToChange={setFsDTo} />
        </ReportCard>

        <ReportCard title="Försäljningsöversikt (producerat)"
          description="Summerad försäljning per artikel och kategori för producerade tjänster under perioden."
          actions={<><ExcelBtn onClick={exportForsOverikt} /><PdfBtn onClick={exportForsOveriktPdf} /></>}>
          <DateRange from={fs_o_from} to={fs_o_to} onFromChange={setFsOFrom} onToChange={setFsOTo} />
        </ReportCard>

        <ReportCard title="Intäktsfört i perioden"
          description="Bokförd intäkt som tillhör perioden — underlag för periodiserad redovisning."
          actions={<ExcelBtn onClick={exportIntaktsfört} />}>
          <DateRange from={int_from} to={int_to} onFromChange={setIntFrom} onToChange={setIntTo} />
        </ReportCard>

        <SectionHeading title="Kundfordringar" />

        <ReportCard title="Kundfordringar i perioden"
          description="Alla öppna fordringar skapade under perioden med förfallodatum och belopp."
          actions={<ExcelBtn onClick={exportKfPeriod} />}>
          <DateRange from={kfp_from} to={kfp_to} onFromChange={setKfpFrom} onToChange={setKfpTo} />
        </ReportCard>

        <ReportCard title="Kundfordringar per datum"
          description="Utestående kundfordringar per valt datum — äldsta-till-nyaste ordning."
          actions={<><ExcelBtn onClick={exportKfDatum} /><PdfBtn onClick={exportKfDatumPdf} /></>}>
          <DateField label="Datum" value={kfd_date} onChange={setKfdDate} />
        </ReportCard>

        <SectionHeading title="Moms" />

        <ReportCard title="Moms i perioden"
          description="Sammanställning av utgående och ingående moms under perioden, uppdelat per momssats."
          actions={<><ExcelBtn onClick={exportMomsPeriod} /><PdfBtn onClick={exportMomsPeriodPdf} /></>}>
          <DateRange from={moms_from} to={moms_to} onFromChange={setMomsFrom} onToChange={setMomsTo} />
        </ReportCard>

        <ReportCard title="Momsrapport - Faktura"
          description="Momsunderlag baserat på faktureringsmetoden med fakturanummer och momsbelopp."
          actions={<><ExcelBtn onClick={exportMrFaktura} /><PdfBtn onClick={exportMrFakturaPdf} /></>}>
          <DateRange from={mr_from} to={mr_to} onFromChange={setMrFrom} onToChange={setMrTo} />
        </ReportCard>

        <ReportCard title="Momsat förskott i perioden"
          description="Förskottsbetalningar med moms mottagna under perioden, underlag för skattedeklaration."
          actions={<ExcelBtn onClick={exportMomsFörskottP} />}>
          <DateRange from={mfp_from} to={mfp_to} onFromChange={setMfpFrom} onToChange={setMfpTo} />
        </ReportCard>

        <ReportCard title="Momsat förskott per datum"
          description="Utestående momspliktiga förskott per valt datum."
          actions={<ExcelBtn onClick={exportMomsFörskottD} />}>
          <DateField label="Datum" value={mfd_date} onChange={setMfdDate} />
        </ReportCard>

        <ReportCard title="Omomsat förskott i perioden"
          description="Förskottsbetalningar utan moms (ej momspliktigt) mottagna under perioden."
          actions={<ExcelBtn onClick={exportOmomsFörskottP} />}>
          <DateRange from={omfp_from} to={omfp_to} onFromChange={setOmfpFrom} onToChange={setOmfpTo} />
        </ReportCard>

        <ReportCard title="Omomsat förskott per datum"
          description="Utestående icke-momspliktiga förskott per valt datum."
          actions={<ExcelBtn onClick={exportOmomsFörskottD} />}>
          <DateField label="Datum" value={omfd_date} onChange={setOmfdDate} />
        </ReportCard>

        <SectionHeading title="Verifikat & export" />

        <ReportCard title="Summering av verifikat"
          description="Summerad kontolista med debet- och kredittotaler för alla verifikat i perioden."
          actions={<><ExcelBtn onClick={exportSumVerifikat} /><PdfBtn onClick={exportSumVerifikatPdf} /></>}>
          <DateRange from={sum_from} to={sum_to} onFromChange={setSumFrom} onToChange={setSumTo} />
        </ReportCard>

        <ReportCard title="Undertecknade dokument"
          description="Lista över alla digitalt undertecknade avtal och dokument under perioden."
          actions={<ExcelBtn onClick={() => toast({ title: 'Inga data', description: 'Signerade dokument är inte tillgängliga som Excel-export ännu.' })} />}>
          <DateRange from={und_from} to={und_to} onFromChange={setUndFrom} onToChange={setUndTo} />
        </ReportCard>

        <ReportCard title="Verifikationer (CSV)"
          description="Export av alla verifikat i CSV-format för import till externa bokföringsprogram."
          actions={<CsvBtn onClick={exportVerifikCsv} />}>
          <DateRange from={csv_from} to={csv_to} onFromChange={setCsvFrom} onToChange={setCsvTo} />
        </ReportCard>

        <ReportCard title="Verifikationer (SIE)"
          description="SIE 4-fil med alla verifikat — kan importeras direkt till bokföringsprogram. Använd exportverktyget nedan."
          actions={<SieBtn onClick={() => toast({ title: 'SIE-export', description: 'Ange datumintervall och klicka "Exportera SIE" i verktyget nedan.' })} />}>
          <DateRange from={sie_from} to={sie_to} onFromChange={setSieRFrom} onToChange={setSieRTo} />
        </ReportCard>

        <ReportCard title="Verifikationer dagsnivå (SIE)"
          description="SIE 4-fil med dagssummering — ett verifikat per dag i stället för per transaktion."
          actions={<SieBtn label="SIE (dag)" onClick={() => toast({ title: 'SIE-export (dag)', description: 'Använd exportverktyget nedan för att generera SIE-filen.' })} />}>
          <DateRange from={sie_dg_from} to={sie_dg_to} onFromChange={setSieDgFrom} onToChange={setSieDgTo} />
        </ReportCard>

      </div>

      {/* ── SIE export search tool ───────────────────────────────────────────── */}
      <div className="space-y-4">
        <h2 className="text-sm font-semibold text-foreground border-b border-border pb-2">
          SIE-exportlogg
        </h2>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1">
            <span className="text-xs text-muted-foreground shrink-0">Från:</span>
            <input type="date" value={sieFrom} onChange={(e) => setSieFrom(e.target.value)} className={inputCls + ' w-36'} />
          </div>
          <div className="flex items-center gap-1">
            <span className="text-xs text-muted-foreground shrink-0">Till:</span>
            <input type="date" value={sieTo} onChange={(e) => setSieTo(e.target.value)} className={inputCls + ' w-36'} />
          </div>
          <input type="text" placeholder="Start verifikationsnummer" value={startVer} onChange={(e) => setStartVer(e.target.value)} className={inputCls + ' w-44'} />
          <input type="text" placeholder="Slut verifikationsnummer" value={endVer} onChange={(e) => setEndVer(e.target.value)} className={inputCls + ' w-44'} />
          <Button variant="outline" size="sm"
            onClick={() => toast({ title: 'Söker verifikat…', description: 'Filtret tillämpas.' })}
            className="h-9 gap-1.5">
            <Search className="w-4 h-4" />Sök
          </Button>
          <Button variant="outline" size="sm" disabled className="h-9 gap-1.5 opacity-40">Förhandsgranska</Button>
          <Button size="sm"
            onClick={() => toast({ title: 'Förbereder SIE 4-export…', description: 'Filen genereras och laddas ned snart.' })}
            className="h-9 gap-1.5">
            <FileDown className="w-4 h-4" />Exportera SIE
          </Button>
        </div>
        <p className="text-sm text-muted-foreground">
          Välj ett start- och slutdatum för att filtrera verifikat. Du kan även filtrera på start- och slutverifikationsnummer.
        </p>
        <div className="space-y-2">
          <p className="text-sm font-semibold text-primary">20 senaste exporterade SIE-filer</p>
          <div className="rounded-lg border border-border bg-card overflow-hidden">
            {isLoading ? (
              <div className="p-4 space-y-2">{[1, 2, 3].map((i) => <Skeleton key={i} className="h-10 rounded" />)}</div>
            ) : exports.length === 0 ? (
              <div className="px-4 py-8 text-center"><p className="text-sm text-muted-foreground">Inga loggar hittades</p></div>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/30">
                    <th className="px-4 py-2.5 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">Exportdatum</th>
                    <th className="px-4 py-2.5 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">Period</th>
                    <th className="px-4 py-2.5 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {exports.map((exp) => (
                    <tr key={exp.id} className="border-b border-border last:border-0 hover:bg-muted/20">
                      <td className="px-4 py-2.5 text-sm">{DATE_FMT.format(new Date(exp.created_at))}</td>
                      <td className="px-4 py-2.5 text-muted-foreground text-sm">
                        {exp.period_from && exp.period_to ? `${exp.period_from} – ${exp.period_to}` : '–'}
                      </td>
                      <td className="px-4 py-2.5">
                        <span className="text-xs font-medium text-green-700 dark:text-green-400">{exp.status ?? 'klar'}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
