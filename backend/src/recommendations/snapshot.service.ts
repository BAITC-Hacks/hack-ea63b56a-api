import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { createHash, randomUUID } from 'node:crypto';
import { access, mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { constants } from 'node:fs';
import { resolve, join } from 'node:path';
import { z } from 'zod';
import { RecommendationResponseDto } from './recommendation.dto';

const CriterionSchema = z.object({
  key: z.enum(['city', 'category', 'eventFormat', 'date', 'budget', 'language', 'duration']),
  label: z.string().min(1),
  requested: z.string().min(1),
  offered: z.string().min(1),
  status: z.enum(['matched', 'different']),
}).strict();

const SnapshotSchema = z.object({
  status: z.enum(['matched', 'no_category_in_city', 'no_candidates_after_filters']),
  count: z.number().int().min(0).max(3), exactCount: z.number().int().min(0).max(3),
  alternativeCount: z.number().int().min(0).max(3), totalCandidates: z.number().int().nonnegative(),
  eligibleCount: z.number().int().nonnegative(), message: z.string().min(1),
  analysisMode: z.enum(['ai', 'fallback', 'not_needed']),
  exclusions: z.object({
    busy: z.number().int().nonnegative(), budget: z.number().int().nonnegative(),
    format: z.number().int().nonnegative(), language: z.number().int().nonnegative(),
    duration: z.number().int().nonnegative(),
  }).strict(),
  items: z.array(z.object({
    id: z.string(), name: z.string(), category: z.string(), city: z.string(),
    priceFromKzt: z.number().int().positive(), explanation: z.string().min(1),
    synthetic: z.boolean(), city_imputed: z.boolean(), price_imputed: z.boolean(),
    matchType: z.enum(['exact', 'alternative']), alternative: z.boolean(),
    availableDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    matchedFields: z.array(z.enum(['city', 'category', 'eventFormat', 'date', 'budget', 'language', 'duration'])),
    criteria: z.array(CriterionSchema).min(5).max(7),
    differences: z.array(z.object({
      field: z.enum(['date', 'budget', 'language', 'duration']),
      requested: z.union([z.string(), z.number()]),
      offered: z.union([z.string(), z.number()]),
      message: z.string().min(1),
    }).strict()),
  }).strict()).max(3),
}).strict().refine((value) => value.count === value.items.length &&
  value.count === value.exactCount + value.alternativeCount);

@Injectable()
export class SnapshotService implements OnModuleInit {
  private readonly logger = new Logger(SnapshotService.name);
  private readonly inFlight = new Map<string, Promise<RecommendationResponseDto>>();
  private readonly directory = resolve(process.env.CACHE_DIR || './cache');

  async onModuleInit(): Promise<void> {
    await mkdir(this.directory, { recursive: true });
    await access(this.directory, constants.W_OK);
  }

  key(payload: unknown): string {
    return createHash('sha256').update(JSON.stringify(payload)).digest('hex');
  }

  async getOrCreate(key: string, create: () => Promise<RecommendationResponseDto>, validate: (snapshot: RecommendationResponseDto) => boolean = () => true): Promise<RecommendationResponseDto> {
    const existing = this.inFlight.get(key);
    if (existing) return existing;
    const work = this.loadOrCreate(key, create, validate);
    this.inFlight.set(key, work);
    try { return await work; } finally { this.inFlight.delete(key); }
  }

  private async loadOrCreate(key: string, create: () => Promise<RecommendationResponseDto>, validate: (snapshot: RecommendationResponseDto) => boolean): Promise<RecommendationResponseDto> {
    const destination = join(this.directory, `${key}.json`);
    try {
      const decoded = SnapshotSchema.safeParse(JSON.parse(await readFile(destination, 'utf8')));
      if (decoded.success && validate(decoded.data as RecommendationResponseDto)) return decoded.data as RecommendationResponseDto;
      this.logger.warn('Invalid recommendation snapshot; recomputing');
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') this.logger.warn('Unreadable recommendation snapshot; recomputing');
    }
    const result = create();
    const valid = SnapshotSchema.parse(await result) as RecommendationResponseDto;
    await mkdir(this.directory, { recursive: true });
    const temporary = join(this.directory, `${key}.${randomUUID()}.tmp`);
    try {
      await writeFile(temporary, JSON.stringify(valid), { encoding: 'utf8', flag: 'wx' });
      await rename(temporary, destination);
    } catch (error) {
      await rm(temporary, { force: true });
      this.logger.error(`Could not persist recommendation snapshot: ${error instanceof Error ? error.message : 'unknown'}`);
      throw error;
    }
    return valid;
  }
}
