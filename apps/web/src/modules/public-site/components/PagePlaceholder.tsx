import { Link } from 'react-router-dom';
import { Section } from './Section.js';
import { PageHeading } from './PageHeading.js';
import { usePageMeta } from '../lib/usePageMeta.js';

/**
 * Honest "not built yet" state for approved public pages whose content is
 * out of scope for this epic (Platform, Business Challenges, Onboarding,
 * Resources, Support, About, Contact, Demo, legal placeholders). Distinct
 * from the authenticated app's `ComingSoonPage` (@shared/components/placeholders),
 * which redirects to /dashboard — inappropriate here, since a public,
 * unauthenticated visitor has no dashboard to return to. This links back to
 * Home instead.
 */
export function PagePlaceholder({ title, description }: { title: string; description: string }) {
  usePageMeta({ title, description, path: window.location.pathname });

  return (
    <Section className="min-h-[60vh]">
      <PageHeading title={title} description="Det här innehållet är inte publicerat än." />
      <p className="mx-auto mt-6 max-w-xl text-center text-sm text-muted-foreground">{description}</p>
      <div className="mt-10 flex justify-center">
        <Link
          to="/"
          className="text-base font-medium text-foreground transition-colors duration-150 hover:text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 motion-reduce:transition-none"
        >
          Till startsidan
        </Link>
      </div>
    </Section>
  );
}
