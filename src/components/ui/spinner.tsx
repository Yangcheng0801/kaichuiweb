import * as React from "react"
import { cn } from "@/lib/utils"

interface SpinnerProps {
  size?: 'sm' | 'md' | 'lg'
  className?: string
}

export function Spinner({ size = 'md', className }: SpinnerProps) {
  return (
    <div
      className={cn(
        "border-2 border-primary/20 border-t-primary rounded-full animate-spin",
        size === 'sm' && "w-4 h-4",
        size === 'md' && "w-8 h-8",
        size === 'lg' && "w-12 h-12",
        className
      )}
    />
  )
}

export function LoadingState({ message = "加载中..." }: { message?: string }) {
  return (
    <div className="flex flex-col items-center justify-center p-12 text-center">
      <Spinner size="lg" className="mb-4" />
      <p className="text-sm text-foreground-muted">{message}</p>
    </div>
  )
}
