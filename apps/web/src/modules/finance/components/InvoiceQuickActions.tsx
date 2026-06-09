import { useNavigate } from 'react-router-dom';
import { MoreHorizontal, Eye, Ban } from 'lucide-react';
import {
  Button,
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from '@platform/ui';
import { PermissionGate } from '@core/rbac/PermissionGate.js';
import { Permissions } from '@core/rbac/permissions.js';
import type { Invoice } from '../hooks/useFinance.js';

interface Props {
  invoice:    Invoice;
  onVoid?:    (invoice: Invoice) => void;
}

export function InvoiceQuickActions({ invoice, onVoid }: Props) {
  const navigate = useNavigate();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="h-8 w-8">
          <MoreHorizontal className="w-4 h-4" />
          <span className="sr-only">Åtgärder</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48">
        <DropdownMenuLabel>Åtgärder</DropdownMenuLabel>
        <DropdownMenuSeparator />

        <DropdownMenuItem onClick={() => navigate(`/finance/invoices/${invoice.id}`)}>
          <Eye className="w-4 h-4 mr-2" />
          Visa faktura
        </DropdownMenuItem>

        {invoice.status !== 'void' && invoice.status !== 'paid' && onVoid && (
          <PermissionGate permission={Permissions.FINANCE_INVOICE_VOID}>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              className="text-destructive focus:text-destructive"
              onClick={() => onVoid(invoice)}
            >
              <Ban className="w-4 h-4 mr-2" />
              Makulera faktura
            </DropdownMenuItem>
          </PermissionGate>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
