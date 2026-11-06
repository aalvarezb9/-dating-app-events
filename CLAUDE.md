# @dating-app/events

Librería compartida de los microservicios NestJS de la app de citas. **No es un servicio**: se publica vía GitHub y se instala como dependencia (`"@dating-app/events": "github:aalvarezb9/-dating-app-events#main"`).

> **Los agentes y desarrolladores deben conocer esta librería antes de escribir código en cualquier servicio**: el catálogo "qué hace cada archivo y cuándo usarlo" está más abajo. Punto de entrada del workspace: `../../backend-all-services/CLAUDE.md`. Consumidor principal y referencia de uso: `../../backend-dating-business-owner/CLAUDE.md`.

## Regla de oro

Toda funcionalidad compartida entre servicios **DEBE** vivir aquí. Si dos servicios necesitan lo mismo (config, auth, storage, eventos, guards, repositorios base, cifrado, cliente HTTP inter-servicio), se implementa una vez en esta librería.

## Workflow de cambios (crítico)

Los servicios NO ven los cambios hasta que se publican y reinstalan:

1. Editar aquí y verificar: `npm run build` (compila a `dist/`, que está en `.gitignore`; `prepare` lo regenera al instalar desde GitHub).
2. Commit y push a `main` del repo `aalvarezb9/-dating-app-events`.
3. En cada servicio consumidor: `npm install @dating-app/events --legacy-peer-deps` (actualiza el commit fijado en `package-lock.json`).
4. Para correr en Docker (`backend-all-services`): reconstruir la imagen del servicio (`docker-compose build <servicio>`), porque `Dockerfile.dev` hace `npm ci` y el lockfile fija el commit de la librería. El volumen montado solo cubre `src/` del servicio, **no** la librería.

Desarrollo iterativo sin push: `npm run dev` (`tsc --watch`) aquí y enlazar localmente en el servicio (`npm link`) — no commitear ese enlace en el `package.json` del servicio.

**Compatibilidad**: un cambio rompedor afecta a todos los consumidores a la vez. Mantener contratos estables, añadir en lugar de cambiar, y actualizar los servicios afectados en la misma sesión de trabajo.

## Comandos

```bash
npm run build     # tsc -p tsconfig.json → dist/
npm run dev       # tsc --watch
npm test          # jest
```

## Catálogo de la librería: qué hace cada archivo y cuándo usarlo

> **Antes de escribir código en un servicio, busca aquí si ya existe.** Todo se importa desde `@dating-app/events` (único punto público: `src/index.ts`). Rutas relativas a `src/`.

### Árbol de decisión rápido

| Necesito… | Usar | Archivo |
|---|---|---|
| Leer una variable de entorno | `SharedConfigService` | `config/env.config.ts` |
| Acceso a datos con filtro de tenant y soft delete automáticos | Heredar de `BaseRepository` | `repositories/base/BaseRepository.ts` |
| Recibir un archivo que sube el cliente (comprobante, imagen) | `assertValidUpload` + `SINGLE_FILE_UPLOAD_OPTIONS` (tipo por contenido, tope de tamaño), luego `FileStorageService` | `files/` |
| Publicar un evento sin que se pierda aunque Kafka falle | `OutboxService.enqueue(manager, evento)` (misma transacción que el cambio) | `outbox/` |
| Mantener una copia local de datos de otro servicio | `ProjectedEntity` + `applyProjection` + `syncSnapshot` | `projections/` |
| Exponer un endpoint solo para otros servicios | `@InternalApi()` (+ `readSnapshotPage` para snapshots) | `common/decorators/`, `projections/snapshot.ts` |
| Declarar una tabla (columnas de auditoría, tenant, prefijo del servicio) | `@Entity` + `TenantEntity` / `GlobalEntity` | `database/entities/` |
| Contar / sumar / agrupar (estadísticas) | `repo.aggregate(...)` | `repositories/base/BaseRepository.ts` |
| Listado paginado con filtros dinámicos | `repo.findManyWithPagination(...)` + `PaginationDto`/`FilterableQueryDto` | `BaseRepository.ts`, `common/dto/` |
| El tenant / usuario actual dentro de un service | `ExecutionContext` (o `@CurrentTenant()`/`@CurrentUser()` en el controller) | `common/context/`, `common/decorators/` |
| Trabajar con un tenant fuera de HTTP (consumer, cron, cola) | `ExecutionContext.run({ tenantId }, cb)` | `common/context/execution-context.service.ts` |
| Publicar un evento a otros servicios | `EventPublisher.publishEvent` | `services/event-publisher.service.ts` |
| Declarar un tipo de evento nuevo | Añadir a `DomainEventType` | `types/events.ts` |
| Evitar que dos peticiones reserven lo mismo (PostgreSQL) | `AdvisoryLockManager` | `database/advisory-lock-manager.ts` |
| Retener un recurso con caducidad (reserva temporal) | `RedisLockManager` | `cache/redis-lock-manager.ts` |
| Varias escrituras atómicas (con limpieza si falla) | `TransactionManager` | `database/transaction-manager.ts` |
| Subir/borrar/firmar archivos | `FileStorageService` | `storage/` |
| Registrar, loguear o gestionar usuarios | `AuthService` (solo el servicio de auth debe dar altas) | `auth/` |
| Llamar a otro microservicio por HTTP | Extender `BaseServiceClient` | `http-client/base-service-client.ts` |
| Cifrar un dato sensible en BD | `EncryptionService` | `encryption/encryption.service.ts` |
| Que un log no muestre contraseñas/cuentas | `redactSensitive` | `common/utils/redact.ts` |
| Proteger un endpoint | `@Roles`, `@Public`, `@CrossTenant` + guards | `common/decorators/`, `common/guards/` |
| Validar monedas | `VALID_CURRENCIES`, `isValidCurrency` | `common/constants/currencies.ts` |

