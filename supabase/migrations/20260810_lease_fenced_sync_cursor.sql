begin;

create or replace function public.save_sync_cursor_with_account_lease(
  p_account_id uuid,
  p_provider text,
  p_worker_id text,
  p_lease_token uuid,
  p_resource text,
  p_cursor text,
  p_watermark timestamptz
)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if p_worker_id is null or btrim(p_worker_id) = '' then
    return false;
  end if;
  if p_provider not in ('google', 'microsoft') then
    return false;
  end if;
  if p_resource not in ('gmail_history','graph_mail_delta','google_calendar_sync','graph_calendar_delta','contacts') then
    return false;
  end if;
  if p_cursor is null or p_cursor = '' then
    return false;
  end if;

  perform 1
  from public.account_sync_leases l
  join public.connected_accounts a on a.id = l.account_id
  where l.account_id = p_account_id
    and l.provider = p_provider
    and l.lease_owner = p_worker_id
    and l.lease_token = p_lease_token
    and l.lease_expires_at > now()
    and a.provider = p_provider
    and a.status = 'active'
  for update of l;

  if not found then
    return false;
  end if;

  insert into public.sync_cursors as c (
    account_id,
    resource,
    cursor,
    watermark,
    failure_count,
    last_error_code,
    updated_at
  ) values (
    p_account_id,
    p_resource,
    p_cursor,
    p_watermark,
    0,
    null,
    now()
  )
  on conflict (account_id, resource) do update
    set cursor = excluded.cursor,
        watermark = excluded.watermark,
        failure_count = 0,
        last_error_code = null,
        updated_at = now();

  return true;
end;
$$;

revoke all on function public.save_sync_cursor_with_account_lease(uuid, text, text, uuid, text, text, timestamptz) from public, anon, authenticated;
grant execute on function public.save_sync_cursor_with_account_lease(uuid, text, text, uuid, text, text, timestamptz) to service_role;

commit;
