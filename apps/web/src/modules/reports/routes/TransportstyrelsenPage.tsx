import { useState } from 'react';
import { ReportCard, OpenBtn, SelectInput } from '../components/ReportCard.js';

const RISK_OPTS = [
  { value: 'risk1-b', label: 'Riskutbildning del 1 - Personbil (B)' },
  { value: 'risk1-mc', label: 'Riskutbildning del 1 - Motorcykel (A1, A2, A)' },
  { value: 'risk2-b', label: 'Riskutbildning del 2 - Personbil (B)' },
  { value: 'risk2-mc', label: 'Riskutbildning del 2 - Motorcykel (A1, A2, A)' },
];

export function TransportstyrelsenPage() {
  const [riskType, setRiskType] = useState('risk1-b');

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">

        <ReportCard
          title="Elevregister"
          description={<>Uppfyller kraven i föreskriften <strong>VVFS 2006:65</strong></> }
          actions={<OpenBtn />}
        />

        <ReportCard
          title="AM-elever"
          description={<>Uppfyller kraven i föreskriften <strong>TSFS 2025:45</strong></>}
          actions={<OpenBtn />}
        />

        <ReportCard
          title="Introduktionsutbildningar"
          description={<>Uppfyller kraven i föreskriften <strong>TSFS 2010:127</strong></>}
          actions={<OpenBtn />}
        />

        <ReportCard
          title="Riskutbildningar"
          description={<>Uppfyller kraven i föreskriften <strong>TSFS 2012:40</strong></>}
          actions={<OpenBtn />}
        >
          <SelectInput value={riskType} onChange={setRiskType} options={RISK_OPTS} />
        </ReportCard>

      </div>
    </div>
  );
}
