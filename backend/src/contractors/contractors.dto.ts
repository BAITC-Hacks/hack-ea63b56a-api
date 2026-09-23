import { Transform, Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, IsString, Max, MaxLength, Min, MinLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

const trim = ({ value }: { value: unknown }): unknown => typeof value === 'string' ? value.trim() : value;

export enum ProfileType {
  Real = 'real',
  Synthetic = 'synthetic',
}

export class ContractorsQueryDto {
  @ApiPropertyOptional({ example: 'Алматы' })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  city?: string;

  @ApiPropertyOptional({ example: 'Ведущий' })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  category?: string;

  @ApiPropertyOptional({ enum: ProfileType })
  @IsOptional()
  @IsEnum(ProfileType)
  profileType?: ProfileType;

  @ApiPropertyOptional({ description: 'Поиск по имени, ID, описанию и справочным полям', example: 'фотозона' })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  search?: string;

  @ApiPropertyOptional({ default: 1, minimum: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page = 1;

  @ApiPropertyOptional({ default: 12, minimum: 1, maximum: 50 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit = 12;
}

export class ContractorDatasetItemDto {
  @ApiProperty() id!: string;
  @ApiProperty() name!: string;
  @ApiProperty({ type: [String] }) categories!: string[];
  @ApiProperty() city!: string;
  @ApiProperty() cityImputed!: boolean;
  @ApiProperty({ enum: ProfileType }) profileType!: ProfileType;
  @ApiProperty() isSynthetic!: boolean;
  @ApiProperty() priceFromKzt!: number;
  @ApiProperty() priceImputed!: boolean;
  @ApiProperty({ type: [String] }) eventFormats!: string[];
  @ApiProperty({ type: [String] }) languages!: string[];
  @ApiProperty({ nullable: true, type: Number }) maxHours!: number | null;
  @ApiProperty({ type: [String] }) busyDates!: string[];
  @ApiProperty() description!: string;
}

export class ContractorsPageDto {
  @ApiProperty({ type: [ContractorDatasetItemDto] }) items!: ContractorDatasetItemDto[];
  @ApiProperty() total!: number;
  @ApiProperty() page!: number;
  @ApiProperty() limit!: number;
  @ApiProperty() totalPages!: number;
}
