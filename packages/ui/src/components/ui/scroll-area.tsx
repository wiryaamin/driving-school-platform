import * as React from 'react';
import * as ScrollAreaPrimitive from '@radix-ui/react-scroll-area';
import { cn } from '../../lib/utils.js';

const ScrollArea = React.forwardRef<
  React.ElementRef<typeof ScrollAreaPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof ScrollAreaPrimitive.Root>
>(({ className, children, ...props }, ref) => (
  <ScrollAreaPrimitive.Root
    ref={ref}
    // Root is typically used as `<ScrollArea className="flex-1">` inside a
    // `flex flex-col` dialog/sheet whose own height comes from `max-h-[X]`,
    // not an explicit `height` — e.g. header/ScrollArea/footer siblings in
    // a modal capped to the viewport. Root itself does receive a correct,
    // definite pixel height from that flex distribution. The Viewport
    // below it, however, used to be sized with `h-full` (height: 100%) —
    // and a percentage-height child of a flex item whose size came from
    // flex distribution (rather than a literal `height` CSS property) does
    // not reliably resolve in Chromium: it silently renders at its full
    // content height instead, so it never actually overflows and mouse-
    // wheel scrolling does nothing, even though Root's own box is capped
    // correctly. Verified with a real headless-browser reproduction of
    // this exact modal shape before landing this fix.
    //
    // Fix: make Root itself a flex column and give Viewport `flex-1
    // min-h-0` instead of a percentage height, so it's sized by the same
    // (working) flex-distribution mechanism as Root, not by a percentage
    // resolving against a flex-derived ancestor size.
    className={cn('relative overflow-hidden flex flex-col', className)}
    {...props}
  >
    <ScrollAreaPrimitive.Viewport className="flex-1 min-h-0 w-full rounded-[inherit]">
      {children}
    </ScrollAreaPrimitive.Viewport>
    <ScrollBar />
    <ScrollAreaPrimitive.Corner />
  </ScrollAreaPrimitive.Root>
));
ScrollArea.displayName = ScrollAreaPrimitive.Root.displayName;

const ScrollBar = React.forwardRef<
  React.ElementRef<typeof ScrollAreaPrimitive.ScrollAreaScrollbar>,
  React.ComponentPropsWithoutRef<typeof ScrollAreaPrimitive.ScrollAreaScrollbar>
>(({ className, orientation = 'vertical', ...props }, ref) => (
  <ScrollAreaPrimitive.ScrollAreaScrollbar
    ref={ref}
    orientation={orientation}
    className={cn(
      'flex touch-none select-none transition-colors',
      orientation === 'vertical' && 'h-full w-3 border-l border-l-transparent p-[2px]',
      orientation === 'horizontal' && 'h-3 flex-col border-t border-t-transparent p-[2px]',
      className
    )}
    {...props}
  >
    <ScrollAreaPrimitive.ScrollAreaThumb className="relative flex-1 rounded-full bg-muted-foreground/40 hover:bg-muted-foreground/60 transition-colors" />
  </ScrollAreaPrimitive.ScrollAreaScrollbar>
));
ScrollBar.displayName = ScrollAreaPrimitive.ScrollAreaScrollbar.displayName;

export { ScrollArea, ScrollBar };
