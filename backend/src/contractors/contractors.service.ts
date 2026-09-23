import { Injectable } from '@nestjs/common';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { CALENDAR_FROM, CALENDAR_TO, Contractor, normalize } from '../common/domain';
import { CsvContractorsLoader } from './csv-contractors.loader';

@Injectable()
export class ContractorsService {
  readonly contractors: Contractor[];
  readonly datasetHash: string;

  constructor(loader: CsvContractorsLoader = new CsvContractorsLoader()) {
    const path = process.env.DATASET_PATH
      ? resolve(process.env.DATASET_PATH)
      : resolve(__dirname, '../../data/contractors.csv');
    const loaded = loader.load(readFileSync(path));
    this.contractors = loaded.contractors;
    this.datasetHash = loaded.datasetHash;
  }

  catalog(): { cities: string[]; categories: string[]; eventFormats: string[]; languages: string[]; calendar: { from: string; to: string } } {
    const unique = (get: (contractor: Contractor) => string[]) =>
      [...new Map(this.contractors.flatMap(get).map((value) => [normalize(value), value])).values()]
        .sort((a, b) => a.localeCompare(b, 'ru'));
    return {
      cities: unique((c) => [c.city]), categories: unique((c) => c.categories),
      eventFormats: unique((c) => c.eventFormats), languages: unique((c) => c.languages),
      calendar: { from: CALENDAR_FROM, to: CALENDAR_TO },
    };
  }

  findPage(input: {
    city?: string;
    category?: string;
    profileType?: 'real' | 'synthetic';
    search?: string;
    page: number;
    limit: number;
  }): { items: Contractor[]; total: number; page: number; limit: number; totalPages: number } {
    const search = input.search ? normalize(input.search) : undefined;
    const filtered = this.contractors.filter((contractor) => {
      if (input.city && normalize(contractor.city) !== normalize(input.city)) return false;
      if (input.category && !contractor.categories.some((category) => normalize(category) === normalize(input.category!))) return false;
      if (input.profileType === 'synthetic' && !contractor.synthetic) return false;
      if (input.profileType === 'real' && contractor.synthetic) return false;
      if (!search) return true;
      return [
        contractor.id,
        contractor.name,
        contractor.city,
        contractor.description,
        ...contractor.categories,
        ...contractor.eventFormats,
        ...contractor.languages,
      ].some((value) => normalize(value).includes(search));
    });
    const totalPages = Math.max(1, Math.ceil(filtered.length / input.limit));
    const offset = (input.page - 1) * input.limit;
    return {
      items: filtered.slice(offset, offset + input.limit),
      total: filtered.length,
      page: input.page,
      limit: input.limit,
      totalPages,
    };
  }
}
