"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var EventsModule_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.EventsModule = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const event_publisher_service_1 = require("./services/event-publisher.service");
let EventsModule = EventsModule_1 = class EventsModule {
    static register(config) {
        return {
            module: EventsModule_1,
            imports: [config_1.ConfigModule],
            providers: [
                {
                    provide: 'EVENT_PUBLISHER_CONFIG',
                    useValue: config,
                },
                event_publisher_service_1.EventPublisher,
            ],
            exports: [event_publisher_service_1.EventPublisher],
            global: true,
        };
    }
    static registerAsync(configFactory) {
        return {
            module: EventsModule_1,
            imports: [config_1.ConfigModule],
            providers: [
                {
                    provide: 'EVENT_PUBLISHER_CONFIG',
                    useFactory: configFactory,
                },
                event_publisher_service_1.EventPublisher,
            ],
            exports: [event_publisher_service_1.EventPublisher],
            global: true,
        };
    }
};
exports.EventsModule = EventsModule;
exports.EventsModule = EventsModule = EventsModule_1 = __decorate([
    (0, common_1.Global)(),
    (0, common_1.Module)({
        imports: [config_1.ConfigModule],
        providers: [event_publisher_service_1.EventPublisher],
        exports: [event_publisher_service_1.EventPublisher],
    })
], EventsModule);
//# sourceMappingURL=events.module.js.map