import type { ExtensionCommandContext } from "@earendil-works/pi-coding-agent";

export type TeachingModel = NonNullable<ExtensionCommandContext["model"]>;

export interface TeachingSessionConfiguration {
  readonly model: TeachingModel;
  readonly thinkingLevel: ExtensionCommandContext["thinkingLevel"];
  readonly apiKey: string;
  readonly headers: Readonly<Record<string, string | null>>;
  readonly baseUrl: string | undefined;
}

type TeachingCommandContext = Pick<
  ExtensionCommandContext,
  "model" | "thinkingLevel" | "modelRegistry"
>;

/**
 * Takes a snapshot of the model and credential already working in the parent Pi
 * session. A nested SDK session must not independently read auth.json: that file can
 * contain an older credential than the short-lived one Pi is using now.
 */
export async function resolveTeachingSessionConfiguration(
  context: TeachingCommandContext,
): Promise<TeachingSessionConfiguration> {
  const model = context.model;
  if (model === undefined) {
    throw new Error("Pi has no active model for the lesson.");
  }

  const auth = await context.modelRegistry.getApiKeyAndHeaders(model);
  if (!auth.ok) {
    throw new Error(`The lesson could not use Pi's active model: ${auth.error}`);
  }
  if (auth.apiKey === undefined || auth.apiKey.trim().length === 0) {
    throw new Error(
      "The active model does not expose a credential that a dedicated teaching session can use.",
    );
  }

  return {
    model,
    thinkingLevel: context.thinkingLevel,
    apiKey: auth.apiKey,
    headers: auth.headers ?? {},
    baseUrl: auth.baseUrl,
  };
}
