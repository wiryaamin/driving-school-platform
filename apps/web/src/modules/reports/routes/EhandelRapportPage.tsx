import { useState } from 'react';
import { ReportCard, ExcelBtn, OpenBtn, DateRange, SelectInput } from '../components/ReportCard.js';

function today()  { return new Date().toISOString().slice(0, 10); }
function ago(d: number) { const dt = new Date(); dt.setDate(dt.getDate() - d); return dt.toISOString().slice(0, 10); }

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

  return (
    <div className="grid grid-cols-2 xl:grid-cols-3 gap-4">
      <ReportCard
        title="Betalda ordrar"
        description="Visar betalda ordrar i e-handeln under den valda perioden."
        actions={<ExcelBtn />}
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
        actions={<><ExcelBtn /><OpenBtn label="Visa" /></>}
      >
        <DateRange from={b3from} to={b3to} onFromChange={setB3From} onToChange={setB3To} />
      </ReportCard>

      <ReportCard
        title="Köpstatistik per artikel"
        description="Försäljningsvolym och intäkter uppdelat per artikel och produkt."
        actions={<ExcelBtn />}
      >
        <DateRange from={b4from} to={b4to} onFromChange={setB4From} onToChange={setB4To} />
      </ReportCard>

      <ReportCard
        title="Orderhistorik"
        description="Fullständig orderhistorik med filtreringsmöjligheter per status."
        actions={<><ExcelBtn /><OpenBtn /></>}
      >
        <DateRange from={b5from} to={b5to} onFromChange={setB5From} onToChange={setB5To} />
        <SelectInput value={ordStatus} onChange={setOrdStatus} options={STATUS_OPTS} label="Status" />
      </ReportCard>
    </div>
  );
}
