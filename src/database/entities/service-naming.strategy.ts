import { DefaultNamingStrategy, NamingStrategyInterface } from 'typeorm';
import { snakeCase } from 'typeorm/util/StringUtils';

/** SERVICE_NAMESPACE: short lowercase abbreviation of the service (bo, sch, usr…) */
const SERVICE_NAMESPACE_PATTERN = /^[a-z][a-z0-9]{1,5}$/;

export function isValidServiceNamespace(namespace: string | undefined): namespace is string {
  return !!namespace && SERVICE_NAMESPACE_PATTERN.test(namespace);
}

/**
 * TypeORM naming strategy of the platform:
 * - every table is prefixed with the service namespace: @Entity('services') in business-owner
 *   (SERVICE_NAMESPACE=bo) is the table bo_services
 * - columns and join columns are snake_case
 * Index and constraint names derive from the (prefixed) table name.
 *
 * Configure it with SharedConfigService (never process.env), e.g. in TypeOrmModule.forRootAsync:
 * `namingStrategy: new ServiceNamingStrategy(config.serviceNamespace)`.
 */
export class ServiceNamingStrategy extends DefaultNamingStrategy implements NamingStrategyInterface {
  constructor(private readonly namespace: string) {
    super();
    if (!isValidServiceNamespace(namespace)) {
      throw new Error(
        `Invalid SERVICE_NAMESPACE "${namespace}": use a short lowercase abbreviation (2-6 chars, e.g. "bo").`,
      );
    }
  }

  tableName(targetName: string, userSpecifiedName: string | undefined): string {
    return `${this.namespace}_${userSpecifiedName || snakeCase(targetName)}`;
  }

  columnName(propertyName: string, customName: string | undefined, embeddedPrefixes: string[]): string {
    const prefix = embeddedPrefixes.length ? `${snakeCase(embeddedPrefixes.join('_'))}_` : '';
    return prefix + (customName || snakeCase(propertyName));
  }

  relationName(propertyName: string): string {
    return snakeCase(propertyName);
  }

  joinColumnName(relationName: string, referencedColumnName: string): string {
    return snakeCase(`${relationName}_${referencedColumnName}`);
  }

  joinTableName(firstTableName: string, secondTableName: string, firstPropertyName: string): string {
    return snakeCase(`${firstTableName}_${firstPropertyName.replace(/\./gi, '_')}_${secondTableName}`);
  }

  joinTableColumnName(tableName: string, propertyName: string, columnName?: string): string {
    return snakeCase(`${tableName}_${columnName || propertyName}`);
  }

  joinTableInverseColumnName(tableName: string, propertyName: string, columnName?: string): string {
    return this.joinTableColumnName(tableName, propertyName, columnName);
  }
}
