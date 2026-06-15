import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Search, FileDown, FileText, FileCode2 } from 'lucide-react';
import { supabase } from '@core/api/supabase.js';
import { Button, Skeleton, toast } from '@platform/ui';
import {
  ReportCard, ExcelBtn, PdfBtn, OpenBtn,
  DateRange, DateField, SelectInput, reportToast,
} from '../components/ReportCard.js';
import { cn } from '@/lib/utils.js';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function today()      { return new Date().toISOString().slice(0, 10); }
function monthStart() { return today().slice(0, 8) + '01'; }
function ago(d: number) { const dt = new Date(); dt.setDate(dt.getDate() - d); return dt.toISOString().slice(0, 10); }

const DATE_FMT = new Intl.DateTimeFormat('sv-SE', { dateStyle: 'short', timeStyle: 'short' });

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

function CsvBtn({ onClick = reportToast }: { onClick?: () => void }) {
  return (
    <button
      onClick={onClick}
      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border text-xs font-medium transition-colors
        border-sky-200 text-sky-700 bg-sky-50 hover:bg-sky-100
        dark:border-sky-800 dark:text-sky-300 dark:bg-sky-950/40 dark:hover:bg-sky-900/60"
    >
      <FileText className="w-3.5 h-3.5" />
      CSV
    </button>
  );
}

