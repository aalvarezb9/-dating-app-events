import { BadRequestException, Controller, Get, Query, Req, Res } from '@nestjs/common';
import { ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import type { Request, Response } from 'express';
import { Public } from '../common/decorators/public.decorator';
import { SseErrors, SseHub } from './sse.hub';
import { SseSettings } from './sse.settings';
import { isPublicAgendaPattern } from './sse.topics';

/**
 * The stream the UI opens: `GET /sse/stream?topics=agenda.salon-angel.*.2030-06-20,agenda.salon-angel.m7.#`.
 *
 * Only the service that imports `SseModule.forRoot({ serve: true })` has it. It is public (the signals are
 * hints with no customer data), so what it accepts is strict: only agenda patterns that name the business
 * (never `agenda.#`), a bounded number of them, and a bounded number of connections per instance.
 */
@ApiTags('SSE')
@Controller('sse')
export class SseController {
  constructor(
    private readonly hub: SseHub,
    private readonly settings: SseSettings,
  ) {}

  @Public()
  @Get('stream')
  @ApiOperation({
    summary: 'Real-time signals (Server-Sent Events)',
    description:
      'Keeps the connection open and writes one event per signal that matches the patterns. The name of the event is the topic. ' +
      'Nothing is replayed: ask the API for the current state, then listen.',
  })
  @ApiQuery({ name: 'topics', description: 'Comma separated patterns, e.g. agenda.salon-angel.*.2030-06-20 (* one segment, # the rest)' })
  stream(@Query('topics') topics: string | undefined, @Req() request: Request, @Res() response: Response): void {
    const patterns = [...new Set((topics ?? '').split(',').map((topic) => topic.trim()).filter(Boolean))];

    if (patterns.length === 0) {
      throw new BadRequestException(SseErrors.TOPICS_REQUIRED);
    }
    if (patterns.length > this.settings.maxTopicsPerConnection) {
      throw new BadRequestException(SseErrors.TOO_MANY_TOPICS);
    }
    if (!patterns.every(isPublicAgendaPattern)) {
      throw new BadRequestException(SseErrors.INVALID_TOPIC);
    }

    this.hub.open(request, response, patterns);
  }
}
