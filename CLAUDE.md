# @dating-app/events

Librería compartida de los microservicios NestJS de la app de citas. **No es un servicio**: se publica vía GitHub y se instala como dependencia (`"@dating-app/events": "github:aalvarezb9/-dating-app-events#main"`).

> Punto de entrada del workspace: `../../backend-all-services/CLAUDE.md`. Consumidor principal y referencia de uso: `../../backend-dating-business-owner/CLAUDE.md`.

## Regla de oro

Toda funcionalidad compartida entre servicios **DEBE** vivir aquí. Si dos servicios necesitan lo mismo (config, auth, storage, eventos, guards, repositorios base, cifrado, cliente HTTP inter-servicio), se implementa una vez en esta librería.

## Workflow de cambios (crítico)

Los servicios NO ven los cambios hasta que se publican y reinstalan:

1. Editar aquí y verificar: `npm run build` (compila a `dist/`, que está en `.gitignore`; `prepare` lo regenera al instalar desde GitHub).
2. Commit y push a `main` del repo `aalvarezb9/-dating-app-events`.
3. En cada servicio consumidor: `npm install @dating-app/events@latest` (actualiza el commit fijado en `package-lock.json`).
4. Para correr en Docker (`backend-all-services`): reconstruir la imagen del servicio (`docker-compose build <servicio>`), porque `Dockerfile.dev` hace `npm ci` y el lockfile fija el commit de la librería. El volumen montado solo cubre `src/` del servicio, **no** la librería.

Desarrollo iterativo sin push: `npm run dev` (`tsc --watch`) aquí y enlazar localmente en el servicio (`npm link`) — no commitear ese enlace en el `package.json` del servicio.

**Compatibilidad**: un cambio rompedor afecta a todos los consumidores a la vez. Mantener contratos estables, añadir en lugar de cambiar, y actualizar los servicios afectados en la misma sesión de trabajo.

## Comandos

```bash
npm run build     # tsc -p tsconfig.json → dist/
npm run dev       # tsc --watch
npm test          # jest
```

## Mapa del código (`src/`)

| Carpeta / archivo | Contenido |
|---|---|
| `index.ts` | **Único punto de exportación público.** Todo lo nuevo se exporta aquí (directa o vía `index.ts` de carpeta). |
| `config/` | `SharedConfigService` (lee env con validación), `SharedConfigModule` |
| `auth/` | `AuthService` (contrato abstracto), `SupabaseAuthStrategy`, `SupabaseJwtStrategy`, `AuthModule` (global, factory por `AUTH_PROVIDER`) |
| `storage/` | `FileStorageService` (contrato), `SupabaseStorageStrategy`, `StorageModule` (global, factory por `STORAGE_PROVIDER`) |
| `services/event-publisher.service.ts` | `EventPublisher` — transporte **Kafka** (`publishEvent`) |
| `events.module.ts` | `EventsModule` (global) que provee `EventPublisher` |
| `types/events.ts` | `DomainEventType` (enum), `DomainEvent` y eventos tipados |
| `repositories/base/` | `BaseRepository`, `BaseRepositoryConfig`, `IDatabaseAdapter` |
| `repositories/adapters/` | `PostgresAdapter` (exportado); `DynamoDBAdapter` existe pero **no** se exporta (requiere AWS SDK opcional) |
| `repositories/redis/` | `BaseRedisRepository`, `IRedisAdapter` |
| `decorators/emitable.decorator.ts` | Decorador para emisión de eventos |
| `common/decorators/` | `@Public`, `@Roles`, `@CrossTenant`, `@IncludeDeleted`, `@CurrentUser`, `@CurrentTenant`, `@UseDto`, `@ApiStandardResponse` |
| `common/guards/` | `JwtAuthGuard`, `RolesGuard`, `TenantGuard`, `ApiKeyGuard` |
| `common/interceptors/` | `ExecutionContextInterceptor`, `LoggingInterceptor`, `SanitizeInterceptor`, `ResponseTransformInterceptor` (+ `tenant`/`transform` heredados) |
| `common/filters/` | `AllExceptionsFilter`, `HttpExceptionFilter` |
| `common/context/` | `ExecutionContext` (AsyncLocalStorage: tenantId, userId, flags) |
| `common/dto/`, `interfaces/` | `PaginationDto`, `FilterableQueryDto`, `DateRangeDto`, `ApiResponse<T>` |
| `cache/` | `RedisCacheModule` (cache-manager), `RedisLockManager` (locks TTL) |
| `database/` | `TransactionManager`, `AdvisoryLockManager` (locks `pg_advisory_xact_lock`) |
| `encryption/` | `EncryptionService` (AES-256-GCM, requiere `ENCRYPTION_KEY` ≥ 32 chars), `EncryptionModule` |
| `http-client/` | `BaseServiceClient` + `HttpClientModule` — comunicación HTTP inter-servicio con API key |
| `common/types/auth.types.ts` | `UserRole` (`super_admin`, `business_owner`, `business_staff`, `customer`, `guest`) |

