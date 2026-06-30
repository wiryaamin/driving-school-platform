// ─── Utilities ────────────────────────────────────────────────────────────────
export { cn } from './lib/utils.js';
export { type LucideIcon } from 'lucide-react';

// ─── Base UI Components ───────────────────────────────────────────────────────
export { Button, buttonVariants, type ButtonProps } from './components/ui/button.js';
export { Input, type InputProps } from './components/ui/input.js';
export { Textarea, type TextareaProps } from './components/ui/textarea.js';
export { Label } from './components/ui/label.js';
export {
  Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter,
} from './components/ui/card.js';
export {
  Table, TableHeader, TableBody, TableFooter, TableHead,
  TableRow, TableCell, TableCaption,
} from './components/ui/table.js';
export {
  Dialog, DialogPortal, DialogOverlay, DialogClose, DialogTrigger,
  DialogContent, DialogHeader, DialogFooter, DialogTitle, DialogDescription,
} from './components/ui/dialog.js';
export {
  Select, SelectGroup, SelectValue, SelectTrigger, SelectContent,
  SelectLabel, SelectItem, SelectSeparator,
  SelectScrollUpButton, SelectScrollDownButton,
} from './components/ui/select.js';
export {
  Form, FormItem, FormLabel, FormControl, FormDescription,
  FormMessage, FormField, useFormField,
} from './components/ui/form.js';

// ─── P1 Components ────────────────────────────────────────────────────────────
export { Badge, badgeVariants, type BadgeProps } from './components/ui/badge.js';
export { Tabs, TabsList, TabsTrigger, TabsContent } from './components/ui/tabs.js';
export { Avatar, AvatarImage, AvatarFallback } from './components/ui/avatar.js';
export {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuCheckboxItem, DropdownMenuRadioItem, DropdownMenuLabel,
  DropdownMenuSeparator, DropdownMenuShortcut, DropdownMenuGroup,
  DropdownMenuPortal, DropdownMenuSub, DropdownMenuSubContent,
  DropdownMenuSubTrigger, DropdownMenuRadioGroup,
} from './components/ui/dropdown-menu.js';
export {
  Sheet, SheetPortal, SheetOverlay, SheetTrigger, SheetClose, SheetContent,
  SheetHeader, SheetFooter, SheetTitle, SheetDescription,
} from './components/ui/sheet.js';
export { Skeleton } from './components/ui/skeleton.js';
export { Switch, type SwitchProps } from './components/ui/switch.js';
export { Separator } from './components/ui/separator.js';
export { ScrollArea, ScrollBar } from './components/ui/scroll-area.js';
export {
  ToastProvider, ToastViewport, Toast, ToastTitle,
  ToastDescription, ToastClose, ToastAction,
  type ToastProps, type ToastActionElement,
} from './components/ui/toast.js';
export { Toaster } from './components/ui/toaster.js';
export { useToast, toast } from './components/ui/use-toast.js';

// ─── DataTable ────────────────────────────────────────────────────────────────
export { DataTable, DataTablePagination, DataTableColumnHeader } from './components/data-table/index.js';
export type { ColumnDef } from './components/data-table/index.js';

// ─── Layout Primitives ────────────────────────────────────────────────────────
export { EmptyState } from './components/layout/empty-state.js';
export { LoadingState, TableSkeleton, CardSkeleton } from './components/layout/loading-state.js';
export { PageHeader } from './components/layout/page-header.js';
export { PageSection } from './components/layout/page-section.js';
export { PageActions } from './components/layout/page-actions.js';
export { PageFilters } from './components/layout/page-filters.js';
