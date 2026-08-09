import { useState, useMemo, useEffect } from 'react';
import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import {
  ChevronRight, Shield, Plus, Pencil, Trash2,
  Users, Loader2, Eye, UserPlus,
} from 'lucide-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Button, Skeleton, Label,
  Card, CardContent,
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
  Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
  toast,
} from '@platform/ui';
import { cn } from '@/lib/utils.js';
import { supabase } from '@core/api/supabase.js';
import { useSession } from '@shared/hooks/useSession.js';
import { PermissionGate } from '@core/rbac/PermissionGate.js';
import { Permissions } from '@core/rbac/permissions.js';

// ─── Types ────────────────────────────────────────────────────────────────────

interface RoleRow {
  id:              string;
  organization_id: string | null;
  name:            string;
  display_name:    string;
  description:     string | null;
  is_system_role:  boolean;
  is_custom:       boolean;
  sort_order:      number;
}

interface PermRow {
  id:          string;
  code:        string;
  domain:      string;
  resource:    string;
  action:      string;
  description: string | null;
}

interface RolePermRow {
  id:            string;
  role_id:       string;
  permission_id: string;
}

interface MembershipRow {
  id:      string;
  user_id: string;
}

interface ProfileRow {
  id:         string;
  first_name: string;
  last_name:  string;
  email:      string;
}