Fuera de `src/`: `examples/` (ejemplos de uso, p. ej. `UserRepository.example.ts`) y `dist/` (build, ignorado por git).

## Diseño y reglas

### Strategy Pattern (auth y storage)
1. **Contratos inmutables**: las clases abstractas (`AuthService`, `FileStorageService`) no cambian de forma incompatible.
2. **Estrategias intercambiables**: cambiar proveedor = cambiar variable de entorno (`AUTH_PROVIDER`, `STORAGE_PROVIDER`; default `supabase`).
3. **Mapeo en la estrategia**: cada estrategia traduce tipos del proveedor a tipos genéricos (`AuthUser`, `AuthSession`, `FileUploadResult`).
4. **Factory centralizado** en `AuthModule` / `StorageModule` (único lugar con el `switch` de proveedores).

Para añadir un proveedor: crear la estrategia en `auth/strategies/` o `storage/strategies/` extendiendo el contrato, añadir el `case` al factory del módulo, documentar las variables nuevas en `SharedConfigService`.

### Configuración
- Los servicios acceden a env **solo** vía `SharedConfigService`; nunca `process.env`.
- Variables requeridas lanzan error si faltan (`getRequired`), sin valores por defecto. Config disponible: `database`, `supabase`, `redis`, `app`, `jwtSecret`, `kafka`, y `get(key)` para opcionales.
- ⚠️ Excepción actual: `kafka.brokers` cae a `['localhost:9092']` y `clientId` a `SERVICE_NAMESPACE || 'backend-service'`. No replicar este patrón.
- Variables que usa la librería: `DATABASE_URL`, `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_JWT_SECRET`, `SUPABASE_STORAGE_URL`, `REDIS_HOST`, `REDIS_PORT`, `REDIS_PASSWORD?`, `PORT`, `NODE_ENV`, `BASE_DOMAIN`, `JWT_SECRET`, `KAFKA_BROKERS`, `SERVICE_NAMESPACE`, `AUTH_PROVIDER?`, `STORAGE_PROVIDER?`, `ENCRYPTION_KEY`.

### Eventos (Kafka)
- `EventPublisher.publishEvent(event, partitionKey?)`: fire-and-forget con productor idempotente y auto-creación de topics. La clave de partición (default `aggregateId`) garantiza orden por entidad.
- La conexión a Kafka es tolerante: si falla al iniciar, el servicio arranca igual y registra el error.
- El nombre del topic es el `eventType`. Nuevos eventos → añadir al enum `DomainEventType` en `types/events.ts` (+ interfaz tipada si lleva datos estructurados) y exportar.
- `BaseRepository` publica eventos automáticamente según `config.events` (ver abajo).
- ⚠️ **Pendiente de publicar**: `PAYMENT_PROOF_UPLOADED` y `PAYMENT_PROOF_REJECTED` (comprobantes de transferencia bancaria, consumidos/emitidos por `business-owner`) ya están en `types/events.ts` de este árbol de trabajo, pero no se han subido a GitHub. Hasta republicar y reinstalar, `business-owner` los referencia con un cast (`appointments/constants/payment-proof.constants.ts`).

### BaseRepository (multi-tenancy automático)
`BaseRepository<DbEntity, DomainEntity>(adapter, eventPublisher, config)`. Los repositorios de los servicios **heredan** de esta clase y solo añaden métodos de dominio.

