import { Controller, Get, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import { DataSource } from 'typeorm';
import { InternalApi } from '../common/decorators/internal-api.decorator';
import { OutboxEvent } from './outbox-event.entity';

/**
 * Operations on the outbox of the service, for whoever watches it (an alert, an operator, admin-saas).
 *
 * - `GET /internal/v1/outbox/status`: events by status, how old the oldest pending one is, and the
 *   events PARKED as `failed` (the relay gave up after `maxAttempts`; nobody retries them by themselves).
 * - `POST /internal/v1/outbox/retry-failed`: puts the parked events back in the queue, in their original
 *   order, once whatever stopped them (Kafka, a consumer) has been fixed.
 *
 * Internal: API key, never exposed by the gateway. It shows no payloads (they can carry secrets).
 */
@ApiExcludeController()
@Controller('internal/v1/outbox')
@InternalApi()
export class OutboxAdminController {
  constructor(private readonly dataSource: DataSource) {}

  @Get('status')
  async status() {
    const repo = this.dataSource.getRepository(OutboxEvent);

    const rows: Array<{ status: string; total: string }> = await repo
      .createQueryBuilder('e')
      .select('e.status', 'status')
      .addSelect('COUNT(*)', 'total')
      .groupBy('e.status')
      .getRawMany();
    const counts = { pending: 0, published: 0, failed: 0 };
    for (const row of rows) {
      counts[row.status as keyof typeof counts] = Number(row.total);
    }

    const oldest = await repo
      .createQueryBuilder('e')
      .where('e.status = :status', { status: 'pending' })
      .orderBy('e.id', 'ASC')
      .getOne();
    const parked = await repo.find({ where: { status: 'failed' }, order: { id: 'ASC' }, take: 50 });

    return {
      ...counts,
      oldestPendingAgeSeconds: oldest ? Math.round((Date.now() - oldest.createdAt.getTime()) / 1000) : 0,
      parked: parked.map((e) => ({
        id: e.id,
        eventId: e.eventId,
        eventType: e.eventType,
        aggregateId: e.aggregateId,
        attempts: e.attempts,
        lastError: e.lastError,
      })),
    };
  }

  @Post('retry-failed')
  @HttpCode(HttpStatus.OK)
  async retryFailed() {
    const result = await this.dataSource
      .getRepository(OutboxEvent)
      .update({ status: 'failed' }, { status: 'pending', attempts: 0, lastError: null });
    return { requeued: result.affected ?? 0 };
  }
}
