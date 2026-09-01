import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { TagStrippingHtmlTextExtractor } from "../../src/references/html-text-extractor.ts";

describe("TagStrippingHtmlTextExtractor", () => {
  it("keeps the words and drops the tags", () => {
    const extracted = new TagStrippingHtmlTextExtractor().extract(
      "<p>A queue keeps <strong>order</strong>.</p>",
    );

    assert.equal(extracted.text, "A queue keeps order.");
  });

  it("reads the page title", () => {
    const extracted = new TagStrippingHtmlTextExtractor().extract(
      "<html><head><title>How queues work</title></head><body><p>Text.</p></body></html>",
    );

    assert.equal(extracted.title, "How queues work");
  });

  it("drops script content so code never reaches the lesson as prose", () => {
    const extracted = new TagStrippingHtmlTextExtractor().extract(
      "<body><script>alert('hi')</script><p>Only this.</p></body>",
    );

    assert.equal(extracted.text, "Only this.");
  });

  it("drops style content", () => {
    const extracted = new TagStrippingHtmlTextExtractor().extract(
      "<body><style>p { color: red }</style><p>Only this.</p></body>",
    );

    assert.equal(extracted.text, "Only this.");
  });

  it("puts paragraphs on their own lines", () => {
    const extracted = new TagStrippingHtmlTextExtractor().extract(
      "<p>First idea.</p><p>Second idea.</p>",
    );

    assert.equal(extracted.text, "First idea.\n\nSecond idea.");
  });

  it("unescapes the entities that show up in ordinary prose", () => {
    const extracted = new TagStrippingHtmlTextExtractor().extract(
      "<p>Fish &amp; chips &#8212; tasty &#x21;</p>",
    );

    assert.equal(extracted.text, "Fish & chips — tasty !");
  });

  it("has no title when the page has none", () => {
    const extracted = new TagStrippingHtmlTextExtractor().extract("<p>Text.</p>");

    assert.equal(extracted.title, null);
  });
});
