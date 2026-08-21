import { useState, useMemo } from 'react';
import { Users, Loader2, Search, ChevronRight, Plus } from 'lucide-react';
import { PageLayout, PageHeader, PageContent } from '@shared/components/layout/PageLayout/PageLayout.js';
import { PermissionGate } from '@core/rbac/PermissionGate.js';
import { usePermissions } from '@core/rbac/hooks.js';
import { Permissions } from '@core/rbac/permissions.js';
import { Button, Tabs, TabsList, TabsTrigger, TabsContent } from '@platform/ui';
import { useInstructorList } from '@modules/instructors/hooks/useInstructors.js';
import { InstructorForm } from '@modules/instructors/components/InstructorForm.js';
import { InstructorDetailContent } from '@modules/instructors/components/InstructorDetailContent.js';
import { useOrgUsers } from '@modules/settings/hooks/useOrgUsers.js';
import type { OrgUserRow } from '@modules/settings/hooks/useOrgUsers.js';
import { UserEditDialog } from '@modules/settings/components/UserEditDialog.js';
import { computeInvitationStatus, INVITATION_STATUS_LABEL, INVITATION_STATUS_CLASS, JOB_TITLE_LABEL } from '@modules/settings/lib/orgUserUtils.js';
import type { InstructorEmploymentType } from '@platform/types';
import { ADMIN_ROLE_LABELS } from '../hooks/usePersonnel.js';
import { AddPersonnelDialog } from '../components/AddPersonnelDialog.js';

// ─── Status badges ────────────────────────────────────────────────────────────

