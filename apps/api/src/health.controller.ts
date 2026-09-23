import { Controller, Get } from '@nestjs/common';

class HealthResponseDto {
  status!: 'ok';
  service!: string;
}

@Controller('health')
export class HealthController {
  @Get()
  getHealth(): HealthResponseDto {
    return { service: 'hackalem-recommender-api', status: 'ok' };
  }
}
