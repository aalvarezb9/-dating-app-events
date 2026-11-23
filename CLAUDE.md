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
| Recibir un archivo que sube el cliente (comprobante, imagen) | **`UploadTicketService`**: el cliente sube **directo a S3** con una URL prefirmada y el servicio lo valida después por contenido (`issue` → subida → `confirm`). **No** recibir el archivo por multipart: una Lambda no acepta un cuerpo de más de ~6 MB | `files/upload-tickets.ts` |
| Avisar a una persona (email, push, bandeja, SSE) | `NotificationClient.emit(canal, { recipient, template \| raw, category })` (comando por el topic SNS del servicio, después del commit, nunca lanza) | `notifications/` |
| Avisar a la UI en tiempo real de un cambio (un hueco de la agenda se ocupó) | `SseService.emit(topic, señal)` / `agendaTopics(...)` (canal SSE de notificaciones; sin persistencia; después del commit, nunca lanza) | `sse/` |
| Anunciar un hecho de dominio a otros servicios | `EventPublisher.publishEvent(evento)` **después del commit** (nunca lanza; `publishEventOrThrow` si debe fallar). Ya no hay outbox | `services/event-publisher.service.ts` |
| Recibir eventos de una cola SQS | `consume(AppModule, Consumer)` en `src/async/queues.ts`, con `@EventPattern` en el consumer y las colas en `consumers.manifest.json` | `async/`, `serverless/` |
| Mandar una solicitud de cita a la cola FIFO de schedule | `ScheduleQueueClient.requestAppointment(...)` | `clients/` |
| Correr una tarea programada o de arranque como función Lambda | `runTask(AppModule, Servicio, 'método')` y, en el servicio, `RuntimeInfo.isServerless` para quitarla del arranque | `async/run-task.ts`, `runtime/` |
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
| `env.config.ts` | `SharedConfigService`: lee y **valida** las variables de entorno y las expone tipadas (`database`, `s3` (región, prefijo de buckets, `assetsBaseUrl`, endpoint), `cognito` (pool, *app client*, `issuer` y `jwksUrl`), `supportTokenSecret`, `redis`, `app` (**se niega a arrancar con `NODE_TLS_REJECT_UNAUTHORIZED=0` si `NODE_ENV` no es `local` ni `test`**), `jwtSecret`, `messaging` (SNS/SQS), `get(key)` para opcionales). Falla al arrancar si falta una requerida | Siempre que un servicio necesite configuración. Nunca `process.env` |
| `connections.ts` | Cómo llegar a Redis con TLS si el entorno lo pide: `redisConnectionOptions(config.redis)` (ioredis) y `redisUrl(config.redis)` (`redis://` o `rediss://`, para Keyv). **Todo cliente de Redis se construye con ellos**: nunca con `host` suelto, o en la nube no conecta | Al crear cualquier cliente de Redis |
| `load-secrets.ts` | `loadSecrets()`: lee de **Secrets Manager** los secretos que nombra `SECRETS_IDS` (lista separada por comas; cada uno, un JSON de valores de texto) y pone cada clave en el entorno **antes** de que arranque la aplicación, así `SharedConfigService` los lee como cualquier variable y no quedan como variables de la Lambda (no se ven en la consola ni en la plantilla). Una variable ya definida gana al secreto (el compose local y los tests); sin `SECRETS_IDS` no hace nada; un secreto ilegible, que no es JSON o con valores que no son texto **detiene el arranque**. Devuelve los nombres cargados, nunca los valores. Probado contra el Secrets Manager del emulador | Primera línea de la entrada de cada Lambda (`src/lambda.ts`, `src/async/*`) y de `main.ts`, antes de `NestFactory` |
| `shared-config.module.ts` | `SharedConfigModule` (global): provee `SharedConfigService`. Además del `.env`, carga el archivo de `EXTRA_ENV_FILE` si la variable existe (valores que solo existen tras desplegar la infraestructura: en local, los ids del User Pool que escribe `aws-deploy`) | Importarlo una vez en el `AppModule` |

### Autenticación (`auth/`)

