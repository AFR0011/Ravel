-- Restore parity between server-side capture balance checks and the canonical
-- local ledger semantics for opening checkpoints.
--
-- Opening checkpoints are snapshots of the ledger state that existed when the
-- checkpoint was created. Any activity created later must be replayed even if
-- its business date is backdated before or onto the opening date.
-- Reconciliation checkpoints remain absolute observations and still require
-- explicit before/after ordering for ambiguous same-day historical activity.

create or replace function public.taptrack_calculated_balance(
  target_user_id uuid,
  target_currency text,
  target_method text
)
returns numeric
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  checkpoint_amount numeric := 0;
  checkpoint_date text;
  checkpoint_effective_at timestamptz;
  checkpoint_kind text;
  has_checkpoint boolean := false;
  ambiguous_count bigint := 0;
  transaction_delta numeric := 0;
  conversion_delta numeric := 0;
begin
  if target_currency !~ '^[A-Z]{3}$' then
    raise exception 'Unsupported TapTrack currency: %', target_currency;
  end if;
  if target_method not in ('cash', 'card') then
    raise exception 'Unsupported TapTrack method: %', target_method;
  end if;

  select c.observed_amount, c.date, c.effective_at, c.kind
    into checkpoint_amount, checkpoint_date, checkpoint_effective_at, checkpoint_kind
  from public.balance_checkpoints c
  where c.user_id = target_user_id
    and c.currency = target_currency
    and c.method = target_method
    and c.deleted_at is null
  order by c.effective_at desc, c.id desc
  limit 1;

  has_checkpoint := found;
  if not has_checkpoint then
    checkpoint_amount := 0;
  elsif checkpoint_kind not in ('opening', 'reconciliation') then
    raise exception 'Unsupported TapTrack checkpoint kind: %', checkpoint_kind;
  end if;

  if has_checkpoint and checkpoint_kind = 'reconciliation' then
    select
      (select count(*)
       from public.transactions t
       where t.user_id = target_user_id
         and t.currency = target_currency
         and t.method = target_method
         and t.deleted_at is null
         and t.occurred_at is null
         and t.created_at > checkpoint_effective_at
         and t.date = checkpoint_date)
      +
      (select count(*)
       from public.conversions c
       where c.user_id = target_user_id
         and c.deleted_at is null
         and c.occurred_at is null
         and c.created_at > checkpoint_effective_at
         and c.date = checkpoint_date
         and ((c.from_currency = target_currency and c.from_method = target_method)
              or (c.to_currency = target_currency and c.to_method = target_method)))
      into ambiguous_count;

    if ambiguous_count > 0 then
      raise exception 'TapTrack ledger contains unresolved same-day ordering for % %', target_currency, target_method;
    end if;
  end if;

  select coalesce(sum(case when t.type = 'income' then t.amount else -t.amount end), 0)
    into transaction_delta
  from public.transactions t
  where t.user_id = target_user_id
    and t.currency = target_currency
    and t.method = target_method
    and t.deleted_at is null
    and (
      not has_checkpoint
      or (checkpoint_kind = 'opening' and t.created_at > checkpoint_effective_at)
      or (
        checkpoint_kind = 'reconciliation'
        and (
          (t.occurred_at is not null and t.occurred_at > checkpoint_effective_at)
          or (
            t.occurred_at is null
            and t.created_at > checkpoint_effective_at
            and t.date > checkpoint_date
          )
        )
      )
    );

  select coalesce(sum(
    (case when c.to_currency = target_currency and c.to_method = target_method then c.to_amount else 0 end)
    - (case when c.from_currency = target_currency and c.from_method = target_method then c.from_amount else 0 end)
  ), 0)
    into conversion_delta
  from public.conversions c
  where c.user_id = target_user_id
    and c.deleted_at is null
    and ((c.from_currency = target_currency and c.from_method = target_method)
         or (c.to_currency = target_currency and c.to_method = target_method))
    and (
      not has_checkpoint
      or (checkpoint_kind = 'opening' and c.created_at > checkpoint_effective_at)
      or (
        checkpoint_kind = 'reconciliation'
        and (
          (c.occurred_at is not null and c.occurred_at > checkpoint_effective_at)
          or (
            c.occurred_at is null
            and c.created_at > checkpoint_effective_at
            and c.date > checkpoint_date
          )
        )
      )
    );

  return checkpoint_amount + transaction_delta + conversion_delta;
end;
$$;

revoke all on function public.taptrack_calculated_balance(uuid, text, text)
  from public, anon, authenticated;
grant execute on function public.taptrack_calculated_balance(uuid, text, text)
  to service_role;
