import { useState, useCallback } from 'react';

export interface Toast {
  id: string;
  title?: string;
  description?: string;
  variant?: 'default' | 'destructive';
  duration?: number;
}

interface ToastState {
  toasts: Toast[];
}

const initialState: ToastState = {
  toasts: [],
};

let toastCount = 0;

function generateToastId() {
  return `toast-${++toastCount}`;
}

export function useToast() {
  const [state, setState] = useState<ToastState>(initialState);

  const addToast = useCallback(
    (toast: Omit<Toast, 'id'>) => {
      const id = generateToastId();
      const newToast: Toast = {
        id,
        duration: 5000,
        ...toast,
      };

      setState((prevState) => ({
        toasts: [...prevState.toasts, newToast],
      }));

      // Auto-remove toast after duration
      setTimeout(() => {
        setState((prevState) => ({
          toasts: prevState.toasts.filter((t) => t.id !== id),
        }));
      }, newToast.duration);

      return id;
    },
    []
  );

  const removeToast = useCallback((toastId: string) => {
    setState((prevState) => ({
      toasts: prevState.toasts.filter((t) => t.id !== toastId),
    }));
  }, []);

  const toast = useCallback(
    (props: Omit<Toast, 'id'>) => {
      return addToast(props);
    },
    [addToast]
  );

  return {
    toast,
    toasts: state.toasts,
    removeToast,
  };
}