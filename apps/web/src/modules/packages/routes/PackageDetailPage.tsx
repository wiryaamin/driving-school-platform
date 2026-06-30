import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  AlertCircle, Archive, ArrowLeft, BookOpen, CalendarDays,
  CheckCircle2, Copy, FileText, Globe, Lock, Monitor,
  Package, RefreshCw, Star, Tag, Users,
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
  toast,
} from '@platform/ui';
import { PageLayout, PageHeader, PageContent } from '@shared/components/layout/PageLayout/PageLayout.js';
import { PermissionGate } from '@core/rbac/PermissionGate.js';
import { Permissions } from '@core/rbac/permissions.js';
import {
  usePackageOffering,
  useArchiveOffering,
  useActivateOffering,
  type OfferingVisibility,
} from '@modules/finance/hooks/usePackages.js';
import { formatCurrency, formatDate } from '@modules/finance/lib/financeUtils.js';
import { PackageFormSheet } from '../components/PackageFormSheet.js';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const CATEGORY_LABELS: Record<string, string> = {
  driving: 'Körlektion',
  theory:  'Teori',
  risk1:   'Risk 1',
  risk2:   'Risk 2',
  intro:   'Introduktionslektion',
  other:   'Övrigt',
};

const TYPE_LABELS: Record<string, string> = {
  driving: 'Körpaket',
  theory:  'Teoripaket',
  bundle:  'Kombinationspaket',
  other:   'Övrigt',
};

const VISIBILITY_CONFIG: Record<OfferingVisibility, { label: string; icon: React.ElementType; cls: string; hint: string }> = {
  public:         { label: 'Offentlig',    icon: Globe,    cls: 'bg-green-100 text-green-800',   hint: 'Webb, Elevportalen & Föräldraportal' },
  website:        { label: 'Webb',          icon: Monitor,  cls: 'bg-blue-100 text-blue-800',     hint: 'Visas på webbsidan' },
  student_portal: { label: 'Elevportalen', icon: Users,    cls: 'bg-purple-100 text-purple-800', hint: 'Synlig för inloggade elever' },
  internal:       { label: 'Intern',        icon: Lock,     cls: 'bg-gray-100 text-gray-700',     hint: 'Endast synlig för personal' },
};

function vatPct(rate: number) { return `${Math.round(rate * 100)} %`; }

// ─── Info row helper ──────────────────────────────────────────────────────────

function InfoRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between py-2.5 border-b border-border/50 last:border-0">
      <span className="text-sm text-muted-foreground shrink-0 mr-4">{label}</span>
      <span className="text-sm font-medium text-right">{children}</span>
    </div>
  );
}

// ─── Archive / Activate dialogs ───────────────────────────────────────────────

