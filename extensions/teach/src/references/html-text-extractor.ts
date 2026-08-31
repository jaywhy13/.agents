export interface ExtractedHtmlText {
  readonly title: string | null;
  readonly text: string;
}

/**
 * Turns a page of HTML into the words a learner would actually read.
 *
 * This is an interface, not a function, because a real readability library is a
 * much better extractor than anything written by hand, and adding one must not
 * mean rewriting the client that uses it. Swap the implementation, keep the seam.
 */
export interface HtmlTextExtractor {
  extract(html: string): ExtractedHtmlText;
}

/** Elements whose content is markup or code for the browser, never words to read. */
const NON_CONTENT_ELEMENTS = [
  "script",
  "style",
  "noscript",
  "template",
  "svg",
  "canvas",
  "iframe",
  "head",
  "nav",
  "footer",
  "form",
] as const;

/** Elements that end a line of reading, so the text does not run together. */
const LINE_BREAKING_ELEMENTS = [
  "p",
  "br",
  "div",
  "section",
  "article",
  "header",
  "li",
  "tr",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "blockquote",
  "pre",
  "table",
] as const;

const NAMED_HTML_ENTITIES: Readonly<Record<string, string>> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
  hellip: "…",
  mdash: "—",
  ndash: "–",
  rsquo: "’",
  lsquo: "‘",
  ldquo: "“",
  rdquo: "”",
};

/**
 * A small, dependency-free extractor: it drops the elements that hold no words,
 * keeps the line breaks a reader would see, and unescapes the handful of entities
 * that show up in ordinary prose.
 *
 * It is deliberately plain. It keeps navigation text and boilerplate that a real
 * readability library would strip, which is acceptable for a first copy because
 * the lesson reads the text back in small windows rather than all at once.
 */
export class TagStrippingHtmlTextExtractor implements HtmlTextExtractor {
  extract(html: string): ExtractedHtmlText {
    const title = readTitle(html);
    const withoutNonContent = removeNonContentElements(html);
    const withLineBreaks = markLineBreaks(withoutNonContent);
    const withoutTags = withLineBreaks.replace(/<[^>]*>/g, "");
    return { title, text: tidyWhitespace(decodeHtmlEntities(withoutTags)) };
  }
}

function readTitle(html: string): string | null {
  const match = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html);
  const rawTitle = match?.[1];
  if (rawTitle === undefined) {
    return null;
  }
  const title = tidyWhitespace(decodeHtmlEntities(rawTitle.replace(/<[^>]*>/g, ""))).replace(
    /\s+/g,
    " ",
  );
  return title.length === 0 ? null : title;
}

function removeNonContentElements(html: string): string {
  let stripped = html.replace(/<!--[\s\S]*?-->/g, "");
  for (const elementName of NON_CONTENT_ELEMENTS) {
    const elementPattern = new RegExp(`<${elementName}\\b[\\s\\S]*?<\\/${elementName}\\s*>`, "gi");
    stripped = stripped.replace(elementPattern, " ");
  }
  return stripped;
}

function markLineBreaks(html: string): string {
  let marked = html;
  for (const elementName of LINE_BREAKING_ELEMENTS) {
    const elementPattern = new RegExp(`<\\/?${elementName}\\b[^>]*>`, "gi");
    marked = marked.replace(elementPattern, "\n");
  }
  return marked;
}

export function decodeHtmlEntities(text: string): string {
  return text.replace(/&(#x?[0-9A-Fa-f]+|[A-Za-z][A-Za-z0-9]*);/g, (whole, entity: string) => {
    if (entity.startsWith("#")) {
      const isHexadecimal = entity[1] === "x" || entity[1] === "X";
      const digits = isHexadecimal ? entity.slice(2) : entity.slice(1);
      const codePoint = Number.parseInt(digits, isHexadecimal ? 16 : 10);
      if (!Number.isFinite(codePoint) || codePoint <= 0 || codePoint > 0x10ffff) {
        return whole;
      }
      return String.fromCodePoint(codePoint);
    }
    return NAMED_HTML_ENTITIES[entity.toLowerCase()] ?? whole;
  });
}

function tidyWhitespace(text: string): string {
  return text
    .replace(/\r\n?/g, "\n")
    .replace(/[^\S\n]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
