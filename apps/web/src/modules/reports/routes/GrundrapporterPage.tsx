import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@core/api/supabase.js';
import { Skeleton } from '@platform/ui';
import {
  ReportCard, ExcelBtn, PdfBtn, VisaBtn, OpenBtn,
  DateRange, DateField, SelectInput, reportToast,
} from '../components/ReportCard.js';

// ─── Date helpers ─────────────────────────────────────────────────────────────
function today()      { return new Date().toISOString().slice(0, 10); }
function ago(days: number) {
  const d = new Date(); d.setDate(d.getDate() - days);
  return d.toISOString().slice(0, 10);
}
function monthStart() { return today().slice(0, 8) + '01'; }

const SEK = new Intl.NumberFormat('sv-SE', { style: 'currency', currency: 'SEK', maximumFractionDigits: 0 });

// ─── Betalningar per typ (inline view) ───────────────────────────────────────

interface Payment { payment_method: string; amount: number; }

const METHOD_LABELS: Record<string, string> = {
  cash: 'Kontanter', swish: 'Swish', card: 'Kort', invoice: 'Faktura',
  bank_transfer: 'Bankgiro', credit: 'Elevsaldo', gift_card: 'Presentkort',
};

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

  return (
    <ReportCard
      title="Betalningsinformation"
      description="Detaljerad lista över alla betalningar för perioden."
      actions={
        <>
          <VisaBtn onClick={() => setShow(true)} />
          <ExcelBtn />
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

  // New report states
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
    <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">

      {/* ── Existing reports ─────────────────────────────────────────────────── */}

      <ReportCard title="Försäljning" description="Försäljningsrapport."
        actions={<PdfBtn />}>
        <DateRange from={f1from} to={f1to} onFromChange={setF1From} onToChange={setF1To} />
      </ReportCard>

      <ReportCard title="Försäljningsrevision"
        description="Följ försäljningen månad för månad för vald period."
        actions={<PdfBtn />}>
        <DateRange from={f2from} to={f2to} onFromChange={setF2From} onToChange={setF2To} />
      </ReportCard>

      <BetalningarPerTyp />

      <BetalningsinformationReport />

      <ReportCard title="Betalningsöversikt"
        description="Sammanfattning av alla betalningar per dag för perioden."
        actions={<><ExcelBtn /><PdfBtn /></>}>
        <DateRange from={bov_from} to={bov_to} onFromChange={setBovFrom} onToChange={setBovTo} />
      </ReportCard>

      <ReportCard title="Kunder med lektionssaldo"
        description="Kunder med innestående lektionssaldo."
        actions={<><ExcelBtn /><PdfBtn /></>}>
        <DateField label="Datum" value={f3date} onChange={setF3Date} />
      </ReportCard>

      <ReportCard title="Omsättning lektionssaldo"
        description="Hur lektionssaldon har omsatts under ett specifikt tidsintervall."
        actions={<PdfBtn />}>
        <DateRange from={f4from} to={f4to} onFromChange={setF4From} onToChange={setF4To} />
      </ReportCard>

      <ReportCard title="Kunder med elevsaldo"
        description="Kunder med elevsaldo av de valda typerna."
        actions={<><ExcelBtn /><PdfBtn /></>}>
        <SelectInput label="Typ" value={f5type} onChange={setF5Type} options={balanceOpts} />
        <DateRange from={f5from} to={f5to} onFromChange={setF5From} onToChange={setF5To} />
      </ReportCard>

      <ReportCard title="Momsdifferens för elevsaldo"
        description="Beräkningar för momsdifferens relaterat till elevsaldo."
        actions={<ExcelBtn />}>
        <DateRange from={f6from} to={f6to} onFromChange={setF6From} onToChange={setF6To} />
      </ReportCard>

      <ReportCard title="Artiklar" description="Alla dina artiklar."
        actions={<><ExcelBtn /><PdfBtn /></>} />

      <ReportCard title="Sålda artiklar"
        description="Sålda artiklar för en given tidsperiod."
        actions={<ExcelBtn />}>
        <DateRange from={f7from} to={f7to} onFromChange={setF7From} onToChange={setF7To} />
      </ReportCard>

      <ReportCard title="Momsberäkning"
        description="Beräkningar som kan användas vid momsredovisning."
        actions={<ExcelBtn />}>
        <DateRange from={f8from} to={f8to} onFromChange={setF8From} onToChange={setF8To} />
      </ReportCard>

      <ReportCard title="Lärarens tidsluckor"
        description="Värdet av tidsluckor för en specifik lärare."
        actions={<PdfBtn />}>
        <SelectInput label="Lärare" value={f10inst} onChange={setF10Inst} options={instructorOpts} />
        <DateRange from={f10from} to={f10to} onFromChange={setF10From} onToChange={setF10To} />
      </ReportCard>

      <ReportCard title="Försäljning per produkt"
        description="Excel-rapport med alla sålda produkter, antal sålda och summa per produkt."
        actions={<ExcelBtn />}>
        <DateRange from={f11from} to={f11to} onFromChange={setF11From} onToChange={setF11To} />
      </ReportCard>

      {/* ── New reports ──────────────────────────────────────────────────────── */}

      <ReportCard title="Daglig avräkning kontantfaktura"
        description="Avräkning av kontantfakturor per dag med betalningsmetod och totalbelopp."
        actions={<><ExcelBtn /><PdfBtn /></>}>
        <DateField label="Datum" value={dag_date} onChange={setDagDate} />
      </ReportCard>

      <ReportCard title="Debiterat ej fakturerat"
        description="Kunder som har debiterade belopp som ännu inte fakturerats."
        actions={<ExcelBtn />}>
        <DateRange from={deb_from} to={deb_to} onFromChange={setDebFrom} onToChange={setDebTo} />
      </ReportCard>

      <ReportCard title="Elever med positiv balans"
        description="Lista över elever som har ett positivt saldo på sitt konto."
        actions={<ExcelBtn />}>
        <DateField label="Datum" value={pos_date} onChange={setPosDate} />
      </ReportCard>

      <ReportCard title="Elever utan aktivitet med innestående paket"
        description="Elever som inte haft aktivitet under vald period men fortfarande har paket kvar."
        actions={<ExcelBtn />}>
        <SelectInput
          label="Inaktiv sedan"
          value={inakt_days}
          onChange={setInaktDays}
          options={inaktDayOpts}
        />
      </ReportCard>

      <ReportCard title="Fakturaöversikt"
        description="Sammanfattning av alla fakturor för perioden med belopp och betalningsstatus."
        actions={<><ExcelBtn /><PdfBtn /></>}>
        <DateRange from={fakt_from} to={fakt_to} onFromChange={setFaktFrom} onToChange={setFaktTo} />
      </ReportCard>

      <ReportCard title="Förlust på fordran"
        description="Förlorade fordringar – fakturor som avskrivits under perioden."
        actions={<ExcelBtn />}>
        <DateRange from={forl_from} to={forl_to} onFromChange={setForlFrom} onToChange={setForlTo} />
      </ReportCard>

      <ReportCard title="Paketförsäljningsöversikt"
        description="Översikt av sålda paket per typ och period med antal och totalt belopp."
        actions={<><ExcelBtn /><PdfBtn /></>}>
        <DateRange from={pak_from} to={pak_to} onFromChange={setPakFrom} onToChange={setPakTo} />
      </ReportCard>

      <ReportCard title="Personliga aktiviteter"
        description="Aktiviteter per lärare — bokningar, avbokningar och genomförda lektioner."
        actions={<ExcelBtn />}>
        <SelectInput label="Lärare" value={pers_inst} onChange={setPersInst} options={instructorOpts} />
        <DateRange from={pers_from} to={pers_to} onFromChange={setPersFrom} onToChange={setPersto} />
      </ReportCard>

      <ReportCard title="Raderade försäljningar/betalningar"
        description="Logg över raderade försäljningar och betalningar under perioden."
        actions={<ExcelBtn />}>
        <DateRange from={rad_from} to={rad_to} onFromChange={setRadFrom} onToChange={setRadTo} />
      </ReportCard>

    </div>
  );
}
