/**
 * Standard API response wrapper
 * Used across all endpoints for consistency
 */
export interface ApiResponse<T> {
  success: boolean;
  data: T;
  timestamp: string;
}

/**
 * Paginated response structure
 * Used for endpoints that return paginated data
 */
export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}
