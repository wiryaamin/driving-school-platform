// Tenants author a package's description as one free-text field — there's no
// separate "features" list in the data model. Many naturally write a short
// intro paragraph followed by an inline checklist using ✅ as a bullet
// marker (e.g. "...våra erfarna trafiklärare. Promotion: ✅ Spara upp till
// 2 000 kr ✅ Gratis inskrivning..."), which rendered as one <p> looks like
// a wall of text with emoji sprinkled in rather than a real feature list.
// This is a presentation-layer fix only — no schema/authoring change — that
// detects that pattern and renders it as an actual bulleted list.

const BULLET_MARKER = /✅\s*/g;

export interface ParsedDescription {
  intro:   string | null;
  bullets: string[];
}

export function parseDescriptionBullets(description: string): ParsedDescription {
  if (!description.includes('✅')) return { intro: description, bullets: [] };

  const rawParts = description.split(BULLET_MARKER).map((p) => p.trim());
  const intro    = rawParts[0] || null;
  const bullets  = rawParts.slice(1).filter(Boolean);

  // Need at least 2 bullet-worthy segments to treat this as a checklist —
  // a single ✅ mid-sentence isn't a list, just punctuation.
  if (bullets.length < 2) return { intro: description, bullets: [] };

  return { intro, bullets };
}
