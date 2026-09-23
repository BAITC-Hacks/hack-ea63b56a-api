import { Type } from 'class-transformer';
import {
  IsDateString,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  Min
} from 'class-validator';

export class RecommendationRequestDto {
  @IsString()
  @IsNotEmpty()
  city!: string;

  @IsDateString({ strict: true })
  date!: string;

  @IsString()
  @IsNotEmpty()
  eventType!: string;

  @IsString()
  @IsNotEmpty()
  category!: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
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
  wishes?: string;
}

export class ParseRequestDto {
  @IsString()
  @IsNotEmpty()
  text!: string;
}
