export interface RegisteredCommand {
  readonly description?: string;
  readonly handler: (args: string, ctx: unknown) => Promise<void> | void;
}

/**
 * Stands in for the pi extension surface, so the extension entry point can be
 * loaded and inspected without starting pi.
 */
export class FakeExtensionApi {
  readonly commands = new Map<string, RegisteredCommand>();
  readonly eventHandlers = new Map<string, Array<(event: unknown, ctx: unknown) => unknown>>();
  readonly registeredTools: string[] = [];

  registerCommand(name: string, options: RegisteredCommand): void {
    this.commands.set(name, options);
  }

  on(eventName: string, handler: (event: unknown, ctx: unknown) => unknown): void {
    const handlers = this.eventHandlers.get(eventName) ?? [];
    handlers.push(handler);
    this.eventHandlers.set(eventName, handlers);
  }

  registerTool(definition: { name: string }): void {
    this.registeredTools.push(definition.name);
  }

  async emit(eventName: string, event: unknown = {}, ctx: unknown = {}): Promise<void> {
    for (const handler of this.eventHandlers.get(eventName) ?? []) {
      await handler(event, ctx);
    }
  }
}

export interface RecordedNotification {
  readonly text: string;
  readonly level: string | undefined;
}

export class FakeCommandContext {
  readonly notifications: RecordedNotification[] = [];

  readonly ui = {
    notify: (text: string, level?: string): void => {
      this.notifications.push({ text, level });
    },
  };
}
