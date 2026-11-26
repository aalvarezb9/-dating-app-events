/**
 * What a service takes from the CLOUD stacks (`deploy/cloud/network`, `data` and `assets`, and the shared stack) when it is deployed to AWS, for the `serverless.yml`
 * of every service: `custom.cloud: ${file(./serverless/cloud.js)}`.
 *
 * Locally (stage `local`) the functions are deployed to the emulator only to create their queues: they do not run there (the compose runs the
 * service itself), and the emulator has no VPC, no RDS and no ElastiCache, so a reference to their exports would fail the deployment. So in
 * `local` this returns `{}` and the settings of the service fall back to empty values (`${self:custom.cloud.redisHost, ''}`).
 *
 * Everything that comes from the stacks goes by `Fn::ImportValue` (a reference that CloudFormation checks, and that stops the stack of the data from
 * being deleted while a service uses it), never by a copied name or a hard-coded address.
 */
export interface CloudSettings {
  /** `provider.vpc` of the functions: the security group and the subnets of the network stack */
  vpc?: { securityGroupIds: unknown[]; subnetIds: unknown[] };
  /** `NODE_ENV` of the functions: `production` in prod and `development` elsewhere (never `local`: that one turns the schema synchronization on) */
  nodeEnv?: string;
  /** Redis (ElastiCache): the host and the port come from the data stack; TLS is always on */
  redisHost?: unknown;
  redisPort?: unknown;
  redisTls?: string;
  /** More secrets of Secrets Manager to read at startup (the connection string of the database and the token of Redis), to append to `SECRETS_IDS` */
  extraSecrets?: string;
  /** The User Pool and its client (`deploy/stack`): every service verifies tokens against them. The issuer and the keys are derived from the id and the region */
  cognitoUserPoolId?: unknown;
  cognitoClientId?: unknown;
  /** The address the public files are served from (CloudFront, `deploy/cloud/assets`), no trailing slash: `ASSETS_BASE_URL` */
  assetsBaseUrl?: unknown;
  /** AppSync Events (`deploy/cloud/realtime`): the HTTP endpoint the signals are published to (`APPSYNC_EVENTS_ENDPOINT`) and the id of the API (for the IAM policy of the publisher) */
  appsyncEndpoint?: unknown;
  appsyncApiId?: unknown;
  /** SES (`deploy/cloud/mail`): the sender (`MAIL_FROM`), the configuration set (`SES_CONFIGURATION_SET`) and the ARNs of the identity and the set, for the IAM policy of the sender */
  mailFrom?: unknown;
  sesConfigurationSet?: unknown;
  sesConfigurationSetArn?: unknown;
  sesIdentityArn?: unknown;
  /**
   * The addresses the other services call (`AUTH_SERVICE_URL`, `BUSINESS_OWNER_SERVICE_URL`, `SCHEDULE_SERVICE_URL`): `https://internal.api.<service>.<BASE_DOMAIN>`,
   * a private REST API that only answers inside the VPC (`deploy/cloud/internal`). The name is the same one that stack gives it: it is derived, not imported, because the
   * services are deployed BEFORE that stack (it points at their functions).
   */
  authServiceUrl?: string;
  businessOwnerServiceUrl?: string;
  scheduleServiceUrl?: string;
  /** `BASE_DOMAIN` of the functions (the public page of a business is `<subdomain>.<BASE_DOMAIN>`; `SharedConfigService.app` requires it): the same value the addresses above derive from */
  baseDomain?: string;
  /** Where the links of the emails of auth lead: the front ends, `app.<BASE_DOMAIN>` and `admin.<BASE_DOMAIN>` (the origins `deploy/cloud/cdn` lets through CORS) */
  emailVerificationLinkUrl?: string;
  adminActivationLinkUrl?: string;
  /** The login of the panel of the owners: the button of the email that tells them their business was approved (`app.<BASE_DOMAIN>/login`) */
  businessLoginUrl?: string;
}

/** `internal.api.<service>.<baseDomain>`: the name of the private API of a service (the same rule as `deploy/cloud/internal/resources.js`) */
export function internalApiHost(baseDomain: string, service: 'auth' | 'business-owner' | 'schedule'): string {
  return `internal.api.${service}.${baseDomain}`;
}

export function cloudSettings(stage: string): CloudSettings {
  if (stage === 'local') {
    return {};
  }
  const imported = (name: string) => ({ 'Fn::ImportValue': `bookly-${stage}-${name}` });
  // The base domain of the environment (`dev.usebookly.app`): it comes from `deploy/stages/<stage>.env`, the same value the stack of the private APIs reads. No default.
  const baseDomain = process.env.BASE_DOMAIN;
  if (!baseDomain) {
    throw new Error(`BASE_DOMAIN is required to deploy '${stage}' (deploy/stages/${stage}.env): the addresses of the other services are internal.api.<service>.<BASE_DOMAIN>`);
  }
  const serviceUrl = (service: 'auth' | 'business-owner' | 'schedule') => `https://${internalApiHost(baseDomain, service)}`;

  return {
    vpc: {
      securityGroupIds: [imported('lambda-sg')],
      subnetIds: [imported('app-subnet-a'), imported('app-subnet-b')],
    },
    nodeEnv: stage === 'prod' ? 'production' : 'development',
    redisHost: imported('redis-host'),
    redisPort: imported('redis-port'),
    redisTls: 'true',
    extraSecrets: `,bookly/${stage}/database-url,bookly/${stage}/redis`,
    cognitoUserPoolId: imported('user-pool-id'),
    cognitoClientId: imported('user-pool-client-id'),
    assetsBaseUrl: imported('assets-base-url'),
    appsyncEndpoint: imported('appsync-events-endpoint'),
    appsyncApiId: imported('appsync-events-api-id'),
    mailFrom: imported('mail-from'),
    sesConfigurationSet: imported('ses-configuration-set'),
    sesConfigurationSetArn: imported('ses-configuration-set-arn'),
    sesIdentityArn: imported('ses-identity-arn'),
    baseDomain,
    emailVerificationLinkUrl: `https://app.${baseDomain}/verify-email`,
    adminActivationLinkUrl: `https://admin.${baseDomain}/activate`,
    businessLoginUrl: `https://app.${baseDomain}/login`,
    authServiceUrl: serviceUrl('auth'),
    businessOwnerServiceUrl: serviceUrl('business-owner'),
    scheduleServiceUrl: serviceUrl('schedule'),
  };
}
