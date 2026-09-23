import { Controller, Get, Query } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Contractor } from '../common/domain';
import {
  ContractorDatasetItemDto,
  ContractorsPageDto,
  ContractorsQueryDto,
  ProfileType,
} from './contractors.dto';
import { ContractorsService } from './contractors.service';

@ApiTags('contractors')
@Controller('contractors')
export class ContractorsController {
  constructor(private readonly contractors: ContractorsService) {}

  @Get()
  @ApiOperation({ summary: 'Просмотреть анонимизированный датасет подрядчиков' })
  @ApiOkResponse({ type: ContractorsPageDto })
  list(@Query() query: ContractorsQueryDto): ContractorsPageDto {
    const result = this.contractors.findPage({
      city: query.city,
      category: query.category,
      profileType: query.profileType,
      search: query.search,
      page: query.page,
      limit: query.limit,
    });
    return { ...result, items: result.items.map((contractor) => this.toDto(contractor)) };
  }

  private toDto(contractor: Contractor): ContractorDatasetItemDto {
    return {
      id: contractor.id,
      name: contractor.name,
      categories: [...contractor.categories],
      city: contractor.city,
      cityImputed: contractor.city_imputed,
      profileType: contractor.synthetic ? ProfileType.Synthetic : ProfileType.Real,
      isSynthetic: contractor.synthetic,
      priceFromKzt: contractor.priceFromKzt,
      priceImputed: contractor.price_imputed,
      eventFormats: [...contractor.eventFormats],
      languages: [...contractor.languages],
      maxHours: contractor.maxHours,
      busyDates: [...contractor.busyDates],
      description: contractor.description,
    };
  }
}
