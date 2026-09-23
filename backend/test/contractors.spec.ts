import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/common/configure-app';

describe('contractors dataset HTTP API', () => {
  let app: INestApplication;

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    const module = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = module.createNestApplication();
    configureApp(app);
    await app.init();
  });

  afterAll(async () => app.close());

  it('returns an explicit paginated anonymous dataset contract', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/v1/contractors?profileType=synthetic&limit=5&page=1')
      .expect(200);

    expect(response.body).toMatchObject({ total: 13, page: 1, limit: 5, totalPages: 3 });
    expect(response.body.items).toHaveLength(5);
    expect(response.body.items[0]).toEqual(expect.objectContaining({
      id: expect.any(String),
      name: expect.any(String),
      categories: expect.any(Array),
      city: expect.any(String),
      profileType: 'synthetic',
      isSynthetic: true,
      priceFromKzt: expect.any(Number),
      eventFormats: expect.any(Array),
      languages: expect.any(Array),
      busyDates: expect.any(Array),
      description: expect.any(String),
    }));
    expect(Object.keys(response.body.items[0]).sort()).toEqual([
      'busyDates', 'categories', 'city', 'cityImputed', 'description', 'eventFormats', 'id',
      'isSynthetic', 'languages', 'maxHours', 'name', 'priceFromKzt', 'priceImputed', 'profileType',
    ]);
  });

  it('combines city, compound category and search filters', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/v1/contractors?city=Алматы&category=Отель&search=HK-90011')
      .expect(200);

    expect(response.body.total).toBe(1);
    expect(response.body.items[0]).toMatchObject({ id: 'HK-90011', city: 'Алматы' });
    expect(response.body.items[0].categories).toContain('Отель');
  });

  it('validates filters and documents the endpoint in Swagger', async () => {
    await request(app.getHttpServer()).get('/api/v1/contractors?profileType=unknown').expect(400);
    await request(app.getHttpServer()).get('/api/v1/contractors?limit=51').expect(400);
    await request(app.getHttpServer()).get('/api/v1/contractors?extra=true').expect(400);

    const swagger = await request(app.getHttpServer()).get('/api/docs-json').expect(200);
    expect(swagger.body.paths['/api/v1/contractors'].get).toBeDefined();
    expect(swagger.body.components.schemas.ContractorsPageDto.properties.items).toBeDefined();
  });
});
