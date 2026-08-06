import { describe, expect, it } from 'vitest';
import request from 'supertest';
import { app } from './testServer.js';

// Covers commitCSV's validation branches via the real /email/inbound
// webhook — the exact behavior added so Make knows to retry instead of a
// malformed CSV being silently accepted with a 200.
describe('POST /email/inbound', () => {
  it('rejects an empty body with 422', async () => {
    const res = await request(app).post('/email/inbound').set('Content-Type', 'text/plain').send('');
    expect(res.status).toBe(422);
    expect(res.body.ok).toBe(false);
  });

  it('rejects a header-only CSV (no data row) with 422', async () => {
    const res = await request(app)
      .post('/email/inbound')
      .set('Content-Type', 'text/plain')
      .send('Vendor,Depot,Location');
    expect(res.status).toBe(422);
    expect(res.body.error).toMatch(/header row and at least one data row/i);
  });

  it('rejects unrecognized columns with 422', async () => {
    const res = await request(app)
      .post('/email/inbound')
      .set('Content-Type', 'text/plain')
      .send('Foo,Bar,Baz\n1,2,3');
    expect(res.status).toBe(422);
    expect(res.body.error).toMatch(/didn't match any expected CSV columns/i);
  });

  it('rejects rows that are all missing vendor/location with 422', async () => {
    const res = await request(app)
      .post('/email/inbound')
      .set('Content-Type', 'text/plain')
      .send('Vendor,Depot,Location,Size\n,,,');
    expect(res.status).toBe(422);
    expect(res.body.error).toMatch(/no usable rows/i);
  });

  it('accepts a valid CSV and inserts the row with 200', async () => {
    const res = await request(app)
      .post('/email/inbound')
      .set('Content-Type', 'text/plain')
      .send(
        'Vendor,Depot,Location,Size,Type,Condition,Color,Quantity,Price\n' +
          'csv-test@example.com,TestDepot,Test City TS,20,Dry,Used,,1,100'
      );
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ ok: true, inserted: 1, skipped: 0 });

    const list = await request(app).get('/api/containers');
    expect(list.body.rows).toHaveLength(1);
    expect(list.body.rows[0]).toMatchObject({ sender: 'csv-test@example.com', vendor: 'TestDepot' });
  });
});