| Archivo | Qué hace | Úsalo cuando |
|---|---|---|
| `auth-service.interface.ts` | Contrato abstracto `AuthService` (`signUp`, `signIn`, `updateUserMetadata`, `refreshToken`, `signOut`, `getUserById`, `sendPasswordResetEmail`, `confirmPasswordReset` (el código del correo de recuperación), `updatePassword`, `verifyUserEmail`, `deleteUser`, `setUserBanned`) y tipos genéricos `AuthUser`, `AuthSession`, `SignUpResult`… | Para inyectar autenticación sin depender del proveedor. Solo el **auth service** debe crear usuarios; el resto usa `AuthServiceClient` por HTTP |
| `strategies/cognito-auth.strategy.ts` | Implementación del contrato sobre un **User Pool de Cognito** (`AUTH_PROVIDER=cognito`): `AdminCreateUser` (sin correo, `email_verified=true`) + `AdminSetUserPassword`, inicio de sesión con `AdminInitiateAuth` (`ADMIN_USER_PASSWORD_AUTH`), refresco con `InitiateAuth`, `GlobalSignOut`, recuperación con `ForgotPassword`/`ConfirmForgotPassword` (y cierra las sesiones de la cuenta), `AdminDisableUser` para banear. No manda el teléfono (Cognito solo admite E.164; `auth` lo guarda en su base). Refresh sin `SECRET_HASH`: el *app client* no tiene secreto | No se importa directo: la elige `AuthModule`. **Solo `auth` tiene permisos IAM sobre Cognito** |
| `strategies/cognito-jwt.strategy.ts` | Estrategia Passport registrada como **`jwt`** (el nombre que pide `JwtAuthGuard`): verifica con `TokenVerifier` y aplica las comprobaciones de estado (tenant bloqueado → 403, `user-blocked` → 401, segundo factor del administrador → 401, sesión de soporte abierta → 401). No llama al proveedor | Automática al usar `JwtAuthGuard` |
| `token-verifier.ts` | **Dos emisores, una sola puerta**: lee `iss` sin fiarse de él para elegir el camino. `iss` del User Pool → RS256 con el JWKS (caché de `jose`), exige `token_use=access` y el `client_id` del *app client*; `iss=bookly-support` → HS256 con `SUPPORT_TOKEN_SECRET`. Cada camino fija su algoritmo y su clave, así que un token con el `iss` de uno firmado con la clave del otro no pasa (confusión de algoritmos). Exige `exp` y `sub`. Normaliza los claims (`custom:*` del trigger o `app_metadata` de soporte) a un `VerifiedToken`; el id de sesión es `origin_jti` (estable entre refrescos). Se exporta también por `@dating-app/events/edge`: solo depende de `jose` | Lo usan la estrategia JWT y el gateway (y lo usará el *authorizer*) |
| `user-block.ts` | `blockUser` / `unblockUser` / `userBlockedWith`: bandera `user-blocked:<id>` en Redis (24 h, falla abierta como las demás). Sustituye a "¿sigue existiendo el usuario?" que se preguntaba a Supabase: los demás servicios no tienen permiso sobre Cognito | Para cortar a una persona borrada o baneada; hoy nadie la escribe (el bloqueo por tenant ya corta las sesiones) |
| `tenant-block.ts` | `blockTenant` / `unblockTenant` / `tenantBlockedWith`: bandera `tenant-blocked:<id>` en el Redis compartido (24 h; auth la renueva cada pocos minutos mientras el tenant no esté activo, así sobrevive a un reinicio de Redis). Si Redis no responde, la comprobación se omite (con aviso): perder la caché no tumba los servicios | Solo **auth** escribe la bandera (al pasar un tenant a `suspended`/`rejected`/`pending`); todos los demás la leen sin hacer nada, a través de la estrategia JWT |
| `admin-session.ts` | Sesiones de **super-administradores** que pasaron el segundo factor: `authorizeAdminSession` / `revokeAdminSession` / `isAdminSessionAuthorized` (clave `admin-session:<session_id>` en el Redis compartido) y `sessionIdOfToken`. La estrategia JWT **rechaza con 401 (`admin.error.second_factor_required`) el token de un `super_admin` cuya sesión no esté registrada**, así que un token pedido directo a GoTrue (sin el código del correo) no sirve. A diferencia de la bandera de tenants, **falla cerrado**: si Redis no responde, el token de un super-admin se rechaza | Solo **auth** registra la sesión (tras validar el código); los demás la comprueban sin hacer nada, a través de la estrategia JWT. `ICurrentUser.sessionId` es el `session_id` del token |
| `support-session.ts` | **Sesiones de soporte** ("entrar como" una persona): auth firma un token corto de la persona con `app_metadata.impersonatedBy` (el super-admin) y `supportMode` (`read_only` por defecto, o `full`), sin refresh token, y registra la sesión en Redis (`openSupportSession` / `closeSupportSession` / `isSupportSessionOpen`, clave `support-session:<session_id>`). La estrategia JWT **rechaza con 401 (`support.error.session_ended`) un token de soporte cuya sesión no esté abierta** (también el de un `super_admin`: nadie actúa como un administrador) y falla cerrado. El `JwtAuthGuard` global exige además: en `read_only` solo `GET/HEAD/OPTIONS` (403 `support.error.read_only_session`) y en cualquier modo nada de `FORBIDDEN_IN_SUPPORT_SESSION` (`/auth/change-password`: las credenciales son de la persona). Así cerrar la sesión la corta en todos los servicios a la vez | Solo **auth** abre y cierra; los demás lo cumplen sin hacer nada. `ICurrentUser.impersonatedBy` / `supportMode` dicen quién actúa |
| `feature-flags.ts` | **Feature flags** que enciende y apaga la administración sin desplegar, para todos o solo para algunos negocios (despliegue gradual): `isFeatureEnabled(cache, 'clave', tenantId?)` (una lectura de Redis; un flag que nadie creó está **apagado**, y si Redis no responde también: lado seguro), `publishFeatureFlag` / `unpublishFeatureFlag` (clave `feature-flag:<clave>`, TTL 24 h), `FEATURE_FLAG_KEY` (formato de la clave). Con `tenantIds` el flag vale solo para esos negocios | **Preguntar**: cualquier servicio con `RedisCacheModule` (`await isFeatureEnabled(this.cache, 'nuevo_calendario', tenantId)`). **Publicar**: solo `backend-dating-admin-saas`, que guarda la verdad en su base y los republica cada pocos minutos (así sobreviven a un reinicio de Redis) |
| `auth.module.ts` | `AuthModule` (global): factory que provee `AuthService` y la estrategia JWT | Importarlo en servicios que autentican o validan JWT |

### Almacenamiento (`storage/`)

