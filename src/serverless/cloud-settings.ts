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
}

export function cloudSettings(stage: string): CloudSettings {
  if (stage === 'local') {
    return {};
  }
  const imported = (name: string) => ({ 'Fn::ImportValue': `bookly-${stage}-${name}` });

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
  };
}
