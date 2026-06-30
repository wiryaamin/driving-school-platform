// Swedish-named namespace alias — all real communication logic lives in @modules/communication
export {
  CommunicationHubPage as KommunikationPage,
  ComposeMessagePage,
  DeliveryLogPage,
  ChannelSettingsPage,
  TemplateManagementPage,
  ActivityCenterPage,
  NotificationRulesPage,
  QueueMonitorPage,
  CommAnalyticsPage,
  NotificationLogPage,
  ChannelIcon,
  ChannelBadge,
  StatusBadge,
} from '@modules/communication/index.js';
export type { CommChannel, OutboundMessage, ChannelConfig, CommTemplate } from '@modules/communication/index.js';
