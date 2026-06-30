import { useState } from 'react';
import {
  Bell,
  ChevronRight,
  Filter,
  MailCheck,
  MessageSquare,
  Plus,
  RefreshCcw,
  Settings,
  XCircle,
} from 'lucide-react';
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Label,
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  Switch,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  Textarea,
  toast,
} from '@platform/ui';
import { PageLayout, PageHeader, PageContent } from '@shared/components/layout/PageLayout/PageLayout.js';
import { PermissionGate } from '@core/rbac/PermissionGate.js';
import { Permissions } from '@core/rbac/permissions.js';
import {
  useNotificationList,
  useNotificationDetail,
  useNotificationPreferences,
  useCreateNotification,
  useCancelNotification,
  useUpsertPreference,
  type Notification,
  type NotificationStatus,
  type NotificationChannel,
  type NotificationPreference,
  type ListNotificationsParams,
  type CreateNotificationInput,
} from '../hooks/useNotifications.js';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const CHANNEL_LABELS: Record<string, string> = {
  email:  'E-post',
  sms:    'SMS',
  push:   'Push',
  in_app: 'In-app',
};
const STATUS_META: Record<string, { label: string; cls: string }> = {
  pending:   { label: 'Väntar',     cls: 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300' },
  sent:      { label: 'Skickad',    cls: 'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300' },
  delivered: { label: 'Levererad',  cls: 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300' },
  failed:    { label: 'Misslyckad', cls: 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300' },
  cancelled: { label: 'Avbruten',   cls: 'bg-gray-100 text-gray-600 dark:bg-gray-800/60 dark:text-gray-400' },
};

function StatusBadge({ status }: { status: NotificationStatus }) {
  const s = STATUS_META[status] ?? { label: status, cls: 'bg-gray-100 text-gray-600' };
  return (
    <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[11px] font-medium ${s.cls}`}>
      {s.label}
    </span>
  );
}

function channelLabel(c: string) { return CHANNEL_LABELS[c] ?? c; }

function formatTs(ts: string | null) {
  if (!ts) return '–';
  return new Date(ts).toLocaleString('sv-SE', { dateStyle: 'short', timeStyle: 'short' });
}

// ─── Notification detail sheet ────────────────────────────────────────────────

function CancelDialog({ notification, onClose }: { notification: Notification; onClose: () => void }) {
  const cancel = useCancelNotification(notification.id);

  async function handleCancel() {
    try {
      await cancel.mutateAsync();
      toast({ title: 'Notifikation avbruten' });
      onClose();
    } catch (e) {
      toast({ title: 'Fel', description: String(e), variant: 'destructive' });
    }
  }

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent>
        <DialogHeader><DialogTitle>Avbryt notifikation</DialogTitle></DialogHeader>
        <p className="text-sm text-muted-foreground py-2">
          Notifikationen markeras som avbruten och skickas inte.
          Mallnyckel: <span className="font-mono text-foreground">{notification.template_key}</span>
        </p>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Stäng</Button>
          <Button variant="destructive" disabled={cancel.isPending} onClick={() => void handleCancel()}>
            <XCircle className="w-3.5 h-3.5 mr-1.5" />
            Avbryt notifikation
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function NotificationDetailSheet({ id, onClose }: { id: string; onClose: () => void }) {
  const { data: notif, isLoading } = useNotificationDetail(id);
  const [cancelling, setCancelling] = useState(false);

  return (
    <>
      <Sheet open onOpenChange={(o) => { if (!o) onClose(); }}>
        <SheetContent className="w-[480px] sm:w-[540px] overflow-y-auto">
          <SheetHeader>
            <SheetTitle>Notifikation</SheetTitle>
          </SheetHeader>

          {isLoading ? (
            <div className="mt-6 space-y-3">{[1,2,3,4].map((i) => <div key={i} className="h-8 bg-muted rounded animate-pulse" />)}</div>
          ) : notif ? (
            <div className="mt-4 space-y-4">
              <div className="flex items-center gap-2">
                <StatusBadge status={notif.status} />
                <Badge variant="outline" className="text-xs">{channelLabel(notif.channel)}</Badge>
              </div>

              <dl className="space-y-2 text-sm">
                {[
                  ['Mallnyckel',     notif.template_key],
                  ['Mottagare-ID',   notif.recipient_id],
                  ['Mottagartyp',    notif.recipient_type],
                  ['Språk',         notif.locale],
                  ['Skapad',         formatTs(notif.created_at)],
                  ['Planerad',       formatTs(notif.scheduled_for)],
                  ['Skickad',        formatTs(notif.sent_at)],
                  ['Misslyckad',     formatTs(notif.failed_at)],
                  ['Referenstyp',   notif.reference_type ?? '–'],
                  ['Referens-ID',   notif.reference_id   ?? '–'],
                ].map(([label, value]) => (
                  <div key={label} className="flex justify-between gap-4 border-b pb-1.5">
                    <dt className="text-muted-foreground shrink-0">{label}</dt>
                    <dd className="text-right font-mono text-xs break-all">{String(value ?? '–')}</dd>
                  </div>
                ))}
              </dl>

              {notif.subject && (
                <div className="space-y-1">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Ämne</p>
                  <p className="text-sm">{notif.subject}</p>
                </div>
              )}

              {notif.body && (
                <div className="space-y-1">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Innehåll</p>
                  <pre className="text-xs whitespace-pre-wrap bg-muted/40 rounded-lg p-3 max-h-48 overflow-y-auto">{notif.body}</pre>
                </div>
              )}

              {notif.failure_reason && (
                <div className="rounded-lg border border-red-200 bg-red-50 dark:bg-red-950/20 p-3 text-sm">
                  <p className="font-medium text-red-700 dark:text-red-400 mb-1">Felorsak</p>
                  <p className="text-red-600 dark:text-red-300 text-xs font-mono">{notif.failure_reason}</p>
                </div>
              )}

              {Object.keys(notif.metadata ?? {}).length > 0 && (
                <div className="space-y-1">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Metadata</p>
                  <pre className="text-xs bg-muted/40 rounded-lg p-3 max-h-32 overflow-y-auto">{JSON.stringify(notif.metadata, null, 2)}</pre>
                </div>
              )}

              {(notif.status === 'pending' || notif.status === 'failed') && (
                <PermissionGate permission={Permissions.NOTIFICATIONS_NOTIFICATION_CREATE}>
                  <Button variant="destructive" className="w-full" onClick={() => setCancelling(true)}>
                    <XCircle className="w-3.5 h-3.5 mr-1.5" />
                    Avbryt notifikation
                  </Button>
                </PermissionGate>
              )}
            </div>
          ) : null}
        </SheetContent>
      </Sheet>
      {cancelling && notif && <CancelDialog notification={notif} onClose={() => { setCancelling(false); onClose(); }} />}
    </>
  );
}

// ─── Create notification dialog ───────────────────────────────────────────────

function CreateNotificationDialog({ onClose }: { onClose: () => void }) {
  const create = useCreateNotification();
  const [form, setForm] = useState<CreateNotificationInput>({
    recipient_id:   '',
    recipient_type: 'student',
    channel:        'email',
    template_key:   '',
    locale:         'sv',
  });

  function set<K extends keyof CreateNotificationInput>(field: K) {
    return (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
      setForm((f) => ({ ...f, [field]: e.target.value }));
  }

  async function handleCreate() {
    if (!form.recipient_id.trim() || !form.template_key.trim()) return;
    try {
      await create.mutateAsync(form);
      toast({ title: 'Notifikation skapad' });
      onClose();
    } catch (e) {
      toast({ title: 'Fel', description: String(e), variant: 'destructive' });
    }
  }

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle>Skapa notifikation</DialogTitle></DialogHeader>
        <div className="space-y-3 py-2">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Mottagartyp</Label>
              <select className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm" value={form.recipient_type} onChange={set('recipient_type')}>
                <option value="student">Student</option>
                <option value="instructor">Instruktör</option>
                <option value="admin">Admin</option>
                <option value="profile">Profil</option>
              </select>
            </div>
            <div className="space-y-1.5">
              <Label>Kanal</Label>
              <select className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm" value={form.channel} onChange={set('channel')}>
                <option value="email">E-post</option>
                <option value="sms">SMS</option>
                <option value="push">Push</option>
                <option value="in_app">In-app</option>
              </select>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Mottagare-ID (UUID)</Label>
            <Input placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx" value={form.recipient_id} onChange={set('recipient_id')} />
          </div>
          <div className="space-y-1.5">
            <Label>Mallnyckel</Label>
            <Input placeholder="t.ex. booking.reminder" value={form.template_key} onChange={set('template_key')} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Ämne (valfri)</Label>
              <Input placeholder="Ämnesrad" value={form.subject ?? ''} onChange={set('subject')} />
            </div>
            <div className="space-y-1.5">
              <Label>Schemalagd (valfri)</Label>
              <Input type="datetime-local" value={form.scheduled_for ?? ''} onChange={set('scheduled_for')} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Innehåll (valfri)</Label>
            <Textarea rows={3} placeholder="Notifikationstext…" value={form.body ?? ''} onChange={set('body')} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Avbryt</Button>
          <Button disabled={!form.recipient_id.trim() || !form.template_key.trim() || create.isPending} onClick={() => void handleCreate()}>
            <Bell className="w-3.5 h-3.5 mr-1.5" />
            Skapa
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Notifications list tab ───────────────────────────────────────────────────

function NotificationsTab() {
  const [params, setParams] = useState<ListNotificationsParams>({ per_page: 25 });
  const [creating,    setCreating]    = useState(false);
  const [selectedId,  setSelectedId]  = useState<string | null>(null);
  const [showFilters, setShowFilters] = useState(false);

  const { data, isLoading, refetch } = useNotificationList(params);
  const notifications = data?.data ?? [];
  const meta          = data?.meta;

  function setFilter(field: keyof ListNotificationsParams) {
    return (e: React.ChangeEvent<HTMLSelectElement | HTMLInputElement>) =>
      setParams((p) => ({ ...p, [field]: e.target.value || undefined, page: undefined }));
  }

  const statsByStatus = notifications.reduce<Record<string, number>>((acc, n) => {
    acc[n.status] = (acc[n.status] ?? 0) + 1;
    return acc;
  }, {});

  return (
    <>
      <div className="space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <Button size="sm" variant="outline" onClick={() => setShowFilters(!showFilters)}>
              <Filter className="w-3.5 h-3.5 mr-1.5" />
              Filter
              {Object.values(params).filter(Boolean).length > 1 && (
                <span className="ml-1.5 w-4 h-4 bg-primary text-primary-foreground rounded-full text-[10px] flex items-center justify-center">
                  {Object.values(params).filter((v) => v !== undefined && v !== 25).length}
                </span>
              )}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => void refetch()}>
              <RefreshCcw className="w-3.5 h-3.5" />
            </Button>
            {meta && (
              <span className="text-xs text-muted-foreground">
                {meta.total} totalt
              </span>
            )}
          </div>
          <PermissionGate permission={Permissions.NOTIFICATIONS_NOTIFICATION_CREATE}>
            <Button size="sm" onClick={() => setCreating(true)}>
              <Plus className="w-3.5 h-3.5 mr-1.5" />
              Skapa notifikation
            </Button>
          </PermissionGate>
        </div>

        {/* Collapsible filters */}
        {showFilters && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 p-3 border rounded-lg bg-muted/20">
            <select className="h-8 rounded-md border border-input bg-background px-2 text-xs" value={params.status ?? ''} onChange={setFilter('status')}>
              <option value="">Alla statusar</option>
              {Object.entries(STATUS_META).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
            </select>
            <select className="h-8 rounded-md border border-input bg-background px-2 text-xs" value={params.channel ?? ''} onChange={setFilter('channel')}>
              <option value="">Alla kanaler</option>
              {Object.entries(CHANNEL_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
            <Input
              className="h-8 text-xs"
              placeholder="Mallnyckel…"
              value={params.template_key ?? ''}
              onChange={setFilter('template_key')}
            />
            <Input
              className="h-8 text-xs"
              placeholder="Mottagare-ID…"
              value={params.recipient_id ?? ''}
              onChange={setFilter('recipient_id')}
            />
            <div className="col-span-2 grid grid-cols-2 gap-2">
              <Input type="date" className="h-8 text-xs" value={params.from ?? ''} onChange={setFilter('from')} />
              <Input type="date" className="h-8 text-xs" value={params.to   ?? ''} onChange={setFilter('to')}   />
            </div>
          </div>
        )}

        {/* Mini KPI strip */}
        <div className="flex gap-3 flex-wrap">
          {Object.entries(STATUS_META).map(([status, meta]) => (
            <button
              key={status}
              className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${
                params.status === status ? 'bg-primary text-primary-foreground border-primary' : 'border-border hover:bg-accent'
              }`}
              onClick={() => setParams((p) => ({ ...p, status: p.status === status ? undefined : status as NotificationStatus, page: undefined }))}
            >
              {meta.label} {statsByStatus[status] != null ? `(${statsByStatus[status]})` : ''}
            </button>
          ))}
        </div>

        <Card>
          <CardContent className="p-0">
            {isLoading ? (
              <div className="px-4 py-3 space-y-2">
                {[1,2,3,4,5].map((i) => <div key={i} className="h-11 bg-muted rounded animate-pulse" />)}
              </div>
            ) : notifications.length === 0 ? (
              <div className="py-12 text-center space-y-1">
                <Bell className="w-7 h-7 text-muted-foreground mx-auto" />
                <p className="text-sm font-medium">Inga notifikationer</p>
                <p className="text-xs text-muted-foreground">Prova att ändra filtren.</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="border-b bg-muted/30">
                    <tr>
                      <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Mallnyckel</th>
                      <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Kanal</th>
                      <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Status</th>
                      <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Mottagartyp</th>
                      <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Skapad</th>
                      <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Planerad</th>
                      <th className="w-4" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {notifications.map((n: Notification) => (
                      <tr
                        key={n.id}
                        className="hover:bg-muted/20 cursor-pointer"
                        onClick={() => setSelectedId(n.id)}
                      >
                        <td className="px-4 py-2.5 font-mono text-xs">{n.template_key}</td>
                        <td className="px-4 py-2.5">
                          <Badge variant="outline" className="text-xs">{channelLabel(n.channel)}</Badge>
                        </td>
                        <td className="px-4 py-2.5"><StatusBadge status={n.status} /></td>
                        <td className="px-4 py-2.5 text-xs text-muted-foreground">{n.recipient_type}</td>
                        <td className="px-4 py-2.5 text-xs text-muted-foreground">{formatTs(n.created_at)}</td>
                        <td className="px-4 py-2.5 text-xs text-muted-foreground">{formatTs(n.scheduled_for)}</td>
                        <td className="px-4 py-2.5"><ChevronRight className="w-3.5 h-3.5 text-muted-foreground" /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Pagination */}
        {meta && meta.total_pages > 1 && (
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>Sida {meta.page} av {meta.total_pages}</span>
            <div className="flex gap-1.5">
              <Button size="sm" variant="outline" disabled={meta.page <= 1}
                onClick={() => setParams((p) => ({ ...p, page: (p.page ?? 1) - 1 }))}>
                Föregående
              </Button>
              <Button size="sm" variant="outline" disabled={meta.page >= meta.total_pages}
                onClick={() => setParams((p) => ({ ...p, page: (p.page ?? 1) + 1 }))}>
                Nästa
              </Button>
            </div>
          </div>
        )}
      </div>

      {creating   && <CreateNotificationDialog onClose={() => setCreating(false)} />}
      {selectedId && <NotificationDetailSheet id={selectedId} onClose={() => setSelectedId(null)} />}
    </>
  );
}

// ─── Preferences tab ──────────────────────────────────────────────────────────

const NOTIFICATION_TYPES = [
  { value: 'booking.created',        label: 'Bokning skapad' },
  { value: 'booking.cancelled',      label: 'Bokning avbokad' },
  { value: 'booking.reminder',       label: 'Bokningspåminnelse' },
  { value: 'invoice.issued',         label: 'Faktura utfärdad' },
  { value: 'invoice.overdue',        label: 'Faktura förfallen' },
  { value: 'payment.received',       label: 'Betalning mottagen' },
  { value: 'student.approved',       label: 'Student godkänd' },
  { value: 'package.purchased',      label: 'Paket köpt' },
  { value: 'waitlist.slot_opened',   label: 'Väntelista: tid öppnad' },
];

function PreferencesTab() {
  const [profileId, setProfileId] = useState('');
  const [searched,  setSearched]  = useState('');
  const { data: prefs = [], isLoading } = useNotificationPreferences(searched || null);
  const upsert = useUpsertPreference();

  async function togglePref(pref: NotificationPreference) {
    try {
      await upsert.mutateAsync({
        profile_id:        pref.profile_id,
        channel:           pref.channel,
        notification_type: pref.notification_type,
        enabled:           !pref.enabled,
      });
    } catch (e) {
      toast({ title: 'Fel', description: String(e), variant: 'destructive' });
    }
  }

  async function addPref(channel: string, notifType: string) {
    if (!searched) return;
    try {
      await upsert.mutateAsync({
        profile_id:        searched,
        channel:           channel as NotificationChannel,
        notification_type: notifType,
        enabled:           true,
      });
      toast({ title: 'Inställning sparad' });
    } catch (e) {
      toast({ title: 'Fel', description: String(e), variant: 'destructive' });
    }
  }

  // Group preferences by notification_type
  const byType = prefs.reduce<Record<string, NotificationPreference[]>>((acc, p) => {
    (acc[p.notification_type] ??= []).push(p);
    return acc;
  }, {});

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <Input
          className="max-w-sm"
          placeholder="Profil-ID (UUID)…"
          value={profileId}
          onChange={(e) => setProfileId(e.target.value)}
        />
        <Button
          variant="outline"
          disabled={!profileId.trim()}
          onClick={() => setSearched(profileId.trim())}
        >
          <Settings className="w-3.5 h-3.5 mr-1.5" />
          Hämta inställningar
        </Button>
      </div>

      {searched && (
        <>
          {isLoading ? (
            <div className="space-y-2">{[1,2,3].map((i) => <div key={i} className="h-14 bg-muted rounded-lg animate-pulse" />)}</div>
          ) : (
            <div className="space-y-3">
              {prefs.length === 0 && (
                <div className="py-6 text-center space-y-1 border rounded-lg">
                  <MessageSquare className="w-6 h-6 text-muted-foreground mx-auto" />
                  <p className="text-sm text-muted-foreground">Inga sparade inställningar — standardvärden gäller.</p>
                </div>
              )}

              {/* Existing preferences */}
              {Object.entries(byType).map(([notifType, typedPrefs]) => (
                <Card key={notifType}>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm">{NOTIFICATION_TYPES.find((t) => t.value === notifType)?.label ?? notifType}</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="flex flex-wrap gap-3">
                      {typedPrefs.map((pref) => (
                        <div key={pref.id} className="flex items-center gap-2">
                          <Switch
                            checked={pref.enabled}
                            onCheckedChange={() => void togglePref(pref)}
                            disabled={upsert.isPending}
                          />
                          <span className="text-sm">{channelLabel(pref.channel)}</span>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              ))}

              {/* Add new preference */}
              <PermissionGate permission={Permissions.NOTIFICATIONS_PREFERENCES_MANAGE}>
                <Card>
                  <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Lägg till inställning</CardTitle></CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      {NOTIFICATION_TYPES.map((t) => (
                        <div key={t.value} className="space-y-1">
                          <p className="text-xs font-medium">{t.label}</p>
                          <div className="flex gap-1.5 flex-wrap">
                            {(['email', 'sms', 'push', 'in_app'] as const).map((ch) => {
                              const existing = prefs.find((p) => p.notification_type === t.value && p.channel === ch);
                              if (existing) return null;
                              return (
                                <button
                                  key={ch}
                                  className="text-[10px] px-1.5 py-0.5 rounded border border-dashed border-border hover:bg-accent transition-colors"
                                  onClick={() => void addPref(ch, t.value)}
                                >
                                  + {channelLabel(ch)}
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              </PermissionGate>
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export function NotificationLogPage() {
  return (
    <PageLayout>
      <PageHeader
        title="Notifikationslogg"
        description="Hantera notifikationsposter och kanalprefenser"
        breadcrumbs={[
          { label: 'Hem' },
          { label: 'Kommunikation', href: '/communication' },
          { label: 'Notifikationslogg' },
        ]}
      />

      <PageContent>
        <PermissionGate permission={Permissions.NOTIFICATIONS_NOTIFICATION_READ}>
          <Tabs defaultValue="notifications">
            <TabsList>
              <TabsTrigger value="notifications">
                <Bell className="w-3.5 h-3.5 mr-1.5" />
                Notifikationer
              </TabsTrigger>
              <TabsTrigger value="preferences">
                <MailCheck className="w-3.5 h-3.5 mr-1.5" />
                Kanalinställningar
              </TabsTrigger>
            </TabsList>

            <TabsContent value="notifications" className="mt-5">
              <NotificationsTab />
            </TabsContent>
            <TabsContent value="preferences" className="mt-5">
              <PreferencesTab />
            </TabsContent>
          </Tabs>
        </PermissionGate>
      </PageContent>
    </PageLayout>
  );
}
