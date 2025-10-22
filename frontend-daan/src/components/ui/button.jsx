import * as React from "react"
import { cn } from "../../lib/utils"

const Button = React.forwardRef(({ className, variant = "default", size = "default", ...props }, ref) => {
  const variants = {
    default: "bg-black text-white hover:bg-gray-800 dark:bg-white dark:text-black dark:hover:bg-gray-200",
    primary: "bg-primary text-primary-foreground hover:bg-primary/90 shadow-sm",
    secondary: "bg-secondary text-secondary-foreground hover:bg-secondary/80",
    success: "bg-emerald-500 text-white hover:bg-emerald-600",
    destructive: "bg-red-500 text-white hover:bg-red-600",
    outline: "border border-border bg-transparent hover:bg-accent text-foreground",
    ghost: "bg-transparent hover:bg-accent hover:text-accent-foreground text-foreground",
    link: "bg-transparent underline-offset-4 hover:underline text-primary",
  }

  const sizes = {
    default: "h-10 px-4 py-2",
    sm: "h-9 px-3",
    lg: "h-11 px-5",
    icon: "h-10 w-10",
  }

  const { asChild, children, ...rest } = props

  if (asChild && React.isValidElement(children)) {
    return React.cloneElement(children, {
      ...rest,
      ref,
      className: cn(
        "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 dark:focus-visible:ring-white/20",
        variants[variant],
        sizes[size],
        children.props?.className,
        className
      ),
    })
  }

  return (
    <button
      ref={ref}
      className={cn(
        "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 dark:focus-visible:ring-white/20",
        variants[variant],
        sizes[size],
        className
      )}
      {...rest}
    >
      {children}
    </button>
  )
})

Button.displayName = "Button"

export { Button }
