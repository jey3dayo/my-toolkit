import { useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { fn } from "storybook/test";

import {
  OverlayApp,
  type OverlayViewModel,
} from "@/content/overlay/OverlayApp";
import { ensureShadowUiBaseStyles } from "@/ui/styles";
import { applyTheme, isTheme, type Theme } from "@/ui/theme";

// URLパラメータ例:
// - Storybookの`args`はXSS対策で英数字/スペース/_/-のみが許可されます（日本語は無視されます）
//   `?path=/story/<story-id>&globals=theme:dark&args=primary:Hello%20world`
// - 日本語などを渡したい場合は`mbuPrimary`を使います（preview iframeにそのまま引き継がれます）
//   `?path=/story/<story-id>&globals=theme:dark&mbuPrimary=要約結果（storybook）`
const COMPONENTS_CSS_PATH = "src/styles/tokens/components.css";

export type OverlayStoryArgs = {
  status: OverlayViewModel["status"];
  mode: OverlayViewModel["mode"];
  source: OverlayViewModel["source"];
  title: string;
  primary: string;
  secondary: string;
  event?: OverlayViewModel["event"];
  calendarUrl?: string;
  ics?: string;
};

export function OverlayAppStory(args: OverlayStoryArgs): React.JSX.Element {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const [mount, setMount] = useState<{
    shadow: ShadowRoot;
    root: HTMLDivElement;
  } | null>(null);

  const urlPrimary = new URL(window.location.href).searchParams.get(
    "mbuPrimary"
  );
  const primary = urlPrimary ?? args.primary;

  const docTheme = document.documentElement.getAttribute("data-theme");
  const resolvedTheme: Theme = isTheme(docTheme) ? docTheme : "auto";

  useLayoutEffect(() => {
    const host = hostRef.current;
    if (!host) {
      return;
    }

    host.id = "browser-toolkit-overlay";
    host.style.position = "fixed";
    host.style.top = "16px";
    host.style.left = "16px";
    host.style.zIndex = "2147483647";

    const shadow = host.shadowRoot ?? host.attachShadow({ mode: "open" });
    ensureShadowUiBaseStyles(shadow);

    const root = shadow.getElementById("browser-toolkit-overlay-root");
    const rootEl = root
      ? (root as HTMLDivElement)
      : document.createElement("div");
    rootEl.id = "browser-toolkit-overlay-root";
    if (!root) {
      shadow.appendChild(rootEl);
    }

    setMount({ shadow, root: rootEl });

    return () => {
      setMount(null);
    };
  }, []);

  useLayoutEffect(() => {
    if (!mount) {
      return;
    }

    applyTheme(resolvedTheme, mount.shadow);
  }, [mount, resolvedTheme]);

  const host = hostRef.current;

  return (
    <>
      <div ref={hostRef} />
      {mount && host
        ? createPortal(
            <OverlayApp
              host={host}
              onDismiss={fn()}
              portalContainer={mount.shadow}
              viewModel={{
                open: true,
                status: args.status,
                mode: args.mode,
                source: args.source,
                title: args.title,
                primary,
                secondary: args.secondary,
                event: args.event,
                calendarUrl: args.calendarUrl,
                ics: args.ics,
                anchorRect: null,
              }}
            />,
            mount.root
          )
        : null}
    </>
  );
}

function ensureOverlayFallbackStyles(shadow: ShadowRoot): void {
  if (shadow.querySelector("#mbu-ui-base-styles")) {
    return;
  }
  const link = shadow.ownerDocument.createElement("link");
  link.id = "mbu-ui-base-styles";
  link.rel = "stylesheet";
  link.href = COMPONENTS_CSS_PATH;
  shadow.appendChild(link);
}

export function OverlayAppFallbackStory(
  args: OverlayStoryArgs
): React.JSX.Element {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const [mount, setMount] = useState<{
    shadow: ShadowRoot;
    root: HTMLDivElement;
  } | null>(null);
  const removedLinksRef = useRef<HTMLLinkElement[]>([]);

  const docTheme = document.documentElement.getAttribute("data-theme");
  const resolvedTheme: Theme = isTheme(docTheme) ? docTheme : "auto";

  useLayoutEffect(() => {
    const tokenLinks = Array.from(
      document.querySelectorAll<HTMLLinkElement>(
        "#mbu-ui-token-primitives, #mbu-ui-token-semantic, #mbu-ui-base-styles"
      )
    );
    removedLinksRef.current = tokenLinks;
    for (const link of tokenLinks) {
      link.remove();
    }

    const host = hostRef.current;
    if (!host) {
      return;
    }

    host.id = "browser-toolkit-overlay-fallback";
    host.style.position = "fixed";
    host.style.top = "16px";
    host.style.left = "16px";
    host.style.zIndex = "2147483647";

    const shadow = host.shadowRoot ?? host.attachShadow({ mode: "open" });
    ensureOverlayFallbackStyles(shadow);

    const root = shadow.getElementById("browser-toolkit-overlay-root");
    const rootEl = root
      ? (root as HTMLDivElement)
      : document.createElement("div");
    rootEl.id = "browser-toolkit-overlay-root";
    if (!root) {
      shadow.appendChild(rootEl);
    }

    setMount({ shadow, root: rootEl });

    return () => {
      for (const link of removedLinksRef.current) {
        document.head.appendChild(link);
      }
      removedLinksRef.current = [];
      setMount(null);
    };
  }, []);

  useLayoutEffect(() => {
    if (!mount) {
      return;
    }

    applyTheme(resolvedTheme, mount.shadow);
  }, [mount, resolvedTheme]);

  const host = hostRef.current;

  return (
    <>
      <div ref={hostRef} />
      {mount && host
        ? createPortal(
            <OverlayApp
              host={host}
              onDismiss={fn()}
              portalContainer={mount.shadow}
              viewModel={{
                open: true,
                status: args.status,
                mode: args.mode,
                source: args.source,
                title: args.title,
                primary: args.primary,
                secondary: args.secondary,
                event: args.event,
                calendarUrl: args.calendarUrl,
                ics: args.ics,
                anchorRect: null,
              }}
            />,
            mount.root
          )
        : null}
    </>
  );
}
