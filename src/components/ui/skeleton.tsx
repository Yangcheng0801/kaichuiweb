import * as React from "react"
import { cn } from "@/lib/utils"

function Skeleton({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "animate-shimmer bg-gradient-to-r from-background-card via-background-elevated to-background-card bg-[length:200%_100%] rounded",
        className
      )}
      {...props}
    />
  )
}

export { Skeleton }
