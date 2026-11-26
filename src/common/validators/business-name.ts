import { registerDecorator, ValidationArguments, ValidationOptions } from 'class-validator';
import { RESERVED_SUBDOMAINS } from '../constants/reserved-subdomains';

/** What is wrong with a business name; the messages are dictionary keys, translated by the apps */
export type BusinessNameProblem = 'too_short' | 'too_long' | 'invalid_characters' | 'reserved';

export const BUSINESS_NAME_ERRORS: Record<BusinessNameProblem, string> = {
  too_short: 'business_name.error.too_short',
  too_long: 'business_name.error.too_long',
  invalid_characters: 'business_name.error.invalid_characters',
  reserved: 'business_name.error.reserved',
};

export const BUSINESS_NAME_MIN_LENGTH = 2;
export const BUSINESS_NAME_MAX_LENGTH = 100;

/**
 * Letters (any language, with accents), digits, spaces, hyphens and apostrophes; it starts with a letter or a digit. No dots, commas, semicolons, parentheses, slashes, symbols
 * or emoji: the name becomes the suggested address of the business on the web and appears in emails.
 */
const ALLOWED = /^[\p{L}\p{N}][\p{L}\p{N} '’-]*$/u;

/** The name as a label of an address: lowercase, no accents, anything that is not a letter or digit becomes a hyphen */
const slugOf = (name: string): string =>
  name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

/**
 * A name that would pass for the platform itself: it is (or, without spaces and hyphens, becomes) a reserved address (`Admin`, `Log in`, `API`), or it carries the brand (`Bookly
 * Support`, `UseBookly`). Such a name next to the logo of the business would let it impersonate the platform in its own emails and page.
 */
export function isReservedBusinessName(name: string): boolean {
  const slug = slugOf(name);
  return RESERVED_SUBDOMAINS.has(slug) || RESERVED_SUBDOMAINS.has(slug.replace(/-/g, '')) || slug.replace(/-/g, '').includes('bookly');
}

/** The first thing wrong with a business name, or null when it can be used */
export function businessNameProblem(value: unknown): BusinessNameProblem | null {
  if (typeof value !== 'string') {
    return 'invalid_characters';
  }
  const name = value.trim();
  if (name.length < BUSINESS_NAME_MIN_LENGTH) {
    return 'too_short';
  }
  if (name.length > BUSINESS_NAME_MAX_LENGTH) {
    return 'too_long';
  }
  if (!ALLOWED.test(name)) {
    return 'invalid_characters';
  }
  return isReservedBusinessName(name) ? 'reserved' : null;
}

/** class-validator: the property is a business name the platform accepts (see `businessNameProblem`); the message says which rule it broke */
export function IsBusinessName(options?: ValidationOptions) {
  return (target: object, propertyName: string): void => {
    registerDecorator({
      name: 'isBusinessName',
      target: target.constructor,
      propertyName,
      options,
      validator: {
        validate: (value: unknown) => businessNameProblem(value) === null,
        defaultMessage: (args: ValidationArguments) => BUSINESS_NAME_ERRORS[businessNameProblem(args.value) ?? 'invalid_characters'],
      },
    });
  };
}