Si lo que necesitas **no** está en la tabla y lo usarán ≥ 2 servicios, va en esta librería; si es de un solo servicio, va en el servicio.

### Configuración (`config/`)

| Archivo | Qué hace | Úsalo cuando |
|---|---|---|
| `env.config.ts` | `SharedConfigService`: lee y **valida** las variables de entorno y las expone tipadas (`database`, `supabase`, `redis`, `app`, `jwtSecret`, `kafka`, `get(key)` para opcionales). Falla al arrancar si falta una requerida | Siempre que un servicio necesite configuración. Nunca `process.env` |
| `shared-config.module.ts` | `SharedConfigModule` (global): provee `SharedConfigService` | Importarlo una vez en el `AppModule` |

### Autenticación (`auth/`)

| Archivo | Qué hace | Úsalo cuando |
|---|---|---|
| `auth-service.interface.ts` | Contrato abstracto `AuthService` (`signUp`, `signIn`, `updateUserMetadata`, `refreshToken`, `signOut`, `getUserById`, `sendPasswordResetEmail`, `updatePassword`, `verifyUserEmail`, `deleteUser`, `setUserBanned`) y tipos genéricos `AuthUser`, `AuthSession`, `SignUpResult`… | Para inyectar autenticación sin depender del proveedor. Solo el **auth service** debe crear usuarios; el resto usa `AuthServiceClient` por HTTP |
| `strategies/supabase-auth.strategy.ts` | Implementación del contrato sobre Supabase Auth (GoTrue); mapea tipos de Supabase a los genéricos | No se importa directo: la elige `AuthModule` según `AUTH_PROVIDER` |
| `strategies/supabase-jwt.strategy.ts` | Estrategia Passport `supabase-jwt`: valida el JWT, construye el usuario (`tenantId`, `tenantType`, rol…) y comprueba que sigue existiendo en Supabase (caché de 60 s). **Rechaza con 403 (`account.error.tenant_<estado>`) el token de un tenant bloqueado** (ver `tenant-block.ts`), en cada petición y sin esperar a que el token venza | Automática al usar `JwtAuthGuard` |
| `tenant-block.ts` | `blockTenant` / `unblockTenant` / `tenantBlockedWith`: bandera `tenant-blocked:<id>` en el Redis compartido (24 h; auth la renueva cada pocos minutos mientras el tenant no esté activo, así sobrevive a un reinicio de Redis). Si Redis no responde, la comprobación se omite (con aviso): perder la caché no tumba los servicios | Solo **auth** escribe la bandera (al pasar un tenant a `suspended`/`rejected`/`pending`); todos los demás la leen sin hacer nada, a través de la estrategia JWT |
| `auth.module.ts` | `AuthModule` (global): factory que provee `AuthService` y la estrategia JWT | Importarlo en servicios que autentican o validan JWT |
| `supabase-auth.service.ts`, `supabase-jwt.strategy.ts` (raíz de `auth/`) | **Duplicados históricos** de los anteriores; no se usan | No usar; ver "Deuda conocida" |

### Almacenamiento (`storage/`)

| Archivo | Qué hace | Úsalo cuando |
|---|---|---|
| `file-storage.interface.ts` | Contrato `FileStorageService`: `uploadFile`, `deleteFile(s)`, `getPublicUrl`, `getSignedUrl`, `listFiles` | Para guardar/servir archivos. Buckets públicos → `getPublicUrl`; privados (p. ej. `payment-proofs`) → `getSignedUrl` |
| `strategies/supabase-storage.strategy.ts` | Implementación sobre Supabase Storage (MinIO en local); también `extractPathFromUrl` | La elige `StorageModule` según `STORAGE_PROVIDER` |
| `storage.module.ts` | `StorageModule` (global) con factory del proveedor | Importarlo en servicios que manejan archivos |

### Eventos (`services/`, `types/`, `decorators/`, `events.module.ts`)

