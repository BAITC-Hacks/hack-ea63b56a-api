import { Controller, Get } from '@nestjs/common';
import { ApiOkResponse, ApiProperty, ApiTags } from '@nestjs/swagger';
import { ContractorsService } from '../contractors/contractors.service';

class HealthResponseDto {
  @ApiProperty({ enum: ['ok'] }) status!: 'ok';
  @ApiProperty() contractors!: number;
}

class CalendarDto {
  @ApiProperty() from!: string;
  @ApiProperty() to!: string;
}

class CatalogResponseDto {
  @ApiProperty({ type: [String] }) cities!: string[];
  @ApiProperty({ type: [String] }) categories!: string[];
  @ApiProperty({ type: [String] }) eventFormats!: string[];
  @ApiProperty({ type: [String] }) languages!: string[];
  @ApiProperty({ type: CalendarDto }) calendar!: CalendarDto;
}

@ApiTags('catalog')
@Controller()
export class HealthController {
  constructor(private readonly contractors: ContractorsService) {}

  @Get('health')
  @ApiOkResponse({ type: HealthResponseDto })
  health(): HealthResponseDto { return { status: 'ok', contractors: this.contractors.contractors.length }; }

  @Get('catalog')
  @ApiOkResponse({ type: CatalogResponseDto })
  catalog(): CatalogResponseDto { return this.contractors.catalog(); }
}
