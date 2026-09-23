import { Module } from '@nestjs/common';
import { ContractorsController } from './contractors.controller';
import { ContractorsService } from './contractors.service';
import { CsvContractorsLoader } from './csv-contractors.loader';

@Module({
  controllers: [ContractorsController],
  providers: [CsvContractorsLoader, ContractorsService],
  exports: [ContractorsService],
})
export class ContractorsModule {}
