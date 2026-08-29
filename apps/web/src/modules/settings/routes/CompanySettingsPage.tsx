import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Building2, ChevronRight, AlertTriangle, ShieldCheck, XCircle, Upload, Trash2 } from 'lucide-react';
import {
  Button, Skeleton,
  Card, CardContent, CardHeader, CardTitle, CardFooter,
  Input, Label, Switch,
  toast,
} from '@platform/ui';
import { supabase } from '@core/api/supabase.js';
import { useSession } from '@shared/hooks/useSession.js';
import { useOrgBrandingAssets, useUploadOrgBrandingAsset, useRemoveOrgBrandingAsset } from '@shared/hooks/useOrgBranding.js';

// ─── Types ────────────────────────────────────────────────────────────────────

interface OrgSettings {
  address?:          string;
  postal_code?:      string;
  city?:             string;
  postal_address?:   string;
  postal_zip?:       string;
  postal_city?:      string;
  visit_address?:    string;
  visit_zip?:        string;
  visit_city?:       string;
  contact_person?:   string;
  contact_email?:    string;
  contact_phone?:    string;
  customer_email?:   string;
  customer_phone?:   string;
  swish_number?:     string;
  public_catalog_enabled?: boolean;
  public_booking_enabled?: boolean;
  instagram?:        string;
  facebook?:         string;
  tiktok?:           string;
  youtube?:          string;
}

interface OrgRow {
  id:         string;
  name:       string;
  legal_name: string;
  org_number: string | null;
  vat_number: string | null;
  slug:       string | null;
  settings:   OrgSettings;
}

type FormFields = {
  legal_name: string; name: string; org_number: string; vat_number: string;
  address: string; postal_code: string; city: string;
  contact_person: string; contact_email: string; contact_phone: string;
  customer_email: string; customer_phone: string;
  postal_address: string; postal_zip: string; postal_city: string;
  visit_address: string; visit_zip: string; visit_city: string;
  swish_number: string;
  instagram: string; facebook: string; tiktok: string; youtube: string;
  public_catalog_enabled: boolean; public_booking_enabled: boolean;
};

// ─── Validation ───────────────────────────────────────────────────────────────

function validateBasic(f: FormFields): Record<string, string> {
  const e: Record<string, string> = {};
  if (f.org_number && !/^\d{6}-\d{4}$/.test(f.org_number))
    e['org_number'] = 'Ogiltigt format. Ange organisationsnumret som XXXXXX-XXXX.';
  if (f.vat_number && !/^SE\d{12}$/.test(f.vat_number))
    e['vat_number'] = 'Ogiltigt format. Ange momsregistreringsnumret som SE + 12 siffror.';
  return e;
}

function validateContact(f: FormFields): Record<string, string> {
  const e: Record<string, string> = {};
  const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (f.contact_email && !emailRe.test(f.contact_email))
    e['contact_email'] = 'Ange en giltig e-postadress.';
  if (f.customer_email && !emailRe.test(f.customer_email))
    e['customer_email'] = 'Ange en giltig e-postadress.';
  return e;
}

function validateSocial(f: FormFields): Record<string, string> {
  const e: Record<string, string> = {};
  const urlRe = /^https?:\/\/.+/;
  if (f.instagram && !urlRe.test(f.instagram)) e['instagram'] = 'Ange en giltig URL (börjar med https://).';
  if (f.facebook  && !urlRe.test(f.facebook))  e['facebook']  = 'Ange en giltig URL (börjar med https://).';
  if (f.tiktok    && !urlRe.test(f.tiktok))    e['tiktok']    = 'Ange en giltig URL (börjar med https://).';
  if (f.youtube   && !urlRe.test(f.youtube))   e['youtube']   = 'Ange en giltig URL (börjar med https://).';
  return e;
}

// ─── Payment provider state banner ─────────────────────────────────────────────
// Dual-level payment architecture: makes it impossible to mistake TrafikCloud's
// shared pilot/test default for the school's own connected account.

