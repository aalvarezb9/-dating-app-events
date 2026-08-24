import { Injectable, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { AxiosError, AxiosRequestConfig } from 'axios';
import { firstValueFrom } from 'rxjs';

export interface HttpRequestOptions {
  headers?: Record<string, string>;
  params?: Record<string, any>;
  timeout?: number;
}

export interface ErrorResponse {
  message: string;
  statusCode: number;
  error?: string;
  details?: any;
}

export interface BaseServiceClientConfig {
  baseURL: string;
  apiKey: string;
  serviceName: string;
  defaultTimeout?: number;
}

/**
 * BaseServiceClient
 *
 * Abstract base class for HTTP inter-service communication.
 * Provides standardized methods for HTTP calls with API Key authentication.
 *
 * The baseURL is configured ONCE in the constructor (e.g., 'http://auth-service:3001').
 * Each method receives the relative endpoint (e.g., '/api/v1/users/123').
 *
 * Usage:
 * ```typescript
 * @Injectable()
 * export class AuthServiceClient extends BaseServiceClient {
 *   constructor(httpService: HttpService, config: SharedConfigService) {
 *     super(httpService, {
 *       baseURL: config.get('AUTH_SERVICE_URL') || 'http://auth-service:3001',
 *       apiKey: config.get('INTER_SERVICE_API_KEY'),
 *       serviceName: 'backend-dating-business-owner',
 *       defaultTimeout: 10000,
 *     });
 *   }
 *
 *   async getUserById(userId: string) {
 *     return this.get<UserResponse>(`/api/v1/users/${userId}`);
 *   }
 *
 *   async createUser(userData: CreateUserDto) {
 *     return this.post<UserResponse>('/api/v1/users', userData);
 *   }
 * }
 * ```
 */
@Injectable()
export abstract class BaseServiceClient {
  protected readonly logger: Logger;
  private readonly baseURL: string;
  private readonly apiKey: string;
  private readonly serviceName: string;
  private readonly defaultTimeout: number;

  constructor(
    protected readonly httpService: HttpService,
    config: BaseServiceClientConfig,
  ) {
    this.logger = new Logger(this.constructor.name);
    this.baseURL = config.baseURL;
    this.apiKey = config.apiKey;
    this.serviceName = config.serviceName;
    this.defaultTimeout = config.defaultTimeout || 10000;

    if (!this.apiKey) {
      throw new Error('API Key is required for BaseServiceClient');
    }

    if (!this.baseURL) {
      throw new Error('Base URL is required for BaseServiceClient');
    }

    this.logger.log(`Initialized ${this.constructor.name} for ${this.baseURL}`);
  }

  /**
   * Build headers for HTTP request
   * Includes API Key, service name, and custom headers
   */
  protected buildHeaders(customHeaders?: Record<string, string>): Record<string, string> {
    return {
      'Content-Type': 'application/json',
      'X-API-Key': this.apiKey,
      'X-Service-Name': this.serviceName,
      ...customHeaders,
    };
  }

  /**
   * Build Axios request config
   */
  protected buildConfig(options?: HttpRequestOptions): AxiosRequestConfig {
    return {
      headers: this.buildHeaders(options?.headers),
      params: options?.params,
      timeout: options?.timeout || this.defaultTimeout,
    };
  }

  /**
   * Build full URL from endpoint
   */
  protected buildURL(endpoint: string): string {
    // Remove leading slash if present to avoid double slashes
    const cleanEndpoint = endpoint.startsWith('/') ? endpoint.slice(1) : endpoint;
    // Ensure baseURL doesn't end with slash
    const cleanBaseURL = this.baseURL.endsWith('/') ? this.baseURL.slice(0, -1) : this.baseURL;
    return `${cleanBaseURL}/${cleanEndpoint}`;
  }

  /**
   * Handle HTTP errors
   */
  protected handleError(error: AxiosError<ErrorResponse>, method: string, endpoint: string): never {
    if (error.response) {
      // Server responded with error
      const { status, data } = error.response;
      this.logger.error(
        `HTTP ${method} ${endpoint} failed with ${status}: ${JSON.stringify(data)}`,
      );
      throw new Error(
        data?.message || `Service request failed with status ${status}`,
      );
    } else if (error.request) {
      // Request made but no response
      this.logger.error(`HTTP ${method} ${endpoint} - No response from service`);
      throw new Error('Service unavailable - no response received');
    } else {
      // Error setting up request
      this.logger.error(`HTTP ${method} ${endpoint} - Request setup failed: ${error.message}`);
      throw new Error(`Request failed: ${error.message}`);
    }
  }

  /**
   * Unwrap ApiResponse envelope from server response
   * Server returns: { success: true, data: T, timestamp: string }
   * This method extracts and returns just the 'data' field
   */
  protected unwrapResponse<T>(response: any): T {
    console.log('[BaseServiceClient.unwrapResponse] Input:', JSON.stringify(response, null, 2));
    // Check if response is wrapped in ApiResponse format
    if (response && typeof response === 'object' && 'success' in response && 'data' in response) {
      const unwrapped = response.data as T;
      console.log('[BaseServiceClient.unwrapResponse] Unwrapped:', JSON.stringify(unwrapped, null, 2));
      return unwrapped;
    }
    // If not wrapped, return as-is (backward compatibility)
    console.log('[BaseServiceClient.unwrapResponse] Not wrapped, returning as-is');
    return response as T;
  }

  /**
   * GET request
   * @param endpoint - Relative endpoint (e.g., '/api/v1/users/123' or 'api/v1/users/123')
   */
  async get<T>(endpoint: string, options?: HttpRequestOptions): Promise<T> {
    try {
      const url = this.buildURL(endpoint);
      const config = this.buildConfig(options);

      this.logger.debug(`GET ${url}`);

      const response = await firstValueFrom(
        this.httpService.get<T>(url, config),
      );

      return this.unwrapResponse<T>(response.data);
    } catch (error) {
      this.handleError(error as AxiosError<ErrorResponse>, 'GET', endpoint);
    }
  }

  /**
   * POST request
   * @param endpoint - Relative endpoint (e.g., '/api/v1/users' or 'api/v1/users')
   */
  async post<T>(endpoint: string, body: any, options?: HttpRequestOptions): Promise<T> {
    try {
      const url = this.buildURL(endpoint);
      const config = this.buildConfig(options);

      this.logger.debug(`POST ${url}`);

      const response = await firstValueFrom(
        this.httpService.post<T>(url, body, config),
      );

      return this.unwrapResponse<T>(response.data);
    } catch (error) {
      this.handleError(error as AxiosError<ErrorResponse>, 'POST', endpoint);
    }
  }

  /**
   * PATCH request
   * @param endpoint - Relative endpoint (e.g., '/api/v1/users/123' or 'api/v1/users/123')
   */
  async patch<T>(endpoint: string, body: any, options?: HttpRequestOptions): Promise<T> {
    try {
      const url = this.buildURL(endpoint);
      const config = this.buildConfig(options);

      this.logger.debug(`PATCH ${url}`);

      const response = await firstValueFrom(
        this.httpService.patch<T>(url, body, config),
      );

      return this.unwrapResponse<T>(response.data);
    } catch (error) {
      this.handleError(error as AxiosError<ErrorResponse>, 'PATCH', endpoint);
    }
  }

  /**
   * PUT request
   * @param endpoint - Relative endpoint (e.g., '/api/v1/users/123' or 'api/v1/users/123')
   */
  async put<T>(endpoint: string, body: any, options?: HttpRequestOptions): Promise<T> {
    try {
      const url = this.buildURL(endpoint);
      const config = this.buildConfig(options);

      this.logger.debug(`PUT ${url}`);

      const response = await firstValueFrom(
        this.httpService.put<T>(url, body, config),
      );

      return this.unwrapResponse<T>(response.data);
    } catch (error) {
      this.handleError(error as AxiosError<ErrorResponse>, 'PUT', endpoint);
    }
  }

  /**
   * DELETE request
   * @param endpoint - Relative endpoint (e.g., '/api/v1/users/123' or 'api/v1/users/123')
   */
  async delete<T>(endpoint: string, options?: HttpRequestOptions): Promise<T> {
    try {
      const url = this.buildURL(endpoint);
      const config = this.buildConfig(options);

      this.logger.debug(`DELETE ${url}`);

      const response = await firstValueFrom(
        this.httpService.delete<T>(url, config),
      );

      return this.unwrapResponse<T>(response.data);
    } catch (error) {
      this.handleError(error as AxiosError<ErrorResponse>, 'DELETE', endpoint);
    }
  }
}
