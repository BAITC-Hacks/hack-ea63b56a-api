import { Module } from '@nestjs/common';
import { AiModule } from '../ai/ai.module';
import { ContractorsModule } from '../contractors/contractors.module';
import { MatchingModule } from '../matching/matching.module';
import { ExplainerService } from './explainer.service';
import { RecommendationsController } from './recommendations.controller';
import { RecommendationsService } from './recommendations.service';
import { SnapshotService } from './snapshot.service';

@Module({
  imports: [ContractorsModule, MatchingModule, AiModule],
  controllers: [RecommendationsController],
  providers: [RecommendationsService, ExplainerService, SnapshotService],
})
export class RecommendationsModule {}
