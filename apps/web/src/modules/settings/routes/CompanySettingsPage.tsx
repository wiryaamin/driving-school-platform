import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Building2, ChevronRight, Upload } from 'lucide-react';
import { Button, Skeleton } from '@platform/ui';
import { supabase } from '@core/api/supabase.js';
import { useSession } from '@shared/hooks/useSession.js';

// ─── Types ────────────────────────────────────────────────────────────────────

interface OrgSettings {
  // Contact
  address?:          string;
  postal_code?:      string;
  city?:             string;
  // Delivery / postal address (shown on invoice + education card)
  postal_address?:   string;
  postal_zip?:       string;
  postal_city?:      string;
  // Visit address (shown on website / TABSwebb)
  visit_address?:    string;
  visit_zip?:        string;
  visit_city?:       string;
  // Contact persons
  contact_person?:   string;
  contact_email?:    string;
  contact_phone?:    string;
  customer_email?:   string;
  customer_phone?:   string;
  // Payment gateways
  swish_number?:     string;
  nets_secret_key?:  string;
  nets_checkout_key?:string;
  // Social
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
  settings:   OrgSettings;
}

// ─── CompanySettingsPage ──────────────────────────────────────────────────────

export function CompanySettingsPage() {
  const { organization } = useSession();
  const orgId = organization?.id;
  const queryClient = useQueryClient();

  const { data: org, isLoading } = useQuery<OrgRow | null>({
    queryKey: ['org-company-settings', orgId],
    queryFn: async () => {
      if (!orgId) return null;
      const { data } = await supabase
        .from('organizations')
        .select('id, name, legal_name, org_number, vat_number, settings')
        .eq('id', orgId)
        .single();
      return data as OrgRow | null;
    },
    enabled: !!orgId,
    staleTime: 60_000,
  });

  const settings = (org?.settings ?? {}) as OrgSettings;

  const [form, setForm] = useState({
    legal_name:         '',
    name:               '',
    org_number:         '',
    vat_number:         '',
    // contact
    address:            '',
    postal_code:        '',
    city:               '',
    contact_person:     '',
    contact_email:      '',
    contact_phone:      '',
    customer_email:     '',
    customer_phone:     '',
    // postal address (faktura + utbildningskort)
    postal_address:     '',
    postal_zip:         '',
    postal_city:        '',
    // visit address (TABSwebb)
    visit_address:      '',
    visit_zip:          '',
    visit_city:         '',
    // payment gateways
    swish_number:       '',
    nets_secret_key:    '',
    nets_checkout_key:  '',
    // social
    instagram:          '',
    facebook:           '',
    tiktok:             '',
    youtube:            '',
  });

  useEffect(() => {
    if (!org) return;
    setForm({
      legal_name:         org.legal_name ?? '',
      name:               org.name ?? '',
      org_number:         org.org_number ?? '',
      vat_number:         org.vat_number ?? '',
      address:            settings.address ?? '',
      postal_code:        settings.postal_code ?? '',
      city:               settings.city ?? '',
      contact_person:     settings.contact_person ?? '',
      contact_email:      settings.contact_email ?? '',
      contact_phone:      settings.contact_phone ?? '',
      customer_email:     settings.customer_email ?? '',
      customer_phone:     settings.customer_phone ?? '',
      postal_address:     settings.postal_address ?? '',
      postal_zip:         settings.postal_zip ?? '',
      postal_city:        settings.postal_city ?? '',
      visit_address:      settings.visit_address ?? '',
      visit_zip:          settings.visit_zip ?? '',
      visit_city:         settings.visit_city ?? '',
      swish_number:       settings.swish_number ?? '',
      nets_secret_key:    settings.nets_secret_key ?? '',
      nets_checkout_key:  settings.nets_checkout_key ?? '',
      instagram:          settings.instagram ?? '',
      facebook:           settings.facebook ?? '',
      tiktok:             settings.tiktok ?? '',
      youtube:            settings.youtube ?? '',
    });
  }, [org]);

  const updateBasic = useMutation({
    mutationFn: async () => {
      if (!orgId) return;
      await supabase.from('organizations').update({
        legal_name: form.legal_name,
        name:       form.name,
        org_number: form.org_number || null,
        vat_number: form.vat_number || null,
      }).eq('id', orgId);
    },
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['org-company-settings'] }),
  });

  const updateContact = useMutation({
    mutationFn: async () => {
      if (!orgId) return;
      const currentSettings = (org?.settings ?? {}) as OrgSettings;
      await supabase.from('organizations').update({
        settings: {
          ...currentSettings,
          address:        form.address,
          postal_code:    form.postal_code,
          city:           form.city,
          contact_person: form.contact_person,
          contact_email:  form.contact_email,
          contact_phone:  form.contact_phone,
          customer_email: form.customer_email,
          customer_phone: form.customer_phone,
        },
      }).eq('id', orgId);
    },
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['org-company-settings'] }),
  });

  const updateSocial = useMutation({
    mutationFn: async () => {
      if (!orgId) return;
      const currentSettings = (org?.settings ?? {}) as OrgSettings;
      await supabase.from('organizations').update({
        settings: {
          ...currentSettings,
          instagram: form.instagram,
          facebook:  form.facebook,
          tiktok:    form.tiktok,
          youtube:   form.youtube,
        },
      }).eq('id', orgId);
    },
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['org-company-settings'] }),
  });

  function field(key: keyof typeof form) {
    return {
      value: form[key],
      onChange: (e: React.ChangeEvent<HTMLInputElement>) =>
        setForm(prev => ({ ...prev, [key]: e.target.value })),
    };
  }

  if (isLoading) {
    return (
      <div className="space-y-4 max-w-2xl">
        {[...Array(6)].map((_, i) => <Skeleton key={i} className="h-10 rounded-lg" />)}
      </div>
    );
  }

  return (
    <div className="max-w-2xl space-y-6">
      {/* Breadcrumb */}
      <div className="flex items-center justify-between">
        <nav className="flex items-center gap-1 text-xs text-muted-foreground">
          <Link to="/settings" className="hover:text-foreground">Inställningar</Link>
          <ChevronRight className="w-3 h-3" />
          <span className="text-foreground">Företag</span>
        </nav>
        <button type="button" className="text-xs text-primary hover:underline">Ge feedback</button>
      </div>

      {/* Header card */}
      <div className="rounded-xl border border-border bg-card p-8 flex flex-col items-center text-center gap-2">
        <div className="w-12 h-12 rounded-xl bg-amber-100 text-amber-700 flex items-center justify-center">
          <Building2 className="w-6 h-6" />
        </div>
        <h1 className="text-lg font-semibold text-foreground">Företag</h1>
        <p className="text-sm text-muted-foreground">Hantera verksamhetens uppgifter.</p>
      </div>

      {/* Basic info form */}
      <div className="rounded-xl border border-border bg-card p-6 space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <Field label="Företagsnamn" placeholder="Företagets juridiska namn" {...field('legal_name')} />
          <Field label="Visningsnamn" placeholder="Visningsnamn" {...field('name')} />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Organisationsnummer" placeholder="559XXX-XXXX" {...field('org_number')} />
          <Field label="Momsregistreringsnummer" placeholder="SE559XXXXXXX01" {...field('vat_number')} />
        </div>
        <div className="flex justify-end">
          <Button
            size="sm"
            className="bg-green-500 hover:bg-green-600 text-white"
            onClick={() => updateBasic.mutate()}
            disabled={updateBasic.isPending}
          >
            {updateBasic.isPending ? 'Sparar…' : 'Spara'}
          </Button>
        </div>
      </div>

      {/* Contact info form */}
      <div className="rounded-xl border border-border bg-card p-6 space-y-4">
        <h3 className="text-sm font-semibold text-foreground">Kontaktinformation</h3>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Skolans e-post" placeholder="info@foretag.se" {...field('customer_email')} />
          <Field label="Skolans telefonnummer" placeholder="070-XXX XX XX" {...field('customer_phone')} />
        </div>
        <div className="grid grid-cols-3 gap-4">
          <Field label="Er kontaktperson" placeholder="Namn" {...field('contact_person')} />
          <Field label="E-post (kontaktperson)" placeholder="kontakt@foretag.se" {...field('contact_email')} />
          <Field label="Telefon (kontaktperson)" placeholder="070-XXX XX XX" {...field('contact_phone')} />
        </div>
        <div className="flex justify-end">
          <Button
            size="sm"
            className="bg-green-500 hover:bg-green-600 text-white"
            onClick={() => updateContact.mutate()}
            disabled={updateContact.isPending}
          >
            {updateContact.isPending ? 'Sparar…' : 'Spara'}
          </Button>
        </div>
      </div>

      {/* Postadress + Besöksadress */}
      <div className="rounded-xl border border-border bg-card p-6 space-y-5">
        <div className="space-y-3">
          <div>
            <h3 className="text-sm font-semibold text-foreground">Postadress</h3>
            <p className="text-xs text-muted-foreground">Syns på utbildningskortet och faktura</p>
          </div>
          <div className="grid grid-cols-3 gap-4">
            <Field label="Adress" placeholder="Gatuadress" {...field('postal_address')} />
            <Field label="Postnummer" placeholder="12345" {...field('postal_zip')} />
            <Field label="Postort" placeholder="Stad" {...field('postal_city')} />
          </div>
        </div>

        <div className="space-y-3 pt-2 border-t border-border">
          <div>
            <h3 className="text-sm font-semibold text-foreground">Besöksadress</h3>
            <p className="text-xs text-muted-foreground">Synlig på TABSwebb</p>
          </div>
          <div className="grid grid-cols-3 gap-4">
            <Field label="Adress" placeholder="Gatuadress" {...field('visit_address')} />
            <Field label="Postnummer" placeholder="12345" {...field('visit_zip')} />
            <Field label="Postort" placeholder="Stad" {...field('visit_city')} />
          </div>
        </div>

        <div className="flex justify-end">
          <Button
            size="sm"
            className="bg-green-500 hover:bg-green-600 text-white"
            onClick={() => updateContact.mutate()}
            disabled={updateContact.isPending}
          >
            {updateContact.isPending ? 'Sparar…' : 'Spara'}
          </Button>
        </div>
      </div>

      {/* Payment gateways */}
      <div className="rounded-xl border border-border bg-card p-6 space-y-5">
        <div className="grid grid-cols-2 gap-6">
          {/* Swish */}
          <div className="space-y-3">
            <h3 className="text-sm font-semibold text-foreground">Swish</h3>
            <Field label="Swish nummer" placeholder="1231234567" {...field('swish_number')} />
          </div>

          {/* Nets */}
          <div className="space-y-3">
            <h3 className="text-sm font-semibold text-foreground">Nets</h3>
            <Field label="Nets Secret Key" placeholder="Nets Secret Key" {...field('nets_secret_key')} />
            <Field label="Nets Checkout Key" placeholder="Nets Checkout Key" {...field('nets_checkout_key')} />
          </div>
        </div>

        {/* Apple Pay */}
        <div className="pt-2 border-t border-border space-y-2">
          <h3 className="text-sm font-semibold text-foreground">Apple Pay (via Nets)</h3>
          <p className="text-xs text-muted-foreground">
            Ladda upp Apple Domain Verification-filen för att aktivera Apple Pay.
          </p>
          <label className="inline-flex items-center gap-2 cursor-pointer">
            <span className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors">
              <Upload className="w-4 h-4" />
              Ladda upp Apple Domain Verification-filen
            </span>
            <input type="file" className="sr-only" accept=".txt,.json" />
          </label>
        </div>

        <div className="flex justify-end">
          <Button
            size="sm"
            className="bg-green-500 hover:bg-green-600 text-white"
            onClick={() => updateContact.mutate()}
            disabled={updateContact.isPending}
          >
            {updateContact.isPending ? 'Sparar…' : 'Spara'}
          </Button>
        </div>
      </div>

      {/* Social media form */}
      <div className="rounded-xl border border-border bg-card p-6 space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <Field label="Instagram" placeholder="https://www.instagram.com/" {...field('instagram')} />
          <Field label="Facebook" placeholder="https://www.facebook.com/" {...field('facebook')} />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <Field label="TikTok" placeholder="https://www.tiktok.com/" {...field('tiktok')} />
          <Field label="YouTube" placeholder="https://www.youtube.com/" {...field('youtube')} />
        </div>
        <div className="flex justify-end">
          <Button
            size="sm"
            className="bg-green-500 hover:bg-green-600 text-white"
            onClick={() => updateSocial.mutate()}
            disabled={updateSocial.isPending}
          >
            {updateSocial.isPending ? 'Sparar…' : 'Spara'}
          </Button>
        </div>
      </div>
    </div>
  );
}

// ─── Field helper ─────────────────────────────────────────────────────────────

function Field({
  label,
  placeholder,
  value,
  onChange,
}: {
  label:       string;
  placeholder: string;
  value:       string;
  onChange:    (e: React.ChangeEvent<HTMLInputElement>) => void;
}) {
  return (
    <div className="space-y-1">
      <label className="block text-xs font-medium text-foreground">{label}</label>
      <input
        type="text"
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        className="w-full h-9 px-3 text-sm border border-border rounded-md bg-background text-foreground
                   focus:outline-none focus:ring-2 focus:ring-primary/40 placeholder:text-muted-foreground/50"
      />
    </div>
  );
}