- **API**: `save`, `create`, `findById`, `findOne`, `findMany(criteria, options)`, `findAll`, `findManyWithPagination(filters, pagination)`, `aggregate({ metrics, groupBy?, filters? })`, `update`, `delete`, `softDelete`, `restore`, `exists`, `count`, `withTransaction(manager)`, `setTenantId`, `getTenantId`.
- **Filtro de tenant** (`addTenantFilter`), en este orden: `@CrossTenant()` → sin filtro; `@Public()` → sin filtro; si no, exige `tenantId` del `ExecutionContext` (o `setTenantId`) y lanza error si falta. El campo se configura con `tenantIdField` (default `tenantId`; p. ej. `businessTenantId`).
- **Soft delete**: activo por defecto (`softDeleteField` default `deletedAt`); `@IncludeDeleted()` lo omite.
- **Eventos** (`config.events`): `publishOnCreate/Update/Delete/SoftDelete/Restore`, `eventTypeOn*`, `eventFilter`, `eventKeyExtractor` (clave de partición), `eventDataExtractor`, `eventMetadata`.
- **Transacciones**: `repo.withTransaction(manager)` devuelve un clon ligado al `EntityManager`. Usar `TransactionManager.run(dataSource, async (manager, registerCleanup) => …)`.
- **Operadores de filtro dinámico** (`findManyWithPagination`, `aggregate`): `$eq $ne $gt $gte $lt $lte $between $in $notIn $like $ilike`. `$gt`/`$lt` son estrictos; un valor que ya es un `FindOperator` de TypeORM se respeta tal cual.
- **`aggregate`** calcula `count/sum/avg/min/max` (opcionalmente agrupado con `groupBy`) en **una sola consulta SQL**, con el mismo filtro de tenant y soft delete. Usarlo para estadísticas en lugar de cargar filas y filtrarlas en memoria: `aggregate({ groupBy: 'status', metrics: { total: { fn: 'count' }, revenue: { fn: 'sum', field: 'price' } } })` → `[{ group, total, revenue }]`. Nombres de métrica, campos y `groupBy` se validan (solo identificadores seguros).
- Para bypass de tenant NO existe un parámetro en `exists`/`find*`: se controla con decoradores (`@CrossTenant`/`@Public`).

### Seguridad de logs, JWT y cifrado
- `LoggingInterceptor` registra el cuerpo de cada petición **ya redactado** (`redactSensitive`, exportado): contraseñas, tokens, números de cuenta/ruta/tarjeta, `taxId` e `identityNumber` salen como `[REDACTED]`; se trunca a 2000 caracteres. Úsalo también en cualquier log propio de payloads.
- `SupabaseJwtStrategy` comprueba que el usuario sigue existiendo en Supabase **como máximo una vez por minuto por usuario** (caché en memoria); los fallos nunca se cachean. Un usuario borrado en Supabase puede seguir actuando hasta 60 s.
- `EncryptionService` escribe el formato `v2:salt:iv:authTag:data` (clave derivada con scrypt y **salt aleatorio por mensaje**) y sigue leyendo el formato anterior `iv:authTag:data` (salt fijo), de modo que los datos ya guardados siguen descifrando.

### Contexto de ejecución
`ExecutionContextInterceptor` (registrado en `main.ts` con `app.useGlobalInterceptors`, **antes** de los guards) puebla `ExecutionContext` (AsyncLocalStorage) con `tenantId`, `userId`, `userEmail`, `userRoles`, `isPublic`, `isCrossTenant`, `includeDeleted`. `BaseRepository` lo lee desde cualquier capa.

### Concurrencia
- `AdvisoryLockManager.runWithLocks(dataSource, [{resourceType, resourceId}], cb)`: locks de PostgreSQL ligados a la transacción (clave por hash FNV-1a).
- `RedisLockManager`: locks con TTL en Redis (reservas de slots).

### Cliente HTTP inter-servicio
Extender `BaseServiceClient` (baseURL, `apiKey`, `serviceName`, timeout); métodos `get/post/patch/…` con autenticación por API key. Ver `AuthServiceClient` en business-owner como ejemplo.

## Convenciones al contribuir

- Código, identificadores y comentarios en inglés; documentación (CLAUDE.md, READMEs) en español.
- Todo export público pasa por `index.ts`. No exportar `DynamoDBAdapter` salvo decisión explícita (arrastra dependencias AWS opcionales).
- Dependencias de Nest/TypeORM/Supabase son `peerDependencies`: no añadirlas como `dependencies`.
- Mantener `peerDependenciesMeta` de AWS como opcionales.

## Deuda conocida

- `auth/supabase-jwt.strategy.ts` y `auth/strategies/supabase-jwt.strategy.ts` coexisten (duplicado histórico); el `AuthModule` usa el de `strategies/`.
- `common/interceptors/tenant.interceptor.ts` y `transform.interceptor.ts` son heredados; los servicios usan `ExecutionContextInterceptor` y `ResponseTransformInterceptor`.
- La versión en `package.json` (2.0.0) no se incrementa en cada cambio; los servicios fijan por commit de GitHub.
