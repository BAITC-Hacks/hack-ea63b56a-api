import { Body, Controller, HttpCode, Post } from '@nestjs/common';
import { ApiBadRequestResponse, ApiBody, ApiExtraModels, ApiOkResponse, ApiTags, getSchemaPath } from '@nestjs/swagger';
import { RecommendationRequestDto, RecommendationResponseDto } from './recommendation.dto';
import { RecommendationsService } from './recommendations.service';

@ApiTags('recommendations')
@ApiExtraModels(RecommendationRequestDto)
@Controller('recommendations')
export class RecommendationsController {
  constructor(private readonly recommendations: RecommendationsService) {}

  @Post()
  @HttpCode(200)
  @ApiBody({ schema: { allOf: [
    { $ref: getSchemaPath(RecommendationRequestDto) },
    { anyOf: [{ required: ['eventType'] }, { required: ['eventFormat'] }] },
  ] } })
  @ApiOkResponse({ type: RecommendationResponseDto })
  @ApiBadRequestResponse({ description: 'Invalid request or date outside the known calendar' })
  recommend(@Body() request: RecommendationRequestDto): Promise<RecommendationResponseDto> {
    return this.recommendations.recommend(request);
  }
}
