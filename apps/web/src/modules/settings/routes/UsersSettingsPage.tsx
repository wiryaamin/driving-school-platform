import { useState, useMemo } from 'react';
import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import {
  ChevronRight, Users, Search, Pencil, UserX, UserCheck,
  Mail, Plus, Loader2,
} from 'lucide-react';
import {
  Button, Skeleton, Label,
  Card, CardContent,
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
  toast,
} from '@platform/ui';
import type { InvitableRole } from '@platform/validation';
import { cn } from '@/lib/utils.js';
import { PermissionGate } from '@core/rbac/PermissionGate.js';
import { Permissions } from '@core/rbac/permissions.js';
import {
  useOrgUsers, useToggleOrgUserActive, useInviteOrgUser,
} from '../hooks/useOrgUsers.js';
import type { OrgUserRow } from '../hooks/useOrgUsers.js';
import {
  INVITATION_STATUS_LABEL, INVITATION_STATUS_CLASS,
  computeInvitationStatus, formatLastSeen, getInitials,
} from '../lib/orgUserUtils.js';
import { UserEditDialog } from '../components/UserEditDialog.js';

// ─── Types ────────────────────────────────────────────────────────────────────

interface InviteForm {
  email:      string;
  first_name: string;
  last_name:  string;
  role:       InvitableRole;
}

const ROLE_LABELS: Record<InvitableRole, string> = {
  org_admin:         'Administratör',
  org_manager:       'Chef',
  instructor:        'Lärare',
  instructor_senior: 'Lärare (Senior)',
  receptionist:      'Receptionist',
  finance_admin:     'Ekonomi',
  student_admin:     'Elevadmin',
  reporting_viewer:  'Rapportläsare',
  corporate_contact: 'Företagskontakt',
};

// ─── Constants ────────────────────────────────────────────────────────────────

const EMPTY_INVITE: InviteForm = {
  email: '', first_name: '', last_name: '', role: 'instructor',
};

// ─── Validation ───────────────────────────────────────────────────────────────

function validateInvite(f: InviteForm): Record<string, string> {
  const e: Record<string, string> = {};
  if (!f.email.trim())
    e['email'] = 'E-postadress krävs.';
  else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(f.email.trim()))
    e['email'] = 'Ange en giltig e-postadress.';
  if (!f.first_name.trim()) e['first_name'] = 'Förnamn krävs.';
  if (!f.last_name.trim())  e['last_name']  = 'Efternamn krävs.';
  return e;
}

// ─── UsersSettingsPage ────────────────────────────────────────────────────────

