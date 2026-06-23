import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../../src/app.js';

// Both data layers are mocked: the endpoint's job is wiring + validation +
// payload discrimination + facebook-url enforcement. The unit tests in
// tests/listings.test.ts cover the `Listing` upsert logic; the
// existing tests already cover `recordObservations` for the legacy path.
vi.mock('../../src/marketplace/marketObservations.js', () => ({
  recordObservations: vi.fn(async (docs: unknown[]) => docs.length),
}));

vi.mock('../../src/marketplace/listings.js', () => ({
  processObservation: vi.fn(async (obs: { listingId: string; price: number }) => ({
    listingId: obs.listingId,
    action: 'created' as const,
    priceChanged: false,
  })),
}));

import { recordObservations } from '../../src/marketplace/marketObservations.js';
import { processObservation } from '../../src/marketplace/listings.js';

const recordMock = vi.mocked(recordObservations);
const processMock = vi.mocked(processObservation);

beforeEach(() => {
  vi.clearAllMocks();
  recordMock.mockResolvedValue(0);
  processMock.mockImplementation(async (obs) => ({
    listingId: obs.listingId,
    action: 'created' as const,
    priceChanged: false,
  }));
});

const validListingObs = {
  marketplace: 'facebook',
  listingId: '1367953568531456',
  listingUrl: 'https://www.facebook.com/marketplace/item/1367953568531456',
  title: 'PS5 Disc edition',
  price: 1500,
  currency: 'ILS',
  searchQuery: 'ps5',
  location: 'Tel Aviv',
  observedAt: new Date().toISOString(),
};

const validLegacyObs = {
  name: 'PS5 Disc edition',
  price: 1500,
  currency: 'ILS',
  description: 'Used twice',
  url: 'https://www.facebook.com/marketplace/item/123',
};

