import { describe, expect, it } from "vitest";
import { formatLink } from "@/utils/link_format";

describe("create link formatLink", () => {
  it("formats markdown links", () => {
    expect(
      formatLink({ title: "Example", url: " https://example.com " }, "markdown")
    ).toBe("[Example](<https://example.com>)");
  });

  it("formats markdown autolinks when title is empty", () => {
    expect(
      formatLink({ title: "", url: "https://example.com" }, "markdown")
    ).toBe("<https://example.com>");
  });

  it("escapes HTML output", () => {
    expect(
      formatLink(
        { title: 'A&B <Test> "quote"', url: 'https://example.com/?q="x"&y=1' },
        "html"
      )
    ).toBe(
      '<a href="https://example.com/?q=&quot;x&quot;&amp;y=1">A&amp;B &lt;Test&gt; "quote"</a>'
    );
  });

  it("formats org-mode links", () => {
    expect(
      formatLink({ title: "Example", url: "https://example.com" }, "org")
    ).toBe("[[https://example.com][Example]]");
    expect(formatLink({ title: "", url: "https://example.com" }, "org")).toBe(
      "[[https://example.com]]"
    );
  });
});
