import { useEffect, useState } from "react";

import {
  MAXIMUM_PASTED_REFERENCE_CHARACTERS,
  MAXIMUM_REFERENCE_COUNT,
  MAXIMUM_TOPIC_CHARACTERS,
} from "../../shared/client-message.ts";
import { isGithubReferenceHostname } from "../../shared/github-hosts.ts";
import type { LessonReference, LessonSetup } from "../../shared/lesson.ts";

export interface SetupFormProps {
  readonly suggestedTopic: string | null;
  readonly isStarting: boolean;
  readonly onStart: (setup: LessonSetup) => void;
}

export function SetupForm({ suggestedTopic, isStarting, onStart }: SetupFormProps) {
  const [topic, setTopic] = useState(suggestedTopic ?? "");
  const [linkDraft, setLinkDraft] = useState("");
  const [pastedDraft, setPastedDraft] = useState("");
  const [references, setReferences] = useState<readonly LessonReference[]>([]);
  const [problem, setProblem] = useState<string | null>(null);

  // The topic can arrive after the page loads, when /teach is run again.
  useEffect(() => {
    if (suggestedTopic !== null) {
      setTopic(suggestedTopic);
    }
  }, [suggestedTopic]);

  function addLink(): void {
    const link = linkDraft.trim();
    if (link.length === 0) return;
    if (references.length >= MAXIMUM_REFERENCE_COUNT) {
      setProblem(`A lesson can use at most ${MAXIMUM_REFERENCE_COUNT} references.`);
      return;
    }

    let parsedLink: URL;
    try {
      parsedLink = new URL(link);
    } catch {
      setProblem("That is not a web address. Start it with https://");
      return;
    }
    if (parsedLink.protocol !== "http:" && parsedLink.protocol !== "https:") {
      setProblem("A link must start with http:// or https://");
      return;
    }

    setReferences([
      ...references,
      {
        // Only the GitHub hosts the lesson can read through the GitHub API count.
        // `docs.github.com` also ends in github.com and is an ordinary web page.
        kind: isGithubReferenceHostname(parsedLink.hostname) ? "github" : "url",
        label: parsedLink.hostname + parsedLink.pathname,
        value: parsedLink.toString(),
      },
    ]);
    setLinkDraft("");
    setProblem(null);
  }

  function addPastedNotes(): void {
    const notes = pastedDraft.trim();
    if (notes.length === 0) return;
    if (notes.length > MAXIMUM_PASTED_REFERENCE_CHARACTERS) {
      setProblem(`Pasted notes must be under ${MAXIMUM_PASTED_REFERENCE_CHARACTERS} characters.`);
      return;
    }
    setReferences([
      ...references,
      { kind: "pasted", label: `Pasted notes ${references.length + 1}`, value: notes },
    ]);
    setPastedDraft("");
    setProblem(null);
  }

  function removeReference(indexToRemove: number): void {
    setReferences(references.filter((_reference, index) => index !== indexToRemove));
  }

  function startLesson(): void {
    const trimmedTopic = topic.trim();
    if (trimmedTopic.length === 0) {
      setProblem("Say what you want to learn about.");
      return;
    }
    setProblem(null);
    onStart({ topic: trimmedTopic, references });
  }

  return (
    <section>
      <h1 className="lesson-title">What do you want to learn?</h1>
      <p className="lesson-subtitle">
        Give a topic. Add links or notes if you have them. The lesson starts at the high level.
      </p>

      {problem === null ? null : <p className="notice notice-error">{problem}</p>}

      <label className="setup-field">
        <span className="setup-label">Topic</span>
        <input
          className="setup-input"
          value={topic}
          maxLength={MAXIMUM_TOPIC_CHARACTERS}
          placeholder="How a message queue works"
          onChange={(event) => setTopic(event.target.value)}
        />
      </label>

      <div className="setup-field">
        <span className="setup-label">Links and code</span>
        <p className="setup-hint">
          Any web address. A github.com or gist.github.com address is read as code.
        </p>
        <div className="setup-row">
          <input
            className="setup-input"
            value={linkDraft}
            placeholder="https://github.com/example/worker"
            onChange={(event) => setLinkDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                addLink();
              }
            }}
          />
          <button type="button" className="button" onClick={addLink}>
            Add
          </button>
        </div>
      </div>

      <div className="setup-field">
        <span className="setup-label">Pasted notes</span>
        <p className="setup-hint">Paste anything the lesson should read: notes, an error, a spec.</p>
        <textarea
          className="setup-textarea"
          value={pastedDraft}
          onChange={(event) => setPastedDraft(event.target.value)}
        />
        <div className="setup-row">
          <button type="button" className="button" onClick={addPastedNotes}>
            Add notes
          </button>
        </div>
      </div>

      {references.length === 0 ? null : (
        <ul className="reference-list">
          {references.map((reference, index) => (
            <li className="reference-item" key={`${reference.kind}-${index}`}>
              <span className="reference-kind">{referenceKindLabel(reference)}</span>
              <span className="reference-value">{reference.label}</span>
              <button type="button" className="button" onClick={() => removeReference(index)}>
                Remove
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="button-row">
        <button
          type="button"
          className="button button-primary"
          disabled={isStarting}
          onClick={startLesson}
        >
          {isStarting ? "Starting the lesson…" : "Start the lesson"}
        </button>
      </div>
    </section>
  );
}

function referenceKindLabel(reference: LessonReference): string {
  switch (reference.kind) {
    case "url":
      return "Link";
    case "github":
      return "Code";
    case "pasted":
      return "Notes";
  }
}
