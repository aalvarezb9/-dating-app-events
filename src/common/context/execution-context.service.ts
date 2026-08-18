import { AsyncLocalStorage } from 'async_hooks';

/**
 * Execution context data stored per request
 */
export interface ExecutionContextData {
  tenantId?: string;
  userId?: string;
  requestId?: string;
  userEmail?: string;
  userRoles?: string[];
  isPublic?: boolean;
  isCrossTenant?: boolean;
  [key: string]: any;
}

/**
 * Global Execution Context Service (Singleton)
 *
 * Uses AsyncLocalStorage to maintain request-scoped context throughout
 * the entire execution chain without explicitly passing it through functions.
 *
 * This service is automatically populated by ExecutionContextInterceptor
 * and can be accessed from anywhere in the application (repositories,
 * services, utilities, etc.).
 *
 * @example Access context from anywhere
 * ```typescript
 * import { ExecutionContext } from '@dating-app/events';
 *
 * // In a repository
 * const tenantId = ExecutionContext.getTenantId();
 *
 * // In a service
 * const userId = ExecutionContext.getUserId();
 *
 * // Custom data
 * ExecutionContext.set('customData', { foo: 'bar' });
 * const data = ExecutionContext.get('customData');
 * ```
 *
 * @example Setup in main.ts or app.module.ts
 * ```typescript
 * import { ExecutionContextInterceptor } from '@dating-app/events';
 *
 * // Global interceptor
 * app.useGlobalInterceptors(new ExecutionContextInterceptor());
 * ```
 */
export class ExecutionContext {
  private static readonly storage = new AsyncLocalStorage<ExecutionContextData>();

  /**
   * Run code within an execution context
   * This is typically called by ExecutionContextInterceptor
   *
   * @internal
   */
  static run<T>(context: ExecutionContextData, callback: () => T): T {
    return this.storage.run(context, callback);
  }

  /**
   * Get the entire context data
   */
  static getContext(): ExecutionContextData | undefined {
    return this.storage.getStore();
  }

  /**
   * Get tenant ID from current execution context
   * Returns undefined if no context or no tenantId
   */
  static getTenantId(): string | undefined {
    return this.storage.getStore()?.tenantId;
  }

  /**
   * Get user ID from current execution context
   * Returns undefined if no context or no userId
   */
  static getUserId(): string | undefined {
    return this.storage.getStore()?.userId;
  }

  /**
   * Get request ID from current execution context
   * Returns undefined if no context or no requestId
   */
  static getRequestId(): string | undefined {
    return this.storage.getStore()?.requestId;
  }

  /**
   * Get user email from current execution context
   * Returns undefined if no context or no userEmail
   */
  static getUserEmail(): string | undefined {
    return this.storage.getStore()?.userEmail;
  }

  /**
   * Get user roles from current execution context
   * Returns undefined if no context or no userRoles
   */
  static getUserRoles(): string[] | undefined {
    return this.storage.getStore()?.userRoles;
  }

  /**
   * Check if the current endpoint is public
   * Returns true if endpoint has @Public() decorator, false otherwise
   */
  static isPublic(): boolean {
    return this.storage.getStore()?.isPublic || false;
  }

  /**
   * Check if the current endpoint/class is marked for cross-tenant access
   * Returns true if endpoint or class has @CrossTenant() decorator, false otherwise
   */
  static isCrossTenant(): boolean {
    return this.storage.getStore()?.isCrossTenant || false;
  }

  /**
   * Set a custom value in the current context
   *
   * @param key - The key to store the value under
   * @param value - The value to store
   */
  static set(key: string, value: any): void {
    const context = this.storage.getStore();
    if (context) {
      context[key] = value;
    }
  }

  /**
   * Get a custom value from the current context
   *
   * @param key - The key to retrieve
   * @returns The value stored under the key, or undefined
   */
  static get<T = any>(key: string): T | undefined {
    return this.storage.getStore()?.[key];
  }

  /**
   * Check if we're currently inside an execution context
   */
  static hasContext(): boolean {
    return this.storage.getStore() !== undefined;
  }

  /**
   * Clear all data in the current context
   * @internal
   */
  static clear(): void {
    const context = this.storage.getStore();
    if (context) {
      Object.keys(context).forEach((key) => delete context[key]);
    }
  }
}
