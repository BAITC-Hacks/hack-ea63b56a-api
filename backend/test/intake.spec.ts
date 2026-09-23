import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/common/configure-app';
import { ContractorsService } from '../src/contractors/contractors.service';
import { IntakeAiService, IntakeCatalog, IntakeExtraction } from '../src/intake/intake-ai.service';
import { IntakeService } from '../src/intake/intake.service';

const catalog: IntakeCatalog = {
  cities: ['Алматы', 'Астана', 'Зарубежье'],
  categories: ['Ведущий', 'Фотограф', 'Флорист'],
  eventFormats: ['день рождения', 'конференция', 'корпоратив', 'свадьба', 'той', 'юбилей'],
  languages: ['английский', 'казахский', 'русский'],
  calendar: { from: '2026-09-23', to: '2026-12-31' },
};

const emptyExtraction: IntakeExtraction = {
  city: null,
  date: null,
  eventFormat: null,
  category: null,
  budgetKzt: null,
  language: null,
  durationHours: null,
  assumptions: [],
  confidence: 0.5,
};

function service(extraction: IntakeExtraction | null) {
  const contractors = { catalog: () => catalog } as ContractorsService;
  const ai = { parse: jest.fn().mockResolvedValue(extraction) } as unknown as IntakeAiService;
  return { intake: new IntakeService(contractors, ai), ai };
}

describe('intake AI boundary', () => {
  const environment = { ...process.env };

  beforeEach(() => {
    delete process.env.OPENAI_API_KEY;
    process.env.OPENAI_MODEL = 'gpt-4o-mini';
    process.env.OPENAI_TIMEOUT_MS = '7000';
  });

  afterEach(() => {
    process.env = { ...environment };
    jest.useRealTimers();
  });

  it('uses Responses Structured Outputs without storing the prompt', async () => {
    const ai = new IntakeAiService();
    const output = { ...emptyExtraction, eventFormat: 'свадьба', budgetKzt: 65000, confidence: 0.9 };
    const parse = jest.fn().mockResolvedValue({ status: 'completed', output_parsed: output });
    Object.defineProperty(ai, 'client', { value: { responses: { parse } } });

    await expect(ai.parse('хочу свадьбу на 65000 тенге', catalog)).resolves.toEqual(output);
    const [body, options] = parse.mock.calls[0];
    expect(body.model).toBe('gpt-4o-mini');
    expect(body.store).toBe(false);
    expect(body.text.format.type).toBe('json_schema');
    expect(body.text.format.strict).toBe(true);
    expect(options.signal).toBeInstanceOf(AbortSignal);
    expect(JSON.parse(body.input[1].content)).toEqual({
      message: 'хочу свадьбу на 65000 тенге',
      catalog,
    });
  });

  it('returns null on API failure so the deterministic parser can continue', async () => {
    const ai = new IntakeAiService();
    const parse = jest.fn().mockRejectedValue(new Error('rate limited'));
    Object.defineProperty(ai, 'client', { value: { responses: { parse } } });
    await expect(ai.parse('свадьба', catalog)).resolves.toBeNull();
  });

  it('aborts a hung API call at the configured deadline', async () => {
    jest.useFakeTimers();
    const ai = new IntakeAiService();
    const parse = jest.fn().mockImplementation(() => new Promise(() => undefined));
    Object.defineProperty(ai, 'client', { value: { responses: { parse } } });
    const result = ai.parse('свадьба', catalog);
    await jest.advanceTimersByTimeAsync(7000);
    await expect(result).resolves.toBeNull();
    expect(parse.mock.calls[0][1].signal.aborted).toBe(true);
    expect(jest.getTimerCount()).toBe(0);
  });
});

