export function loadServerEnv(): void {
  try {
    process.loadEnvFile(new URL('../../.env', import.meta.url));
  } catch {
    // If .env does not exist or cannot be read, environment variables remain as-is,
    // which triggers the fail-loudly check in test suites.
  }
}