| Archivo | Qué hace | Úsalo cuando |
|---|---|---|
| `types/events.ts` | Enum `DomainEventType` (usuarios, negocios, citas, pagos —incluye `PAYMENT_PROOF_UPLOADED/REJECTED`—, reseñas, suscripciones), interfaz base `DomainEvent` y eventos tipados | Para nombrar cualquier evento entre servicios. Eventos nuevos se declaran aquí |
| `services/event-publisher.service.ts` | `EventPublisher`: productor Kafka idempotente; `publishEvent(event, partitionKey?)` (fire-and-forget), `publishEventsBatch`, `publishToTopic`, `publishEventAndQueue`, `isClientConnected`. El topic es el `eventType` | Para emitir un hecho de dominio. La clave de partición (tenantId / id del agregado) preserva el orden |
| `events.module.ts` | `EventsModule` (global): provee `EventPublisher` | Importarlo en servicios que publican |
| `decorators/emitable.decorator.ts` | `@Emitable`/`@EventField`: marca entidades y campos que viajan en un evento | Mecanismo antiguo; para eventos de repositorio prefiere `config.events` de `BaseRepository` |

### Repositorios (`repositories/`)

| Archivo | Qué hace | Úsalo cuando |
|---|---|---|
| `base/BaseRepository.ts` | Repositorio genérico: CRUD, `findMany`, `findManyWithPagination`, `aggregate`, `update`, `delete`, `softDelete`, `restore`, `exists`, `count`, `withTransaction`. **Filtra por tenant y soft delete automáticamente** (a menos que el endpoint sea `@CrossTenant`/`@Public`) y publica eventos de repositorio según `config.events` | Es la base de **todo** repositorio de negocio. Estadísticas → `aggregate`; listados → `findManyWithPagination` (nunca cargar todo y filtrar en memoria) |
| `base/BaseRepositoryConfig.ts` | Configuración del repositorio: `tenantIdField`, `softDeleteField`, mapeos entidad↔dominio, `events` (`publishOnCreate/Update…`, `eventTypeOn*`, `eventKeyExtractor`, `eventDataExtractor`) | Al declarar un repositorio nuevo |
| `base/IDatabaseAdapter.ts` | Contrato de adaptador de BD (`FindCriteria`, `FindOptions`, `DatabaseType`) | Solo si añades un motor de BD |
| `adapters/PostgresAdapter.ts` | Adaptador TypeORM/PostgreSQL | Se pasa a `BaseRepository` en el constructor de cada repositorio |
| `adapters/DynamoDBAdapter.ts` | Adaptador DynamoDB (no exportado; requiere AWS SDK opcional) | No usar |
| `event-emitting.repository.ts` | `EventEmittingRepository`: envoltorio antiguo de repositorio TypeORM que acumula eventos pendientes | Legado; preferir `BaseRepository` |
| `redis/BaseRedisRepository.ts`, `redis/IRedisAdapter.ts` | Repositorio base y contrato para datos en Redis (`get/set/delete/exists/setWithExpiration/getTTL`) | Estado efímero con TTL guardado como entidad (p. ej. reservas de slot) |

### Concurrencia y transacciones (`database/`, `cache/`)

| Archivo | Qué hace | Úsalo cuando |
|---|---|---|
| `database/advisory-lock-manager.ts` | `AdvisoryLockManager.runWithLock/runWithLocks(dataSource, claves, callback)`: advisory locks de PostgreSQL ligados a una transacción (el nivel de aislamiento viaja con el `BEGIN`; un fallo del rollback no tapa el error original); entrega el `EntityManager` a usar | "Comprobar + insertar" que no debe ejecutarse a la vez (citas, reseñas, subdominios). **Las tablas de citas exigen el lock compartido** (ver CLAUDE.md del orquestador). Dentro del callback usa el `manager` entregado |
| `database/transaction-manager.ts` | `TransactionManager.run/runSimple`: transacción con callbacks de limpieza (`registerCleanup`) si hace rollback | Varias escrituras que deben ser atómicas o con efectos a deshacer |
| `cache/redis-lock-manager.ts` | `RedisLockManager`: `acquireLock/releaseLock/isLocked/getLockValue/extendLock` con TTL | Retener un recurso un tiempo (slot reservado a la espera de pago); no sustituye al advisory lock |
| `cache/redis-cache.module.ts` | `RedisCacheModule.forRoot()`: cache-manager v6 sobre Redis mediante Keyv (`@keyv/redis`, sin namespace: las claves se guardan tal cual). Los consumidores necesitan `@keyv/redis` y `keyv` instalados | Cache compartida y base de `RedisLockManager` |

### HTTP: contexto, decoradores, guards, interceptors, filtros (`common/`)

