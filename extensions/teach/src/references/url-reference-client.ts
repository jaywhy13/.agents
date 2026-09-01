import type { HtmlTextExtractor } from "./html-text-extractor.ts";
import type { ReferenceContent, UrlReference } from "./reference.ts";
import { ReferenceCopyError } from "./reference.ts";
import type { FetchedDocument, SafeHttpClient } from "./safe-http-client.ts";

const HTML_MEDIA_TYPES = ["text/html", "application/xhtml+xml"] as const;

/**
 * Copies a plain web page. It owns one decision only: what a fetched document has
 * to become before a lesson can read it. Everything about whether the address may
 * be fetched at all belongs to the safe HTTP client behind it.
 */
export class UrlReferenceClient {
  private readonly safeHttpClient: SafeHttpClient;
  private readonly htmlTextExtractor: HtmlTextExtractor;

  constructor(safeHttpClient: SafeHttpClient, htmlTextExtractor: HtmlTextExtractor) {
    this.safeHttpClient = safeHttpClient;
    this.htmlTextExtractor = htmlTextExtractor;
  }

  async copy(reference: UrlReference): Promise<ReferenceContent> {
    let document: FetchedDocument;
    try {
      document = await this.safeHttpClient.fetchDocument(reference.url);
    } catch (cause) {
      throw new ReferenceCopyError(
        `${reference.label} could not be copied from ${reference.url}: ${describeCause(cause)}`,
        { cause },
      );
    }

    if (isHtml(document.mediaType)) {
      return this.readablePageContent(document);
    }
    return {
      text: document.text,
      mediaType: document.mediaType,
      sourceUrl: document.finalUrl,
      title: null,
    };
  }

  private readablePageContent(document: FetchedDocument): ReferenceContent {
    const extracted = this.htmlTextExtractor.extract(document.text);
    if (extracted.text.trim().length === 0) {
      throw new ReferenceCopyError(`${document.finalUrl} has no readable text on it.`);
    }
    return {
      text: extracted.text,
      mediaType: "text/plain",
      sourceUrl: document.finalUrl,
      title: extracted.title,
    };
  }
}

function isHtml(mediaType: string): boolean {
  return (HTML_MEDIA_TYPES as readonly string[]).includes(mediaType);
}

function describeCause(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause);
}
