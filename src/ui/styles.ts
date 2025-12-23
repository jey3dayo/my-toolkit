import componentsCss from "@/styles/tokens/components.css?raw";
import primitivesCss from "@/styles/tokens/primitives.css?raw";
import semanticCss from "@/styles/tokens/semantic.css?raw";

const TOKEN_PRIMITIVES_ID = "mbu-ui-token-primitives";
const TOKEN_SEMANTIC_ID = "mbu-ui-token-semantic";
const STYLE_ID = "mbu-ui-base-styles";

const TOKEN_PRIMITIVES_PATH = "tokens/primitives.css";
const TOKEN_SEMANTIC_PATH = "tokens/semantic.css";
const TOKEN_COMPONENTS_PATH = "tokens/components.css";
const POPUP_BASE_ID = "mbu-style-base";
const POPUP_LAYOUT_ID = "mbu-style-layout";
const POPUP_UTILITIES_ID = "mbu-style-utilities";

const POPUP_BASE_PATH = "base.css";
const POPUP_LAYOUT_PATH = "layout.css";
const POPUP_UTILITIES_PATH = "utilities.css";
const POPUP_STYLE_ROOT_DEV = "src/styles";
const POPUP_STYLE_ROOT_DIST = "dist/styles";

function resolveStyleHref(path: string): string {
  try {
    const runtime = (
      chrome as unknown as { runtime?: { getURL?: (input: string) => string } }
    ).runtime;
    if (runtime?.getURL) {
      return runtime.getURL(path);
    }
  } catch {
    // non-extension contexts (tests/storybook)
  }
  return path;
}

function getPopupStyleRoot(doc: Document): string {
  try {
    if (doc.location?.protocol === "chrome-extension:") {
      return POPUP_STYLE_ROOT_DIST;
    }
  } catch {
    // ignore non-browser contexts
  }
  return POPUP_STYLE_ROOT_DEV;
}

function resolvePopupStylePath(doc: Document, relativePath: string): string {
  return `${getPopupStyleRoot(doc)}/${relativePath}`;
}

type ConstructableSheets = {
  primitives: CSSStyleSheet;
  semantic: CSSStyleSheet;
  components: CSSStyleSheet;
};

function createConstructableSheets(): ConstructableSheets | null {
  if (typeof CSSStyleSheet === "undefined") {
    return null;
  }
  if (!("replaceSync" in CSSStyleSheet.prototype)) {
    return null;
  }
  try {
    const primitives = new CSSStyleSheet();
    primitives.replaceSync(primitivesCss);
    const semantic = new CSSStyleSheet();
    semantic.replaceSync(semanticCss);
    const components = new CSSStyleSheet();
    components.replaceSync(componentsCss);
    return { primitives, semantic, components };
  } catch {
    return null;
  }
}

const shadowConstructedSheets = createConstructableSheets();

function ensureDocumentStylesheet(
  doc: Document,
  id: string,
  path: string
): void {
  const href = resolveStyleHref(path);
  const existing = doc.getElementById(id);
  if (existing) {
    if (
      existing instanceof HTMLLinkElement &&
      existing.getAttribute("href") !== href
    ) {
      existing.setAttribute("href", href);
    }
    return;
  }
  const link = doc.createElement("link");
  link.id = id;
  link.rel = "stylesheet";
  link.href = href;
  (doc.head ?? doc.documentElement).appendChild(link);
}

function ensureShadowStyleText(
  shadowRoot: ShadowRoot,
  id: string,
  cssText: string
): void {
  if (shadowRoot.querySelector(`#${id}`)) {
    return;
  }
  const style = shadowRoot.ownerDocument.createElement("style");
  style.id = id;
  style.textContent = cssText;
  shadowRoot.appendChild(style);
}

