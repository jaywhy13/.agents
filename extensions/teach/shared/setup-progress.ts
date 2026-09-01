/**
 * Whether the setup form is waiting for the lesson it asked for.
 *
 * Starting a lesson is one message over the socket, not a reply-bearing call, so
 * the form has to be told when to stop waiting. If it is never told, a start that
 * failed leaves the button disabled for good and the learner cannot try again.
 */
export type SetupProgress = "idle" | "starting";

export type SetupProgressEvent =
  | { readonly kind: "start_requested" }
  | { readonly kind: "lesson_started" }
  | { readonly kind: "start_failed" }
  | { readonly kind: "socket_closed" }
  | { readonly kind: "setup_form_shown" };

export const INITIAL_SETUP_PROGRESS: SetupProgress = "idle";

export function nextSetupProgress(
  current: SetupProgress,
  event: SetupProgressEvent,
): SetupProgress {
  switch (event.kind) {
    case "start_requested":
      return "starting";
    case "lesson_started":
    case "start_failed":
    case "socket_closed":
    case "setup_form_shown":
      return "idle";
    default:
      return current;
  }
}
