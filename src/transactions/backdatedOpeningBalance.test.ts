import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { RavelDatabase, ensureDatabaseSeeded } from '@/database';
import { getBalanceId } from '@/defaultData';
import { createTransaction } from './createTransaction';

let database: RavelDatabase;

beforeEach(async () => {
  database = new RavelDatabase(`RavelBackdatedOpeningTransaction-${crypto.randomUUID()}`);
  await ensureDatabaseSeeded(database);

  const balanceId = getBalanceId('TRY', 'card');
  const effectiveAt = '2026-01-10T12:00:00.000Z';
  await database.balanceCheckpoints.put({
    id: `opening-${balanceId}`,
    balanceId,
    currency: 'TRY',
    method: 'card',
    kind: 'opening',
    observedAmount: 500,
    deltaAmount: 500,
    date: '2026-01-10',
    effectiveAt,
    month: '2026-01',
    createdAt: effectiveAt,
    updatedAt: effectiveAt,
  });
});

afterEach(async () => {
  await database.delete();
});

describe('backdated transactions across an opening checkpoint', () => {
  it.each([
    ['before the opening date', '2026-01-09'],
    ['on the opening date', '2026-01-10'],
  ])('replays activity created later even when dated %s', async (_label, date) => {
    const now = new Date('2026-02-01T10:00:00.000Z');
    const transaction = await createTransaction(
      {
        type: 'expense',
        amount: 125,
        currency: 'TRY',
        title: 'Historical expense',
        categoryId: 'cat-food',
        method: 'card',
        date,
      },
      database,
      now
    );

    expect(transaction.occurredAt).toBeUndefined();
    await expect(database.balances.get(getBalanceId('TRY', 'card'))).resolves.toMatchObject({
      amount: 375,
    });
  });
});
