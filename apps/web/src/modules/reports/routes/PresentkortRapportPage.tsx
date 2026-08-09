import { useState } from 'react';
import { toast } from '@platform/ui';
import { supabase } from '@core/api/supabase.js';
import {
  ReportCard, ExcelBtn, PdfBtn, DateInput, DateRange, SelectInput,
  csvDownload, printReport,
} from '../components/ReportCard.js';

function today()  { return new Date().toISOString().slice(0, 10); }
function ago(d: number) { const dt = new Date(); dt.setDate(dt.getDate() - d); return dt.toISOString().slice(0, 10); }
function dateFmt(s: string | null | undefined) { return s ? new Date(s).toLocaleDateString('sv-SE') : ''; }
function cur(n: number | null | undefined) { return n == null ? '' : Number(n).toFixed(2); }

const TYPE_OPTS = [
  { value: 'used_void', label: 'Förbrukade & Konfiskerade' },
  { value: 'used',      label: 'Förbrukade' },
  { value: 'void',      label: 'Konfiskerade' },
  { value: 'all',       label: 'Alla' },
];

const ISSUER_OPTS = [
  { value: 'all',    label: 'Alla utgivare' },
  { value: 'staff',  label: 'Personal' },
  { value: 'online', label: 'Online' },
  { value: 'import', label: 'Import' },
];

async function runExport(fetcher: () => Promise<Record<string, unknown>[]>, filename: string) {
  toast({ title: 'Förbereder export…', description: 'Hämtar data.' });
  try { csvDownload(await fetcher(), filename); }
  catch { toast({ title: 'Export misslyckades', description: 'Kontrollera anslutning och försök igen.', variant: 'destructive' }); }
}

