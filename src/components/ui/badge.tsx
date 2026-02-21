import * as React from "react"
import { cn } from "@/lib/utils"

export interface BadgeProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: 'default' | 'success' | 'warning' | 'error' | 'outline'
  size?: 'sm' | 'md' | 'lg'
}

function Badge({ className, variant = 'default', size = 'sm', ...props }: BadgeProps) {
  return (
    <div
      className={cn(
        "inline-flex items-center rounded-full font-medium transition-colors",
        
        // Variants
        variant === 'default' && "bg-secondary text-secondary-foreground",
        variant === 'success' && "bg-success/10 text-success border border-success/20",
        variant === 'warning' && "bg-warning/10 text-warning border border-warning/20",
        variant === 'error' && "bg-error/10 text-error border border-error/20",
        variant === 'outline' && "border border-border text-foreground bg-transparent",
        
        // Sizes
        size === 'sm' && "text-xs px-2 py-0.5",
        size === 'md' && "text-xs px-2.5 py-1",
        size === 'lg' && "text-sm px-3 py-1",
        
        className
      )}
      {...props}
    />
  )
}

export { Badge }
