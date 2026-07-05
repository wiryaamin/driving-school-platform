import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Building2, ChevronRight, Eye, EyeOff, Upload } from 'lucide-react';
import {
  Button, Skeleton,
  Card, CardContent, CardHeader, CardTitle, CardFooter,
  Input, Label,
  toast,
} from '@platform/ui';
import { supabase } from '@core/api/supabase.js';
import { useSession } from '@shared/hooks/useSession.js';

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
  stripe_secret_key?: string;
  nets_secret_key?:  string;
  nets_checkout_key?: string;
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

type FormFields = {
  legal_name: string; name: string; org_number: string; vat_number: string;
  address: string; postal_code: string; city: string;
  contact_person: string; contact_email: string; contact_phone: string;
  customer_email: string; customer_phone: string;
  postal_address: string; postal_zip: string; postal_city: string;
  visit_address: string; visit_zip: string; visit_city: string;
  swish_number: string; stripe_secret_key: string;
  nets_secret_key: string; nets_checkout_key: string;
  instagram: string; facebook: string; tiktok: string; youtube: string;
};

// ─── Validation ───────────────────────────────────────────────────────────────

function validateBasic(f: FormFields): Record<string, string> {
  const e: Record<string, string> = {};
  if (f.org_number && !/^\d{6}-\d{4}$/.test(f.org_number))
    e['org_number'] = 'Ogiltigt format. Ange organisationsnumret som XXXXXX-XXXX.';
  if (f.vat_number && !/^SE\d{10}$/.test(f.vat_number))
    e['vat_number'] = 'Ogiltigt format. Ange momsregistreringsnumret som SE + 10 siffror.';
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

  const [form, setForm] = useState<FormFields>({
    legal_name: '', name: '', org_number: '', vat_number: '',
    address: '', postal_code: '', city: '',
    contact_person: '', contact_email: '', contact_phone: '',
    customer_email: '', customer_phone: '',
    postal_address: '', postal_zip: '', postal_city: '',
    visit_address: '', visit_zip: '', visit_city: '',
    swish_number: '', stripe_secret_key: '', nets_secret_key: '', nets_checkout_key: '',
    instagram: '', facebook: '', tiktok: '', youtube: '',
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
      stripe_secret_key: s.stripe_secret_key ?? '',
      nets_secret_key:   s.nets_secret_key ?? '',
      nets_checkout_key: s.nets_checkout_key ?? '',
      instagram:         s.instagram ?? '',
      facebook:          s.facebook ?? '',
      tiktok:            s.tiktok ?? '',
      youtube:           s.youtube ?? '',
    });
  }, [org]);

  function field(key: keyof FormFields) {
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

  const updatePaymentGateways = useMutation({
    mutationFn: async () => {
      if (!orgId) return;
      const cur = (org?.settings ?? {}) as OrgSettings;
      await supabase.from('organizations').update({
        settings: {
          ...cur,
          swish_number:      form.swish_number      || undefined,
          stripe_secret_key: form.stripe_secret_key || undefined,
          nets_secret_key:   form.nets_secret_key   || undefined,
          nets_checkout_key: form.nets_checkout_key || undefined,
        },
      } as never).eq('id', orgId);
    },
    onSuccess: () => {
      invalidate();
      toast({ title: 'Betallösningar sparades' });
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
        <CardContent className="p-8 flex flex-col items-center text-center gap-2">
          <div className="w-12 h-12 rounded-xl bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 flex items-center justify-center">
            <Building2 className="w-6 h-6" strokeWidth={1.75} aria-hidden="true" />
          </div>
          <h1 className="text-xl font-semibold tracking-tight text-foreground">Företag</h1>
          <p className="text-sm text-muted-foreground">Hantera verksamhetens uppgifter.</p>
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
            <Field id="contact_person" label="Er kontaktperson" placeholder="Namn" {...field('contact_person')} />
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
            <p className="text-xs text-muted-foreground">Syns på utbildningskortet och faktura</p>
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
            <p className="text-xs text-muted-foreground">Synlig på TABSwebb</p>
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
          <div className="space-y-2 pt-4 border-t border-border">
            <p className="text-xs font-semibold text-foreground uppercase tracking-wide">Stripe (kortbetalning)</p>
            <SecretField
              id="stripe_secret_key"
              label="Stripe Secret Key"
              placeholder="sk_live_… eller sk_test_…"
              value={form.stripe_secret_key}
              onChange={v => setForm(prev => ({ ...prev, stripe_secret_key: v }))}
            />
            <p className="text-[11px] text-muted-foreground">
              Hämtas från{' '}
              <span className="font-medium">Stripe Dashboard → API-nycklar</span>.
              Konfigurera även webhook-URL:en i Stripe:{' '}
              <span className="font-mono text-[11px] bg-muted px-1 py-px rounded">/functions/v1/stripe-webhook</span>
              {' '}(händelse:{' '}
              <span className="font-mono text-[11px]">checkout.session.completed</span>).
            </p>
          </div>

          {/* Nets */}
          <div className="space-y-2 pt-4 border-t border-border">
            <p className="text-xs font-semibold text-foreground uppercase tracking-wide">Nets</p>
            <div className="grid grid-cols-2 gap-3">
              <Field id="nets_secret_key" label="Nets Secret Key" placeholder="Nets Secret Key" {...field('nets_secret_key')} />
              <Field id="nets_checkout_key" label="Nets Checkout Key" placeholder="Nets Checkout Key" {...field('nets_checkout_key')} />
            </div>
          </div>

          {/* Apple Pay */}
          <div className="pt-4 border-t border-border space-y-3">
            <p className="text-xs font-semibold text-foreground uppercase tracking-wide">Apple Pay (via Nets)</p>
            <label className="inline-flex cursor-pointer">
              <span className="inline-flex items-center gap-2 h-9 px-3 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors">
                <Upload className="w-4 h-4" strokeWidth={2} aria-hidden="true" />
                Ladda upp Apple Domain Verification-filen
              </span>
              <input type="file" className="sr-only" accept=".txt,.json" />
            </label>
          </div>
        </CardContent>
        <CardFooter className="justify-end px-6 pb-6 pt-0">
          <Button size="sm" onClick={() => updatePaymentGateways.mutate()} disabled={updatePaymentGateways.isPending}>
            {updatePaymentGateways.isPending ? 'Sparar…' : 'Spara'}
          </Button>
        </CardFooter>
      </Card>

      {/* Social media */}
      <Card>
        <CardHeader className="pb-0 px-6 pt-6">
          <CardTitle className="text-sm font-semibold">Sociala medier</CardTitle>
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

// ─── Secret field (password visibility toggle) ────────────────────────────────

function SecretField({
  id,
  label,
  placeholder,
  value,
  onChange,
}: {
  id:          string;
  label:       string;
  placeholder: string;
  value:       string;
  onChange:    (v: string) => void;
}) {
  const [show, setShow] = useState(false);
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      <div className="relative">
        <Input
          id={id}
          type={show ? 'text' : 'password'}
          value={value}
          onChange={e => onChange(e.target.value)}
          placeholder={placeholder}
          autoComplete="new-password"
          className="pr-9"
        />
        <button
          type="button"
          onClick={() => setShow(v => !v)}
          className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
          aria-label={show ? 'Dölj nyckel' : 'Visa nyckel'}
        >
          {show ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
        </button>
      </div>
    </div>
  );
}