| Archivo | Qué hace | Úsalo cuando |
|---|---|---|
| `file-storage.interface.ts` | Contrato `FileStorageService`: `uploadFile`, `deleteFile(s)`, `getPublicUrl`, `getSignedUrl`, `listFiles`, y para las subidas directas `createUploadTicket` (un *presigned POST*: el almacenamiento mismo exige la clave, el tipo y el rango de tamaño), `getFileSize`, `readHead` (los primeros bytes) y `copyFile` | Para guardar/servir archivos. Buckets públicos → `getPublicUrl`; privados (p. ej. `payment-proofs`) → `getSignedUrl` |
| `strategies/s3-storage.strategy.ts` | Implementación sobre **S3** (`STORAGE_PROVIDER=s3`). El código habla en buckets **lógicos** (`payment-proofs`); el real es `<S3_BUCKET_PREFIX><nombre>` (los nombres son globales en AWS y cada stage tiene los suyos). `uploadFile` sube con `PutObject`; `getPublicUrl` devuelve `<ASSETS_BASE_URL>/<bucket>/<ruta>` (CloudFront en AWS: un comportamiento por bucket); `getSignedUrl` firma un `GetObject`; `listFiles`/`deleteFiles` por lotes de 1000. Con `AWS_ENDPOINT_URL` (emulador) usa direccionamiento por ruta. Se probó contra el emulador: subir, URL firmada, listar y borrar | La elige `StorageModule` según `STORAGE_PROVIDER` (obligatoria, sin valor por defecto) |
| `storage.module.ts` | `StorageModule` (global) con factory del proveedor | Importarlo en servicios que manejan archivos |

### Eventos (`services/`, `types/`, `decorators/`, `events.module.ts`)

