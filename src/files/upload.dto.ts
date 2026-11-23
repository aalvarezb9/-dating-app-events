import { ApiProperty } from '@nestjs/swagger';
import { IsInt, IsNotEmpty, IsString, IsUUID, MaxLength, Min } from 'class-validator';

/**
 * Body of the first step of an upload (`POST …/upload-url`): what the client is going to send. Whether it is allowed (type, size) is
 * decided by `UploadTicketService.issue`, which answers with the same error keys as before (`UPLOAD_ERRORS`): the size is not limited here
 * on purpose, so that "too big" is `validation.error.file_size_exceeded` and not a generic validation message.
 */
export class RequestUploadDto {
  @ApiProperty({ example: 'image/png', description: 'Content type of the file the client will send (JPEG, PNG, WebP, GIF or PDF, depending on the route)' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  contentType!: string;

  @ApiProperty({ example: 123456, description: 'Size in bytes of the file the client will send (up to 5 MB)' })
  @IsInt()
  @Min(1)
  sizeBytes!: number;
}

/** Body of the last step of an upload (`POST …/confirm`): the id the first step returned, once the file was sent to the storage */
export class ConfirmUploadDto {
  @ApiProperty({ description: 'The `uploadId` that `upload-url` returned' })
  @IsUUID()
  uploadId!: string;
}

/** What `upload-url` returns: send a multipart form to `url` with `fields` first and the `file` last, then call `confirm` with `uploadId` */
export class UploadTicketResponseDto {
  @ApiProperty()
  uploadId!: string;

  @ApiProperty({ description: 'Address to POST the form to' })
  url!: string;

  @ApiProperty({ description: 'Form fields to send BEFORE the file, in this order', type: 'object', additionalProperties: { type: 'string' } })
  fields!: Record<string, string>;

  @ApiProperty({ description: 'The ticket is not valid after this instant' })
  expiresAt!: Date;

  @ApiProperty({ description: 'Largest file the storage accepts through this ticket' })
  maxBytes!: number;
}
