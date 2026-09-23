import { Body, Controller, Get, Post } from '@nestjs/common';
import { CsvLoaderService } from './csv-loader.service';
import { ParseRequestDto, RecommendationRequestDto } from './dto/recommendation-request.dto';
import {
  MetadataResponseDto,
  ParsedRequestResponseDto,
  RecommendationResponseDto
} from './dto/recommendation-response.dto';
import { RecommenderService } from './recommender.service';
import { RequestParserService } from './request-parser.service';
import { OpenAiService } from './openai.service';

@Controller('recommendations')
export class RecommendationsController {
  constructor(
    private readonly recommender: RecommenderService,
    private readonly parser: RequestParserService,
    private readonly loader: CsvLoaderService,
    private readonly openAi: OpenAiService
  ) {}

  @Get('metadata')
  getMetadata(): MetadataResponseDto {
    return { ...this.loader.getMetadata(), ai: this.openAi.getStatus() };
  }

  @Post('parse')
  async parse(@Body() request: ParseRequestDto): Promise<ParsedRequestResponseDto> {
    return this.parser.parse(request.text);
  }

  @Post()
  async recommend(@Body() request: RecommendationRequestDto): Promise<RecommendationResponseDto> {
    return this.recommender.recommend(request);
  }
}