| Archivo | Qué hace | Úsalo cuando |
|---|---|---|
| `types/events.ts` | Enum `DomainEventType` (usuarios, negocios, citas, pagos —incluye `PAYMENT_PROOF_UPLOADED/REJECTED`—, reseñas, suscripciones), interfaz base `DomainEvent` y eventos tipados | Para nombrar cualquier evento entre servicios. Eventos nuevos se declaran aquí |
| `services/event-publisher.service.ts` | `EventPublisher`: publica en el **topic SNS del servicio** (`<ns>-events-<stage>`) con el atributo `eventType`, que filtran las suscripciones de las colas. `publishEvent(event)` nunca lanza; `publishEventOrThrow(event)` lanza si SNS no lo aceptó. Rechaza un tipo de evento que va por un cliente (`APPOINTMENT_REQUEST_CREATED`) | Para anunciar un hecho de dominio, después del commit |
| `messaging/` | `QueueSender` (`send`: cola propia; `sendTo`: lo usan los clientes), nombres (`<ns>-<cola>-<stage>[.fifo]`) y clientes del SDK. `contracts/queues.ts` y `contracts/event-routes.ts`: el registro de colas directas y qué eventos van por un cliente | Solo vía `EventPublisher` o un cliente; un servicio no llama a SQS directo |
| `clients/schedule-queue.client.ts` | `ScheduleQueueClient.requestAppointment`: la solicitud de cita a la cola FIFO de schedule (grupo = agenda del hueco, deduplicación = `requestId`) | business-owner y users, para reservar |
| `async/` y `serverless/queue-resources.ts` | `consume(AppModule, Consumer)` (lee un lote SQS y llama a los `@EventPattern`; devuelve `batchItemFailures`), `runTask`, `manifestProblems` (contrato manifiesto ↔ consumers ↔ `queues.ts` ↔ `serverless.yml`) y `queueResources` (genera cola, DLQ, política y suscripciones) | Cada servicio que escucha eventos o corre tareas programadas |
| `lambda/http-handler.ts` y `runtime/` | `createHttpHandler(AppModule, configureApp)` (la función detrás de API Gateway) y `RuntimeInfo.isServerless` | Entrada HTTP de cada servicio en Lambda |
| `events.module.ts` | `EventsModule` (global): provee `EventPublisher`, `QueueSender` y `ScheduleQueueClient` | Importarlo en servicios que publican |
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
| `interceptors/execution-context.interceptor.ts` | Puebla el `ExecutionContext` por petición HTTP desde el JWT y los metadatos de los decoradores; `requestId` sale de la cabecera `X-Request-Id` del gateway (si tiene forma segura) y `traceparent` de la cabecera W3C | Registrarlo globalmente en `main.ts` antes de los guards |
| `interceptors/sanitize.interceptor.ts` | Elimina HTML/XSS de `body`, `query` y `params` (recursivo) | Registro global en todo servicio con entrada de usuario |
| `interceptors/logging.interceptor.ts` | Log de petición/respuesta con el cuerpo **redactado** y truncado | Registro global |
| `interceptors/response-transform.interceptor.ts` | Envuelve la respuesta en `{ success, data, timestamp }` y aplica `@UseDto` | Registro global |
| `interceptors/tenant.interceptor.ts`, `transform.interceptor.ts` | Versiones heredadas | No usar en código nuevo |
| `guards/jwt-auth.guard.ts` | Exige JWT válido (estrategia Passport `jwt`), salvo rutas `@Public()` | Guard global de los servicios con usuarios |
| `guards/roles.guard.ts` | Comprueba el rol del JWT contra `@Roles(...)`. **Falla cerrado**: una ruta privada sin `@Roles` responde 403 (`@Public()` y `@InternalApi()` quedan fuera) | Guard global junto al anterior |
| `guards/tenant.guard.ts` | Exige `tenantId` y tipo de tenant "negocio" | Rutas solo para negocios |
| `guards/api-key.guard.ts` | Valida `x-api-key` (comparación en tiempo constante) + `x-service-name` (llamadas entre servicios) | Endpoints internos consumidos por otros microservicios, no por la UI |
| `decorators/roles.decorator.ts` | `@Roles(UserRole…)` | Todo endpoint privado |
| `decorators/public.decorator.ts` | `@Public()`: sin JWT y sin filtro de tenant | Endpoints públicos (health, registro). **Nunca en business-owner** salvo `/health` |
| `decorators/cross-tenant.decorator.ts` | `@CrossTenant()`: desactiva el filtro de tenant | Solo cuando la unicidad o consulta es global (subdominios) y justificado |
| `decorators/include-deleted.decorator.ts` | `@IncludeDeleted()`: incluye filas con soft delete | Papelera / auditoría |
| `decorators/current-user.decorator.ts`, `current-tenant.decorator.ts` | Inyectan `ICurrentUser` / `tenantId` del request en el controller | En vez de leer `req.user` |
| `decorators/use-dto.decorator.ts` | `@UseDto(Dto)`: el interceptor transforma la respuesta a ese DTO | Todo endpoint con respuesta tipada |
| `decorators/api-standard-response.decorator.ts` | `@ApiStandardResponse(Dto, { status, isArray?, isPaginated?, isCursorPaginated? })`: documenta la respuesta en Swagger (`isPaginated`: `meta` con página y totales; `isCursorPaginated`: una `CursorPage`, `meta` con `limit`, `hasMore`, `nextCursor`) | Todo endpoint (en vez de `@ApiResponse`) |
| `dto/pagination.dto.ts` | `PaginationDto` (`page`, `limit`, orden), `PaginatedResult<T>`, `createPaginatedResult` | Query y resultado de listados paginados |
| `dto/cursor-page.ts` | Paginación **por cursor** para listas sobre tablas grandes (sin `OFFSET` ni `COUNT`): `PageCursor`/`encodeCursor`/`decodeCursor` (cursor opaco `(created_at con microsegundos, id)`; uno ajeno es 400), `cursorAtSql(columna)` y `afterCursorSql` (los trozos de SQL), `toCursorPage(filas, limit, …)` (arma `{ data, meta: { limit, hasMore, nextCursor } }` desde `limit + 1` filas), `CursorPage<T>`. Ordena por `created_at DESC, id DESC`: la tabla necesita un índice con esas columnas (tras los filtros de igualdad) | Un listado que puede crecer mucho (administración: usuarios, citas, auditoría). Un `Date` de JS pierde los microsegundos y saltaría filas: por eso el instante viaja como texto |
| `dto/search-prefix.ts` | Búsqueda por texto **sin escanear la tabla**: `searchPrefixPattern(texto)` (minúsculas, escapa `\ % _` para que el texto sea dato y nunca comodín, añade `%` al final; 3 a 60 caracteres, si no 400), `LIKE_ESCAPE`, `MIN_SEARCH_LENGTH`/`MAX_SEARCH_LENGTH`. Compara por el **inicio** (`lower(col) LIKE :patron ESCAPE '\'`), que un btree puede recorrer; `ILIKE '%texto%'` lee toda la tabla y no se permite en tablas grandes. La columna necesita `CREATE INDEX … ON tabla (lower(col) text_pattern_ops)` | Buscar un negocio por nombre o subdominio, un usuario por email o nombre |
| `database/prefix-search-indexes.ts` | `PrefixSearchIndexes`: clase abstracta que, al arrancar y de forma idempotente, crea los índices `(lower(col) text_pattern_ops)` que necesita `search-prefix.ts` (TypeORM no puede declararlos). El servicio la extiende con `entity` y `columns` (`{ column, lowercase? }`; `lowercase: false` para una columna ya guardada en minúsculas) y la registra como provider. Los identificadores se validan. Cuando el servicio tenga migraciones, ese SQL pasa a una | Habilitar la búsqueda por prefijo en una tabla |
| `edge.ts` (se importa como `@dating-app/events/edge`) | **Entrada ligera** para un servicio de borde (el API gateway). La principal carga todo (TypeORM, el SDK de AWS, Passport…); esta solo lo que depende de NestJS y la librería estándar: `SharedConfigService/Module`, `Public`, `Roles`, `CurrentUser`, `RolesGuard`, `UserRole`/`TenantType`, `tenantBlockedWith`, `isAdminSessionAuthorized`/`sessionIdOfToken`, `isSupportSessionOpen` (+ `SAFE_HTTP_METHODS`, `FORBIDDEN_IN_SUPPORT_SESSION`), `TokenVerifier` (solo `jose`), `redactSensitive`/`redactUrl`, `AllExceptionsFilter`. **Regla**: nada que importe `typeorm`, `@supabase/supabase-js`, `@aws-sdk/*`, `passport-jwt`, `@nestjs/swagger` o `class-validator` puede exportarse desde aquí. Se empaqueta con la carpeta `edge/` (un `package.json` que apunta a `dist/edge.js`, para que TypeScript con `moduleResolution: node` la resuelva) | Un servicio que no usa base de datos, Kafka ni Supabase |
| `config/service-namespace.ts` | `isValidServiceNamespace` (sin importar TypeORM; `service-naming.strategy.ts` lo reexporta) | Validar `SERVICE_NAMESPACE` |
| `dto/filterable-query.dto.ts` | `FilterableQueryDto`, `DynamicFilters`, operadores (`$gte`, `$in`, `$like`…) | Filtros dinámicos traducidos por `BaseRepository` |
| `dto/date-range.dto.ts`, `dto/base-response.dto.ts` | Rango de fechas validado; respuesta base `success/error` | Filtros por fechas; respuestas simples |
| `interfaces/api-response.interface.ts` | `ApiResponse<T>`, `PaginatedResponse<T>` | Tipar respuestas |
| `filters/all-exceptions.filter.ts`, `http-exception.filter.ts` | Convierten excepciones en respuestas JSON uniformes `{ statusCode, message, error, timestamp }` (**sin `path`**: la URL no se devuelve al cliente) y registran el error con el id de la petición | Filtro global en `main.ts` |
| `types/auth.types.ts` | `UserRole` (`super_admin`, `business_owner`, `business_staff`, `customer`, `guest`) y `TenantType` | Cualquier chequeo de rol/tipo |
| `constants/currencies.ts` | `VALID_CURRENCIES` (`HNL`, `USD`), `isValidCurrency` | Validar monedas |
| `utils/request-trace.ts` | `readRequestId`/`readTraceparent` (leen y validan las cabeceras `X-Request-Id` y `traceparent` de la petición), `nextTraceparent` (misma traza, tramo nuevo) y `outgoingTraceHeaders()` (las cabeceras que debe llevar una llamada a otro servicio, tomadas del `ExecutionContext`). Los usan el interceptor de contexto, el de logs, los filtros y `BaseServiceClient` | Un log propio que deba llevar el id de la petición, o un cliente HTTP que no extienda `BaseServiceClient` |
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

