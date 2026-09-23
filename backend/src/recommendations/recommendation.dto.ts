import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsDateString, IsInt, IsNotEmpty, IsNumber, IsPositive, IsString, Matches, Max, MaxLength, Min, ValidateIf } from 'class-validator';
import { CALENDAR_FROM, CALENDAR_TO, normalize } from '../common/domain';

const trim = ({ value }: { value: unknown }): unknown => typeof value === 'string' ? value.trim().replace(/\s+/g, ' ') : value;

export class RecommendationRequestDto {
  @ApiProperty({ example: 'Алматы' }) @Transform(trim) @IsString() @IsNotEmpty() @MaxLength(100) city!: string;
  @ApiProperty({ example: '2026-10-15', description: `Calendar ${CALENDAR_FROM} through ${CALENDAR_TO}` })
  @IsString() @Matches(/^\d{4}-\d{2}-\d{2}$/) @IsDateString({ strict: true }) date!: string;
  @ApiPropertyOptional({ example: 'корпоратив', description: 'Event type; required unless eventFormat is supplied' })
  @Transform(trim) @ValidateIf((o: RecommendationRequestDto, value) => value !== undefined || o.eventFormat === undefined)
  @IsString() @IsNotEmpty() @MaxLength(100) eventType?: string;
  @ApiPropertyOptional({ example: 'корпоратив', description: 'Compatible alias for eventType; both values must agree if supplied together' })
  @Transform(trim) @ValidateIf((o: RecommendationRequestDto, value) => value !== undefined || o.eventType === undefined)
  @IsString() @IsNotEmpty() @MaxLength(100) eventFormat?: string;
  @ApiProperty({ example: 'Ведущий' }) @Transform(trim) @IsString() @IsNotEmpty() @MaxLength(100) category!: string;
  @ApiProperty({ example: 900000 }) @IsInt() @Min(1) @Max(Number.MAX_SAFE_INTEGER) budgetKzt!: number;
  @ApiPropertyOptional({ example: 'русский' }) @Transform(trim) @ValidateIf((_o, value) => value !== undefined) @IsString() @IsNotEmpty() @MaxLength(100) language?: string;
  @ApiPropertyOptional({ example: 6 }) @ValidateIf((_o, value) => value !== undefined) @IsNumber() @IsPositive() @Max(24) durationHours?: number;

  normalized() {
    return {
      city: normalize(this.city), date: this.date, eventFormat: normalize(this.eventType ?? this.eventFormat ?? ''),
      category: normalize(this.category), budgetKzt: this.budgetKzt,
      ...(this.language ? { language: normalize(this.language) } : {}),
      ...(this.durationHours !== undefined ? { durationHours: this.durationHours } : {}),
    };
  }
}

export enum RecommendationStatus {
  Matched = 'matched', NoCategoryInCity = 'no_category_in_city', NoCandidatesAfterFilters = 'no_candidates_after_filters',
}

export class ExclusionsDto {
  @ApiProperty() busy!: number;
  @ApiProperty() budget!: number;
  @ApiProperty() format!: number;
  @ApiProperty() language!: number;
  @ApiProperty() duration!: number;
}

export class MatchDifferenceDto {
  @ApiProperty({ enum: ['date', 'budget', 'language', 'duration'] })
  field!: 'date' | 'budget' | 'language' | 'duration';
  @ApiProperty({ oneOf: [{ type: 'string' }, { type: 'number' }] }) requested!: string | number;
  @ApiProperty({ oneOf: [{ type: 'string' }, { type: 'number' }] }) offered!: string | number;
  @ApiProperty() message!: string;
}

export class CriterionComparisonDto {
  @ApiProperty({ enum: ['city', 'category', 'eventFormat', 'date', 'budget', 'language', 'duration'] })
  key!: 'city' | 'category' | 'eventFormat' | 'date' | 'budget' | 'language' | 'duration';
  @ApiProperty() label!: string;
  @ApiProperty() requested!: string;
  @ApiProperty() offered!: string;
  @ApiProperty({ enum: ['matched', 'different'] }) status!: 'matched' | 'different';
}

export class RecommendationItemDto {
  @ApiProperty() id!: string;
  @ApiProperty() name!: string;
  @ApiProperty() category!: string;
  @ApiProperty() city!: string;
  @ApiProperty() priceFromKzt!: number;
  @ApiProperty() explanation!: string;
  @ApiProperty() synthetic!: boolean;
  @ApiProperty() city_imputed!: boolean;
  @ApiProperty() price_imputed!: boolean;
  @ApiProperty({ enum: ['exact', 'alternative'] }) matchType!: 'exact' | 'alternative';
  @ApiProperty() alternative!: boolean;
  @ApiProperty({ description: 'Date on which this card is available' }) availableDate!: string;
  @ApiProperty({ type: [String], enum: ['city', 'category', 'eventFormat', 'date', 'budget', 'language', 'duration'] })
  matchedFields!: string[];
  @ApiProperty({ type: [MatchDifferenceDto] }) differences!: MatchDifferenceDto[];
  @ApiProperty({ type: [CriterionComparisonDto] }) criteria!: CriterionComparisonDto[];
}

export class RecommendationResponseDto {
  @ApiProperty({ enum: RecommendationStatus }) status!: RecommendationStatus;
  @ApiProperty() count!: number;
  @ApiProperty() exactCount!: number;
  @ApiProperty() alternativeCount!: number;
  @ApiProperty() totalCandidates!: number;
  @ApiProperty() eligibleCount!: number;
  @ApiProperty() message!: string;
  @ApiProperty({ enum: ['ai', 'fallback', 'not_needed'] }) analysisMode!: 'ai' | 'fallback' | 'not_needed';
  @ApiProperty({ type: ExclusionsDto }) exclusions!: ExclusionsDto;
  @ApiProperty({ type: [RecommendationItemDto] }) items!: RecommendationItemDto[];
}
