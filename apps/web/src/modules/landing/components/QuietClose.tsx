import { Container } from '@modules/public-site/index.js';

/**
 * Scene 10 — Quiet Close.
 *
 * The closing statement uses docs/LANDING_PAGE_STRATEGY_V4_FINAL_BLUEPRINT.md
 * §7's approved Sweden-positioning line — the newer, more refined version of
 * the original Creative Blueprint's closing statement, explicitly designed
 * for exactly this use. Deliberately the most minimal scene on the page
 * (Creative Blueprint: "minimal — a single closing statement") — reduced,
 * fixed padding rather than the full responsive section ladder, since this
 * is a coda, not a full-weight scene. The shared site Footer (Public
 * Website Foundation) renders immediately after this, carrying navigation,
 * Kundinloggning, and Platform Login — this component owns only the closing
 * line itself.
 */
export function QuietClose() {
  return (
    <section className="w-full bg-background px-8 py-12 md:py-16">
      <Container>
        <p className="text-center text-base font-medium text-foreground">
          Byggt för svenska trafikskolor, först.
        </p>
      </Container>
    </section>
  );
}
