import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@core/api/supabase.js';
import { toast } from '@platform/ui';
import {
  ReportCard, ExcelBtn, PdfBtn,
  DateRange, SelectInput,
  csvDownload, printReport,
} from '../components/ReportCard.js';

function today()      { return new Date().toISOString().slice(0, 10); }
function monthStart() { return today().slice(0, 8) + '01'; }
function ago(d: number) { const dt = new Date(); dt.setDate(dt.getDate() - d); return dt.toISOString().slice(0, 10); }
function dateFmt(s: unknown) { return s ? new Date(s as string).toLocaleDateString('sv-SE') : ''; }
function cur(n: unknown) { return n == null ? '' : Number(n).toFixed(2); }

interface InstructorRef { id: string; first_name: string; last_name: string; }

function useInstructorOpts() {
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

async function runExport(fetcher: () => Promise<Record<string, unknown>[]>, filename: string) {
  toast({ title: 'Förbereder export…', description: 'Hämtar data.' });
  try { csvDownload(await fetcher(), filename); }
  catch { toast({ title: 'Export misslyckades', variant: 'destructive' }); }
}

export function KunderRapportPage() {
  const [kunder1,       setKunder1]     = useState('all');
  const [kunder2cat,    setKunder2Cat]  = useState('all');
  const [kunder2perm,   setKunder2Perm] = useState('B');
  const [kunder3cat,    setKunder3Cat]  = useState('all');
  const [kunder3mat,    setKunder3Mat]  = useState('b-korkort');
  const [prov1from,     setProv1From]   = useState(monthStart());
  const [prov1to,       setProv1To]     = useState(today());
  const [provInst,      setProvInst]    = useState('all');
  const [elevOv_cat,    setElevOvCat]   = useState('all');
  const [elevOv_inst,   setElevOvInst]  = useState('all');
  const [nyaElev_from,  setNyaElevFrom] = useState(ago(30));
  const [nyaElev_to,    setNyaElevTo]   = useState(today());
  const [nyaBeh_from,   setNyaBehFrom]  = useState(ago(30));
  const [nyaBeh_to,     setNyaBehTo]    = useState(today());
  const [nyaBeh_perm,   setNyaBehPerm]  = useState('all');
  const [obl_perm,      setOblPerm]     = useState('all');
  const [korp_from,     setKorpFrom]    = useState(monthStart());
  const [korp_to,       setKorpTo]      = useState(today());
  const [korp_inst,     setKorpInst]    = useState('all');
  const [korpteori_from, setKorpTeoriFrom] = useState(monthStart());
  const [korpteori_to,   setKorpTeoriTo]   = useState(today());

  const instructorOpts = useInstructorOpts();

  const customerOpts = [
    { value: 'all', label: 'Alla kunder' }, { value: 'active', label: 'Aktiva' },
    { value: 'inactive', label: 'Inaktiva' }, { value: 'archived', label: 'Arkiverade' },
  ];
  const permOpts = [
    { value: 'all', label: 'Alla behörigheter' }, { value: 'AM', label: 'AM' },
    { value: 'A1', label: 'A1' }, { value: 'A2', label: 'A2' }, { value: 'A', label: 'A' },
    { value: 'B', label: 'B' }, { value: 'C', label: 'C' }, { value: 'CE', label: 'CE' }, { value: 'D', label: 'D' },
  ];
  const matOpts = [
    { value: 'b-korkort', label: 'B-körkort' }, { value: 'a-korkort', label: 'A-körkort' },
    { value: 'am-korkort', label: 'AM-körkort' }, { value: 'be-korkort', label: 'BE-körkort' },
    { value: 'c-korkort', label: 'C-körkort' },
  ];

  const exportKunder = () => void runExport(async () => {
    let q = supabase.from('students')
      .select('first_name, last_name, email, phone, status, credit_balance, created_at')
      .is('deleted_at', null).order('last_name');
    if (kunder1 !== 'all') q = q.eq('status', kunder1);
    const { data } = await q.limit(5000);
    return (data ?? []).map((r: Record<string, unknown>) => ({
      'Förnamn': r['first_name'] ?? '', 'Efternamn': r['last_name'] ?? '',
      'E-post': r['email'] ?? '', 'Telefon': r['phone'] ?? '',
      'Status': r['status'] ?? '', 'Saldo (kr)': cur(r['credit_balance']), 'Skapad': dateFmt(r['created_at']),
    })) as Record<string, unknown>[];
  }, `kunder_${kunder1}`);

  const exportKunderBeh = () => void runExport(async () => {
    let q = supabase.from('students')
      .select('first_name, last_name, email, phone, status, driving_permits')
      .is('deleted_at', null).order('last_name');
    if (kunder2cat !== 'all') q = q.eq('status', kunder2cat);
    const { data } = await q.limit(5000);
    const perm = kunder2perm;
    return ((data ?? []) as Array<Record<string, unknown>>)
      .filter((r) => perm === 'all' || (Array.isArray(r['driving_permits']) && (r['driving_permits'] as string[]).includes(perm)))
      .map((r) => ({ 'Förnamn': r['first_name'] ?? '', 'Efternamn': r['last_name'] ?? '', 'E-post': r['email'] ?? '', 'Telefon': r['phone'] ?? '', 'Status': r['status'] ?? '' })) as Record<string, unknown>[];
  }, `kunder_behorighet_${kunder2perm}`);

  const exportKunderMat = () => void runExport(async () => {
    let q = supabase.from('students').select('first_name, last_name, email, status').is('deleted_at', null);
    if (kunder3cat !== 'all') q = q.eq('status', kunder3cat);
    const { data } = await q.limit(2000);
    return (data ?? []).map((r: Record<string, unknown>) => ({ 'Förnamn': r['first_name'] ?? '', 'Efternamn': r['last_name'] ?? '', 'E-post': r['email'] ?? '', 'Status': r['status'] ?? '' })) as Record<string, unknown>[];
  }, `kunder_teorimaterial_${kunder3mat}`);

  const exportProvstatistik = () => void runExport(async () => {
    let q = supabase.from('lesson_bookings')
      .select('attendance_status, lesson_slots(starts_at, lesson_types(name), instructors(first_name, last_name)), students(first_name, last_name)')
      .gte('lesson_slots.starts_at', prov1from).lte('lesson_slots.starts_at', prov1to + 'T23:59:59').limit(2000);
    if (provInst !== 'all') q = q.eq('lesson_slots.instructor_id', provInst);
    const { data } = await q;
    return (data ?? []).map((r: Record<string, unknown>) => {
      const slot = r['lesson_slots'] as Record<string, unknown> | null;
      const lt   = slot?.['lesson_types'] as Record<string, unknown> | null;
      const inst = slot?.['instructors']  as Record<string, unknown> | null;
      const std  = r['students']          as Record<string, unknown> | null;
      return { 'Elev': std ? `${std['first_name'] ?? ''} ${std['last_name'] ?? ''}`.trim() : '',
        'Lärare': inst ? `${inst['first_name'] ?? ''} ${inst['last_name'] ?? ''}`.trim() : '',
        'Provtyp': lt?.['name'] ?? '', 'Datum': dateFmt(slot?.['starts_at']), 'Resultat': r['attendance_status'] ?? '' };
    }) as Record<string, unknown>[];
  }, `provstatistik_${prov1from}_${prov1to}`);

  const exportMissadeExam = () => void runExport(async () => {
    const { data } = await supabase.from('lesson_bookings')
      .select('lesson_slots(starts_at, lesson_types(name)), students(first_name, last_name)')
      .eq('status', 'confirmed').is('attendance_status', null)
      .lt('lesson_slots.starts_at', today()).limit(1000);
    return (data ?? []).map((r: Record<string, unknown>) => {
      const slot = r['lesson_slots'] as Record<string, unknown> | null;
      const lt   = slot?.['lesson_types'] as Record<string, unknown> | null;
      const std  = r['students']          as Record<string, unknown> | null;
      return { 'Elev': std ? `${std['first_name'] ?? ''} ${std['last_name'] ?? ''}`.trim() : '', 'Typ': lt?.['name'] ?? '', 'Datum': dateFmt(slot?.['starts_at']) };
    }) as Record<string, unknown>[];
  }, 'missade_examinationsmoment');

  const exportElevöversikt = () => void runExport(async () => {
    let q = supabase.from('students')
      .select('first_name, last_name, email, phone, status, credit_balance, created_at')
      .is('deleted_at', null).order('last_name');
    if (elevOv_cat !== 'all') q = q.eq('status', elevOv_cat);
    const { data } = await q.limit(5000);
    return (data ?? []).map((r: Record<string, unknown>) => ({ 'Förnamn': r['first_name'] ?? '', 'Efternamn': r['last_name'] ?? '', 'E-post': r['email'] ?? '', 'Telefon': r['phone'] ?? '', 'Status': r['status'] ?? '', 'Saldo (kr)': cur(r['credit_balance']), 'Skapad': dateFmt(r['created_at']) })) as Record<string, unknown>[];
  }, 'elevöversikt');

  const exportElevöversiktPdf = () => void (async () => {
    toast({ title: 'Förbereder PDF…' });
    try {
      let q = supabase.from('students').select('first_name, last_name, email, status').is('deleted_at', null).order('last_name');
      if (elevOv_cat !== 'all') q = q.eq('status', elevOv_cat);
      const { data } = await q.limit(500);
      printReport('Elevöversikt', ['Elev', 'E-post', 'Status'],
        (data ?? []).map((r: Record<string, unknown>) => [`${r['first_name'] ?? ''} ${r['last_name'] ?? ''}`.trim(), r['email'] ?? '', r['status'] ?? '']));
    } catch { toast({ title: 'Export misslyckades', variant: 'destructive' }); }
  })();

  const exportNyaElever = () => void runExport(async () => {
    const { data } = await supabase.from('students')
      .select('first_name, last_name, email, phone, status, created_at').is('deleted_at', null)
      .gte('created_at', nyaElev_from).lte('created_at', nyaElev_to + 'T23:59:59')
      .order('created_at', { ascending: false }).limit(2000);
    return (data ?? []).map((r: Record<string, unknown>) => ({ 'Förnamn': r['first_name'] ?? '', 'Efternamn': r['last_name'] ?? '', 'E-post': r['email'] ?? '', 'Telefon': r['phone'] ?? '', 'Status': r['status'] ?? '', 'Registrerad': dateFmt(r['created_at']) })) as Record<string, unknown>[];
  }, `nya_elever_${nyaElev_from}_${nyaElev_to}`);

  const exportNyaElevPdf = () => void (async () => {
    toast({ title: 'Förbereder PDF…' });
    try {
      const { data } = await supabase.from('students').select('first_name, last_name, email, created_at').is('deleted_at', null)
        .gte('created_at', nyaElev_from).lte('created_at', nyaElev_to + 'T23:59:59').order('created_at', { ascending: false }).limit(500);
      printReport(`Nya elever ${nyaElev_from} – ${nyaElev_to}`, ['Elev', 'E-post', 'Registrerad'],
        (data ?? []).map((r: Record<string, unknown>) => [`${r['first_name'] ?? ''} ${r['last_name'] ?? ''}`.trim(), r['email'] ?? '', dateFmt(r['created_at'])]));
    } catch { toast({ title: 'Export misslyckades', variant: 'destructive' }); }
  })();

  const exportNyaBeh = () => void runExport(async () => {
    const { data } = await supabase.from('students')
      .select('first_name, last_name, email, driving_permits, created_at').is('deleted_at', null)
      .gte('created_at', nyaBeh_from).lte('created_at', nyaBeh_to + 'T23:59:59')
      .order('created_at', { ascending: false }).limit(2000);
    const perm = nyaBeh_perm;
    return ((data ?? []) as Array<Record<string, unknown>>)
      .filter((r) => perm === 'all' || (Array.isArray(r['driving_permits']) && (r['driving_permits'] as string[]).includes(perm)))
      .map((r) => ({ 'Förnamn': r['first_name'] ?? '', 'Efternamn': r['last_name'] ?? '', 'E-post': r['email'] ?? '', 'Behörigheter': Array.isArray(r['driving_permits']) ? (r['driving_permits'] as string[]).join(', ') : '', 'Registrerad': dateFmt(r['created_at']) })) as Record<string, unknown>[];
  }, `nya_behörigheter_${nyaBeh_from}_${nyaBeh_to}`);

  const exportObl = () => void runExport(async () => {
    const { data } = await supabase.from('students')
      .select('first_name, last_name, email, phone, status, driving_permits')
      .is('deleted_at', null).eq('status', 'active').order('last_name').limit(2000);
    return (data ?? []).map((r: Record<string, unknown>) => ({ 'Förnamn': r['first_name'] ?? '', 'Efternamn': r['last_name'] ?? '', 'E-post': r['email'] ?? '', 'Telefon': r['phone'] ?? '', 'Behörigheter': Array.isArray(r['driving_permits']) ? (r['driving_permits'] as string[]).join(', ') : '' })) as Record<string, unknown>[];
  }, 'obligatorisk_utbildning');

  const exportOblPdf = () => void (async () => {
    toast({ title: 'Förbereder PDF…' });
    try {
      const { data } = await supabase.from('students').select('first_name, last_name, email, driving_permits').is('deleted_at', null).eq('status', 'active').limit(500);
      printReport('Obligatorisk utbildning', ['Elev', 'E-post', 'Behörigheter'],
        (data ?? []).map((r: Record<string, unknown>) => [`${r['first_name'] ?? ''} ${r['last_name'] ?? ''}`.trim(), r['email'] ?? '', Array.isArray(r['driving_permits']) ? (r['driving_permits'] as string[]).join(', ') : '']));
    } catch { toast({ title: 'Export misslyckades', variant: 'destructive' }); }
  })();

  const exportKörprov = () => void runExport(async () => {
    let q = supabase.from('lesson_bookings')
      .select('attendance_status, lesson_slots(instructors(first_name, last_name))')
      .gte('lesson_slots.starts_at', korp_from).lte('lesson_slots.starts_at', korp_to + 'T23:59:59').limit(2000);
    if (korp_inst !== 'all') q = q.eq('lesson_slots.instructor_id', korp_inst);
    const { data } = await q;
    const m: Record<string, { total: number; passed: number }> = {};
    for (const r of (data ?? []) as Array<Record<string, unknown>>) {
      const inst = (r['lesson_slots'] as Record<string, unknown> | null)?.['instructors'] as Record<string, unknown> | null;
      const k = inst ? `${inst['first_name'] ?? ''} ${inst['last_name'] ?? ''}`.trim() : 'Okänd';
      if (!m[k]) m[k] = { total: 0, passed: 0 };
      m[k]!.total++;
      if (r['attendance_status'] === 'attended') m[k]!.passed++;
    }
    return Object.entries(m).map(([n, v]) => ({ 'Lärare': n, 'Totalt': v.total, 'Godkänt': v.passed, 'Andel godkänd': v.total > 0 ? `${((v.passed / v.total) * 100).toFixed(0)}%` : '0%' })) as Record<string, unknown>[];
  }, `körprov_${korp_from}_${korp_to}`);

  const exportKörprovPdf = () => void (async () => {
    toast({ title: 'Förbereder PDF…' });
    try {
      let q = supabase.from('lesson_bookings')
        .select('attendance_status, lesson_slots(instructors(first_name, last_name))')
        .gte('lesson_slots.starts_at', korp_from).lte('lesson_slots.starts_at', korp_to + 'T23:59:59').limit(2000);
      if (korp_inst !== 'all') q = q.eq('lesson_slots.instructor_id', korp_inst);
      const { data } = await q;
      const m: Record<string, { total: number; passed: number }> = {};
      for (const r of (data ?? []) as Array<Record<string, unknown>>) {
        const inst = (r['lesson_slots'] as Record<string, unknown> | null)?.['instructors'] as Record<string, unknown> | null;
        const k = inst ? `${inst['first_name'] ?? ''} ${inst['last_name'] ?? ''}`.trim() : 'Okänd';
        if (!m[k]) m[k] = { total: 0, passed: 0 };
        m[k]!.total++;
        if (r['attendance_status'] === 'attended') m[k]!.passed++;
      }
      printReport(`Körprov (andel godkänd) ${korp_from} – ${korp_to}`, ['Lärare', 'Totalt', 'Godkänt', 'Andel'],
        Object.entries(m).map(([n, v]) => [n, v.total, v.passed, v.total > 0 ? `${((v.passed / v.total) * 100).toFixed(0)}%` : '0%']));
    } catch { toast({ title: 'Export misslyckades', variant: 'destructive' }); }
  })();

  const exportKörprovTeori = () => void runExport(async () => {
    const { data } = await supabase.from('lesson_bookings')
      .select('attendance_status, lesson_slots(starts_at, lesson_types(name)), students(first_name, last_name)')
      .gte('lesson_slots.starts_at', korpteori_from).lte('lesson_slots.starts_at', korpteori_to + 'T23:59:59').limit(2000);
    return (data ?? []).map((r: Record<string, unknown>) => {
      const slot = r['lesson_slots'] as Record<string, unknown> | null;
      const lt   = slot?.['lesson_types'] as Record<string, unknown> | null;
      const std  = r['students']          as Record<string, unknown> | null;
      return { 'Elev': std ? `${std['first_name'] ?? ''} ${std['last_name'] ?? ''}`.trim() : '', 'Provtyp': lt?.['name'] ?? '', 'Datum': dateFmt(slot?.['starts_at']), 'Resultat': r['attendance_status'] ?? '' };
    }) as Record<string, unknown>[];
  }, `körprov_teoriprov_${korpteori_from}_${korpteori_to}`);

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">

      <ReportCard title="Kunder" description="Dina kunduppgifter."
        actions={<ExcelBtn onClick={exportKunder} />}>
        <SelectInput value={kunder1} onChange={setKunder1} options={customerOpts} />
      </ReportCard>

      <ReportCard title="Kunder per behörighet" description="Kunder som har en specifik behörighet."
        actions={<ExcelBtn onClick={exportKunderBeh} />}>
        <SelectInput value={kunder2cat} onChange={setKunder2Cat} options={customerOpts} />
        <SelectInput value={kunder2perm} onChange={setKunder2Perm} options={permOpts} />
      </ReportCard>

      <ReportCard title="Kunder per teorimaterial"
        description="Kunder som har tillgång till ett specifikt teorimaterial."
        actions={<ExcelBtn onClick={exportKunderMat} />}>
        <SelectInput value={kunder3cat} onChange={setKunder3Cat} options={customerOpts} />
        <SelectInput value={kunder3mat} onChange={setKunder3Mat} options={matOpts} />
      </ReportCard>

      <ReportCard title="Provstatistik"
        description="Provstatistik från examinationsmoment baserat på behörighet."
        actions={<ExcelBtn onClick={exportProvstatistik} />}>
        <DateRange from={prov1from} to={prov1to} onFromChange={setProv1From} onToChange={setProv1To} />
        <SelectInput label="Lärare" value={provInst} onChange={setProvInst} options={instructorOpts} />
      </ReportCard>

      <ReportCard title="Missade examinationsmoment"
        description="Examinationsmoment som har utförts, men inte blivit bedömda."
        actions={<ExcelBtn onClick={exportMissadeExam} />} />

      <ReportCard title="Elevöversikt"
        description="Fullständig översikt av alla elever med status, behörighet och tilldelad lärare."
        actions={<><ExcelBtn onClick={exportElevöversikt} /><PdfBtn onClick={exportElevöversiktPdf} /></>}>
        <SelectInput label="Status" value={elevOv_cat} onChange={setElevOvCat} options={customerOpts} />
        <SelectInput label="Lärare" value={elevOv_inst} onChange={setElevOvInst} options={instructorOpts} />
      </ReportCard>

      <ReportCard title="Nya elever"
        description="Elever som registrerades under den valda perioden."
        actions={<><ExcelBtn onClick={exportNyaElever} /><PdfBtn onClick={exportNyaElevPdf} /></>}>
        <DateRange from={nyaElev_from} to={nyaElev_to} onFromChange={setNyaElevFrom} onToChange={setNyaElevTo} />
      </ReportCard>

      <ReportCard title="Nya elevbehörigheter"
        description="Behörigheter som lades till för elever under perioden."
        actions={<ExcelBtn onClick={exportNyaBeh} />}>
        <SelectInput label="Behörighet" value={nyaBeh_perm} onChange={setNyaBehPerm} options={permOpts} />
        <DateRange from={nyaBeh_from} to={nyaBeh_to} onFromChange={setNyaBehFrom} onToChange={setNyaBehTo} />
      </ReportCard>

      <ReportCard title="Obligatorisk utbildning"
        description="Elever som har obligatoriska utbildningsmoment (Risk 1, Risk 2, Första hjälpen) som saknas."
        actions={<><ExcelBtn onClick={exportObl} /><PdfBtn onClick={exportOblPdf} /></>}>
        <SelectInput label="Behörighet" value={obl_perm} onChange={setOblPerm} options={permOpts} />
      </ReportCard>

      <ReportCard title="Körprov (procentandel godkänd)"
        description="Andelen godkända körprov per lärare och period. Nyckeltal för utbildningskvalitet."
        actions={<><ExcelBtn onClick={exportKörprov} /><PdfBtn onClick={exportKörprovPdf} /></>}>
        <SelectInput label="Lärare" value={korp_inst} onChange={setKorpInst} options={instructorOpts} />
        <DateRange from={korp_from} to={korp_to} onFromChange={setKorpFrom} onToChange={setKorpTo} />
      </ReportCard>

      <ReportCard title="Körprov/Teoriprov"
        description="Sammanfattning av alla körprovs- och teoriprovstillfällen med resultat under perioden."
        actions={<ExcelBtn onClick={exportKörprovTeori} />}>
        <DateRange from={korpteori_from} to={korpteori_to} onFromChange={setKorpTeoriFrom} onToChange={setKorpTeoriTo} />
      </ReportCard>

    </div>
  );
}
