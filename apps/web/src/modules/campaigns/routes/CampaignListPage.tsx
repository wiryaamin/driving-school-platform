import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Archive, ChevronRight, Copy, Globe, Lock,
  Monitor, Pause, Play, Plus, RefreshCw,
  Tag, Users, Zap,
} from 'lucide-react';
import {
  Badge,
  Button,
  Card,
  CardContent,
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  toast,
} from '@platform/ui';
import { PageLayout, PageHeader, PageContent } from '@shared/components/layout/PageLayout/PageLayout.js';
import { PermissionGate } from '@core/rbac/PermissionGate.js';
import { Permissions } from '@core/rbac/permissions.js';
import {
  useCampaigns,
  useArchiveCampaign,
  useActivateCampaign,
  usePauseCampaign,
  type Campaign,
  type CampaignType,
  type CampaignVisibility,
  type CampaignStatus,
} from '../hooks/useCampaigns.js';
import { CampaignFormSheet, CAMPAIGN_TYPES } from '../components/CampaignFormSheet.js';
import { formatDate, formatDateTime } from '@modules/finance/lib/financeUtils.js';

// ─── Helpers ──────────────────────────────────────────────────────────────────

export const CAMPAIGN_TYPE_LABELS: Record<CampaignType, string> = {
  percentage_discount: 'Procentrabatt',
  fixed_discount:      'Fast rabatt',
  bonus_lessons:       'Bonuslektioner',
  free_risk1:          'Gratis Risk 1',
  free_risk2:          'Gratis Risk 2',
  seasonal:            'Säsongskampanj',
  promotional_pricing: 'Kampanjpris',
};