| Archivo | Qué hace | Úsalo cuando |
|---|---|---|
| `context/execution-context.service.ts` | `ExecutionContext` (AsyncLocalStorage): `tenantId`, `userId`, `userEmail`, `userRoles`, `requestId`, flags `isPublic/isCrossTenant/includeDeleted`; `run(ctx, cb)`, `getTenantId()`… | Leer el tenant en cualquier capa; **abrirlo a mano en consumers, crons y colas** (`run({ tenantId }, cb)`). Nunca `repo.setTenantId` |
| `interceptors/execution-context.interceptor.ts` | Puebla el `ExecutionContext` por petición HTTP desde el JWT y los metadatos de los decoradores | Registrarlo globalmente en `main.ts` antes de los guards |
| `interceptors/sanitize.interceptor.ts` | Elimina HTML/XSS de `body`, `query` y `params` (recursivo) | Registro global en todo servicio con entrada de usuario |
| `interceptors/logging.interceptor.ts` | Log de petición/respuesta con el cuerpo **redactado** y truncado | Registro global |
| `interceptors/response-transform.interceptor.ts` | Envuelve la respuesta en `{ success, data, timestamp }` y aplica `@UseDto` | Registro global |
| `interceptors/tenant.interceptor.ts`, `transform.interceptor.ts` | Versiones heredadas | No usar en código nuevo |
| `guards/jwt-auth.guard.ts` | Exige JWT válido (`supabase-jwt`), salvo rutas `@Public()` | Guard global de los servicios con usuarios |
| `guards/roles.guard.ts` | Comprueba el rol del JWT contra `@Roles(...)`. **Falla cerrado**: una ruta privada sin `@Roles` responde 403 (`@Public()` y `@InternalApi()` quedan fuera) | Guard global junto al anterior |
| `guards/tenant.guard.ts` | Exige `tenantId` y tipo de tenant "negocio" | Rutas solo para negocios |
| `guards/api-key.guard.ts` | Valida `x-api-key` (comparación en tiempo constante) + `x-service-name` (llamadas entre servicios) | Endpoints internos consumidos por otros microservicios, no por la UI |
| `decorators/roles.decorator.ts` | `@Roles(UserRole…)` | Todo endpoint privado |
| `decorators/public.decorator.ts` | `@Public()`: sin JWT y sin filtro de tenant | Endpoints públicos (health, registro). **Nunca en business-owner** salvo `/health` |
| `decorators/cross-tenant.decorator.ts` | `@CrossTenant()`: desactiva el filtro de tenant | Solo cuando la unicidad o consulta es global (subdominios) y justificado |
| `decorators/include-deleted.decorator.ts` | `@IncludeDeleted()`: incluye filas con soft delete | Papelera / auditoría |
| `decorators/current-user.decorator.ts`, `current-tenant.decorator.ts` | Inyectan `ICurrentUser` / `tenantId` del request en el controller | En vez de leer `req.user` |
| `decorators/use-dto.decorator.ts` | `@UseDto(Dto)`: el interceptor transforma la respuesta a ese DTO | Todo endpoint con respuesta tipada |
| `decorators/api-standard-response.decorator.ts` | `@ApiStandardResponse(Dto, { status, isArray?, isPaginated? })`: documenta la respuesta en Swagger | Todo endpoint (en vez de `@ApiResponse`) |
| `dto/pagination.dto.ts` | `PaginationDto` (`page`, `limit`, orden), `PaginatedResult<T>`, `createPaginatedResult` | Query y resultado de listados paginados |
| `dto/filterable-query.dto.ts` | `FilterableQueryDto`, `DynamicFilters`, operadores (`$gte`, `$in`, `$like`…) | Filtros dinámicos traducidos por `BaseRepository` |
| `dto/date-range.dto.ts`, `dto/base-response.dto.ts` | Rango de fechas validado; respuesta base `success/error` | Filtros por fechas; respuestas simples |
| `interfaces/api-response.interface.ts` | `ApiResponse<T>`, `PaginatedResponse<T>` | Tipar respuestas |
| `filters/all-exceptions.filter.ts`, `http-exception.filter.ts` | Convierten excepciones en respuestas JSON uniformes | Filtro global en `main.ts` |
| `types/auth.types.ts` | `UserRole` (`super_admin`, `business_owner`, `business_staff`, `customer`, `guest`) y `TenantType` | Cualquier chequeo de rol/tipo |
| `constants/currencies.ts` | `VALID_CURRENCIES` (`HNL`, `USD`), `isValidCurrency` | Validar monedas |
| `utils/redact.ts` | `redactSensitive`, `REDACTED`: enmascara contraseñas, tokens, cuentas, tarjetas…; `redactUrl`: enmascara el token del link de una cita en rutas (`/links/<token>`, `/access-links/<token>`). Lo usan el log de peticiones, los filtros de excepciones y `BaseServiceClient` | Cualquier log propio de un payload o de una URL |

### Entidades base y nombres de tabla (`database/entities/`)

