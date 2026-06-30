import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Archive, ArrowLeft, Calendar, Copy,
  Globe, Link2, Lock, Monitor, Package,
  Pause, Play, Plus, Trash2, Users,
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
  toast,
} from '@platform/ui';
import { PageLayout, PageHeader, PageContent } from '@shared/components/layout/PageLayout/PageLayout.js';
import { PermissionGate } from '@core/rbac/PermissionGate.js';
import { Permissions } from '@core/rbac/permissions.js';
import {
  useCampaign,
  useActivateCampaign,
  usePauseCampaign,
  useArchiveCampaign,
  useLinkPackage,
  useUnlinkPackage,
  type Campaign,
  type CampaignVisibility,
} from '../hooks/useCampaigns.js';
import { CAMPAIGN_TYPE_LABELS, STATUS_CONFIG } from './CampaignListPage.js';
import { CampaignFormSheet } from '../components/CampaignFormSheet.js';
import { usePackageOfferings } from '@modules/finance/hooks/usePackages.js';
import { formatCurrency, formatDateTime } from '@modules/finance/lib/financeUtils.js';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function InfoRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-2 py-2 border-b border-border/50 last:border-0">
      <span className="text-xs text-muted-foreground w-36 shrink-0 pt-0.5">{label}</span>
      <span className="text-sm flex-1">{children}</span>
    </div>
  );
}

const VISIBILITY_META: Record<CampaignVisibility, { label: string; icon: React.ElementType; channels: string[] }> = {
  internal:       { label: 'Intern',        icon: Lock,    channels: [] },
  student_portal: { label: 'Elevportalen',  icon: Users,   channels: ['Elevportalen'] },
  website:        { label: 'Webb',           icon: Monitor, channels: ['Webb'] },
  public:         { label: 'Offentlig',     icon: Globe,   channels: ['Webb', 'Elevportalen', 'Föräldraportal'] },
};

// ─── Package link section ─────────────────────────────────────────────────────

