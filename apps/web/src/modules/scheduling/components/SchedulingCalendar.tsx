import type { RefObject } from 'react';
import FullCalendar from '@fullcalendar/react';
import dayGridPlugin from '@fullcalendar/daygrid';
import timeGridPlugin from '@fullcalendar/timegrid';
import interactionPlugin from '@fullcalendar/interaction';
import type { EventResizeDoneArg } from '@fullcalendar/interaction';
import svLocale from '@fullcalendar/core/locales/sv';
import type {
  EventInput, EventContentArg, DatesSetArg,
  EventClickArg, EventDropArg, EventApi,
} from '@fullcalendar/core';
import type { LessonSlot } from '@platform/types';
import { SlotEventCard } from './SlotEventCard.js';
import type { CalendarViewType } from '../hooks/useCalendarView.js';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface SlotDropInfo {
  slot:     LessonSlot;
  newStart: Date;
  newEnd:   Date;
  revert:   () => void;
}

// ─── Props ────────────────────────────────────────────────────────────────────

interface SchedulingCalendarProps {
  calendarRef:    RefObject<FullCalendar | null>;
  events:         EventInput[];
  initialView:    CalendarViewType;
  onDatesSet:     (view: CalendarViewType, title: string, start: Date, end: Date) => void;
  onSlotClick?:   (slot: LessonSlot) => void;
  onSlotDrop?:    (info: SlotDropInfo) => void;
  isLoading?:     boolean;
  instructorMap?: Record<string, string>;
  /** organizations.settings.schema.{start_time,end_time,show_weekends} — Schemainställningar */
  slotMinTime?:   string;
  slotMaxTime?:   string;
  weekends?:      boolean;
}

// ─── Terminal statuses blocked from drag/resize ───────────────────────────────

const LOCKED_STATUSES = new Set(['cancelled', 'blocked', 'completed', 'in_progress']);

// ─── SchedulingCalendar ───────────────────────────────────────────────────────

export function SchedulingCalendar({
  calendarRef,
  events,
  initialView,
  onDatesSet,
  onSlotClick,
  onSlotDrop,
  isLoading = false,
  instructorMap,
  slotMinTime = '06:00:00',
  slotMaxTime = '22:00:00',
  weekends = true,
}: SchedulingCalendarProps) {

  function handleDatesSet(info: DatesSetArg) {
    const api   = calendarRef.current?.getApi();
    const title = api?.view.title ?? '';
    onDatesSet(info.view.type as CalendarViewType, title, info.start, info.end);
  }

  function handleEventClick(info: EventClickArg) {
    const slot = info.event.extendedProps['slot'] as LessonSlot | undefined;
    if (slot && onSlotClick) onSlotClick(slot);
  }

  // Shared handler for both drag and resize — both expose newStart/newEnd/revert
  function dispatchSlotDrop(event: EventApi, revert: () => void) {
    const slot     = event.extendedProps['slot'] as LessonSlot | undefined;
    const newStart = event.start;
    const newEnd   = event.end;

    if (!slot || !newStart || !newEnd || !onSlotDrop) {
      revert();
      return;
    }

    onSlotDrop({ slot, newStart, newEnd, revert });
  }

  function handleEventDrop(info: EventDropArg) {
    dispatchSlotDrop(info.event, info.revert);
  }

  function handleEventResize(info: EventResizeDoneArg) {
    dispatchSlotDrop(info.event, info.revert);
  }

  // Prevent dragging/resizing terminal-state slots
  function handleEventAllow(_span: unknown, movingEvent: EventApi | null): boolean {
    if (!movingEvent) return false;
    const slot = movingEvent.extendedProps['slot'] as LessonSlot | undefined;
    if (!slot) return false;
    return !LOCKED_STATUSES.has(slot.status);
  }

  function renderEventContent(arg: EventContentArg) {
    const slot = arg.event.extendedProps['slot'] as LessonSlot | undefined;
    if (!slot) return null;
    const instructorName = instructorMap?.[slot.instructor_id];
    return <SlotEventCard slot={slot} instructorName={instructorName} />;
  }

  return (
    <div className={`fc-scheduling-wrapper ${isLoading ? 'opacity-60 pointer-events-none' : ''}`}>
      <FullCalendar
        ref={calendarRef}
        plugins={[dayGridPlugin, timeGridPlugin, interactionPlugin]}
        locale={svLocale}
        initialView={initialView}
        headerToolbar={false}
        firstDay={1}
        timeZone="Europe/Stockholm"
        height="auto"
        contentHeight="auto"
        expandRows={false}
        stickyHeaderDates
        nowIndicator
        dayMaxEvents={4}
        slotMinTime={slotMinTime}
        slotMaxTime={slotMaxTime}
        weekends={weekends}
        slotDuration="00:30:00"
        slotLabelInterval="01:00:00"
        scrollTime="07:00:00"
        allDaySlot={false}
        editable={Boolean(onSlotDrop)}
        eventAllow={handleEventAllow}
        events={events}
        eventContent={renderEventContent}
        eventClick={handleEventClick}
        eventDrop={handleEventDrop}
        eventResize={handleEventResize}
        datesSet={handleDatesSet}
        buttonText={{
          today: 'Idag',
          month: 'Månad',
          week:  'Vecka',
          day:   'Dag',
          list:  'Lista',
        }}
        views={{
          timeGridWeek: {
            titleFormat: { month: 'long', year: 'numeric' },
          },
          timeGridDay: {
            titleFormat: { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' },
          },
          dayGridMonth: {
            titleFormat:  { month: 'long', year: 'numeric' },
            dayMaxEvents: 6,
          },
        }}
      />
    </div>
  );
}
