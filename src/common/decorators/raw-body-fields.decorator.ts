import { SetMetadata } from '@nestjs/common';

export const RAW_BODY_FIELDS_KEY = 'rawBodyFields';

/**
 * Names top-level fields of the request body that `SanitizeInterceptor` must NOT strip, because the endpoint cleans them itself with a stricter rule than "no HTML at all"
 * (a whitelist of tags and styles, like the HTML of an email template). The rest of the body, `query` and `params` are sanitized as always.
 * Usage: `@RawBodyFields('body', 'design')` on the handler. The endpoint is then responsible for the safety of those fields.
 */
export const RawBodyFields = (...fields: string[]) => SetMetadata(RAW_BODY_FIELDS_KEY, fields);