function PackageLinkSection({ campaign }: { campaign: Campaign }) {
  const [adding,       setAdding]       = useState(false);
  const [selectedId,   setSelectedId]   = useState('');
  const [unlinkTarget, setUnlinkTarget] = useState<string | null>(null);

  const linkMut   = useLinkPackage(campaign.id);
  const unlinkMut = useUnlinkPackage(campaign.id);

  const { data: offeringsData } = usePackageOfferings(
    { status: 'active', per_page: 100 },
    { enabled: campaign.status !== 'archived' },
  );
  const allOfferings = offeringsData?.data ?? [];

  const linkedIds = new Set(campaign.linked_packages?.map((lp) => lp.offering_id) ?? []);
  const available = allOfferings.filter((o) => !linkedIds.has(o.id));

  async function handleLink() {
    if (!selectedId) return;
    try {
      await linkMut.mutateAsync(selectedId);
      toast({ title: 'Paket kopplat till kampanj' });
      setAdding(false);
      setSelectedId('');
    } catch (e) {
      toast({ title: 'Fel', description: e instanceof Error ? e.message : 'Okänt fel', variant: 'destructive' });
    }
  }

  async function handleUnlink(offeringId: string) {
    try {
      await unlinkMut.mutateAsync(offeringId);
      toast({ title: 'Paket borttaget från kampanj' });
      setUnlinkTarget(null);
    } catch (e) {
      toast({ title: 'Fel', description: e instanceof Error ? e.message : 'Okänt fel', variant: 'destructive' });
    }
  }

  const linked = campaign.linked_packages ?? [];

  return (
    <Card>
      <CardContent className="p-0">
        <div className="flex items-center justify-between px-4 py-3 border-b">
          <div className="flex items-center gap-2">
            <Package className="w-4 h-4 text-muted-foreground" />
            <span className="text-sm font-medium">Kopplade paket</span>
            <Badge variant="outline" className="text-[10px] px-1.5">{linked.length}</Badge>
          </div>
          {campaign.status !== 'archived' && (
            <PermissionGate permission={Permissions.FINANCE_CAMPAIGN_UPDATE}>
              <Button
                size="sm" variant="outline" className="h-7 text-xs"
                onClick={() => setAdding(true)}
              >
                <Plus className="w-3 h-3 mr-1" />
                Koppla paket
              </Button>
            </PermissionGate>
          )}
        </div>

        {linked.length === 0 ? (
          <div className="py-8 text-center">
            <Link2 className="w-6 h-6 text-muted-foreground mx-auto mb-2" />
            <p className="text-xs text-muted-foreground">Inga paket kopplade än</p>
          </div>
        ) : (
          <div className="divide-y divide-border">
            {linked.map((lp) => {
              const po = lp.package_offerings;
              if (!po) {
                return (
                  <div key={lp.id} className="flex items-center gap-3 px-4 py-2.5">
                    <div className="flex-1 min-w-0">
                      <p className="text-xs text-muted-foreground italic">Paketinformation ej tillgänglig</p>
                    </div>
                    <PermissionGate permission={Permissions.FINANCE_CAMPAIGN_UPDATE}>
                      <Button
                        size="sm" variant="ghost"
                        className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive"
                        onClick={() => setUnlinkTarget(lp.offering_id)}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </PermissionGate>
                  </div>
                );
              }
              const inclVat = po.price * (1 + po.vat_rate);
              return (
                <div key={lp.id} className="flex items-center gap-3 px-4 py-2.5">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{po.name}</p>
                    <div className="flex items-center gap-2 mt-0.5">
                      {po.package_code && (
                        <span className="text-[10px] font-mono text-muted-foreground">{po.package_code}</span>
                      )}
                      <Badge variant="outline" className="text-[10px] px-1">{po.lesson_category}</Badge>
                      <span className={`text-[10px] px-1 rounded ${
                        po.status === 'active'
                          ? 'bg-green-100 text-green-800'
                          : 'bg-gray-100 text-gray-600'
                      }`}>
                        {po.status === 'active' ? 'Aktiv' : 'Arkiverad'}
                      </span>
                    </div>
                  </div>
                  <p className="text-sm font-mono font-semibold shrink-0">
                    {formatCurrency(inclVat, 'SEK')}
                  </p>
                  <PermissionGate permission={Permissions.FINANCE_CAMPAIGN_UPDATE}>
                    <Button
                      size="sm" variant="ghost"
                      className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive"
                      onClick={() => setUnlinkTarget(lp.offering_id)}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </PermissionGate>
                </div>
              );
            })}
          </div>
        )}

        {/* Add package dialog */}
        {adding && (
          <Dialog open onOpenChange={(o) => { if (!o) setAdding(false); }}>
            <DialogContent>
              <DialogHeader><DialogTitle>Koppla paket</DialogTitle></DialogHeader>
              <div className="py-3 space-y-3">
                <p className="text-sm text-muted-foreground">
                  Välj ett aktivt paket att koppla till "{campaign.name}".
                </p>
                {available.length === 0 ? (
                  <p className="text-xs text-muted-foreground">Alla aktiva paket är redan kopplade.</p>
                ) : (
                  <select
                    className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm"
                    value={selectedId}
                    onChange={(e) => setSelectedId(e.target.value)}
                  >
                    <option value="">Välj paket...</option>
                    {available.map((o) => (
                      <option key={o.id} value={o.id}>
                        {o.name}{o.package_code ? ` (${o.package_code})` : ''}
                      </option>
                    ))}
                  </select>
                )}
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setAdding(false)}>Avbryt</Button>
                <Button
                  disabled={!selectedId || linkMut.isPending}
                  onClick={() => void handleLink()}
                >
                  {linkMut.isPending ? 'Kopplar...' : 'Koppla paket'}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        )}

        {/* Unlink confirm dialog */}
        {unlinkTarget !== null && (
          <Dialog open onOpenChange={(o) => { if (!o) setUnlinkTarget(null); }}>
            <DialogContent>
              <DialogHeader><DialogTitle>Ta bort koppling</DialogTitle></DialogHeader>
              <p className="text-sm text-muted-foreground py-2">
                Vill du ta bort detta paket från kampanjen? Inga köp påverkas.
              </p>
              <DialogFooter>
                <Button variant="outline" onClick={() => setUnlinkTarget(null)}>Avbryt</Button>
                <Button
                  variant="destructive"
                  disabled={unlinkMut.isPending}
                  onClick={() => void handleUnlink(unlinkTarget)}
                >
                  {unlinkMut.isPending ? 'Tar bort...' : 'Ta bort'}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Visibility preview ───────────────────────────────────────────────────────

function VisibilityPreview({ visibility }: { visibility: CampaignVisibility }) {
  const meta = VISIBILITY_META[visibility] ?? VISIBILITY_META.internal;
  const Icon = meta.icon;
  const allChannels = ['Webb', 'Elevportalen', 'Föräldraportal'];

  return (
    <Card>
      <CardContent className="pt-4 pb-3">
        <div className="flex items-center gap-2 mb-3">
          <Icon className="w-4 h-4 text-muted-foreground" />
          <p className="text-sm font-medium">{meta.label}</p>
        </div>
        <div className="flex flex-col gap-1.5">
          {allChannels.map((ch) => {
            const active = meta.channels.includes(ch);
            return (
              <div key={ch} className={`flex items-center gap-2 text-xs rounded px-2.5 py-1.5 ${
                active
                  ? 'bg-green-50 text-green-800 dark:bg-green-900/20 dark:text-green-300'
                  : 'bg-muted/40 text-muted-foreground'
              }`}>
                <span className={`w-1.5 h-1.5 rounded-full ${active ? 'bg-green-500' : 'bg-muted-foreground/40'}`} />
                {ch}
                {!active && <span className="ml-auto text-[10px]">Dold</span>}
              </div>
            );
          })}
        </div>
        {visibility === 'internal' && (
          <p className="text-[11px] text-muted-foreground mt-2">
            Kampanjen är intern och visas bara för personal.
          </p>
        )}
      </CardContent>
    </Card>
  );
}

// ─── CampaignDetailPage ───────────────────────────────────────────────────────

export function CampaignDetailPage() {
  const { id }    = useParams<{ id: string }>();
  const navigate  = useNavigate();
  const [editing, setEditing] = useState(false);
  const [cloning, setCloning] = useState(false);
  const [archiving, setArchiving] = useState(false);

  const { data: campaign, isLoading, error } = useCampaign(id ?? null);
  const activate = useActivateCampaign(id ?? '');
  const pause    = usePauseCampaign(id ?? '');
  const archive  = useArchiveCampaign(id ?? '');

  async function handleActivate() {
    if (!campaign) return;
    try {
      await activate.mutateAsync();
      toast({ title: 'Kampanj aktiverad' });
    } catch (e) {
      toast({ title: 'Fel', description: e instanceof Error ? e.message : 'Okänt fel', variant: 'destructive' });
    }
  }

  async function handlePause() {
    if (!campaign) return;
    try {
      await pause.mutateAsync();
      toast({ title: 'Kampanj pausad' });
    } catch (e) {
      toast({ title: 'Fel', description: e instanceof Error ? e.message : 'Okänt fel', variant: 'destructive' });
    }
  }

  async function handleArchive() {
    if (!campaign) return;
    try {
      await archive.mutateAsync();
      toast({ title: 'Kampanj arkiverad' });
      setArchiving(false);
      void navigate('/campaigns');
    } catch (e) {
      toast({ title: 'Fel', description: e instanceof Error ? e.message : 'Okänt fel', variant: 'destructive' });
    }
  }

  if (isLoading) {
    return (
      <PageLayout>
        <div className="p-8 space-y-3">
          {[1, 2, 3].map((i) => <div key={i} className="h-24 bg-muted rounded animate-pulse" />)}
        </div>
      </PageLayout>
    );
  }

  if (error || !campaign) {
    return (
      <PageLayout>
        <div className="p-8 text-center text-muted-foreground text-sm">
          Kampanjen hittades inte.
        </div>
      </PageLayout>
    );
  }

  const statusCfg    = STATUS_CONFIG[campaign.status] ?? STATUS_CONFIG.draft;
  const canActivate  = campaign.status === 'draft' || campaign.status === 'paused' || campaign.status === 'scheduled';
  const canPause     = campaign.status === 'active';
  const canArchive   = campaign.status !== 'archived';
  const canEdit      = campaign.status !== 'archived';
  const linkedCount  = campaign.linked_packages?.length ?? 0;

  return (
    <PageLayout>
      <PageHeader
        title={campaign.name}
        {...(campaign.description != null ? { description: campaign.description } : {})}
        breadcrumbs={[
          { label: 'Hem' },
          { label: 'Kampanjer', href: '/campaigns' },
          { label: campaign.name },
        ]}
        actions={
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => void navigate('/campaigns')}>
              <ArrowLeft className="w-3.5 h-3.5 mr-1.5" />
              Tillbaka
            </Button>

            <PermissionGate permission={Permissions.FINANCE_CAMPAIGN_CREATE}>
              <Button variant="outline" size="sm" onClick={() => setCloning(true)}>
                <Copy className="w-3.5 h-3.5 mr-1.5" />
                Klona
              </Button>
            </PermissionGate>

            {canEdit && (
              <PermissionGate permission={Permissions.FINANCE_CAMPAIGN_UPDATE}>
                <Button variant="outline" size="sm" onClick={() => setEditing(true)}>
                  Redigera
                </Button>
              </PermissionGate>
            )}

            {canActivate && (
              <PermissionGate permission={Permissions.FINANCE_CAMPAIGN_UPDATE}>
                <Button
                  size="sm"
                  className="bg-green-600 hover:bg-green-700 text-white"
                  disabled={activate.isPending}
                  onClick={() => void handleActivate()}
                >
                  <Play className="w-3.5 h-3.5 mr-1.5" />
                  {activate.isPending ? 'Aktiverar...' : 'Aktivera'}
                </Button>
              </PermissionGate>
            )}

            {canPause && (
              <PermissionGate permission={Permissions.FINANCE_CAMPAIGN_UPDATE}>
                <Button
                  variant="outline" size="sm"
                  className="border-amber-300 text-amber-700 hover:bg-amber-50"
                  disabled={pause.isPending}
                  onClick={() => void handlePause()}
                >
                  <Pause className="w-3.5 h-3.5 mr-1.5" />
                  {pause.isPending ? 'Pausar...' : 'Pausa'}
                </Button>
              </PermissionGate>
            )}

            {canArchive && (
              <PermissionGate permission={Permissions.FINANCE_CAMPAIGN_ARCHIVE}>
                <Button
                  variant="outline" size="sm"
                  className="text-destructive border-destructive/30 hover:bg-destructive/5"
                  onClick={() => setArchiving(true)}
                >
                  <Archive className="w-3.5 h-3.5 mr-1.5" />
                  Arkivera
                </Button>
              </PermissionGate>
            )}
          </div>
        }
      />

      <PageContent>
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">

          {/* Left column — main info */}
          <div className="xl:col-span-2 space-y-4">

            {/* Status + type */}
            <Card>
              <CardContent className="pt-4 pb-2">
                <div className="flex items-center gap-3 pb-3 mb-2 border-b">
                  <span className={`px-2 py-0.5 rounded text-[11px] font-medium ${statusCfg.cls}`}>
                    {statusCfg.label}
                  </span>
                  <Badge variant="outline" className="text-[11px]">
                    {CAMPAIGN_TYPE_LABELS[campaign.campaign_type] ?? campaign.campaign_type}
                  </Badge>
                  <span className="text-xs text-muted-foreground">
                    Prio: <strong>{campaign.priority}</strong>
                  </span>
                  <span className="text-xs text-muted-foreground ml-auto">
                    {linkedCount} kopplade paket
                  </span>
                </div>

                <InfoRow label="Kampanjtyp">
                  {CAMPAIGN_TYPE_LABELS[campaign.campaign_type] ?? campaign.campaign_type}
                </InfoRow>

                {(campaign.discount_value != null) && (
                  <InfoRow label="Rabattvärde">
                    {campaign.discount_is_pct
                      ? `${campaign.discount_value}%`
                      : `${campaign.discount_value} kr`}
                    {campaign.max_discount_amount != null && (
                      <span className="text-xs text-muted-foreground ml-2">
                        (max {campaign.max_discount_amount} kr)
                      </span>
                    )}
                  </InfoRow>
                )}

                {campaign.bonus_lessons != null && (
                  <InfoRow label="Bonuslektioner">
                    {campaign.bonus_lessons} lektion{campaign.bonus_lessons !== 1 ? 'er' : ''}
                  </InfoRow>
                )}

                {campaign.description && (
                  <InfoRow label="Beskrivning">
                    <span className="text-muted-foreground">{campaign.description}</span>
                  </InfoRow>
                )}

                {campaign.internal_notes && (
                  <InfoRow label="Interna anteckningar">
                    <span className="text-muted-foreground italic text-xs">{campaign.internal_notes}</span>
                  </InfoRow>
                )}

                <InfoRow label="Skapad">
                  {formatDateTime(campaign.created_at)}
                </InfoRow>
                <InfoRow label="Uppdaterad">
                  {formatDateTime(campaign.updated_at)}
                </InfoRow>
              </CardContent>
            </Card>

            {/* Schedule */}
            <Card>
              <CardContent className="pt-4 pb-2">
                <div className="flex items-center gap-2 mb-3">
                  <Calendar className="w-4 h-4 text-muted-foreground" />
                  <p className="text-sm font-medium">Schema</p>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className={`rounded-lg p-3 ${campaign.starts_at ? 'bg-muted/40' : 'bg-muted/20'}`}>
                    <p className="text-xs text-muted-foreground mb-0.5">Startar</p>
                    <p className="text-sm font-medium">
                      {campaign.starts_at ? formatDateTime(campaign.starts_at) : 'Omedelbart'}
                    </p>
                  </div>
                  <div className={`rounded-lg p-3 ${campaign.ends_at ? 'bg-muted/40' : 'bg-muted/20'}`}>
                    <p className="text-xs text-muted-foreground mb-0.5">Slutar</p>
                    <p className="text-sm font-medium">
                      {campaign.ends_at ? formatDateTime(campaign.ends_at) : 'Tills vidare'}
                    </p>
                  </div>
                </div>

                {campaign.status === 'scheduled' && campaign.starts_at && (
                  <div className="mt-3 px-3 py-2 rounded bg-blue-50 dark:bg-blue-900/20 text-xs text-blue-800 dark:text-blue-300">
                    Kampanjen aktiveras automatiskt {formatDateTime(campaign.starts_at)}.
                  </div>
                )}
                {campaign.status === 'expired' && (
                  <div className="mt-3 px-3 py-2 rounded bg-orange-50 dark:bg-orange-900/20 text-xs text-orange-800 dark:text-orange-300">
                    Kampanjen har löpt ut.
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Linked packages */}
            <PackageLinkSection campaign={campaign} />
          </div>

          {/* Right column — visibility preview */}
          <div className="space-y-4">
            <VisibilityPreview visibility={campaign.visibility} />

            {/* Quick stats */}
            <Card>
              <CardContent className="pt-4 pb-3 space-y-3">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Snabbinfo</p>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">Kopplade paket</span>
                  <span className="text-sm font-semibold">{linkedCount}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">Prioritet</span>
                  <span className="text-sm font-semibold">{campaign.priority}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">Status</span>
                  <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${statusCfg.cls}`}>
                    {statusCfg.label}
                  </span>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </PageContent>

      {/* Edit sheet */}
      {editing && (
        <CampaignFormSheet
          mode="edit"
          source={campaign}
          onClose={() => setEditing(false)}
        />
      )}

      {/* Clone sheet */}
      {cloning && (
        <CampaignFormSheet
          mode="clone"
          source={campaign}
          onClose={() => setCloning(false)}
        />
      )}

      {/* Archive confirm */}
      {archiving && (
        <Dialog open onOpenChange={(o) => { if (!o) setArchiving(false); }}>
          <DialogContent>
            <DialogHeader><DialogTitle>Arkivera kampanj</DialogTitle></DialogHeader>
            <p className="text-sm text-muted-foreground py-2">
              "{campaign.name}" arkiveras och inaktiveras omedelbart.
            </p>
            <DialogFooter>
              <Button variant="outline" onClick={() => setArchiving(false)}>Avbryt</Button>
              <Button
                variant="destructive"
                disabled={archive.isPending}
                onClick={() => void handleArchive()}
              >
                <Archive className="w-3.5 h-3.5 mr-1.5" />
                {archive.isPending ? 'Arkiverar...' : 'Arkivera'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </PageLayout>
  );
}