interface MembershipRoleRow {
  id:            string;
  membership_id: string;
  role_id:       string;
  is_active:     boolean;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const DOMAIN_ORDER = [
  'students', 'instructors', 'scheduling', 'finance',
  'documents', 'communications', 'reporting', 'administration', 'corporate',
];

const DOMAIN_LABELS: Record<string, string> = {
  students:       'Elever',
  instructors:    'Lärare',
  scheduling:     'Schema & Bokningar',
  finance:        'Ekonomi',
  documents:      'Dokument',
  communications: 'Kommunikation',
  reporting:      'Rapporter',
  administration: 'Administration',
  corporate:      'Företagskunder',
};

const ACTION_LABELS: Record<string, string> = {
  create:    'Skapa',
  read:      'Läsa',
  update:    'Redigera',
  delete:    'Ta bort',
  export:    'Exportera',
  import:    'Importera',
  approve:   'Godkänna',
  void:      'Makulera',
  assign:    'Tilldela',
  advance:   'Avancera',
  archive:   'Arkivera',
  run:       'Köra',
  manage:    'Hantera',
  configure: 'Konfigurera',
  send:      'Skicka',
};

const EMPTY_CREATE = { display_name: '', description: '' };

// ─── Helpers ──────────────────────────────────────────────────────────────────

function toRoleName(displayName: string): string {
  return displayName.toLowerCase().trim()
    .replace(/å/g, 'a').replace(/ä/g, 'a').replace(/ö/g, 'o')
    .replace(/\s+/g, '_')
    .replace(/[^a-z0-9_]/g, '')
    .slice(0, 60);
}

function getInitials(p: ProfileRow): string {
  return `${p.first_name[0] ?? ''}${p.last_name[0] ?? ''}`.toUpperCase();
}

// ─── RolesSettingsPage ────────────────────────────────────────────────────────

export function RolesSettingsPage() {
  const { organization } = useSession();
  const orgId = organization?.id;
  const qc = useQueryClient();

  // ── Sheet state ────────────────────────────────────────────────────────────
  const [sheetOpen,   setSheetOpen]   = useState(false);
  const [sheetRole,   setSheetRole]   = useState<RoleRow | null>(null);
  const [activeTab,   setActiveTab]   = useState<'perms' | 'users'>('perms');
  const [editName,    setEditName]    = useState('');
  const [editDesc,    setEditDesc]    = useState('');
  const [pendingPerm, setPendingPerm] = useState<Set<string>>(new Set());
  const [nameError,   setNameError]   = useState('');

  // ── Create dialog state ───────────────────────────────────────────────────
  const [createOpen,   setCreateOpen]   = useState(false);
  const [createForm,   setCreateForm]   = useState(EMPTY_CREATE);
  const [createErrors, setCreateErrors] = useState<Record<string, string>>({});

  // ── Assign user dialog state ──────────────────────────────────────────────
  const [assignOpen,   setAssignOpen]   = useState(false);
  const [assignUserId, setAssignUserId] = useState('');

  // ── Delete confirm dialog ─────────────────────────────────────────────────
  const [deleteTarget, setDeleteTarget] = useState<RoleRow | null>(null);
  const [confirmOpen,  setConfirmOpen]  = useState(false);

  // ── Queries ───────────────────────────────────────────────────────────────

  const { data: roles = [], isLoading: rolesLoading } = useQuery<RoleRow[]>({
    queryKey: ['settings-roles', orgId],
    queryFn: async () => {
      if (!orgId) return [];
      const { data, error } = await supabase
        .from('roles')
        .select('id, organization_id, name, display_name, description, is_system_role, is_custom, sort_order')
        .order('sort_order');
      if (error) throw error;
      return (data ?? []) as RoleRow[];
    },
    enabled: !!orgId,
    staleTime: 30_000,
  });

  const { data: allPerms = [] } = useQuery<PermRow[]>({
    queryKey: ['settings-permissions-catalog'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('permissions')
        .select('id, code, domain, resource, action, description')
        .eq('is_active', true)
        .order('domain');
      if (error) throw error;
      return (data ?? []) as PermRow[];
    },
    staleTime: 300_000,
  });

  const { data: rolePerms = [] } = useQuery<RolePermRow[]>({
    queryKey: ['settings-role-permissions', orgId],
    queryFn: async () => {
      if (!orgId) return [];
      const { data, error } = await supabase
        .from('role_permissions')
        .select('id, role_id, permission_id');
      if (error) throw error;
      return (data ?? []) as RolePermRow[];
    },
    enabled: !!orgId,
    staleTime: 30_000,
  });

  const { data: memberships = [], isLoading: membershipsLoading } = useQuery<MembershipRow[]>({
    queryKey: ['settings-roles-memberships', orgId],
    queryFn: async () => {
      if (!orgId) return [];
      const { data, error } = await supabase
        .from('memberships')
        .select('id, user_id')
        .eq('organization_id', orgId)
        .neq('status', 'removed');
      if (error) throw error;
      return (data ?? []) as MembershipRow[];
    },
    enabled: !!orgId,
    staleTime: 30_000,
  });

  // profiles has no organization_id column (removed in Phase 1B.2 — org
  // context flows through memberships only, see packages/types/auth.types.ts;
  // same fix already applied to UsersSettingsPage.tsx). Scope by the member
  // ids resolved above, not a direct org filter.
  const memberIds = useMemo(() => memberships.map(m => m.user_id), [memberships]);

  const { data: profiles = [] } = useQuery<ProfileRow[]>({
    queryKey: ['settings-roles-profiles', orgId, memberIds],
    queryFn: async () => {
      if (memberIds.length === 0) return [];
      const { data, error } = await supabase
        .from('profiles')
        .select('id, first_name, last_name, email')
        .in('id', memberIds)
        .is('deleted_at', null)
        .order('first_name');
      if (error) throw error;
      return (data ?? []) as ProfileRow[];
    },
    enabled: !!orgId && !membershipsLoading,
    staleTime: 30_000,
  });

  const { data: membershipRoles = [] } = useQuery<MembershipRoleRow[]>({
    queryKey: ['settings-membership-roles', orgId],
    queryFn: async () => {
      if (!orgId) return [];
      const { data, error } = await supabase
        .from('membership_roles')
        .select('id, membership_id, role_id, is_active')
        .eq('organization_id', orgId);
      if (error) throw error;
      return (data ?? []) as MembershipRoleRow[];
    },
    enabled: !!orgId,
    staleTime: 30_000,
  });

  // ── Derived maps ──────────────────────────────────────────────────────────

  const memberIdToUserId = useMemo(
    () => new Map(memberships.map(m => [m.id, m.user_id])),
    [memberships]
  );

  const userToMembershipId = useMemo(
    () => new Map(memberships.map(m => [m.user_id, m.id])),
    [memberships]
  );

  const profileMap = useMemo(
    () => new Map(profiles.map(p => [p.id, p])),
    [profiles]
  );

  const permCountMap = useMemo(() => {
    const m = new Map<string, number>();
    for (const rp of rolePerms) {
      m.set(rp.role_id, (m.get(rp.role_id) ?? 0) + 1);
    }
    return m;
  }, [rolePerms]);

  const roleUserCountMap = useMemo(() => {
    const m = new Map<string, number>();
    for (const mr of membershipRoles) {
      if (mr.is_active) m.set(mr.role_id, (m.get(mr.role_id) ?? 0) + 1);
    }
    return m;
  }, [membershipRoles]);

  const permsByDomain = useMemo(() => {
    const grouped = new Map<string, PermRow[]>();
    for (const p of allPerms) {
      const list = grouped.get(p.domain) ?? [];
      list.push(p);
      grouped.set(p.domain, list);
    }
    return grouped;
  }, [allPerms]);

  const sheetRoleUsers = useMemo(() => {
    if (!sheetRole) return [];
    return membershipRoles
      .filter(mr => mr.role_id === sheetRole.id && mr.is_active)
      .map(mr => {
        const userId  = memberIdToUserId.get(mr.membership_id);
        const profile = userId ? profileMap.get(userId) : undefined;
        return profile ? { mrId: mr.id, profile } : null;
      })
      .filter((x): x is { mrId: string; profile: ProfileRow } => x !== null);
  }, [sheetRole, membershipRoles, memberIdToUserId, profileMap]);

  const assignableProfiles = useMemo(() => {
    if (!sheetRole) return profiles;
    const assignedIds = new Set(
      membershipRoles
        .filter(mr => mr.role_id === sheetRole.id && mr.is_active)
        .map(mr => memberIdToUserId.get(mr.membership_id))
        .filter((uid): uid is string => uid !== undefined)
    );
    return profiles.filter(p => !assignedIds.has(p.id));
  }, [sheetRole, membershipRoles, memberIdToUserId, profiles]);

  // ── Side effects ──────────────────────────────────────────────────────────

  useEffect(() => {
    if (!sheetRole) return;
    setEditName(sheetRole.display_name);
    setEditDesc(sheetRole.description ?? '');
    setNameError('');
    setPendingPerm(
      new Set(rolePerms.filter(rp => rp.role_id === sheetRole.id).map(rp => rp.permission_id))
    );
  }, [sheetRole, rolePerms]);

  // ── Helpers ───────────────────────────────────────────────────────────────

  function invalidate() {
    void qc.invalidateQueries({ queryKey: ['settings-roles', orgId] });
    void qc.invalidateQueries({ queryKey: ['settings-role-permissions', orgId] });
    void qc.invalidateQueries({ queryKey: ['settings-membership-roles', orgId] });
  }

  function openSheet(role: RoleRow) {
    setSheetRole(role);
    setActiveTab('perms');
    setSheetOpen(true);
  }

  function closeSheet() {
    setSheetOpen(false);
    setSheetRole(null);
  }

  function togglePerm(permId: string) {
    setPendingPerm(prev => {
      const next = new Set(prev);
      if (next.has(permId)) next.delete(permId);
      else next.add(permId);
      return next;
    });
  }

  // ── Mutations ─────────────────────────────────────────────────────────────

  const saveRole = useMutation({
    mutationFn: async () => {
      if (!sheetRole?.is_custom) return;
      const name = editName.trim();
      if (!name) { setNameError('Rollnamn krävs.'); throw new Error('validation'); }
      setNameError('');

      const { error: roleErr } = await supabase
        .from('roles')
        .update({ display_name: name, description: editDesc.trim() || null } as never)
        .eq('id', sheetRole.id);
      if (roleErr) throw roleErr;

      const originalIds = new Set(
        rolePerms.filter(rp => rp.role_id === sheetRole.id).map(rp => rp.permission_id)
      );
      const toAdd    = [...pendingPerm].filter(id => !originalIds.has(id));
      const toRemove = rolePerms
        .filter(rp => rp.role_id === sheetRole.id && !pendingPerm.has(rp.permission_id))
        .map(rp => rp.id);

      if (toAdd.length > 0) {
        const { error } = await supabase
          .from('role_permissions')
          .insert(toAdd.map(pid => ({ role_id: sheetRole.id, permission_id: pid })) as never);
        if (error) throw error;
      }
      if (toRemove.length > 0) {
        const { error } = await supabase
          .from('role_permissions')
          .delete()
          .in('id', toRemove);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      invalidate();
      closeSheet();
      toast({ title: 'Rollen sparades' });
    },
    onError: (e: Error) => {
      if (e.message !== 'validation')
        toast({ title: 'Fel vid sparning', variant: 'destructive' });
    },
  });

  const createRole = useMutation({
    mutationFn: async () => {
      if (!orgId) return;
      const errs: Record<string, string> = {};
      if (!createForm.display_name.trim()) errs['display_name'] = 'Rollnamn krävs.';
      if (Object.keys(errs).length > 0) { setCreateErrors(errs); throw new Error('validation'); }
      const { error } = await supabase
        .from('roles')
        .insert({
          organization_id: orgId,
          name:            toRoleName(createForm.display_name),
          display_name:    createForm.display_name.trim(),
          description:     createForm.description.trim() || null,
          is_custom:       true,
          is_system_role:  false,
          sort_order:      100,
        } as never);
      if (error) throw error;
    },
    onSuccess: () => {
      invalidate();
      setCreateOpen(false);
      setCreateForm(EMPTY_CREATE);
      setCreateErrors({});
      toast({ title: 'Rollen skapades' });
    },
    onError: (e: Error) => {
      if (e.message !== 'validation')
        toast({ title: 'Fel vid skapande av roll', variant: 'destructive' });
    },
  });

  const deleteRole = useMutation({
    mutationFn: async (roleId: string) => {
      const { error } = await supabase.from('roles').delete().eq('id', roleId);
      if (error) throw error;
    },
    onSuccess: () => {
      invalidate();
      setConfirmOpen(false);
      setDeleteTarget(null);
      toast({ title: 'Rollen togs bort' });
    },
    onError: () => toast({ title: 'Fel vid borttagning', variant: 'destructive' }),
  });

  const assignUser = useMutation({
    mutationFn: async () => {
      if (!sheetRole || !assignUserId) return;
      const membershipId = userToMembershipId.get(assignUserId);
      if (!membershipId) throw new Error('Membership hittades inte.');

      const existing = membershipRoles.find(
        mr => mr.membership_id === membershipId && mr.role_id === sheetRole.id
      );
      if (existing) {
        const { error } = await supabase
          .from('membership_roles')
          .update({ is_active: true } as never)
          .eq('id', existing.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('membership_roles')
          .insert({ membership_id: membershipId, role_id: sheetRole.id, is_active: true } as never);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      invalidate();
      setAssignOpen(false);
      setAssignUserId('');
      toast({ title: 'Rollen tilldelades användaren' });
    },
    onError: () => toast({ title: 'Fel vid tilldelning', variant: 'destructive' }),
  });

  const unassignUser = useMutation({
    mutationFn: async (mrId: string) => {
      const { error } = await supabase
        .from('membership_roles')
        .update({ is_active: false } as never)
        .eq('id', mrId);
      if (error) throw error;
    },
    onSuccess: () => {
      invalidate();
      toast({ title: 'Rollen togs bort från användaren' });
    },
    onError: () => toast({ title: 'Fel vid borttagning', variant: 'destructive' }),
  });

  // ── Derived lists ─────────────────────────────────────────────────────────

  const systemRoles = roles.filter(r => r.is_system_role);
  const customRoles = roles.filter(r => r.is_custom);

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <PermissionGate permission={Permissions.ADMIN_ROLE_READ}>
    <div className="max-w-4xl space-y-5">

      {/* Breadcrumb + action */}
      <div className="flex items-center justify-between">
        <nav aria-label="Brödsmulor" className="flex items-center gap-1 text-xs text-muted-foreground">
          <Link to="/settings" className="hover:text-foreground transition-colors">Inställningar</Link>
          <ChevronRight className="w-3 h-3" aria-hidden="true" />
          <span className="text-foreground font-medium">Roller</span>
        </nav>
        <Button size="sm" onClick={() => setCreateOpen(true)}>
          <Plus className="w-4 h-4 mr-1.5" />
          Skapa roll
        </Button>
      </div>

      {/* Header card */}
      <Card>
        <CardContent className="p-6 flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-indigo-100 dark:bg-indigo-900/30 flex items-center justify-center shrink-0">
            <Shield className="w-6 h-6 text-indigo-600 dark:text-indigo-400" strokeWidth={1.75} aria-hidden="true" />
          </div>
          <div className="flex-1 min-w-0">
            <h1 className="text-lg font-semibold text-foreground">Roller & Behörigheter</h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              Hantera roller och styr personalens åtkomst till systemets funktioner.
            </p>
          </div>
          <div className="hidden sm:flex items-center gap-6 shrink-0 text-right">
            <div>
              <p className="text-lg font-semibold tabular-nums text-foreground">{systemRoles.length}</p>
              <p className="text-xs text-muted-foreground">Systemroller</p>
            </div>
            <div>
              <p className="text-lg font-semibold tabular-nums text-foreground">{customRoles.length}</p>
              <p className="text-xs text-muted-foreground">Anpassade</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Loading skeleton */}
      {rolesLoading && (
        <div className="space-y-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-14 w-full rounded-xl" />
          ))}
        </div>
      )}

