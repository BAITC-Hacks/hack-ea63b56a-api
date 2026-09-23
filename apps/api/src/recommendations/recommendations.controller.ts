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

@Controller('recommendations')
export class RecommendationsController {
  constructor(
    private readonly recommender: RecommenderService,
    private readonly parser: RequestParserService,
    private readonly loader: CsvLoaderService
  ) {}

  @Get('metadata')
  getMetadata(): MetadataResponseDto {
    return this.loader.getMetadata();
  }

  @Post('parse')
  parse(@Body() request: ParseRequestDto): ParsedRequestResponseDto {
    return this.parser.parse(request.text);
  }

  @Post()
  recommend(@Body() request: RecommendationRequestDto): RecommendationResponseDto {
    return this.recommender.recommend(request);
  }
}
