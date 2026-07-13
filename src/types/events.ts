/**
 * Event types for the Dating App microservices
 * Every domain event that triggers notifications or state changes
 */

export enum DomainEventType {
  // User Events
  USER_REGISTERED = 'USER_REGISTERED',
  USER_PROFILE_UPDATED = 'USER_PROFILE_UPDATED',
  USER_DELETED = 'USER_DELETED',

  // Business Events
  BUSINESS_REGISTERED = 'BUSINESS_REGISTERED',
  BUSINESS_REQUEST_APPROVED = 'BUSINESS_REQUEST_APPROVED',
  BUSINESS_REQUEST_REJECTED = 'BUSINESS_REQUEST_REJECTED',
  BUSINESS_PROFILE_UPDATED = 'BUSINESS_PROFILE_UPDATED',
  BUSINESS_SUSPENDED = 'BUSINESS_SUSPENDED',

  // Appointment Events
  APPOINTMENT_CREATED = 'APPOINTMENT_CREATED',
  APPOINTMENT_CONFIRMED = 'APPOINTMENT_CONFIRMED',
  APPOINTMENT_CANCELLED = 'APPOINTMENT_CANCELLED',
  APPOINTMENT_RESCHEDULED = 'APPOINTMENT_RESCHEDULED',
  APPOINTMENT_COMPLETED = 'APPOINTMENT_COMPLETED',
  APPOINTMENT_REMINDER = 'APPOINTMENT_REMINDER',

  // Payment Events
  PAYMENT_INITIATED = 'PAYMENT_INITIATED',
  PAYMENT_SUCCESSFUL = 'PAYMENT_SUCCESSFUL',
  PAYMENT_FAILED = 'PAYMENT_FAILED',
  PAYMENT_REFUNDED = 'PAYMENT_REFUNDED',

  // Review Events
  REVIEW_CREATED = 'REVIEW_CREATED',
  REVIEW_UPDATED = 'REVIEW_UPDATED',
  REVIEW_DELETED = 'REVIEW_DELETED',

  // Subscription Events
  SUBSCRIPTION_CREATED = 'SUBSCRIPTION_CREATED',
  SUBSCRIPTION_RENEWED = 'SUBSCRIPTION_RENEWED',
  SUBSCRIPTION_CANCELLED = 'SUBSCRIPTION_CANCELLED',
}

/**
 * Base interface for all domain events
 */
export interface DomainEvent {
  eventType: DomainEventType;
  eventId: string; // Unique event ID (UUID)
  aggregateId: string; // Root aggregate ID
  aggregateType: string; // Type of aggregate (User, Business, Appointment, etc.)
  tenantId?: string; // Multi-tenant support
  userId?: string; // User who triggered the event
  timestamp: Date;
  version: number; // Event version for schema evolution
  data: Record<string, any>; // Event-specific data
  metadata?: {
    correlationId?: string; // Trace across services
    causationId?: string; // Parent event ID
    source?: string; // Which service published this
  };
}

/**
 * Typed domain events for each entity
 */

export interface UserRegisteredEvent extends DomainEvent {
  eventType: DomainEventType.USER_REGISTERED;
  data: {
    userId: string;
    email: string;
    firstName: string;
    lastName: string;
    tenantType: 'CUSTOMER' | 'BUSINESS' | 'ADMIN';
  };
}

export interface BusinessRegisteredEvent extends DomainEvent {
  eventType: DomainEventType.BUSINESS_REGISTERED;
  data: {
    tenantId: string;
    businessName: string;
    businessType: string;
    ownerId: string;
    ownerEmail: string;
  };
}

export interface BusinessRequestApprovedEvent extends DomainEvent {
  eventType: DomainEventType.BUSINESS_REQUEST_APPROVED;
  data: {
    businessRequestId: string;
    tenantId: string;
    businessName: string;
    ownerEmail: string;
    ownerName: string;
    approvedBy: string;
  };
}

export interface BusinessRequestRejectedEvent extends DomainEvent {
  eventType: DomainEventType.BUSINESS_REQUEST_REJECTED;
  data: {
    businessRequestId: string;
    tenantId: string;
    businessName: string;
    ownerEmail: string;
    ownerName: string;
    rejectionReason: string;
    rejectedBy: string;
  };
}

export interface AppointmentCreatedEvent extends DomainEvent {
  eventType: DomainEventType.APPOINTMENT_CREATED;
  data: {
    appointmentId: string;
    customerId: string;
    customerEmail: string;
    customerName: string;
    businessId: string;
    businessName: string;
    businessEmail: string;
    serviceId: string;
    serviceName: string;
    scheduledAt: Date;
    duration: number;
    price: number;
    currency: string;
  };
}

export interface AppointmentCancelledEvent extends DomainEvent {
  eventType: DomainEventType.APPOINTMENT_CANCELLED;
  data: {
    appointmentId: string;
    customerId: string;
    customerEmail: string;
    customerName: string;
    businessId: string;
    businessName: string;
    businessEmail: string;
    serviceName: string;
    scheduledAt: Date;
    cancellationReason?: string;
  };
}

export interface PaymentSuccessfulEvent extends DomainEvent {
  eventType: DomainEventType.PAYMENT_SUCCESSFUL;
  data: {
    paymentId: string;
    appointmentId: string;
    customerId: string;
    customerEmail: string;
    customerName: string;
    amount: number;
    currency: string;
    transactionId: string;
  };
}

export type DomainEventUnion =
  | UserRegisteredEvent
  | BusinessRegisteredEvent
  | BusinessRequestApprovedEvent
  | BusinessRequestRejectedEvent
  | AppointmentCreatedEvent
  | AppointmentCancelledEvent
  | PaymentSuccessfulEvent;