function PaymentProviderStateBanner({
  provider, state,
}: {
  provider: 'Stripe' | 'Nets';
  state:    'not_connected' | 'pilot' | 'tenant_owned';
}) {
  if (state === 'pilot') {
    return (
      <div className="flex items-start gap-2 text-xs rounded-lg border border-amber-300 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/20 px-3 py-2">
        <AlertTriangle className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
        <div>
          <p className="font-medium text-amber-800 dark:text-amber-300">TrafikClouds pilot-/testkonfiguration är aktiv.</p>
          <p className="text-amber-700 dark:text-amber-400">
            Detta är ett testkonto från TrafikCloud och inte er skolas eget {provider}-konto.
            Ange era egna uppgifter nedan för att koppla ert eget konto.
          </p>
        </div>
      </div>
    );
  }
  if (state === 'tenant_owned') {
    return (
      <div className="flex items-start gap-2 text-xs rounded-lg border border-emerald-300 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/20 px-3 py-2">
        <ShieldCheck className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
        <p className="font-medium text-emerald-800 dark:text-emerald-300">Er skolas {provider}-konto är anslutet.</p>
      </div>
    );
  }
  return (
    <div className="flex items-start gap-2 text-xs rounded-lg border border-border bg-muted/20 px-3 py-2">
      <XCircle className="w-3.5 h-3.5 text-muted-foreground shrink-0 mt-0.5" />
      <div>
        <p className="font-medium text-foreground">{provider} är inte anslutet.</p>
        <p className="text-muted-foreground">Anslut er skolas {provider}-konto för att ta emot betalningar.</p>
      </div>
    </div>
  );
}

// ─── CompanySettingsPage ──────────────────────────────────────────────────────

