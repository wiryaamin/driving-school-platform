import { Badge } from '@platform/ui';
import type { StudentStatus, PermitStage } from '@platform/types';

// ─── Student Status Badge ─────────────────────────────────────────────────────

const STATUS_CONFIG: Record<StudentStatus, { label: string; className: string }> = {
  lead:       { label: 'Prospekt',   className: 'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-900/20 dark:text-blue-400 dark:border-blue-900/40' },
  onboarding: { label: 'Onboarding', className: 'bg-violet-50 text-violet-700 border-violet-200 dark:bg-violet-900/20 dark:text-violet-400 dark:border-violet-900/40' },
  active:     { label: 'Aktiv',      className: 'bg-green-100 text-green-700 border-transparent dark:bg-green-900/30 dark:text-green-400' },
  paused:     { label: 'Pausad',     className: 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-900/20 dark:text-amber-400 dark:border-amber-900/40' },
  completed:  { label: 'Slutförd',   className: 'bg-teal-50 text-teal-700 border-teal-200 dark:bg-teal-900/20 dark:text-teal-400 dark:border-teal-900/40' },
  withdrawn:  { label: 'Avbruten',   className: 'bg-red-100 text-red-700 border-transparent dark:bg-red-900/30 dark:text-red-400' },
  archived:   { label: 'Arkiverad',  className: 'bg-gray-100 text-gray-500 border-transparent dark:bg-gray-800/50 dark:text-gray-400' },
};

interface StudentStatusBadgeProps {
  status: StudentStatus;
}

export function StudentStatusBadge({ status }: StudentStatusBadgeProps) {
  const config = STATUS_CONFIG[status];
  return <Badge variant="outline" className={config.className}>{config.label}</Badge>;
}

export function studentStatusLabel(status: StudentStatus): string {
  return STATUS_CONFIG[status]?.label ?? status;
}

export const STUDENT_STATUS_OPTIONS: { value: StudentStatus; label: string }[] = [
  { value: 'lead',       label: 'Prospekt' },
  { value: 'onboarding', label: 'Onboarding' },
  { value: 'active',     label: 'Aktiv' },
  { value: 'paused',     label: 'Pausad' },
  { value: 'completed',  label: 'Slutförd' },
  { value: 'withdrawn',  label: 'Avbruten' },
  { value: 'archived',   label: 'Arkiverad' },
];

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
