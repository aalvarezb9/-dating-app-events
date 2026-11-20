/**
 * Whether this process is a function of a serverless platform (AWS Lambda) and not a server.
 *
 * The three entries of the library that start Nest for a function (`createHttpHandler`, `consume`, `runTask`) mark it BEFORE creating
 * the application. A service reads it to leave out what only makes sense in a server that stays up:
 *  - what runs once at startup (a full catalog sync, a DDL): in a function it would run on EVERY cold start, in parallel between instances;
 *  - timers (`setInterval`, `@Cron`): a frozen function does not run them when expected. They become scheduled functions (`runTask`).
 *
 * In the container, and in the tests, it stays false and everything works as before.
 */
export class RuntimeInfo {
  private static serverless = false;

  static get isServerless(): boolean {
    return RuntimeInfo.serverless;
  }

  /** Called by the entries of the library; a service has no reason to call it */
  static markServerless(): void {
    RuntimeInfo.serverless = true;
  }
}
