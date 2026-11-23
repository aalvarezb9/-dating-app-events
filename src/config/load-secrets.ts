import { Logger } from '@nestjs/common';
import { GetSecretValueCommand, SecretsManagerClient } from '@aws-sdk/client-secrets-manager';

/**
 * Puts the secrets of the platform in the environment before the application starts, so `SharedConfigService` reads them like any other
 * variable and nothing else in the code knows where they come from.
 *
 * `SECRETS_IDS` is a comma-separated list of Secrets Manager secrets (names or ARNs: `bookly/dev/support-token-secret,bookly/dev/inter-service-api-key`);
 * each one is a JSON object of text values, and every key becomes a variable. The point is that the value is read from Secrets Manager
 * when the function starts and is NOT a variable of the function: the Lambda console, the CloudFormation template and the deployment
 * logs never show it. The function needs `secretsmanager:GetSecretValue` on those secrets only.
 *
 * - A variable that is already set wins over the secret: a developer, a test or the local compose can override it.
 * - Without `SECRETS_IDS` it does nothing (locally the env files carry the values).
 * - A secret that cannot be read, or that is not a JSON object of text, stops the service at startup: starting without it would be worse.
 *
 * Call it once, first thing, before `NestFactory` (the entry of a Lambda and `main.ts`). Returns the names of the variables it set, never values.
 */
export async function loadSecrets(env: NodeJS.ProcessEnv = process.env): Promise<string[]> {
  const ids = (env.SECRETS_IDS ?? '')
    .split(',')
    .map((id) => id.trim())
    .filter(Boolean);
  if (ids.length === 0) {
    return [];
  }

  const client = new SecretsManagerClient({
    region: env.AWS_REGION,
    ...(env.AWS_ENDPOINT_URL ? { endpoint: env.AWS_ENDPOINT_URL } : {}),
  });
  const logger = new Logger('loadSecrets');
  const loaded: string[] = [];
  try {
    for (const id of ids) {
      const { SecretString } = await client.send(new GetSecretValueCommand({ SecretId: id }));
      let values: unknown;
      try {
        values = JSON.parse(SecretString ?? '');
      } catch {
        throw new Error(`The secret "${id}" is not JSON`);
      }
      if (typeof values !== 'object' || values === null || Array.isArray(values)) {
        throw new Error(`The secret "${id}" must be a JSON object of text values`);
      }
      for (const [name, value] of Object.entries(values)) {
        if (typeof value !== 'string') {
          throw new Error(`The key "${name}" of the secret "${id}" is not text`);
        }
        if (env[name] === undefined || env[name] === '') {
          env[name] = value;
          loaded.push(name);
        }
      }
    }
  } finally {
    client.destroy();
  }
  logger.log(`Secrets loaded from ${ids.length} secret(s): ${loaded.join(', ') || 'nothing new'}`);
  return loaded;
}
