import { useParams, useNavigate } from 'react-router-dom';
import { PageLayout, PageHeader, PageContent } from '@shared/components/layout/PageLayout/PageLayout.js';
import { useInstructor } from '../hooks/useInstructors.js';
import { InstructorDetailContent } from '../components/InstructorDetailContent.js';

// ─── InstructorDetailPage ──────────────────────────────────────────────────────
//
// Thin, route-specific wrapper around InstructorDetailContent for the
// standalone /instructors/:id route: supplies the id from the URL, the page
// chrome (breadcrumbs), and "back" = navigate to /instructors.
//
// All actual instructor detail content/logic lives in InstructorDetailContent,
// which is also rendered directly inside the Personal workspace without this
// wrapper (no route change there — see modules/staff/routes/StaffPage.tsx).

export function InstructorDetailPage() {
  const { id }   = useParams<{ id: string }>();
  const navigate = useNavigate();

  // Fetched here too (in addition to inside InstructorDetailContent) purely for
  // the breadcrumb title — same query key, so React Query dedupes it to one
  // request rather than issuing two.
  const { data: instructor } = useInstructor(id ?? null);
  const fullName = instructor ? `${instructor.first_name} ${instructor.last_name}` : 'Lärare';

  return (
    <PageLayout>
      <PageHeader
        title={fullName}
        breadcrumbs={[
          { label: 'Hem' },
          { label: 'Personal', href: '/instructors' },
          { label: fullName },
        ]}
      />
      <PageContent>
        <InstructorDetailContent
          instructorId={id ?? ''}
          onBack={() => navigate('/instructors')}
        />
      </PageContent>
    </PageLayout>
  );
}
