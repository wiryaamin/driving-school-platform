import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@core/api/supabase.js';
import { Skeleton, toast } from '@platform/ui';
import {
  ReportCard, ExcelBtn, PdfBtn, VisaBtn,
  DateRange, DateField, SelectInput,
  csvDownload, printReport,
} from '../components/ReportCard.js';

// ─── Date helpers ─────────────────────────────────────────────────────────────
function today()      { return new Date().toISOString().slice(0, 10); }
function ago(days: number) {
  const d = new Date(); d.setDate(d.getDate() - days);
  return d.toISOString().slice(0, 10);
}
function monthStart() { return today().slice(0, 8) + '01'; }
function dateFmt(s: string | null | undefined) {
  if (!s) return '';
  return new Date(s).toLocaleDateString('sv-SE');
}
function cur(n: number | null | undefined) { return n == null ? '' : Number(n).toFixed(2); }

const SEK = new Intl.NumberFormat('sv-SE', { style: 'currency', currency: 'SEK', maximumFractionDigits: 0 });

const METHOD_LABELS: Record<string, string> = {
  cash: 'Kontanter', swish: 'Swish', card: 'Kort', invoice: 'Faktura',
  bank_transfer: 'Bankgiro', credit: 'Elevsaldo', gift_card: 'Presentkort',
};

// ─── Module-level export helper ───────────────────────────────────────────────

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

// ─── Betalningar per typ (inline view) ───────────────────────────────────────

interface Payment { payment_method: string; amount: number; }

function BetalningarPerTyp() {
  const [from, setFrom] = useState(monthStart());
  const [to,   setTo]   = useState(today());
  const [show, setShow] = useState(false);

  const { data = [], isLoading } = useQuery<Payment[]>({
    queryKey: ['rapport-betalningar-typ', from, to],
    queryFn:  async () => {
      const { data } = await supabase
        .from('payments').select('payment_method, amount, created_at')
        .gte('created_at', from).lte('created_at', to + 'T23:59:59');
      return (data ?? []) as Payment[];
    },
    enabled: show,
  });

  const grouped = useMemo(() => {
    const m: Record<string, number> = {};
    for (const p of data) m[p.payment_method] = (m[p.payment_method] ?? 0) + p.amount;
    return Object.entries(m).sort((a, b) => b[1] - a[1]);
  }, [data]);

  return (
    <ReportCard
      title="Betalningar per typ"
      description="Betalningar per typ för en given tidsperiod."
      actions={<VisaBtn onClick={() => setShow(true)} />}
    >
      <DateRange from={from} to={to} onFromChange={setFrom} onToChange={setTo} />
      {show && (
        <div className="rounded-md border border-border overflow-hidden">
          {isLoading ? (
            <div className="p-3 space-y-1.5">
              <Skeleton className="h-4 w-full" /><Skeleton className="h-4 w-3/4" />
            </div>
          ) : grouped.length === 0 ? (
            <p className="text-xs text-muted-foreground p-3 text-center">Inga betalningar hittades.</p>
          ) : (
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-muted/30 border-b border-border">
                  <th className="px-3 py-2 text-left font-medium text-muted-foreground">Betalningstyp</th>
                  <th className="px-3 py-2 text-right font-medium text-muted-foreground">Belopp</th>
                </tr>
              </thead>
              <tbody>
                {grouped.map(([method, amount]) => (
                  <tr key={method} className="border-b border-border last:border-0 hover:bg-muted/10">
                    <td className="px-3 py-1.5">{METHOD_LABELS[method] ?? method}</td>
                    <td className="px-3 py-1.5 text-right tabular-nums font-medium">{SEK.format(amount)}</td>
                  </tr>
                ))}
                <tr className="bg-muted/20 font-semibold border-t border-border">
                  <td className="px-3 py-2">Totalt</td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {SEK.format(grouped.reduce((s, [, a]) => s + a, 0))}
                  </td>
                </tr>
              </tbody>
            </table>
          )}
        </div>
      )}
    </ReportCard>
  );
}

// ─── Betalningsinformation (inline view) ──────────────────────────────────────

interface PaymentRow {
  id: string; amount: number; payment_method: string;
  created_at: string; notes: string | null;
}

