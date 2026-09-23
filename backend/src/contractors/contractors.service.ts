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
}
