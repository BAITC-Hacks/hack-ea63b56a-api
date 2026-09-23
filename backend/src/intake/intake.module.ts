import { Module } from '@nestjs/common';
import { ContractorsModule } from '../contractors/contractors.module';
import { IntakeAiService } from './intake-ai.service';
import { IntakeController } from './intake.controller';
import { IntakeService } from './intake.service';

@Module({
  imports: [ContractorsModule],
  controllers: [IntakeController],
  providers: [IntakeService, IntakeAiService],
  exports: [IntakeService],
})
export class IntakeModule {}