      {/* System roles */}
      {!rolesLoading && systemRoles.length > 0 && (
        <div className="space-y-2">
          <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground px-0.5">
            Systemroller
          </p>
          <div className="rounded-xl border border-border overflow-hidden">
            {systemRoles.map((role, idx) => (
              <RoleListRow
                key={role.id}
                role={role}
                permCount={permCountMap.get(role.id) ?? 0}
                userCount={roleUserCountMap.get(role.id) ?? 0}
                isLast={idx === systemRoles.length - 1}
                onOpen={() => openSheet(role)}
                onDelete={null}
              />
            ))}
          </div>
        </div>
      )}

      {/* Custom roles */}
      {!rolesLoading && (
        <div className="space-y-2">
          <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground px-0.5">
            Anpassade roller
          </p>
          {customRoles.length === 0 ? (
            <Card>
              <CardContent className="py-12 flex flex-col items-center gap-3 text-center">
                <div className="w-12 h-12 rounded-xl bg-muted flex items-center justify-center">
                  <Shield className="w-6 h-6 text-muted-foreground" strokeWidth={1.75} aria-hidden="true" />
                </div>
                <div>
                  <p className="text-sm font-medium text-foreground">Inga anpassade roller</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Skapa en anpassad roll för att ge personal precis rätt åtkomst.
                  </p>
                </div>
                <Button size="sm" variant="outline" onClick={() => setCreateOpen(true)}>
                  <Plus className="w-4 h-4 mr-1.5" />
                  Skapa din första roll
                </Button>
              </CardContent>
            </Card>
          ) : (
            <div className="rounded-xl border border-border overflow-hidden">
              {customRoles.map((role, idx) => (
                <RoleListRow
                  key={role.id}
                  role={role}
                  permCount={permCountMap.get(role.id) ?? 0}
                  userCount={roleUserCountMap.get(role.id) ?? 0}
                  isLast={idx === customRoles.length - 1}
                  onOpen={() => openSheet(role)}
                  onDelete={() => { setDeleteTarget(role); setConfirmOpen(true); }}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Role Detail Dialog ──────────────────────────────────────────────── */}
      <Dialog open={sheetOpen} onOpenChange={open => { if (!open) closeSheet(); }}>
        <DialogContent className="w-full sm:max-w-lg max-h-[85vh] p-0 flex flex-col overflow-hidden">

          {/* Header */}
          <DialogHeader className="px-6 py-4 border-b border-border shrink-0 pr-12">
            <div className="flex items-center gap-2 min-w-0">
              <DialogTitle className="text-base font-semibold truncate">
                {sheetRole?.display_name}
              </DialogTitle>
              {sheetRole?.is_system_role && (
                <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400 shrink-0">
                  System
                </span>
              )}
              {sheetRole?.is_custom && (
                <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-400 shrink-0">
                  Anpassad
                </span>
              )}
            </div>
            {sheetRole?.description && (
              <DialogDescription className="text-xs text-muted-foreground truncate">
                {sheetRole.description}
              </DialogDescription>
            )}
          </DialogHeader>

          {/* Tab bar */}
          <div className="flex border-b border-border px-6 shrink-0">
            {(['perms', 'users'] as const).map(tab => (
              <button
                key={tab}
                type="button"
                onClick={() => setActiveTab(tab)}
                className={cn(
                  'mr-5 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors',
                  activeTab === tab
                    ? 'border-primary text-foreground'
                    : 'border-transparent text-muted-foreground hover:text-foreground'
                )}
              >
                {tab === 'perms' ? 'Behörigheter' : 'Användare'}
              </button>
            ))}
          </div>

          {/* Tab content */}
          <div className="flex-1 overflow-y-auto">
            {activeTab === 'perms' && (
              <div className="px-6 py-4 space-y-5">

                {/* Editable info (custom roles only) */}
                {sheetRole?.is_custom && (
                  <div className="space-y-3">
                    <Field id="sheet-name" label="Rollnamn" required error={nameError || undefined}>
                      <input
                        id="sheet-name"
                        value={editName}
                        onChange={e => setEditName(e.target.value)}
                        className="w-full h-9 px-3 text-sm rounded-lg border border-border bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40"
                        placeholder="T.ex. Assistent"
                      />
                    </Field>
                    <Field id="sheet-desc" label="Beskrivning">
                      <textarea
                        id="sheet-desc"
                        value={editDesc}
                        onChange={e => setEditDesc(e.target.value)}
                        rows={2}
                        className="w-full px-3 py-2 text-sm rounded-lg border border-border bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40 resize-none"
                        placeholder="Beskriv rollens syfte (valfritt)"
                      />
                    </Field>
                  </div>
                )}

                {/* Permissions */}
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground mb-3">
                    Behörigheter
                    <span className="ml-2 font-normal normal-case text-foreground">
                      {pendingPerm.size} valda
                    </span>
                  </p>
                  <div className="space-y-5">
                    {DOMAIN_ORDER
                      .filter(d => permsByDomain.has(d))
                      .map(domain => {
                        const perms = permsByDomain.get(domain) ?? [];
                        return (
                          <div key={domain}>
                            <p className="text-xs font-medium text-muted-foreground mb-2">
                              {DOMAIN_LABELS[domain] ?? domain}
                            </p>
                            <div className="space-y-1.5">
                              {perms.map(perm => (
                                <label
                                  key={perm.id}
                                  className={cn(
                                    'flex items-start gap-2.5',
                                    sheetRole?.is_custom ? 'cursor-pointer' : 'cursor-default'
                                  )}
                                >
                                  <input
                                    type="checkbox"
                                    checked={pendingPerm.has(perm.id)}
                                    onChange={() => { if (sheetRole?.is_custom) togglePerm(perm.id); }}
                                    disabled={!sheetRole?.is_custom}
                                    className="w-4 h-4 mt-0.5 rounded border-border accent-primary shrink-0"
                                  />
                                  <div className="min-w-0">
                                    <span className="text-sm text-foreground">
                                      {ACTION_LABELS[perm.action] ?? perm.action}
                                    </span>
                                    <span className="text-sm text-muted-foreground ml-1">
                                      {perm.resource}
                                    </span>
                                    {perm.description && (
                                      <p className="text-xs text-muted-foreground/70 leading-snug">
                                        {perm.description}
                                      </p>
                                    )}
                                  </div>
                                </label>
                              ))}
                            </div>
                          </div>
                        );
                      })}
                  </div>
                </div>
              </div>
            )}

            {activeTab === 'users' && (
              <div className="px-6 py-4 space-y-3">
                <div className="flex items-center justify-between">
                  <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
                    Tilldelade användare
                    <span className="ml-2 font-normal normal-case text-foreground">
                      {sheetRoleUsers.length}
                    </span>
                  </p>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 text-xs"
                    onClick={() => { setAssignUserId(''); setAssignOpen(true); }}
                  >
                    <UserPlus className="w-3.5 h-3.5 mr-1" />
                    Tilldela
                  </Button>
                </div>

                {sheetRoleUsers.length === 0 ? (
                  <div className="py-10 text-center text-sm text-muted-foreground">
                    Inga användare har denna roll ännu.
                  </div>
                ) : (
                  <div className="space-y-1.5">
                    {sheetRoleUsers.map(({ mrId, profile }) => (
                      <div
                        key={mrId}
                        className="flex items-center gap-3 p-2.5 rounded-lg border border-border bg-card"
                      >
                        <div className="w-8 h-8 rounded-full bg-indigo-100 dark:bg-indigo-900/30 flex items-center justify-center text-xs font-semibold text-indigo-700 dark:text-indigo-300 shrink-0">
                          {getInitials(profile)}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-foreground truncate">
                            {profile.first_name} {profile.last_name}
                          </p>
                          <p className="text-xs text-muted-foreground truncate">{profile.email}</p>
                        </div>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 text-xs text-destructive hover:text-destructive shrink-0"
                          onClick={() => unassignUser.mutate(mrId)}
                          disabled={unassignUser.isPending}
                        >
                          Ta bort
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Footer */}
          <DialogFooter className="px-6 py-4 border-t border-border shrink-0 flex-row justify-end gap-2">
            <Button variant="outline" size="sm" onClick={closeSheet}>Stäng</Button>
            {sheetRole?.is_custom && (
              <Button
                size="sm"
                onClick={() => saveRole.mutate()}
                disabled={saveRole.isPending}
              >
                {saveRole.isPending && <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />}
                Spara
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Assign User Dialog ──────────────────────────────────────────────── */}
      <Dialog open={assignOpen} onOpenChange={setAssignOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Tilldela användare</DialogTitle>
            <DialogDescription>
              Välj en användare att tilldela rollen{' '}
              <span className="font-medium text-foreground">{sheetRole?.display_name}</span>.
            </DialogDescription>
          </DialogHeader>
          <div className="py-2">
            {assignableProfiles.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-3">
                Alla användare har redan denna roll.
              </p>
            ) : (
              <Select value={assignUserId} onValueChange={setAssignUserId}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Välj användare…" />
                </SelectTrigger>
                <SelectContent>
                  {assignableProfiles.map(p => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.first_name} {p.last_name} — {p.email}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setAssignOpen(false)}>Avbryt</Button>
            <Button
              size="sm"
              onClick={() => assignUser.mutate()}
              disabled={!assignUserId || assignUser.isPending || assignableProfiles.length === 0}
            >
              {assignUser.isPending && <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />}
              Tilldela
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Create Role Dialog ──────────────────────────────────────────────── */}
      <Dialog
        open={createOpen}
        onOpenChange={open => {
          if (!open) { setCreateOpen(false); setCreateForm(EMPTY_CREATE); setCreateErrors({}); }
        }}
      >
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Skapa roll</DialogTitle>
            <DialogDescription>
              Skapa en anpassad roll med specifika behörigheter för din organisation.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <Field id="create-name" label="Rollnamn" required error={createErrors['display_name'] ?? undefined}>
              <input
                id="create-name"
                value={createForm.display_name}
                onChange={e => setCreateForm(f => ({ ...f, display_name: e.target.value }))}
                className="w-full h-9 px-3 text-sm rounded-lg border border-border bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40"
                placeholder="T.ex. Assistent"
                autoFocus
              />
            </Field>
            <Field id="create-desc" label="Beskrivning">
              <textarea
                id="create-desc"
                value={createForm.description}
                onChange={e => setCreateForm(f => ({ ...f, description: e.target.value }))}
                rows={3}
                className="w-full px-3 py-2 text-sm rounded-lg border border-border bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40 resize-none"
                placeholder="Beskriv rollens syfte (valfritt)"
              />
            </Field>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              size="sm"
              onClick={() => { setCreateOpen(false); setCreateForm(EMPTY_CREATE); setCreateErrors({}); }}
            >
              Avbryt
            </Button>
            <Button size="sm" onClick={() => createRole.mutate()} disabled={createRole.isPending}>
              {createRole.isPending && <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />}
              Skapa roll
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Delete Confirm Dialog ───────────────────────────────────────────── */}
      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Ta bort roll</DialogTitle>
            <DialogDescription>
              Är du säker på att du vill ta bort rollen{' '}
              <span className="font-medium text-foreground">{deleteTarget?.display_name}</span>?
              {' '}Alla användare med denna roll förlorar sina tilldelade behörigheter.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setConfirmOpen(false)}>Avbryt</Button>
            <Button
              variant="destructive"
              size="sm"
              onClick={() => deleteTarget && deleteRole.mutate(deleteTarget.id)}
              disabled={deleteRole.isPending}
            >
              {deleteRole.isPending && <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />}
              Ta bort
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

    </div>
    </PermissionGate>
  );
}

// ─── Private Components ───────────────────────────────────────────────────────

function RoleListRow({
  role, permCount, userCount, isLast, onOpen, onDelete,
}: {
  role:      RoleRow;
  permCount: number;
  userCount: number;
  isLast:    boolean;
  onOpen:    () => void;
  onDelete:  (() => void) | null;
}) {
  return (
    <div
      className={cn(
        'flex items-center gap-3 px-4 py-3 bg-card hover:bg-accent/30 transition-colors',
        !isLast && 'border-b border-border'
      )}
    >
      <div className="w-9 h-9 rounded-lg bg-indigo-100 dark:bg-indigo-900/30 flex items-center justify-center shrink-0">
        <Shield className="w-4 h-4 text-indigo-600 dark:text-indigo-400" aria-hidden="true" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-sm font-medium text-foreground">{role.display_name}</span>
          {role.is_system_role && (
            <span className="text-[10px] font-medium px-1 py-0.5 rounded bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400 shrink-0">
              System
            </span>
          )}
        </div>
        {role.description && (
          <p className="text-xs text-muted-foreground truncate">{role.description}</p>
        )}
      </div>
      <div className="hidden md:flex items-center gap-4 shrink-0 text-xs text-muted-foreground">
        <span className="flex items-center gap-1" title="Behörigheter">
          <Shield className="w-3.5 h-3.5" aria-hidden="true" />
          {permCount}
        </span>
        <span className="flex items-center gap-1" title="Användare">
          <Users className="w-3.5 h-3.5" aria-hidden="true" />
          {userCount}
        </span>
      </div>
      <div className="flex items-center gap-0.5 shrink-0">
        {onDelete ? (
          <>
            <Button
              size="sm"
              variant="ghost"
              className="h-8 w-8 p-0"
              onClick={onOpen}
              title="Redigera"
            >
              <Pencil className="w-3.5 h-3.5" aria-hidden="true" />
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="h-8 w-8 p-0 text-destructive hover:text-destructive"
              onClick={onDelete}
              title="Ta bort"
            >
              <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
            </Button>
          </>
        ) : (
          <Button
            size="sm"
            variant="ghost"
            className="h-8 w-8 p-0"
            onClick={onOpen}
            title="Visa"
          >
            <Eye className="w-3.5 h-3.5" aria-hidden="true" />
          </Button>
        )}
      </div>
    </div>
  );
}

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
    <div className="space-y-1.5">
      <Label htmlFor={id} className="text-sm font-medium text-foreground">
        {label}
        {required === true && <span className="text-destructive ml-0.5" aria-hidden="true">*</span>}
      </Label>
      {children}
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}
