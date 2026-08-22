import * as React from 'react';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import { cn } from '../../lib/utils.js';

const Dialog = DialogPrimitive.Root;
const DialogTrigger = DialogPrimitive.Trigger;
const DialogPortal = DialogPrimitive.Portal;
const DialogClose = DialogPrimitive.Close;

const DialogOverlay = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Overlay>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Overlay>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Overlay
    ref={ref}
    className={cn(
      'fixed inset-0 z-50 bg-black/80 data-[state=open]:animate-in data-[state=closed]:animate-out',
      'data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0',
      className
    )}
    {...props}
  />
));
DialogOverlay.displayName = DialogPrimitive.Overlay.displayName;

const DialogContent = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content>
>(({ className, children, onPointerDownOutside, onInteractOutside, onEscapeKeyDown, ...props }, ref) => (
  <DialogPortal>
    <DialogOverlay />
    <DialogPrimitive.Content
      ref={ref}
      className={cn(
        'fixed left-[50%] top-[50%] z-50 grid w-full max-w-lg translate-x-[-50%] translate-y-[-50%] gap-4',
        'border bg-background p-6 shadow-lg duration-200',
        // Global responsive guarantee (not just a per-form convention): every
        // dialog is capped to the visible viewport and scrolls internally
        // rather than letting fields/actions run off-screen. dvh (not vh)
        // so mobile browsers with a dynamic address bar are measured against
        // the actually-visible area, not the full document viewport.
        // Individual forms with a header/body/footer split additionally use
        // `flex flex-col` + DialogBody (flex-1 min-h-0 overflow-y-auto) so
        // the header and footer stay pinned while only the body scrolls —
        // see DialogBody below. This base rule is the fallback for simpler
        // dialogs that render header/body/footer as flat children: the
        // whole box scrolls together, which still guarantees nothing is
        // ever clipped or unreachable.
        'max-h-[90dvh] overflow-y-auto',
        'data-[state=open]:animate-in data-[state=closed]:animate-out',
        'data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0',
        'data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95',
        'data-[state=closed]:slide-out-to-left-1/2 data-[state=closed]:slide-out-to-top-[48%]',
        'data-[state=open]:slide-in-from-left-1/2 data-[state=open]:slide-in-from-top-[48%]',
        'sm:rounded-lg',
        className
      )}
      // Platform-wide modal standard: a dialog only closes via its own X,
      // a Cancel button, or a successful submit/delete — never by an
      // incidental click on the page behind it or an accidental Escape
      // press, both of which have silently discarded in-progress form data.
      // Individual instances may still override by passing their own handler.
      onPointerDownOutside={onPointerDownOutside ?? ((e) => e.preventDefault())}
      onInteractOutside={onInteractOutside ?? ((e) => e.preventDefault())}
      onEscapeKeyDown={onEscapeKeyDown ?? ((e) => e.preventDefault())}
      {...props}
    >
      {children}
      <DialogPrimitive.Close className="absolute right-4 top-4 rounded-sm opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:pointer-events-none data-[state=open]:bg-accent data-[state=open]:text-muted-foreground">
        <X className="h-4 w-4" />
        <span className="sr-only">Stäng</span>
      </DialogPrimitive.Close>
    </DialogPrimitive.Content>
  </DialogPortal>
));
DialogContent.displayName = DialogPrimitive.Content.displayName;

const DialogHeader = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div className={cn('flex flex-col space-y-1.5 text-center sm:text-left', className)} {...props} />
);
DialogHeader.displayName = 'DialogHeader';

// ─── Scrollable body for the header/body/footer split ─────────────────────────
// The unified pattern for a dialog with more fields than fit the viewport:
//   <DialogContent className="max-h-[90dvh] flex flex-col p-0 gap-0 overflow-hidden">
//     <DialogHeader className="shrink-0 ..." />
//     <DialogBody>...fields...</DialogBody>
//     <DialogFooter className="shrink-0 ..." />
//   </DialogContent>
// DialogContent's flex-col layout gives the header and footer their natural
// size first; DialogBody (flex-1 min-h-0 overflow-y-auto) absorbs whatever
// space is left and scrolls internally, so the header/footer never get
// pushed off-screen. min-h-0 overrides flexbox's default content-based
// minimum size, which is what lets this element shrink below its content
// height instead of forcing the whole dialog taller than the viewport.
const DialogBody = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div className={cn('flex-1 min-h-0 overflow-y-auto', className)} {...props} />
);
DialogBody.displayName = 'DialogBody';

const DialogFooter = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div
    className={cn('flex flex-col-reverse sm:flex-row sm:justify-end sm:space-x-2', className)}
    {...props}
  />
);
DialogFooter.displayName = 'DialogFooter';

const DialogTitle = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Title>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Title>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Title
    ref={ref}
    className={cn('text-lg font-semibold leading-none tracking-tight', className)}
    {...props}
  />
));
DialogTitle.displayName = DialogPrimitive.Title.displayName;

const DialogDescription = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Description>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Description>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Description
    ref={ref}
    className={cn('text-sm text-muted-foreground', className)}
    {...props}
  />
));
DialogDescription.displayName = DialogPrimitive.Description.displayName;

export {
  Dialog, DialogPortal, DialogOverlay, DialogClose, DialogTrigger,
  DialogContent, DialogHeader, DialogBody, DialogFooter, DialogTitle, DialogDescription,
};
