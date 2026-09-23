import { Body, Controller, HttpCode, Post } from '@nestjs/common';
import { ApiBadRequestResponse, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { IntakeParseRequestDto, IntakeParseResponseDto } from './intake.dto';
import { IntakeService } from './intake.service';

@ApiTags('intake')
@Controller('intake')
export class IntakeController {
  constructor(private readonly intake: IntakeService) {}

  @Post('parse')
  @HttpCode(200)
  @ApiOkResponse({ type: IntakeParseResponseDto })
  @ApiBadRequestResponse({ description: 'Message must be a non-empty string up to 2000 characters' })
  parse(@Body() request: IntakeParseRequestDto): Promise<IntakeParseResponseDto> {
    return this.intake.parse(request.message);
  }
}
