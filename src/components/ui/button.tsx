import * as React from 'react'
import { Slot } from '@radix-ui/react-slot'
import { cn } from '@/lib/utils'

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'default' | 'secondary' | 'ghost' | 'outline' | 'destructive'
  size?: 'sm' | 'md' | 'lg' | 'icon'
  asChild?: boolean
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = 'default', size = 'md', asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : 'button'
    return (
      <Comp
        className={cn(
          // Base styles
          "inline-flex items-center justify-center gap-2 rounded-lg font-medium whitespace-nowrap",
          "transition-all duration-200",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2",
          "disabled:opacity-50 disabled:cursor-not-allowed disabled:pointer-events-none",
          
          // Variants
          variant === 'default' && [
            "bg-primary text-primary-foreground",
            "hover:bg-primary-hover hover:shadow-lg hover:scale-105",
            "active:scale-95",
          ],
          variant === 'secondary' && [
            "bg-secondary text-secondary-foreground border border-border",
            "hover:bg-background-hover hover:shadow",
            "active:scale-95",
          ],
          variant === 'ghost' && [
            "bg-transparent text-foreground",
            "hover:bg-background-hover",
            "active:scale-95",
          ],
          variant === 'outline' && [
            "border border-border bg-transparent text-foreground",
            "hover:bg-background-hover hover:border-foreground",
            "active:scale-95",
          ],
          variant === 'destructive' && [
            "bg-error text-white",
            "hover:opacity-90 hover:shadow-lg hover:scale-105",
            "active:scale-95",
          ],
          
          // Sizes
          size === 'sm' && "h-8 px-3 text-xs",
          size === 'md' && "h-10 px-4 text-sm",
          size === 'lg' && "h-12 px-6 text-base",
          size === 'icon' && "h-10 w-10",
          
          className
        )}
        ref={ref}
        {...props}
      />
    )
  }
)

Button.displayName = "Button"

export { Button }
