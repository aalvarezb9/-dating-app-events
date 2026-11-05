/** Largest file a service accepts in a single upload (5 MB) */
export const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024;

/**
 * i18n keys of the errors of an upload. They are the same in every service, so the frontend
 * translates them once.
 */
export const UPLOAD_ERRORS = {
  FILE_REQUIRED: 'validation.error.file_required',
  FILE_SIZE_EXCEEDED: 'validation.error.file_size_exceeded',
  INVALID_FILE_TYPE: 'validation.error.invalid_file_type',
} as const;
