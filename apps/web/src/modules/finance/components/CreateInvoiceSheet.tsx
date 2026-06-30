import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useForm, useFieldArray, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Plus, Trash2, Search, UserCheck } from 'lucide-react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
  Form, FormField, FormItem, FormLabel, FormControl, FormMessage,
  Input, Textarea,
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
  Button, Separator, ScrollArea, Skeleton,
  toast,
} from '@platform/ui';
import type { Student } from '@modules/students/hooks/useStudents.js';
import { useStudentList } from '@modules/students/hooks/useStudents.js';
import { useCreateInvoice, useAddInvoiceLine } from '../hooks/useFinance.js';
import { formatCurrency } from '../lib/financeUtils.js';

// ─── Constants ────────────────────────────────────────────────────────────────

const LINE_TYPES = ['lesson', 'package', 'fee', 'discount', 'tax', 'other'] as const;
const LINE_TYPE_LABELS: Record<typeof LINE_TYPES[number], string> = {
  lesson:   'Lektion',
  package:  'Paket',
  fee:      'Avgift',
  discount: 'Rabatt',
  tax:      'Skatt',
  other:    'Övrigt',
};

const VAT_RATES = [
  { value: 0.25, label: '25%' },
  { value: 0.12, label: '12%' },
  { value: 0.06, label: '6%' },
  { value: 0,    label: '0%' },
];

// ─── Schema ───────────────────────────────────────────────────────────────────

const lineSchema = z.object({
  line_type:   z.enum(LINE_TYPES),
  description: z.string().min(1, 'Beskrivning krävs'),
  quantity:    z.coerce.number().min(0.001, 'Antal > 0'),
  unit_price:  z.coerce.number().min(0, 'Pris ≥ 0'),
  vat_rate:    z.coerce.number().min(0).max(1),
});

const formSchema = z.object({
  due_date:   z.string().optional(),
  notes:      z.string().optional(),
  line_items: z.array(lineSchema).min(1, 'Minst en fakturarad krävs'),
});

type FormValues = z.infer<typeof formSchema>;

const DEFAULT_LINE: FormValues['line_items'][number] = {
  line_type:   'lesson',
  description: '',
  quantity:    1,
  unit_price:  0,
  vat_rate:    0.25,
};

const FORM_DEFAULTS: FormValues = {
  due_date:   '',
  notes:      '',
  line_items: [{ ...DEFAULT_LINE }],
};

// ─── Props ────────────────────────────────────────────────────────────────────

