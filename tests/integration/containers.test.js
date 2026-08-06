import { describe, expect, it } from 'vitest';
import request from 'supertest';
import { app } from './testServer.js';

async function addContainer(overrides = {}) {
  const res = await request(app)
    .post('/api/containers')
    .send({
      vendor: 'Test Depot',
      location: 'Test City, TS',
      size: '20',
      type: 'DC',
      container_condition: 'Used',
      color: 'Grey',
      quantity: 1,
      price: '$100',
      delivery: '',
      date: '2026-01-01',
      notes: '',
      sender: 'test@example.com',
      ...overrides,
    });
  expect(res.status).toBe(201);
  return res.body;
}

describe('GET /api/containers pagination', () => {
  it('returns { rows, total, limit, offset } with a sane default limit', async () => {
    await addContainer();
    const res = await request(app).get('/api/containers');
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('rows');
    expect(res.body).toHaveProperty('total', 1);
    expect(res.body.limit).toBeGreaterThan(0);
    expect(res.body.offset).toBe(0);
  });

  it('honors an explicit limit/offset', async () => {
    await addContainer({ vendor: 'A' });
    await addContainer({ vendor: 'B' });
    await addContainer({ vendor: 'C' });

    const res = await request(app).get('/api/containers?limit=2&offset=0');
    expect(res.body.rows).toHaveLength(2);
    expect(res.body.total).toBe(3);
    expect(res.body.limit).toBe(2);
  });

  it('caps an over-large limit instead of returning everything requested', async () => {
    const res = await request(app).get('/api/containers?limit=999999');
    expect(res.body.limit).toBeLessThanOrEqual(1000);
  });

  it('paging through offsets reconstructs the full set with no duplicates', async () => {
    for (let i = 0; i < 5; i++) await addContainer({ vendor: `Vendor ${i}` });

    let all = [];
    let offset = 0;
    let total = Infinity;
    while (offset < total) {
      const res = await request(app).get(`/api/containers?limit=2&offset=${offset}`);
      all = all.concat(res.body.rows);
      total = res.body.total;
      offset += res.body.rows.length;
      if (res.body.rows.length === 0) break;
    }
    expect(all).toHaveLength(5);
    expect(new Set(all.map((r) => r.id)).size).toBe(5);
  });
});

describe('container CRUD', () => {
  it('creates, updates, and deletes a record', async () => {
    const created = await addContainer({ vendor: 'Original' });
    expect(created.vendor).toBe('Original');

    const updateRes = await request(app)
      .put(`/api/containers/${created.id}`)
      .send({ ...created, vendor: 'Updated', price: '$200' });
    expect(updateRes.status).toBe(200);
    expect(updateRes.body.vendor).toBe('Updated');

    const deleteRes = await request(app).delete(`/api/containers/${created.id}`);
    expect(deleteRes.status).toBe(204);

    const list = await request(app).get('/api/containers');
    expect(list.body.rows).toHaveLength(0);
  });

  it('returns 404 when updating a record that does not exist', async () => {
    const res = await request(app)
      .put('/api/containers/00000000-0000-0000-0000-000000000000')
      .send({ vendor: 'x', location: 'x', quantity: 1, price: '1' });
    expect(res.status).toBe(404);
  });
});