| Archivo | Qué hace | Úsalo cuando |
|---|---|---|
| `entity-scope.ts` | Marca estática heredada (`ENTITY_SCOPE`): `'tenant'` o `'global'`; `getEntityScope`, `isMultiTenantEntity` | Lo leen `@Entity`, `BaseRepository` y el subscriber; rara vez directo |
| `base-entities.ts` | `AuditedEntity` (`created_at`, `modified_at`, `created_by`, `modified_by`), `TenantEntity` (+ `tenant_id` obligatorio, indexado e inmutable; es la **clave de partición** de la tabla) y `GlobalEntity` (sin tenant) | **Toda entidad nueva hereda de `TenantEntity` (casi siempre) o de `GlobalEntity`** (infraestructura como el outbox o catálogos de plataforma) |
| `entity.decorator.ts` | `@Entity(name)` (sustituye al de TypeORM; **falla al arrancar** si la clase no hereda de ninguna de las dos bases) y `@TenantIndex([...cols])` (índice que antepone `tenant_id`) | En cada entidad: `@Entity('services') export class Service extends TenantEntity` |
| `audit.subscriber.ts` | `AuditModule` + `AuditSubscriber`: al insertar rellena `created_by`/`modified_by` y `tenant_id` (del `ExecutionContext`); al actualizar, `modified_by`. Importar `AuditModule` en el `AppModule` después de `TypeOrmModule` | Siempre que el servicio use las bases |
| `audit-actor.ts` | `AuditActor` y `auditFields()`: usuario actual o `system:<SERVICE_NAMESPACE>` en consumers, crons y colas | **En escrituras con query builder** (p. ej. compare-and-set), que no disparan el subscriber: `.set({ ...cambios, ...auditFields() })` |
| `service-naming.strategy.ts` | `ServiceNamingStrategy(namespace)`: prefija **cada tabla** con `SERVICE_NAMESPACE` (`bo_services`) y pone `snake_case` a columnas. `isValidServiceNamespace` | En `TypeOrmModule.forRootAsync`: `namingStrategy: new ServiceNamingStrategy(config.serviceNamespace)` |

`BaseRepository` deduce el aislamiento de la herencia: entidad `TenantEntity` → filtra por `tenantId` e inyecta el tenant al crear; `GlobalEntity` → nunca filtra. Las entidades antiguas (que no heredan de las bases) siguen funcionando con `tenantIdField`.

**`SERVICE_NAMESPACE`** es ahora una **abreviatura** (2–6 minúsculas: `bo`, `sch`, `usr`, `auth`, `adm`, `ntf`; `SharedConfigService.serviceNamespace` la valida) y es el prefijo de las tablas y el actor de las escrituras del sistema. El nombre largo del servicio va en **`SERVICE_NAME`** (`SharedConfigService.serviceName`), usado como `clientId` de Kafka y `source` de los eventos. Transitorio: mientras un servicio no defina `SERVICE_NAME`, `serviceName` cae a `SERVICE_NAMESPACE`.

### Contratos entre servicios, outbox y proyecciones