**`SERVICE_NAMESPACE`** es ahora una **abreviatura** (2–6 minúsculas: `bo`, `sch`, `usr`, `auth`, `adm`, `ntf`; `SharedConfigService.serviceNamespace` la valida) y es el prefijo de las tablas y el actor de las escrituras del sistema. El nombre largo del servicio va en **`SERVICE_NAME`** (`SharedConfigService.serviceName`), usado como `source` de los eventos. Transitorio: mientras un servicio no defina `SERVICE_NAME`, `serviceName` cae a `SERVICE_NAMESPACE`.

### Contratos entre servicios y proyecciones

| Archivo | Qué hace | Úsalo cuando |
|---|---|---|
| `contracts/catalog.contracts.ts` | Payloads (`event.data`) de `SERVICE_/TEAM_MEMBER_/BUSINESS_PROFILE_UPSERTED`, `*_DELETED`, `LANDING_PAGE_UPSERTED`, `REVIEW_UPSERTED`; base `ProjectionPayload` (`id`, `tenantId`, `sourceVersion`). El horario semanal (`WeeklyHoursContract`) admite `breaks` por día; el perfil lleva `closures` (festivos y vacaciones del negocio) y el miembro `timeOff` (`DateRangeContract`: fechas locales `YYYY-MM-DD`, extremos incluidos); `TeamMemberContract.userId` es `null` salvo el del dueño cuando atiende (los miembros no tienen login); `ServiceContract.capacity` (opcional; ausente = 1) son los **cupos por sesión** de un servicio grupal (una clase, un taller). Nivel *interno*: nunca banco, documentos legales ni facturación | Emitir o consumir datos de catálogo de business-owner. Solo se **añaden** campos |
| `contracts/appointment-request.contract.ts` | `AppointmentRequestCreatedData` (evento v2: solicitud completa, con precio/duración copiados) y `AppointmentRequestRejectedData` | Emitir (business-owner, users) o consumir (schedule) una solicitud de cita |
| `contracts/appointment-access-link.contract.ts` | `AppointmentAccessLinkIssuedData` (`APPOINTMENT_ACCESS_LINK_ISSUED`): el link de una cita (`https://<subdomain>.<BASE_DOMAIN>/<token>`) con el token en claro y los datos para el correo; solo viaja aquí, schedule guarda su hash | Emitir (schedule) o consumir (notifications) el aviso con el link de una cita |
| `contracts/email-verification.contract.ts` | `EmailVerificationRequestedData` (`EMAIL_VERIFICATION_REQUESTED`: el token en claro para el correo de confirmación; auth guarda solo su hash) y `EmailVerifiedData` (`EMAIL_VERIFIED`: el email, en minúsculas, ya es de esa persona) | Emitir (auth) o consumir (notifications el primero; schedule el segundo para vincular citas de invitado) |
| `scheduling/availability.ts` + `scheduling/local-time.ts` | `findAvailabilityViolation(check)`: **la** regla de la agenda (cierres, horario del día, descansos, ventana del servicio, agenda y ausencias del miembro) como función pura que devuelve el motivo (`BUSINESS_CLOSED`, `DURING_BREAK`, `MEMBER_ON_TIME_OFF`…) o `null`; y los helpers de hora local por zona IANA (`getLocalTimeParts`, `timeToMinutes`, `isValidTimeZone`) | business-owner (respuesta rápida al dueño) y schedule (la que cuenta) la usan **las dos**, cada una convirtiendo el motivo a su clave de error; no la copies en otro servicio |
| `contracts/tenant-status.contract.ts` | `TenantStatusChangedData` (`BUSINESS_REQUEST_APPROVED`, `BUSINESS_REQUEST_REJECTED`, `BUSINESS_SUSPENDED`, `BUSINESS_REACTIVATED`): el cambio de estado de un tenant, con el dueño y el motivo | Emitir (auth) o consumir (notifications) el aviso al dueño |
| `contracts/appointment-reminder.contract.ts` | `AppointmentReminderData` (`APPOINTMENT_REMINDER`): una cita confirmada está por empezar, con los datos del cliente para el correo | Emitir (schedule) o consumir (notifications) el recordatorio |
| `contracts/event-builders.ts` | `projectionEvent(...)` arma el `DomainEvent` (id de fila = `aggregateId`, orden por partición); `sourceVersionOf(row)` = `modified_at` en ms | Al construir cualquier `*_UPSERTED`/`*_DELETED` |
| `projections/projected-entity.ts` | `ProjectedEntity` (`TenantEntity` + `source_version` + `deleted_at`): base de una **copia local de solo lectura** de una fila ajena; la PK usa el mismo id que el dueño | Tabla de proyección en el consumidor (`@PrimaryColumn('uuid') id` + las columnas que necesite) |
| `projections/apply-projection.ts` | `applyProjection(manager, Entidad, payload, { deleted? })`: upsert **idempotente y ordenado por versión**, con lápidas; no emite eventos | En el consumer de cada `*_UPSERTED`/`*_DELETED` y al sincronizar snapshots (dentro de transacción y de `ExecutionContext.run({ tenantId })`) |
| `projections/snapshot.ts` | Dueño: `readSnapshotPage(repo, { updatedSince, cursor, limit, where })` (paginación por `(modified_at, id)` comparada a precisión de **milisegundos**: Postgres guarda microsegundos pero el cursor viaja como `Date`, y sin recortar la última fila de cada página se repetía; incluye borrados). Consumidor: `syncSnapshot(fetchPage, apply)` | Arranque con tabla vacía y reconciliación periódica de una proyección |
| `common/decorators/internal-api.decorator.ts` + `common/guards/internal-api-key.guard.ts` | `@InternalApi()`: sin JWT pero **exige** `X-API-Key` (`INTER_SERVICE_API_KEY`, comparación en tiempo constante; falla si no está configurada) y es cross-tenant. `JwtAuthGuard` lo deja pasar | Endpoints `/internal/v1/*` llamados solo por otros servicios; nunca en el gateway. **No es `@Public()`** (el `ApiKeyGuard` antiguo sí se salta con `@Public()`) |

