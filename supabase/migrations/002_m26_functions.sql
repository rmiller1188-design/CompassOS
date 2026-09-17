begin;

create or replace function public.is_workspace_member(target_workspace uuid)
returns boolean language sql stable security definer set search_path=public as $$
  select exists(select 1 from public.workspace_members wm where wm.workspace_id=target_workspace and wm.user_id=auth.uid());
$$;

create or replace function public.is_workspace_admin(target_workspace uuid)
returns boolean language sql stable security definer set search_path=public as $$
  select exists(select 1 from public.workspace_members wm where wm.workspace_id=target_workspace and wm.user_id=auth.uid() and wm.role in ('owner','admin'));
$$;

create or replace function public.bootstrap_compass_user(target_user uuid, target_email text, metadata jsonb default '{}'::jsonb)
returns void language plpgsql security definer set search_path=public as $$
declare
  workspace_id uuid;
  display_name text;
begin
  if exists(select 1 from public.profiles where owner_id=target_user and kind='personal') then return; end if;
  display_name := coalesce(nullif(metadata->>'full_name',''), nullif(metadata->>'name',''), split_part(coalesce(target_email,'You'),'@',1), 'You');
  insert into public.workspaces(name,kind,created_by) values (display_name || '''s Private Space','personal',target_user) returning id into workspace_id;
  insert into public.workspace_members(workspace_id,user_id,role) values (workspace_id,target_user,'owner');
  insert into public.profiles(owner_id,personal_workspace_id,kind,display_name) values (target_user,workspace_id,'personal',display_name);
end;
$$;

create or replace function public.handle_new_auth_user()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  perform public.bootstrap_compass_user(new.id,new.email,new.raw_user_meta_data);
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_auth_user();

do $$ declare r record; begin
  for r in select id,email,raw_user_meta_data from auth.users loop
    perform public.bootstrap_compass_user(r.id,r.email,r.raw_user_meta_data);
  end loop;
end $$;


commit;
