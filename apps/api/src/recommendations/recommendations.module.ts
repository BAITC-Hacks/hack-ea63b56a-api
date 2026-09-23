import { Module } from '@nestjs/common';
import { CsvLoaderService } from './csv-loader.service';
import { ExplainerService } from './explainer.service';
import { RecommenderService } from './recommender.service';
import { RecommendationsController } from './recommendations.controller';
import { RequestParserService } from './request-parser.service';
import { OpenAiService } from './openai.service';

@Module({
  controllers: [RecommendationsController],
  providers: [CsvLoaderService, ExplainerService, OpenAiService, RecommenderService, RequestParserService]
})
export class RecommendationsModule {}
