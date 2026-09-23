import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { AppModule } from './app.module';

async function bootstrap(): Promise<void> {
  const envFiles = [resolve(process.cwd(), '.env'), resolve(process.cwd(), '../../.env')];
  const envFile = envFiles.find((path) => existsSync(path));
  if (envFile) process.loadEnvFile(envFile);

  const app = await NestFactory.create(AppModule);
  app.enableCors({ origin: process.env.WEB_ORIGIN ?? 'http://localhost:3000' });
  app.useGlobalPipes(
    new ValidationPipe({
      forbidNonWhitelisted: true,
      transform: true,
      whitelist: true
    })
  );
  await app.listen(Number(process.env.PORT ?? 3001));
}

void bootstrap();
