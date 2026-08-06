import { describe, expect, it } from 'vitest';
import {
  buildSqlFromFilters,
  cleanThousandSeparatorsInDollarAmounts,
  extractJson,
  formatPrice,
  getNormalizedLocation,
  normalizePrice,
  parseCsv,
} from '../../server.js';

describe('parseCsv', () => {
  it('parses a simple comma-separated grid', () => {
    const rows = parseCsv('a,b,c\n1,2,3');
    expect(rows).toEqual([
      ['a', 'b', 'c'],
      ['1', '2', '3'],
    ]);
  });

  it('respects quoted fields containing commas', () => {
    const rows = parseCsv('Vendor,Notes\nAcme,"Rush, priority"');
    expect(rows).toEqual([
      ['Vendor', 'Notes'],
      ['Acme', 'Rush, priority'],
    ]);
  });

  it('unescapes doubled quotes inside a quoted field', () => {
    const rows = parseCsv('Notes\n"He said ""hi"""');
    expect(rows).toEqual([['Notes'], ['He said "hi"']]);
  });

  it('strips CR from CRLF line endings', () => {
    const rows = parseCsv('a,b\r\n1,2\r\n');
    expect(rows).toEqual([
      ['a', 'b'],
      ['1', '2'],
    ]);
  });
});

describe('cleanThousandSeparatorsInDollarAmounts', () => {
  it('removes commas from dollar amounts', () => {
    expect(cleanThousandSeparatorsInDollarAmounts('Price: $1,800')).toBe('Price: $1800');
  });

  it('handles multiple amounts and decimals', () => {
    expect(cleanThousandSeparatorsInDollarAmounts('$12,345.67 and $2,000')).toBe('$12345.67 and $2000');
  });

  it('leaves non-dollar numbers alone', () => {
    expect(cleanThousandSeparatorsInDollarAmounts('Qty: 1,800')).toBe('Qty: 1,800');
  });
});

describe('normalizePrice', () => {
  it('strips currency formatting to a plain number', () => {
    expect(normalizePrice('$1,800')).toBe(1800);
  });

  it('handles decimals', () => {
    expect(normalizePrice('$12,345.67')).toBe(12345.67);
  });

  it('returns null for empty/unparseable input', () => {
    expect(normalizePrice('')).toBeNull();
    expect(normalizePrice(null)).toBeNull();
    expect(normalizePrice('N/A')).toBeNull();
  });
});

describe('formatPrice', () => {
  it('formats a number as a rounded dollar amount', () => {
    expect(formatPrice(1800)).toBe('$1,800');
  });

  it('formats the numeric string pg returns for NUMERIC columns', () => {
    expect(formatPrice('2025.00')).toBe('$2,025');
  });

  it('returns N/A for null/undefined/empty/NaN', () => {
    expect(formatPrice(null)).toBe('N/A');
    expect(formatPrice(undefined)).toBe('N/A');
    expect(formatPrice('')).toBe('N/A');
    expect(formatPrice('not a number')).toBe('N/A');
  });
});

describe('extractJson', () => {
  it('parses plain JSON', () => {
    expect(extractJson('{"a":1}')).toEqual({ a: 1 });
  });

  it('extracts JSON embedded in surrounding text', () => {
    expect(extractJson('Here you go: {"a":1} thanks')).toEqual({ a: 1 });
  });

  it('returns null for unparseable content', () => {
    expect(extractJson('not json at all')).toBeNull();
  });

  it('returns null for empty/nullish input', () => {
    expect(extractJson('')).toBeNull();
    expect(extractJson(null)).toBeNull();
  });
});

describe('getNormalizedLocation', () => {
  it('falls back to the trimmed input when nothing has been normalized yet', () => {
    expect(getNormalizedLocation('  Baltimore, MD  ')).toBe('Baltimore, MD');
  });

  it('returns an empty string for empty/nullish input', () => {
    expect(getNormalizedLocation('')).toBe('');
    expect(getNormalizedLocation(null)).toBe('');
  });
});

describe('buildSqlFromFilters', () => {
  it('builds an unfiltered query with the default sort when no filters are given', () => {
    const { sql, params } = buildSqlFromFilters({});
    expect(sql).toBe('SELECT * FROM containers  ORDER BY vendor ASC');
    expect(params).toEqual([]);
  });

  it('adds ILIKE conditions for each provided filter', () => {
    const { sql, params } = buildSqlFromFilters({ size: '40', color: 'red' });
    expect(sql).toContain('size ILIKE $1');
    expect(sql).toContain('color ILIKE $2');
    expect(params).toEqual(['40%', '%red%']);
  });

  it('applies the location filter only when there is no distance filter', () => {
    const withDistance = buildSqlFromFilters({ location: 'Baltimore, MD', maxDistance: 50 });
    expect(withDistance.sql).not.toContain('location ILIKE');

    const withoutDistance = buildSqlFromFilters({ location: 'Baltimore, MD' });
    expect(withoutDistance.sql).toContain('location ILIKE $1');
    expect(withoutDistance.params).toEqual(['%Baltimore%']);
  });

  it('caps the SQL LIMIT at 100 and moves it to jsLimit when a distance filter is present', () => {
    const noDistance = buildSqlFromFilters({ limit: 500 });
    expect(noDistance.sql).toContain('LIMIT 100');
    expect(noDistance.jsLimit).toBeNull();

    const withDistance = buildSqlFromFilters({ limit: 500, maxDistance: 50, location: 'x' });
    expect(withDistance.sql).not.toContain('LIMIT');
    expect(withDistance.jsLimit).toBe(100);
  });

  it('maps known sort keys to the right ORDER BY clause', () => {
    expect(buildSqlFromFilters({ sort: 'price_asc' }).sql).toContain('ORDER BY price ASC');
    expect(buildSqlFromFilters({ sort: 'price_desc' }).sql).toContain('ORDER BY price DESC');
    expect(buildSqlFromFilters({ sort: 'bogus' }).sql).toContain('ORDER BY vendor ASC');
  });
});
