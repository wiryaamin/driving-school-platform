import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Archive, ChevronRight, Copy, Globe, Lock, Monitor,
  Package, Plus, RefreshCw, Star, Users,
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
  usePackageOfferings,
  useArchiveOffering,
  useActivateOffering,
  type PackageOffering,
  type OfferingVisibility,
} from '@modules/finance/hooks/usePackages.js';
import { formatCurrency, formatDate } from '@modules/finance/lib/financeUtils.js';
import { PackageFormSheet } from '../components/PackageFormSheet.js';

// ─── Helpers & mini-components ────────────────────────────────────────────────

const VISIBILITY_CONFIG: Record<OfferingVisibility, { label: string; icon: React.ElementType; cls: string }> = {
  public:         { label: 'Offentlig',    icon: Globe,    cls: 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300' },
  website:        { label: 'Webb',          icon: Monitor,  cls: 'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300' },
  student_portal: { label: 'Elevportalen', icon: Users,    cls: 'bg-purple-100 text-purple-800 dark:bg-purple-900/40 dark:text-purple-300' },
  internal:       { label: 'Intern',        icon: Lock,     cls: 'bg-gray-100 text-gray-600 dark:bg-gray-800/60 dark:text-gray-400' },
};

function VisibilityBadge({ visibility }: { visibility: OfferingVisibility }) {
  const cfg = VISIBILITY_CONFIG[visibility] ?? VISIBILITY_CONFIG.internal;
  const Icon = cfg.icon;
  return (
    <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[11px] font-medium ${cfg.cls}`}>
      <Icon className="w-2.5 h-2.5" />
      {cfg.label}
    </span>
  );
}

function StatusBadge({ status }: { status: string }) {
  if (status === 'active') {
    return <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[11px] font-medium bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300">Aktiv</span>;
  }
  return <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[11px] font-medium bg-gray-100 text-gray-600 dark:bg-gray-800/60 dark:text-gray-400">Arkiverad</span>;
}

function CategoryBadge({ category }: { category: string }) {
  const labels: Record<string, string> = {
    driving: 'Körlektion',
    theory:  'Teori',
    risk1:   'Risk 1',
    risk2:   'Risk 2',
    intro:   'Introduktion',
    other:   'Övrigt',
  };
  return (
    <Badge variant="outline" className="text-[10px] px-1.5">
      {labels[category] ?? category}
    </Badge>
  );
}

// ─── Row actions ──────────────────────────────────────────────────────────────

function ArchiveDialog({ offering, onClose }: { offering: PackageOffering; onClose: () => void }) {
  const archive = useArchiveOffering(offering.id);

  async function handle() {
    try {
      await archive.mutateAsync();
      toast({ title: 'Paket arkiverat' });
      onClose();
    } catch (e) {
      toast({ title: 'Fel', description: String(e), variant: 'destructive' });
    }
  }

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent>
        <DialogHeader><DialogTitle>Arkivera paket</DialogTitle></DialogHeader>
        <p className="text-sm text-muted-foreground py-2">
          "{offering.name}" arkiveras och visas inte längre i katalogen.
          Befintliga elevköp påverkas inte.
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

function ActivateButton({ offering }: { offering: PackageOffering }) {
  const activate = useActivateOffering(offering.id);

  async function handle() {
    try {
      await activate.mutateAsync();
      toast({ title: 'Paket aktiverat' });
    } catch (e) {
      toast({ title: 'Fel', description: String(e), variant: 'destructive' });
    }
  }

  return (
    <Button
      size="sm"
      variant="outline"
      className="h-7 px-2 text-[11px] text-green-700 border-green-200 hover:bg-green-50"
      disabled={activate.isPending}
      onClick={() => void handle()}
    >
      <RefreshCw className="w-3 h-3 mr-1" />
      Aktivera
    </Button>
  );
}

// ─── Table row ────────────────────────────────────────────────────────────────

function OfferingRow({
  offering,
  onClone,
}: {
  offering:  PackageOffering;
  onClone:   (o: PackageOffering) => void;
}) {
  const navigate    = useNavigate();
  const [archiving, setArchiving] = useState(false);
  const inclVat     = offering.price * (1 + offering.vat_rate);

  return (
    <>
      <tr
        className="group hover:bg-muted/30 cursor-pointer transition-colors"
        onClick={() => void navigate(`/packages/${offering.id}`)}
      >
        {/* Name + Code */}
        <td className="px-4 py-3 min-w-[200px]">
          <div className="flex items-center gap-2">
            {offering.featured && (
              <Star className="w-3 h-3 text-amber-400 fill-amber-400 shrink-0" />
            )}
            <div className="min-w-0">
              <p className="text-sm font-medium text-foreground leading-tight truncate">
                {offering.name}
              </p>
              {offering.package_code && (
                <p className="text-[10px] font-mono text-muted-foreground mt-0.5">
                  {offering.package_code}
                </p>
              )}
            </div>
          </div>
        </td>

        {/* Category */}
        <td className="px-4 py-3 w-[140px]">
          <CategoryBadge category={offering.lesson_category} />
        </td>

        {/* Price */}
        <td className="px-4 py-3 w-[120px] text-right">
          <p className="text-sm font-mono font-semibold">{formatCurrency(inclVat, 'SEK')}</p>
          <p className="text-[10px] text-muted-foreground font-mono">
            {formatCurrency(offering.price, 'SEK')} ex
          </p>
        </td>

        {/* Visibility */}
        <td className="px-4 py-3 w-[140px]">
          <VisibilityBadge visibility={offering.visibility} />
        </td>

        {/* Status */}
        <td className="px-4 py-3 w-[100px]">
          <StatusBadge status={offering.status} />
        </td>

        {/* Sort */}
        <td className="px-4 py-3 w-[72px] text-right text-sm text-muted-foreground">
          {offering.sort_order}
        </td>

        {/* Updated */}
        <td className="px-4 py-3 w-[110px] text-xs text-muted-foreground">
          {formatDate(offering.created_at)}
        </td>

        {/* Actions */}
        <td
          className="px-4 py-3 w-[140px]"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
            <PermissionGate permission={Permissions.FINANCE_PACKAGE_CREATE}>
              <Button
                size="sm"
                variant="ghost"
                className="h-7 px-2 text-[11px]"
                onClick={() => onClone(offering)}
              >
                <Copy className="w-3 h-3 mr-1" />
                Klona
              </Button>
            </PermissionGate>

            {offering.status === 'active' ? (
              <PermissionGate permission={Permissions.FINANCE_PACKAGE_ARCHIVE}>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 px-2 text-[11px] text-muted-foreground"
                  onClick={() => setArchiving(true)}
                >
                  <Archive className="w-3 h-3" />
                </Button>
              </PermissionGate>
            ) : (
              <PermissionGate permission={Permissions.FINANCE_PACKAGE_UPDATE}>
                <ActivateButton offering={offering} />
              </PermissionGate>
            )}

            <ChevronRight className="w-4 h-4 text-muted-foreground ml-1 shrink-0" />
          </div>
        </td>
      </tr>

      {archiving && <ArchiveDialog offering={offering} onClose={() => setArchiving(false)} />}
    </>
  );
}

// ─── PackageListPage ──────────────────────────────────────────────────────────

export function PackageListPage() {
  const [statusFilter,     setStatusFilter]     = useState('active');
  const [categoryFilter,   setCategoryFilter]   = useState('');
  const [visibilityFilter, setVisibilityFilter] = useState('');
  const [featuredFilter,   setFeaturedFilter]   = useState(false);
  const [search,           setSearch]           = useState('');
  const [page,             setPage]             = useState(1);
  const perPage = 25;

  const [creating, setCreating] = useState(false);
  const [cloneSource, setCloneSource] = useState<PackageOffering | null>(null);

  const { data, isLoading, refetch } = usePackageOfferings({
    status:          statusFilter || undefined,
    lesson_category: categoryFilter || undefined,
    visibility:      visibilityFilter || undefined,
    featured:        featuredFilter || undefined,
    page,
    per_page:        perPage,
  });

  const offerings = data?.data ?? [];
  const total     = data?.meta.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / perPage));

  const filtered = useMemo(() => {
    if (!search.trim()) return offerings;
    const q = search.toLowerCase();
    return offerings.filter((o) =>
      o.name.toLowerCase().includes(q) ||
      (o.package_code?.toLowerCase().includes(q) === true),
    );
  }, [offerings, search]);

  const activeCount   = offerings.filter((o) => o.status === 'active').length;
  const featuredCount = offerings.filter((o) => o.featured).length;
  const totalValue    = offerings
    .filter((o) => o.status === 'active')
    .reduce((s, o) => s + o.price * (1 + o.vat_rate), 0);

  function handleFilterChange() {
    setPage(1);
  }

  return (
    <PageLayout>
      <PageHeader
        title="Paket & Kampanjer"
        description="Skapa och hantera kommersiella erbjudanden"
        breadcrumbs={[{ label: 'Hem' }, { label: 'Paket & Kampanjer' }]}
        actions={
          <PermissionGate permission={Permissions.FINANCE_PACKAGE_CREATE}>
            <Button size="sm" onClick={() => setCreating(true)}>
              <Plus className="w-3.5 h-3.5 mr-1.5" />
              Nytt paket
            </Button>
          </PermissionGate>
        }
      />

      <PageContent>
        <PermissionGate permission={Permissions.FINANCE_PACKAGE_READ}>
          <div className="space-y-4">

            {/* KPI strip */}
            <div className="grid grid-cols-3 gap-3">
              <Card>
                <CardContent className="pt-4 pb-3">
                  <p className="text-xs text-muted-foreground">Aktiva paket</p>
                  <p className="text-2xl font-bold mt-0.5">{isLoading ? '…' : activeCount}</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-4 pb-3">
                  <p className="text-xs text-muted-foreground">Utvalda</p>
                  <p className="text-2xl font-bold mt-0.5 flex items-center gap-1.5">
                    {isLoading ? '…' : featuredCount}
                    {featuredCount > 0 && <Star className="w-4 h-4 text-amber-400 fill-amber-400" />}
                  </p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-4 pb-3">
                  <p className="text-xs text-muted-foreground">Total listpriskorg</p>
                  <p className="text-lg font-bold font-mono mt-0.5">{isLoading ? '…' : formatCurrency(totalValue, 'SEK')}</p>
                </CardContent>
              </Card>
            </div>

            {/* Filters + search */}
            <div className="flex flex-wrap items-center gap-2">
              <Input
                placeholder="Sök på namn eller kod..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="h-8 w-[220px] text-xs"
              />
              <select
                className="h-8 rounded-md border border-input bg-background px-2 text-xs"
                value={statusFilter}
                onChange={(e) => { setStatusFilter(e.target.value); handleFilterChange(); }}
              >
                <option value="active">Aktiva</option>
                <option value="archived">Arkiverade</option>
                <option value="all">Alla</option>
              </select>
              <select
                className="h-8 rounded-md border border-input bg-background px-2 text-xs"
                value={categoryFilter}
                onChange={(e) => { setCategoryFilter(e.target.value); handleFilterChange(); }}
              >
                <option value="">Alla kategorier</option>
                <option value="driving">Körlektion</option>
                <option value="theory">Teori</option>
                <option value="risk1">Risk 1</option>
                <option value="risk2">Risk 2</option>
                <option value="intro">Introduktion</option>
                <option value="other">Övrigt</option>
              </select>
              <select
                className="h-8 rounded-md border border-input bg-background px-2 text-xs"
                value={visibilityFilter}
                onChange={(e) => { setVisibilityFilter(e.target.value); handleFilterChange(); }}
              >
                <option value="">Alla synligheter</option>
                <option value="public">Offentlig</option>
                <option value="website">Webb</option>
                <option value="student_portal">Elevportalen</option>
                <option value="internal">Intern</option>
              </select>
              <label className="flex items-center gap-1.5 text-xs cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={featuredFilter}
                  onChange={(e) => { setFeaturedFilter(e.target.checked); handleFilterChange(); }}
                  className="w-3.5 h-3.5 accent-primary"
                />
                Utvalda
              </label>
              <Button
                size="sm"
                variant="ghost"
                className="h-8 px-2"
                onClick={() => void refetch()}
              >
                <RefreshCw className="w-3.5 h-3.5" />
              </Button>
              <span className="text-xs text-muted-foreground ml-auto">
                {total > 0 && `${total} paket`}
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
                    <Package className="w-10 h-10 text-muted-foreground mx-auto" />
                    <div>
                      <p className="text-sm font-medium">Inga paket hittades</p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {search ? 'Prova en annan sökning' : 'Skapa ett paket för att komma igång'}
                      </p>
                    </div>
                    {!search && (
                      <PermissionGate permission={Permissions.FINANCE_PACKAGE_CREATE}>
                        <Button size="sm" onClick={() => setCreating(true)}>
                          <Plus className="w-3.5 h-3.5 mr-1.5" />
                          Nytt paket
                        </Button>
                      </PermissionGate>
                    )}
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="border-b bg-muted/30">
                        <tr>
                          <th className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground">Paket</th>
                          <th className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground">Kategori</th>
                          <th className="text-right px-4 py-2.5 text-xs font-medium text-muted-foreground">Pris inkl. moms</th>
                          <th className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground">Synlighet</th>
                          <th className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground">Status</th>
                          <th className="text-right px-4 py-2.5 text-xs font-medium text-muted-foreground">Sort</th>
                          <th className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground">Skapad</th>
                          <th className="px-4 py-2.5" />
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border">
                        {filtered.map((o) => (
                          <OfferingRow
                            key={o.id}
                            offering={o}
                            onClone={(offering) => setCloneSource(offering)}
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
                  size="sm"
                  variant="outline"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => p - 1)}
                >
                  ← Föregående
                </Button>
                <span>Sida {page} av {totalPages}</span>
                <Button
                  size="sm"
                  variant="outline"
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

      {creating && <PackageFormSheet mode="create" onClose={() => setCreating(false)} />}
      {cloneSource && (
        <PackageFormSheet
          mode="clone"
          source={cloneSource}
          onClose={() => setCloneSource(null)}
        />
      )}
    </PageLayout>
  );
}
