import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@core/api/supabase.js';
import {
  ReportCard, ExcelBtn, PdfBtn, OpenBtn,
  DateRange, DateField, SelectInput,
} from '../components/ReportCard.js';

function today()      { return new Date().toISOString().slice(0, 10); }
function monthStart() { return today().slice(0, 8) + '01'; }
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

export function KunderRapportPage() {
  // Existing filters
  const [kunder1,     setKunder1]     = useState('all');
  const [kunder2cat,  setKunder2Cat]  = useState('all');
  const [kunder2perm, setKunder2Perm] = useState('B');
  const [kunder3cat,  setKunder3Cat]  = useState('all');
  const [kunder3mat,  setKunder3Mat]  = useState('b-korkort');
  const [prov1from,   setProv1From]   = useState(monthStart());
  const [prov1to,     setProv1To]     = useState(today());
  const [provInst,    setProvInst]    = useState('all');

  // New filters
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
    { value: 'all',      label: 'Alla kunder' },
    { value: 'active',   label: 'Aktiva' },
    { value: 'inactive', label: 'Inaktiva' },
    { value: 'archived', label: 'Arkiverade' },
  ];

  const permOpts = [
    { value: 'all', label: 'Alla behörigheter' },
    { value: 'AM',  label: 'AM' },
    { value: 'A1',  label: 'A1' },
    { value: 'A2',  label: 'A2' },
    { value: 'A',   label: 'A' },
    { value: 'B',   label: 'B' },
    { value: 'C',   label: 'C' },
    { value: 'CE',  label: 'CE' },
    { value: 'D',   label: 'D' },
  ];

  const matOpts = [
    { value: 'b-korkort',  label: 'B-körkort' },
    { value: 'a-korkort',  label: 'A-körkort' },
    { value: 'am-korkort', label: 'AM-körkort' },
    { value: 'be-korkort', label: 'BE-körkort' },
    { value: 'c-korkort',  label: 'C-körkort' },
  ];

  return (
    <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">

      {/* ── Existing reports ─────────────────────────────────────────────────── */}

      <ReportCard title="Kunder" description="Dina kunduppgifter."
        actions={<ExcelBtn />}>
        <SelectInput value={kunder1} onChange={setKunder1} options={customerOpts} />
      </ReportCard>

      <ReportCard title="Kunder per behörighet" description="Kunder som har en specifik behörighet."
        actions={<ExcelBtn />}>
        <SelectInput value={kunder2cat} onChange={setKunder2Cat} options={customerOpts} />
        <SelectInput value={kunder2perm} onChange={setKunder2Perm} options={permOpts} />
      </ReportCard>

      <ReportCard title="Kunder per teorimaterial"
        description="Kunder som har tillgång till ett specifikt teorimaterial."
        actions={<ExcelBtn />}>
        <SelectInput value={kunder3cat} onChange={setKunder3Cat} options={customerOpts} />
        <SelectInput value={kunder3mat} onChange={setKunder3Mat} options={matOpts} />
      </ReportCard>

      <ReportCard title="Provstatistik"
        description="Provstatistik från examinationsmoment baserat på behörighet."
        actions={<ExcelBtn />}>
        <DateRange from={prov1from} to={prov1to} onFromChange={setProv1From} onToChange={setProv1To} />
        <SelectInput label="Lärare" value={provInst} onChange={setProvInst} options={instructorOpts} />
      </ReportCard>

      <ReportCard title="Missade examinationsmoment"
        description="Examinationsmoment som har utförts, men inte blivit bedömda."
        actions={<ExcelBtn />} />

      {/* ── New reports ──────────────────────────────────────────────────────── */}

      <ReportCard title="Elevöversikt"
        description="Fullständig översikt av alla elever med status, behörighet och tilldelad lärare."
        actions={<><ExcelBtn /><PdfBtn /></>}>
        <SelectInput label="Status" value={elevOv_cat} onChange={setElevOvCat} options={customerOpts} />
        <SelectInput label="Lärare" value={elevOv_inst} onChange={setElevOvInst} options={instructorOpts} />
      </ReportCard>

      <ReportCard title="Nya elever"
        description="Elever som registrerades under den valda perioden."
        actions={<><ExcelBtn /><PdfBtn /></>}>
        <DateRange from={nyaElev_from} to={nyaElev_to} onFromChange={setNyaElevFrom} onToChange={setNyaElevTo} />
      </ReportCard>

      <ReportCard title="Nya elevbehörigheter"
        description="Behörigheter som lades till för elever under perioden."
        actions={<ExcelBtn />}>
        <SelectInput label="Behörighet" value={nyaBeh_perm} onChange={setNyaBehPerm} options={permOpts} />
        <DateRange from={nyaBeh_from} to={nyaBeh_to} onFromChange={setNyaBehFrom} onToChange={setNyaBehTo} />
      </ReportCard>

      <ReportCard title="Obligatorisk utbildning"
        description="Elever som har obligatoriska utbildningsmoment (Risk 1, Risk 2, Första hjälpen) som saknas."
        actions={<><ExcelBtn /><PdfBtn /></>}>
        <SelectInput label="Behörighet" value={obl_perm} onChange={setOblPerm} options={permOpts} />
      </ReportCard>

      <ReportCard title="Körprov (procentandel godkänd)"
        description="Andelen godkända körprov per lärare och period. Nyckeltal för utbildningskvalitet."
        actions={<><ExcelBtn /><PdfBtn /></>}>
        <SelectInput label="Lärare" value={korp_inst} onChange={setKorpInst} options={instructorOpts} />
        <DateRange from={korp_from} to={korp_to} onFromChange={setKorpFrom} onToChange={setKorpTo} />
      </ReportCard>

      <ReportCard title="Körprov/Teoriprov"
        description="Sammanfattning av alla körprovs- och teoriprovstillfällen med resultat under perioden."
        actions={<ExcelBtn />}>
        <DateRange from={korpteori_from} to={korpteori_to} onFromChange={setKorpTeoriFrom} onToChange={setKorpTeoriTo} />
      </ReportCard>

    </div>
  );
}
