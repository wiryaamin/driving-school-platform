import { useState } from 'react';
import { supabase } from '@core/api/supabase.js';
import { toast } from '@platform/ui';
import { ReportCard, ExcelBtn, OpenBtn, DateRange, SelectInput, csvDownload } from '../components/ReportCard.js';

function today()  { return new Date().toISOString().slice(0, 10); }
function ago(d: number) { const dt = new Date(); dt.setDate(dt.getDate() - d); return dt.toISOString().slice(0, 10); }
function dateFmt(s: unknown) { return s ? new Date(s as string).toLocaleDateString('sv-SE') : ''; }
function cur(n: unknown) { return n == null ? '' : Number(n).toFixed(2); }

async function runExport(fetcher: () => Promise<Record<string, unknown>[]>, filename: string) {
  toast({ title: 'Förbereder export…', description: 'Hämtar data.' });
  try { csvDownload(await fetcher(), filename); }
  catch { toast({ title: 'Export misslyckades', variant: 'destructive' }); }
}

const STATUS_OPTS = [
  { value: 'all',       label: 'Alla statusar' },
  { value: 'paid',      label: 'Betalda' },
  { value: 'pending',   label: 'Väntande' },
  { value: 'cancelled', label: 'Avbrutna' },
];

export function EhandelRapportPage() {
  const [b1from, setB1From] = useState(ago(30));
  const [b1to,   setB1To]   = useState(today());
  const [b2from, setB2From] = useState(ago(30));
  const [b2to,   setB2To]   = useState(today());
  const [b3from, setB3From] = useState(ago(30));
  const [b3to,   setB3To]   = useState(today());
  const [b4from, setB4From] = useState(ago(30));
  const [b4to,   setB4To]   = useState(today());
  const [b5from, setB5From] = useState(ago(30));
  const [b5to,   setB5To]   = useState(today());
  const [ordStatus, setOrdStatus] = useState('all');

  const exportBetalda = () => void runExport(async () => {
    const { data } = await supabase.from('payment_requests')
      .select('id, amount, currency, status, provider, created_at, student_id, students(first_name, last_name)')
      .eq('status', 'completed')
      .gte('created_at', b1from).lte('created_at', b1to + 'T23:59:59')
      .order('created_at', { ascending: false }).limit(2000);
    return (data ?? []).map((r: Record<string, unknown>) => {
      const std = r['students'] as Record<string, unknown> | null;
      return { 'Elev': std ? `${std['first_name'] ?? ''} ${std['last_name'] ?? ''}`.trim() : 'Gäst',
        'Belopp (kr)': cur(r['amount']), 'Valuta': r['currency'] ?? 'SEK',
        'Leverantör': r['provider'] ?? '', 'Datum': dateFmt(r['created_at']) };
    }) as Record<string, unknown>[];
  }, `betalda_ordrar_${b1from}_${b1to}`);

  const exportAvbrutna = () => void runExport(async () => {
    const { data } = await supabase.from('payment_requests')
      .select('id, amount, currency, status, provider, created_at, students(first_name, last_name)')
      .in('status', ['expired', 'cancelled'])
      .gte('created_at', b3from).lte('created_at', b3to + 'T23:59:59')
      .order('created_at', { ascending: false }).limit(2000);
    return (data ?? []).map((r: Record<string, unknown>) => {
      const std = r['students'] as Record<string, unknown> | null;
      return { 'Elev': std ? `${std['first_name'] ?? ''} ${std['last_name'] ?? ''}`.trim() : 'Gäst',
        'Belopp (kr)': cur(r['amount']), 'Status': r['status'] ?? '', 'Datum': dateFmt(r['created_at']) };
    }) as Record<string, unknown>[];
  }, `avbrutna_ordrar_${b3from}_${b3to}`);

  const exportKöpstatistik = () => void runExport(async () => {
    const { data } = await supabase.from('invoice_line_items')
      .select('description, quantity, line_total')
      .gte('created_at', b4from).lte('created_at', b4to + 'T23:59:59').limit(5000);
    const m: Record<string, { antal: number; total: number }> = {};
    for (const r of (data ?? []) as Array<{ description: string; quantity: number; line_total: number }>) {
      const k = r.description ?? 'Okänd'; if (!m[k]) m[k] = { antal: 0, total: 0 };
      m[k]!.antal += r.quantity ?? 1; m[k]!.total += r.line_total ?? 0;
    }
    return Object.entries(m).sort((a, b) => b[1].total - a[1].total).map(([d, v]) => ({ 'Artikel': d, 'Antal sålda': v.antal, 'Intäkt (kr)': cur(v.total) })) as Record<string, unknown>[];
  }, `köpstatistik_${b4from}_${b4to}`);

  const exportOrderhistorik = () => void runExport(async () => {
    let q = supabase.from('payment_requests')
      .select('id, amount, currency, status, provider, created_at, students(first_name, last_name)')
      .gte('created_at', b5from).lte('created_at', b5to + 'T23:59:59')
      .order('created_at', { ascending: false }).limit(2000);
    if (ordStatus !== 'all') q = q.eq('status', ordStatus === 'paid' ? 'completed' : ordStatus);
    const { data } = await q;
    return (data ?? []).map((r: Record<string, unknown>) => {
      const std = r['students'] as Record<string, unknown> | null;
      return { 'Elev': std ? `${std['first_name'] ?? ''} ${std['last_name'] ?? ''}`.trim() : 'Gäst',
        'Belopp (kr)': cur(r['amount']), 'Valuta': r['currency'] ?? 'SEK',
        'Status': r['status'] ?? '', 'Leverantör': r['provider'] ?? '', 'Datum': dateFmt(r['created_at']) };
    }) as Record<string, unknown>[];
  }, `orderhistorik_${b5from}_${b5to}`);

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
      <ReportCard
        title="Betalda ordrar"
        description="Visar betalda ordrar i e-handeln under den valda perioden."
        actions={<ExcelBtn onClick={exportBetalda} />}
      >
        <DateRange from={b1from} to={b1to} onFromChange={setB1From} onToChange={setB1To} />
      </ReportCard>

      <ReportCard
        title="Ordrar med returer"
        description="Visar ordrar med returer i e-handeln under den valda perioden."
        actions={<OpenBtn />}
      >
        <DateRange from={b2from} to={b2to} onFromChange={setB2From} onToChange={setB2To} />
      </ReportCard>

      <ReportCard
        title="Avbrutna ordrar"
        description="Ordrar som initierades men inte slutfördes under perioden."
        actions={<><ExcelBtn onClick={exportAvbrutna} /><OpenBtn label="Visa" /></>}
      >
        <DateRange from={b3from} to={b3to} onFromChange={setB3From} onToChange={setB3To} />
      </ReportCard>

      <ReportCard
        title="Köpstatistik per artikel"
        description="Försäljningsvolym och intäkter uppdelat per artikel och produkt."
        actions={<ExcelBtn onClick={exportKöpstatistik} />}
      >
        <DateRange from={b4from} to={b4to} onFromChange={setB4From} onToChange={setB4To} />
      </ReportCard>

      <ReportCard
        title="Orderhistorik"
        description="Fullständig orderhistorik med filtreringsmöjligheter per status."
        actions={<><ExcelBtn onClick={exportOrderhistorik} /><OpenBtn /></>}
      >
        <DateRange from={b5from} to={b5to} onFromChange={setB5From} onToChange={setB5To} />
        <SelectInput value={ordStatus} onChange={setOrdStatus} options={STATUS_OPTS} label="Status" />
      </ReportCard>
    </div>
  );
}
