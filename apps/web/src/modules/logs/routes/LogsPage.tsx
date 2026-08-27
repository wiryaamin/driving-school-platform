import { useState } from 'react';
import { BookingLogsPage } from './BookingLogsPage.js';
import { KommunikationsloggarPage } from './KommunikationsloggarPage.js';
import { AktivitetsloggarPage } from './AktivitetsloggarPage.js';
import { MissadeUtbildningsloggarPage } from './MissadeUtbildningsloggarPage.js';
import { MissadeExaminationsmomentPage } from './MissadeExaminationsmomentPage.js';
import { AndringsloggPage } from './AndringsloggPage.js';
import { cn } from '@/lib/utils.js';

type LogTab = 'booking' | 'communication' | 'activity' | 'missed_training' | 'missed_exam' | 'andringslogg';

const TABS: { key: LogTab; label: string }[] = [
  { key: 'booking',         label: 'Bokningsloggar'            },
  { key: 'communication',   label: 'Kommunikationsloggar'      },
  { key: 'activity',        label: 'Aktivitetsloggar'          },
  { key: 'missed_training', label: 'Missade utbildningsloggar' },
  { key: 'missed_exam',     label: 'Missade examinationsmoment' },
  { key: 'andringslogg',    label: 'Ändringslogg'               },
];

export function LogsPage() {
  const [activeTab, setActiveTab] = useState<LogTab>('booking');

  return (
    <div className="px-4 pt-4">

      {/* Sub-tab bar — the outer System-workspace tab bar already labels this
          page "Loggar"; this row picks which of the six log types shows. */}
      <div className="flex items-end border-b border-border mb-5 overflow-x-auto">
        {TABS.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={cn(
              'px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors shrink-0',
              activeTab === tab.key
                ? 'border-primary text-primary'
                : 'border-transparent text-muted-foreground hover:text-foreground hover:border-muted-foreground/40',
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Content */}
      {activeTab === 'booking'         && <BookingLogsPage />}
      {activeTab === 'communication'   && <KommunikationsloggarPage />}
      {activeTab === 'activity'        && <AktivitetsloggarPage />}
      {activeTab === 'missed_training' && <MissadeUtbildningsloggarPage />}
      {activeTab === 'missed_exam'     && <MissadeExaminationsmomentPage />}
      {activeTab === 'andringslogg'    && <AndringsloggPage />}
    </div>
  );
}
