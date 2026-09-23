import { Module } from '@nestjs/common';
import { HealthController } from './health.controller';
import { RecommendationsModule } from './recommendations/recommendations.module';

@Module({
  controllers: [HealthController],
  imports: [RecommendationsModule]
})
export class AppModule {}
