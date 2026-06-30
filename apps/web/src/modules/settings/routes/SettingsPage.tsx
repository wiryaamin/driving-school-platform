import type { ComponentType } from 'react';
import { useParams } from 'react-router-dom';
import { SettingsSidebar } from '../components/SettingsSidebar.js';
import { SettingsHubPage }          from './SettingsHubPage.js';
import { CompanySettingsPage }      from './CompanySettingsPage.js';
import { LegalSettingsPage }        from './LegalSettingsPage.js';
import { LocationsSettingsPage }    from './LocationsSettingsPage.js';
import { ElevbokningTjansterPage }  from './ElevbokningTjansterPage.js';
import { ElevbokningConfigPage }    from './ElevbokningConfigPage.js';
import { ResourcesSettingsPage }    from './ResourcesSettingsPage.js';
import { VenuesSettingsPage }       from './VenuesSettingsPage.js';
import { TidmallarPage }            from './TidmallarPage.js';
import { TidmallsgrupperPage }      from './TidmallsgrupperPage.js';
import { SchemamallarPage }         from './SchemamallarPage.js';
import { BokningarSchemaPage }      from './BokningarSchemaPage.js';
import { HelgdagarPage }            from './HelgdagarPage.js';
import { SchemaConfigPage }         from './SchemaConfigPage.js';
import { KundinställningarPage }    from './KundinställningarPage.js';
import { TaggarPage }               from './TaggarPage.js';
import { SegmentPage }              from './SegmentPage.js';
import { VärvaEnVänPage }           from './VärvaEnVänPage.js';
import { BaskontaPage }             from './BaskontaPage.js';
import { KontoplanPage }            from './KontoplanPage.js';
import { KassaSettingsPage }        from './KassaSettingsPage.js';
import { PresentkortSettingsPage }  from './PresentkortSettingsPage.js';
import { LektionstyperSettingsPage } from './LektionstyperSettingsPage.js';
import { ArtiklarSettingsPage }     from './ArtiklarSettingsPage.js';
import { ProdukterSettingsPage }    from './ProdukterSettingsPage.js';
import { MarknadsföringPage }       from './MarknadsföringPage.js';
import { KommunikationConfigPage }   from './KommunikationConfigPage.js';
import { GemensammaFraserPage }      from './GemensammaFraserPage.js';
import { MeddelandemallarPage }      from './MeddelandemallarPage.js';
import { AutomatiseringsReglerPage } from './AutomatiseringsReglerPage.js';
import { UndervisningsplanPage }    from './UndervisningsplanPage.js';
import { MaterialsSettingsPage }   from './MaterialsSettingsPage.js';
import { UtbildningsbehörigheterPage } from './UtbildningsbehörigheterPage.js';
import { WebbplatsAllmäntPage }    from './WebbplatsAllmäntPage.js';
import { VarumärkePage }           from './VarumärkePage.js';
import { DigitalaAvtalPage }       from './DigitalaAvtalPage.js';
import { EnkäterPage }             from './EnkäterPage.js';
import { SkillsterPage }           from './SkillsterPage.js';
import { TeoricentralenPage }      from './TeoricentralenPage.js';
import { SysteminställningarPage } from './SysteminställningarPage.js';
import { LeadsSettingsPage }       from '@modules/leads/index.js';

// ─── Sub-page map (segment → component) ──────────────────────────────────────

const PAGE_MAP: Record<string, ComponentType> = {
  '':                               SettingsHubPage,
  'company':                        CompanySettingsPage,
  'legal':                          LegalSettingsPage,
  'locations':                      LocationsSettingsPage,
  'student-booking/services':       ElevbokningTjansterPage,
  'student-booking/config':         ElevbokningConfigPage,
  'resources':                      ResourcesSettingsPage,
  'venues':                         VenuesSettingsPage,
  'customers/config':               KundinställningarPage,
  'customers/tags':                 TaggarPage,
  'customers/segments':             SegmentPage,
  'customers/referral':             VärvaEnVänPage,
  'schema/time-templates':          TidmallarPage,
  'schema/time-template-groups':    TidmallsgrupperPage,
  'schema/templates':               SchemamallarPage,
  'schema/bookings':                BokningarSchemaPage,
  'schema/holidays':                HelgdagarPage,
  'schema/config':                  SchemaConfigPage,
  'finance/accounts':               BaskontaPage,
  'finance/chart':                  KontoplanPage,
  'finance/kassa':                  KassaSettingsPage,
  'finance/gift-cards':             PresentkortSettingsPage,
  'finance/lesson-types':           LektionstyperSettingsPage,
  'finance/articles':               ArtiklarSettingsPage,
  'finance/products':               ProdukterSettingsPage,
  'addons/marketing':               MarknadsföringPage,
  'addons/contracts':               DigitalaAvtalPage,
  'addons/surveys':                 EnkäterPage,
  'addons/skillster':               SkillsterPage,
  'website/general':                WebbplatsAllmäntPage,
  'website/brand':                  VarumärkePage,
  'theory-center':                  TeoricentralenPage,
  'system':                         SysteminställningarPage,
  'communication/config':            KommunikationConfigPage,
  'communication/phrases':           GemensammaFraserPage,
  'communication/templates':         MeddelandemallarPage,
  'communication/automation':        AutomatiseringsReglerPage,
  'education/licenses':             UtbildningsbehörigheterPage,
  'education/curriculum':           UndervisningsplanPage,
  'education/materials':            MaterialsSettingsPage,
  'customers/leads':                LeadsSettingsPage,
};

// ─── SettingsPage ─────────────────────────────────────────────────────────────

export function SettingsPage() {
  const { '*': segment = '' } = useParams();
  const Page = PAGE_MAP[segment] ?? SettingsHubPage;

  if (!segment) {
    return <SettingsHubPage />;
  }

  return (
    <div className="flex -mx-4 md:-mx-5 -mt-4 md:-mt-5 min-h-[calc(100vh-3.5rem)]">
      <SettingsSidebar segment={segment} />
      <div className="flex-1 min-w-0 p-6 overflow-y-auto">
        <Page />
      </div>
    </div>
  );
}
