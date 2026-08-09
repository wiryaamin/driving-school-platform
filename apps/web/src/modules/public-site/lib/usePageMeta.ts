import { useEffect } from 'react';

const SITE_NAME = 'Trafikcloud';
const DEFAULT_OG_IMAGE = '/og-default.png';

interface PageMeta {
  title: string;
  description: string;
  /** Path only, e.g. "/platform" — combined with the site origin for canonical/OG URLs. */
  path: string;
  ogImage?: string;
  /** Optional JSON-LD payload (schema.org). Injected as a <script type="application/ld+json">, removed on unmount. */
  structuredData?: Record<string, unknown>;
}

const STRUCTURED_DATA_ID = 'page-structured-data';

function setMeta(name: string, content: string, attr: 'name' | 'property' = 'name') {
  let el = document.head.querySelector<HTMLMetaElement>(`meta[${attr}="${name}"]`);
  if (!el) {
    el = document.createElement('meta');
    el.setAttribute(attr, name);
    document.head.appendChild(el);
  }
  el.setAttribute('content', content);
}

function setLink(rel: string, href: string) {
  let el = document.head.querySelector<HTMLLinkElement>(`link[rel="${rel}"]`);
  if (!el) {
    el = document.createElement('link');
    el.setAttribute('rel', rel);
    document.head.appendChild(el);
  }
  el.setAttribute('href', href);
}

/**
 * Sets per-route document metadata for the public site — title, description,
 * canonical URL, and Open Graph tags — via direct DOM manipulation rather
 * than a dependency (react-helmet-async etc.), per the "no unnecessary
 * JavaScript" requirement. This is a client-side-only mechanism: it does not
 * solve pre-render/crawler-without-JS SEO, which would require server-side
 * rendering or static prerendering — a larger change flagged separately as
 * a recommendation, not implemented here.
 *
 * Also flips the app-wide `robots` meta tag (statically "noindex, nofollow"
 * in index.html, correct for the authenticated app) to "index, follow" while
 * a public page is mounted, and restores it on unmount — so the authenticated
 * app's default stays protected even though it shares one index.html with
 * the public site.
 */
export function usePageMeta({
  title,
  description,
  path,
  ogImage = DEFAULT_OG_IMAGE,
  structuredData,
}: PageMeta) {
  useEffect(() => {
    const previousTitle = document.title;
    // Avoid double-branding when a page's own title already leads with the
    // site name (e.g. "Trafikcloud — Allt din trafikskola behöver...").
    const fullTitle = title.includes(SITE_NAME) ? title : `${title} | ${SITE_NAME}`;
    document.title = fullTitle;

    setMeta('description', description);
    setMeta('robots', 'index, follow');

    setMeta('og:site_name', SITE_NAME, 'property');
    setMeta('og:type', 'website', 'property');
    setMeta('og:title', fullTitle, 'property');
    setMeta('og:description', description, 'property');
    setMeta('og:image', ogImage, 'property');
    setMeta('og:url', `${window.location.origin}${path}`, 'property');
    setMeta('twitter:card', 'summary_large_image');

    setLink('canonical', `${window.location.origin}${path}`);

    if (structuredData) {
      let script = document.getElementById(STRUCTURED_DATA_ID) as HTMLScriptElement | null;
      if (!script) {
        script = document.createElement('script');
        script.id = STRUCTURED_DATA_ID;
        script.type = 'application/ld+json';
        document.head.appendChild(script);
      }
      script.textContent = JSON.stringify(structuredData);
    }

    return () => {
      document.title = previousTitle;
      setMeta('robots', 'noindex, nofollow');
      document.getElementById(STRUCTURED_DATA_ID)?.remove();
    };
  }, [title, description, path, ogImage, structuredData]);
}
