import * as React from "react"
import { cn } from "../../lib/utils"

const Badge = React.forwardRef(({ className, variant = "default", ...props }, ref) => {
  const variants = {
    default: "glass-card border-border text-foreground dark:border-white/20 dark:text-white",
    secondary: "bg-secondary/80 border-border text-secondary-foreground dark:bg-white/10 dark:border-white/10 dark:text-white",
    outline: "border border-border bg-transparent text-foreground dark:border-white/30 dark:text-white",
    destructive: "bg-red-500/20 border-red-500/30 text-red-900 dark:text-red-200",
  }

  return (
    <div
      ref={ref}
      className={cn(
        "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-white/20 backdrop-blur-md",
        variants[variant],
        className
      )}
      {...props}
    />
  )
})

Badge.displayName = "Badge"

export { Badge }