export function UsersSettingsPage() {
  const [search,       setSearch]      = useState('');
  const [sheetOpen,    setSheetOpen]   = useState(false);
  const [editTarget,   setEditTarget]  = useState<OrgUserRow | null>(null);
  const [inviteOpen,   setInviteOpen]  = useState(false);
  const [inviteForm,   setInviteForm]  = useState<InviteForm>(EMPTY_INVITE);
  const [inviteErrors, setInviteErrors] = useState<Record<string, string>>({});

  const { data: staff = [], isLoading } = useOrgUsers();

  const filtered = useMemo(() =>
    !search.trim()
      ? staff
      : staff.filter(u =>
          `${u.first_name} ${u.last_name}`.toLowerCase().includes(search.toLowerCase()) ||
          u.email.toLowerCase().includes(search.toLowerCase())
        ),
    [staff, search]
  );

  const activeCount = staff.filter(u => u.is_active).length;

  // ── Mutations ─────────────────────────────────────────────────────────────

  const toggleActive = useToggleOrgUserActive();

  const inviteUser = useInviteOrgUser();

  // ── Handlers ──────────────────────────────────────────────────────────────

  function openEdit(u: OrgUserRow) {
    setEditTarget(u);
    setSheetOpen(true);
  }

  function openInvite() {
    setInviteForm(EMPTY_INVITE);
    setInviteErrors({});
    setInviteOpen(true);
  }

  function handleInvite() {
    const errors = validateInvite(inviteForm);
    if (Object.keys(errors).length > 0) { setInviteErrors(errors); return; }
    inviteUser.mutate(inviteForm, {
      onSuccess: (status) => {
        setInviteOpen(false);
        setInviteForm(EMPTY_INVITE);
        toast(
          status === 'added_existing_user'
            ? {
                title: 'Användare tillagd',
                description: `${inviteForm.email} har redan ett konto och har lagts till i organisationen direkt.`,
              }
            : {
                title: 'Inbjudan skickad',
                description: `En inbjudan har skickats till ${inviteForm.email}.`,
              },
        );
      },
      onError: (e: Error) => toast({ title: 'Fel vid inbjudan', description: e.message, variant: 'destructive' }),
    });
  }

  // ── Loading skeleton ──────────────────────────────────────────────────────

  if (isLoading) {
    return (
      <div className="max-w-3xl space-y-4">
        <Skeleton className="h-24 rounded-xl" />
        <Skeleton className="h-10 rounded-lg" />
        {[...Array(3)].map((_, i) => <Skeleton key={i} className="h-14 rounded-xl" />)}
      </div>
    );
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <PermissionGate permission={Permissions.ADMIN_USER_READ}>
    <div className="max-w-3xl space-y-5">

      {/* Breadcrumb */}
      <nav aria-label="Brödsmulor" className="flex items-center gap-1 text-xs text-muted-foreground">
        <Link to="/settings" className="hover:text-foreground transition-colors">Inställningar</Link>
        <ChevronRight className="w-3 h-3" aria-hidden="true" />
        <span className="text-foreground font-medium">Användare</span>
      </nav>

      {/* Header card */}
      <Card>
        <CardContent className="p-8 flex flex-col sm:flex-row items-start sm:items-center gap-4">
          <div className="w-12 h-12 rounded-2xl bg-violet-100 dark:bg-violet-900/30 flex items-center justify-center shrink-0">
            <Users className="w-6 h-6 text-violet-600 dark:text-violet-400" strokeWidth={1.75} aria-hidden="true" />
          </div>
          <div className="flex-1 min-w-0">
            <h1 className="text-lg font-semibold tracking-tight text-foreground">Användare</h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              Hantera organisationens användare, bjud in nya och ändra åtkomst.
            </p>
          </div>
          <div className="flex items-center gap-4 shrink-0">
            <div className="text-right hidden sm:block">
              <p className="text-xl font-semibold tabular-nums text-foreground">{staff.length}</p>
              <p className="text-xs text-muted-foreground">{activeCount} aktiva</p>
            </div>
            <Button size="sm" onClick={openInvite}>
              <Plus className="w-4 h-4 mr-1.5" aria-hidden="true" />
              Bjud in
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Search */}
      <div className="relative">
        <Search
          className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none"
          aria-hidden="true"
        />
        <input
          type="search"
          placeholder="Sök namn eller e-post…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="w-full pl-9 pr-3 py-2 rounded-lg border border-border bg-background text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
          aria-label="Sök användare"
        />
      </div>

      {/* User list */}
      {filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <Users className="w-10 h-10 mb-3 text-muted-foreground opacity-30" aria-hidden="true" />
          <p className="font-medium text-foreground">
            {search ? 'Ingen användare matchar sökningen.' : 'Inga användare registrerade.'}
          </p>
          {!search && (
            <p className="text-sm text-muted-foreground mt-1">
              Bjud in din första användare för att komma igång.
            </p>
          )}
        </div>
      ) : (
        <div className="rounded-xl border border-border overflow-hidden">
          <table className="min-w-full divide-y divide-border text-sm">
            <thead className="bg-muted/40">
              <tr>
                <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wide">Namn</th>
                <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wide hidden sm:table-cell">E-post</th>
                <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wide">Inbjudan</th>
                <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wide">Konto</th>
                <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wide hidden md:table-cell">Senast aktiv</th>
                <th scope="col" className="px-4 py-3 text-right" aria-label="Åtgärder" />
              </tr>
            </thead>
            <tbody className="divide-y divide-border bg-background">
              {filtered.map(u => (
                <UserListRow
                  key={u.user_id}
                  user={u}
                  onEdit={() => openEdit(u)}
                  onToggleActive={() => toggleActive.mutate(
                    { id: u.user_id, active: !u.is_active },
                    {
                      onSuccess: () => toast({ title: !u.is_active ? 'Användaren aktiverades' : 'Användaren inaktiverades' }),
                      onError: () => toast({ title: 'Fel vid statusändring', variant: 'destructive' }),
                    },
                  )}
                  isMutating={toggleActive.isPending}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}

      <UserEditDialog member={editTarget} open={sheetOpen} onOpenChange={setSheetOpen} />

      {/* ── Invite Dialog ───────────────────────────────────────────────────── */}
      <Dialog open={inviteOpen} onOpenChange={setInviteOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Bjud in användare</DialogTitle>
            <DialogDescription>
              En inbjudan med en länk för att skapa konto skickas till den angivna e-postadressen.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="grid grid-cols-2 gap-3">
              <Field id="inv_first_name" label="Förnamn" required error={inviteErrors['first_name']}>
                <input
                  id="inv_first_name"
                  type="text"
                  value={inviteForm.first_name}
                  onChange={e => setInviteForm(prev => ({ ...prev, first_name: e.target.value }))}
                  className="w-full h-9 px-3 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                  placeholder="Förnamn"
                  aria-required="true"
                />
              </Field>
              <Field id="inv_last_name" label="Efternamn" required error={inviteErrors['last_name']}>
                <input
                  id="inv_last_name"
                  type="text"
                  value={inviteForm.last_name}
                  onChange={e => setInviteForm(prev => ({ ...prev, last_name: e.target.value }))}
                  className="w-full h-9 px-3 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                  placeholder="Efternamn"
                  aria-required="true"
                />
              </Field>
            </div>
            <Field id="inv_email" label="E-postadress" required error={inviteErrors['email']}>
              <div className="relative">
                <Mail
                  className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none"
                  aria-hidden="true"
                />
                <input
                  id="inv_email"
                  type="email"
                  value={inviteForm.email}
                  onChange={e => setInviteForm(prev => ({ ...prev, email: e.target.value }))}
                  className="w-full pl-9 pr-3 h-9 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                  placeholder="namn@foretag.se"
                  aria-required="true"
                />
              </div>
            </Field>
            <Field id="inv_role" label="Roll" required>
              <Select
                value={inviteForm.role}
                onValueChange={(v) => setInviteForm(prev => ({ ...prev, role: v as InvitableRole }))}
              >
                <SelectTrigger id="inv_role">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(ROLE_LABELS).map(([value, label]) => (
                    <SelectItem key={value} value={value}>{label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          </div>

          <DialogFooter className="gap-2">
            <Button variant="outline" size="sm" onClick={() => setInviteOpen(false)}>
              Avbryt
            </Button>
            <Button size="sm" onClick={handleInvite} disabled={inviteUser.isPending}>
              {inviteUser.isPending ? (
                <>
                  <Loader2 className="w-4 h-4 mr-1.5 animate-spin" aria-hidden="true" />
                  Skickar…
                </>
              ) : (
                <>
                  <Mail className="w-4 h-4 mr-1.5" aria-hidden="true" />
                  Skicka inbjudan
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

    </div>
    </PermissionGate>
  );
}

// ─── UserListRow ──────────────────────────────────────────────────────────────

function UserListRow({
  user, onEdit, onToggleActive, isMutating,
}: {
  user:           OrgUserRow;
  onEdit:         () => void;
  onToggleActive: () => void;
  isMutating:     boolean;
}) {
  const isActive = user.is_active && user.membership_status !== 'suspended';
  const invitationStatus = computeInvitationStatus(user);
  return (
    <tr className="hover:bg-muted/30 transition-colors">
      <td className="px-4 py-3">
        <div className="flex items-center gap-3">
          <div
            className="w-8 h-8 rounded-full bg-violet-100 dark:bg-violet-900/30 flex items-center justify-center text-xs font-semibold text-violet-700 dark:text-violet-300 shrink-0 select-none"
            aria-hidden="true"
          >
            {getInitials(user)}
          </div>
          <span className="font-medium text-foreground truncate max-w-[140px]">
            {user.first_name} {user.last_name}
          </span>
        </div>
      </td>
      <td className="px-4 py-3 text-sm text-muted-foreground hidden sm:table-cell truncate max-w-[180px]">
        {user.email}
      </td>
      <td className="px-4 py-3">
        <span className={cn(
          'inline-flex items-center text-[11px] font-semibold px-1.5 py-0.5 rounded leading-none',
          INVITATION_STATUS_CLASS[invitationStatus],
        )}>
          {INVITATION_STATUS_LABEL[invitationStatus]}
        </span>
      </td>
      <td className="px-4 py-3">
        <span className={cn(
          'inline-flex items-center text-[11px] font-semibold px-1.5 py-0.5 rounded leading-none',
          isActive
            ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
            : 'bg-red-100   text-red-600   dark:bg-red-900/30   dark:text-red-400',
        )}>
          {isActive ? 'Aktiv' : 'Inaktiv'}
        </span>
      </td>
      <td className="px-4 py-3 text-sm text-muted-foreground hidden md:table-cell">
        {formatLastSeen(user.last_sign_in_at)}
      </td>
      <td className="px-4 py-3 text-right">
        <div className="inline-flex items-center gap-1">
          <button
            type="button"
            onClick={onEdit}
            className="p-1.5 rounded hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
            aria-label={`Redigera ${user.first_name} ${user.last_name}`}
          >
            <Pencil className="w-3.5 h-3.5" aria-hidden="true" />
          </button>
          <button
            type="button"
            onClick={onToggleActive}
            disabled={isMutating}
            className="p-1.5 rounded hover:bg-muted transition-colors text-muted-foreground hover:text-foreground disabled:opacity-40"
            aria-label={
              user.is_active
                ? `Inaktivera ${user.first_name} ${user.last_name}`
                : `Aktivera ${user.first_name} ${user.last_name}`
            }
          >
            {user.is_active
              ? <UserX      className="w-3.5 h-3.5" aria-hidden="true" />
              : <UserCheck  className="w-3.5 h-3.5" aria-hidden="true" />
            }
          </button>
        </div>
      </td>
    </tr>
  );
}

// ─── Field ────────────────────────────────────────────────────────────────────

function Field({
  id, label, required, error, children,
}: {
  id:        string;
  label:     string;
  required?: boolean | undefined;
  error?:    string | undefined;
  children:  ReactNode;
}) {
  return (
    <div className="space-y-1">
      <Label htmlFor={id} className="text-sm">
        {label}
        {required === true && (
          <span className="text-destructive ml-0.5" aria-hidden="true">*</span>
        )}
      </Label>
      {children}
      {error !== undefined && error !== '' && (
        <p className="text-xs text-destructive" role="alert">{error}</p>
      )}
    </div>
  );
}
