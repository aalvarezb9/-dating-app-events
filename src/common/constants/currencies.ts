/**
 * Valid ISO 4217 currency codes supported by the application
 *
 * Currently supported:
 * - HNL: Honduran Lempira
 * - USD: United States Dollar
 */
export const VALID_CURRENCIES = ['HNL', 'USD'] as const;

/**
 * Type-safe currency code
 */
export type ValidCurrency = typeof VALID_CURRENCIES[number];

/**
 * Check if a currency code is valid
 */
export function isValidCurrency(currency: string): boolean {
  return VALID_CURRENCIES.includes(currency.toUpperCase() as any);
}

/**
 * Get currency display names
 */
export const CURRENCY_NAMES: Record<ValidCurrency, string> = {
  HNL: 'Honduran Lempira',
  USD: 'US Dollar',
};