| Archivo | Qué hace | Úsalo cuando |
|---|---|---|
| `contracts/catalog.contracts.ts` | Payloads (`event.data`) de `SERVICE_/TEAM_MEMBER_/BUSINESS_PROFILE_UPSERTED`, `*_DELETED`, `LANDING_PAGE_UPSERTED`, `REVIEW_UPSERTED`; base `ProjectionPayload` (`id`, `tenantId`, `sourceVersion`). El horario semanal (`WeeklyHoursContract`) admite `breaks` por día; el perfil lleva `closures` (festivos y vacaciones del negocio) y el miembro `timeOff` (`DateRangeContract`: fechas locales `YYYY-MM-DD`, extremos incluidos); `TeamMemberContract.userId` es `null` salvo el del dueño cuando atiende (los miembros no tienen login). Nivel *interno*: nunca banco, documentos legales ni facturación | Emitir o consumir datos de catálogo de business-owner. Solo se **añaden** campos |
| `contracts/appointment-request.contract.ts` | `AppointmentRequestCreatedData` (evento v2: solicitud completa, con precio/duración copiados) y `AppointmentRequestRejectedData` | Emitir (business-owner, users) o consumir (schedule) una solicitud de cita |
| `contracts/appointment-access-link.contract.ts` | `AppointmentAccessLinkIssuedData` (`APPOINTMENT_ACCESS_LINK_ISSUED`): el link de una cita (`https://<subdomain>.<BASE_DOMAIN>/<token>`) con el token en claro y los datos para el correo; solo viaja aquí, schedule guarda su hash | Emitir (schedule) o consumir (notifications) el aviso con el link de una cita |
| `contracts/email-verification.contract.ts` | `EmailVerificationRequestedData` (`EMAIL_VERIFICATION_REQUESTED`: el token en claro para el correo de confirmación; auth guarda solo su hash) y `EmailVerifiedData` (`EMAIL_VERIFIED`: el email, en minúsculas, ya es de esa persona) | Emitir (auth) o consumir (notifications el primero; schedule el segundo para vincular citas de invitado) |
| `scheduling/availability.ts` + `scheduling/local-time.ts` | `findAvailabilityViolation(check)`: **la** regla de la agenda (cierres, horario del día, descansos, ventana del servicio, agenda y ausencias del miembro) como función pura que devuelve el motivo (`BUSINESS_CLOSED`, `DURING_BREAK`, `MEMBER_ON_TIME_OFF`…) o `null`; y los helpers de hora local por zona IANA (`getLocalTimeParts`, `timeToMinutes`, `isValidTimeZone`) | business-owner (respuesta rápida al dueño) y schedule (la que cuenta) la usan **las dos**, cada una convirtiendo el motivo a su clave de error; no la copies en otro servicio |
| `contracts/tenant-status.contract.ts` | `TenantStatusChangedData` (`BUSINESS_REQUEST_APPROVED`, `BUSINESS_REQUEST_REJECTED`, `BUSINESS_SUSPENDED`, `BUSINESS_REACTIVATED`): el cambio de estado de un tenant, con el dueño y el motivo | Emitir (auth) o consumir (notifications) el aviso al dueño |
| `contracts/appointment-reminder.contract.ts` | `AppointmentReminderData` (`APPOINTMENT_REMINDER`): una cita confirmada está por empezar, con los datos del cliente para el correo | Emitir (schedule) o consumir (notifications) el recordatorio |
| `contracts/event-builders.ts` | `projectionEvent(...)` arma el `DomainEvent` (id de fila = `aggregateId`, orden por partición); `sourceVersionOf(row)` = `modified_at` en ms | Al construir cualquier `*_UPSERTED`/`*_DELETED` |
| `outbox/outbox-event.entity.ts` | Tabla `<ns>_outbox_events` (`GlobalEntity`): evento serializado, `status` (`pending`/`published`/`failed`), intentos | Añadir `...OUTBOX_ENTITIES` a las entidades de TypeORM del servicio |
| `outbox/outbox.service.ts` | `enqueue(manager, evento, clave?)`: inserta el evento **en la misma transacción** que el cambio | Siempre que un cambio deba anunciarse a otros servicios (en lugar de `publishEvent` tras el commit, que puede perderse) |
| `outbox/outbox-relay.service.ts` | `OutboxRelay`: publica a Kafka en orden, un relevo activo por servicio (advisory lock), reintenta y aparca tras `maxAttempts` (al aparcar un evento registra un `error` explícito: es la línea para una alerta); limpia lo publicado; con `redact` **borra los secretos** (`data.token`…) de los eventos entregados o aparcados pasados `OUTBOX_REDACT_AFTER_SECONDS` (obligatoria si se usa `redact`), para que la tabla nunca guarde credenciales | Arranca solo con `OutboxModule.forRoot()`; `drain()` permite forzar un envío; `redactNow()` forzar el borrado de secretos |
| `outbox/outbox-admin.controller.ts` | `GET /internal/v1/outbox/status` (conteo por estado, edad del más antiguo pendiente y eventos **aparcados**, sin payloads) y `POST /internal/v1/outbox/retry-failed` (devuelve los aparcados a la cola, en orden). `@InternalApi()` (API key), fuera del gateway | Lo registra `OutboxModule.forRoot()`; úsalo para una alerta o para reintentar tras arreglar Kafka o un consumidor |
| `outbox/outbox.module.ts` | `OutboxModule.forRoot({ enabled, pollIntervalMs, batchSize, maxAttempts, retentionDays, redact })` | Importarlo en el `AppModule` (requiere `EventsModule`, `SharedConfigModule` y TypeORM). Con `redact: { EVENTO: ['data.token'] }` para eventos que llevan un secreto |
| `projections/projected-entity.ts` | `ProjectedEntity` (`TenantEntity` + `source_version` + `deleted_at`): base de una **copia local de solo lectura** de una fila ajena; la PK usa el mismo id que el dueño | Tabla de proyección en el consumidor (`@PrimaryColumn('uuid') id` + las columnas que necesite) |
| `projections/apply-projection.ts` | `applyProjection(manager, Entidad, payload, { deleted? })`: upsert **idempotente y ordenado por versión**, con lápidas; no emite eventos | En el consumer de cada `*_UPSERTED`/`*_DELETED` y al sincronizar snapshots (dentro de transacción y de `ExecutionContext.run({ tenantId })`) |
| `projections/snapshot.ts` | Dueño: `readSnapshotPage(repo, { updatedSince, cursor, limit, where })` (paginación por `(modified_at, id)` comparada a precisión de **milisegundos**: Postgres guarda microsegundos pero el cursor viaja como `Date`, y sin recortar la última fila de cada página se repetía; incluye borrados). Consumidor: `syncSnapshot(fetchPage, apply)` | Arranque con tabla vacía y reconciliación periódica de una proyección |
| `common/decorators/internal-api.decorator.ts` + `common/guards/internal-api-key.guard.ts` | `@InternalApi()`: sin JWT pero **exige** `X-API-Key` (`INTER_SERVICE_API_KEY`, comparación en tiempo constante; falla si no está configurada) y es cross-tenant. `JwtAuthGuard` lo deja pasar | Endpoints `/internal/v1/*` llamados solo por otros servicios; nunca en el gateway. **No es `@Public()`** (el `ApiKeyGuard` antiguo sí se salta con `@Public()`) |
| `services/event-publisher.service.ts` | Nuevo `publishEventOrThrow`: como `publishEvent` pero **lanza** si Kafka no lo entregó | Lo usa el relevo del outbox; el resto sigue con `publishEvent` (fire-and-forget) |

