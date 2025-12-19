const TOKEN_PRIMITIVES_ID = "mbu-ui-token-primitives";
const TOKEN_SEMANTIC_ID = "mbu-ui-token-semantic";
const STYLE_ID = "mbu-ui-base-styles";

const TOKEN_PRIMITIVES_PATH = "src/styles/tokens/primitives.css";
const TOKEN_SEMANTIC_PATH = "src/styles/tokens/semantic.css";
const TOKEN_COMPONENTS_PATH = "src/styles/tokens/components.css";
const POPUP_BASE_ID = "mbu-style-base";
const POPUP_LAYOUT_ID = "mbu-style-layout";
const POPUP_UTILITIES_ID = "mbu-style-utilities";

const POPUP_BASE_PATH = "src/styles/base.css";
const POPUP_LAYOUT_PATH = "src/styles/layout.css";
const POPUP_UTILITIES_PATH = "src/styles/utilities.css";

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

function ensureDocumentStylesheet(
  doc: Document,
  id: string,
  path: string
): void {
  if (doc.getElementById(id)) {
    return;
  }
  const link = doc.createElement("link");
  link.id = id;
  link.rel = "stylesheet";
  link.href = resolveStyleHref(path);
  (doc.head ?? doc.documentElement).appendChild(link);
}

function ensureShadowStylesheet(
  shadowRoot: ShadowRoot,
  id: string,
  path: string
): void {
  if (shadowRoot.querySelector(`#${id}`)) {
    return;
  }
  const link = shadowRoot.ownerDocument.createElement("link");
  link.id = id;
  link.rel = "stylesheet";
  link.href = resolveStyleHref(path);
  shadowRoot.appendChild(link);
}

export function ensurePopupUiBaseStyles(doc: Document): void {
  ensureDocumentStylesheet(doc, TOKEN_PRIMITIVES_ID, TOKEN_PRIMITIVES_PATH);
  ensureDocumentStylesheet(doc, TOKEN_SEMANTIC_ID, TOKEN_SEMANTIC_PATH);
  ensureDocumentStylesheet(doc, POPUP_BASE_ID, POPUP_BASE_PATH);
  ensureDocumentStylesheet(doc, POPUP_LAYOUT_ID, POPUP_LAYOUT_PATH);
  ensureDocumentStylesheet(doc, POPUP_UTILITIES_ID, POPUP_UTILITIES_PATH);
  ensureDocumentStylesheet(doc, STYLE_ID, TOKEN_COMPONENTS_PATH);
}

export function ensureShadowUiBaseStyles(shadowRoot: ShadowRoot): void {
  ensureShadowStylesheet(
    shadowRoot,
    TOKEN_PRIMITIVES_ID,
    TOKEN_PRIMITIVES_PATH
  );
  ensureShadowStylesheet(shadowRoot, TOKEN_SEMANTIC_ID, TOKEN_SEMANTIC_PATH);
  ensureShadowStylesheet(shadowRoot, STYLE_ID, TOKEN_COMPONENTS_PATH);
}
