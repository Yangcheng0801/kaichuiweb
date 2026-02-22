import * as React from 'react'
import { X } from 'lucide-react'
import { cn } from '@/lib/utils'

interface DrawerProps {
  open: boolean
  onClose: () => void
  children: React.ReactNode
  side?: 'left' | 'right'
  className?: string
}

export function Drawer({ open, onClose, children, side = 'left', className }: DrawerProps) {
  if (!open) return null

  return (
    <>
      {/* 遮罩层 */}
      <div
        className="fixed inset-0 z-30 bg-black/40 lg:hidden"
        onClick={onClose}
      />

      {/* 抽屉内容 */}
      <aside
        className={cn(
          'fixed top-0 z-40 h-full w-[260px] max-w-[85vw] bg-card rounded-2xl shadow-[0_20px_60px_rgba(15,23,42,0.08)] flex flex-col lg:hidden',
          side === 'left' ? 'left-0 rounded-l-none animate-slide-in-left' : 'right-0 rounded-r-none animate-slide-in-right',
          className
        )}
      >
        {children}
      </aside>
    </>
  )
}

interface DrawerHeaderProps {
  children: React.ReactNode
  onClose?: () => void
  className?: string
}

export function DrawerHeader({ children, onClose, className }: DrawerHeaderProps) {
  return (
    <div className={cn('h-[70px] flex items-center justify-between border-b border-border px-5', className)}>
      {children}
      {onClose && (
        <button
          className="p-2 rounded-full hover:bg-secondary text-muted-foreground"
          onClick={onClose}
        >
          <X size={20} />
        </button>
      )}
    </div>
  )
}

interface DrawerContentProps {
  children: React.ReactNode
  className?: string
}

export function DrawerContent({ children, className }: DrawerContentProps) {
  return (
    <div className={cn('flex-1 overflow-auto', className)}>
      {children}
    </div>
  )
}
