import { Module } from '@nestjs/common';
import { ContractorsModule } from '../contractors/contractors.module';
import { HealthController } from './health.controller';

@Module({ imports: [ContractorsModule], controllers: [HealthController] })
export class HealthModule {}
