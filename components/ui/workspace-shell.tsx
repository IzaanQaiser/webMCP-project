import type { ComponentProps, ReactNode } from "react"

import { cn } from "@/lib/utils"

function WorkspaceShell({
  className,
  ...props
}: ComponentProps<"div">) {
  return (
    <div
      className={cn("min-h-svh bg-muted/30 text-foreground", className)}
      {...props}
    />
  )
}

function WorkspaceHeader({
  className,
  ...props
}: ComponentProps<"header">) {
  return (
    <header
      className={cn("border-b bg-background", className)}
      {...props}
    />
  )
}

function WorkspaceContainer({
  className,
  ...props
}: ComponentProps<"div">) {
  return (
    <div
      className={cn("mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8", className)}
      {...props}
    />
  )
}

function WorkspaceMain({
  className,
  children,
  ...props
}: ComponentProps<"main"> & { children: ReactNode }) {
  return (
    <main className={cn("py-8 sm:py-10", className)} {...props}>
      {children}
    </main>
  )
}

export {
  WorkspaceContainer,
  WorkspaceHeader,
  WorkspaceMain,
  WorkspaceShell,
}
