import { useEffect, useState } from 'react';
import {
  AlertTriangle,
  Building2,
  CheckCircle2,
  CreditCard,
  FileText,
  Hash,
  RefreshCw,
  Save,
  Sprout,
} from 'lucide-react';
import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Input,
  Label,
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
  useSwedishSettings,
  useOcrReferences,
  useUpdateSwedishSettings,
  useSeedBAS,
  useSeedDunning,
  type SwedishSettingsInput,
  type OcrReference,
} from '../hooks/useSwedishSettings.js';
import { formatDateTime } from '../lib/financeUtils.js';

// ─── Field row helper ────────────────────────────────────────────────────────

function FieldRow({
  label,
  hint,
  children,
}: {
  label:    string;
  hint?:    string;
  children: React.ReactNode;
}) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 sm:items-start py-3 border-b last:border-0">
      <div className="sm:pt-1.5">
        <Label className="text-sm font-medium">{label}</Label>
        {hint && <p className="text-xs text-muted-foreground mt-0.5">{hint}</p>}
      </div>
      <div className="sm:col-span-2">{children}</div>
    </div>
  );
}

// ─── Organisation settings form ───────────────────────────────────────────────

function OrgSettingsForm() {
  const { data: settings, isLoading } = useSwedishSettings();
  const update = useUpdateSwedishSettings();

  const [form, setForm] = useState<SwedishSettingsInput>({});
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    if (settings) {
      setForm({
        company_name:          settings.company_name          ?? '',
        org_number:            settings.org_number            ?? '',
        vat_number:            settings.vat_number            ?? '',
        bank_name:             settings.bank_name             ?? '',
        bank_account_number:   settings.bank_account_number   ?? '',
        bank_clearing_number:  settings.bank_clearing_number  ?? '',
        bankgiro_number:       settings.bankgiro_number       ?? '',
        plusgiro_number:       settings.plusgiro_number       ?? '',
        swish_number:          settings.swish_number          ?? '',
        default_vat_rate:      settings.default_vat_rate      ?? 25,
        invoice_due_days:      settings.invoice_due_days      ?? 30,
        invoice_payment_terms: settings.invoice_payment_terms ?? '',
        invoice_footer_text:   settings.invoice_footer_text   ?? '',
        autogiro_enabled:      settings.autogiro_enabled      ?? false,
      });
      setDirty(false);
    }
  }, [settings]);

  function set(field: keyof SwedishSettingsInput) {
    return (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      setForm((f) => ({ ...f, [field]: e.target.value }));
      setDirty(true);
    };
  }

  function setNum(field: keyof SwedishSettingsInput) {
    return (e: React.ChangeEvent<HTMLInputElement>) => {
      setForm((f) => ({ ...f, [field]: e.target.value ? Number(e.target.value) : null }));
      setDirty(true);
    };
  }

  function setBool(field: keyof SwedishSettingsInput) {
    return (checked: boolean) => {
      setForm((f) => ({ ...f, [field]: checked }));
      setDirty(true);
    };
  }

  async function handleSave() {
    try {
      await update.mutateAsync(form);
      toast({ title: 'Inställningar sparade' });
      setDirty(false);
    } catch (e) {
      toast({ title: 'Fel', description: String(e), variant: 'destructive' });
    }
  }

  if (isLoading) {
    return (
      <div className="space-y-3">
        {[1, 2, 3, 4, 5].map((i) => <div key={i} className="h-12 bg-muted rounded animate-pulse" />)}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Organisation */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Building2 className="w-4 h-4 text-blue-500" />
            Organisationsuppgifter
          </CardTitle>
        </CardHeader>
        <CardContent>
          <FieldRow label="Företagsnamn" hint="Visas på fakturor">
            <Input value={String(form.company_name ?? '')} onChange={set('company_name')} placeholder="AB Körskolans Namn" />
          </FieldRow>
          <FieldRow label="Organisationsnummer" hint="Format: 556123-4567">
            <Input value={String(form.org_number ?? '')} onChange={set('org_number')} placeholder="556123-4567" />
          </FieldRow>
          <FieldRow label="Momsregistreringsnummer" hint="SE + org.nr utan bindestreck">
            <Input value={String(form.vat_number ?? '')} onChange={set('vat_number')} placeholder="SE556123456701" />
          </FieldRow>
        </CardContent>
      </Card>

      {/* Betalningsinformation */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <CreditCard className="w-4 h-4 text-green-500" />
            Betalningsinformation
          </CardTitle>
        </CardHeader>
        <CardContent>
          <FieldRow label="Banknamn">
            <Input value={String(form.bank_name ?? '')} onChange={set('bank_name')} placeholder="Swedbank" />
          </FieldRow>
          <FieldRow label="Clearingnummer">
            <Input value={String(form.bank_clearing_number ?? '')} onChange={set('bank_clearing_number')} placeholder="8327-9" />
          </FieldRow>
          <FieldRow label="Kontonummer">
            <Input value={String(form.bank_account_number ?? '')} onChange={set('bank_account_number')} placeholder="1234567890" />
          </FieldRow>
          <FieldRow label="Bankgironummer" hint="Format: 1234-5678">
            <Input value={String(form.bankgiro_number ?? '')} onChange={set('bankgiro_number')} placeholder="1234-5678" />
          </FieldRow>
          <FieldRow label="Plusgironummer" hint="Valfritt">
            <Input value={String(form.plusgiro_number ?? '')} onChange={set('plusgiro_number')} placeholder="12 34 56-7" />
          </FieldRow>
          <FieldRow label="Swishnummer" hint="Valfritt, för direktbetalning">
            <Input value={String(form.swish_number ?? '')} onChange={set('swish_number')} placeholder="123 456 78 90" />
          </FieldRow>
          <FieldRow label="Autogiro aktiverat">
            <div className="flex items-center gap-2 h-9">
              <Switch
                checked={Boolean(form.autogiro_enabled)}
                onCheckedChange={setBool('autogiro_enabled')}
              />
              <span className="text-sm text-muted-foreground">
                {form.autogiro_enabled ? 'Aktiverat' : 'Inaktiverat'}
              </span>
            </div>
          </FieldRow>
        </CardContent>
      </Card>

      {/* Fakturainställningar */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <FileText className="w-4 h-4 text-purple-500" />
            Fakturainställningar
          </CardTitle>
        </CardHeader>
        <CardContent>
          <FieldRow label="Standard-momssats (%)" hint="Används som förvalt på nya fakturor">
            <Input type="number" min="0" max="100" value={String(form.default_vat_rate ?? 25)} onChange={setNum('default_vat_rate')} className="w-24" />
          </FieldRow>
          <FieldRow label="Betalningsvillkor (dagar)" hint="Antal dagar till förfallodatum">
            <Input type="number" min="0" max="365" value={String(form.invoice_due_days ?? 30)} onChange={setNum('invoice_due_days')} className="w-24" />
          </FieldRow>
          <FieldRow label="Betalningsvillkor (text)" hint="t.ex. 30 dagar netto">
            <Input value={String(form.invoice_payment_terms ?? '')} onChange={set('invoice_payment_terms')} placeholder="30 dagar netto" />
          </FieldRow>
          <FieldRow label="Sidfot på fakturor" hint="Visas längst ned på varje faktura">
            <Textarea
              rows={3}
              value={String(form.invoice_footer_text ?? '')}
              onChange={set('invoice_footer_text')}
              placeholder="Tack för ditt förtroende! Kontaktinformation, bankinformation etc."
            />
          </FieldRow>
        </CardContent>
      </Card>

      <PermissionGate permission={Permissions.FINANCE_SETTINGS_MANAGE}>
        <div className="flex justify-end">
          <Button
            disabled={!dirty || update.isPending}
            onClick={() => void handleSave()}
          >
            {update.isPending
              ? <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
              : <Save className="w-4 h-4 mr-2" />}
            Spara inställningar
          </Button>
        </div>
      </PermissionGate>
    </div>
  );
}

// ─── Seeding tab ──────────────────────────────────────────────────────────────

function SeedingTab() {
  const seedBAS     = useSeedBAS();
  const seedDunning = useSeedDunning();

  const [basResult,     setBasResult]     = useState<{ seeded: number } | null>(null);
  const [dunningResult, setDunningResult] = useState<{ schedule_id: string } | null>(null);

  async function handleSeedBAS() {
    try {
      const result = await seedBAS.mutateAsync();
      setBasResult(result);
      toast({ title: 'BAS-kontoplan seedades', description: `${result.seeded} konton importerade` });
    } catch (e) {
      toast({ title: 'Fel', description: String(e), variant: 'destructive' });
    }
  }

  async function handleSeedDunning() {
    try {
      const result = await seedDunning.mutateAsync();
      setDunningResult(result);
      toast({ title: 'Inkassoflöde skapat', description: 'Standardflöde för svensk inkasso aktiverat' });
    } catch (e) {
      toast({ title: 'Fel', description: String(e), variant: 'destructive' });
    }
  }

  return (
    <PermissionGate permission={Permissions.FINANCE_SETTINGS_MANAGE}>
      <div className="space-y-4">

        <div className="flex items-start gap-3 p-4 border border-amber-200 dark:border-amber-900/50 rounded-lg bg-amber-50 dark:bg-amber-950/20 text-sm">
          <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
          <div>
            <p className="font-semibold text-amber-800 dark:text-amber-400">Engångsåtgärder</p>
            <p className="text-amber-700 dark:text-amber-500 mt-0.5">
              Dessa åtgärder seed:ar standarddata för er organisation.
              De är idempotenta och säkra att köra igen om nödvändigt.
            </p>
          </div>
        </div>

        {/* BAS seeding */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Sprout className="w-4 h-4 text-green-500" />
              BAS 2020 Kontoplan
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Importerar BAS 2020-kontoplanen för er organisation. Inkluderar alla standardkonton
              för intäkter, kostnader, tillgångar och skulder i enlighet med svenska bokföringsregler.
            </p>
            <div className="flex items-center gap-3">
              <PermissionGate permission={Permissions.FINANCE_BAS_MANAGE}>
                <Button
                  size="sm"
                  disabled={seedBAS.isPending}
                  onClick={() => void handleSeedBAS()}
                >
                  {seedBAS.isPending
                    ? <RefreshCw className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                    : <Sprout className="w-3.5 h-3.5 mr-1.5" />}
                  Seed BAS-kontoplan
                </Button>
              </PermissionGate>
              {basResult && (
                <div className="flex items-center gap-1.5 text-sm text-green-700 dark:text-green-400">
                  <CheckCircle2 className="w-4 h-4" />
                  {basResult.seeded} konton importerade
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Dunning seeding */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Sprout className="w-4 h-4 text-blue-500" />
              Inkassoflöde (standardmall)
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Skapar ett standardinkassoflöde för er organisation baserat på svenska
              inkassoregler. Inkluderar påminnelse, varning, slutlig avisering och inkasso.
            </p>
            <div className="grid sm:grid-cols-2 gap-3 text-xs border rounded-lg p-3 bg-muted/30">
              {[
                { step: '1', name: 'Betalningspåminnelse', delay: '7 dagar' },
                { step: '2', name: 'Varning om inkasso',    delay: '14 dagar' },
                { step: '3', name: 'Slutlig avisering',     delay: '21 dagar' },
                { step: '4', name: 'Inkasso',               delay: '30 dagar' },
              ].map((s) => (
                <div key={s.step} className="flex items-center gap-2">
                  <span className="w-5 h-5 rounded-full bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-400 text-[10px] font-bold flex items-center justify-center shrink-0">
                    {s.step}
                  </span>
                  <div>
                    <p className="font-medium">{s.name}</p>
                    <p className="text-muted-foreground">Efter {s.delay}</p>
                  </div>
                </div>
              ))}
            </div>
            <div className="flex items-center gap-3">
              <Button
                size="sm"
                variant="outline"
                disabled={seedDunning.isPending}
                onClick={() => void handleSeedDunning()}
              >
                {seedDunning.isPending
                  ? <RefreshCw className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                  : <Sprout className="w-3.5 h-3.5 mr-1.5" />}
                Skapa inkassoflöde
              </Button>
              {dunningResult && (
                <div className="flex items-center gap-1.5 text-sm text-green-700 dark:text-green-400">
                  <CheckCircle2 className="w-4 h-4" />
                  Inkassoflöde skapat
                </div>
              )}
            </div>
          </CardContent>
        </Card>

      </div>
    </PermissionGate>
  );
}

// ─── OCR references tab ───────────────────────────────────────────────────────

function OcrTab() {
  const { data: refs = [], isLoading } = useOcrReferences();

  return (
    <PermissionGate permission={Permissions.FINANCE_SETTINGS_READ}>
      <div className="space-y-4">
        <p className="text-sm text-muted-foreground">
          OCR-nummer (Luhn mod-10) genereras automatiskt för varje faktura och används
          som betalningsreferens vid bankgiro- och plusgirobetalningar.
        </p>
        <Card>
          <CardContent className="p-0">
            {isLoading ? (
              <div className="px-4 py-3 space-y-2">
                {[1, 2, 3].map((i) => <div key={i} className="h-10 bg-muted rounded animate-pulse" />)}
              </div>
            ) : refs.length === 0 ? (
              <div className="py-10 text-center space-y-1">
                <Hash className="w-7 h-7 text-muted-foreground mx-auto" />
                <p className="text-sm font-medium">Inga OCR-referenser</p>
                <p className="text-xs text-muted-foreground">
                  OCR-nummer genereras automatiskt när fakturor skapas.
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="border-b bg-muted/30">
                    <tr>
                      <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">OCR-nummer</th>
                      <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Fakturanummer</th>
                      <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Faktura-ID</th>
                      <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Skapad</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {refs.map((ref: OcrReference) => (
                      <tr key={ref.id} className="hover:bg-muted/20">
                        <td className="px-4 py-2.5 font-mono font-semibold tracking-wide">
                          {ref.ocr_number}
                        </td>
                        <td className="px-4 py-2.5 font-mono text-muted-foreground">
                          {ref.invoice_number ?? '–'}
                        </td>
                        <td className="px-4 py-2.5 font-mono text-xs text-muted-foreground">
                          {ref.invoice_id.slice(0, 8)}…
                        </td>
                        <td className="px-4 py-2.5 text-xs text-muted-foreground">
                          {formatDateTime(ref.created_at)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </PermissionGate>
  );
}

// ─── Page ──────────────────────────────────────────────────────────────────────

export function SwedishSettingsPage() {
  return (
    <PageLayout>
      <PageHeader
        title="Svenska ekonomiinställningar"
        description="Organisationsinformation, betalningsuppgifter, BAS-kontoplan och OCR-referenser"
        breadcrumbs={[
          { label: 'Hem' },
          { label: 'Ekonomi', href: '/finance' },
          { label: 'Inställningar' },
        ]}
      />

      <PageContent>
        <PermissionGate permission={Permissions.FINANCE_SETTINGS_READ}>
          <Tabs defaultValue="settings">
            <TabsList>
              <TabsTrigger value="settings">Organisationsinställningar</TabsTrigger>
              <TabsTrigger value="seeding">Initiering</TabsTrigger>
              <TabsTrigger value="ocr">OCR-referenser</TabsTrigger>
            </TabsList>

            <TabsContent value="settings" className="mt-5">
              <OrgSettingsForm />
            </TabsContent>

            <TabsContent value="seeding" className="mt-5">
              <SeedingTab />
            </TabsContent>

            <TabsContent value="ocr" className="mt-5">
              <OcrTab />
            </TabsContent>
          </Tabs>
        </PermissionGate>
      </PageContent>
    </PageLayout>
  );
}