Eventos nuevos en `DomainEventType`: `SERVICE_UPSERTED/DELETED`, `TEAM_MEMBER_UPSERTED/DELETED`, `BUSINESS_PROFILE_UPSERTED`, `LANDING_PAGE_UPSERTED`, `REVIEW_UPSERTED`, `APPOINTMENT_REQUEST_CREATED`, `APPOINTMENT_REQUEST_REJECTED` (los dos últimos antes se usaban como strings). `BUSINESS_PROFILE_UPDATED` queda como legado. También: `EMAIL_VERIFICATION_REQUESTED`/`EMAIL_VERIFIED` (auth) y `APPOINTMENT_STARTED`/`APPOINTMENT_NO_SHOW` (schedule, al pasar la cita a `in_progress`/`no_show`; mismo payload que `APPOINTMENT_CONFIRMED`).

### Otros módulos

| Archivo | Qué hace | Úsalo cuando |
|---|---|---|
| `encryption/encryption.service.ts` | `EncryptionService.encrypt/decrypt`: AES-256-GCM, clave derivada con scrypt y sal aleatoria (`v2:`), lee el formato antiguo | Datos sensibles en BD (cuentas bancarias). Requiere `ENCRYPTION_KEY` ≥ 32 caracteres |
| `encryption/encryption.module.ts` | `EncryptionModule` | Importarlo donde se cifra |
| `files/file-upload.ts` | Subidas seguras: `SINGLE_FILE_UPLOAD_OPTIONS` (multer corta lo que pase de 5 MB mientras llega), `assertValidUpload(file, tiposPermitidos)` (el tipo se detecta por los **bytes** del archivo, no por lo que dice el cliente; devuelve `{ mimeType, extension }`), `generateStorageFileName(ext)` (nombre generado por el servidor, nunca el del cliente) y los conjuntos `PAYMENT_PROOF_TYPES`, `HERO_IMAGE_TYPES`, `GALLERY_IMAGE_TYPES` | Cualquier endpoint que reciba un archivo (`@UseInterceptors(FileInterceptor('file', SINGLE_FILE_UPLOAD_OPTIONS))`); luego `FileStorageService.uploadFile` |
| `files/file-upload.constants.ts` | `MAX_FILE_SIZE_BYTES` (5 MB) y `UPLOAD_ERRORS` (claves i18n `validation.error.file_required|file_size_exceeded|invalid_file_type`, iguales en todos los servicios) | Al traducir o probar los errores de una subida |
| `http-client/base-service-client.ts` | `BaseServiceClient`: cliente Axios con API key, timeout y manejo de errores (`get/post/patch/put/delete`); un error HTTP del servicio remoto se relanza con su mismo estado (400/401/403/404/409 como excepciones de Nest) para que el llamador distinga un 404 de un fallo | Una clase por servicio remoto (`AuthServiceClient`) |
| `http-client/http-client.module.ts` | `HttpClientModule` | Importarlo donde hay clientes HTTP |
| `index.ts` | Reexporta lo público | Todo export nuevo pasa por aquí |

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
- Variables que usa la librería: `DATABASE_URL`, `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_JWT_SECRET`, `SUPABASE_STORAGE_URL`, `REDIS_HOST`, `REDIS_PORT`, `REDIS_PASSWORD?`, `PORT`, `NODE_ENV`, `BASE_DOMAIN`, `JWT_SECRET`, `KAFKA_BROKERS`, `SERVICE_NAMESPACE` (abreviatura, prefijo de tablas), `SERVICE_NAME` (nombre completo), `AUTH_PROVIDER?`, `STORAGE_PROVIDER?`, `ENCRYPTION_KEY`.