function BetalningsinformationReport() {
  const [from, setFrom] = useState(monthStart());
  const [to,   setTo]   = useState(today());
  const [show, setShow] = useState(false);

  const { data = [], isLoading } = useQuery<PaymentRow[]>({
    queryKey: ['rapport-betalningsinformation', from, to],
    queryFn: async () => {
      const { data } = await supabase
        .from('payments')
        .select('id, amount, payment_method, created_at, notes')
        .gte('created_at', from)
        .lte('created_at', to + 'T23:59:59')
        .order('created_at', { ascending: false })
        .limit(200);
      return (data ?? []) as PaymentRow[];
    },
    enabled: show,
  });

  const D = new Intl.DateTimeFormat('sv-SE', { dateStyle: 'short', timeStyle: 'short' });

  const exportExcel = () => void runExport(async () => {
    const { data: rows } = await supabase
      .from('payments')
      .select('id, amount, payment_method, created_at, notes')
      .gte('created_at', from).lte('created_at', to + 'T23:59:59')
      .order('created_at', { ascending: false }).limit(5000);
    return (rows ?? []).map((p: PaymentRow) => ({
      'Datum':          new Date(p.created_at).toLocaleString('sv-SE'),
      'Betalningstyp':  METHOD_LABELS[p.payment_method] ?? p.payment_method,
      'Not':            p.notes ?? '',
      'Belopp (kr)':    cur(p.amount),
    })) as Record<string, unknown>[];
  }, `betalningsinformation_${from}_${to}`);

  return (
    <ReportCard
      title="Betalningsinformation"
      description="Detaljerad lista över alla betalningar för perioden."
      actions={
        <>
          <VisaBtn onClick={() => setShow(true)} />
          <ExcelBtn onClick={exportExcel} />
        </>
      }
    >
      <DateRange from={from} to={to} onFromChange={setFrom} onToChange={setTo} />
      {show && (
        <div className="rounded-md border border-border overflow-hidden">
          {isLoading ? (
            <div className="p-3 space-y-1.5">
              <Skeleton className="h-4 w-full" /><Skeleton className="h-4 w-3/4" />
            </div>
          ) : data.length === 0 ? (
            <p className="text-xs text-muted-foreground p-3 text-center">Inga betalningar hittades.</p>
          ) : (
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-muted/30 border-b border-border">
                  <th className="px-3 py-2 text-left font-medium text-muted-foreground">Datum</th>
                  <th className="px-3 py-2 text-left font-medium text-muted-foreground">Typ</th>
                  <th className="px-3 py-2 text-left font-medium text-muted-foreground">Not</th>
                  <th className="px-3 py-2 text-right font-medium text-muted-foreground">Belopp</th>
                </tr>
              </thead>
              <tbody>
                {data.map((p) => (
                  <tr key={p.id} className="border-b border-border last:border-0 hover:bg-muted/10">
                    <td className="px-3 py-1.5 whitespace-nowrap">{D.format(new Date(p.created_at))}</td>
                    <td className="px-3 py-1.5">{METHOD_LABELS[p.payment_method] ?? p.payment_method}</td>
                    <td className="px-3 py-1.5 text-muted-foreground">{p.notes ?? '—'}</td>
                    <td className="px-3 py-1.5 text-right tabular-nums font-medium">{SEK.format(p.amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </ReportCard>
  );
}

// ─── Instructor fetch ──────────────────────────────────────────────────────────

interface InstructorRef { id: string; first_name: string; last_name: string; }

function useInstructorOptions() {
  const { data = [] } = useQuery<InstructorRef[]>({
    queryKey: ['instructors-list'],
    queryFn: async () => {
      const { data } = await supabase.from('instructors')
        .select('id, first_name, last_name').is('deleted_at', null).order('first_name');
      return (data ?? []) as InstructorRef[];
    },
    staleTime: 10 * 60_000,
  });
  return [
    { value: 'all', label: 'Alla lärare' },
    ...data.map((i) => ({ value: i.id, label: `${i.first_name} ${i.last_name}` })),
  ];
}

// ─── GrundrapporterPage ───────────────────────────────────────────────────────

export function GrundrapporterPage() {
  const [f1from,  setF1From]  = useState(monthStart());
  const [f1to,    setF1To]    = useState(today());
  const [f2from,  setF2From]  = useState('2026-01-01');
  const [f2to,    setF2To]    = useState('2026-06-01');
  const [f3date,  setF3Date]  = useState(today());
  const [f4from,  setF4From]  = useState(monthStart());
  const [f4to,    setF4To]    = useState(today());
  const [f5type,  setF5Type]  = useState('negative');
  const [f5from,  setF5From]  = useState(monthStart());
  const [f5to,    setF5To]    = useState(today());
  const [f6from,  setF6From]  = useState(monthStart());
  const [f6to,    setF6To]    = useState(today());
  const [f7from,  setF7From]  = useState(ago(30));
  const [f7to,    setF7To]    = useState(today());
  const [f8from,  setF8From]  = useState(monthStart());
  const [f8to,    setF8To]    = useState(today());
  const [f10inst, setF10Inst] = useState('all');
  const [f10from, setF10From] = useState(monthStart());
  const [f10to,   setF10To]   = useState(today());
  const [f11from, setF11From] = useState(ago(30));
  const [f11to,   setF11To]   = useState(today());

  const [bov_from,  setBovFrom]  = useState(monthStart());
  const [bov_to,    setBovTo]    = useState(today());
  const [dag_date,  setDagDate]  = useState(today());
  const [deb_from,  setDebFrom]  = useState(monthStart());
  const [deb_to,    setDebTo]    = useState(today());
  const [fakt_from, setFaktFrom] = useState(monthStart());
  const [fakt_to,   setFaktTo]   = useState(today());
  const [forl_from, setForlFrom] = useState(monthStart());
  const [forl_to,   setForlTo]   = useState(today());
  const [pak_from,  setPakFrom]  = useState(monthStart());
  const [pak_to,    setPakTo]    = useState(today());
  const [rad_from,  setRadFrom]  = useState(monthStart());
  const [rad_to,    setRadTo]    = useState(today());
  const [pers_inst, setPersInst] = useState('all');
  const [pers_from, setPersFrom] = useState(monthStart());
  const [pers_to,   setPersto]   = useState(today());
  const [pos_date,  setPosDate]  = useState(today());
  const [inakt_days, setInaktDays] = useState('90');

  const instructorOpts = useInstructorOptions();

  // ── Export functions ────────────────────────────────────────────────────────

  const exportForsaljningPdf = () => void (async () => {
    toast({ title: 'Förbereder PDF…', description: 'Hämtar fakturadata.' });
    try {
      const { data } = await supabase.from('invoices')
        .select('invoice_number, status, total_amount, vat_amount, currency, created_at, due_date')
        .gte('created_at', f1from).lte('created_at', f1to + 'T23:59:59')
        .order('created_at', { ascending: false }).limit(500);
      const rows = (data ?? []).map((r: Record<string, unknown>) => [
        r['invoice_number'] ?? '', r['status'] ?? '',
        cur(r['total_amount'] as number), cur(r['vat_amount'] as number),
        r['currency'] ?? 'SEK', dateFmt(r['created_at'] as string), r['due_date'] ?? '',
      ]);
      printReport(
        `Försäljning ${f1from} – ${f1to}`,
        ['Fakturanr', 'Status', 'Belopp', 'Moms', 'Valuta', 'Skapad', 'Förfallodatum'],
        rows,
      );
    } catch { toast({ title: 'Export misslyckades', variant: 'destructive' }); }
  })();

  const exportForsaljningsrevisionPdf = () => void (async () => {
    toast({ title: 'Förbereder PDF…' });
    try {
      const { data } = await supabase.from('invoices')
        .select('total_amount, created_at')
        .gte('created_at', f2from).lte('created_at', f2to + 'T23:59:59')
        .order('created_at', { ascending: true });
      const byMonth: Record<string, number> = {};
      for (const r of (data ?? []) as Array<{ total_amount: number; created_at: string }>) {
        const m = r.created_at.slice(0, 7);
        byMonth[m] = (byMonth[m] ?? 0) + (r.total_amount ?? 0);
      }
      const rows = Object.entries(byMonth).map(([m, a]) => [m, cur(a)]);
      printReport(`Försäljningsrevision ${f2from} – ${f2to}`, ['Månad', 'Belopp (kr)'], rows);
    } catch { toast({ title: 'Export misslyckades', variant: 'destructive' }); }
  })();

  const exportBetalningsoverikt = () => void runExport(async () => {
    const { data } = await supabase.from('payments')
      .select('amount, payment_method, created_at')
      .gte('created_at', bov_from).lte('created_at', bov_to + 'T23:59:59')
      .order('created_at', { ascending: false }).limit(2000);
    const byDay: Record<string, number> = {};
    for (const r of (data ?? []) as Array<{ amount: number; created_at: string }>) {
      const d = r.created_at.slice(0, 10);
      byDay[d] = (byDay[d] ?? 0) + r.amount;
    }
    return Object.entries(byDay)
      .sort((a, b) => b[0].localeCompare(a[0]))
      .map(([dag, tot]) => ({ 'Datum': dag, 'Totalt (kr)': cur(tot) })) as Record<string, unknown>[];
  }, `betalningsoversikt_${bov_from}_${bov_to}`);

  const exportBetalningsoveriktPdf = () => void (async () => {
    toast({ title: 'Förbereder PDF…' });
    try {
      const { data } = await supabase.from('payments')
        .select('amount, created_at').gte('created_at', bov_from).lte('created_at', bov_to + 'T23:59:59');
      const byDay: Record<string, number> = {};
      for (const r of (data ?? []) as Array<{ amount: number; created_at: string }>) {
        const d = r.created_at.slice(0, 10);
        byDay[d] = (byDay[d] ?? 0) + r.amount;
      }
      const rows = Object.entries(byDay).sort((a, b) => b[0].localeCompare(a[0])).map(([d, a]) => [d, cur(a)]);
      printReport(`Betalningsöversikt ${bov_from} – ${bov_to}`, ['Datum', 'Totalt (kr)'], rows);
    } catch { toast({ title: 'Export misslyckades', variant: 'destructive' }); }
  })();

  const exportKunderLektionssaldo = () => void runExport(async () => {
    const { data } = await supabase.from('student_packages')
      .select('id, student_id, quantity_granted, quantity_consumed, quantity_expired, price_paid, status, created_at, students(first_name, last_name, email)')
      .eq('status', 'active')
      .is('archived_at', null)
      .order('created_at', { ascending: false }).limit(1000);
    return (data ?? [])
      .map((r: Record<string, unknown>) => {
        const granted  = (r['quantity_granted']  as number) ?? 0;
        const consumed = (r['quantity_consumed'] as number) ?? 0;
        const expired  = (r['quantity_expired']  as number) ?? 0;
        return { r, remaining: granted - consumed - expired };
      })
      .filter(({ remaining }) => remaining > 0)
      .map(({ r, remaining }) => {
        const s = r['students'] as Record<string, unknown> | null;
        return {
          'Elev':              s ? `${s['first_name'] ?? ''} ${s['last_name'] ?? ''}`.trim() : '',
          'E-post':            s ? (s['email'] ?? '') : '',
          'Återstående lekt.': remaining,
          'Totalt lekt.':      r['quantity_granted'] ?? 0,
          'Betalt (kr)':       cur(r['price_paid'] as number),
          'Skapad':            dateFmt(r['created_at'] as string),
        };
      }) as Record<string, unknown>[];
  }, `kunder_lektionssaldo_${f3date}`);

  const exportKunderLektionssaldoPdf = () => void (async () => {
    toast({ title: 'Förbereder PDF…' });
    try {
      const { data } = await supabase.from('student_packages')
        .select('quantity_granted, quantity_consumed, quantity_expired, price_paid, students(first_name, last_name)')
        .eq('status', 'active').is('archived_at', null).limit(500);
      const rows = (data ?? [])
        .map((r: Record<string, unknown>) => {
          const granted  = (r['quantity_granted']  as number) ?? 0;
          const consumed = (r['quantity_consumed'] as number) ?? 0;
          const expired  = (r['quantity_expired']  as number) ?? 0;
          return { r, remaining: granted - consumed - expired };
        })
        .filter(({ remaining }) => remaining > 0)
        .map(({ r, remaining }) => {
          const s = r['students'] as Record<string, unknown> | null;
          return [`${s?.['first_name'] ?? ''} ${s?.['last_name'] ?? ''}`.trim(), remaining, r['quantity_granted'], cur(r['price_paid'] as number)];
        });
      printReport(`Kunder med lektionssaldo – ${f3date}`, ['Elev', 'Kvar', 'Totalt', 'Betalt (kr)'], rows);
    } catch { toast({ title: 'Export misslyckades', variant: 'destructive' }); }
  })();

  const exportOmsattningLektionssaldo = () => void (async () => {
    toast({ title: 'Förbereder PDF…' });
    try {
      const { data } = await supabase.from('payments')
        .select('amount, payment_method, created_at, notes')
        .eq('payment_method', 'credit')
        .gte('created_at', f4from).lte('created_at', f4to + 'T23:59:59')
        .order('created_at', { ascending: false }).limit(500);
      const rows = (data ?? []).map((r: Record<string, unknown>) => [dateFmt(r['created_at'] as string), cur(r['amount'] as number), r['notes'] ?? '']);
      printReport(`Omsättning lektionssaldo ${f4from} – ${f4to}`, ['Datum', 'Belopp (kr)', 'Not'], rows);
    } catch { toast({ title: 'Export misslyckades', variant: 'destructive' }); }
  })();

  const exportKunderElevsaldo = () => void runExport(async () => {
    let q = supabase.from('students')
      .select('first_name, last_name, email, phone, credit_balance, status, created_at')
      .is('deleted_at', null)
      .order('credit_balance', { ascending: f5type === 'negative' });
    if (f5type === 'negative') q = q.lt('credit_balance', 0);
    if (f5type === 'positive') q = q.gt('credit_balance', 0);
    const { data } = await q.limit(1000);
    return (data ?? []).map((r: Record<string, unknown>) => ({
      'Förnamn':  r['first_name'] ?? '',
      'Efternamn': r['last_name'] ?? '',
      'E-post':   r['email'] ?? '',
      'Telefon':  r['phone'] ?? '',
      'Saldo (kr)': cur(r['credit_balance'] as number),
      'Status':   r['status'] ?? '',
      'Skapad':   dateFmt(r['created_at'] as string),
    })) as Record<string, unknown>[];
  }, `kunder_elevsaldo_${f5type}_${f5from}`);

  const exportKunderElevsaldoPdf = () => void (async () => {
    toast({ title: 'Förbereder PDF…' });
    try {
      let q = supabase.from('students')
        .select('first_name, last_name, credit_balance').is('deleted_at', null);
      if (f5type === 'negative') q = q.lt('credit_balance', 0);
      if (f5type === 'positive') q = q.gt('credit_balance', 0);
      const { data } = await q.limit(500);
      const rows = (data ?? []).map((r: Record<string, unknown>) => [`${r['first_name'] ?? ''} ${r['last_name'] ?? ''}`.trim(), cur(r['credit_balance'] as number)]);
      printReport(`Kunder med elevsaldo (${f5type})`, ['Elev', 'Saldo (kr)'], rows);
    } catch { toast({ title: 'Export misslyckades', variant: 'destructive' }); }
  })();

  const exportMomsdifferens = () => void runExport(async () => {
    const { data } = await supabase.from('invoice_line_items')
      .select('description, quantity, unit_price, vat_rate, vat_amount, line_total, created_at')
      .gte('created_at', f6from).lte('created_at', f6to + 'T23:59:59')
      .order('created_at', { ascending: false }).limit(2000);
    return (data ?? []).map((r: Record<string, unknown>) => ({
      'Beskrivning':  r['description'] ?? '',
      'Antal':        r['quantity'] ?? 1,
      'À-pris (kr)':  cur(r['unit_price'] as number),
      'Momssats':     `${((r['vat_rate'] as number ?? 0) * 100).toFixed(0)}%`,
      'Moms (kr)':    cur(r['vat_amount'] as number),
      'Radtotal (kr)': cur(r['line_total'] as number),
      'Datum':         dateFmt(r['created_at'] as string),
    })) as Record<string, unknown>[];
  }, `momsdifferens_${f6from}_${f6to}`);

  const exportArtiklar = () => void runExport(async () => {
    const { data } = await supabase.from('lesson_types')
      .select('name, duration_minutes, price_sek, category, is_active, created_at')
      .is('deleted_at', null).order('name');
    return (data ?? []).map((r: Record<string, unknown>) => ({
      'Artikel':       r['name'] ?? '',
      'Kategori':      r['category'] ?? '',
      'Längd (min)':   r['duration_minutes'] ?? '',
      'Pris (kr)':     cur(r['price_sek'] as number),
      'Aktiv':         r['is_active'] ? 'Ja' : 'Nej',
      'Skapad':        dateFmt(r['created_at'] as string),
    })) as Record<string, unknown>[];
  }, 'artiklar');

  const exportArtiklaFrPdf = () => void (async () => {
    toast({ title: 'Förbereder PDF…' });
    try {
      const { data } = await supabase.from('lesson_types')
        .select('name, duration_minutes, price_sek, category').is('deleted_at', null).order('name');
      const rows = (data ?? []).map((r: Record<string, unknown>) => [r['name'], r['category'] ?? '', r['duration_minutes'] ?? '', cur(r['price_sek'] as number)]);
      printReport('Artiklar', ['Artikel', 'Kategori', 'Längd (min)', 'Pris (kr)'], rows);
    } catch { toast({ title: 'Export misslyckades', variant: 'destructive' }); }
  })();

  const exportSaldaArtiklar = () => void runExport(async () => {
    const { data } = await supabase.from('invoice_line_items')
      .select('description, quantity, unit_price, vat_rate, line_total, created_at')
      .gte('created_at', f7from).lte('created_at', f7to + 'T23:59:59')
      .order('created_at', { ascending: false }).limit(2000);
    return (data ?? []).map((r: Record<string, unknown>) => ({
      'Artikel':       r['description'] ?? '',
      'Antal':         r['quantity'] ?? 1,
      'À-pris (kr)':   cur(r['unit_price'] as number),
      'Momssats':      `${((r['vat_rate'] as number ?? 0.25) * 100).toFixed(0)}%`,
      'Radtotal (kr)': cur(r['line_total'] as number),
      'Datum':          dateFmt(r['created_at'] as string),
    })) as Record<string, unknown>[];
  }, `salda_artiklar_${f7from}_${f7to}`);

  const exportMomsberakning = () => void runExport(async () => {
    const { data } = await supabase.from('invoice_line_items')
      .select('description, quantity, unit_price, vat_rate, vat_amount, line_total, invoices(invoice_number, status)')
      .gte('created_at', f8from).lte('created_at', f8to + 'T23:59:59')
      .limit(2000);
    return (data ?? []).map((r: Record<string, unknown>) => {
      const inv = r['invoices'] as Record<string, unknown> | null;
      return {
        'Fakturanr':     inv?.['invoice_number'] ?? '',
        'Status':        inv?.['status'] ?? '',
        'Beskrivning':   r['description'] ?? '',
        'Antal':         r['quantity'] ?? 1,
        'À-pris (kr)':   cur(r['unit_price'] as number),
        'Momssats':      `${((r['vat_rate'] as number ?? 0.25) * 100).toFixed(0)}%`,
        'Moms (kr)':     cur(r['vat_amount'] as number),
        'Radtotal (kr)': cur(r['line_total'] as number),
      };
    }) as Record<string, unknown>[];
  }, `momsberakning_${f8from}_${f8to}`);

  const exportLararensTidsluckor = () => void (async () => {
    toast({ title: 'Förbereder PDF…' });
    try {
      let q = supabase.from('lesson_slots')
        .select('starts_at, ends_at, status, capacity, booked_count, instructors(first_name, last_name)')
        .gte('starts_at', f10from).lte('starts_at', f10to + 'T23:59:59')
        .order('starts_at');
      if (f10inst !== 'all') q = q.eq('instructor_id', f10inst);
      const { data } = await q.limit(500);
      const rows = (data ?? []).map((r: Record<string, unknown>) => {
        const inst = r['instructors'] as Record<string, unknown> | null;
        return [
          inst ? `${inst['first_name'] ?? ''} ${inst['last_name'] ?? ''}`.trim() : '',
          new Date(r['starts_at'] as string).toLocaleString('sv-SE'),
          new Date(r['ends_at'] as string).toLocaleString('sv-SE'),
          r['status'] ?? '', r['booked_count'] ?? 0, r['capacity'] ?? 0,
        ];
      });
      const instLabel = f10inst === 'all' ? 'Alla lärare' : (instructorOpts.find((o) => o.value === f10inst)?.label ?? '');
      printReport(`Lärarens tidsluckor – ${instLabel} – ${f10from} – ${f10to}`,
        ['Lärare', 'Start', 'Slut', 'Status', 'Bokade', 'Kapacitet'], rows);
    } catch { toast({ title: 'Export misslyckades', variant: 'destructive' }); }
  })();

  const exportForsaljningPerProdukt = () => void runExport(async () => {
    const { data } = await supabase.from('invoice_line_items')
      .select('description, quantity, line_total')
      .gte('created_at', f11from).lte('created_at', f11to + 'T23:59:59')
      .limit(5000);
    const byDesc: Record<string, { antal: number; total: number }> = {};
    for (const r of (data ?? []) as Array<{ description: string; quantity: number; line_total: number }>) {
      const key = r.description ?? 'Okänd';
      if (!byDesc[key]) byDesc[key] = { antal: 0, total: 0 };
      byDesc[key]!.antal += r.quantity ?? 1;
      byDesc[key]!.total += r.line_total ?? 0;
    }
    return Object.entries(byDesc)
      .sort((a, b) => b[1].total - a[1].total)
      .map(([desc, v]) => ({
        'Produkt':    desc,
        'Antal sålda': v.antal,
        'Totalt (kr)': cur(v.total),
      })) as Record<string, unknown>[];
  }, `forsaljning_per_produkt_${f11from}_${f11to}`);

  const exportDagligAvrakning = () => void runExport(async () => {
    const from = dag_date; const to = dag_date + 'T23:59:59';
    const { data } = await supabase.from('invoices')
      .select('invoice_number, status, total_amount, currency, created_at, notes')
      .gte('created_at', from).lte('created_at', to)
      .order('created_at', { ascending: true }).limit(500);
    return (data ?? []).map((r: Record<string, unknown>) => ({
      'Fakturanr':  r['invoice_number'] ?? '',
      'Status':     r['status'] ?? '',
      'Belopp (kr)': cur(r['total_amount'] as number),
      'Valuta':     r['currency'] ?? 'SEK',
      'Tidpunkt':   new Date(r['created_at'] as string).toLocaleTimeString('sv-SE', { hour: '2-digit', minute: '2-digit' }),
      'Not':        r['notes'] ?? '',
    })) as Record<string, unknown>[];
  }, `daglig_avrakning_${dag_date}`);

  const exportDagligAvrPdf = () => void (async () => {
    toast({ title: 'Förbereder PDF…' });
    try {
      const { data } = await supabase.from('invoices')
        .select('invoice_number, status, total_amount')
        .gte('created_at', dag_date).lte('created_at', dag_date + 'T23:59:59')
        .order('created_at').limit(500);
      const rows = (data ?? []).map((r: Record<string, unknown>) => [r['invoice_number'] ?? '', r['status'] ?? '', cur(r['total_amount'] as number)]);
      printReport(`Daglig avräkning – ${dag_date}`, ['Fakturanr', 'Status', 'Belopp (kr)'], rows);
    } catch { toast({ title: 'Export misslyckades', variant: 'destructive' }); }
  })();

  const exportDebEjFakt = () => void runExport(async () => {
    const { data } = await supabase.from('invoices')
      .select('invoice_number, status, total_amount, currency, created_at, due_date, students(first_name, last_name)')
      .eq('status', 'draft')
      .gte('created_at', deb_from).lte('created_at', deb_to + 'T23:59:59')
      .order('created_at', { ascending: false }).limit(1000);
    return (data ?? []).map((r: Record<string, unknown>) => {
      const s = r['students'] as Record<string, unknown> | null;
      return {
        'Elev':          s ? `${s['first_name'] ?? ''} ${s['last_name'] ?? ''}`.trim() : 'Gästköp',
        'Fakturanr':     r['invoice_number'] ?? '(utkast)',
        'Belopp (kr)':   cur(r['total_amount'] as number),
        'Skapad':        dateFmt(r['created_at'] as string),
      };
    }) as Record<string, unknown>[];
  }, `debiterat_ej_fakturerat_${deb_from}_${deb_to}`);

  const exportElevPositivBalance = () => void runExport(async () => {
    const { data } = await supabase.from('students')
      .select('first_name, last_name, email, phone, credit_balance, status')
      .gt('credit_balance', 0).is('deleted_at', null)
      .order('credit_balance', { ascending: false }).limit(1000);
    return (data ?? []).map((r: Record<string, unknown>) => ({
      'Förnamn':    r['first_name'] ?? '',
      'Efternamn':  r['last_name'] ?? '',
      'E-post':     r['email'] ?? '',
      'Telefon':    r['phone'] ?? '',
      'Saldo (kr)': cur(r['credit_balance'] as number),
      'Status':     r['status'] ?? '',
    })) as Record<string, unknown>[];
  }, `elever_positiv_balans_${pos_date}`);

  const exportElevInaktivtPaket = () => void runExport(async () => {
    const cutoff = ago(Number(inakt_days));
    const { data } = await supabase.from('student_packages')
      .select('quantity_granted, quantity_consumed, quantity_expired, created_at, students(first_name, last_name, email)')
      .eq('status', 'active')
      .lt('created_at', cutoff)
      .order('created_at', { ascending: true }).limit(1000);
    return (data ?? [])
      .map((r: Record<string, unknown>) => {
        const granted  = (r['quantity_granted']  as number) ?? 0;
        const consumed = (r['quantity_consumed'] as number) ?? 0;
        const expired  = (r['quantity_expired']  as number) ?? 0;
        return { r, remaining: granted - consumed - expired };
      })
      .filter(({ remaining }) => remaining > 0)
      .map(({ r, remaining }) => {
        const s = r['students'] as Record<string, unknown> | null;
        return {
          'Elev':              s ? `${s['first_name'] ?? ''} ${s['last_name'] ?? ''}`.trim() : '',
          'E-post':            s?.['email'] ?? '',
          'Återstående lekt.': remaining,
          'Totalt lekt.':      r['quantity_granted'],
          'Paket skapades':    dateFmt(r['created_at'] as string),
        };
      }) as Record<string, unknown>[];
  }, `elever_inaktiva_paket_${inakt_days}dagar`);

  const exportFakturaoversikt = () => void runExport(async () => {
    const { data } = await supabase.from('invoices')
      .select('invoice_number, status, total_amount, vat_amount, currency, created_at, due_date, students(first_name, last_name)')
      .gte('created_at', fakt_from).lte('created_at', fakt_to + 'T23:59:59')
      .order('created_at', { ascending: false }).limit(2000);
    return (data ?? []).map((r: Record<string, unknown>) => {
      const s = r['students'] as Record<string, unknown> | null;
      return {
        'Fakturanr':     r['invoice_number'] ?? '(utkast)',
        'Elev':          s ? `${s['first_name'] ?? ''} ${s['last_name'] ?? ''}`.trim() : 'Gästköp',
        'Status':        r['status'] ?? '',
        'Belopp (kr)':   cur(r['total_amount'] as number),
        'Moms (kr)':     cur(r['vat_amount'] as number),
        'Valuta':        r['currency'] ?? 'SEK',
        'Skapad':        dateFmt(r['created_at'] as string),
        'Förfallodatum': r['due_date'] ?? '',
      };
    }) as Record<string, unknown>[];
  }, `fakturaoversikt_${fakt_from}_${fakt_to}`);

  const exportFakturaoversiktPdf = () => void (async () => {
    toast({ title: 'Förbereder PDF…' });
    try {
      const { data } = await supabase.from('invoices')
        .select('invoice_number, status, total_amount, created_at')
        .gte('created_at', fakt_from).lte('created_at', fakt_to + 'T23:59:59')
        .order('created_at', { ascending: false }).limit(500);
      const rows = (data ?? []).map((r: Record<string, unknown>) => [r['invoice_number'] ?? '', r['status'] ?? '', cur(r['total_amount'] as number), dateFmt(r['created_at'] as string)]);
      printReport(`Fakturaöversikt ${fakt_from} – ${fakt_to}`, ['Fakturanr', 'Status', 'Belopp (kr)', 'Skapad'], rows);
    } catch { toast({ title: 'Export misslyckades', variant: 'destructive' }); }
  })();

  const exportForlustFordran = () => void runExport(async () => {
    const { data } = await supabase.from('invoices')
      .select('invoice_number, total_amount, currency, voided_at, void_reason, students(first_name, last_name)')
      .eq('status', 'void')
      .gte('voided_at', forl_from).lte('voided_at', forl_to + 'T23:59:59')
      .order('voided_at', { ascending: false }).limit(1000);
    return (data ?? []).map((r: Record<string, unknown>) => {
      const s = r['students'] as Record<string, unknown> | null;
      return {
        'Fakturanr':   r['invoice_number'] ?? '',
        'Elev':        s ? `${s['first_name'] ?? ''} ${s['last_name'] ?? ''}`.trim() : 'Gästköp',
        'Belopp (kr)': cur(r['total_amount'] as number),
        'Makulerades': dateFmt(r['voided_at'] as string),
        'Orsak':       r['void_reason'] ?? '',
      };
    }) as Record<string, unknown>[];
  }, `forlust_fordran_${forl_from}_${forl_to}`);

  const exportPaketforsaljning = () => void runExport(async () => {
    const { data } = await supabase.from('student_packages')
      .select('quantity_granted, quantity_consumed, quantity_expired, price_paid, status, created_at, students(first_name, last_name)')
      .gte('created_at', pak_from).lte('created_at', pak_to + 'T23:59:59')
      .order('created_at', { ascending: false }).limit(2000);
    return (data ?? []).map((r: Record<string, unknown>) => {
      const granted  = (r['quantity_granted']  as number) ?? 0;
      const consumed = (r['quantity_consumed'] as number) ?? 0;
      const expired  = (r['quantity_expired']  as number) ?? 0;
      const s = r['students'] as Record<string, unknown> | null;
      return {
        'Elev':              s ? `${s['first_name'] ?? ''} ${s['last_name'] ?? ''}`.trim() : '',
        'Totalt lekt.':      granted,
        'Återstående lekt.': granted - consumed - expired,
        'Betalt (kr)':       cur(r['price_paid'] as number),
        'Status':            r['status'] ?? '',
        'Skapad':            dateFmt(r['created_at'] as string),
      };
    }) as Record<string, unknown>[];
  }, `paketforsaljning_${pak_from}_${pak_to}`);

  const exportPaketforsaljningPdf = () => void (async () => {
    toast({ title: 'Förbereder PDF…' });
    try {
      const { data } = await supabase.from('student_packages')
        .select('quantity_granted, quantity_consumed, quantity_expired, price_paid, students(first_name, last_name)')
        .gte('created_at', pak_from).lte('created_at', pak_to + 'T23:59:59').limit(500);
      const rows = (data ?? []).map((r: Record<string, unknown>) => {
        const granted  = (r['quantity_granted']  as number) ?? 0;
        const consumed = (r['quantity_consumed'] as number) ?? 0;
        const expired  = (r['quantity_expired']  as number) ?? 0;
        const s = r['students'] as Record<string, unknown> | null;
        return [`${s?.['first_name'] ?? ''} ${s?.['last_name'] ?? ''}`.trim(), granted, granted - consumed - expired, cur(r['price_paid'] as number)];
      });
      printReport(`Paketförsäljningsöversikt ${pak_from} – ${pak_to}`, ['Elev', 'Totalt', 'Kvar', 'Betalt (kr)'], rows);
    } catch { toast({ title: 'Export misslyckades', variant: 'destructive' }); }
  })();

  const exportPersonligaAktiviteter = () => void runExport(async () => {
    let q = supabase.from('lesson_bookings')
      .select('status, attendance_status, created_at, lesson_slots(starts_at, ends_at, lesson_types(name), instructors(first_name, last_name)), students(first_name, last_name)')
      .gte('created_at', pers_from).lte('created_at', pers_to + 'T23:59:59')
      .order('created_at', { ascending: false }).limit(2000);
    if (pers_inst !== 'all') q = q.eq('lesson_slots.instructor_id', pers_inst);
    const { data } = await q;
    return (data ?? []).map((r: Record<string, unknown>) => {
      const slot = r['lesson_slots'] as Record<string, unknown> | null;
      const lt   = slot?.['lesson_types'] as Record<string, unknown> | null;
      const inst = slot?.['instructors'] as Record<string, unknown> | null;
      const std  = r['students'] as Record<string, unknown> | null;
      return {
        'Lärare':    inst ? `${inst['first_name'] ?? ''} ${inst['last_name'] ?? ''}`.trim() : '',
        'Elev':      std  ? `${std['first_name']  ?? ''} ${std['last_name']  ?? ''}`.trim() : '',
        'Lektionstyp': lt?.['name'] ?? '',
        'Start':     slot?.['starts_at'] ? new Date(slot['starts_at'] as string).toLocaleString('sv-SE') : '',
        'Status':    r['status'] ?? '',
        'Närvaro':   r['attendance_status'] ?? '',
      };
    }) as Record<string, unknown>[];
  }, `personliga_aktiviteter_${pers_from}_${pers_to}`);

  const exportRaderadeForsal = () => void runExport(async () => {
    const { data } = await supabase.from('invoices')
      .select('invoice_number, total_amount, voided_at, void_reason, students(first_name, last_name)')
      .eq('status', 'void')
      .gte('voided_at', rad_from).lte('voided_at', rad_to + 'T23:59:59')
      .order('voided_at', { ascending: false }).limit(1000);
    return (data ?? []).map((r: Record<string, unknown>) => {
      const s = r['students'] as Record<string, unknown> | null;
      return {
        'Fakturanr':   r['invoice_number'] ?? '',
        'Elev':        s ? `${s['first_name'] ?? ''} ${s['last_name'] ?? ''}`.trim() : 'Gästköp',
        'Belopp (kr)': cur(r['total_amount'] as number),
        'Makulerades': dateFmt(r['voided_at'] as string),
        'Orsak':       r['void_reason'] ?? '',
      };
    }) as Record<string, unknown>[];
  }, `raderade_forsaljningar_${rad_from}_${rad_to}`);

  const balanceOpts = [
    { value: 'negative', label: 'Negativt saldo' },
    { value: 'positive', label: 'Positivt saldo' },
    { value: 'all',      label: 'Alla' },
  ];

  const inaktDayOpts = [
    { value: '30',  label: '30 dagar' },
    { value: '60',  label: '60 dagar' },
    { value: '90',  label: '90 dagar' },
    { value: '180', label: '180 dagar' },
    { value: '365', label: '1 år' },
  ];

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">

      {/* ── Existing reports ─────────────────────────────────────────────────── */}

      <ReportCard title="Försäljning" description="Försäljningsrapport."
        actions={<PdfBtn onClick={exportForsaljningPdf} />}>
        <DateRange from={f1from} to={f1to} onFromChange={setF1From} onToChange={setF1To} />
      </ReportCard>

      <ReportCard title="Försäljningsrevision"
        description="Följ försäljningen månad för månad för vald period."
        actions={<PdfBtn onClick={exportForsaljningsrevisionPdf} />}>
        <DateRange from={f2from} to={f2to} onFromChange={setF2From} onToChange={setF2To} />
      </ReportCard>

      <BetalningarPerTyp />

      <BetalningsinformationReport />

      <ReportCard title="Betalningsöversikt"
        description="Sammanfattning av alla betalningar per dag för perioden."
        actions={<><ExcelBtn onClick={exportBetalningsoverikt} /><PdfBtn onClick={exportBetalningsoveriktPdf} /></>}>
        <DateRange from={bov_from} to={bov_to} onFromChange={setBovFrom} onToChange={setBovTo} />
      </ReportCard>

      <ReportCard title="Kunder med lektionssaldo"
        description="Kunder med innestående lektionssaldo."
        actions={<><ExcelBtn onClick={exportKunderLektionssaldo} /><PdfBtn onClick={exportKunderLektionssaldoPdf} /></>}>
        <DateField label="Datum" value={f3date} onChange={setF3Date} />
      </ReportCard>

      <ReportCard title="Omsättning lektionssaldo"
        description="Hur lektionssaldon har omsatts under ett specifikt tidsintervall."
        actions={<PdfBtn onClick={exportOmsattningLektionssaldo} />}>
        <DateRange from={f4from} to={f4to} onFromChange={setF4From} onToChange={setF4To} />
      </ReportCard>

      <ReportCard title="Kunder med elevsaldo"
        description="Kunder med elevsaldo av de valda typerna."
        actions={<><ExcelBtn onClick={exportKunderElevsaldo} /><PdfBtn onClick={exportKunderElevsaldoPdf} /></>}>
        <SelectInput label="Typ" value={f5type} onChange={setF5Type} options={balanceOpts} />
        <DateRange from={f5from} to={f5to} onFromChange={setF5From} onToChange={setF5To} />
      </ReportCard>

      <ReportCard title="Momsdifferens för elevsaldo"
        description="Beräkningar för momsdifferens relaterat till elevsaldo."
        actions={<ExcelBtn onClick={exportMomsdifferens} />}>
        <DateRange from={f6from} to={f6to} onFromChange={setF6From} onToChange={setF6To} />
      </ReportCard>

      <ReportCard title="Artiklar" description="Alla dina artiklar."
        actions={<><ExcelBtn onClick={exportArtiklar} /><PdfBtn onClick={exportArtiklaFrPdf} /></>} />

      <ReportCard title="Sålda artiklar"
        description="Sålda artiklar för en given tidsperiod."
        actions={<ExcelBtn onClick={exportSaldaArtiklar} />}>
        <DateRange from={f7from} to={f7to} onFromChange={setF7From} onToChange={setF7To} />
      </ReportCard>

      <ReportCard title="Momsberäkning"
        description="Beräkningar som kan användas vid momsredovisning."
        actions={<ExcelBtn onClick={exportMomsberakning} />}>
        <DateRange from={f8from} to={f8to} onFromChange={setF8From} onToChange={setF8To} />
      </ReportCard>

      <ReportCard title="Lärarens tidsluckor"
        description="Värdet av tidsluckor för en specifik lärare."
        actions={<PdfBtn onClick={exportLararensTidsluckor} />}>
        <SelectInput label="Lärare" value={f10inst} onChange={setF10Inst} options={instructorOpts} />
        <DateRange from={f10from} to={f10to} onFromChange={setF10From} onToChange={setF10To} />
      </ReportCard>

      <ReportCard title="Försäljning per produkt"
        description="Excel-rapport med alla sålda produkter, antal sålda och summa per produkt."
        actions={<ExcelBtn onClick={exportForsaljningPerProdukt} />}>
        <DateRange from={f11from} to={f11to} onFromChange={setF11From} onToChange={setF11To} />
      </ReportCard>

      {/* ── New reports ──────────────────────────────────────────────────────── */}

      <ReportCard title="Daglig avräkning kontantfaktura"
        description="Avräkning av kontantfakturor per dag med betalningsmetod och totalbelopp."
        actions={<><ExcelBtn onClick={exportDagligAvrakning} /><PdfBtn onClick={exportDagligAvrPdf} /></>}>
        <DateField label="Datum" value={dag_date} onChange={setDagDate} />
      </ReportCard>

      <ReportCard title="Debiterat ej fakturerat"
        description="Kunder som har debiterade belopp som ännu inte fakturerats."
        actions={<ExcelBtn onClick={exportDebEjFakt} />}>
        <DateRange from={deb_from} to={deb_to} onFromChange={setDebFrom} onToChange={setDebTo} />
      </ReportCard>

      <ReportCard title="Elever med positiv balans"
        description="Lista över elever som har ett positivt saldo på sitt konto."
        actions={<ExcelBtn onClick={exportElevPositivBalance} />}>
        <DateField label="Datum" value={pos_date} onChange={setPosDate} />
      </ReportCard>

      <ReportCard title="Elever utan aktivitet med innestående paket"
        description="Elever som inte haft aktivitet under vald period men fortfarande har paket kvar."
        actions={<ExcelBtn onClick={exportElevInaktivtPaket} />}>
        <SelectInput
          label="Inaktiv sedan"
          value={inakt_days}
          onChange={setInaktDays}
          options={inaktDayOpts}
        />
      </ReportCard>

      <ReportCard title="Fakturaöversikt"
        description="Sammanfattning av alla fakturor för perioden med belopp och betalningsstatus."
        actions={<><ExcelBtn onClick={exportFakturaoversikt} /><PdfBtn onClick={exportFakturaoversiktPdf} /></>}>
        <DateRange from={fakt_from} to={fakt_to} onFromChange={setFaktFrom} onToChange={setFaktTo} />
      </ReportCard>

      <ReportCard title="Förlust på fordran"
        description="Förlorade fordringar – fakturor som avskrivits under perioden."
        actions={<ExcelBtn onClick={exportForlustFordran} />}>
        <DateRange from={forl_from} to={forl_to} onFromChange={setForlFrom} onToChange={setForlTo} />
      </ReportCard>

      <ReportCard title="Paketförsäljningsöversikt"
        description="Översikt av sålda paket per typ och period med antal och totalt belopp."
        actions={<><ExcelBtn onClick={exportPaketforsaljning} /><PdfBtn onClick={exportPaketforsaljningPdf} /></>}>
        <DateRange from={pak_from} to={pak_to} onFromChange={setPakFrom} onToChange={setPakTo} />
      </ReportCard>

      <ReportCard title="Personliga aktiviteter"
        description="Aktiviteter per lärare — bokningar, avbokningar och genomförda lektioner."
        actions={<ExcelBtn onClick={exportPersonligaAktiviteter} />}>
        <SelectInput label="Lärare" value={pers_inst} onChange={setPersInst} options={instructorOpts} />
        <DateRange from={pers_from} to={pers_to} onFromChange={setPersFrom} onToChange={setPersto} />
      </ReportCard>

      <ReportCard title="Raderade försäljningar/betalningar"
        description="Logg över raderade försäljningar och betalningar under perioden."
        actions={<ExcelBtn onClick={exportRaderadeForsal} />}>
        <DateRange from={rad_from} to={rad_to} onFromChange={setRadFrom} onToChange={setRadTo} />
      </ReportCard>

    </div>
  );
}
