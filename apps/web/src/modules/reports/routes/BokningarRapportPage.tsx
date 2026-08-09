import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@core/api/supabase.js';
import { toast } from '@platform/ui';
import {
  ReportCard, ExcelBtn, PdfBtn, OpenBtn, SegmentBtn,
  DateRange, DateField, SelectInput,
  csvDownload, printReport,
} from '../components/ReportCard.js';
import { useLessonTypes } from '../../scheduling/hooks/useLessonTypes.js';

function today()    { return new Date().toISOString().slice(0, 10); }
function ago(d: number) { const dt = new Date(); dt.setDate(dt.getDate() - d); return dt.toISOString().slice(0, 10); }
function dateFmt(s: unknown) { return s ? new Date(s as string).toLocaleString('sv-SE') : ''; }

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

export function BokningarRapportPage() {
  const [b1inst, setB1Inst] = useState('all');
  const [b1date, setB1Date] = useState(today());
  const [b2from, setB2From] = useState('2025-07-01');
  const [b2to,   setB2To]   = useState('2026-06-01');
  const [b3lt,   setB3Lt]   = useState('all');
  const [b4from, setB4From] = useState(ago(30));
  const [b4to,   setB4To]   = useState(today());

  const [dag_date, setDagDate]  = useState(today());
  const [dag_inst, setDagInst]  = useState('all');
  const [prod_l_from, setProdLFrom] = useState(ago(30));
  const [prod_l_to,   setProdLTo]   = useState(today());
  const [prod_l_inst, setProdLInst] = useState('all');
  const [prod_r_from, setProdRFrom] = useState(ago(30));
  const [prod_r_to,   setProdRTo]   = useState(today());
  const [prod_u_from, setProdUFrom] = useState(ago(30));
  const [prod_u_to,   setProdUTo]   = useState(today());
  const [prod_u_inst, setProdUInst] = useState('all');
  const [vl_lt, setVlLt] = useState('all');

  const instructorOpts = useInstructorOpts();
  const { data: ltData = [] } = useLessonTypes();
  const ltOpts = [
    { value: 'all', label: 'Alla tidmallar' },
    ...ltData.map((lt) => ({ value: lt.id, label: lt.name })),
  ];

  const exportBelaggning = () => void runExport(async () => {
    const { data } = await supabase.from('lesson_slots')
      .select('starts_at, ends_at, capacity, booked_count, status, instructors(first_name, last_name)')
      .gte('starts_at', b2from).lte('starts_at', b2to + 'T23:59:59').order('starts_at').limit(5000);
    return (data ?? []).map((r: Record<string, unknown>) => {
      const inst = r['instructors'] as Record<string, unknown> | null;
      const cap = Number(r['capacity'] ?? 1); const bkd = Number(r['booked_count'] ?? 0);
      return { 'Datum/tid': dateFmt(r['starts_at']), 'Lärare': inst ? `${inst['first_name'] ?? ''} ${inst['last_name'] ?? ''}`.trim() : '',
        'Status': r['status'] ?? '', 'Bokade': bkd, 'Kapacitet': cap,
        'Beläggning %': cap > 0 ? `${((bkd / cap) * 100).toFixed(0)}%` : '0%' };
    }) as Record<string, unknown>[];
  }, `belaggning_${b2from}_${b2to}`);

  const exportKommandeBokning = () => void runExport(async () => {
    let q = supabase.from('lesson_bookings')
      .select('status, lesson_slots(starts_at, lesson_types(name)), students(first_name, last_name, email, phone)')
      .in('status', ['confirmed', 'pending']).gte('lesson_slots.starts_at', today())
      .order('created_at', { ascending: false }).limit(2000);
    if (b3lt !== 'all') q = q.eq('lesson_slots.lesson_type_id', b3lt);
    const { data } = await q;
    return (data ?? []).map((r: Record<string, unknown>) => {
      const slot = r['lesson_slots'] as Record<string, unknown> | null;
      const lt   = slot?.['lesson_types'] as Record<string, unknown> | null;
      const std  = r['students'] as Record<string, unknown> | null;
      return { 'Elev': std ? `${std['first_name'] ?? ''} ${std['last_name'] ?? ''}`.trim() : '',
        'E-post': std?.['email'] ?? '', 'Telefon': std?.['phone'] ?? '',
        'Lektionstyp': lt?.['name'] ?? '', 'Starttid': dateFmt(slot?.['starts_at']), 'Status': r['status'] ?? '' };
    }) as Record<string, unknown>[];
  }, 'kommande_bokningar');

  const exportOdebiterade = () => void runExport(async () => {
    const { data } = await supabase.from('lesson_bookings')
      .select('attendance_status, lesson_slots(starts_at, lesson_types(name), instructors(first_name, last_name)), students(first_name, last_name)')
      .eq('attendance_status', 'attended').lt('lesson_slots.starts_at', today())
      .order('created_at', { ascending: false }).limit(2000);
    return (data ?? []).map((r: Record<string, unknown>) => {
      const slot = r['lesson_slots'] as Record<string, unknown> | null;
      const inst = slot?.['instructors'] as Record<string, unknown> | null;
      const lt   = slot?.['lesson_types'] as Record<string, unknown> | null;
      const std  = r['students'] as Record<string, unknown> | null;
      return { 'Elev': std ? `${std['first_name'] ?? ''} ${std['last_name'] ?? ''}`.trim() : '',
        'Lärare': inst ? `${inst['first_name'] ?? ''} ${inst['last_name'] ?? ''}`.trim() : '',
        'Lektionstyp': lt?.['name'] ?? '', 'Genomförd': dateFmt(slot?.['starts_at']) };
    }) as Record<string, unknown>[];
  }, 'odebiterade_bokningar');

  const exportDagligAgendaPdf = () => void (async () => {
    toast({ title: 'Förbereder PDF…' });
    try {
      let q = supabase.from('lesson_slots')
        .select('starts_at, ends_at, status, lesson_types(name), instructors(first_name, last_name)')
        .gte('starts_at', dag_date).lte('starts_at', dag_date + 'T23:59:59').order('starts_at');
      if (dag_inst !== 'all') q = q.eq('instructor_id', dag_inst);
      const { data } = await q;
      const rows = (data ?? []).map((r: Record<string, unknown>) => {
        const inst = r['instructors'] as Record<string, unknown> | null;
        const lt   = r['lesson_types'] as Record<string, unknown> | null;
        return [new Date(r['starts_at'] as string).toLocaleTimeString('sv-SE', { hour: '2-digit', minute: '2-digit' }),
          new Date(r['ends_at'] as string).toLocaleTimeString('sv-SE', { hour: '2-digit', minute: '2-digit' }),
          inst ? `${inst['first_name'] ?? ''} ${inst['last_name'] ?? ''}`.trim() : '', lt?.['name'] ?? '', r['status'] ?? ''];
      });
      printReport(`Daglig agenda – ${dag_date}`, ['Start', 'Slut', 'Lärare', 'Lektionstyp', 'Status'], rows);
    } catch { toast({ title: 'Export misslyckades', variant: 'destructive' }); }
  })();

  const exportProduktionLarare = () => void runExport(async () => {
    let q = supabase.from('lesson_bookings')
      .select('lesson_slots(lesson_types(name, duration_minutes), instructors(first_name, last_name))')
      .eq('attendance_status', 'attended')
      .gte('lesson_slots.starts_at', prod_l_from).lte('lesson_slots.starts_at', prod_l_to + 'T23:59:59').limit(5000);
    if (prod_l_inst !== 'all') q = q.eq('lesson_slots.instructor_id', prod_l_inst);
    const { data } = await q;
    const m: Record<string, { l: number; min: number }> = {};
    for (const r of (data ?? []) as Array<Record<string, unknown>>) {
      const slot = r['lesson_slots'] as Record<string, unknown> | null;
      const inst = slot?.['instructors'] as Record<string, unknown> | null;
      const lt   = slot?.['lesson_types'] as Record<string, unknown> | null;
      const k    = inst ? `${inst['first_name'] ?? ''} ${inst['last_name'] ?? ''}`.trim() : 'Okänd';
      if (!m[k]) m[k] = { l: 0, min: 0 };
      m[k]!.l++; m[k]!.min += Number(lt?.['duration_minutes'] ?? 0);
    }
    return Object.entries(m).sort((a, b) => b[1].l - a[1].l).map(([n, v]) => ({ 'Lärare': n, 'Genomförda lektioner': v.l, 'Total tid (min)': v.min })) as Record<string, unknown>[];
  }, `produktion_larare_${prod_l_from}_${prod_l_to}`);

  const exportProduktionLararePdf = () => void (async () => {
    toast({ title: 'Förbereder PDF…' });
    try {
      let q = supabase.from('lesson_bookings')
        .select('lesson_slots(lesson_types(duration_minutes), instructors(first_name, last_name))')
        .eq('attendance_status', 'attended')
        .gte('lesson_slots.starts_at', prod_l_from).lte('lesson_slots.starts_at', prod_l_to + 'T23:59:59').limit(5000);
      if (prod_l_inst !== 'all') q = q.eq('lesson_slots.instructor_id', prod_l_inst);
      const { data } = await q;
      const m: Record<string, { l: number; min: number }> = {};
      for (const r of (data ?? []) as Array<Record<string, unknown>>) {
        const slot = r['lesson_slots'] as Record<string, unknown> | null;
        const inst = slot?.['instructors'] as Record<string, unknown> | null;
        const lt   = slot?.['lesson_types'] as Record<string, unknown> | null;
        const k    = inst ? `${inst['first_name'] ?? ''} ${inst['last_name'] ?? ''}`.trim() : 'Okänd';
        if (!m[k]) m[k] = { l: 0, min: 0 };
        m[k]!.l++; m[k]!.min += Number(lt?.['duration_minutes'] ?? 0);
      }
      printReport(`Produktion per lärare ${prod_l_from} – ${prod_l_to}`, ['Lärare', 'Lektioner', 'Tid (min)'],
        Object.entries(m).map(([n, v]) => [n, v.l, v.min]));
    } catch { toast({ title: 'Export misslyckades', variant: 'destructive' }); }
  })();

  const exportProduktionResurs = () => void runExport(async () => {
    const { data } = await supabase.from('lesson_slots')
      .select('capacity, booked_count, vehicles(registration_number, make, model)')
      .gte('starts_at', prod_r_from).lte('starts_at', prod_r_to + 'T23:59:59').limit(5000);
    const m: Record<string, { slots: number; bkd: number; cap: number }> = {};
    for (const r of (data ?? []) as Array<Record<string, unknown>>) {
      const v = r['vehicles'] as Record<string, unknown> | null;
      const k = v ? `${v['make'] ?? ''} ${v['model'] ?? ''} (${v['registration_number'] ?? ''})`.trim() : 'Inget fordon';
      if (!m[k]) m[k] = { slots: 0, bkd: 0, cap: 0 };
      m[k]!.slots++; m[k]!.bkd += Number(r['booked_count'] ?? 0); m[k]!.cap += Number(r['capacity'] ?? 1);
    }
    return Object.entries(m).map(([res, v]) => ({ 'Resurs': res, 'Tidsluckor': v.slots, 'Bokningar': v.bkd, 'Kapacitet': v.cap, 'Utnyttjande %': v.cap > 0 ? `${((v.bkd / v.cap) * 100).toFixed(0)}%` : '0%' })) as Record<string, unknown>[];
  }, `produktion_resurs_${prod_r_from}_${prod_r_to}`);

  const exportProduktionsuppgifter = () => void runExport(async () => {
    let q = supabase.from('lesson_bookings')
      .select('attendance_status, lesson_slots(starts_at, lesson_types(name), instructors(first_name, last_name)), students(first_name, last_name)')
      .eq('attendance_status', 'attended')
      .gte('lesson_slots.starts_at', prod_u_from).lte('lesson_slots.starts_at', prod_u_to + 'T23:59:59').limit(5000);
    if (prod_u_inst !== 'all') q = q.eq('lesson_slots.instructor_id', prod_u_inst);
    const { data } = await q;
    return (data ?? []).map((r: Record<string, unknown>) => {
      const slot = r['lesson_slots'] as Record<string, unknown> | null;
      const lt   = slot?.['lesson_types'] as Record<string, unknown> | null;
      const inst = slot?.['instructors'] as Record<string, unknown> | null;
      const std  = r['students'] as Record<string, unknown> | null;
      return { 'Lärare': inst ? `${inst['first_name'] ?? ''} ${inst['last_name'] ?? ''}`.trim() : '',
        'Elev': std ? `${std['first_name'] ?? ''} ${std['last_name'] ?? ''}`.trim() : '',
        'Lektionstyp': lt?.['name'] ?? '', 'Genomförd': dateFmt(slot?.['starts_at']) };
    }) as Record<string, unknown>[];
  }, `produktionsuppgifter_${prod_u_from}_${prod_u_to}`);

  const exportVantelista = () => void runExport(async () => {
    // waitlist_entries has no lesson_type_id of its own — a waitlist entry is
    // for a specific slot (slot_id), and the slot carries the lesson type.
    // See apps/web/src/modules/scheduling/hooks/useWaitlist.ts for the same join shape.
    let q = supabase.from('waitlist_entries')
      .select('created_at, priority, status, lesson_slots(lesson_type_id, lesson_types(name)), students(first_name, last_name, email, phone)')
      .order('priority', { ascending: true }).limit(1000);
    if (vl_lt !== 'all') q = q.eq('lesson_slots.lesson_type_id', vl_lt);
    const { data, error } = await q;
    if (error) throw error;
    return (data ?? []).map((r: Record<string, unknown>) => {
      const slot = r['lesson_slots'] as Record<string, unknown> | null;
      const lt   = slot?.['lesson_types'] as Record<string, unknown> | null;
      const std  = r['students']         as Record<string, unknown> | null;
      return { 'Elev': std ? `${std['first_name'] ?? ''} ${std['last_name'] ?? ''}`.trim() : '',
        'E-post': std?.['email'] ?? '', 'Telefon': std?.['phone'] ?? '',
        'Tidmall': lt?.['name'] ?? '', 'Prioritet': r['priority'] ?? '', 'Status': r['status'] ?? '',
        'Tillagd': r['created_at'] ? new Date(r['created_at'] as string).toLocaleDateString('sv-SE') : '' };
    }) as Record<string, unknown>[];
  }, 'vantelista');

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">

      <ReportCard title="Bokningar" description="Bokningar för en specifik dag och lärare."
        actions={<OpenBtn />}>
        <SelectInput label="Lärare" value={b1inst} onChange={setB1Inst} options={instructorOpts} />
        <DateField label="Datum" value={b1date} onChange={setB1Date} />
      </ReportCard>

      <ReportCard title="Beläggning" description="Beläggningsstatistik."
        actions={<ExcelBtn onClick={exportBelaggning} />}>
        <DateRange from={b2from} to={b2to} onFromChange={setB2From} onToChange={setB2To} />
      </ReportCard>

      <ReportCard title="Kommande bokningar"
        description="Kunder som har kommande bokningar för en specifik tidmall."
        actions={<ExcelBtn onClick={exportKommandeBokning} />}>
        <SelectInput label="Tidmall" value={b3lt} onChange={setB3Lt} options={ltOpts} />
      </ReportCard>

      <ReportCard title="Odebiterade bokningar"
        description="Alla odebiterade bokningar från gårdagen och bakåt."
        actions={<ExcelBtn onClick={exportOdebiterade} />} />

      <ReportCard title="Kunder utan kommande bokningar"
        description="Gå till dina segment för att få fram från denna lista."
        actions={<SegmentBtn />} />

      <ReportCard title="Kommande förarprov"
        description="Kunder som har kommande förarprov inbokade."
        actions={<PdfBtn onClick={() => void (async () => {
          toast({ title: 'Förbereder PDF…' });
          try {
            const { data } = await supabase.from('lesson_bookings')
              .select('lesson_slots(starts_at, lesson_types(name)), students(first_name, last_name, phone)')
              .gte('lesson_slots.starts_at', today()).limit(500);
            const rows = (data ?? []).map((r: Record<string, unknown>) => {
              const slot = r['lesson_slots'] as Record<string, unknown> | null;
              const std  = r['students']     as Record<string, unknown> | null;
              return [std ? `${std['first_name'] ?? ''} ${std['last_name'] ?? ''}`.trim() : '', std?.['phone'] ?? '', dateFmt(slot?.['starts_at'])];
            });
            printReport('Kommande förarprov', ['Elev', 'Telefon', 'Tid'], rows);
          } catch { toast({ title: 'Export misslyckades', variant: 'destructive' }); }
        })()} />} />

      <ReportCard title="Tidsluckans beläggning"
        description="Tidsluckans beläggning i bokningsschemat."
        actions={<OpenBtn />}>
        <DateRange from={b4from} to={b4to} onFromChange={setB4From} onToChange={setB4To} />
      </ReportCard>

      <ReportCard title="Daglig agenda"
        description="Fullständigt schema för vald dag med alla bokningar per lärare, tidpunkt och elev."
        actions={<><OpenBtn label="Öppna" /><PdfBtn onClick={exportDagligAgendaPdf} /></>}>
        <SelectInput label="Lärare" value={dag_inst} onChange={setDagInst} options={instructorOpts} />
        <DateField label="Datum" value={dag_date} onChange={setDagDate} />
      </ReportCard>

      <ReportCard title="Produktion per lärare"
        description="Antal genomförda lektioner och total produktionstid per lärare under perioden."
        actions={<><ExcelBtn onClick={exportProduktionLarare} /><PdfBtn onClick={exportProduktionLararePdf} /></>}>
        <SelectInput label="Lärare" value={prod_l_inst} onChange={setProdLInst} options={instructorOpts} />
        <DateRange from={prod_l_from} to={prod_l_to} onFromChange={setProdLFrom} onToChange={setProdLTo} />
      </ReportCard>

      <ReportCard title="Produktion per resurs"
        description="Utnyttjandegrad och produktionsstatistik per resurs (fordon, lokal) under perioden."
        actions={<ExcelBtn onClick={exportProduktionResurs} />}>
        <DateRange from={prod_r_from} to={prod_r_to} onFromChange={setProdRFrom} onToChange={setProdRTo} />
      </ReportCard>

      <ReportCard title="Produktionsuppgifter per lärare"
        description="Detaljerade produktionsuppgifter — lektionstyp, varaktighet och elev — per lärare."
        actions={<ExcelBtn onClick={exportProduktionsuppgifter} />}>
        <SelectInput label="Lärare" value={prod_u_inst} onChange={setProdUInst} options={instructorOpts} />
        <DateRange from={prod_u_from} to={prod_u_to} onFromChange={setProdUFrom} onToChange={setProdUTo} />
      </ReportCard>

      <ReportCard title="Väntelista"
        description="Elever på väntelista per tidmall med datum de lades till och kontaktuppgifter."
        actions={<ExcelBtn onClick={exportVantelista} />}>
        <SelectInput label="Tidmall" value={vl_lt} onChange={setVlLt} options={ltOpts} />
      </ReportCard>

    </div>
  );
}
