/**
 * File Storage Module
 *
 * Exports:
 * - FileStorageService: Abstract contract for file storage operations
 * - SupabaseStorageStrategy: Concrete implementation for Supabase Storage
 * - StorageModule: Module configuration with provider
 */

// Abstract contract and interfaces
export * from './file-storage.interface';

// Concrete strategies
export * from './strategies/supabase-storage.strategy';

// Module
export * from './storage.module';