export function CompanySettingsPage() {
  const { organization } = useSession();
  const orgId = organization?.id;
  const queryClient = useQueryClient();

  // Company logo (2026-08-29): same logo_light asset/hook already used by
  // Settings → Webbplats → Varumärke and by the tenant sidebar mark — one
  // upload here updates both, since it's the same organizations.settings
  // .branding_assets['logo_light'] value under the hood. Kept as a single
  // control here (unlike Varumärke's 7 light/dark/favicon/etc. slots) since
  // this page's audience just wants "upload our logo", not asset variants.
  const { data: brandingAssets } = useOrgBrandingAssets();
  const uploadLogo = useUploadOrgBrandingAsset();
  const removeLogo = useRemoveOrgBrandingAsset();
  const logoUrl = brandingAssets?.['logo_light'];

  function handleLogoFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    uploadLogo.mutate(
      { assetKey: 'logo_light', file },
      {
        onSuccess: () => toast({ title: 'Logotyp sparades' }),
        onError: () => toast({ title: 'Fel vid uppladdning', variant: 'destructive' }),
      },
    );
    e.target.value = '';
  }

  function handleRemoveLogo() {
    removeLogo.mutate('logo_light', {
      onSuccess: () => toast({ title: 'Logotyp borttagen' }),
      onError: () => toast({ title: 'Fel vid borttagning', variant: 'destructive' }),
    });
  }

  const { data: org, isLoading } = useQuery<OrgRow | null>({
    queryKey: ['org-company-settings', orgId],
    queryFn: async () => {
      if (!orgId) return null;
      const { data } = await supabase
        .from('organizations')
        .select('id, name, legal_name, org_number, vat_number, slug, settings')
        .eq('id', orgId)
        .single();
      return data as OrgRow | null;
    },
    enabled: !!orgId,
    staleTime: 60_000,
  });

  const [form, setForm] = useState<FormFields>({
    legal_name: '', name: '', org_number: '', vat_number: '',
    address: '', postal_code: '', city: '',
    contact_person: '', contact_email: '', contact_phone: '',
    customer_email: '', customer_phone: '',
    postal_address: '', postal_zip: '', postal_city: '',
    visit_address: '', visit_zip: '', visit_city: '',
    swish_number: '',
    instagram: '', facebook: '', tiktok: '', youtube: '',
    public_catalog_enabled: true, public_booking_enabled: true,
  });

  const [basicErrors,   setBasicErrors]   = useState<Record<string, string>>({});
  const [contactErrors, setContactErrors] = useState<Record<string, string>>({});
  const [socialErrors,  setSocialErrors]  = useState<Record<string, string>>({});

  useEffect(() => {
    if (!org) return;
    const s = (org.settings ?? {}) as OrgSettings;
    setForm({
      legal_name:        org.legal_name ?? '',
      name:              org.name ?? '',
      org_number:        org.org_number ?? '',
      vat_number:        org.vat_number ?? '',
      address:           s.address ?? '',
      postal_code:       s.postal_code ?? '',
      city:              s.city ?? '',
      contact_person:    s.contact_person ?? '',
      contact_email:     s.contact_email ?? '',
      contact_phone:     s.contact_phone ?? '',
      customer_email:    s.customer_email ?? '',
      customer_phone:    s.customer_phone ?? '',
      postal_address:    s.postal_address ?? '',
      postal_zip:        s.postal_zip ?? '',
      postal_city:       s.postal_city ?? '',
      visit_address:     s.visit_address ?? '',
      visit_zip:         s.visit_zip ?? '',
      visit_city:        s.visit_city ?? '',
      swish_number:      s.swish_number ?? '',
      public_catalog_enabled: s.public_catalog_enabled ?? true,
      public_booking_enabled: s.public_booking_enabled ?? true,
      instagram:         s.instagram ?? '',
      facebook:          s.facebook ?? '',
      tiktok:            s.tiktok ?? '',
      youtube:           s.youtube ?? '',
    });
  }, [org]);

  type StringFieldKey = { [K in keyof FormFields]: FormFields[K] extends string ? K : never }[keyof FormFields];

  function field(key: StringFieldKey) {
    return {
      value:    form[key],
      onChange: (e: React.ChangeEvent<HTMLInputElement>) =>
        setForm(prev => ({ ...prev, [key]: e.target.value })),
    };
  }

  function invalidate() {
    void queryClient.invalidateQueries({ queryKey: ['org-company-settings'] });
  }

  // ── Mutations ──

  const updateBasic = useMutation({
    mutationFn: async () => {
      if (!orgId) return;
      await supabase.from('organizations').update({
        legal_name: form.legal_name,
        name:       form.name,
        org_number: form.org_number || null,
        vat_number: form.vat_number || null,
      } as never).eq('id', orgId);
    },
    onSuccess: () => {
      invalidate();
      toast({ title: 'Företagsinformation sparades' });
    },
    onError: () => toast({ title: 'Fel vid sparning', variant: 'destructive' }),
  });

  const updateContact = useMutation({
    mutationFn: async () => {
      if (!orgId) return;
      const cur = (org?.settings ?? {}) as OrgSettings;
      await supabase.from('organizations').update({
        settings: {
          ...cur,
          address:        form.address,
          postal_code:    form.postal_code,
          city:           form.city,
          contact_person: form.contact_person,
          contact_email:  form.contact_email,
          contact_phone:  form.contact_phone,
          customer_email: form.customer_email,
          customer_phone: form.customer_phone,
          postal_address: form.postal_address,
          postal_zip:     form.postal_zip,
          postal_city:    form.postal_city,
          visit_address:  form.visit_address,
          visit_zip:      form.visit_zip,
          visit_city:     form.visit_city,
        },
      } as never).eq('id', orgId);
    },
    onSuccess: () => {
      invalidate();
      toast({ title: 'Kontaktinformation sparades' });
    },
    onError: () => toast({ title: 'Fel vid sparning', variant: 'destructive' }),
  });

  const updateSocial = useMutation({
    mutationFn: async () => {
      if (!orgId) return;
      const cur = (org?.settings ?? {}) as OrgSettings;
      await supabase.from('organizations').update({
        settings: {
          ...cur,
          instagram: form.instagram,
          facebook:  form.facebook,
          tiktok:    form.tiktok,
          youtube:   form.youtube,
        },
      } as never).eq('id', orgId);
    },
    onSuccess: () => {
      invalidate();
      toast({ title: 'Sociala medier sparades' });
    },
    onError: () => toast({ title: 'Fel vid sparning', variant: 'destructive' }),
  });

  // Stripe credentials — status/masked display only, never the real value
  // (ADR-022: server-side, encrypted, write-only from the client's
  // perspective). Saved through the dedicated stripe-credentials function,
  // not a direct table write, unlike the rest of this page's fields.
  // 'pilot' = TrafikCloud's shared test/pilot default (copied at
  // provisioning), never the school's own account. 'tenant_owned' = the
  // school entered its own key. See stripe-credentials/index.ts.
  type PaymentProviderState = 'not_connected' | 'pilot' | 'tenant_owned';

  interface StripeCredentialStatus {
    stripe_secret_key_configured:     boolean;
    stripe_secret_key_masked:         string | null;
    stripe_webhook_secret_configured: boolean;
    stripe_webhook_secret_masked:     string | null;
    stripe_state:                     PaymentProviderState;
  }

  const { data: stripeStatus, isLoading: stripeStatusLoading } = useQuery<StripeCredentialStatus | null>({
    queryKey: ['stripe-credentials-status', orgId],
    queryFn: async () => {
      if (!orgId) return null;
      const { data, error } = await supabase.functions.invoke<{ data: StripeCredentialStatus }>(
        'stripe-credentials', { method: 'GET' },
      );
      if (error) return null;
      return data?.data ?? null;
    },
    enabled: !!orgId,
    staleTime: 30_000,
  });

  const [stripeKeyInput,     setStripeKeyInput]     = useState('');
  const [stripeWebhookInput, setStripeWebhookInput] = useState('');

  const saveStripeCredentials = useMutation({
    mutationFn: async (fields: { stripe_secret_key?: string; stripe_webhook_secret?: string }) => {
      const { error, data } = await supabase.functions.invoke<{ data: StripeCredentialStatus }>(
        'stripe-credentials', { method: 'POST', body: fields },
      );
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['stripe-credentials-status', orgId] });
      setStripeKeyInput('');
      setStripeWebhookInput('');
      toast({ title: 'Stripe-uppgifter sparades' });
    },
    onError: () => toast({ title: 'Kunde inte spara Stripe-uppgifter — kontrollera nyckeln', variant: 'destructive' }),
  });

  // Nets credentials — same pattern as Stripe above: server-side, encrypted,
  // write-only from the client's perspective, saved through the dedicated
  // nets-credentials function rather than a direct table write.
  interface NetsCredentialStatus {
    nets_secret_key_configured:   boolean;
    nets_secret_key_masked:       string | null;
    nets_checkout_key_configured: boolean;
    nets_checkout_key_masked:     string | null;
    nets_state:                   PaymentProviderState;
  }

  const { data: netsStatus, isLoading: netsStatusLoading } = useQuery<NetsCredentialStatus | null>({
    queryKey: ['nets-credentials-status', orgId],
    queryFn: async () => {
      if (!orgId) return null;
      const { data, error } = await supabase.functions.invoke<{ data: NetsCredentialStatus }>(
        'nets-credentials', { method: 'GET' },
      );
      if (error) return null;
      return data?.data ?? null;
    },
    enabled: !!orgId,
    staleTime: 30_000,
  });

  const [netsKeyInput,      setNetsKeyInput]      = useState('');
  const [netsCheckoutInput, setNetsCheckoutInput]  = useState('');

  const saveNetsCredentials = useMutation({
    mutationFn: async (fields: { nets_secret_key?: string; nets_checkout_key?: string }) => {
      const { error, data } = await supabase.functions.invoke<{ data: NetsCredentialStatus }>(
        'nets-credentials', { method: 'POST', body: fields },
      );
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['nets-credentials-status', orgId] });
      setNetsKeyInput('');
      setNetsCheckoutInput('');
      toast({ title: 'Nets-uppgifter sparades' });
    },
    onError: () => toast({ title: 'Kunde inte spara Nets-uppgifter', variant: 'destructive' }),
  });

  const updatePublicVisibility = useMutation({
    mutationFn: async (next: { public_catalog_enabled: boolean; public_booking_enabled: boolean }) => {
      if (!orgId) return;
      const cur = (org?.settings ?? {}) as OrgSettings;
      await supabase.from('organizations').update({
        settings: {
          ...cur,
          public_catalog_enabled: next.public_catalog_enabled,
          public_booking_enabled: next.public_booking_enabled,
        },
      } as never).eq('id', orgId);
      setForm(prev => ({ ...prev, ...next }));
    },
    onSuccess: () => {
      invalidate();
      toast({ title: 'Synlighet på webben sparades' });
    },
    onError: () => toast({ title: 'Fel vid sparning', variant: 'destructive' }),
  });

  const updateSwish = useMutation({
    mutationFn: async () => {
      if (!orgId) return;
      const cur = (org?.settings ?? {}) as OrgSettings;
      await supabase.from('organizations').update({
        settings: {
          ...cur,
          swish_number: form.swish_number || undefined,
        },
      } as never).eq('id', orgId);
    },
    onSuccess: () => {
      invalidate();
      toast({ title: 'Swish-nummer sparades' });
    },
    onError: () => toast({ title: 'Fel vid sparning', variant: 'destructive' }),
  });

  // ── Handlers with validation ──

  function handleSaveBasic() {
    const errs = validateBasic(form);
    setBasicErrors(errs);
    if (Object.keys(errs).length === 0) updateBasic.mutate();
  }

  function handleSaveContact() {
    const errs = validateContact(form);
    setContactErrors(errs);
    if (Object.keys(errs).length === 0) updateContact.mutate();
  }

  function handleSaveSocial() {
    const errs = validateSocial(form);
    setSocialErrors(errs);
    if (Object.keys(errs).length === 0) updateSocial.mutate();
  }

  if (isLoading) {
    return (
      <div className="space-y-4 max-w-2xl">
        {[...Array(6)].map((_, i) => <Skeleton key={i} className="h-10 rounded-lg" />)}
      </div>
    );
  }

  return (
    <div className="max-w-2xl space-y-5">

      {/* Breadcrumb */}
      <div className="flex items-center justify-between">
        <nav aria-label="Brödsmulor" className="flex items-center gap-1 text-xs text-muted-foreground">
          <Link to="/settings" className="hover:text-foreground transition-colors">Inställningar</Link>
          <ChevronRight className="w-3 h-3" aria-hidden="true" />
          <span className="text-foreground font-medium">Företag</span>
        </nav>
      </div>

      {/* Page header card */}
      <Card>
        <CardContent className="p-8 flex flex-col items-center text-center gap-3">
          <div className="w-16 h-16 rounded-xl bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 flex items-center justify-center overflow-hidden shrink-0">
            {logoUrl ? (
              <img src={logoUrl} alt={form.name || 'Företagslogotyp'} className="w-full h-full object-contain p-1.5" />
            ) : (
              <Building2 className="w-6 h-6" strokeWidth={1.75} aria-hidden="true" />
            )}
          </div>
          <div>
            <h1 className="text-xl font-semibold tracking-tight text-foreground">Företag</h1>
            <p className="text-sm text-muted-foreground">Hantera verksamhetens uppgifter.</p>
          </div>
          <div className="flex items-center gap-2">
            <label className="inline-flex items-center gap-2 text-xs font-medium text-foreground rounded-lg border border-dashed border-border px-3 py-2 cursor-pointer hover:border-primary/50 hover:bg-muted/50 transition-colors">
              <input
                type="file"
                className="sr-only"
                accept="image/png,image/jpeg,image/webp,image/svg+xml"
                onChange={handleLogoFile}
                disabled={uploadLogo.isPending}
              />
              <Upload className="w-3.5 h-3.5" aria-hidden="true" />
              {uploadLogo.isPending ? 'Laddar upp…' : logoUrl ? 'Byt logotyp' : 'Ladda upp logotyp'}
            </label>
            {logoUrl && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="text-xs text-destructive hover:text-destructive"
                onClick={handleRemoveLogo}
                disabled={removeLogo.isPending}
              >
                <Trash2 className="w-3.5 h-3.5 mr-1.5" aria-hidden="true" />
                {removeLogo.isPending ? 'Tar bort…' : 'Ta bort logotyp'}
              </Button>
            )}
          </div>
          <p className="text-[11px] text-muted-foreground max-w-sm">
            Visas i sidomenyn i er instrumentpanel. Fler varianter (mörk bakgrund, favicon m.m.) hanteras under{' '}
            <Link to="/settings/website/brand" className="underline hover:text-foreground">Webbplats → Varumärke</Link>.
          </p>
        </CardContent>
      </Card>

      {/* Basic info */}
      <Card>
        <CardContent className="p-6 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <Field id="legal_name" label="Företagsnamn" placeholder="Företagets juridiska namn" {...field('legal_name')} />
            <Field id="name" label="Visningsnamn" placeholder="Visningsnamn" {...field('name')} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Field
              id="org_number" label="Organisationsnummer" placeholder="559XXX-XXXX"
              error={basicErrors['org_number']} {...field('org_number')}
            />
            <Field
              id="vat_number" label="Momsregistreringsnummer" placeholder="SE559XXXXXXX01"
              error={basicErrors['vat_number']} {...field('vat_number')}
            />
          </div>
        </CardContent>
        <CardFooter className="justify-end px-6 pb-6 pt-0">
          <Button size="sm" onClick={handleSaveBasic} disabled={updateBasic.isPending}>
            {updateBasic.isPending ? 'Sparar…' : 'Spara'}
          </Button>
        </CardFooter>
      </Card>

      {/* Contact info */}
      <Card>
        <CardHeader className="pb-0 px-6 pt-6">
          <CardTitle className="text-sm font-semibold">Kontaktinformation</CardTitle>
        </CardHeader>
        <CardContent className="p-6 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <Field
              id="customer_email" label="Skolans e-post" placeholder="info@foretag.se"
              type="email" error={contactErrors['customer_email']} {...field('customer_email')}
            />
            <Field id="customer_phone" label="Skolans telefonnummer" placeholder="070-XXX XX XX" {...field('customer_phone')} />
          </div>
          <div className="grid grid-cols-3 gap-4">
            <Field id="contact_person" label="Er kontaktperson (endast referens)" placeholder="Namn" {...field('contact_person')} />
            <Field
              id="contact_email" label="E-post (kontaktperson)" placeholder="kontakt@foretag.se"
              type="email" error={contactErrors['contact_email']} {...field('contact_email')}
            />
            <Field id="contact_phone" label="Telefon (kontaktperson)" placeholder="070-XXX XX XX" {...field('contact_phone')} />
          </div>
        </CardContent>

        {/* Postal address sub-section */}
        <div className="px-6 pb-4 space-y-3 border-t border-border pt-4">
          <div>
            <p className="text-sm font-medium text-foreground">Postadress</p>
            <p className="text-xs text-muted-foreground">Inte implementerat ännu — visas för närvarande inte på utbildningskortet eller fakturan.</p>
          </div>
          <div className="grid grid-cols-3 gap-4">
            <Field id="postal_address" label="Adress" placeholder="Gatuadress" {...field('postal_address')} />
            <Field id="postal_zip" label="Postnummer" placeholder="12345" {...field('postal_zip')} />
            <Field id="postal_city" label="Postort" placeholder="Stad" {...field('postal_city')} />
          </div>
        </div>

        {/* Visit address sub-section */}
        <div className="px-6 pb-4 space-y-3 border-t border-border pt-4">
          <div>
            <p className="text-sm font-medium text-foreground">Besöksadress</p>
            <p className="text-xs text-muted-foreground">Inte implementerat ännu — det finns ingen TABSwebb-integration i plattformen som visar denna adress.</p>
          </div>
          <div className="grid grid-cols-3 gap-4">
            <Field id="visit_address" label="Adress" placeholder="Gatuadress" {...field('visit_address')} />
            <Field id="visit_zip" label="Postnummer" placeholder="12345" {...field('visit_zip')} />
            <Field id="visit_city" label="Postort" placeholder="Stad" {...field('visit_city')} />
          </div>
        </div>

        <CardFooter className="justify-end px-6 pb-6 pt-0">
          <Button size="sm" onClick={handleSaveContact} disabled={updateContact.isPending}>
            {updateContact.isPending ? 'Sparar…' : 'Spara'}
          </Button>
        </CardFooter>
      </Card>

      {/* Public website presence */}
      <Card>
        <CardHeader className="pb-0 px-6 pt-6">
          <CardTitle className="text-sm font-semibold">Publik webbnärvaro</CardTitle>
          <p className="text-xs text-muted-foreground mt-1">
            Styr om skolans publika sidor är tillgängliga för besökare på webben.
          </p>
        </CardHeader>
        <CardContent className="p-6 space-y-5">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-sm font-medium text-foreground">Kurskatalog &amp; anmälan</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Paket, priser och anmälningsformulär —{' '}
                <span className="font-mono text-[11px] bg-muted px-1 py-px rounded">
                  {(import.meta.env.VITE_APP_URL as string | undefined) ?? ''}/catalog/{orgId ?? ''}
                </span>
              </p>
            </div>
            <Switch
              checked={form.public_catalog_enabled}
              onCheckedChange={(checked) =>
                updatePublicVisibility.mutate({
                  public_catalog_enabled: checked,
                  public_booking_enabled: form.public_booking_enabled,
                })
              }
              disabled={updatePublicVisibility.isPending}
            />
          </div>

          <div className="flex items-center justify-between gap-4 border-t border-border pt-4">
            <div>
              <p className="text-sm font-medium text-foreground">Kontaktformulär</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Enkelt intresseformulär utan katalog —{' '}
                <span className="font-mono text-[11px] bg-muted px-1 py-px rounded">
                  {(import.meta.env.VITE_APP_URL as string | undefined) ?? ''}/book?org={org?.slug ?? ''}
                </span>
              </p>
            </div>
            <Switch
              checked={form.public_booking_enabled}
              onCheckedChange={(checked) =>
                updatePublicVisibility.mutate({
                  public_catalog_enabled: form.public_catalog_enabled,
                  public_booking_enabled: checked,
                })
              }
              disabled={updatePublicVisibility.isPending}
            />
          </div>
        </CardContent>
      </Card>

      {/* Payment gateways */}
      <Card>
        <CardHeader className="pb-0 px-6 pt-6">
          <CardTitle className="text-sm font-semibold">Betallösningar</CardTitle>
          <p className="text-xs text-muted-foreground mt-1">
            Konfigurerade betalningsmetoder visas för elever i elevportalen.
          </p>
        </CardHeader>
        <CardContent className="p-6 space-y-5">

          {/* Swish */}
          <div className="space-y-2">
            <p className="text-xs font-semibold text-foreground uppercase tracking-wide">Swish</p>
            <Field id="swish_number" label="Swish-nummer" placeholder="1231234567" {...field('swish_number')} />
            <p className="text-[11px] text-muted-foreground">
              Eleverna skickas till Swish-appen med ifyllt belopp och fakturanummer.
            </p>
          </div>

          {/* Stripe */}
          <div className="space-y-3 pt-4 border-t border-border">
            <p className="text-xs font-semibold text-foreground uppercase tracking-wide">Stripe (kortbetalning)</p>

            {!stripeStatusLoading && stripeStatus && (
              <PaymentProviderStateBanner provider="Stripe" state={stripeStatus.stripe_state} />
            )}

            {/* Secret Key */}
            <div className="space-y-1.5">
              <Label htmlFor="stripe_secret_key_input">Stripe Secret Key</Label>
              <p className="text-[11px] text-muted-foreground">
                {stripeStatusLoading ? 'Kontrollerar status…'
                  : stripeStatus?.stripe_secret_key_configured
                    ? stripeStatus.stripe_secret_key_masked
                      ? <>Konfigurerad: <span className="font-mono">{stripeStatus.stripe_secret_key_masked}</span></>
                      : 'Konfigurerad'
                    : 'Inte konfigurerad'}
                {' '}— värdet visas aldrig igen efter att det sparats; ange ett nytt för att ersätta det.
              </p>
              <div className="flex gap-2">
                <Input
                  id="stripe_secret_key_input"
                  type="password"
                  autoComplete="new-password"
                  value={stripeKeyInput}
                  onChange={e => setStripeKeyInput(e.target.value)}
                  placeholder="sk_live_… eller sk_test_…"
                />
                <Button
                  size="sm"
                  variant="outline"
                  disabled={!stripeKeyInput.trim() || saveStripeCredentials.isPending}
                  onClick={() => saveStripeCredentials.mutate({ stripe_secret_key: stripeKeyInput.trim() })}
                >
                  {saveStripeCredentials.isPending ? 'Verifierar…' : 'Spara'}
                </Button>
              </div>
            </div>

            {/* Webhook Signing Secret */}
            <div className="space-y-1.5">
              <Label htmlFor="stripe_webhook_secret_input">Stripe Webhook Signing Secret</Label>
              <p className="text-[11px] text-muted-foreground">
                {stripeStatusLoading ? 'Kontrollerar status…'
                  : stripeStatus?.stripe_webhook_secret_configured
                    ? stripeStatus.stripe_webhook_secret_masked
                      ? <>Konfigurerad: <span className="font-mono">{stripeStatus.stripe_webhook_secret_masked}</span></>
                      : 'Konfigurerad'
                    : 'Inte konfigurerad'}
              </p>
              <div className="flex gap-2">
                <Input
                  id="stripe_webhook_secret_input"
                  type="password"
                  autoComplete="new-password"
                  value={stripeWebhookInput}
                  onChange={e => setStripeWebhookInput(e.target.value)}
                  placeholder="whsec_…"
                />
                <Button
                  size="sm"
                  variant="outline"
                  disabled={!stripeWebhookInput.trim() || saveStripeCredentials.isPending}
                  onClick={() => saveStripeCredentials.mutate({ stripe_webhook_secret: stripeWebhookInput.trim() })}
                >
                  {saveStripeCredentials.isPending ? 'Sparar…' : 'Spara'}
                </Button>
              </div>
            </div>

            <p className="text-[11px] text-muted-foreground">
              Secret Key hämtas från{' '}
              <span className="font-medium">Stripe Dashboard → API-nycklar</span> och verifieras mot Stripe innan den sparas.
              Registrera denna webhook-URL i samma Stripe-konto:{' '}
              <span className="font-mono text-[11px] bg-muted px-1 py-px rounded">
                /functions/v1/stripe-webhook/{orgId ?? '{organisation-id}'}
              </span>
              {' '}(händelser:{' '}
              <span className="font-mono text-[11px]">checkout.session.completed</span>,{' '}
              <span className="font-mono text-[11px]">checkout.session.expired</span>) — kopiera sedan
              webhookens signeringshemlighet (<span className="font-mono text-[11px]">whsec_…</span>) hit.
              Utan detta fungerar kortbetalning, men bekräftelsen sker inte automatiskt.
            </p>
          </div>

          {/* Nets */}
          <div className="space-y-3 pt-4 border-t border-border">
            <p className="text-xs font-semibold text-foreground uppercase tracking-wide">Nets</p>

            {!netsStatusLoading && netsStatus && (
              <PaymentProviderStateBanner provider="Nets" state={netsStatus.nets_state} />
            )}

            <p className="text-[11px] text-amber-700 dark:text-amber-400">
              Ingen kortbetalning via Nets är kopplad till kassan ännu — uppgifterna nedan sparas säkert
              för framtida bruk men används inte i utcheckningsflödet i denna version.
            </p>

            <div className="space-y-1.5">
              <Label htmlFor="nets_secret_key_input">Nets Secret Key</Label>
              <p className="text-[11px] text-muted-foreground">
                {netsStatusLoading ? 'Kontrollerar status…'
                  : netsStatus?.nets_secret_key_configured
                    ? netsStatus.nets_secret_key_masked
                      ? <>Konfigurerad: <span className="font-mono">{netsStatus.nets_secret_key_masked}</span></>
                      : 'Konfigurerad'
                    : 'Inte konfigurerad'}
                {' '}— värdet visas aldrig igen efter att det sparats; ange ett nytt för att ersätta det.
              </p>
              <div className="flex gap-2">
                <Input
                  id="nets_secret_key_input"
                  type="password"
                  autoComplete="new-password"
                  value={netsKeyInput}
                  onChange={e => setNetsKeyInput(e.target.value)}
                  placeholder="Nets Secret Key"
                />
                <Button
                  size="sm"
                  variant="outline"
                  disabled={!netsKeyInput.trim() || saveNetsCredentials.isPending}
                  onClick={() => saveNetsCredentials.mutate({ nets_secret_key: netsKeyInput.trim() })}
                >
                  {saveNetsCredentials.isPending ? 'Sparar…' : 'Spara'}
                </Button>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="nets_checkout_key_input">Nets Checkout Key</Label>
              <p className="text-[11px] text-muted-foreground">
                {netsStatusLoading ? 'Kontrollerar status…'
                  : netsStatus?.nets_checkout_key_configured
                    ? netsStatus.nets_checkout_key_masked
                      ? <>Konfigurerad: <span className="font-mono">{netsStatus.nets_checkout_key_masked}</span></>
                      : 'Konfigurerad'
                    : 'Inte konfigurerad'}
              </p>
              <div className="flex gap-2">
                <Input
                  id="nets_checkout_key_input"
                  type="password"
                  autoComplete="new-password"
                  value={netsCheckoutInput}
                  onChange={e => setNetsCheckoutInput(e.target.value)}
                  placeholder="Nets Checkout Key"
                />
                <Button
                  size="sm"
                  variant="outline"
                  disabled={!netsCheckoutInput.trim() || saveNetsCredentials.isPending}
                  onClick={() => saveNetsCredentials.mutate({ nets_checkout_key: netsCheckoutInput.trim() })}
                >
                  {saveNetsCredentials.isPending ? 'Sparar…' : 'Spara'}
                </Button>
              </div>
            </div>
          </div>

          {/* Apple Pay — domain verification upload not yet implemented; do not present a live control */}
          <div className="pt-4 border-t border-border space-y-2">
            <p className="text-xs font-semibold text-foreground uppercase tracking-wide">Apple Pay (via Nets)</p>
            <p className="text-xs text-muted-foreground">Kommer i en framtida version.</p>
          </div>
        </CardContent>
        <CardFooter className="justify-end px-6 pb-6 pt-0">
          <Button size="sm" onClick={() => updateSwish.mutate()} disabled={updateSwish.isPending}>
            {updateSwish.isPending ? 'Sparar…' : 'Spara Swish-nummer'}
          </Button>
        </CardFooter>
      </Card>

      {/* Social media */}
      <Card>
        <CardHeader className="pb-0 px-6 pt-6">
          <CardTitle className="text-sm font-semibold">Sociala medier</CardTitle>
          <p className="text-xs text-muted-foreground mt-1">
            Sparas som referens — det finns ingen publik webbplats i plattformen ännu som visar dessa länkar.
          </p>
        </CardHeader>
        <CardContent className="p-6 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <Field id="instagram" label="Instagram" placeholder="https://www.instagram.com/" error={socialErrors['instagram']} {...field('instagram')} />
            <Field id="facebook"  label="Facebook"  placeholder="https://www.facebook.com/"  error={socialErrors['facebook']}  {...field('facebook')} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Field id="tiktok"  label="TikTok"  placeholder="https://www.tiktok.com/"  error={socialErrors['tiktok']}  {...field('tiktok')} />
            <Field id="youtube" label="YouTube" placeholder="https://www.youtube.com/" error={socialErrors['youtube']} {...field('youtube')} />
          </div>
        </CardContent>
        <CardFooter className="justify-end px-6 pb-6 pt-0">
          <Button size="sm" onClick={handleSaveSocial} disabled={updateSocial.isPending}>
            {updateSocial.isPending ? 'Sparar…' : 'Spara'}
          </Button>
        </CardFooter>
      </Card>

    </div>
  );
}

// ─── Field component ──────────────────────────────────────────────────────────

function Field({
  id,
  label,
  placeholder,
  value,
  onChange,
  error,
  type = 'text',
}: {
  id:          string;
  label:       string;
  placeholder: string;
  value:       string;
  onChange:    (e: React.ChangeEvent<HTMLInputElement>) => void;
  error?:      string | undefined;
  type?:       string | undefined;
}) {
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      <Input id={id} type={type} value={value} onChange={onChange} placeholder={placeholder} />
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}

