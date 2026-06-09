import { useState } from 'react';

// ─── Types ────────────────────────────────────────────────────────────────────

export type CalendarViewType = 'timeGridWeek' | 'timeGridDay' | 'dayGridMonth';

export interface CalendarDateRange {
  from: string;
  to: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getDefaultView(): CalendarViewType {
  if (typeof window === 'undefined') return 'timeGridWeek';
  return window.innerWidth < 768 ? 'timeGridDay' : 'timeGridWeek';
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

/**
 * useCalendarView — local calendar state only.
 * Date range is derived from FullCalendar's datesSet callback
 * (FullCalendar owns the authoritative visible range).
 */
export function useCalendarView() {
  const [initialView] = useState<CalendarViewType>(getDefaultView);
  const [currentView, setCurrentView] = useState<CalendarViewType>(getDefaultView);
  const [currentTitle, setCurrentTitle] = useState<string>('');
  const [dateRange, setDateRange] = useState<CalendarDateRange>({ from: '', to: '' });
  const [selectedInstructorIds, setSelectedInstructorIds] = useState<string[]>([]);
  const [selectedLessonTypeIds, setSelectedLessonTypeIds] = useState<string[]>([]);

  function handleDatesSet(view: CalendarViewType, title: string, start: Date, end: Date) {
    setCurrentView(view);
    setCurrentTitle(title);
    setDateRange({ from: start.toISOString(), to: end.toISOString() });
  }

  function toggleInstructorFilter(id: string) {
    setSelectedInstructorIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  }

  function clearFilters() {
    setSelectedInstructorIds([]);
    setSelectedLessonTypeIds([]);
  }

  return {
    initialView,
    currentView,
    currentTitle,
    dateRange,
    selectedInstructorIds,
    selectedLessonTypeIds,
    handleDatesSet,
    setSelectedInstructorIds,
    setSelectedLessonTypeIds,
    toggleInstructorFilter,
    clearFilters,
  };
}