Eventos nuevos en `DomainEventType`: `SERVICE_UPSERTED/DELETED`, `TEAM_MEMBER_UPSERTED/DELETED`, `BUSINESS_PROFILE_UPSERTED`, `LANDING_PAGE_UPSERTED`, `REVIEW_UPSERTED`, `APPOINTMENT_REQUEST_CREATED`, `APPOINTMENT_REQUEST_REJECTED` (los dos últimos antes se usaban como strings). `BUSINESS_PROFILE_UPDATED` queda como legado. También: `EMAIL_VERIFICATION_REQUESTED`/`EMAIL_VERIFIED` (auth) y `APPOINTMENT_STARTED`/`APPOINTMENT_NO_SHOW` (schedule, al pasar la cita a `in_progress`/`no_show`; mismo payload que `APPOINTMENT_CONFIRMED`).

### Notificaciones (`notifications/`)

Los servicios **ordenan** una notificación con un comando por el topic SNS del servicio (una cola por canal, filtrada por `eventType`); `backend-dating-notifications` la entrega. Es un comando ("manda esto"), no un evento de dominio (un hecho): se publica **además** del evento, sin outbox y fire-and-forget.

| Archivo | Qué hace | Úsalo cuando |
|---|---|---|
| `notification.contract.ts` | `NotificationChannel` (`EMAIL`, `PUSH`, `UI`, `SSE`, `ALL`), `NOTIFICATION_TOPICS` (un topic por canal = un `DomainEventType.NOTIFICATION_*`), `NotificationMessage` (id, canal, destinatario, **`template` o `raw`**, adjuntos por referencia, categoría, `sensitiveFields`), `DELIVERY_CHANNELS` | Emitir o consumir un comando de notificación |
| `notification.validation.ts` | `validateNotificationMessage(msg): string[]` (función pura: qué exige cada canal del destinatario, un solo contenido, adjuntos solo en email…), `canReach(recipient, canal)`, `channelsFor(msg)` (a qué canales llega un `ALL`) | El emisor la ejecuta antes de publicar y el servicio al consumir: nada de Kafka se da por bueno |
| `notification-templates.ts` | `NotificationTemplateCatalog`: las plantillas que se pueden pedir y los datos tipados de cada una; `TypedTemplate`; `NOTIFICATION_TEMPLATE_KEYS` | Pedir una plantilla (no compila sin sus datos). **Una plantilla nueva se añade aquí y como archivo en notifications** |
| `notification.client.ts` | `NotificationClient.emit(canal, input)` (nunca lanza) / `emitOrThrow` (para tests); `buildNotificationMessage`; `notificationEvent` y `notificationPartitionKey` (el evento que lleva un mensaje) | Pedir una notificación. **Llámalo después del commit**, nunca dentro de la transacción |
| `notifications.module.ts` | `NotificationsModule` (global): provee `NotificationClient` (necesita `EventsModule` y `SharedConfigModule`) | Importarlo en el `AppModule` del servicio que notifica |

El contrato se prueba desde `backend-dating-notifications/src/contract` (la librería no tiene tests propios).

### Tiempo real para la UI por SSE (`sse/`)

Señales **efímeras** que la UI recibe por SSE para refrescar lo que está mostrando (un calendario, una lista) cuando otra persona cambia algo. **SSE es un canal más de las notificaciones**, como el email: `SseService.emit` es `NotificationClient.emit(NotificationChannel.SSE, { signal: { topic, data } })`, un comando por el topic del servicio (`NOTIFICATION_SSE`) que `backend-dating-notifications`, quien tiene las conexiones abiertas de los navegadores, entrega con el mismo flujo que un correo. **Ningún otro servicio conoce Redis ni mantiene conexiones SSE.** Nada se guarda: si nadie escuchaba, se pierde y la UI ve la verdad la próxima vez que consulta la API. Una señal no tiene destinatario (`recipient: {}`): llega a quien escuche el topic, y `ALL` nunca la incluye.

```ts
imports: [SseModule]   // junto a EventsModule y SharedConfigModule
await this.sse.emit('agenda.salon-angel.no-team.2030-06-20', { type: 'booked', memberId: null, startsAt, endsAt }); // tras el commit
```

El stream que abre el navegador (`GET /sse/stream?topics=agenda.salon-angel.*.2030-06-20`) lo sirve notificaciones; ver su CLAUDE.md.

