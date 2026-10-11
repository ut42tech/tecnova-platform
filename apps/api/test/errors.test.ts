import { Hono } from 'hono';
import { describe, expect, it } from 'vitest';
import { CheckinError } from '../src/lib/checkin';
import { apiErrorHandler } from '../src/lib/errors';

describe('apiErrorHandler', () => {
  it('does not expose unexpected error messages', async () => {
    const app = new Hono();
    app.get('/unexpected', () => {
      throw new Error('upstream response contains a secret');
    });
    app.onError(apiErrorHandler);

    const response = await app.request('/unexpected');

    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({
      error: 'INTERNAL',
      message: 'internal server error',
    });
  });

  it('does not expose Sheets error messages for domain failures', async () => {
    const app = new Hono();
    app.get('/sheets-failure', () => {
      throw new CheckinError('SHEETS_WRITE_FAILED', 'Sheets response contains a secret');
    });
    app.onError(apiErrorHandler);

    const response = await app.request('/sheets-failure');

    expect(response.status).toBe(502);
    expect(await response.json()).toEqual({
      error: 'SHEETS_WRITE_FAILED',
      message: 'failed to save data',
    });
  });
});