export function PresentkortRapportPage() {
  const [date,   setDate]   = useState(today());
  const [pfrom,  setPFrom]  = useState(ago(30));
  const [pto,    setPTo]    = useState(today());
  const [ptype,  setPType]  = useState('used_void');
  const [sfrom,  setSFrom]  = useState(ago(30));
  const [sto,    setSTo]    = useState(today());
  const [issuer, setIssuer] = useState('all');
  const [rfrom,  setRFrom]  = useState(ago(30));
  const [rto,    setRTo]    = useState(today());

  // ── Aktiva presentkort ──────────────────────────────────────────────────────
  const exportAktiva = () => void runExport(async () => {
    const { data, error } = await supabase.from('gift_cards')
      .select('code, original_value_sek, remaining_value_sek, created_at, expires_at, status')
      .eq('status', 'active')
      .lte('created_at', date + 'T23:59:59')
      .order('created_at', { ascending: false }).limit(2000);
    if (error) throw error;
    return (data ?? []).map((r: Record<string, unknown>) => ({
      'Kod': r['code'] ?? '', 'Belopp (kr)': cur(r['original_value_sek'] as number),
      'Saldo (kr)': cur(r['remaining_value_sek'] as number), 'Utfärdad': dateFmt(r['created_at'] as string),
      'Gäller till': r['expires_at'] ? dateFmt(r['expires_at'] as string) : 'Ingen gräns', 'Status': r['status'] ?? '',
    })) as Record<string, unknown>[];
  }, `aktiva_presentkort_${date}`);

  const exportAktivaPdf = () => void (async () => {
    toast({ title: 'Förbereder PDF…' });
    try {
      const { data, error } = await supabase.from('gift_cards')
        .select('code, original_value_sek, remaining_value_sek, created_at, expires_at')
        .eq('status', 'active').lte('created_at', date + 'T23:59:59').limit(500);
      if (error) throw error;
      printReport(`Aktiva presentkort ${date}`, ['Kod', 'Belopp (kr)', 'Saldo (kr)', 'Utfärdad', 'Gäller till'],
        (data ?? []).map((r: Record<string, unknown>) => [
          r['code'] ?? '', cur(r['original_value_sek'] as number), cur(r['remaining_value_sek'] as number),
          dateFmt(r['created_at'] as string), r['expires_at'] ? dateFmt(r['expires_at'] as string) : 'Ingen gräns',
        ]));
    } catch { toast({ title: 'Export misslyckades', variant: 'destructive' }); }
  })();

  // ── Presentkortsaktivitet ───────────────────────────────────────────────────
  // gift_cards has no per-event log — status ('used'/'void') plus updated_at
  // is the closest real signal to "activity during the period" available.
  const activityStatuses = ptype === 'used' ? ['used'] : ptype === 'void' ? ['void'] : ptype === 'all' ? ['active', 'used', 'void', 'expired'] : ['used', 'void'];
  const exportAktivitet = () => void runExport(async () => {
    const { data, error } = await supabase.from('gift_cards')
      .select('code, status, original_value_sek, remaining_value_sek, updated_at')
      .in('status', activityStatuses)
      .gte('updated_at', pfrom).lte('updated_at', pto + 'T23:59:59')
      .order('updated_at', { ascending: false }).limit(2000);
    if (error) throw error;
    return (data ?? []).map((r: Record<string, unknown>) => ({
      'Kod': r['code'] ?? '', 'Typ': r['status'] ?? '',
      'Belopp (kr)': cur(r['original_value_sek'] as number), 'Datum': dateFmt(r['updated_at'] as string),
    })) as Record<string, unknown>[];
  }, `presentkortsaktivitet_${pfrom}_${pto}`);

  const exportAktivitetPdf = () => void (async () => {
    toast({ title: 'Förbereder PDF…' });
    try {
      const { data, error } = await supabase.from('gift_cards')
        .select('code, status, original_value_sek, updated_at')
        .in('status', activityStatuses)
        .gte('updated_at', pfrom).lte('updated_at', pto + 'T23:59:59').limit(500);
      if (error) throw error;
      printReport(`Presentkortsaktivitet ${pfrom} – ${pto}`, ['Kod', 'Typ', 'Belopp (kr)', 'Datum'],
        (data ?? []).map((r: Record<string, unknown>) => [r['code'] ?? '', r['status'] ?? '', cur(r['original_value_sek'] as number), dateFmt(r['updated_at'] as string)]));
    } catch { toast({ title: 'Export misslyckades', variant: 'destructive' }); }
  })();

  // ── Presentkort per utgivare ────────────────────────────────────────────────
  // gift_cards distinguishes legacy imports (is_legacy_import) from everything
  // else, but has no column separating staff-issued from online-issued cards —
  // "Personal"/"Online" therefore both resolve to the same non-import set
  // until the schema captures that distinction; this reports real counts, not
  // a fabricated split.
  const exportUtgivare = () => void runExport(async () => {
    let q = supabase.from('gift_cards')
      .select('is_legacy_import, original_value_sek, remaining_value_sek, status')
      .gte('created_at', sfrom).lte('created_at', sto + 'T23:59:59');
    if (issuer === 'import') q = q.eq('is_legacy_import', true);
    if (issuer === 'staff' || issuer === 'online') q = q.eq('is_legacy_import', false);
    const { data, error } = await q.limit(5000);
    if (error) throw error;
    const rows = (data ?? []) as Array<{ is_legacy_import: boolean; original_value_sek: number; remaining_value_sek: number; status: string }>;
    const sold    = rows.length;
    const redeemed = rows.filter(r => r.status === 'used' || r.remaining_value_sek < r.original_value_sek).length;
    const total    = rows.reduce((s, r) => s + Number(r.original_value_sek), 0);
    const label    = ISSUER_OPTS.find(o => o.value === issuer)?.label ?? 'Alla utgivare';
    return [{
      'Utgivare': label, 'Antal sålda': sold, 'Antal inlösta': redeemed, 'Totalt belopp (kr)': cur(total),
    }] as Record<string, unknown>[];
  }, `presentkort_utgivare_${issuer}_${sfrom}_${sto}`);

  // ── Utgångna presentkort ────────────────────────────────────────────────────
  const exportUtgangna = () => void runExport(async () => {
    const { data, error } = await supabase.from('gift_cards')
      .select('code, original_value_sek, remaining_value_sek, expires_at')
      .eq('status', 'expired')
      .gte('expires_at', rfrom).lte('expires_at', rto)
      .order('expires_at', { ascending: false }).limit(2000);
    if (error) throw error;
    return (data ?? []).map((r: Record<string, unknown>) => ({
      'Kod': r['code'] ?? '', 'Belopp (kr)': cur(r['original_value_sek'] as number),
      'Saldo (kr)': cur(r['remaining_value_sek'] as number), 'Utgick': dateFmt(r['expires_at'] as string),
    })) as Record<string, unknown>[];
  }, `utgangna_presentkort_${rfrom}_${rto}`);

  const exportUtgangnaPdf = () => void (async () => {
    toast({ title: 'Förbereder PDF…' });
    try {
      const { data, error } = await supabase.from('gift_cards')
        .select('code, original_value_sek, remaining_value_sek, expires_at')
        .eq('status', 'expired').gte('expires_at', rfrom).lte('expires_at', rto).limit(500);
      if (error) throw error;
      printReport(`Utgångna presentkort ${rfrom} – ${rto}`, ['Kod', 'Belopp (kr)', 'Saldo (kr)', 'Utgick'],
        (data ?? []).map((r: Record<string, unknown>) => [r['code'] ?? '', cur(r['original_value_sek'] as number), cur(r['remaining_value_sek'] as number), dateFmt(r['expires_at'] as string)]));
    } catch { toast({ title: 'Export misslyckades', variant: 'destructive' }); }
  })();

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
      <ReportCard
        title="Aktiva presentkort"
        description="Alla dina aktiva presentkort givet datum."
        actions={<><ExcelBtn onClick={exportAktiva} /><PdfBtn onClick={exportAktivaPdf} /></>}
      >
        <DateInput value={date} onChange={setDate} />
      </ReportCard>

      <ReportCard
        title="Presentkortsaktivitet"
        description="Aktivitet för dina presentkort under perioden."
        actions={<><ExcelBtn onClick={exportAktivitet} /><PdfBtn onClick={exportAktivitetPdf} /></>}
      >
        <DateRange from={pfrom} to={pto} onFromChange={setPFrom} onToChange={setPTo} />
        <SelectInput value={ptype} onChange={setPType} options={TYPE_OPTS} />
      </ReportCard>

      <ReportCard
        title="Presentkort per utgivare"
        description="Antal sålda och inlösta presentkort fördelat per utgivare."
        actions={<ExcelBtn onClick={exportUtgivare} />}
      >
        <DateRange from={sfrom} to={sto} onFromChange={setSFrom} onToChange={setSTo} />
        <SelectInput value={issuer} onChange={setIssuer} options={ISSUER_OPTS} label="Utgivare" />
      </ReportCard>

      <ReportCard
        title="Utgångna presentkort"
        description="Presentkort som har passerat sitt utgångsdatum under perioden."
        actions={<><ExcelBtn onClick={exportUtgangna} /><PdfBtn onClick={exportUtgangnaPdf} /></>}
      >
        <DateRange from={rfrom} to={rto} onFromChange={setRFrom} onToChange={setRTo} />
      </ReportCard>
    </div>
  );
}
