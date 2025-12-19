import { Toast } from "@base-ui/react/toast";
import { cloneElement, useMemo } from "react";

export type Notifier = {
  info: (message: string) => void;
  success: (message: string) => void;
  error: (message: string) => void;
};

export type ToastManager = ReturnType<typeof Toast.createToastManager>;
export type ToastPortalContainer = React.ComponentProps<
  typeof Toast.Portal
>["container"];

export function createNotifications(): {
  toastManager: ToastManager;
  notify: Notifier;
} {
  const toastManager = Toast.createToastManager();

  const notify: Notifier = {
    info: (message) => {
      toastManager.add({
        title: message,
        type: "info",
        timeout: 2500,
        priority: "low",
      });
    },
    success: (message) => {
      toastManager.add({
        title: message,
        type: "success",
        timeout: 2200,
        priority: "low",
      });
    },
    error: (message) => {
      toastManager.add({
        title: message,
        type: "error",
        timeout: 3500,
        priority: "high",
      });
    },
  };

  return { toastManager, notify };
}

export type ToastHostProps = {
  toastManager: ToastManager;
  portalContainer?: ToastPortalContainer;
  placement?: "screen" | "surface";
};

export function ToastHost(props: ToastHostProps): React.JSX.Element {
  const placement = props.placement ?? "screen";
  return (
    <Toast.Provider toastManager={props.toastManager}>
      <Toast.Portal container={props.portalContainer}>
        <Toast.Viewport
          className="mbu-toast-viewport"
          data-placement={placement}
        >
          <ToastList />
        </Toast.Viewport>
      </Toast.Portal>
    </Toast.Provider>
  );
}

function ToastList(): React.JSX.Element {
  const { toasts } = Toast.useToastManager();

  const rendered = useMemo(
    () =>
      toasts.map((toast) => {
        const content = (
          <Toast.Root className="mbu-toast-root" toast={toast}>
            <Toast.Content className="mbu-toast-content">
              <div>
                {toast.title ? (
                  <Toast.Title className="mbu-toast-title">
                    {toast.title}
                  </Toast.Title>
                ) : null}
                {toast.description ? (
                  <Toast.Description className="mbu-toast-description">
                    {toast.description}
                  </Toast.Description>
                ) : null}
              </div>
              <Toast.Close aria-label="閉じる" className="mbu-toast-close">
                ×
              </Toast.Close>
            </Toast.Content>
          </Toast.Root>
        );

        if (toast.positionerProps?.anchor) {
          return (
            <Toast.Positioner
              {...toast.positionerProps}
              className="mbu-toast-positioner"
              key={toast.id}
              toast={toast}
            >
              {content}
            </Toast.Positioner>
          );
        }

        return cloneElement(content, { key: toast.id });
      }),
    [toasts]
  );

  return <>{rendered}</>;
}
