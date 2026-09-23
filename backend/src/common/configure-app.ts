import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';

export function configureApp(app: INestApplication): void {
  const config = app.get(ConfigService);
  app.use(helmet());
  app.enableCors({ origin: config.get<string>('FRONTEND_ORIGIN', 'http://localhost:3000') });
  app.setGlobalPrefix('api/v1');
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
  const document = new DocumentBuilder()
    .setTitle('HackAlem contractor recommendations')
    .setDescription('Contractor recommendations for the supplied event parameters; prices are starting prices.')
    .setVersion('1.0')
    .build();
  SwaggerModule.setup('api/docs', app, SwaggerModule.createDocument(app, document));
}
