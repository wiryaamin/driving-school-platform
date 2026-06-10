import { useRef, useMemo, useState } from 'react';
import FullCalendar from '@fullcalendar/react';
import { AlertCircle } from 'lucide-react';
import { toast } from '@platform/ui';
import { PageLayout, PageHeader, PageContent } from '@shared/components/layout/PageLayout/PageLayout.js';
import { SchedulingCalendar } from '../components/SchedulingCalendar.js';
import { CalendarToolbar } from '../components/CalendarToolbar.js';
import { SlotDetailSheet } from '../components/SlotDetailSheet.js';
import { useCalendarView, type CalendarViewType } from '../hooks/useCalendarView.js';
import { useSlotList } from '../hooks/useSlots.js';
import { useUpdateSlotTiming } from '../hooks/useSchedulingMutations.js';
import { slotToCalendarEvent } from '../lib/calendarUtils.js';
import type { LessonSlot } from '@platform/types';
import type { SlotDropInfo } from '../components/SchedulingCalendar.js';

// ─── SchedulingCalendarPage ───────────────────────────────────────────────────

export function SchedulingCalendarPage() {
  const calendarRef = useRef<FullCalendar>(null);

  // Slot detail sheet state
  const [selectedSlot,    setSelectedSlot]    = useState<LessonSlot | null>(null);
  const [sheetOpen,       setSheetOpen]       = useState(false);

  const {
    initialView,
    currentView,
    currentTitle,
    dateRange,
    handleDatesSet,
  } = useCalendarView();

  // Fetch slots for the visible date range
  const { data: slotsData, isLoading, error } = useSlotList({
    per_page: 100,
    ...(dateRange.from ? { from: dateRange.from } : {}),
    ...(dateRange.to   ? { to:   dateRange.to   } : {}),
  });

  const updateSlotTiming = useUpdateSlotTiming();

  // Convert LessonSlot[] → FullCalendar EventInput[]
  const events = useMemo(
    () => (slotsData?.data ?? []).map(slotToCalendarEvent),
    [slotsData]
  );

  // ── Toolbar handlers ───────────────────────────────────────────────────────
  function handlePrev()  { calendarRef.current?.getApi().prev(); }
  function handleNext()  { calendarRef.current?.getApi().next(); }
  function handleToday() { calendarRef.current?.getApi().today(); }

  function handleViewChange(view: CalendarViewType) {
    calendarRef.current?.getApi().changeView(view);
  }

  // ── Slot click → open detail sheet ────────────────────────────────────────
  function handleSlotClick(slot: LessonSlot) {
    setSelectedSlot(slot);
    setSheetOpen(true);
  }

  // ── Drag/drop → PATCH slot timing; revert on failure ──────────────────────
  function handleSlotDrop({ slot, newStart, newEnd, revert }: SlotDropInfo) {
    updateSlotTiming.mutate(
      {
        id:        slot.id,
        starts_at: newStart.toISOString(),
        ends_at:   newEnd.toISOString(),
      },
      {
        onSuccess: () => {
          toast({ title: 'Pass flyttat' });
        },
        onError: (err) => {
          revert();
          toast({
            title:       'Flytt misslyckades',
            description: err instanceof Error ? err.message : 'Kontrollera tillgänglighet och försök igen.',
            variant:     'destructive',
          });
        },
      }
    );
  }

  const slotCount      = slotsData?.meta.total ?? 0;
  const descriptionText = isLoading
    ? 'Laddar...'
    : slotCount > 0
    ? `${slotCount} pass totalt`
    : '';

  return (
    <>
      <PageLayout className="!space-y-4">
        <PageHeader
          title="Schema"
          breadcrumbs={[{ label: 'Hem' }, { label: 'Schema' }]}
          {...(descriptionText ? { description: descriptionText } : {})}
        />

        <PageContent className="!space-y-3">
          {/* Toolbar */}
          <CalendarToolbar
            title={currentTitle}
            view={currentView}
            onPrev={handlePrev}
            onNext={handleNext}
            onToday={handleToday}
            onViewChange={handleViewChange}
            isLoading={isLoading}
          />

          {/* Error state */}
          {error && !isLoading && (
            <div className="flex items-center gap-2 rounded-md border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
              <AlertCircle className="w-4 h-4 shrink-0" />
              Det gick inte att hämta schemat. Försök igen om en stund.
            </div>
          )}

          {/* Calendar — outer card clips to border-radius; inner div scrolls week view on narrow screens */}
          <div className="rounded-lg border border-border bg-card overflow-hidden">
            <div className="overflow-x-auto">
            <SchedulingCalendar
              calendarRef={calendarRef}
              events={events}
              initialView={initialView}
              onDatesSet={handleDatesSet}
              onSlotClick={handleSlotClick}
              onSlotDrop={handleSlotDrop}
              isLoading={isLoading}
            />
            </div>
          </div>

          {/* Empty state */}
          {!isLoading && !error && dateRange.from && slotsData?.data.length === 0 && (
            <div className="text-center py-8 text-sm text-muted-foreground">
              Inga pass för denna period.
            </div>
          )}
        </PageContent>
      </PageLayout>

      {/* Slot detail sheet */}
      <SlotDetailSheet
        slot={selectedSlot}
        open={sheetOpen}
        onOpenChange={setSheetOpen}
      />
    </>
  );
}
