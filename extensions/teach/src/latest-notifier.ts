/** The part of a pi command context this needs: somewhere to show a message. */
export interface NotifyingContext {
  readonly ui: {
    notify(text: string, level?: string): void;
  };
}

/**
 * Sends lesson failures to the pi session.
 *
 * A lesson outlives the `/teach` run that opened it, and `/teach` can be run again
 * while the lesson is open. Holding on to the first run's context would send later
 * messages to a command run that has long since finished, so only the newest one is
 * kept, and it is dropped when the pi session ends.
 */
export class LatestNotifier {
  private context: NotifyingContext | null = null;

  useContext(context: NotifyingContext): void {
    this.context = context;
  }

  forget(): void {
    this.context = null;
  }

  report(error: Error): void {
    try {
      this.context?.ui.notify(`Lesson problem: ${error.message}`, "error");
    } catch {
      // Telling the learner is best effort: one failure must not become two.
    }
  }
}
