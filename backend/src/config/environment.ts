import { z } from 'zod';

const EnvironmentSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(3001),
  FRONTEND_ORIGIN: z.string().url().refine((value) => /^https?:\/\//.test(value), 'Use HTTP or HTTPS').default('http://localhost:3000'),
  OPENAI_API_KEY: z.string().trim().default(''),
  OPENAI_MODEL: z.string().trim().min(1).default('gpt-4o-mini'),
  OPENAI_TIMEOUT_MS: z.coerce.number().int().min(1).max(7000).default(7000),
  DATASET_PATH: z.string().trim().min(1).optional(),
  CACHE_DIR: z.string().trim().min(1).default('./cache'),
}).passthrough();

export function validateEnvironment(environment: Record<string, unknown>): Record<string, unknown> {
  const result = EnvironmentSchema.safeParse(environment);
  if (!result.success) {
    // Report field names, never environment values (which can contain credentials).
    throw new Error(`Invalid configuration: ${result.error.issues.map((issue) => issue.path.join('.')).join(', ')}`);
  }
  return result.data;
}
