import { useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Loader2 } from 'lucide-react';
import {
  Button, Input, Textarea, Separator,
  Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
  Form, FormField, FormItem, FormLabel, FormControl, FormMessage,
} from '@platform/ui';
import { PageHeading } from '@modules/public-site/index.js';
import {
  demoRequestSchema,
  DEMO_REQUEST_DEFAULTS,
  CURRENT_SYSTEM_OPTIONS,
  type DemoRequestFormFields,
} from '../lib/demoRequestSchema.js';
import { submitDemoRequest, toDemoRequestPayload, DemoRequestError } from '../lib/submitDemoRequest.js';

/**
 * The registration form + submitted/error states, extracted from DemoPage.tsx
 * so the identical form (same schema, same Edge Function call, same
 * confirmation copy) can be embedded directly on the landing page's CTA
 * section as well as on the standalone /demo page — one implementation, two
 * placements, per the Pilot Readiness public-journey exception (embed the
 * form inline on the landing page rather than only linking out to /demo).
 *
 * Deliberately does not render its own outer Section/heading — callers
 * already provide the surrounding section chrome and intro copy, which
 * differs slightly between the landing page and /demo.
 */
export function DemoRequestForm() {
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const honeypotRef = useRef<HTMLInputElement>(null);

  const form = useForm<DemoRequestFormFields>({
    resolver: zodResolver(demoRequestSchema),
    defaultValues: DEMO_REQUEST_DEFAULTS,
    mode: 'onBlur',
  });

  async function onSubmit(fields: DemoRequestFormFields) {
    setSubmitError(null);
    setSubmitting(true);
    try {
      const payload = toDemoRequestPayload(fields, honeypotRef.current?.value ?? '');
      await submitDemoRequest(payload);
      setSubmitted(true);
    } catch (err) {
      setSubmitError(
        err instanceof DemoRequestError ? err.message : 'Något gick fel. Kontrollera er internetanslutning och försök igen.'
      );
    } finally {
      setSubmitting(false);
    }
  }

  if (submitted) {
    return (
      <div className="mx-auto max-w-xl text-center">
        <PageHeading
          as="h2"
          title="Tack!"
          description="Vi har tagit emot er registrering."
        />
        <p className="mx-auto mt-4 max-w-xl text-pretty text-base text-muted-foreground">
          Vi granskar er förfrågan och hör av oss för att boka en tid. Vill ni komma igång direkt
          istället för att vänta på oss, kan ni{' '}
          <Link
            to="/start-trial"
            className="font-medium text-foreground underline-offset-4 hover:text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          >
            starta er kostnadsfria provperiod
          </Link>{' '}
          på egen hand.
        </p>
        <p className="mx-auto mt-4 max-w-xl text-pretty text-base text-muted-foreground">
          Har ni frågor under tiden är kontaktsidan bästa vägen dit.{' '}
          <Link
            to="/contact"
            className="font-medium text-foreground underline-offset-4 hover:text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          >
            Gå till Kontakt
          </Link>
          .
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl">
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} noValidate className="space-y-8">
          {/* Honeypot — invisible and unreachable to real visitors; see file-level docs above. */}
          <div aria-hidden="true" style={{ position: 'absolute', left: '-9999px', width: '1px', height: '1px', overflow: 'hidden' }}>
            <label htmlFor="website">Webbplats</label>
            <input ref={honeypotRef} type="text" id="website" name="website" tabIndex={-1} autoComplete="off" />
          </div>

          {/* Kontaktuppgifter */}
          <div className="space-y-4">
            <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
              Kontaktuppgifter
            </p>
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Namn *</FormLabel>
                  <FormControl>
                    <Input placeholder="Erik Lindqvist" autoComplete="name" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <FormField
                control={form.control}
                name="email"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>E-post *</FormLabel>
                    <FormControl>
                      <Input type="email" placeholder="erik@korskola.se" autoComplete="email" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="phone"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Telefonnummer *</FormLabel>
                    <FormControl>
                      <Input type="tel" placeholder="070-123 45 67" autoComplete="tel" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
          </div>

          <Separator />

          {/* Om er skola */}
          <div className="space-y-4">
            <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
              Om er skola
            </p>
            <FormField
              control={form.control}
              name="schoolName"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Trafikskolans namn *</FormLabel>
                  <FormControl>
                    <Input placeholder="Lindqvists Trafikskola" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <FormField
                control={form.control}
                name="municipality"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Kommun / ort *</FormLabel>
                    <FormControl>
                      <Input placeholder="Uppsala" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="currentSystem"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Hur driver ni verksamheten idag? *</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Välj ett alternativ..." />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {CURRENT_SYSTEM_OPTIONS.map((opt) => (
                          <SelectItem key={opt.value} value={opt.value}>
                            {opt.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <FormField
                control={form.control}
                name="locationCount"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Antal orter *</FormLabel>
                    <FormControl>
                      <Input inputMode="numeric" placeholder="1" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="studentCount"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Ungefärligt antal elever *</FormLabel>
                    <FormControl>
                      <Input inputMode="numeric" placeholder="t.ex. 45" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
          </div>

          <Separator />

          {/* Valfritt */}
          <div className="space-y-4">
            <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
              Valfritt
            </p>
            <FormField
              control={form.control}
              name="message"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Vad vill ni prata om under visningen?</FormLabel>
                  <FormControl>
                    <Textarea rows={4} placeholder="Till exempel en särskild fråga eller situation ni vill ha svar på." {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>

          {submitError && (
            <p role="alert" className="text-center text-sm font-medium text-destructive">
              {submitError}
            </p>
          )}

          <div className="flex justify-center pt-2">
            <Button
              type="submit"
              size="lg"
              disabled={submitting}
              className="h-12 rounded-lg px-6 text-base font-medium"
            >
              {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />}
              {submitting ? 'Skickar...' : 'Boka personlig visning'}
            </Button>
          </div>
        </form>
      </Form>
    </div>
  );
}
