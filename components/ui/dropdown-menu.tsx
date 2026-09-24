"use client"

import * as React from "react"
import { DropdownMenu as DropdownMenuPrimitive } from "radix-ui"

import { CheckIcon } from "lucide-react"

import { cn } from "@/lib/utils"

function DropdownMenu({
  ...props
}: React.ComponentProps<typeof DropdownMenuPrimitive.Root>) {
  return <DropdownMenuPrimitive.Root data-slot="dropdown-menu" {...props} />
}

function DropdownMenuTrigger({
  ...props
}: React.ComponentProps<typeof DropdownMenuPrimitive.Trigger>) {
  return <DropdownMenuPrimitive.Trigger data-slot="dropdown-menu-trigger" {...props} />
}

function DropdownMenuContent({
  className,
  sideOffset = 4,
  align = "end",
  ...props
}: React.ComponentProps<typeof DropdownMenuPrimitive.Content>) {
  return (
    <DropdownMenuPrimitive.Portal>
      <DropdownMenuPrimitive.Content
        data-slot="dropdown-menu-content"
        sideOffset={sideOffset}
        align={align}
        className={cn(
          "z-50 max-h-(--radix-dropdown-menu-content-available-height) min-w-44 origin-(--radix-dropdown-menu-content-transform-origin) overflow-y-auto rounded-lg bg-popover p-1 text-sm text-popover-foreground ring-1 ring-foreground/10 shadow-md duration-100 data-[side=bottom]:slide-in-from-top-2 data-[side=top]:slide-in-from-bottom-2 data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95",
          className
        )}
        {...props}
      />
    </DropdownMenuPrimitive.Portal>
  )
}

function DropdownMenuItem({
  className,
  variant = "default",
  ...props
}: React.ComponentProps<typeof DropdownMenuPrimitive.Item> & {
  variant?: "default" | "destructive"
}) {
  return (
    <DropdownMenuPrimitive.Item
      data-slot="dropdown-menu-item"
      data-variant={variant}
      className={cn(
        "flex min-h-11 cursor-default items-center gap-2.5 rounded-md px-2 text-sm text-ink outline-none select-none focus:bg-surface data-[disabled]:pointer-events-none data-[disabled]:opacity-50 data-[variant=destructive]:text-overdue md:min-h-9 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 [&_svg]:text-ink-soft data-[variant=destructive]:[&_svg]:text-overdue",
        className
      )}
      {...props}
    />
  )
}

/** A menu row with a checkbox; the menu stays open when it is ticked. */
function DropdownMenuCheckboxItem({
  className,
  children,
  onSelect,
  ...props
}: React.ComponentProps<typeof DropdownMenuPrimitive.CheckboxItem>) {
  return (
    <DropdownMenuPrimitive.CheckboxItem
      data-slot="dropdown-menu-checkbox-item"
      onSelect={(event) => {
        event.preventDefault()
        onSelect?.(event)
      }}
      className={cn(
        "group flex min-h-11 cursor-default items-center gap-2.5 rounded-md px-2 text-sm text-ink outline-none select-none focus:bg-surface data-[disabled]:pointer-events-none data-[disabled]:opacity-50 md:min-h-9",
        className
      )}
      {...props}
    >
      <span
        aria-hidden
        className="flex size-4 shrink-0 items-center justify-center rounded-[4px] border-[1.5px] border-ink-soft/70 bg-panel text-panel group-data-[state=checked]:border-brand group-data-[state=checked]:bg-brand"
      >
        <DropdownMenuPrimitive.ItemIndicator>
          <CheckIcon className="size-3" strokeWidth={3} />
        </DropdownMenuPrimitive.ItemIndicator>
      </span>
      {children}
    </DropdownMenuPrimitive.CheckboxItem>
  )
}

function DropdownMenuSeparator({
  className,
  ...props
}: React.ComponentProps<typeof DropdownMenuPrimitive.Separator>) {
  return (
    <DropdownMenuPrimitive.Separator
      data-slot="dropdown-menu-separator"
      className={cn("-mx-1 my-1 h-px bg-hairline", className)}
      {...props}
    />
  )
}

export {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
}