| Archivo | Qué hace | Úsalo cuando |
|---|---|---|
| `sse.topics.ts` | Nombres jerárquicos con puntos (`agenda.<subdominio>.<miembro\|no-team>.<YYYY-MM-DD>`): `validateTopic`, `validatePattern` (`*` = un segmento, `#` = el resto, solo al final), `topicMatches`, `isPublicAgendaPattern` (un patrón público de agenda **debe nombrar el negocio**: `agenda.*` y `agenda.#` serían un chorro de todos), `agendaTopic`, `agendaTopics({ subdomain, memberId, startsAt, endsAt, timeZone })` (un topic por día local que toca la cita), el tipo `AgendaSignal` | Emitir (nombrar bien) o suscribir (validar) |
| `sse.service.ts` | `SseService.emit(topic, datos)` / `emitMany(topics, datos)`: envoltorio fino de `NotificationClient.emit(SSE, { signal })` (la clave de partición es `agenda.<negocio>`, así las señales de un negocio llegan en orden; el contrato limita la señal a 2 KB). Nunca lanza y valida el nombre | Cambió algo que alguien puede estar mirando. **Después del commit** |
| `sse.module.ts` | `SseModule` (global): provee `SseService` (importa `NotificationsModule`; necesita `EventsModule` y `SharedConfigModule`; sin variables propias) | En el `AppModule` de quien emite |

**La señal es una pista, no un dato**: `{ type, memberId, startsAt, endsAt }`, sin clientes ni ids de citas. La UI la recibe y vuelve a consultar la API, que decide qué puede ver cada quien. Los nombres y el servicio se prueban desde `backend-dating-notifications/src/contract` (la librería no tiene tests propios).

### Otros módulos

| Archivo | Qué hace | Úsalo cuando |
|---|---|---|
| `encryption/encryption.service.ts` | `EncryptionService.encrypt/decrypt`: AES-256-GCM, clave derivada con scrypt y sal aleatoria (`v2:`), lee el formato antiguo | Datos sensibles en BD (cuentas bancarias). Requiere `ENCRYPTION_KEY` ≥ 32 caracteres |
| `encryption/encryption.module.ts` | `EncryptionModule` | Importarlo donde se cifra |
| `files/upload-tickets.ts` | **`UploadTicketService`** (global, con `StorageModule`): subidas directas del cliente a S3 en dos llamadas del servicio. `issue({ bucket, scope, allowed, contentType, sizeBytes })` rechaza de entrada un tipo no permitido o un tamaño fuera de rango y devuelve `{ uploadId, url, fields, expiresAt, maxBytes }` (un POST prefirmado a `incoming/<scope>/<uploadId>`; el `scope` es el recurso, `[tenantId, 'payment-proofs', appointmentId]`, y los segmentos solo pueden ser ids o nombres seguros). `confirm({ bucket, scope, uploadId, allowed, finalPrefix })` lee el tamaño real y los primeros bytes, decide el tipo **por el contenido**, copia a `<finalPrefix>/<nombre generado>` y borra el temporal; un archivo ausente, vacío, demasiado grande o de otro tipo se borra y da 400 con las claves de siempre (`UPLOAD_ERRORS`). Como el `scope` va en la clave, **una subida solo la confirma el recurso para el que se pidió**. Los objetos sin confirmar caducan por una regla de ciclo de vida de `incoming/`. Probado contra el emulador (el emulador aplica las condiciones del POST: otro `Content-Type` da 403 y más de 5 MB, 400) | Siempre que un cliente suba un archivo; el servicio aplica **antes** sus reglas de negocio (de quién es la cita, ventana abierta, quién edita la landing) y **después** de confirmar hace lo suyo (anunciar el evento, guardar la URL) |
| `files/upload.dto.ts` | Los DTO de la subida, iguales en todos los servicios: `RequestUploadDto` (`{ contentType, sizeBytes }`, cuerpo de `…/upload-url`; el tamaño máximo NO se valida aquí para conservar la clave `validation.error.file_size_exceeded`), `ConfirmUploadDto` (`{ uploadId }`, cuerpo de `…/confirm`) y `UploadTicketResponseDto` (lo que devuelve `upload-url`, para Swagger) | Los endpoints `…/upload-url` y `…/confirm` de cualquier servicio (un invitado añade su `email` extendiéndolos) |
| `files/file-upload.ts` | Detección y nombres: `detectFileType(bytes)` (el tipo se detecta por los **bytes** del archivo, no por lo que dice el cliente; devuelve `{ mimeType, extension }`), `generateStorageFileName(ext)` (nombre generado por el servidor, nunca el del cliente) y los conjuntos `PAYMENT_PROOF_TYPES`, `HERO_IMAGE_TYPES`, `GALLERY_IMAGE_TYPES`. Quedan `SINGLE_FILE_UPLOAD_OPTIONS` y `assertValidUpload` (la subida multipart antigua, por retirar cuando los seis endpoints pasen a `UploadTicketService`), `generateStorageFileName(ext)` (nombre generado por el servidor, nunca el del cliente) y los conjuntos `PAYMENT_PROOF_TYPES`, `HERO_IMAGE_TYPES`, `GALLERY_IMAGE_TYPES` | Cualquier endpoint que reciba un archivo (`@UseInterceptors(FileInterceptor('file', SINGLE_FILE_UPLOAD_OPTIONS))`); luego `FileStorageService.uploadFile` |
| `files/file-upload.constants.ts` | `MAX_FILE_SIZE_BYTES` (5 MB) y `UPLOAD_ERRORS` (claves i18n `validation.error.file_required|file_size_exceeded|invalid_file_type`, iguales en todos los servicios) | Al traducir o probar los errores de una subida |
| `http-client/base-service-client.ts` | `BaseServiceClient`: cliente Axios con API key, timeout, `X-Request-Id`/`traceparent` de la petición en curso (tramo nuevo) y manejo de errores (`get/post/patch/put/delete`); un error HTTP del servicio remoto se relanza con su mismo estado (400/401/403/404/409 como excepciones de Nest) para que el llamador distinga un 404 de un fallo | Una clase por servicio remoto (`AuthServiceClient`) |
| `http-client/http-client.module.ts` | `HttpClientModule` | Importarlo donde hay clientes HTTP |
| `index.ts` | Reexporta lo público | Todo export nuevo pasa por aquí |

