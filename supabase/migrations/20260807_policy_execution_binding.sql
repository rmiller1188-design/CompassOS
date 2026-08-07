alter table public.outbound_actions
  add column if not exists approved_payload_hash text,
  add column if not exists approval_payload_revision integer;

alter table public.outbound_actions
  drop constraint if exists outbound_actions_approval_binding_pair;

alter table public.outbound_actions
  add constraint outbound_actions_approval_binding_pair check (
    (approved_payload_hash is null and approval_payload_revision is null)
    or
    (approved_payload_hash is not null and approval_payload_revision is not null)
  );

create or replace function public.bind_outbound_action_approval_payload()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.payload_hash is distinct from old.payload_hash
     or new.payload_revision is distinct from old.payload_revision then
    if old.status in ('approved', 'executing') then
      raise exception 'approved or executing outbound payload cannot be mutated';
    end if;
    new.approved_payload_hash := null;
    new.approval_payload_revision := null;
  end if;

  if new.status = 'approved' and old.status is distinct from 'approved' then
    new.approved_payload_hash := new.payload_hash;
    new.approval_payload_revision := new.payload_revision;
  elsif new.status in ('draft', 'pending_approval', 'failed', 'rejected', 'cancelled') then
    new.approved_payload_hash := null;
    new.approval_payload_revision := null;
  end if;

  if new.status = 'executing' and (
    new.approved_payload_hash is null
    or new.approval_payload_revision is null
    or new.approved_payload_hash is distinct from new.payload_hash
    or new.approval_payload_revision is distinct from new.payload_revision
  ) then
    raise exception 'executing outbound action requires exact persisted approval binding';
  end if;

  return new;
end;
$$;

drop trigger if exists outbound_actions_bind_approval_payload on public.outbound_actions;
create trigger outbound_actions_bind_approval_payload
before update on public.outbound_actions
for each row execute function public.bind_outbound_action_approval_payload();

create index if not exists outbound_actions_execution_binding_idx
  on public.outbound_actions (id, payload_revision, approved_payload_hash)
  where status = 'executing';
