begin;

-- publish_football_data_abort() drops the STAGING version but leaves the
-- import run behind for the audit trail. football_data_import_runs.export_hash
-- is unique, so a second publish_football_data_begin() for the same export hit
-- a unique violation and the abort path could never actually be recovered
-- from. Re-running an export now reopens its run row instead of inserting a
-- second one.

create or replace function public.publish_football_data_begin(
  p_data_version text,
  p_export_hash text,
  p_source text default 'JSON_SCHEMA_V2_BATCHED'
)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  version_id uuid;
begin
  -- An export that already produced a version resumes it: chunks are
  -- idempotent, so a partial import can simply be replayed.
  select v.id into version_id
  from public.football_data_versions v
  where v.source_export_hash = p_export_hash;
  if found then return version_id; end if;

  insert into public.football_data_import_runs(source, status, export_hash)
  values (p_source, 'RUNNING', p_export_hash)
  on conflict (export_hash) do update
    set source = excluded.source,
        status = 'RUNNING',
        started_at = now(),
        finished_at = null;

  insert into public.football_data_versions(version_number, status, source_export_hash)
  values (p_data_version, 'STAGING', p_export_hash)
  returning id into version_id;

  return version_id;
end $$;

revoke all on function public.publish_football_data_begin(text, text, text) from public, anon, authenticated;
grant execute on function public.publish_football_data_begin(text, text, text) to service_role;

commit;