describe('POST /marketplace/observe (integration)', () => {
  describe('new ObservedListing payload (search-page passive collection)', () => {
    it('routes valid listing to processObservation', async () => {
      const app = createApp();
      const res = await request(app)
        .post('/marketplace/observe')
        .send({ observations: [validListingObs], timestamp: new Date().toISOString() });

      expect(res.status).toBe(200);
      expect(res.body.processed).toBe(1);
      expect(res.body.saved).toBe(0);
      expect(res.body.skipped).toBe(0);
      expect(res.body.details).toHaveLength(1);
      expect(res.body.details[0].listingId).toBe('1367953568531456');
      expect(processMock).toHaveBeenCalledTimes(1);
      expect(recordMock).not.toHaveBeenCalled();
    });

    it('handles a batch of multiple listings', async () => {
      const app = createApp();
      const observations = Array.from({ length: 5 }, (_, i) => ({
        ...validListingObs,
        listingId: `item-${i}`,
        listingUrl: `https://www.facebook.com/marketplace/item/item-${i}`,
      }));
      const res = await request(app)
        .post('/marketplace/observe')
        .send({ observations });

      expect(res.status).toBe(200);
      expect(res.body.processed).toBe(5);
      expect(processMock).toHaveBeenCalledTimes(5);
    });

    it('rejects non-facebook URLs on facebook marketplace observations', async () => {
      const app = createApp();
      const res = await request(app)
        .post('/marketplace/observe')
        .send({
          observations: [
            {
              ...validListingObs,
              listingUrl: 'https://evil.example.com/marketplace/item/123',
            },
          ],
        });

      // No legacy + no listing succeeded → 400 ("no valid observations")
      expect(res.status).toBe(400);
      expect(processMock).not.toHaveBeenCalled();
    });

    it('accepts m.facebook.com subdomain', async () => {
      const app = createApp();
      const res = await request(app)
        .post('/marketplace/observe')
        .send({
          observations: [
            {
              ...validListingObs,
              listingUrl: 'https://m.facebook.com/marketplace/item/1367953568531456',
            },
          ],
        });

      expect(res.status).toBe(200);
      expect(res.body.processed).toBe(1);
    });

    it('skips listing observations with malformed listingUrl', async () => {
      const app = createApp();
      const res = await request(app)
        .post('/marketplace/observe')
        .send({
          observations: [
            { ...validListingObs, listingUrl: 'not-a-url' },
          ],
        });

      expect(res.status).toBe(400);
      expect(processMock).not.toHaveBeenCalled();
    });

    it('skips listing observations missing required fields but processes valid ones in same batch', async () => {
      const app = createApp();
      const goodObs = { ...validListingObs, listingId: 'good' };
      const badObs = { ...validListingObs, listingId: 'bad', title: '' };

      const res = await request(app)
        .post('/marketplace/observe')
        .send({ observations: [goodObs, badObs] });

      expect(res.status).toBe(200);
      expect(res.body.processed).toBe(1);
      expect(res.body.skipped).toBe(1);
      expect(processMock).toHaveBeenCalledTimes(1);
    });

    it('forwards the priceChanged flag from processObservation', async () => {
      processMock.mockResolvedValueOnce({
        listingId: validListingObs.listingId,
        action: 'updated',
        priceChanged: true,
      });

      const app = createApp();
      const res = await request(app)
        .post('/marketplace/observe')
        .send({ observations: [validListingObs] });

      expect(res.status).toBe(200);
      expect(res.body.details[0].action).toBe('updated');
      expect(res.body.details[0].priceChanged).toBe(true);
    });
  });

  describe('legacy payload (browse + item-detail collection)', () => {
    it('routes valid legacy obs to recordObservations', async () => {
      recordMock.mockResolvedValueOnce(1);
      const app = createApp();
      const res = await request(app)
        .post('/marketplace/observe')
        .send({ observations: [validLegacyObs] });

      expect(res.status).toBe(200);
      expect(res.body.saved).toBe(1);
      expect(res.body.processed).toBe(0);
      expect(recordMock).toHaveBeenCalledTimes(1);
      expect(processMock).not.toHaveBeenCalled();
    });

    it('rejects a payload with no valid observations', async () => {
      const app = createApp();
      const res = await request(app)
        .post('/marketplace/observe')
        .send({ observations: [{ junk: true }] });

      expect(res.status).toBe(400);
    });
  });

  describe('mixed batches', () => {
    it('handles a batch with both legacy and listing observations', async () => {
      recordMock.mockResolvedValueOnce(1);
      const app = createApp();
      const res = await request(app)
        .post('/marketplace/observe')
        .send({ observations: [validLegacyObs, validListingObs] });

      expect(res.status).toBe(200);
      expect(res.body.saved).toBe(1);
      expect(res.body.processed).toBe(1);
      expect(recordMock).toHaveBeenCalledTimes(1);
      expect(processMock).toHaveBeenCalledTimes(1);
    });
  });

  describe('envelope validation', () => {
    it('rejects empty observations array', async () => {
      const app = createApp();
      const res = await request(app)
        .post('/marketplace/observe')
        .send({ observations: [] });

      expect(res.status).toBe(400);
    });

    it('rejects missing observations field', async () => {
      const app = createApp();
      const res = await request(app).post('/marketplace/observe').send({});

      expect(res.status).toBe(400);
    });

    it('rejects batches > 50 observations', async () => {
      const app = createApp();
      const observations = Array.from({ length: 51 }, (_, i) => ({
        ...validListingObs,
        listingId: `item-${i}`,
        listingUrl: `https://www.facebook.com/marketplace/item/item-${i}`,
      }));
      const res = await request(app)
        .post('/marketplace/observe')
        .send({ observations });

      expect(res.status).toBe(400);
    });

    it('accepts boundary case: exactly 50 observations', async () => {
      const app = createApp();
      const observations = Array.from({ length: 50 }, (_, i) => ({
        ...validListingObs,
        listingId: `item-${i}`,
        listingUrl: `https://www.facebook.com/marketplace/item/item-${i}`,
      }));
      const res = await request(app)
        .post('/marketplace/observe')
        .send({ observations });

      expect(res.status).toBe(200);
      expect(res.body.processed).toBe(50);
    });
  });
});
