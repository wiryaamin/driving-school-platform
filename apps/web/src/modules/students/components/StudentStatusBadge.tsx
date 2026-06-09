import { Badge } from '@platform/ui';
import type { StudentStatus, PermitStage } from '@platform/types';

// ─── Student Status Badge ─────────────────────────────────────────────────────

type BadgeVariant = 'default' | 'secondary' | 'destructive' | 'outline';

const STATUS_CONFIG: Record<StudentStatus, { label: string; variant: BadgeVariant; activeClass?: string }> = {
  lead:       { label: 'Prospekt',   variant: 'outline' },
  onboarding: { label: 'Onboarding', variant: 'secondary' },
  active:     { label: 'Aktiv',      variant: 'default', activeClass: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400 border-transparent' },
  paused:     { label: 'Pausad',     variant: 'outline' },
  completed:  { label: 'Slutförd',   variant: 'secondary' },
  withdrawn:  { label: 'Avbruten',   variant: 'destructive' },
  archived:   { label: 'Arkiverad',  variant: 'outline' },
};

interface StudentStatusBadgeProps {
  status: StudentStatus;
}

export function StudentStatusBadge({ status }: StudentStatusBadgeProps) {
  const config = STATUS_CONFIG[status];
  if (config.activeClass) {
    return <Badge variant={config.variant} className={config.activeClass}>{config.label}</Badge>;
  }
  return <Badge variant={config.variant}>{config.label}</Badge>;
}

export function studentStatusLabel(status: StudentStatus): string {
  return STATUS_CONFIG[status]?.label ?? status;
}

// ─── Permit Stage Badge ───────────────────────────────────────────────────────

const PERMIT_STAGE_LABELS: Record<PermitStage, string> = {
  not_started:           'Ej påbörjad',
  theory_study:          'Teoristudier',
  risk1_booked:          'Risk 1 bokad',
  risk1_completed:       'Risk 1 klar',
  risk2_booked:          'Risk 2 bokad',
  risk2_completed:       'Risk 2 klar',
  theory_exam_booked:    'Teoriprov bokat',
  theory_passed:         'Teoriprov godkänt',
  practical_exam_booked: 'Uppkörning bokad',
  practical_passed:      'Uppkörning godkänd',
  licence_issued:        'Körkort utfärdat',
};

interface PermitStageBadgeProps {
  stage: PermitStage;
}

export function PermitStageBadge({ stage }: PermitStageBadgeProps) {
  const label = PERMIT_STAGE_LABELS[stage] ?? stage;
  const isComplete = stage === 'licence_issued';
  const isPassed = stage === 'practical_passed' || stage === 'theory_passed';

  if (isComplete) {
    return (
      <Badge variant="default" className="bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400 border-transparent">
        {label}
      </Badge>
    );
  }
  if (isPassed) {
    return <Badge variant="default">{label}</Badge>;
  }
  return <Badge variant="outline">{label}</Badge>;
}

export function permitStageLabel(stage: PermitStage): string {
  return PERMIT_STAGE_LABELS[stage] ?? stage;
}

// ─── Swedish status labels (for form select options) ─────────────────────────

export const STUDENT_STATUS_OPTIONS: { value: StudentStatus; label: string }[] = [
  { value: 'lead',       label: 'Prospekt' },
  { value: 'onboarding', label: 'Onboarding' },
  { value: 'active',     label: 'Aktiv' },
  { value: 'paused',     label: 'Pausad' },
  { value: 'completed',  label: 'Slutförd' },
  { value: 'withdrawn',  label: 'Avbruten' },
  { value: 'archived',   label: 'Arkiverad' },
];
