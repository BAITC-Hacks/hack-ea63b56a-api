import { Type } from 'class-transformer';
import {
  IsDateString,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Matches,
  Min
} from 'class-validator';

export class RecommendationRequestDto {
  @IsString()
  @IsNotEmpty()
  @Matches(/\S/)
  city!: string;

  @IsDateString({ strict: true })
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  date!: string;

  @IsString()
  @IsNotEmpty()
  @Matches(/\S/)
  eventType!: string;

  @IsString()
  @IsNotEmpty()
  @Matches(/\S/)
  category!: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(Number.MAX_SAFE_INTEGER)
  budgetKzt!: number;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(48)
  @IsOptional()
  durationHours?: number;

  @IsString()
  @IsOptional()
  language?: string;

  @IsString()
  @IsOptional()
  @MaxLength(4000)
  wishes?: string;
}

export class ParseRequestDto {
  @IsString()
  @IsNotEmpty()
  @Matches(/\S/)
  @MaxLength(4000)
  text!: string;
}
