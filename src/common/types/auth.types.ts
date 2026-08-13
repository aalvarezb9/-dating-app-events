/**
 * Authentication and Authorization Types
 */

export enum UserRole {
  SUPER_ADMIN = 'super_admin',
  BUSINESS_OWNER = 'business_owner',
  BUSINESS_STAFF = 'business_staff',
  CUSTOMER = 'customer',
  GUEST = 'guest',
}

export enum TenantType {
  ADMIN = 'admin',
  BUSINESS = 'business',
  CUSTOMER = 'customer',
}
