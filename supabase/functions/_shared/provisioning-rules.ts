/**
 * Business Rules Engine.
 *
 * Reads the Configuration Extraction Engine's structured output and derives
 * every deterministic business decision from it — archetype, business type,
 * plus the model outputs those decisions drive. Deliberately a deterministic
 * rules engine, not a language-model call: every other "intelligent"
 * mechanism already in this codebase (Go-Live readiness, availability-rule
 * generation, BAS chart-of-accounts seeding) is a deterministic,
 * fully-explainable function, and this platform's finance layer is legally
 * required to be exactly reproducible — an LLM call would be the first
 * non-auditable step in it.
 *
 * businessType is inferred, never asked — it costs zero new interview
 * questions because licenceCategories already fully determines it (Business
 * Knowledge Audit, 2026-08-07: "Can it be derived?" — yes, from an answer
 * already collected).
 *
 * Only lessonModel, schedulingModel, and businessType are populated today —
 * the interview doesn't yet collect enough signal for operationalModel,
 * communicationModel, financeModel, or resourceModel (services offered, VAT
 * frequency, communication provider, etc. aren't asked yet). Add fields here
 * as the Business Discovery interview grows; this stays the one place
 * archetype and every model derived from it are computed.
 */

import type { ExtractedBusinessConfiguration, LicenceCategory } from './provisioning-extraction.ts';

export type Archetype = 'solo' | 'smallTeam' | 'multiBranch' | 'enterprise';
export type BusinessType = 'standard' | 'motorcycle' | 'heavy_vehicle' | 'mixed';

const MOTORCYCLE_CATEGORIES: readonly LicenceCategory[] = ['AM', 'A1', 'A2', 'A'];
const HEAVY_CATEGORIES:      readonly LicenceCategory[] = ['C1', 'C', 'C1E', 'CE', 'D1', 'D', 'D1E', 'DE'];
const STANDARD_CATEGORIES:   readonly LicenceCategory[] = ['B', 'B96', 'BE'];

export interface LessonModel {
  licenceCategories:               LicenceCategory[];
  defaultDurationMinutes:          number;
}

export interface SchedulingModel {
  // scheduling_generation_configs.generation_frequency/auto_generation_enabled
  // — real, existing columns (20260528000008_phase2d_scheduling_ops_infra.sql).
  // 'manual' forces auto_generation_enabled=false at the DB layer (CHECK
  // constraint) — solo/small-team schools stay operator-triggered, matching
  // Business Discovery Engine v2 Section 2's own archetype table exactly.
  generationFrequency:  'manual' | 'weekly';
  autoGenerationEnabled: boolean;
}

export interface BusinessRules {
  archetype:    Archetype;
  businessType: BusinessType;
  signals: {
    branches:                    number;
    instructors:                 number;
    vehicles:                    number;
    licenceCategoryDiversity:    number;
  };
  lessonModel:     LessonModel;
  schedulingModel: SchedulingModel;
  computedAt:      string;
}

function classifyArchetype(config: ExtractedBusinessConfiguration): { archetype: Archetype; diversity: number } {
  const branches    = config.structure.branches.value;
  const instructors = config.resources.instructors.value;
  const diversity    = new Set(config.trainingServices.licenceCategories).size;

  if (branches >= 5 || instructors >= 20) return { archetype: 'enterprise', diversity };
  if (branches >= 3 || instructors >= 7) return { archetype: 'multiBranch', diversity };
  if (branches === 1 && instructors === 1 && diversity <= 1) return { archetype: 'solo', diversity };
  return { archetype: 'smallTeam', diversity };
}

function classifyBusinessType(categories: LicenceCategory[]): BusinessType {
  const hasStandard   = categories.some((c) => STANDARD_CATEGORIES.includes(c) || c === 'Traktor');
  const hasMotorcycle = categories.some((c) => MOTORCYCLE_CATEGORIES.includes(c));
  const hasHeavy       = categories.some((c) => HEAVY_CATEGORIES.includes(c));

  const groups = [hasStandard, hasMotorcycle, hasHeavy].filter(Boolean).length;
  if (groups > 1) return 'mixed';
  if (hasMotorcycle) return 'motorcycle';
  if (hasHeavy) return 'heavy_vehicle';
  return 'standard';
}

export function deriveBusinessRules(config: ExtractedBusinessConfiguration): BusinessRules {
  const { archetype, diversity } = classifyArchetype(config);
  const businessType = classifyBusinessType(config.trainingServices.licenceCategories);
  const autoGenerationEnabled = archetype === 'multiBranch' || archetype === 'enterprise';

  return {
    archetype,
    businessType,
    signals: {
      branches: config.structure.branches.value,
      instructors: config.resources.instructors.value,
      vehicles: config.resources.vehicles.value,
      licenceCategoryDiversity: diversity,
    },
    lessonModel: {
      licenceCategories: config.trainingServices.licenceCategories,
      defaultDurationMinutes: config.trainingServices.standardLessonDurationMinutes,
    },
    schedulingModel: {
      generationFrequency: autoGenerationEnabled ? 'weekly' : 'manual',
      autoGenerationEnabled,
    },
    computedAt: new Date().toISOString(),
  };
}