function InstructorStatusBadge({ type }: { type: InstructorEmploymentType }) {
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

function AdminStatusBadge({ member }: { member: OrgUserRow }) {
  const status = computeInvitationStatus(member);
  const isActive = member.is_active && member.membership_status !== 'suspended';
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${
      status !== 'accepted'
        ? INVITATION_STATUS_CLASS[status]
        : isActive
          ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
          : 'bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400'
    }`}>
      {status !== 'accepted' ? INVITATION_STATUS_LABEL[status] : isActive ? 'Aktiv' : 'Inaktiv'}
    </span>
  );
}

// ─── Empty / loading states ────────────────────────────────────────────────────

function LoadingRows() {
  return (
    <div className="flex items-center justify-center py-24">
      <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
    </div>
  );
}

function EmptyState({ search, label }: { search: string; label: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-24 text-center">
      <Users className="mb-4 h-12 w-12 text-muted-foreground" />
      <p className="font-medium text-foreground">
        {search ? 'Ingen personal matchar sökningen.' : label}
      </p>
    </div>
  );
}

// ─── Instructor table (reused across "Alla" and "Instruktörer") ──────────────

function InstructorTable({
  instructors, search, isLoading, onRowClick,
}: {
  instructors: Array<{ id: string; first_name: string; last_name: string; email: string | null; phone: string | null; employment_type: InstructorEmploymentType }>;
  search:      string;
  isLoading:   boolean;
  onRowClick:  (id: string) => void;
}) {
  if (isLoading) return <LoadingRows />;
  if (instructors.length === 0) return <EmptyState search={search} label="Ingen personal registrerad." />;

  return (
    <div className="overflow-x-auto rounded-lg border border-border">
      <table className="min-w-full divide-y divide-border text-sm">
        <thead className="bg-muted/50">
          <tr>
            <th className="px-4 py-3 text-left font-medium text-muted-foreground">Namn</th>
            <th className="px-4 py-3 text-left font-medium text-muted-foreground">E-post</th>
            <th className="px-4 py-3 text-left font-medium text-muted-foreground">Telefon</th>
            <th className="px-4 py-3 text-left font-medium text-muted-foreground">Befattning</th>
            <th className="px-4 py-3 text-left font-medium text-muted-foreground">Status</th>
            <th className="px-4 py-3 text-right font-medium text-muted-foreground" />
          </tr>
        </thead>
        <tbody className="divide-y divide-border bg-background">
          {instructors.map((instructor) => (
            <tr key={instructor.id} className="hover:bg-muted/30 transition-colors cursor-pointer" onClick={() => onRowClick(instructor.id)}>
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
              <td className="px-4 py-3 text-muted-foreground">Trafiklärare</td>
              <td className="px-4 py-3">
                <InstructorStatusBadge type={instructor.employment_type} />
              </td>
              <td className="px-4 py-3 text-right">
                <span className="inline-flex items-center gap-1 rounded px-2 py-1 text-xs text-muted-foreground hover:text-foreground">
                  Detaljer
                  <ChevronRight className="h-3 w-3" />
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ─── Admin (org member) table (reused across "Alla" and "Administratörer") ───

function AdminTable({
  members, search, isLoading, onRowClick,
}: {
  members:    OrgUserRow[];
  search:     string;
  isLoading:  boolean;
  onRowClick: (member: OrgUserRow) => void;
}) {
  if (isLoading) return <LoadingRows />;
  if (members.length === 0) return <EmptyState search={search} label="Ingen administrativ personal registrerad." />;

  return (
    <div className="overflow-x-auto rounded-lg border border-border">
      <table className="min-w-full divide-y divide-border text-sm">
        <thead className="bg-muted/50">
          <tr>
            <th className="px-4 py-3 text-left font-medium text-muted-foreground">Namn</th>
            <th className="px-4 py-3 text-left font-medium text-muted-foreground">E-post</th>
            <th className="px-4 py-3 text-left font-medium text-muted-foreground">Befattning</th>
            <th className="px-4 py-3 text-left font-medium text-muted-foreground">Systemroll</th>
            <th className="px-4 py-3 text-left font-medium text-muted-foreground">Status</th>
            <th className="px-4 py-3 text-right font-medium text-muted-foreground" />
          </tr>
        </thead>
        <tbody className="divide-y divide-border bg-background">
          {members.map((member) => (
            <tr key={member.user_id} className="hover:bg-muted/30 transition-colors cursor-pointer" onClick={() => onRowClick(member)}>
              <td className="px-4 py-3">
                <div className="flex items-center gap-2">
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-violet-100 dark:bg-violet-900/30 text-xs font-semibold text-violet-700 dark:text-violet-300">
                    {member.first_name[0]}{member.last_name[0]}
                  </div>
                  <span className="font-medium text-foreground">
                    {member.first_name} {member.last_name}
                  </span>
                </div>
              </td>
              <td className="px-4 py-3 text-muted-foreground">{member.email}</td>
              <td className="px-4 py-3 text-muted-foreground">{JOB_TITLE_LABEL[member.job_title ?? ''] ?? '—'}</td>
              <td className="px-4 py-3 text-muted-foreground">{member.role_display}</td>
              <td className="px-4 py-3">
                <AdminStatusBadge member={member} />
              </td>
              <td className="px-4 py-3 text-right">
                <span className="inline-flex items-center gap-1 rounded px-2 py-1 text-xs text-muted-foreground hover:text-foreground">
                  Hantera
                  <ChevronRight className="h-3 w-3" />
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

const NON_INSTRUCTOR_ROLES = new Set(Object.keys(ADMIN_ROLE_LABELS));

export function StaffPage() {
  const { can } = usePermissions();
  const canViewAdmins = can(Permissions.ADMIN_USER_READ);

  const [search, setSearch] = useState('');
  const [activeTab, setActiveTab] = useState('all');
  const [addOpen, setAddOpen] = useState(false);
  const [instructorFormOpen, setInstructorFormOpen] = useState(false);

  // In-workspace detail state — replaces the Personal content area instead of
  // navigating to /instructors/:id. Cleared whenever the user switches tabs
  // (see Tabs' onValueChange below) so no stale detail lingers under another tab.
  const [selectedInstructorId, setSelectedInstructorId] = useState<string | null>(null);
  // Admin detail is presented as a dialog (an already-existing, self-contained
  // reusable piece — see UserEditDialog), so it isn't tab-scoped the same way.
  const [selectedAdmin, setSelectedAdmin] = useState<OrgUserRow | null>(null);

  const { data: instructorData, isLoading: instructorsLoading } = useInstructorList({ per_page: 100 });
  const instructors = useMemo(() => instructorData?.data ?? [], [instructorData]);

  const { data: orgUsersData, isLoading: adminsLoading } = useOrgUsers({ enabled: canViewAdmins });
  const orgUsers = useMemo(() => orgUsersData ?? [], [orgUsersData]);

  // "Administratörer" excludes instructor/instructor_senior invite-roles — those
  // represent portal access for people who belong in the Instruktörer tab instead.
  const adminMembers = useMemo(
    () => orgUsers.filter((m) => NON_INSTRUCTOR_ROLES.has(m.role)),
    [orgUsers],
  );

  // De-duplicate "Alla": an instructor who also holds a portal account (linked
  // via instructors.user_id) must appear once, as an instructor — not twice.
  const instructorUserIds = useMemo(
    () => new Set(instructors.map((i) => i.user_id).filter((id): id is string => !!id)),
    [instructors],
  );
  const adminMembersForAll = useMemo(
    () => adminMembers.filter((m) => !instructorUserIds.has(m.user_id)),
    [adminMembers, instructorUserIds],
  );

  const filteredInstructors = useMemo(() => instructors.filter((i) =>
    !search ||
    `${i.first_name} ${i.last_name}`.toLowerCase().includes(search.toLowerCase()) ||
    (i.email ?? '').toLowerCase().includes(search.toLowerCase())
  ), [instructors, search]);

  const matchesSearch = useMemo(() => (m: OrgUserRow) =>
    !search ||
    `${m.first_name} ${m.last_name}`.toLowerCase().includes(search.toLowerCase()) ||
    m.email.toLowerCase().includes(search.toLowerCase()),
  [search]);
  const filteredAdmins = useMemo(() => adminMembers.filter(matchesSearch), [adminMembers, matchesSearch]);
  const filteredAdminsForAll = useMemo(() => adminMembersForAll.filter(matchesSearch), [adminMembersForAll, matchesSearch]);

  const isLoadingAll = instructorsLoading || (canViewAdmins && adminsLoading);

  function handleTabChange(value: string) {
    setActiveTab(value);
    // Switching category closes any open in-workspace detail rather than
    // leaving stale instructor content visible under a different tab.
    setSelectedInstructorId(null);
  }

  return (
    <PageLayout>
      <PageHeader
        title="Personal"
        description="Instruktörer och administratörer samlat på ett ställe."
        actions={
          <Button size="sm" onClick={() => setAddOpen(true)}>
            <Plus className="h-4 w-4 mr-1.5" />
            Lägg till personal
          </Button>
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
          {/* Personal workspace shell: title/description above stay visible;
              search + tabs + content area below all remain part of this same
              page — nothing here is a route change. */}

          {/* Search */}
          {selectedInstructorId === null && (
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
          )}

          <Tabs value={activeTab} onValueChange={handleTabChange}>
            <TabsList>
              <TabsTrigger value="all">Alla personal</TabsTrigger>
              {canViewAdmins && <TabsTrigger value="admins">Administratörer</TabsTrigger>}
              <TabsTrigger value="instructors">Instruktörer</TabsTrigger>
            </TabsList>

            <TabsContent value="all" className="mt-4">
              {selectedInstructorId ? (
                <InstructorDetailContent
                  instructorId={selectedInstructorId}
                  onBack={() => setSelectedInstructorId(null)}
                />
              ) : isLoadingAll ? <LoadingRows /> : (
                <div className="space-y-6">
                  <InstructorTable
                    instructors={filteredInstructors}
                    search={search}
                    isLoading={false}
                    onRowClick={setSelectedInstructorId}
                  />
                  {canViewAdmins && filteredAdminsForAll.length > 0 && (
                    <AdminTable
                      members={filteredAdminsForAll}
                      search={search}
                      isLoading={false}
                      onRowClick={setSelectedAdmin}
                    />
                  )}
                </div>
              )}
            </TabsContent>

            {canViewAdmins && (
              <TabsContent value="admins" className="mt-4">
                <AdminTable
                  members={filteredAdmins}
                  search={search}
                  isLoading={adminsLoading}
                  onRowClick={setSelectedAdmin}
                />
              </TabsContent>
            )}

            <TabsContent value="instructors" className="mt-4">
              {selectedInstructorId ? (
                <InstructorDetailContent
                  instructorId={selectedInstructorId}
                  onBack={() => setSelectedInstructorId(null)}
                />
              ) : (
                <InstructorTable
                  instructors={filteredInstructors}
                  search={search}
                  isLoading={instructorsLoading}
                  onRowClick={setSelectedInstructorId}
                />
              )}
            </TabsContent>
          </Tabs>
        </PermissionGate>
      </PageContent>

      <AddPersonnelDialog
        open={addOpen}
        onOpenChange={setAddOpen}
        onSelectInstructor={() => setInstructorFormOpen(true)}
      />
      <InstructorForm
        open={instructorFormOpen}
        onOpenChange={setInstructorFormOpen}
        instructor={null}
      />

      {/* Administrator detail/edit — reuses the exact same dialog Settings →
          Användare uses, opened here in place instead of navigating there. */}
      <UserEditDialog
        member={selectedAdmin}
        open={selectedAdmin !== null}
        onOpenChange={(open) => { if (!open) setSelectedAdmin(null); }}
      />
    </PageLayout>
  );
}
