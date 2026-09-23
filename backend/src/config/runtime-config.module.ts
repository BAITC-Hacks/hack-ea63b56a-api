import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { validateEnvironment } from './environment';

@Module({
  imports: [ConfigModule.forRoot({ isGlobal: true, envFilePath: '.env', validate: validateEnvironment })],
  exports: [ConfigModule],
})
export class RuntimeConfigModule {}
