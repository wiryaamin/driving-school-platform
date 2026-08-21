// Portal Audit SP-02: the single authoritative permit_stage vocabulary for
// the Student Portal, mirroring the real DB enum (see
// 20260528000001_phase2a_domain_foundation.sql). Multiple components
// previously kept their own invented 6-value vocabulary
// ('learner'/'risk1'/'risk2'/'theory'/'practical'/'licensed') that never
// matched a real stage value — this file exists so that bug class can't
// recur: every stage-aware component imports from here instead of
// re-typing its own copy.

export const STAGE_ORDER = [
  'not_started', 'theory_study',
  'risk1_booked', 'risk1_completed',
  'risk2_booked', 'risk2_completed',
  'theory_exam_booked', 'theory_passed',
  'practical_exam_booked', 'practical_passed', 'licence_issued',
] as const;

export type PermitStage = (typeof STAGE_ORDER)[number];

export function stageIndex(stage: string | null | undefined): number {
  if (!stage) return 0;
  const idx = STAGE_ORDER.indexOf(stage as PermitStage);
  return idx === -1 ? 0 : idx;
}

export const PERMIT_STAGE_LABELS: Record<PermitStage, string> = {
  not_started:           'Ej påbörjad',
  theory_study:           'Teoristudier pågår',
  risk1_booked:           'Risk 1 bokad',
  risk1_completed:        'Risk 1 genomförd',
  risk2_booked:           'Risk 2 bokad',
  risk2_completed:        'Risk 2 genomförd',
  theory_exam_booked:     'Teoriprov bokat',
  theory_passed:          'Teoriprovet godkänt',
  practical_exam_booked:  'Uppkörning bokad',
  practical_passed:       'Uppkörning godkänd',
  licence_issued:         'Körkort klart',
};

// Two DB stages per visual milestone (booked + completed), Körkort alone —
// the same collapsing the Dashboard's progress timeline already used, now
// shared so a second UI (Settings' step tracker) doesn't have to reinvent it.
export const PERMIT_MILESTONES: Array<{ label: string }> = [
  { label: 'Start'      },
  { label: 'Risk 1'     },
  { label: 'Risk 2'     },
  { label: 'Teori'      },
  { label: 'Uppkörning' },
  { label: 'Körkort'    },
];

export function milestoneRank(stage: string): number {
  return Math.min(PERMIT_MILESTONES.length - 1, Math.floor(stageIndex(stage) / 2));
}

export function getProgressPct(stage: string): number {
  if (stage === 'licence_issued') return 100;
  return Math.round((stageIndex(stage) / (STAGE_ORDER.length - 1)) * 100);
}
