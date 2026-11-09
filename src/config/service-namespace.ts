/** SERVICE_NAMESPACE: short lowercase abbreviation of the service (bo, sch, usr…) */
const SERVICE_NAMESPACE_PATTERN = /^[a-z][a-z0-9]{1,5}$/;

/**
 * Whether a SERVICE_NAMESPACE is valid. It lives in its own file (no TypeORM import) so the configuration, and the
 * light `edge` entry that a gateway uses, do not load TypeORM only to validate a string.
 */
export function isValidServiceNamespace(namespace: string | undefined): namespace is string {
  return !!namespace && SERVICE_NAMESPACE_PATTERN.test(namespace);
}
