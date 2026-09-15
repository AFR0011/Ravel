import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { RavelDatabase, ensureDatabaseSeeded } from '@/database';
import { getBalanceId } from '@/defaultData';
import type { Currency, Method } from '@/types';
import { createConversion, deleteConversion, updateConversion } from './conversionService';

let database: RavelDatabase;

beforeEach(async () => {
  database = new RavelDatabase(`RavelBackdatedConversionTest-${crypto.randomUUID()}`);
  await ensureDatabaseSeeded(database);
});

afterEach(async () => {
  await database.delete();
});

async function putOpeningBalance(
  currency: Currency,
  method: Method,
  amount: number,
  effectiveAt = '2026-05-18T09:00:00.000Z'
) {
  const balanceId = getBalanceId(currency, method);
  await database.balanceCheckpoints.put({
    id: `opening-${balanceId}`,
    balanceId,
    currency,
    method,
    kind: 'opening',
    observedAmount: amount,
    deltaAmount: amount,
    date: '2026-05-18',
    effectiveAt,
    month: '2026-05',
    createdAt: effectiveAt,
    updatedAt: effectiveAt,
  });
}

describe('backdated conversion lifecycle across an opening checkpoint', () => {
  it('applies create and update to current balances and reverses them on delete', async () => {
    await putOpeningBalance('USD', 'card', 100);
    await putOpeningBalance('TRY', 'cash', 1000);

    const created = await createConversion(
      {
        fromCurrency: 'USD',
        toCurrency: 'TRY',
        fromMethod: 'card',
        toMethod: 'cash',
        fromAmount: 10,
        toAmount: 400,
        date: '2026-05-17',
      },
      database,
      new Date('2026-05-20T12:00:00.000Z')
    );

    expect((await database.balances.get(getBalanceId('USD', 'card')))?.amount).toBe(90);
    expect((await database.balances.get(getBalanceId('TRY', 'cash')))?.amount).toBe(1400);

    await updateConversion(
      created.id,
      {
        fromCurrency: 'USD',
        toCurrency: 'TRY',
        fromMethod: 'card',
        toMethod: 'cash',
        fromAmount: 20,
        toAmount: 800,
        date: '2026-05-17',
      },
      database,
      new Date('2026-05-20T13:00:00.000Z')
    );

    expect((await database.balances.get(getBalanceId('USD', 'card')))?.amount).toBe(80);
    expect((await database.balances.get(getBalanceId('TRY', 'cash')))?.amount).toBe(1800);

    await deleteConversion(created.id, database);

    expect((await database.balances.get(getBalanceId('USD', 'card')))?.amount).toBe(100);
    expect((await database.balances.get(getBalanceId('TRY', 'cash')))?.amount).toBe(1000);
  });
});
