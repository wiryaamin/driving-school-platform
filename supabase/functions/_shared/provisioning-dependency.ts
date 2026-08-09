/**
 * Dependency Engine.
 *
 * The provisioning graph: Branch → Instructor → Vehicle → Lesson Types →
 * Schedule Templates → Generated Slots (the exact chain given when this
 * engine was specified). Each node declares what it depends on; this module
 * resolves a valid execution order via topological sort so the Provisioning
 * Engine never has to hardcode "do lesson types before schedule configs."
 *
 * `implemented: false` nodes are structurally present in the graph — the
 * dependency shape is real and complete — but have no executor in the
 * Provisioning Engine yet. Marking them explicitly rather than omitting them
 * means adding their executors later is additive, not a graph redesign.
 *
 * instructor/vehicle stay `implemented: false` by design, not by omission:
 * a specific person's name/email or a specific vehicle's registration
 * number are genuine business facts nobody has told the platform yet — no
 * existing record, inference, Swedish best practice, or safe default can
 * produce them, so there is no automation test for an executor to pass
 * (see provisioning-engine.ts's module comment). branch *can* pass that
 * test in the narrow single-branch-with-a-known-address case, so it has a
 * real executor now.
 */

export type ProvisioningNodeKey =
  | 'branch' | 'instructor' | 'vehicle'
  | 'lesson_types' | 'schedule_templates' | 'generated_slots'
  | 'package_templates';

export interface ProvisioningNode {
  key:         ProvisioningNodeKey;
  dependsOn:   ProvisioningNodeKey[];
  implemented: boolean;
}

export const PROVISIONING_GRAPH: ProvisioningNode[] = [
  { key: 'branch',              dependsOn: [],                                        implemented: true  },
  { key: 'instructor',          dependsOn: [],                                        implemented: false },
  { key: 'vehicle',             dependsOn: ['branch'],                                implemented: false },
  { key: 'lesson_types',        dependsOn: [],                                        implemented: true  },
  { key: 'schedule_templates',  dependsOn: ['lesson_types'],                          implemented: true  },
  { key: 'generated_slots',     dependsOn: ['schedule_templates', 'instructor', 'vehicle'], implemented: false },
  // Lesson Packages (Execution Direction, 2026-08-07 — "Business Capability
  // Completion"): package_catalog templates, tiered by quantity, scaffolded
  // after lesson_types exist. See provisioning-engine.ts for exactly what
  // it does and does not create (price is a genuine business decision,
  // left unset — mirrors the existing lesson_types precedent).
  { key: 'package_templates',   dependsOn: ['lesson_types'],                          implemented: true  },
];

/**
 * Generic Kahn's-algorithm topological sort, extracted so any other
 * `{key, dependsOn}` graph in this codebase can reuse the exact same
 * ordering logic instead of a second copy of it — e.g.
 * provisioning-domains.ts's Business Domain graph (Execution Direction,
 * 2026-08-07: "extend the existing Dependency Engine, do not duplicate
 * dependency logic"). `resolveExecutionOrder` below is now a thin,
 * behavior-identical wrapper around this for the original provisioning
 * node graph — nothing about its inputs/outputs/error text changed.
 */
export interface DependencyGraphNode<K extends string> {
  key:       K;
  dependsOn: K[];
}

export function topologicalSort<K extends string>(graph: DependencyGraphNode<K>[], graphLabel: string): K[] {
  const byKey = new Map(graph.map((n) => [n.key, n]));
  for (const node of graph) {
    for (const dep of node.dependsOn) {
      if (!byKey.has(dep)) throw new Error(`${graphLabel}: unknown node "${dep}" referenced by "${node.key}"`);
    }
  }

  const ready = graph.filter((n) => n.dependsOn.length === 0).map((n) => n.key);
  const order: K[] = [];
  const remaining = new Map(graph.map((n) => [n.key, new Set(n.dependsOn)]));

  while (ready.length > 0) {
    const key = ready.shift()!;
    order.push(key);
    for (const node of graph) {
      const deps = remaining.get(node.key)!;
      if (deps.delete(key) && deps.size === 0 && !order.includes(node.key) && !ready.includes(node.key)) {
        ready.push(node.key);
      }
    }
  }

  if (order.length !== graph.length) throw new Error(`${graphLabel}: cycle detected in graph`);
  return order;
}

/** Topological sort — Kahn's algorithm. Throws on a cycle (a graph-authoring bug, not a runtime condition). */
export function resolveExecutionOrder(graph: ProvisioningNode[] = PROVISIONING_GRAPH): ProvisioningNodeKey[] {
  return topologicalSort(graph, 'Dependency Engine');
}