export const STATUS_CONFIG: Record<CampaignStatus, { label: string; cls: string }> = {
  draft:     { label: 'Utkast',    cls: 'bg-gray-100 text-gray-600 dark:bg-gray-800/60 dark:text-gray-400' },
  scheduled: { label: 'Schemalagd', cls: 'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300' },
  active:    { label: 'Aktiv',     cls: 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300' },
  paused:    { label: 'Pausad',    cls: 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300' },
  expired:   { label: 'Utgången',  cls: 'bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300' },
  archived:  { label: 'Arkiverad', cls: 'bg-gray-100 text-gray-500 dark:bg-gray-800/60 dark:text-gray-500' },
};

const VISIBILITY_CONFIG: Record<CampaignVisibility, { label: string; icon: React.ElementType; cls: string }> = {
  public:         { label: 'Offentlig',    icon: Globe,    cls: 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300' },
  website:        { label: 'Webb',          icon: Monitor,  cls: 'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300' },
  student_portal: { label: 'Elevportalen', icon: Users,    cls: 'bg-purple-100 text-purple-800 dark:bg-purple-900/40 dark:text-purple-300' },
  internal:       { label: 'Intern',        icon: Lock,     cls: 'bg-gray-100 text-gray-600 dark:bg-gray-800/60 dark:text-gray-400' },
};

function StatusBadge({ status }: { status: CampaignStatus }) {
  const cfg = STATUS_CONFIG[status] ?? STATUS_CONFIG.draft;
  return (
    <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[11px] font-medium ${cfg.cls}`}>
      {cfg.label}
    </span>
  );
}

function VisibilityBadge({ visibility }: { visibility: CampaignVisibility }) {
  const cfg = VISIBILITY_CONFIG[visibility] ?? VISIBILITY_CONFIG.internal;
  const Icon = cfg.icon;
  return (
    <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[11px] font-medium ${cfg.cls}`}>
      <Icon className="w-2.5 h-2.5" />
      {cfg.label}
    </span>
  );
}

function TypeBadge({ type }: { type: CampaignType }) {
  return (
    <Badge variant="outline" className="text-[10px] px-1.5 font-normal">
      {CAMPAIGN_TYPE_LABELS[type] ?? type}
    </Badge>
  );
}

function discountSummary(c: Campaign): string {
  if (c.campaign_type === 'percentage_discount' || (c.campaign_type === 'promotional_pricing' && c.discount_is_pct)) {
    if (c.discount_value) return `${c.discount_value}%`;
  }
  if (c.campaign_type === 'fixed_discount' || (c.campaign_type === 'promotional_pricing' && !c.discount_is_pct)) {
    if (c.discount_value) return `${c.discount_value} kr`;
  }
  if (c.campaign_type === 'bonus_lessons' && c.bonus_lessons) {
    return `+${c.bonus_lessons} lekt.`;
  }
  return '—';
}

// ─── Row actions ──────────────────────────────────────────────────────────────

function ArchiveDialog({ campaign, onClose }: { campaign: Campaign; onClose: () => void }) {
  const archive = useArchiveCampaign(campaign.id);

  async function handle() {
    try {
      await archive.mutateAsync();
      toast({ title: 'Kampanj arkiverad' });
      onClose();
    } catch (e) {
      toast({ title: 'Fel', description: e instanceof Error ? e.message : 'Okänt fel', variant: 'destructive' });
    }
  }

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent>
        <DialogHeader><DialogTitle>Arkivera kampanj</DialogTitle></DialogHeader>
        <p className="text-sm text-muted-foreground py-2">
          "{campaign.name}" arkiveras och inaktiveras omedelbart.
        </p>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Avbryt</Button>
          <Button variant="destructive" disabled={archive.isPending} onClick={() => void handle()}>
            <Archive className="w-3.5 h-3.5 mr-1.5" />
            {archive.isPending ? 'Arkiverar...' : 'Arkivera'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Campaign row ─────────────────────────────────────────────────────────────

function CampaignRow({
  campaign,
  onClone,
}: {
  campaign: Campaign;
  onClone:  (c: Campaign) => void;
}) {
  const navigate   = useNavigate();
  const activate   = useActivateCampaign(campaign.id);
  const pause      = usePauseCampaign(campaign.id);
  const [archiving, setArchiving] = useState(false);

  async function handleActivate() {
    try {
      await activate.mutateAsync();
      toast({ title: 'Kampanj aktiverad' });
    } catch (e) {
      toast({ title: 'Fel', description: e instanceof Error ? e.message : 'Okänt fel', variant: 'destructive' });
    }
  }

  async function handlePause() {
    try {
      await pause.mutateAsync();
      toast({ title: 'Kampanj pausad' });
    } catch (e) {
      toast({ title: 'Fel', description: e instanceof Error ? e.message : 'Okänt fel', variant: 'destructive' });
    }
  }

  const canActivate = campaign.status === 'draft' || campaign.status === 'paused' || campaign.status === 'scheduled';
  const canPause    = campaign.status === 'active';
  const canArchive  = campaign.status !== 'archived';

  return (
    <>
      <tr
        className="group hover:bg-muted/30 cursor-pointer transition-colors"
        onClick={() => void navigate(`/campaigns/${campaign.id}`)}
      >
        {/* Name */}
        <td className="px-4 py-3 min-w-[200px]">
          <p className="text-sm font-medium text-foreground leading-tight">{campaign.name}</p>
          {campaign.description && (
            <p className="text-[11px] text-muted-foreground mt-0.5 truncate max-w-[220px]">
              {campaign.description}
            </p>
          )}
        </td>

        {/* Type */}
        <td className="px-4 py-3 w-[160px]">
          <TypeBadge type={campaign.campaign_type} />
        </td>

        {/* Status */}
        <td className="px-4 py-3 w-[110px]">
          <StatusBadge status={campaign.status} />
        </td>

        {/* Value */}
        <td className="px-4 py-3 w-[90px] text-sm font-mono text-muted-foreground">
          {discountSummary(campaign)}
        </td>

        {/* Priority */}
        <td className="px-4 py-3 w-[80px] text-right text-sm text-muted-foreground">
          {campaign.priority}
        </td>

        {/* Visibility */}
        <td className="px-4 py-3 w-[140px]">
          <VisibilityBadge visibility={campaign.visibility} />
        </td>

        {/* Schedule */}
        <td className="px-4 py-3 w-[110px] text-xs text-muted-foreground">
          {campaign.starts_at ? formatDate(campaign.starts_at) : '—'}
        </td>
        <td className="px-4 py-3 w-[110px] text-xs text-muted-foreground">
          {campaign.ends_at ? formatDate(campaign.ends_at) : '—'}
        </td>

        {/* Updated */}
        <td className="px-4 py-3 w-[110px] text-xs text-muted-foreground">
          {formatDateTime(campaign.updated_at)}
        </td>

        {/* Actions */}
        <td
          className="px-4 py-3 w-[180px]"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
            <PermissionGate permission={Permissions.FINANCE_CAMPAIGN_CREATE}>
              <Button
                size="sm" variant="ghost"
                className="h-7 px-2 text-[11px]"
                onClick={() => onClone(campaign)}
              >
                <Copy className="w-3 h-3 mr-1" />
                Klona
              </Button>
            </PermissionGate>

            <PermissionGate permission={Permissions.FINANCE_CAMPAIGN_UPDATE}>
              {canActivate && (
                <Button
                  size="sm" variant="ghost"
                  className="h-7 px-2 text-[11px] text-green-700"
                  disabled={activate.isPending}
                  onClick={() => void handleActivate()}
                >
                  <Play className="w-3 h-3 mr-1" />
                  Aktivera
                </Button>
              )}
              {canPause && (
                <Button
                  size="sm" variant="ghost"
                  className="h-7 px-2 text-[11px] text-amber-700"
                  disabled={pause.isPending}
                  onClick={() => void handlePause()}
                >
                  <Pause className="w-3 h-3 mr-1" />
                  Pausa
                </Button>
              )}
            </PermissionGate>

            {canArchive && (
              <PermissionGate permission={Permissions.FINANCE_CAMPAIGN_ARCHIVE}>
                <Button
                  size="sm" variant="ghost"
                  className="h-7 px-1.5 text-[11px] text-muted-foreground"
                  onClick={() => setArchiving(true)}
                >
                  <Archive className="w-3 h-3" />
                </Button>
              </PermissionGate>
            )}

            <ChevronRight className="w-4 h-4 text-muted-foreground ml-1 shrink-0" />
          </div>
        </td>
      </tr>

      {archiving && (
        <tr>
          <td colSpan={10}>
            <ArchiveDialog campaign={campaign} onClose={() => setArchiving(false)} />
          </td>
        </tr>
      )}
    </>
  );
}

// ─── CampaignListPage ─────────────────────────────────────────────────────────

export function CampaignListPage() {
  const [statusFilter, setStatusFilter] = useState('');
  const [typeFilter,   setTypeFilter]   = useState('');
  const [search,       setSearch]       = useState('');
  const [page,         setPage]         = useState(1);
  const perPage = 25;

  const [creating,    setCreating]    = useState(false);
  const [cloneSource, setCloneSource] = useState<Campaign | null>(null);

  const { data, isLoading, refetch } = useCampaigns({
    ...(statusFilter ? { status: statusFilter } : {}),
    ...(typeFilter   ? { type:   typeFilter   } : {}),
    page,
    per_page: perPage,
  });

  const campaigns  = data?.data ?? [];
  const total      = data?.meta.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / perPage));

  const filtered = useMemo(() => {
    if (!search.trim()) return campaigns;
    const q = search.toLowerCase();
    return campaigns.filter((c) => c.name.toLowerCase().includes(q));
  }, [campaigns, search]);

  const activeCount    = data?.meta.active_count    ?? 0;
  const scheduledCount = data?.meta.scheduled_count ?? 0;

  function handleFilterChange() { setPage(1); }

  return (
    <PageLayout fullBleed>
      <PageHeader
        description="Skapa och hantera kommersiella kampanjer"
        actions={
          <PermissionGate permission={Permissions.FINANCE_CAMPAIGN_CREATE}>
            <Button size="sm" onClick={() => setCreating(true)}>
              <Plus className="w-3.5 h-3.5 mr-1.5" />
              Ny kampanj
            </Button>
          </PermissionGate>
        }
      />

      <PageContent>
        <PermissionGate permission={Permissions.FINANCE_CAMPAIGN_READ}>
          <div className="space-y-4">

            {/* KPI strip */}
            <div className="grid grid-cols-3 gap-3">
              <Card>
                <CardContent className="pt-4 pb-3">
                  <p className="text-xs text-muted-foreground">Aktiva kampanjer</p>
                  <p className="text-2xl font-bold mt-0.5 flex items-center gap-1.5">
                    {isLoading ? '…' : activeCount}
                    {activeCount > 0 && <Zap className="w-4 h-4 text-green-500" />}
                  </p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-4 pb-3">
                  <p className="text-xs text-muted-foreground">Schemalagda</p>
                  <p className="text-2xl font-bold mt-0.5 flex items-center gap-1.5">
                    {isLoading ? '…' : scheduledCount}
                  </p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-4 pb-3">
                  <p className="text-xs text-muted-foreground">Totalt i listan</p>
                  <p className="text-2xl font-bold mt-0.5">{isLoading ? '…' : total}</p>
                </CardContent>
              </Card>
            </div>

            {/* Filters */}
            <div className="flex flex-wrap items-center gap-2">
              <Input
                placeholder="Sök kampanjnamn..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="h-8 w-[200px] text-xs"
              />
              <select
                className="h-8 rounded-md border border-input bg-background px-2 text-xs"
                value={statusFilter}
                onChange={(e) => { setStatusFilter(e.target.value); handleFilterChange(); }}
              >
                <option value="">Alla statusar</option>
                <option value="draft">Utkast</option>
                <option value="scheduled">Schemalagd</option>
                <option value="active">Aktiv</option>
                <option value="paused">Pausad</option>
                <option value="expired">Utgången</option>
                <option value="archived">Arkiverad</option>
              </select>
              <select
                className="h-8 rounded-md border border-input bg-background px-2 text-xs"
                value={typeFilter}
                onChange={(e) => { setTypeFilter(e.target.value); handleFilterChange(); }}
              >
                <option value="">Alla typer</option>
                {CAMPAIGN_TYPES.map((t) => (
                  <option key={t.value} value={t.value}>{t.label}</option>
                ))}
              </select>
              <Button
                size="sm" variant="ghost" className="h-8 px-2"
                onClick={() => void refetch()}
              >
                <RefreshCw className="w-3.5 h-3.5" />
              </Button>
              <span className="text-xs text-muted-foreground ml-auto">
                {total > 0 && `${total} kampanj${total !== 1 ? 'er' : ''}`}
              </span>
            </div>

            {/* Table */}
            <Card>
              <CardContent className="p-0">
                {isLoading ? (
                  <div className="px-4 py-3 space-y-2">
                    {[1, 2, 3, 4, 5].map((i) => (
                      <div key={i} className="h-14 bg-muted rounded animate-pulse" />
                    ))}
                  </div>
                ) : filtered.length === 0 ? (
                  <div className="py-16 text-center space-y-3">
                    <Tag className="w-10 h-10 text-muted-foreground mx-auto" />
                    <div>
                      <p className="text-sm font-medium">Inga kampanjer hittades</p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {search ? 'Prova en annan sökning' : 'Skapa en kampanj för att komma igång'}
                      </p>
                    </div>
                    {!search && (
                      <PermissionGate permission={Permissions.FINANCE_CAMPAIGN_CREATE}>
                        <Button size="sm" onClick={() => setCreating(true)}>
                          <Plus className="w-3.5 h-3.5 mr-1.5" />
                          Ny kampanj
                        </Button>
                      </PermissionGate>
                    )}
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="border-b bg-muted/30">
                        <tr>
                          <th className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground">Kampanj</th>
                          <th className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground">Typ</th>
                          <th className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground">Status</th>
                          <th className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground">Värde</th>
                          <th className="text-right px-4 py-2.5 text-xs font-medium text-muted-foreground">Prio</th>
                          <th className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground">Synlighet</th>
                          <th className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground">Start</th>
                          <th className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground">Slut</th>
                          <th className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground">Uppdaterad</th>
                          <th className="px-4 py-2.5" />
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border">
                        {filtered.map((c) => (
                          <CampaignRow
                            key={c.id}
                            campaign={c}
                            onClone={(campaign) => setCloneSource(campaign)}
                          />
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <Button
                  size="sm" variant="outline"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => p - 1)}
                >
                  ← Föregående
                </Button>
                <span>Sida {page} av {totalPages}</span>
                <Button
                  size="sm" variant="outline"
                  disabled={page >= totalPages}
                  onClick={() => setPage((p) => p + 1)}
                >
                  Nästa →
                </Button>
              </div>
            )}
          </div>
        </PermissionGate>
      </PageContent>

      {creating && <CampaignFormSheet mode="create" onClose={() => setCreating(false)} />}
      {cloneSource && (
        <CampaignFormSheet
          mode="clone"
          source={cloneSource}
          onClose={() => setCloneSource(null)}
        />
      )}
    </PageLayout>
  );
}
