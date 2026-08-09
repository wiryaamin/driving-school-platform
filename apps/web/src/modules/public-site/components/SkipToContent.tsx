/**
 * Visually hidden until focused — the first focusable element on every
 * public page, per WCAG 2.4.1 (Bypass Blocks). Jumps keyboard/screen-reader
 * users straight to <main>, skipping the header/nav on every page load.
 */
export function SkipToContent() {
  return (
    <a
      href="#main-content"
      className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-md focus:bg-primary focus:px-4 focus:py-2 focus:text-sm focus:font-medium focus:text-primary-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
    >
      Hoppa till innehåll
    </a>
  );
}
