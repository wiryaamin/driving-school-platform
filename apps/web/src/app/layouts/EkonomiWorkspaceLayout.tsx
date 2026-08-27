import { useLocation } from 'react-router-dom';
import { PieChart, BookOpen } from 'lucide-react';
import type { Permission } from '@core/rbac/permissions.js';
import { WorkspaceTabsLayout, type WorkspaceTab } from './WorkspaceTabsLayout.js';

// ─── Ekonomi / Bokföring ─────────────────────────────────────────────────────
//
// Ekonomi and Bokföring are two separate main workspaces in the sidebar, but
// their underlying pages all live inside the single existing `/finance/*`
// route tree (FinancePage's own nested <Routes>) plus three sibling
// top-level modules (Ordrar, Paket, Kampanjer) that were never nested under
// /finance to begin with. Rather than duplicate or restructure that existing
// routing, one layout wraps all of it and switches which tab set it shows
// based on the current path — Bokföring's five accounting pages vs Ekonomi's
// everyday commercial pages. No route paths changed, so every existing deep
// link keeps working.

const BOKFORING_PREFIXES = ['/finance/ledger', '/finance/vat', '/finance/reconciliation', '/finance/close', '/finance/sie4'];

const EKONOMI_TABS: WorkspaceTab[] = [
  { label: 'Ekonomiöversikt', path: '/finance',          permission: 'finance:invoice:read'   as Permission, exact: true },
  { label: 'Ordrar',          path: '/orders',            permission: 'orders:order:read'      as Permission },
  { label: 'Paket',           path: '/packages',          permission: 'finance:package:read'   as Permission },
  { label: 'Kampanjer',       path: '/campaigns',         permission: 'finance:campaign:read'  as Permission },
  { label: 'Fakturor',        path: '/finance/invoices',  permission: 'finance:invoice:read'   as Permission },
  { label: 'Betalningar',     path: '/finance/payments',  permission: 'finance:payment:read'   as Permission },
  { label: 'Kassa',           path: '/finance/cash',      permission: 'finance:payment:create' as Permission },
];

const BOKFORING_TABS: WorkspaceTab[] = [
  { label: 'Journalboken',     path: '/finance/ledger',         permission: 'finance:ledger:read'         as Permission },
  { label: 'Momsperioder',     path: '/finance/vat',            permission: 'finance:vat:read'            as Permission },
  { label: 'Bankavstämning',   path: '/finance/reconciliation', permission: 'finance:reconciliation:read' as Permission },
  { label: 'Periodstängning',  path: '/finance/close',          permission: 'finance:close:read'          as Permission },
  { label: 'SIE4-exportfiler', path: '/finance/sie4',           permission: 'finance:sie_export:read'     as Permission },
];

export function EkonomiWorkspaceLayout() {
  const location = useLocation();
  const isBokforing = BOKFORING_PREFIXES.some(
    (p) => location.pathname === p || location.pathname.startsWith(`${p}/`),
  );

  return isBokforing
    ? <WorkspaceTabsLayout tabs={BOKFORING_TABS} title="Bokföring" titleIcon={BookOpen} />
    : <WorkspaceTabsLayout tabs={EKONOMI_TABS} title="Ekonomi" titleIcon={PieChart} />;
}
