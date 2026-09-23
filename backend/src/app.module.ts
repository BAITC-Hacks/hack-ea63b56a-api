import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { LoggerModule } from 'nestjs-pino';
import { ContractorsModule } from './contractors/contractors.module';
import { HealthController } from './health/health.controller';
import { RecommendationsModule } from './recommendations/recommendations.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, envFilePath: '.env' }),
    LoggerModule.forRoot({ pinoHttp: { transport: process.env.NODE_ENV === 'production' ? undefined : { target: 'pino-pretty' }, redact: ['req.headers.authorization'] } }),
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 60 }]),
    ContractorsModule, RecommendationsModule,
  ],
  controllers: [HealthController],
  providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class AppModule {}
