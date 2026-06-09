import { Badge } from '@platform/ui';
import type { InstructorEmploymentType } from '@platform/types';

type BadgeVariant = 'default' | 'secondary' | 'destructive' | 'outline';

interface StatusConfig {
  label:       string;
  variant:     BadgeVariant;
  activeClass?: string;
}

const STATUS_CONFIG: Record<InstructorEmploymentType, StatusConfig> = {
  employed:   {
    label:       'Anställd',
    variant:     'default',
    activeClass: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400 border-transparent',
  },
  contractor: {
    label:       'Konsult',
    variant:     'default',
    activeClass: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400 border-transparent',
  },
  external:   {
    label:   'Extern',
    variant: 'outline',
  },
  on_leave:   {
    label:       'Tjänstledig',
    variant:     'outline',
    activeClass: 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-900/20 dark:text-amber-400 dark:border-amber-900/40',
  },
  inactive:   {
    label:   'Inaktiv',
    variant: 'secondary',
  },
};

interface InstructorStatusBadgeProps {
  status: InstructorEmploymentType;
}

export function InstructorStatusBadge({ status }: InstructorStatusBadgeProps) {
  const config = STATUS_CONFIG[status] ?? { label: status, variant: 'outline' as BadgeVariant };
  if (config.activeClass) {
    return <Badge variant={config.variant} className={config.activeClass}>{config.label}</Badge>;
  }
  return <Badge variant={config.variant}>{config.label}</Badge>;
}

export function instructorStatusLabel(status: InstructorEmploymentType): string {
  return STATUS_CONFIG[status]?.label ?? status;
}

export const INSTRUCTOR_STATUS_OPTIONS: { value: InstructorEmploymentType; label: string }[] = [
  { value: 'employed',   label: 'Anställd' },
  { value: 'contractor', label: 'Konsult' },
  { value: 'external',   label: 'Extern' },
  { value: 'on_leave',   label: 'Tjänstledig' },
  { value: 'inactive',   label: 'Inaktiv' },
];
