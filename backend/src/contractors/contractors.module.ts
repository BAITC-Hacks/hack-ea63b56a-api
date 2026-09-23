import { Module } from '@nestjs/common';
import { ContractorsService } from './contractors.service';
import { CsvContractorsLoader } from './csv-contractors.loader';

@Module({ providers: [CsvContractorsLoader, ContractorsService], exports: [ContractorsService] })
export class ContractorsModule {}