const FALLBACK_MBU_TOKENS: Record<string, string> = {
  "--mbu-bg": "var(--color-bg, #0f1724)",
  "--mbu-surface": "var(--color-surface, #1b2334)",
  "--mbu-surface-2": "var(--color-surface-2, #232d42)",
  "--mbu-border": "var(--color-border-ui, rgba(255, 255, 255, 0.12))",
  "--mbu-text": "var(--color-text, #f6f7fb)",
  "--mbu-text-muted": "var(--color-text-muted, #c8d0e5)",
  "--mbu-accent": "var(--color-primary, #3ecf8e)",
  "--mbu-danger": "var(--color-danger, #e57373)",
  "--mbu-radius": "var(--radius-lg, 14px)",
  "--mbu-shadow": "var(--shadow-elevation, 0 12px 40px rgba(0, 0, 0, 0.35))",
  "--mbu-focus-ring": "var(--focus-ring, 2px solid rgba(123, 220, 247, 0.55))",
  "--mbu-focus-ring-offset": "var(--focus-ring-offset, 2px)",
  "--mbu-toast-screen-inset": "var(--toast-screen-inset, 12px 12px auto auto)",
  "--mbu-toast-surface-inset":
    "var(--toast-surface-inset, 12px 12px auto auto)",
};

function ensureShadowFallbackTokens(shadowRoot: ShadowRoot): void {
  const host = shadowRoot.host;
  if (!(host instanceof HTMLElement)) {
    return;
  }
  const computed =
    shadowRoot.ownerDocument.defaultView?.getComputedStyle?.(host) ?? null;
  if (!computed) {
    return;
  }
  const surface = computed.getPropertyValue("--mbu-surface").trim();
  if (surface) {
    return;
  }
  for (const [name, value] of Object.entries(FALLBACK_MBU_TOKENS)) {
    if (!host.style.getPropertyValue(name)) {
      host.style.setProperty(name, value);
    }
  }
}
export function ensurePopupUiBaseStyles(doc: Document): void {
  ensureDocumentStylesheet(
    doc,
    TOKEN_PRIMITIVES_ID,
    resolvePopupStylePath(doc, TOKEN_PRIMITIVES_PATH)
  );
  ensureDocumentStylesheet(
    doc,
    TOKEN_SEMANTIC_ID,
    resolvePopupStylePath(doc, TOKEN_SEMANTIC_PATH)
  );
  ensureDocumentStylesheet(
    doc,
    POPUP_BASE_ID,
    resolvePopupStylePath(doc, POPUP_BASE_PATH)
  );
  ensureDocumentStylesheet(
    doc,
    POPUP_LAYOUT_ID,
    resolvePopupStylePath(doc, POPUP_LAYOUT_PATH)
  );
  ensureDocumentStylesheet(
    doc,
    POPUP_UTILITIES_ID,
    resolvePopupStylePath(doc, POPUP_UTILITIES_PATH)
  );
  ensureDocumentStylesheet(
    doc,
    STYLE_ID,
    resolvePopupStylePath(doc, TOKEN_COMPONENTS_PATH)
  );
}

export function ensureShadowUiBaseStyles(shadowRoot: ShadowRoot): void {
  const hasShadowTokens = (): boolean => {
    if (typeof getComputedStyle !== "function") {
      return true;
    }
    const host = shadowRoot.host;
    if (host instanceof HTMLElement && host.isConnected) {
      const value = getComputedStyle(host)
        .getPropertyValue("--mbu-surface")
        .trim();
      return value.length > 0;
    }
    return true;
  };
  if (
    shadowConstructedSheets &&
    "adoptedStyleSheets" in shadowRoot &&
    Array.isArray(shadowRoot.adoptedStyleSheets)
  ) {
    const existing = shadowRoot.adoptedStyleSheets;
    const next = [...existing];
    let changed = false;
    for (const sheet of [
      shadowConstructedSheets.primitives,
      shadowConstructedSheets.semantic,
      shadowConstructedSheets.components,
    ]) {
      if (!existing.includes(sheet)) {
        next.push(sheet);
        changed = true;
      }
    }
    if (changed) {
      shadowRoot.adoptedStyleSheets = next;
    }
    if (hasShadowTokens()) {
      return;
    }
  }

  ensureShadowStyleText(shadowRoot, TOKEN_PRIMITIVES_ID, primitivesCss);
  ensureShadowStyleText(shadowRoot, TOKEN_SEMANTIC_ID, semanticCss);
  ensureShadowStyleText(shadowRoot, STYLE_ID, componentsCss);

  ensureShadowFallbackTokens(shadowRoot);
}
