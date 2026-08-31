import Prism from "prismjs";

import "prismjs/components/prism-bash";
import "prismjs/components/prism-c";
import "prismjs/components/prism-cpp";
import "prismjs/components/prism-csharp";
import "prismjs/components/prism-diff";
import "prismjs/components/prism-docker";
import "prismjs/components/prism-go";
import "prismjs/components/prism-graphql";
import "prismjs/components/prism-java";
import "prismjs/components/prism-json";
import "prismjs/components/prism-kotlin";
import "prismjs/components/prism-markdown";
import "prismjs/components/prism-php";
import "prismjs/components/prism-python";
import "prismjs/components/prism-ruby";
import "prismjs/components/prism-rust";
import "prismjs/components/prism-sql";
import "prismjs/components/prism-swift";
import "prismjs/components/prism-toml";
import "prismjs/components/prism-typescript";
import "prismjs/components/prism-yaml";
import "prismjs/components/prism-jsx";
import "prismjs/components/prism-tsx";

import type { CodeBeat } from "../../../shared/beat.ts";
import type { CodeSpan, HighlightedCodeLine } from "../../../shared/code-lines.ts";
import { codeLinesFromSpans } from "../../../shared/code-lines.ts";

/**
 * The names a lesson is likely to write, mapped to the name the highlighter knows.
 * A language that is not here is shown as plain code rather than guessed at.
 */
const LANGUAGE_ALIASES: Readonly<Record<string, string>> = {
  "c#": "csharp",
  "c++": "cpp",
  cs: "csharp",
  dockerfile: "docker",
  golang: "go",
  html: "markup",
  js: "javascript",
  md: "markdown",
  py: "python",
  rb: "ruby",
  rs: "rust",
  sh: "bash",
  shell: "bash",
  ts: "typescript",
  xml: "markup",
  yml: "yaml",
  zsh: "bash",
};

/**
 * Turns a code beat into the coloured lines the page draws.
 *
 * The highlighter's tokens are flattened into plain spans and handed to the shared
 * line splitter, so no highlighter markup is ever put into the page as raw HTML.
 */
export function highlightedCodeLines(beat: CodeBeat): readonly HighlightedCodeLine[] {
  return codeLinesFromSpans(beat, spansFor(beat.code, beat.language));
}

function spansFor(code: string, language: string): readonly CodeSpan[] {
  const grammar = grammarFor(language);
  if (grammar === undefined) {
    return [{ text: code, tokenType: null }];
  }
  return flattenTokens(Prism.tokenize(code, grammar), null);
}

function grammarFor(language: string): Prism.Grammar | undefined {
  const lowerCaseLanguage = language.toLowerCase();
  return Prism.languages[LANGUAGE_ALIASES[lowerCaseLanguage] ?? lowerCaseLanguage];
}

/**
 * A token's content is a string, another token, or a list of them. Flattening the
 * nesting away leaves one colour per run of text, which is all the page needs.
 */
function flattenTokens(
  tokens: ReadonlyArray<string | Prism.Token>,
  inheritedTokenType: string | null,
): CodeSpan[] {
  const spans: CodeSpan[] = [];

  for (const token of tokens) {
    if (typeof token === "string") {
      spans.push({ text: token, tokenType: inheritedTokenType });
      continue;
    }
    const content = token.content;
    if (typeof content === "string") {
      spans.push({ text: content, tokenType: token.type });
      continue;
    }
    spans.push(...flattenTokens(Array.isArray(content) ? content : [content], token.type));
  }

  return spans;
}
