"use client"

import { toast as sonnerToast } from "sonner"

export type ToastProps = {
  title?: string
  description?: string
  variant?: "default" | "destructive" | "success"
  [key: string]: any
}

export const useToast = () => {
  const toast = ({ title, description, variant = "default", ...props }: ToastProps) => {
    const toastProps = { 
      description,
      ...props 
    }
    
    if (variant === "destructive") {
      return sonnerToast.error(title || "", toastProps)
    } else if (variant === "success") {
      return sonnerToast.success(title || "", toastProps)
    } else {
      return sonnerToast(title || "", toastProps)
    }
  }

  return { toast }
}