function ArchiveOfferingDialog({ id, name, onClose }: { id: string; name: string; onClose: () => void }) {
  const archive  = useArchiveOffering(id);
  const navigate = useNavigate();

  async function handle() {
    try {
      await archive.mutateAsync();
      toast({ title: 'Paket arkiverat' });
      onClose();
      void navigate('/packages');
    } catch (e) {
      toast({ title: 'Fel', description: String(e), variant: 'destructive' });
    }
  }

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent>
        <DialogHeader><DialogTitle>Arkivera paket</DialogTitle></DialogHeader>
        <p className="text-sm text-muted-foreground py-2">
          "{name}" arkiveras och visas inte längre i katalogen.
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

// ─── PackageDetailPage ────────────────────────────────────────────────────────

export function PackageDetailPage() {
  const { id }   = useParams<{ id: string }>();
  const navigate = useNavigate();

  const { data: offering, isLoading, isError } = usePackageOffering(id ?? null);

  const activate = useActivateOffering(id ?? '');

  const [editing,   setEditing]   = useState(false);
  const [cloning,   setCloning]   = useState(false);
  const [archiving, setArchiving] = useState(false);

  async function handleActivate() {
    try {
      await activate.mutateAsync();
      toast({ title: 'Paket aktiverat' });
    } catch (e) {
      toast({ title: 'Fel', description: String(e), variant: 'destructive' });
    }
  }

  if (isLoading) {
    return (
      <PageLayout>
        <PageContent>
          <div className="space-y-4">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-32 bg-muted rounded-xl animate-pulse" />
            ))}
          </div>
        </PageContent>
      </PageLayout>
    );
  }

  if (isError || !offering) {
    return (
      <PageLayout>
        <PageContent>
          <div className="flex items-center gap-3 p-4 bg-red-50 rounded-xl">
            <AlertCircle className="w-5 h-5 text-red-500 shrink-0" />
            <p className="text-sm text-red-600">Paketet hittades inte.</p>
          </div>
        </PageContent>
      </PageLayout>
    );
  }

  const inclVat   = offering.price * (1 + offering.vat_rate);
  const perLesson = offering.quantity > 0 ? offering.price / offering.quantity : 0;
  const visCfg    = VISIBILITY_CONFIG[offering.visibility] ?? VISIBILITY_CONFIG.internal;
  const VisIcon   = visCfg.icon;

  return (
    <PageLayout>
      <PageHeader
        title={offering.name}
        description={offering.description ?? undefined}
        breadcrumbs={[
          { label: 'Hem' },
          { label: 'Paket & Kampanjer', href: '/packages' },
          { label: offering.name },
        ]}
        actions={
          <div className="flex items-center gap-2 flex-wrap">
            <PermissionGate permission={Permissions.FINANCE_PACKAGE_UPDATE}>
              <Button size="sm" variant="outline" onClick={() => setEditing(true)}>
                Redigera
              </Button>
            </PermissionGate>
            <PermissionGate permission={Permissions.FINANCE_PACKAGE_CREATE}>
              <Button size="sm" variant="outline" onClick={() => setCloning(true)}>
                <Copy className="w-3.5 h-3.5 mr-1.5" />
                Klona
              </Button>
            </PermissionGate>
            {offering.status === 'active' ? (
              <PermissionGate permission={Permissions.FINANCE_PACKAGE_ARCHIVE}>
                <Button
                  size="sm"
                  variant="outline"
                  className="text-muted-foreground"
                  onClick={() => setArchiving(true)}
                >
                  <Archive className="w-3.5 h-3.5 mr-1.5" />
                  Arkivera
                </Button>
              </PermissionGate>
            ) : (
              <PermissionGate permission={Permissions.FINANCE_PACKAGE_UPDATE}>
                <Button
                  size="sm"
                  variant="outline"
                  className="text-green-700 border-green-200 hover:bg-green-50"
                  disabled={activate.isPending}
                  onClick={() => void handleActivate()}
                >
                  <RefreshCw className="w-3.5 h-3.5 mr-1.5" />
                  {activate.isPending ? 'Aktiverar...' : 'Aktivera'}
                </Button>
              </PermissionGate>
            )}
          </div>
        }
      />

      <PageContent>
        <div className="space-y-4">

          {/* Status + meta strip */}
          <div className="flex flex-wrap items-center gap-2">
            {offering.status === 'active' ? (
              <Badge className="bg-green-100 text-green-800 hover:bg-green-100 border-0">
                <CheckCircle2 className="w-3 h-3 mr-1" />
                Aktiv
              </Badge>
            ) : (
              <Badge variant="secondary">
                <Archive className="w-3 h-3 mr-1" />
                Arkiverad
              </Badge>
            )}
            {offering.featured && (
              <Badge className="bg-amber-100 text-amber-800 hover:bg-amber-100 border-0">
                <Star className="w-3 h-3 mr-1 fill-amber-600" />
                Utvalt paket
              </Badge>
            )}
            {offering.package_code && (
              <Badge variant="outline" className="font-mono text-xs">
                <Tag className="w-3 h-3 mr-1" />
                {offering.package_code}
              </Badge>
            )}
            <Badge variant="outline" className="text-xs">
              {CATEGORY_LABELS[offering.lesson_category] ?? offering.lesson_category}
            </Badge>
            <Badge variant="outline" className="text-xs">
              {TYPE_LABELS[offering.package_type] ?? offering.package_type}
            </Badge>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

            {/* Produktinfo */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Package className="w-4 h-4 text-muted-foreground" />
                  Produktuppgifter
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-0">
                <InfoRow label="Kategori">{CATEGORY_LABELS[offering.lesson_category] ?? offering.lesson_category}</InfoRow>
                <InfoRow label="Typ">{TYPE_LABELS[offering.package_type] ?? offering.package_type}</InfoRow>
                <InfoRow label="Antal lektioner">{offering.quantity} st</InfoRow>
                <InfoRow label="Sorteringsordning">{offering.sort_order}</InfoRow>
                <InfoRow label="Skapad">{formatDate(offering.created_at)}</InfoRow>
              </CardContent>
            </Card>

            {/* Prissättning */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <BookOpen className="w-4 h-4 text-muted-foreground" />
                  Prissättning
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-0">
                <InfoRow label="Pris ex. moms">
                  <span className="font-mono">{formatCurrency(offering.price, 'SEK')}</span>
                </InfoRow>
                <InfoRow label={`Moms (${vatPct(offering.vat_rate)})`}>
                  <span className="font-mono">{formatCurrency(offering.price * offering.vat_rate, 'SEK')}</span>
                </InfoRow>
                <InfoRow label="Pris inkl. moms">
                  <span className="font-mono text-base font-bold">{formatCurrency(inclVat, 'SEK')}</span>
                </InfoRow>
                {offering.quantity > 1 && (
                  <InfoRow label="Per lektion ex. moms">
                    <span className="font-mono text-muted-foreground">{formatCurrency(perLesson, 'SEK')}</span>
                  </InfoRow>
                )}
                <InfoRow label="Giltighetstid">
                  {offering.validity_days != null
                    ? `${offering.validity_days} dagar`
                    : 'Obegränsad'}
                </InfoRow>
              </CardContent>
            </Card>

            {/* Synlighet */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <VisIcon className="w-4 h-4 text-muted-foreground" />
                  Synlighet & exponering
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-0 space-y-3">
                <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/30">
                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${visCfg.cls}`}>
                    <VisIcon className="w-4 h-4" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold">{visCfg.label}</p>
                    <p className="text-xs text-muted-foreground">{visCfg.hint}</p>
                  </div>
                </div>
                <InfoRow label="Utvalt paket">
                  {offering.featured ? (
                    <span className="flex items-center gap-1 text-amber-700">
                      <Star className="w-3.5 h-3.5 fill-amber-400 text-amber-400" />
                      Ja
                    </span>
                  ) : (
                    <span className="text-muted-foreground">Nej</span>
                  )}
                </InfoRow>

                {/* Visibility preview */}
                <div className="pt-1">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground mb-2">Synlig på</p>
                  <div className="flex flex-wrap gap-1.5">
                    {(['public', 'website', 'student_portal'] as OfferingVisibility[]).map((ch) => {
                      const active =
                        offering.visibility === 'public' ||
                        offering.visibility === ch ||
                        (offering.visibility === 'website' && ch === 'website') ||
                        (offering.visibility === 'student_portal' && ch === 'student_portal');
                      const cfg = VISIBILITY_CONFIG[ch];
                      const ChIcon = cfg.icon;
                      return (
                        <span
                          key={ch}
                          className={`inline-flex items-center gap-1 px-2 py-1 rounded text-[11px] font-medium ${
                            active ? cfg.cls : 'bg-muted text-muted-foreground opacity-40'
                          }`}
                        >
                          <ChIcon className="w-2.5 h-2.5" />
                          {cfg.label}
                        </span>
                      );
                    })}
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Credits included */}
            {(Array.isArray(offering.bundle_credits) && offering.bundle_credits.length > 0) ? (
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <CalendarDays className="w-4 h-4 text-muted-foreground" />
                    Inkluderade krediter
                  </CardTitle>
                </CardHeader>
                <CardContent className="pt-0">
                  {offering.bundle_credits.map((credit, i) => {
                    const c = credit as Record<string, unknown>;
                    const cat = c['lesson_category'] as string ?? '';
                    const qty = c['quantity'] as number ?? 0;
                    return (
                      <InfoRow key={i} label={CATEGORY_LABELS[cat] ?? cat}>
                        {qty} st
                      </InfoRow>
                    );
                  })}
                </CardContent>
              </Card>
            ) : (
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <CalendarDays className="w-4 h-4 text-muted-foreground" />
                    Inkluderade krediter
                  </CardTitle>
                </CardHeader>
                <CardContent className="pt-0">
                  <InfoRow label={CATEGORY_LABELS[offering.lesson_category] ?? offering.lesson_category}>
                    {offering.quantity} st
                  </InfoRow>
                </CardContent>
              </Card>
            )}

          </div>

          {/* Internal notes */}
          {offering.internal_notes && (
            <Card className="border-amber-200/60 bg-amber-50/30 dark:bg-amber-950/10">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2 text-amber-800 dark:text-amber-400">
                  <FileText className="w-4 h-4" />
                  Interna anteckningar
                  <Badge variant="outline" className="text-[10px] ml-auto border-amber-300 text-amber-700">Intern</Badge>
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-0">
                <p className="text-sm text-amber-900 dark:text-amber-300 whitespace-pre-wrap">
                  {offering.internal_notes}
                </p>
              </CardContent>
            </Card>
          )}

          {/* Back link */}
          <div className="pt-2">
            <Button
              variant="ghost"
              size="sm"
              className="text-muted-foreground"
              onClick={() => void navigate('/packages')}
            >
              <ArrowLeft className="w-3.5 h-3.5 mr-1.5" />
              Tillbaka till Paket & Kampanjer
            </Button>
          </div>

        </div>
      </PageContent>

      {editing   && <PackageFormSheet mode="edit"  source={offering} onClose={() => setEditing(false)} />}
      {cloning   && <PackageFormSheet mode="clone" source={offering} onClose={() => setCloning(false)} />}
      {archiving && (
        <ArchiveOfferingDialog
          id={offering.id}
          name={offering.name}
          onClose={() => setArchiving(false)}
        />
      )}
    </PageLayout>
  );
}
