import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@core/api/supabase.js';
import {
  ReportCard, ExcelBtn, PdfBtn, OpenBtn, SegmentBtn,
  DateRange, DateField, SelectInput,
} from '../components/ReportCard.js';
import { useLessonTypes } from '../../scheduling/hooks/useLessonTypes.js';

function today()    { return new Date().toISOString().slice(0, 10); }
function ago(d: number) { const dt = new Date(); dt.setDate(dt.getDate() - d); return dt.toISOString().slice(0, 10); }

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

export function BokningarRapportPage() {
  // Existing
  const [b1inst, setB1Inst] = useState('all');
  const [b1date, setB1Date] = useState(today());
  const [b2from, setB2From] = useState('2025-07-01');
  const [b2to,   setB2To]   = useState('2026-06-01');
  const [b3lt,   setB3Lt]   = useState('all');
  const [b4from, setB4From] = useState(ago(30));
  const [b4to,   setB4To]   = useState(today());

  // New: Daglig agenda
  const [dag_date, setDagDate]   = useState(today());
  const [dag_inst, setDagInst]   = useState('all');

  // New: Produktion per lärare
  const [prod_l_from,  setProdLFrom]  = useState(ago(30));
  const [prod_l_to,    setProdLTo]    = useState(today());
  const [prod_l_inst,  setProdLInst]  = useState('all');

  // New: Produktion per resurs
  const [prod_r_from, setProdRFrom] = useState(ago(30));
  const [prod_r_to,   setProdRTo]   = useState(today());

  // New: Produktionsuppgifter per lärare
  const [prod_u_from,  setProdUFrom]  = useState(ago(30));
  const [prod_u_to,    setProdUTo]    = useState(today());
  const [prod_u_inst,  setProdUInst]  = useState('all');

  // New: Väntelista
  const [vl_lt, setVlLt] = useState('all');

  const instructorOpts = useInstructorOpts();
  const { data: ltData = [] } = useLessonTypes();
  const ltOpts = [
    { value: 'all', label: 'Alla tidmallar' },
    ...ltData.map((lt) => ({ value: lt.id, label: lt.name })),
  ];

  return (
    <div className="grid grid-cols-2 xl:grid-cols-3 gap-4">

      {/* ── Existing reports ─────────────────────────────────────────────────── */}

      <ReportCard title="Bokningar" description="Bokningar för en specifik dag och lärare."
        actions={<OpenBtn />}>
        <SelectInput label="Lärare" value={b1inst} onChange={setB1Inst} options={instructorOpts} />
        <DateField label="Datum" value={b1date} onChange={setB1Date} />
      </ReportCard>

      <ReportCard title="Beläggning" description="Beläggningsstatistik."
        actions={<ExcelBtn />}>
        <DateRange from={b2from} to={b2to} onFromChange={setB2From} onToChange={setB2To} />
      </ReportCard>

      <ReportCard title="Kommande bokningar"
        description="Kunder som har kommande bokningar för en specifik tidmall."
        actions={<ExcelBtn />}>
        <SelectInput label="Tidmall" value={b3lt} onChange={setB3Lt} options={ltOpts} />
      </ReportCard>

      <ReportCard title="Odebiterade bokningar"
        description="Alla odebiterade bokningar från gårdagen och bakåt."
        actions={<ExcelBtn />} />

      <ReportCard title="Kunder utan kommande bokningar"
        description="Gå till dina segment för att få fram från denna lista."
        actions={<SegmentBtn />} />

      <ReportCard title="Kommande förarprov"
        description="Kunder som har kommande förarprov inbokade."
        actions={<PdfBtn />} />

      <ReportCard title="Tidsluckans beläggning"
        description="Tidsluckans beläggning i bokningsschemat."
        actions={<OpenBtn />}>
        <DateRange from={b4from} to={b4to} onFromChange={setB4From} onToChange={setB4To} />
      </ReportCard>

      {/* ── New reports ──────────────────────────────────────────────────────── */}

      <ReportCard title="Daglig agenda"
        description="Fullständigt schema för vald dag med alla bokningar per lärare, tidpunkt och elev."
        actions={<><OpenBtn label="Öppna" /><PdfBtn /></>}>
        <SelectInput label="Lärare" value={dag_inst} onChange={setDagInst} options={instructorOpts} />
        <DateField label="Datum" value={dag_date} onChange={setDagDate} />
      </ReportCard>

      <ReportCard title="Produktion per lärare"
        description="Antal genomförda lektioner och total produktionstid per lärare under perioden."
        actions={<><ExcelBtn /><PdfBtn /></>}>
        <SelectInput label="Lärare" value={prod_l_inst} onChange={setProdLInst} options={instructorOpts} />
        <DateRange from={prod_l_from} to={prod_l_to} onFromChange={setProdLFrom} onToChange={setProdLTo} />
      </ReportCard>

      <ReportCard title="Produktion per resurs"
        description="Utnyttjandegrad och produktionsstatistik per resurs (fordon, lokal) under perioden."
        actions={<ExcelBtn />}>
        <DateRange from={prod_r_from} to={prod_r_to} onFromChange={setProdRFrom} onToChange={setProdRTo} />
      </ReportCard>

      <ReportCard title="Produktionsuppgifter per lärare"
        description="Detaljerade produktionsuppgifter — lektionstyp, varaktighet och elev — per lärare."
        actions={<ExcelBtn />}>
        <SelectInput label="Lärare" value={prod_u_inst} onChange={setProdUInst} options={instructorOpts} />
        <DateRange from={prod_u_from} to={prod_u_to} onFromChange={setProdUFrom} onToChange={setProdUTo} />
      </ReportCard>

      <ReportCard title="Väntelista"
        description="Elever på väntelista per tidmall med datum de lades till och kontaktuppgifter."
        actions={<ExcelBtn />}>
        <SelectInput label="Tidmall" value={vl_lt} onChange={setVlLt} options={ltOpts} />
      </ReportCard>

    </div>
  );
}
