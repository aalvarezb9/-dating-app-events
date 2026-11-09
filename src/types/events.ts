/**
 * Event types for the Dating App microservices
 * Every domain event that triggers notifications or state changes
 */

export enum DomainEventType {
  // User Events
  USER_REGISTERED = 'USER_REGISTERED',
  USER_PROFILE_UPDATED = 'USER_PROFILE_UPDATED',
  USER_DELETED = 'USER_DELETED',
  EMAIL_VERIFICATION_REQUESTED = 'EMAIL_VERIFICATION_REQUESTED', // Token to confirm an email, for the email to the person (see contracts/email-verification.contract.ts)
  EMAIL_VERIFIED = 'EMAIL_VERIFIED', // The person proved the email is theirs

  // Business Events
  BUSINESS_REGISTERED = 'BUSINESS_REGISTERED',
  BUSINESS_REQUEST_APPROVED = 'BUSINESS_REQUEST_APPROVED',
  BUSINESS_REQUEST_REJECTED = 'BUSINESS_REQUEST_REJECTED',
  BUSINESS_PROFILE_UPDATED = 'BUSINESS_PROFILE_UPDATED', // Legacy generic event: use the *_UPSERTED events below

  // Catalog events (full state of one row; see contracts/catalog.contracts.ts)
  SERVICE_UPSERTED = 'SERVICE_UPSERTED',
  SERVICE_DELETED = 'SERVICE_DELETED',
  TEAM_MEMBER_UPSERTED = 'TEAM_MEMBER_UPSERTED',
  TEAM_MEMBER_DELETED = 'TEAM_MEMBER_DELETED',
  BUSINESS_PROFILE_UPSERTED = 'BUSINESS_PROFILE_UPSERTED',
  LANDING_PAGE_UPSERTED = 'LANDING_PAGE_UPSERTED', // Cache invalidation only
  REVIEW_UPSERTED = 'REVIEW_UPSERTED', // Cache invalidation only

  // Appointment requests (see contracts/appointment-request.contract.ts)
  APPOINTMENT_REQUEST_CREATED = 'APPOINTMENT_REQUEST_CREATED',
  APPOINTMENT_REQUEST_REJECTED = 'APPOINTMENT_REQUEST_REJECTED',
  BUSINESS_SUSPENDED = 'BUSINESS_SUSPENDED',
  BUSINESS_REACTIVATED = 'BUSINESS_REACTIVATED', // A suspended business is active again (see contracts/tenant-status.contract.ts)

  // Appointment Events
  APPOINTMENT_CREATED = 'APPOINTMENT_CREATED',
  APPOINTMENT_CONFIRMED = 'APPOINTMENT_CONFIRMED',
  APPOINTMENT_CANCELLED = 'APPOINTMENT_CANCELLED',
  APPOINTMENT_RESCHEDULED = 'APPOINTMENT_RESCHEDULED',
  APPOINTMENT_STARTED = 'APPOINTMENT_STARTED', // The service began (status in_progress)
  APPOINTMENT_COMPLETED = 'APPOINTMENT_COMPLETED',
  APPOINTMENT_NO_SHOW = 'APPOINTMENT_NO_SHOW', // The customer did not come
  APPOINTMENT_REMINDER = 'APPOINTMENT_REMINDER',
  APPOINTMENT_ACCESS_LINK_ISSUED = 'APPOINTMENT_ACCESS_LINK_ISSUED', // Link to see/move an appointment, for the email to the attendee

  // Payment Events
  PAYMENT_INITIATED = 'PAYMENT_INITIATED',
  PAYMENT_SUCCESSFUL = 'PAYMENT_SUCCESSFUL',
  PAYMENT_FAILED = 'PAYMENT_FAILED',
  PAYMENT_REFUNDED = 'PAYMENT_REFUNDED',
  PAYMENT_REQUIRED = 'PAYMENT_REQUIRED',              // NEW: Payment required for reservation
  PAYMENT_COMPLETED = 'PAYMENT_COMPLETED',            // NEW: Payment completed successfully
  PAYMENT_PROOF_UPLOADED = 'PAYMENT_PROOF_UPLOADED',  // Bank-transfer proof uploaded for an appointment (consumed by business-owner)
  PAYMENT_PROOF_REJECTED = 'PAYMENT_PROOF_REJECTED',  // Business owner rejected the bank-transfer proof

  // Reservation Events
  RESERVATION_EXPIRATION_CHECK = 'RESERVATION_EXPIRATION_CHECK',   // NEW: Delayed job to check expiration
  APPOINTMENT_RESERVATION_EXPIRED = 'APPOINTMENT_RESERVATION_EXPIRED', // NEW: Reservation expired without payment

  // Review Events
  REVIEW_CREATED = 'REVIEW_CREATED',
  REVIEW_UPDATED = 'REVIEW_UPDATED',
  REVIEW_DELETED = 'REVIEW_DELETED',

  // Subscription Events
  SUBSCRIPTION_CREATED = 'SUBSCRIPTION_CREATED',
  SUBSCRIPTION_RENEWED = 'SUBSCRIPTION_RENEWED',
  SUBSCRIPTION_CANCELLED = 'SUBSCRIPTION_CANCELLED',

  // Notification commands (one topic per channel; see notifications/notification.contract.ts).
  // They are ORDERS ("send this"), not facts: the emitter decides the content, notifications delivers it.
  NOTIFICATION_EMAIL = 'NOTIFICATION_EMAIL',
  NOTIFICATION_PUSH = 'NOTIFICATION_PUSH',
  NOTIFICATION_UI = 'NOTIFICATION_UI',
  NOTIFICATION_SSE = 'NOTIFICATION_SSE',
  NOTIFICATION_ALL = 'NOTIFICATION_ALL',
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

export interface PaymentRequiredEvent extends DomainEvent {
  eventType: DomainEventType.PAYMENT_REQUIRED;
  data: {
    appointmentId: string;
    requestId: string;
    customerId: string | null;
    customerEmail: string;
    customerName: string;
    businessTenantId: string;
    amount: number;
    currency: string;
    reservationExpiresAt: Date;
    paymentIntentId?: string;
  };
}

export interface PaymentCompletedEvent extends DomainEvent {
  eventType: DomainEventType.PAYMENT_COMPLETED;
  data: {
    appointmentId: string;
    paymentIntentId: string;
    amount: number;
    currency: string;
    paymentMethod: string;
    transactionId: string;
  };
}

export interface ReservationExpirationCheckEvent extends DomainEvent {
  eventType: DomainEventType.RESERVATION_EXPIRATION_CHECK;
  data: {
    appointmentId: string;
    businessTenantId: string;
    teamMemberId: string | null;
    scheduledAt: Date;
    expiresAt: Date;
  };
}

export interface AppointmentReservationExpiredEvent extends DomainEvent {
  eventType: DomainEventType.APPOINTMENT_RESERVATION_EXPIRED;
  data: {
    appointmentId: string;
    customerId: string | null;
    businessId: string;
    scheduledAt: Date;
    reason: string;
  };
}

export type DomainEventUnion =
  | UserRegisteredEvent
  | BusinessRegisteredEvent
  | BusinessRequestApprovedEvent
  | BusinessRequestRejectedEvent
  | AppointmentCreatedEvent
  | AppointmentCancelledEvent
  | PaymentSuccessfulEvent
  | PaymentRequiredEvent
  | PaymentCompletedEvent
  | ReservationExpirationCheckEvent
  | AppointmentReservationExpiredEvent;
