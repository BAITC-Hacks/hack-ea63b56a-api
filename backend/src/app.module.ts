import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { LoggerModule } from 'nestjs-pino';
import { ContractorsModule } from './contractors/contractors.module';
import { HealthModule } from './health/health.module';
import { RuntimeConfigModule } from './config/runtime-config.module';
import { RecommendationsModule } from './recommendations/recommendations.module';

@Module({
  imports: [
    RuntimeConfigModule,
    LoggerModule.forRoot({ pinoHttp: {
      level: process.env.NODE_ENV === 'test' ? 'silent' : 'info',
      transport: process.env.NODE_ENV === 'production' || process.env.NODE_ENV === 'test' ? undefined : { target: 'pino-pretty' },
      redact: ['req.headers.authorization', 'req.headers.cookie', 'req.headers["x-api-key"]'],
    } }),
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 60 }]),
    ContractorsModule, RecommendationsModule, HealthModule,
  ],
  providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class AppModule {}