interface CreateInvoiceSheetProps {
  open:         boolean;
  onOpenChange: (open: boolean) => void;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function CreateInvoiceSheet({ open, onOpenChange }: CreateInvoiceSheetProps) {
  const navigate = useNavigate();

  // Student search
  const [selectedStudent, setSelectedStudent] = useState<Student | null>(null);
  const [studentSearch,   setStudentSearch]   = useState('');
  const [debounced,       setDebounced]       = useState('');
  const [studentError,    setStudentError]    = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(studentSearch), 300);
    return () => clearTimeout(t);
  }, [studentSearch]);

  const { data: studentsData, isLoading: studentsLoading } = useStudentList(
    { per_page: 30, ...(debounced ? { search: debounced } : {}) },
    { enabled: open },
  );

  // Form
  const form = useForm<FormValues>({
    resolver:      zodResolver(formSchema),
    defaultValues: FORM_DEFAULTS,
  });

  const { fields, append, remove } = useFieldArray({ control: form.control, name: 'line_items' });

  const lineItems = useWatch({ control: form.control, name: 'line_items' });
  const totals = useMemo(() => {
    const subtotal = lineItems.reduce(
      (s, l) => s + (Number(l.quantity) || 0) * (Number(l.unit_price) || 0),
      0,
    );
    const vat = lineItems.reduce(
      (s, l) => s + (Number(l.quantity) || 0) * (Number(l.unit_price) || 0) * (Number(l.vat_rate) || 0),
      0,
    );
    return { subtotal, vat, total: subtotal + vat };
  }, [lineItems]);

  // Mutations
  const [isSubmitting, setIsSubmitting] = useState(false);
  const createInvoice = useCreateInvoice();
  const addLine       = useAddInvoiceLine();

  // Reset when sheet closes
  useEffect(() => {
    if (!open) {
      form.reset(FORM_DEFAULTS);
      setSelectedStudent(null);
      setStudentSearch('');
      setDebounced('');
      setStudentError(false);
      setIsSubmitting(false);
    }
  }, [open, form]);

  async function handleSubmit(values: FormValues) {
    if (!selectedStudent) {
      setStudentError(true);
      return;
    }
    setStudentError(false);
    setIsSubmitting(true);

    let invoiceId: string | null = null;
    try {
      const invoice = await createInvoice.mutateAsync({
        student_id: selectedStudent.id,
        due_date:   values.due_date || null,
        notes:      values.notes   || null,
      });
      invoiceId = invoice.id;

      for (const line of values.line_items) {
        await addLine.mutateAsync({
          invoiceId:   invoice.id,
          line_type:   line.line_type,
          description: line.description,
          quantity:    line.quantity,
          unit_price:  line.unit_price,
          vat_rate:    line.vat_rate,
        });
      }

      toast({
        title:       'Faktura skapad',
        description: `Utkast för ${selectedStudent.first_name} ${selectedStudent.last_name} sparat.`,
      });
      onOpenChange(false);
      navigate(`/finance/invoices/${invoice.id}`);
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Försök igen';
      toast({ title: 'Kunde inte spara faktura', description: msg, variant: 'destructive' });
      if (invoiceId !== null) {
        onOpenChange(false);
        navigate(`/finance/invoices/${invoiceId}`);
      }
    } finally {
      setIsSubmitting(false);
    }
  }

  const students = studentsData?.data ?? [];

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!isSubmitting) onOpenChange(o); }}>
      <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col gap-0 p-0 overflow-hidden">
        <DialogHeader className="px-6 pt-6 pb-4 border-b border-border shrink-0">
          <DialogTitle>Ny faktura</DialogTitle>
          <DialogDescription>Skapa ett fakturautkast. Välj elev och lägg till rader.</DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(handleSubmit)} className="flex flex-col flex-1 min-h-0">
            <div className="flex-1 overflow-y-auto px-6 py-5 space-y-6">

              {/* ── Student ─────────────────────────────────────────────── */}
              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground leading-none">
                  Elev <span className="text-destructive">*</span>
                </label>

                {selectedStudent ? (
                  <div className="flex items-center justify-between rounded-md border border-border bg-muted/40 px-3 py-2.5">
                    <div className="flex items-center gap-2 min-w-0">
                      <UserCheck className="w-4 h-4 text-primary shrink-0" />
                      <span className="text-sm font-medium text-foreground truncate">
                        {selectedStudent.first_name} {selectedStudent.last_name}
                      </span>
                      {selectedStudent.email && (
                        <span className="text-xs text-muted-foreground hidden sm:block truncate">
                          {selectedStudent.email}
                        </span>
                      )}
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-7 text-xs shrink-0"
                      onClick={() => { setSelectedStudent(null); setStudentSearch(''); }}
                    >
                      Byt
                    </Button>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <div className="relative">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
                      <Input
                        placeholder="Sök elev..."
                        value={studentSearch}
                        onChange={(e) => { setStudentSearch(e.target.value); setStudentError(false); }}
                        className="pl-9"
                      />
                    </div>
                    <ScrollArea className="h-40 rounded-md border border-border">
                      {studentsLoading ? (
                        <div className="p-3 space-y-2">
                          {[1, 2, 3].map((i) => <Skeleton key={i} className="h-8 w-full rounded" />)}
                        </div>
                      ) : students.length === 0 ? (
                        <div className="flex items-center justify-center h-full text-sm text-muted-foreground py-6">
                          {debounced ? 'Inga elever hittades' : 'Börja skriva för att söka'}
                        </div>
                      ) : (
                        <div className="p-1">
                          {students.map((s) => (
                            <button
                              key={s.id}
                              type="button"
                              onClick={() => { setSelectedStudent(s); setStudentError(false); }}
                              className="w-full text-left px-3 py-2 rounded text-sm transition-colors hover:bg-accent text-foreground flex items-center gap-2"
                            >
                              <span className="font-medium">{s.first_name} {s.last_name}</span>
                              {s.email && (
                                <span className="text-xs text-muted-foreground truncate">{s.email}</span>
                              )}
                            </button>
                          ))}
                        </div>
                      )}
                    </ScrollArea>
                    {studentError && (
                      <p className="text-xs text-destructive">Välj en elev</p>
                    )}
                  </div>
                )}
              </div>

              <Separator />

              {/* ── Invoice fields ───────────────────────────────────────── */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="due_date"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Förfallodatum</FormLabel>
                      <FormControl>
                        <Input type="date" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <FormField
                control={form.control}
                name="notes"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Noteringar</FormLabel>
                    <FormControl>
                      <Textarea
                        placeholder="Valfria noteringar till fakturan..."
                        className="resize-none"
                        rows={2}
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <Separator />

              {/* ── Line items ───────────────────────────────────────────── */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-foreground">Fakturarader</span>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-7 text-xs gap-1"
                    onClick={() => append({ ...DEFAULT_LINE })}
                  >
                    <Plus className="w-3.5 h-3.5" />
                    Lägg till rad
                  </Button>
                </div>

                {fields.map((field, idx) => {
                  const qty       = Number(lineItems[idx]?.quantity   || 0);
                  const price     = Number(lineItems[idx]?.unit_price || 0);
                  const vatRate   = Number(lineItems[idx]?.vat_rate   || 0);
                  const lineTotal = qty * price * (1 + vatRate);

                  return (
                    <div key={field.id} className="rounded-lg border border-border p-3 space-y-3 bg-card">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-medium text-muted-foreground">Rad {idx + 1}</span>
                        {fields.length > 1 && (
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6"
                            onClick={() => remove(idx)}
                          >
                            <Trash2 className="w-3.5 h-3.5 text-muted-foreground" />
                          </Button>
                        )}
                      </div>

                      <div className="grid grid-cols-2 gap-2">
                        <FormField
                          control={form.control}
                          name={`line_items.${idx}.line_type`}
                          render={({ field: f }) => (
                            <FormItem>
                              <FormLabel className="text-xs">Typ</FormLabel>
                              <Select value={f.value} onValueChange={f.onChange}>
                                <FormControl>
                                  <SelectTrigger className="h-8 text-xs">
                                    <SelectValue />
                                  </SelectTrigger>
                                </FormControl>
                                <SelectContent>
                                  {LINE_TYPES.map((t) => (
                                    <SelectItem key={t} value={t} className="text-xs">
                                      {LINE_TYPE_LABELS[t]}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                              <FormMessage />
                            </FormItem>
                          )}
                        />

                        <FormField
                          control={form.control}
                          name={`line_items.${idx}.vat_rate`}
                          render={({ field: f }) => (
                            <FormItem>
                              <FormLabel className="text-xs">Moms</FormLabel>
                              <Select
                                value={String(f.value)}
                                onValueChange={(v) => f.onChange(Number(v))}
                              >
                                <FormControl>
                                  <SelectTrigger className="h-8 text-xs">
                                    <SelectValue />
                                  </SelectTrigger>
                                </FormControl>
                                <SelectContent>
                                  {VAT_RATES.map((r) => (
                                    <SelectItem key={r.value} value={String(r.value)} className="text-xs">
                                      {r.label}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      </div>

                      <FormField
                        control={form.control}
                        name={`line_items.${idx}.description`}
                        render={({ field: f }) => (
                          <FormItem>
                            <FormLabel className="text-xs">Beskrivning</FormLabel>
                            <FormControl>
                              <Input
                                placeholder="T.ex. Körlektion 45 min"
                                className="h-8 text-sm"
                                {...f}
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <div className="grid grid-cols-3 gap-2 items-end">
                        <FormField
                          control={form.control}
                          name={`line_items.${idx}.quantity`}
                          render={({ field: f }) => (
                            <FormItem>
                              <FormLabel className="text-xs">Antal</FormLabel>
                              <FormControl>
                                <Input
                                  type="number"
                                  min="0.001"
                                  step="0.5"
                                  className="h-8 text-sm"
                                  {...f}
                                />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />

                        <FormField
                          control={form.control}
                          name={`line_items.${idx}.unit_price`}
                          render={({ field: f }) => (
                            <FormItem>
                              <FormLabel className="text-xs">À-pris (kr)</FormLabel>
                              <FormControl>
                                <Input
                                  type="number"
                                  min="0"
                                  step="1"
                                  className="h-8 text-sm"
                                  {...f}
                                />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />

                        <div className="pb-0.5">
                          <p className="text-xs font-medium text-foreground mb-2">Summa</p>
                          <p className="text-sm font-mono text-muted-foreground h-8 flex items-center">
                            {formatCurrency(lineTotal)}
                          </p>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* ── Totals ───────────────────────────────────────────────── */}
              <div className="rounded-lg bg-muted/40 border border-border p-3 space-y-1.5">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Netto (exkl. moms)</span>
                  <span className="font-mono">{formatCurrency(totals.subtotal)}</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Moms</span>
                  <span className="font-mono">{formatCurrency(totals.vat)}</span>
                </div>
                <Separator className="my-1" />
                <div className="flex items-center justify-between text-sm font-semibold">
                  <span>Totalt att betala</span>
                  <span className="font-mono">{formatCurrency(totals.total)}</span>
                </div>
              </div>
            </div>

            {/* ── Footer ─────────────────────────────────────────────────── */}
            <div className="px-6 py-4 border-t border-border flex items-center justify-end gap-2 shrink-0">
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
                disabled={isSubmitting}
              >
                Avbryt
              </Button>
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting ? 'Sparar...' : 'Spara utkast'}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