Fuera de `src/`: `examples/` (ejemplos de uso, p. ej. `UserRepository.example.ts`) y `dist/` (build, ignorado por git).

## Diseño y reglas

### Strategy Pattern (auth y storage)
1. **Contratos inmutables**: las clases abstractas (`AuthService`, `FileStorageService`) no cambian de forma incompatible.
2. **Estrategias intercambiables**: cambiar proveedor = cambiar variable de entorno (`AUTH_PROVIDER=cognito`, `STORAGE_PROVIDER=s3`; los dos son obligatorios, sin valor por defecto: `config.authProvider` / `config.storageProvider`).
3. **Mapeo en la estrategia**: cada estrategia traduce tipos del proveedor a tipos genéricos (`AuthUser`, `AuthSession`, `FileUploadResult`).
4. **Factory centralizado** en `AuthModule` / `StorageModule` (único lugar con el `switch` de proveedores).

Para añadir un proveedor: crear la estrategia en `auth/strategies/` o `storage/strategies/` extendiendo el contrato, añadir el `case` al factory del módulo, documentar las variables nuevas en `SharedConfigService`.

### Configuración
- Los servicios acceden a env **solo** vía `SharedConfigService`; nunca `process.env`.
- Variables requeridas lanzan error si faltan (`getRequired`), sin valores por defecto. Config disponible: `database`, `cognito`, `s3`, `authProvider`, `storageProvider`, `supportTokenSecret`, `redis`, `app`, `jwtSecret`, `messaging`, y `get(key)` para opcionales.
- ⚠️ Excepción actual: `serviceName` cae a `SERVICE_NAMESPACE || 'backend-service'`. No replicar este patrón.
- Variables que usa la librería: `DATABASE_URL`, `AUTH_PROVIDER` (`cognito`), `STORAGE_PROVIDER` (`s3`), `S3_BUCKET_PREFIX` (`bookly-<stage>-`), `ASSETS_BASE_URL` (de dónde se sirven los archivos públicos; CloudFront en AWS), `COGNITO_USER_POOL_ID`, `COGNITO_CLIENT_ID`, `COGNITO_CLIENT_SECRET?`, `COGNITO_ISSUER?` y `COGNITO_JWKS_URL?` (solo si no son los de AWS: el emulador firma con su propia dirección como `iss`), `SUPPORT_TOKEN_SECRET` (≥ 32 caracteres; firma los tokens de soporte, nunca el secreto del proveedor), `EXTRA_ENV_FILE?`, `REDIS_HOST`, `REDIS_PORT`, `REDIS_USERNAME?`, `REDIS_PASSWORD?`, `REDIS_TLS?` (`true` en Redis gestionado), `PORT`, `NODE_ENV`, `BASE_DOMAIN`, `JWT_SECRET`, `AWS_REGION`, `AWS_ACCOUNT_ID`, `STAGE` (SNS/SQS), `AWS_ENDPOINT_URL?` (solo contra el emulador), `SERVICE_NAMESPACE` (abreviatura, prefijo de tablas), `SERVICE_NAME` (nombre completo), `AUTH_PROVIDER?`, `STORAGE_PROVIDER?`, `ENCRYPTION_KEY`.

### Eventos (SNS / SQS)
- `EventPublisher.publishEvent(event)`: publica en el topic SNS del servicio con el atributo `eventType` y nunca lanza (`publishEventOrThrow` sí). No hay clave de partición ni orden: los consumers son idempotentes y los cambios de catálogo llevan `sourceVersion`. La única cola FIFO es la de solicitudes de cita de schedule.
- Los eventos se publican **después del commit**; no hay outbox. Lo que se pierda y importe se repara por consulta (ver el plan de migración).
- Nuevos eventos → añadir al enum `DomainEventType` en `types/events.ts` (+ interfaz tipada si lleva datos estructurados) y exportar.
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
- `CognitoJwtStrategy` **no llama al proveedor**: verifica la firma con el JWKS y consulta las banderas de Redis (`tenant-blocked`, `user-blocked`, sesión de administrador, sesión de soporte), sin caché en memoria: un corte vale en la siguiente petición. (La estrategia de Supabase, en retirada, preguntaba a Supabase si el usuario seguía existiendo, como máximo una vez por minuto.)
- El token de soporte lo firma `auth` con `SUPPORT_TOKEN_SECRET` e `iss=bookly-support`; el proveedor de identidad no puede firmarlo ni sus claves lo validan.
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
- Dependencias de Nest/TypeORM son `peerDependencies`: no añadirlas como `dependencies`.
- Con `npm install --legacy-peer-deps` npm **no instala los peers**: cada servicio debe declarar los que usa (`@nestjs/config`, `@nestjs/microservices`, `@nestjs/cache-manager`, `cache-manager`, `keyv`, `@keyv/redis`, `@nestjs/axios` si usa clientes HTTP…). Al añadir un peer nuevo a la librería, añádelo también a los servicios que la usan.
- Mantener `peerDependenciesMeta` de AWS como opcionales.

## Deuda conocida

- `common/interceptors/tenant.interceptor.ts` y `transform.interceptor.ts` son heredados; los servicios usan `ExecutionContextInterceptor` y `ResponseTransformInterceptor`.
- La versión en `package.json` (2.0.0) no se incrementa en cada cambio; los servicios fijan por commit de GitHub.
