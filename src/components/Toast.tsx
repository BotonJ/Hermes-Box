import type { ToastMessage } from "../lib/use-toast";
import styles from "./Toast.module.css";

const typeStyles: Record<ToastMessage["type"], string> = {
  success: styles.success,
  error: styles.error,
};

interface ToastContainerProps {
  toasts: ToastMessage[];
  onDismiss: (id: string) => void;
}

export function ToastContainer({ toasts, onDismiss }: ToastContainerProps) {
  if (toasts.length === 0) return null;

  return (
    <div class={styles.container} role="status" aria-live="polite" data-testid="toast-container">
      {toasts.map((toast) => {
        const handleDismiss = () => onDismiss(toast.id);
        return (
          <div
            key={toast.id}
            class={`${styles.toast} ${typeStyles[toast.type]}`}
            role="alert"
            aria-label={`${toast.type}: ${toast.message}`}
            data-testid={`toast-${toast.type}`}
            onClick={handleDismiss}
          >
            {toast.message}
          </div>
        );
      })}
    </div>
  );
}
