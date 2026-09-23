import { validateEnvironment } from '../src/config/environment';

describe('configuration', () => {
  it('supplies local defaults and parses numeric environment values', () => {
    expect(validateEnvironment({ PORT: '3101', OPENAI_TIMEOUT_MS: '5000' })).toMatchObject({
      PORT: 3101, OPENAI_TIMEOUT_MS: 5000, OPENAI_API_KEY: '', FRONTEND_ORIGIN: 'http://localhost:3000',
    });
  });

  it.each([
    { PORT: 'not-a-port' }, { PORT: 0 }, { PORT: 65536 },
    { OPENAI_TIMEOUT_MS: 7001 }, { OPENAI_TIMEOUT_MS: 0 },
    { FRONTEND_ORIGIN: '*' }, { FRONTEND_ORIGIN: 'ftp://example.com' },
    { OPENAI_MODEL: ' ' }, { DATASET_PATH: '' },
  ])('rejects invalid environment %j', (environment) => {
    expect(() => validateEnvironment(environment)).toThrow('Invalid configuration');
  });

  it('never places a credential value in validation errors', () => {
    expect(() => validateEnvironment({ PORT: 'secret-value', OPENAI_API_KEY: 'test-credential' }))
      .toThrow('Invalid configuration: PORT');
  });
});