describe('intake parsing and catalog normalization', () => {
  it('keeps AI values, supplements safe deterministic values and reports missing fields', async () => {
    const { intake } = service({
      ...emptyExtraction,
      eventFormat: 'свадьба',
      budgetKzt: 65000,
      confidence: 0.92,
    });
    const result = await intake.parse('хочу свадьбу на 65000 тенге');
    expect(result).toEqual({
      values: { eventFormat: 'свадьба', budgetKzt: 65000 },
      assumptions: [],
      missing: ['city', 'date', 'category'],
      confidence: 0.53,
      analysisMode: 'ai',
    });
  });

  it('parses understandable values without AI and never invents missing fields', async () => {
    const { intake } = service(null);
    const result = await intake.parse('Нужна свадьба в Алматы 15.10.2026, фотограф на 6 часов, бюджет 65 тысяч тенге, русский язык');
    expect(result.values).toEqual({
      city: 'Алматы',
      date: '2026-10-15',
      eventFormat: 'свадьба',
      category: 'Фотограф',
      budgetKzt: 65000,
      language: 'русский',
      durationHours: 6,
    });
    expect(result.missing).toEqual([]);
    expect(result.analysisMode).toBe('fallback');
    expect(result.confidence).toBe(0.85);
  });

  it('drops model values outside the real catalog and calendar', async () => {
    const { intake } = service({
      ...emptyExtraction,
      city: 'Караганда',
      date: '2027-01-10',
      eventFormat: 'фестиваль',
      category: 'Кейтеринг',
      language: 'немецкий',
      confidence: 1,
    });
    const result = await intake.parse('Организуем мероприятие');
    expect(result.values).toEqual({});
    expect(result.missing).toEqual(['city', 'date', 'eventFormat', 'category', 'budgetKzt']);
    expect(result.assumptions).toEqual(expect.arrayContaining([
      'Не удалось сопоставить поле city с каталогом.',
      'Не удалось сопоставить поле eventFormat с каталогом.',
      'Не удалось сопоставить поле category с каталогом.',
      'Не удалось сопоставить поле language с каталогом.',
      'Указанная дата не входит в доступный календарь.',
    ]));
    expect(result.confidence).toBe(0.1);
  });

  it('normalizes catalog casing but preserves the canonical catalog spelling', async () => {
    const { intake } = service({
      ...emptyExtraction,
      city: 'алматы',
      eventFormat: 'СВАДЬБА',
      category: 'фотограф',
      language: 'РУССКИЙ',
    });
    const result = await intake.parse('Алматы, свадьба, фотограф, русский');
    expect(result.values).toMatchObject({
      city: 'Алматы',
      eventFormat: 'свадьба',
      category: 'Фотограф',
      language: 'русский',
    });
  });
});

describe('intake HTTP contract', () => {
  let app: INestApplication;

  beforeAll(async () => {
    delete process.env.OPENAI_API_KEY;
    const module = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(IntakeAiService)
      .useValue({ parse: jest.fn().mockResolvedValue(null) })
      .compile();
    app = module.createNestApplication();
    configureApp(app);
    await app.init();
  });

  afterAll(async () => app.close());

  it('serves the partial parse response and documents it in Swagger', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/v1/intake/parse')
      .send({ message: '  хочу   свадьбу на 65000 тенге  ' })
      .expect(200);
    expect(response.body).toMatchObject({
      values: { eventFormat: 'свадьба', budgetKzt: 65000 },
      missing: ['city', 'date', 'category'],
      analysisMode: 'fallback',
    });
    const swagger = await request(app.getHttpServer()).get('/api/docs-json').expect(200);
    expect(swagger.body.paths['/api/v1/intake/parse'].post).toBeDefined();
    expect(swagger.body.components.schemas.IntakeParseResponseDto.properties.analysisMode.enum)
      .toEqual(['ai', 'fallback']);
  });

  it.each([
    {},
    { message: '' },
    { message: '   ' },
    { message: 65000 },
    { message: 'свадьба', extra: true },
    { message: 'x'.repeat(2001) },
  ])('rejects invalid request %#', async (body) => {
    await request(app.getHttpServer()).post('/api/v1/intake/parse').send(body).expect(400);
  });
});
