import type { ReactNode } from 'react';
import { Outlet } from 'react-router-dom';
import { Toaster } from '@platform/ui';
import { SkipToContent } from '../components/SkipToContent.js';
import { Header } from '../components/Header.js';
import { Footer } from '../components/Footer.js';

/**
 * Shared shell for every public page (Home, Platform, Business Challenges,
 * Onboarding, Resources, Support, About, Contact, Demo, legal). Individual
 * pages render inside <Outlet /> — this layout owns only the persistent
 * header/footer chrome, never page content itself.
 *
 * Accepts an optional `children` override for callers rendering it outside
 * the router's nested-route tree (e.g. the root `/` route), which have no
 * <Outlet /> match to fall back on.
 */
export function PublicLayout({ children }: { children?: ReactNode } = {}) {
  return (
    <div className="flex min-h-screen flex-col bg-background">
      <SkipToContent />
      <Header />
      <main id="main-content" className="flex-1">
        {children ?? <Outlet />}
      </main>
      <Footer />
      <Toaster />
    </div>
  );
}
