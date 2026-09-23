import { Body, Controller, HttpCode, Post } from '@nestjs/common';
import { ApiBadRequestResponse, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { RecommendationRequestDto, RecommendationResponseDto } from './recommendation.dto';
import { RecommendationsService } from './recommendations.service';

@ApiTags('recommendations')
@Controller('recommendations')
export class RecommendationsController {
  constructor(private readonly recommendations: RecommendationsService) {}

  @Post()
  @HttpCode(200)
  @ApiOkResponse({ type: RecommendationResponseDto })
  @ApiBadRequestResponse({ description: 'Invalid request or date outside the known calendar' })
  recommend(@Body() request: RecommendationRequestDto): Promise<RecommendationResponseDto> {
    return this.recommendations.recommend(request);
  }
}
