import { Column, DeleteDateColumn } from 'typeorm';
import { TenantEntity } from '../database/entities/base-entities';

const bigintToNumber = {
  to: (value?: number | null) => value,
  from: (value?: string | null) => (value === null || value === undefined ? value : Number(value)),
};

/**
 * Base class of a LOCAL READ COPY ("projection") of a row owned by another service.
 *
 * The consumer declares the primary key with the SAME id as the owner's row:
 * `@PrimaryColumn('uuid') id!: string;` and the columns it needs (a subset of the contract).
 * Rows are never edited locally: they are written only by applyProjection() from the owner's
 * events and snapshots. Deleted rows stay as tombstones (deleted_at), so an old event that
 * arrives late cannot resurrect them; BaseRepository hides them automatically.
 */
export abstract class ProjectedEntity extends TenantEntity {
  /** Version (modified_at in epoch ms) of the owner's row this copy reflects */
  @Column({ name: 'source_version', type: 'bigint', transformer: bigintToNumber })
  sourceVersion!: number;

  @DeleteDateColumn({ name: 'deleted_at', type: 'timestamptz' })
  deletedAt!: Date | null;
}
