import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

const trim = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.trim().replace(/\s+/g, ' ') : value;

export class IntakeParseRequestDto {
  @ApiProperty({ example: 'Хочу свадьбу на 65000 тенге' })
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(2000)
  message!: string;
}

export class IntakeValuesDto {
  @ApiPropertyOptional({ example: 'Алматы' }) city?: string;
  @ApiPropertyOptional({ example: '2026-10-15' }) date?: string;
  @ApiPropertyOptional({ example: 'свадьба' }) eventFormat?: string;
  @ApiPropertyOptional({ example: 'Фотограф' }) category?: string;
  @ApiPropertyOptional({ example: 65000 }) budgetKzt?: number;
  @ApiPropertyOptional({ example: 'русский' }) language?: string;
  @ApiPropertyOptional({ example: 6 }) durationHours?: number;
}

export class IntakeParseResponseDto {
  @ApiProperty({ type: IntakeValuesDto }) values!: IntakeValuesDto;
  @ApiProperty({ type: [String] }) assumptions!: string[];
  @ApiProperty({ type: [String], example: ['city', 'date', 'category'] }) missing!: string[];
  @ApiProperty({ minimum: 0, maximum: 1, example: 0.74 }) confidence!: number;
  @ApiProperty({ enum: ['ai', 'fallback'] }) analysisMode!: 'ai' | 'fallback';
}