### Eventos (Kafka)
- `EventPublisher.publishEvent(event, partitionKey?)`: fire-and-forget con productor idempotente y auto-creación de topics. La clave de partición (default `aggregateId`) garantiza orden por entidad.
- La conexión a Kafka es tolerante: si falla al iniciar, el servicio arranca igual y registra el error.
- El nombre del topic es el `eventType`. Nuevos eventos → añadir al enum `DomainEventType` en `types/events.ts` (+ interfaz tipada si lleva datos estructurados) y exportar.
- `BaseRepository` publica eventos automáticamente según `config.events` (ver abajo).
- `PAYMENT_PROOF_UPLOADED` y `PAYMENT_PROOF_REJECTED` (comprobantes de transferencia bancaria, consumidos/emitidos por `business-owner`) ya están publicados en `main`.

### BaseRepository (multi-tenancy automático)
`BaseRepository<DbEntity, DomainEntity>(adapter, eventPublisher, config)`. Los repositorios de los servicios **heredan** de esta clase y solo añaden métodos de dominio.

- **API**: `save`, `create`, `findById`, `findOne`, `findMany(criteria, options)`, `findAll`, `findManyWithPagination(filters, pagination)`, `aggregate({ metrics, groupBy?, filters? })`, `update`, `delete`, `softDelete`, `restore`, `exists`, `count`, `withTransaction(manager)`, `setTenantId`, `getTenantId`.
- **Filtro de tenant** (`addTenantFilter`), en este orden: `@CrossTenant()` → sin filtro; `@Public()` → sin filtro; si no, exige `tenantId` del `ExecutionContext` (o `setTenantId`) y lanza error si falta. El campo se configura con `tenantIdField` (default `tenantId`; p. ej. `businessTenantId`).
- **Soft delete**: activo por defecto (`softDeleteField` default `deletedAt`); `@IncludeDeleted()` lo omite. `softDelete`/`delete` anuncian el evento de borrado (`publishOnSoftDelete`, `eventTypeOnSoftDelete`) con la fila **tal como era, marcada como borrada**: los adaptadores ocultan las filas borradas, así que no se puede releer después de borrar (así llegan las lápidas `*_DELETED` a quien guarda una copia).
- **Eventos** (`config.events`): `publishOnCreate/Update/Delete/SoftDelete/Restore`, `eventTypeOn*`, `eventFilter`, `eventKeyExtractor` (clave de partición), `eventDataExtractor`, `eventMetadata`. El sobre del evento lleva `tenantId` de la **fila** (si no la tiene, el del repositorio o el de la petición; las tablas `GlobalEntity` no anuncian tenant) y `userId` del contexto (vacío en consumers y crons).
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
Extender `BaseServiceClient` (baseURL, `apiKey`, `serviceName`, timeout); métodos `get/post/patch/…` con autenticación por API key (`X-API-Key`). Ver `AuthServiceClient`, `ScheduleServiceClient` (business-owner) o `BusinessOwnerClient` (schedule, users) como ejemplo.

**Los errores conservan su estado.** Si el servicio remoto responde con un error HTTP, el cliente lanza la excepción de Nest equivalente: 400 → `BadRequestException`, 401 → `UnauthorizedException`, 403 → `ForbiddenException`, 404 → `NotFoundException`, 409 → `ConflictException`, el resto → `HttpException(mensaje, estado)`. El llamador puede decidir (`catch (e) { if (e instanceof NotFoundException) … }`) y un 404 del otro servicio ya no se convierte en un 500. Un fallo de red o un timeout lanza un `Error` genérico: ante eso **no asumas nada** (p. ej. no borres ni aceptes). La llamada va solo con la API key, sin JWT del usuario: el destino expone el endpoint con `@InternalApi()` y el negocio o el usuario viajan explícitos.

## Convenciones al contribuir

- Código, identificadores y comentarios en inglés; documentación (CLAUDE.md, READMEs) en español.
- Todo export público pasa por `index.ts`. No exportar `DynamoDBAdapter` salvo decisión explícita (arrastra dependencias AWS opcionales).
- Dependencias de Nest/TypeORM/Supabase son `peerDependencies`: no añadirlas como `dependencies`.
- Con `npm install --legacy-peer-deps` npm **no instala los peers**: cada servicio debe declarar los que usa (`@nestjs/config`, `@nestjs/microservices`, `@nestjs/cache-manager`, `cache-manager`, `keyv`, `@keyv/redis`, `@nestjs/axios` si usa clientes HTTP…). Al añadir un peer nuevo a la librería, añádelo también a los servicios que la usan.
- Mantener `peerDependenciesMeta` de AWS como opcionales.

## Deuda conocida

- `auth/supabase-jwt.strategy.ts` y `auth/strategies/supabase-jwt.strategy.ts` coexisten (duplicado histórico); el `AuthModule` usa el de `strategies/`.
- `common/interceptors/tenant.interceptor.ts` y `transform.interceptor.ts` son heredados; los servicios usan `ExecutionContextInterceptor` y `ResponseTransformInterceptor`.
- La versión en `package.json` (2.0.0) no se incrementa en cada cambio; los servicios fijan por commit de GitHub.
