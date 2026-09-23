import { Test } from '@nestjs/testing';
import { CsvLoaderService } from '../src/recommendations/csv-loader.service';
import { ExplainerService } from '../src/recommendations/explainer.service';
import { RecommenderService } from '../src/recommendations/recommender.service';
import { RecommendationStatus } from '../src/recommendations/recommendation.types';
import { OpenAiService } from '../src/recommendations/openai.service';

describe('RecommenderService', () => {
  let service: RecommenderService;
  let loader: CsvLoaderService;

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      providers: [CsvLoaderService, ExplainerService, RecommenderService, {
        provide: OpenAiService,
        useValue: {
          getStatus: (): { enabled: boolean; model: string } => ({ enabled: false, model: 'test' }),
          explainRecommendations: (): Promise<null> => Promise.resolve(null)
        }
      }]
    }).compile();
    loader = module.get(CsvLoaderService);
    loader.onModuleInit();
    service = module.get(RecommenderService);
  });

  const baseRequest = {
    budgetKzt: 900_000,
    category: 'Ведущий',
    city: 'Алматы',
    date: '2026-10-15',
    durationHours: 5,
    eventType: 'корпоратив',
    language: 'русский',
    wishes: 'современный стиль и интеллектуальный юмор'
  };

  it('never recommends a contractor busy on the requested date', async () => {
    const response = await service.recommend(baseRequest);
    const busyIds = loader.getAll().filter((item) => item.busyDates.includes(baseRequest.date)).map((item) => item.id);
    expect(response.items.some((item) => busyIds.includes(item.id))).toBe(false);
  });

  it('distinguishes a missing category in the city', async () => {
    const response = await service.recommend({ ...baseRequest, category: 'Инструменталист', city: 'Астана' });
    expect(response.status).toBe(RecommendationStatus.NO_CATEGORY_IN_CITY);
  });

  it('explains when every candidate is filtered out', async () => {
    const response = await service.recommend({ ...baseRequest, budgetKzt: 1 });
    expect(response.status).toBe(RecommendationStatus.NO_CANDIDATES_AFTER_FILTERS);
    expect(response.filterSummary.some((reason) => reason.code === 'over_budget')).toBe(true);
  });

  it('returns a deterministic order and at most three results', async () => {
    const first = await service.recommend(baseRequest);
    const second = await service.recommend(baseRequest);
    expect(first.items.map((item) => item.id)).toEqual(second.items.map((item) => item.id));
    expect(first.items.length).toBeLessThanOrEqual(3);
  });
});
