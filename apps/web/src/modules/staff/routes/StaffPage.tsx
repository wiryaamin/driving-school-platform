import { useState } from 'react';
import { Link } from 'react-router-dom';
import { UserCheck, Users, Loader2, Search, ChevronRight } from 'lucide-react';
import { PageLayout, PageHeader, PageContent } from '@shared/components/layout/PageLayout/PageLayout.js';
import { PermissionGate } from '@core/rbac/PermissionGate.js';
import { useInstructorList } from '@modules/instructors/hooks/useInstructors.js';
import type { InstructorEmploymentType } from '@platform/types';

// ─── Status badge ─────────────────────────────────────────────────────────────

function StatusBadge({ type }: { type: InstructorEmploymentType }) {
  const labels: Record<InstructorEmploymentType, string> = {
    employed:   'Anställd',
    contractor: 'Konsult',
    external:   'Extern',
    on_leave:   'Tjänstledig',
    inactive:   'Inaktiv',
  };
  const colors: Record<InstructorEmploymentType, string> = {
    employed:   'bg-green-100  text-green-800  dark:bg-green-900/30  dark:text-green-300',
    contractor: 'bg-blue-100   text-blue-800   dark:bg-blue-900/30   dark:text-blue-300',
    external:   'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300',
    on_leave:   'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300',
    inactive:   'bg-gray-100   text-gray-600   dark:bg-gray-800      dark:text-gray-400',
  };
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${colors[type]}`}>
      {labels[type]}
    </span>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export function StaffPage() {
  const [search, setSearch] = useState('');
  const { data, isLoading } = useInstructorList({ per_page: 100 });
  const instructors = data?.data ?? [];

  const filtered = instructors.filter((i) =>
    !search ||
    `${i.first_name} ${i.last_name}`.toLowerCase().includes(search.toLowerCase()) ||
    (i.email ?? '').toLowerCase().includes(search.toLowerCase())
  );

  return (
    <PageLayout>
      <PageHeader
        title="Personal"
        description="Instruktörer och personal"
        actions={
          <Link
            to="/instructors"
            className="inline-flex items-center gap-1.5 rounded-md bg-secondary px-3 py-2 text-sm font-medium text-secondary-foreground hover:bg-secondary/80"
          >
            <UserCheck className="h-4 w-4" />
            Hantera instruktörer
          </Link>
        }
      />

      <PageContent>
        <PermissionGate
          permission="instructors:instructor:read"
          fallback={
            <div className="flex flex-col items-center justify-center py-24 text-center">
              <Users className="mb-4 h-12 w-12 text-muted-foreground" />
              <p className="text-muted-foreground">Du har inte behörighet att visa personal.</p>
            </div>
          }
        >
          {/* Search */}
          <div className="mb-4 flex items-center gap-2">
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <input
                className="w-full rounded-md border border-input bg-background py-2 pl-9 pr-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                placeholder="Sök namn eller e-post…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
          </div>

          {isLoading ? (
            <div className="flex items-center justify-center py-24">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-24 text-center">
              <Users className="mb-4 h-12 w-12 text-muted-foreground" />
              <p className="font-medium text-foreground">
                {search ? 'Ingen personal matchar sökningen.' : 'Ingen personal registrerad.'}
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto rounded-lg border border-border">
              <table className="min-w-full divide-y divide-border text-sm">
                <thead className="bg-muted/50">
                  <tr>
                    <th className="px-4 py-3 text-left font-medium text-muted-foreground">Namn</th>
                    <th className="px-4 py-3 text-left font-medium text-muted-foreground">E-post</th>
                    <th className="px-4 py-3 text-left font-medium text-muted-foreground">Telefon</th>
                    <th className="px-4 py-3 text-left font-medium text-muted-foreground">Status</th>
                    <th className="px-4 py-3 text-right font-medium text-muted-foreground" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-border bg-background">
                  {filtered.map((instructor) => (
                    <tr key={instructor.id} className="hover:bg-muted/30 transition-colors">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
                            {instructor.first_name[0]}{instructor.last_name[0]}
                          </div>
                          <span className="font-medium text-foreground">
                            {instructor.first_name} {instructor.last_name}
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">{instructor.email ?? '—'}</td>
                      <td className="px-4 py-3 text-muted-foreground">{instructor.phone ?? '—'}</td>
                      <td className="px-4 py-3">
                        <StatusBadge type={instructor.employment_type} />
                      </td>
                      <td className="px-4 py-3 text-right">
                        <Link
                          to={`/instructors/${instructor.id}`}
                          className="inline-flex items-center gap-1 rounded px-2 py-1 text-xs text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                        >
                          Detaljer
                          <ChevronRight className="h-3 w-3" />
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </PermissionGate>
      </PageContent>
    </PageLayout>
  );
}