function SieBtn({ label = 'SIE', onClick = reportToast }: { label?: string; onClick?: () => void }) {
  return (
    <button
      onClick={onClick}
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
  // SIE export tool state
  const [sieFrom,    setSieFrom]    = useState(monthStart());
  const [sieTo,      setSieTo]      = useState(today());
  const [startVer,   setStartVer]   = useState('');
  const [endVer,     setEndVer]     = useState('');

  // Report card states — Försäljning
  const [fs_d_from,  setFsDFrom]  = useState(monthStart());
  const [fs_d_to,    setFsDTo]    = useState(today());
  const [fs_o_from,  setFsOFrom]  = useState(monthStart());
  const [fs_o_to,    setFsOTo]    = useState(today());
  const [int_from,   setIntFrom]  = useState(monthStart());
  const [int_to,     setIntTo]    = useState(today());

  // Report card states — Kundfordringar
  const [kfp_from,  setKfpFrom]  = useState(monthStart());
  const [kfp_to,    setKfpTo]    = useState(today());
  const [kfd_date,  setKfdDate]  = useState(today());

  // Report card states — Moms
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

  // Report card states — Verifikat
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

  return (
    <div className="space-y-8">

      {/* ── Report cards ────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 xl:grid-cols-3 gap-4">

        <SectionHeading title="Försäljning & intäkter" />

        <ReportCard title="Försäljningsdetaljer (producerat)"
          description="Detaljerade försäljningsrader för producerade tjänster och varor under perioden."
          actions={<><ExcelBtn /><PdfBtn /></>}>
          <DateRange from={fs_d_from} to={fs_d_to} onFromChange={setFsDFrom} onToChange={setFsDTo} />
        </ReportCard>

        <ReportCard title="Försäljningsöversikt (producerat)"
          description="Summerad försäljning per artikel och kategori för producerade tjänster under perioden."
          actions={<><ExcelBtn /><PdfBtn /></>}>
          <DateRange from={fs_o_from} to={fs_o_to} onFromChange={setFsOFrom} onToChange={setFsOTo} />
        </ReportCard>

        <ReportCard title="Intäktsfört i perioden"
          description="Bokförd intäkt som tillhör perioden — underlag för periodiserad redovisning."
          actions={<ExcelBtn />}>
          <DateRange from={int_from} to={int_to} onFromChange={setIntFrom} onToChange={setIntTo} />
        </ReportCard>

        <SectionHeading title="Kundfordringar" />

        <ReportCard title="Kundfordringar i perioden"
          description="Alla öppna fordringar skapade under perioden med förfallodatum och belopp."
          actions={<ExcelBtn />}>
          <DateRange from={kfp_from} to={kfp_to} onFromChange={setKfpFrom} onToChange={setKfpTo} />
        </ReportCard>

        <ReportCard title="Kundfordringar per datum"
          description="Utestående kundfordringar per valt datum — äldsta-till-nyaste ordning."
          actions={<><ExcelBtn /><PdfBtn /></>}>
          <DateField label="Datum" value={kfd_date} onChange={setKfdDate} />
        </ReportCard>

        <SectionHeading title="Moms" />

        <ReportCard title="Moms i perioden"
          description="Sammanställning av utgående och ingående moms under perioden, uppdelat per momssats."
          actions={<><ExcelBtn /><PdfBtn /></>}>
          <DateRange from={moms_from} to={moms_to} onFromChange={setMomsFrom} onToChange={setMomsTo} />
        </ReportCard>

        <ReportCard title="Momsrapport - Faktura"
          description="Momsunderlag baserat på faktureringsmetoden med fakturanummer och momsbelopp."
          actions={<><ExcelBtn /><PdfBtn /></>}>
          <DateRange from={mr_from} to={mr_to} onFromChange={setMrFrom} onToChange={setMrTo} />
        </ReportCard>

        <ReportCard title="Momsat förskott i perioden"
          description="Förskottsbetalningar med moms mottagna under perioden, underlag för skattedeklaration."
          actions={<ExcelBtn />}>
          <DateRange from={mfp_from} to={mfp_to} onFromChange={setMfpFrom} onToChange={setMfpTo} />
        </ReportCard>

        <ReportCard title="Momsat förskott per datum"
          description="Utestående momspliktiga förskott per valt datum."
          actions={<ExcelBtn />}>
          <DateField label="Datum" value={mfd_date} onChange={setMfdDate} />
        </ReportCard>

        <ReportCard title="Omomsat förskott i perioden"
          description="Förskottsbetalningar utan moms (ej momspliktigt) mottagna under perioden."
          actions={<ExcelBtn />}>
          <DateRange from={omfp_from} to={omfp_to} onFromChange={setOmfpFrom} onToChange={setOmfpTo} />
        </ReportCard>

        <ReportCard title="Omomsat förskott per datum"
          description="Utestående icke-momspliktiga förskott per valt datum."
          actions={<ExcelBtn />}>
          <DateField label="Datum" value={omfd_date} onChange={setOmfdDate} />
        </ReportCard>

        <SectionHeading title="Verifikat & export" />

        <ReportCard title="Summering av verifikat"
          description="Summerad kontolista med debet- och kredittotaler för alla verifikat i perioden."
          actions={<><ExcelBtn /><PdfBtn /></>}>
          <DateRange from={sum_from} to={sum_to} onFromChange={setSumFrom} onToChange={setSumTo} />
        </ReportCard>

        <ReportCard title="Undertecknade dokument"
          description="Lista över alla digitalt undertecknade avtal och dokument under perioden."
          actions={<ExcelBtn />}>
          <DateRange from={und_from} to={und_to} onFromChange={setUndFrom} onToChange={setUndTo} />
        </ReportCard>

        <ReportCard title="Verifikationer (CSV)"
          description="Export av alla verifikat i CSV-format för import till externa bokföringsprogram."
          actions={<CsvBtn />}>
          <DateRange from={csv_from} to={csv_to} onFromChange={setCsvFrom} onToChange={setCsvTo} />
        </ReportCard>

        <ReportCard title="Verifikationer (SIE)"
          description="SIE 4-fil med alla verifikat — kan importeras direkt till bokföringsprogram."
          actions={<SieBtn />}>
          <DateRange from={sie_from} to={sie_to} onFromChange={setSieRFrom} onToChange={setSieRTo} />
        </ReportCard>

        <ReportCard title="Verifikationer dagsnivå (SIE)"
          description="SIE 4-fil med dagssummering — ett verifikat per dag i stället för per transaktion."
          actions={<SieBtn label="SIE (dag)" />}>
          <DateRange from={sie_dg_from} to={sie_dg_to} onFromChange={setSieDgFrom} onToChange={setSieDgTo} />
        </ReportCard>

      </div>

      {/* ── SIE export search tool ───────────────────────────────────────────── */}
      <div className="space-y-4">
        <h2 className="text-sm font-semibold text-foreground border-b border-border pb-2">
          SIE-exportlogg
        </h2>

        {/* Filter toolbar */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1">
            <span className="text-xs text-muted-foreground shrink-0">Från:</span>
            <input type="date" value={sieFrom} onChange={(e) => setSieFrom(e.target.value)} className={inputCls + ' w-36'} />
          </div>
          <div className="flex items-center gap-1">
            <span className="text-xs text-muted-foreground shrink-0">Till:</span>
            <input type="date" value={sieTo}   onChange={(e) => setSieTo(e.target.value)}   className={inputCls + ' w-36'} />
          </div>
          <input
            type="text"
            placeholder="Start verifikationsnummer"
            value={startVer}
            onChange={(e) => setStartVer(e.target.value)}
            className={inputCls + ' w-44'}
          />
          <input
            type="text"
            placeholder="Slut verifikationsnummer"
            value={endVer}
            onChange={(e) => setEndVer(e.target.value)}
            className={inputCls + ' w-44'}
          />
          <Button variant="outline" size="sm"
            onClick={() => toast({ title: 'Söker verifikat…', description: 'Filtret tillämpas.' })}
            className="h-9 gap-1.5">
            <Search className="w-4 h-4" />
            Sök
          </Button>
          <Button variant="outline" size="sm" disabled className="h-9 gap-1.5 opacity-40">
            Förhandsgranska
          </Button>
          <Button size="sm"
            onClick={() => toast({ title: 'Förbereder SIE 4-export…', description: 'Filen genereras och laddas ned snart.' })}
            className="h-9 gap-1.5">
            <FileDown className="w-4 h-4" />
            Exportera SIE
          </Button>
        </div>

        <p className="text-sm text-muted-foreground">
          Välj ett start- och slutdatum för att filtrera verifikat. Du kan även filtrera
          på start- och slutverifikationsnummer.
        </p>

        {/* Recent SIE exports table */}
        <div className="space-y-2">
          <p className="text-sm font-semibold text-primary">20 senaste exporterade SIE-filer</p>
          <div className="rounded-lg border border-border bg-card overflow-hidden">
            {isLoading ? (
              <div className="p-4 space-y-2">
                {[1, 2, 3].map((i) => <Skeleton key={i} className="h-10 rounded" />)}
              </div>
            ) : exports.length === 0 ? (
              <div className="px-4 py-8 text-center">
                <p className="text-sm text-muted-foreground">Inga loggar hittades</p>
              </div>
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
                        {exp.period_from && exp.period_to
                          ? `${exp.period_from} – ${exp.period_to}` : '–'}
                      </td>
                      <td className="px-4 py-2.5">
                        <span className="text-xs font-medium text-green-700 dark:text-green-400">
                          {exp.status ?? 'klar'}
                        </span>
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
