import { useState } from 'react';
import { toast } from '@platform/ui';
import { ReportCard, OpenBtn, SelectInput } from '../components/ReportCard.js';

const RISK_OPTS = [
  { value: 'risk1-b', label: 'Riskutbildning del 1 - Personbil (B)' },
  { value: 'risk1-mc', label: 'Riskutbildning del 1 - Motorcykel (A1, A2, A)' },
  { value: 'risk2-b', label: 'Riskutbildning del 2 - Personbil (B)' },
  { value: 'risk2-mc', label: 'Riskutbildning del 2 - Motorcykel (A1, A2, A)' },
];

// These four exports are not implemented — producing a real Transportstyrelsen
// compliance file requires the exact column/format each regulation mandates,
// which isn't safe to guess at for a compliance-facing export. The shared
// ReportCard default (reportToast, "Förbereder rapport…") falsely implies an
// export is in progress; this explicit override is honest instead, matching
// PresentkortRapportPage's precedent for not-yet-built reports.
function notAvailableToast() {
  toast({
    title: 'Export ej tillgänglig',
    description: 'Den här rapporten är inte byggd ännu. Kontakta support om ni behöver den för en myndighetsgranskning.',
    variant: 'destructive',
  });
}

export function TransportstyrelsenPage() {
  const [riskType, setRiskType] = useState('risk1-b');

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">

        <ReportCard
          title="Elevregister"
          description={<>Avser föreskriften <strong>VVFS 2006:65</strong> — <span className="text-destructive">exporten är inte byggd ännu</span></>}
          actions={<OpenBtn onClick={notAvailableToast} />}
        />

        <ReportCard
          title="AM-elever"
          description={<>Avser föreskriften <strong>TSFS 2025:45</strong> — <span className="text-destructive">exporten är inte byggd ännu</span></>}
          actions={<OpenBtn onClick={notAvailableToast} />}
        />

        <ReportCard
          title="Introduktionsutbildningar"
          description={<>Avser föreskriften <strong>TSFS 2010:127</strong> — <span className="text-destructive">exporten är inte byggd ännu</span></>}
          actions={<OpenBtn onClick={notAvailableToast} />}
        />

        <ReportCard
          title="Riskutbildningar"
          description={<>Avser föreskriften <strong>TSFS 2012:40</strong> — <span className="text-destructive">exporten är inte byggd ännu</span></>}
          actions={<OpenBtn onClick={notAvailableToast} />}
        >
          <SelectInput value={riskType} onChange={setRiskType} options={RISK_OPTS} />
        </ReportCard>

      </div>
    </div>
  );
}
