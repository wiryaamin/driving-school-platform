/**
 * Business Domain Model.
 *
 * Inserted above the Business Capability layer (Execution Direction,
 * 2026-08-07 — "Next Evolution"), completing the chain:
 *
 *   Business Knowledge → Business Domains → Business Capabilities →
 *   Dependency Engine → Provisioning Engine → Configured Tenant Platform
 *
 * A Business Domain represents an operational area of running a driving
 * school (Organisationsstyrning, Ekonomi, ...), not a feature. Each domain
 * owns one or more existing Business Capabilities (provisioning-capabilities.ts)
 * — no new capabilities were invented for this layer, no capability was
 * moved or renamed. A domain's `active` state is entirely derived from
 * whether any of its owned capabilities are active; domains with no
 * capability mapped to them yet (Finance, Integrations — nothing in this
 * codebase infers VAT preferences or external credentials from existing
 * data) are honestly reported inactive with a reason saying so, rather
 * than guessing.
 *
 * Domain-to-domain dependencies (Sales depends on Operations, Operations
 * and Finance and Communication depend on Organization) reuse the exact
 * same topological sort the Dependency Engine already uses
 * (topologicalSort() in provisioning-dependency.ts) — no second sort
 * algorithm was written for this.
 *
 * Provisioning itself does not change: the Provisioning Engine still only
 * consumes the flat CapabilityAssessment[] list (via activeNodeKeys()) —
 * Business Domains are a reporting/organizing layer for the tenant and for
 * future domain-level automation, not a new gate the Provisioning Engine
 * needs to know about.
 */

import { deriveCapabilities, type CapabilityAssessment, type CapabilityKey } from './provisioning-capabilities.ts';
import { topologicalSort } from './provisioning-dependency.ts';
import type { ExtractedBusinessConfiguration, KnownBusinessFacts } from './provisioning-extraction.ts';
import type { BusinessRules } from './provisioning-rules.ts';

export type DomainKey =
  | 'organization_management'
  | 'student_customer_management'
  | 'training_services'
  | 'operations'
  | 'sales_public_presence'
  | 'communication'
  | 'finance'
  | 'integrations';

export interface DomainDefinition {
  key:          DomainKey;
  name:         string; // tenant-facing, Swedish
  capabilities: CapabilityKey[];
  dependsOn:    DomainKey[];
}

export interface DomainAssessment extends DomainDefinition {
  active: boolean;
  reason: string;
}

export const DOMAIN_DEFINITIONS: DomainDefinition[] = [
  {
    key: 'organization_management', name: 'Organisationsstyrning', dependsOn: [],
    // core_operations includes the branch node — organisation structure.
    capabilities: ['core_operations', 'multi_branch'],
  },
  {
    key: 'training_services', name: 'Utbildningstjänster', dependsOn: ['organization_management'],
    capabilities: ['core_operations', 'motorcycle_training', 'heavy_vehicle_training'],
  },
  {
    key: 'operations', name: 'Verksamhetsdrift', dependsOn: ['organization_management'],
    capabilities: ['core_operations', 'multi_branch'],
  },
  {
    key: 'student_customer_management', name: 'Kund- och elevhantering', dependsOn: ['organization_management'],
    capabilities: ['corporate_training'],
  },
  {
    key: 'communication', name: 'Kommunikation', dependsOn: ['organization_management'],
    capabilities: ['communication_automation'],
  },
  {
    key: 'finance', name: 'Ekonomi', dependsOn: ['organization_management'],
    // No capability infers VAT/invoicing preferences yet — honestly empty.
    capabilities: [],
  },
  {
    key: 'sales_public_presence', name: 'Försäljning & publik närvaro', dependsOn: ['operations'],
    capabilities: ['online_booking'],
  },
  {
    key: 'integrations', name: 'Integrationer', dependsOn: [],
    // External credentials are a genuine pause point, never inferred.
    capabilities: [],
  },
];

/** Same topological order the Dependency Engine uses — dependency-safe presentation/activation order. */
export function resolveDomainOrder(graph: DomainDefinition[] = DOMAIN_DEFINITIONS): DomainKey[] {
  return topologicalSort(graph, 'Business Domain graph');
}

export function deriveDomains(
  config: ExtractedBusinessConfiguration, rules: BusinessRules, known: KnownBusinessFacts,
): { domains: DomainAssessment[]; capabilities: CapabilityAssessment[] } {
  const capabilities = deriveCapabilities(config, rules, known);
  const capByKey      = new Map(capabilities.map((c) => [c.key, c]));
  const defByKey       = new Map(DOMAIN_DEFINITIONS.map((d) => [d.key, d]));

  const domains = resolveDomainOrder().map((key): DomainAssessment => {
    const def = defByKey.get(key)!;
    const owned = def.capabilities.map((ck) => capByKey.get(ck)).filter((c): c is CapabilityAssessment => Boolean(c));
    const activeCaps = owned.filter((c) => c.active);

    if (def.capabilities.length === 0) {
      return { ...def, active: false, reason: 'Ingen kapabilitet kan ännu avgöra detta automatiskt.' };
    }
    if (activeCaps.length > 0) {
      return { ...def, active: true, reason: `Aktiv via: ${activeCaps.map((c) => c.name).join(', ')}.` };
    }
    return { ...def, active: false, reason: 'Ingen av domänens kapabiliteter är aktiva för denna verksamhet.' };
  });

  return { domains, capabilities };
}
