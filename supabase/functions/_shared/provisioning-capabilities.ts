/**
 * Business Capability Model.
 *
 * Sits between Business Knowledge and the Dependency Engine (Execution
 * Direction, 2026-08-07 — "Next Evolution"):
 *
 *   Business Knowledge  → "What kind of business is this?"
 *   Business Capability → "What does this business do?"
 *   Provisioning Engine  → "What must Trafikcloud configure?"
 *
 * A capability is a tenant-meaningful grouping of functionality (Motorcycle
 * Training, Multi-Branch Operations, Corporate Training, ...), inferred —
 * never asked about directly — from Business Knowledge already computed by
 * the Configuration Extraction and Business Rules Engines, plus a handful
 * of real signals read from whichever module already owns that data
 * (Företagskunder, Kommunikation, the public-booking toggle in Company
 * Settings). No capability here is inferred from data that doesn't exist
 * yet — a capability the platform can't honestly detect is reported
 * `active: false`, never guessed.
 *
 * Per the "do not duplicate provisioning logic" instruction, capabilities
 * do not get their own executors. Each one declares which existing
 * Dependency Engine nodes it *owns* (`nodes`); the Provisioning Engine
 * (provisioning-engine.ts) only runs a node when at least one active
 * capability owns it. The existing branch/lesson_types/schedule_templates
 * executors become, structurally, the capabilities' executors — nothing
 * about how they provision changes, only *whether* they run for a given
 * organization now has a named, inspectable business reason attached.
 */

import type { ExtractedBusinessConfiguration } from './provisioning-extraction.ts';
import type { KnownBusinessFacts } from './provisioning-extraction.ts';
import type { BusinessRules } from './provisioning-rules.ts';
import type { ProvisioningNodeKey } from './provisioning-dependency.ts';

export type CapabilityKey =
  | 'core_operations'
  | 'motorcycle_training'
  | 'heavy_vehicle_training'
  | 'multi_branch'
  | 'corporate_training'
  | 'online_booking'
  | 'communication_automation';

export interface CapabilityDefinition {
  key:   CapabilityKey;
  name:  string; // tenant-facing, Swedish
  /** Dependency Engine nodes this capability owns — see provisioning-dependency.ts. */
  nodes: ProvisioningNodeKey[];
}

export interface CapabilityAssessment extends CapabilityDefinition {
  active: boolean;
  reason: string;
}

export const CAPABILITY_DEFINITIONS: CapabilityDefinition[] = [
  // Always active — every driving school has an organisation, teaches at
  // least one licence category, and needs its lesson types scheduled.
  { key: 'core_operations',        name: 'Grundverksamhet',                nodes: ['branch', 'lesson_types', 'schedule_templates', 'package_templates'] },
  { key: 'motorcycle_training',    name: 'MC-utbildning',                  nodes: ['lesson_types'] },
  { key: 'heavy_vehicle_training', name: 'Utbildning för tunga fordon',    nodes: ['lesson_types'] },
  { key: 'multi_branch',           name: 'Flera filialer',                 nodes: ['schedule_templates'] },
  // No executor exists yet for these three — they're honestly reported as
  // detected-or-not, same as instructor/vehicle in the Dependency Engine,
  // rather than pretending core_operations' existing nodes cover them.
  { key: 'corporate_training',        name: 'Företagsutbildning',            nodes: [] },
  { key: 'online_booking',            name: 'Publik onlinebokning',          nodes: [] },
  { key: 'communication_automation',  name: 'Automatiserad kommunikation',   nodes: [] },
];

const MOTORCYCLE_CATEGORIES = ['AM', 'A1', 'A2', 'A'];
const HEAVY_CATEGORIES       = ['C1', 'C', 'C1E', 'CE', 'D1', 'D', 'D1E', 'DE'];

export function deriveCapabilities(
  config: ExtractedBusinessConfiguration, rules: BusinessRules, known: KnownBusinessFacts,
): CapabilityAssessment[] {
  const categories = config.trainingServices.licenceCategories;
  const hasMotorcycle = categories.some((c) => MOTORCYCLE_CATEGORIES.includes(c));
  const hasHeavy       = categories.some((c) => HEAVY_CATEGORIES.includes(c));
  const isMultiBranch  = rules.archetype === 'multiBranch' || rules.archetype === 'enterprise';
  const corporateCount = known.capabilitySignals.corporateCustomers ?? 0;
  const channelCount    = known.capabilitySignals.activeCommunicationChannels ?? 0;

  const byKey = new Map(CAPABILITY_DEFINITIONS.map((d) => [d.key, d]));
  const assess = (key: CapabilityKey, active: boolean, reason: string): CapabilityAssessment =>
    ({ ...byKey.get(key)!, active, reason });

  return [
    assess('core_operations', true, 'Alla trafikskolor har en grundverksamhet.'),
    assess('motorcycle_training', hasMotorcycle,
      hasMotorcycle ? `Ni utbildar för MC-behörighet (${categories.filter((c) => MOTORCYCLE_CATEGORIES.includes(c)).join(', ')}).` : 'Ingen MC-behörighet vald.'),
    assess('heavy_vehicle_training', hasHeavy,
      hasHeavy ? `Ni utbildar för tunga fordon (${categories.filter((c) => HEAVY_CATEGORIES.includes(c)).join(', ')}).` : 'Ingen behörighet för tunga fordon vald.'),
    assess('multi_branch', isMultiBranch,
      isMultiBranch ? `Verksamheten är klassad som ${rules.archetype} (${rules.signals.branches} filialer, ${rules.signals.instructors} lärare).` : 'En filial, ett mindre team.'),
    assess('corporate_training', corporateCount > 0,
      corporateCount > 0 ? `${corporateCount} registrerade företagskunder.` : 'Inga registrerade företagskunder ännu.'),
    assess('online_booking', known.capabilitySignals.publicBookingEnabled,
      known.capabilitySignals.publicBookingEnabled ? 'Publik bokning är aktiverad i företagsinställningarna.' : 'Publik bokning är inte aktiverad.'),
    assess('communication_automation', channelCount > 0,
      channelCount > 0 ? `${channelCount} aktiva kommunikationskanaler.` : 'Inga aktiva kommunikationskanaler ännu.'),
  ];
}

/** Nodes owned by at least one currently-active capability — what the Provisioning Engine is actually allowed to run this pass. */
export function activeNodeKeys(assessments: CapabilityAssessment[]): Set<ProvisioningNodeKey> {
  const active = new Set<ProvisioningNodeKey>();
  for (const a of assessments) {
    if (!a.active) continue;
    for (const node of a.nodes) active.add(node);
  }
  return active;
}
