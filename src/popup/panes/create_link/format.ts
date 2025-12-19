export const LINK_FORMATS = [
  "url",
  "text",
  "markdown",
  "html",
  "org",
  "bbcode",
] as const;
export type LinkFormat = (typeof LINK_FORMATS)[number];

export type LinkSource = {
  title: string;
  url: string;
};

export const LINK_FORMAT_OPTIONS: ReadonlyArray<{
  value: LinkFormat;
  label: string;
}> = [
  { value: "url", label: "URL" },
  { value: "text", label: "テキスト（タイトル + URL）" },
  { value: "markdown", label: "Markdown" },
  { value: "html", label: "HTML <a>" },
  { value: "org", label: "Org-mode" },
  { value: "bbcode", label: "BBCode" },
];

function escapeHtmlText(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function escapeHtmlAttribute(value: string): string {
  return escapeHtmlText(value).replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

function escapeMarkdownLinkText(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/\[/g, "\\[")
    .replace(/\]/g, "\\]");
}

export function formatLink(source: LinkSource, format: LinkFormat): string {
  const url = source.url.trim();
  if (!url) {
    return "";
  }

  const title = source.title.trim();

  if (format === "url") {
    return url;
  }

  if (format === "text") {
    return title ? `${title}\n${url}` : url;
  }

  if (format === "markdown") {
    return title ? `[${escapeMarkdownLinkText(title)}](<${url}>)` : `<${url}>`;
  }

  if (format === "html") {
    const label = title || url;
    return `<a href="${escapeHtmlAttribute(url)}">${escapeHtmlText(label)}</a>`;
  }

  if (format === "org") {
    const label = title.trim();
    return label ? `[[${url}][${label}]]` : `[[${url}]]`;
  }

  const label = title || url;
  return title ? `[url=${url}]${label}[/url]` : `[url]${url}[/url]`;
}
