/**
 * Subdomain names a business cannot claim: they identify the platform itself (apps, APIs,
 * auth, e-mail, infrastructure) and would let a business impersonate it (e.g. login.<domain>)
 * or collide with real hosts. Compared after the same normalization used for claims.
 */
export const RESERVED_SUBDOMAINS: ReadonlySet<string> = new Set([
  // Platform apps and APIs
  'www', 'app', 'apps', 'api', 'admin', 'administrator', 'dashboard', 'panel', 'portal', 'console',
  'backoffice', 'staff', 'owner', 'business', 'user', 'users', 'customer', 'customers', 'account',
  'accounts', 'my', 'web', 'mobile', 'm',
  // Authentication and billing
  'auth', 'login', 'logout', 'signin', 'signup', 'register', 'oauth', 'sso', 'verify', 'password',
  'billing', 'payment', 'payments', 'checkout', 'invoice', 'invoices', 'subscribe',
  // Communication
  'mail', 'email', 'smtp', 'imap', 'pop', 'mx', 'webmail', 'newsletter', 'notifications', 'notify',
  // Support and content
  'support', 'help', 'docs', 'documentation', 'status', 'blog', 'news', 'about', 'contact', 'legal',
  'terms', 'privacy', 'security', 'abuse', 'info', 'press', 'careers',
  // Infrastructure and environments
  'cdn', 'static', 'assets', 'media', 'files', 'storage', 'images', 'img', 'download', 'downloads',
  'ftp', 'sftp', 'ssh', 'ns', 'ns1', 'ns2', 'dns', 'vpn', 'proxy', 'gateway', 'internal', 'root',
  'system', 'dev', 'develop', 'staging', 'stage', 'prod', 'production', 'test', 'testing', 'demo',
  'sandbox', 'beta', 'alpha', 'localhost', 'kafka', 'redis', 'postgres', 'db', 'database',
  // The brand and the public pages of the platform
  'bookly', 'usebookly', 'landing', 'waitlist', 'home', 'pricing', 'plans', 'features', 'jobs', 'team', 'partners',
]);
