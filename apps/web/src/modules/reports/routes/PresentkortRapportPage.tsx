import { useState } from 'react';
import { ReportCard, ExcelBtn, PdfBtn, DateInput, DateRange, SelectInput } from '../components/ReportCard.js';

function today()  { return new Date().toISOString().slice(0, 10); }
function ago(d: number) { const dt = new Date(); dt.setDate(dt.getDate() - d); return dt.toISOString().slice(0, 10); }

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

export function PresentkortRapportPage() {
  const [date,    setDate]   = useState(today());
  const [pfrom,   setPFrom]  = useState(ago(30));
  const [pto,     setPTo]    = useState(today());
  const [ptype,   setPType]  = useState('used_void');
  const [sfrom,   setSFrom]  = useState(ago(30));
  const [sto,     setSTo]    = useState(today());
  const [issuer,  setIssuer] = useState('all');
  const [rfrom,   setRFrom]  = useState(ago(30));
  const [rto,     setRTo]    = useState(today());

  return (
    <div className="grid grid-cols-2 xl:grid-cols-3 gap-4">
      <ReportCard
        title="Aktiva presentkort"
        description="Alla dina aktiva presentkort givet datum."
        actions={<><ExcelBtn /><PdfBtn /></>}
      >
        <DateInput value={date} onChange={setDate} />
      </ReportCard>

      <ReportCard
        title="Presentkortsaktivitet"
        description="Aktivitet för dina presentkort under perioden."
        actions={<><ExcelBtn /><PdfBtn /></>}
      >
        <DateRange from={pfrom} to={pto} onFromChange={setPFrom} onToChange={setPTo} />
        <SelectInput value={ptype} onChange={setPType} options={TYPE_OPTS} />
      </ReportCard>

      <ReportCard
        title="Presentkort per utgivare"
        description="Antal sålda och inlösta presentkort fördelat per utgivare."
        actions={<ExcelBtn />}
      >
        <DateRange from={sfrom} to={sto} onFromChange={setSFrom} onToChange={setSTo} />
        <SelectInput value={issuer} onChange={setIssuer} options={ISSUER_OPTS} label="Utgivare" />
      </ReportCard>

      <ReportCard
        title="Utgångna presentkort"
        description="Presentkort som har passerat sitt utgångsdatum under perioden."
        actions={<><ExcelBtn /><PdfBtn /></>}
      >
        <DateRange from={rfrom} to={rto} onFromChange={setRFrom} onToChange={setRTo} />
      </ReportCard>
    </div>
  );
}
