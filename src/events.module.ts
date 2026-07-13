import { Module, DynamicModule, Global } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { EventPublisher, EventPublisherConfig } from './services/event-publisher.service';

/**
 * Global Events Module for Dating App
 * Provides event publishing capabilities to all microservices
 */
@Global()
@Module({
  imports: [ConfigModule],
  providers: [EventPublisher],
  exports: [EventPublisher],
})
export class EventsModule {
  /**
   * Register module with custom configuration
   * @param config - EventPublisherConfig
   */
  static register(config: EventPublisherConfig): DynamicModule {
    return {
      module: EventsModule,
      imports: [ConfigModule],
      providers: [
        {
          provide: 'EVENT_PUBLISHER_CONFIG',
          useValue: config,
        },
        EventPublisher,
      ],
      exports: [EventPublisher],
      global: true,
    };
  }

  /**
   * Register module with async configuration
   * Useful when config comes from environment or external service
   */
  static registerAsync(
    configFactory: () => Promise<EventPublisherConfig>,
  ): DynamicModule {
    return {
      module: EventsModule,
      imports: [ConfigModule],
      providers: [
        {
          provide: 'EVENT_PUBLISHER_CONFIG',
          useFactory: configFactory,
        },
        EventPublisher,
      ],
      exports: [EventPublisher],
      global: true,
    };
  }
}
