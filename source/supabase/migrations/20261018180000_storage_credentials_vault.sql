-- The Edge Function's service-role client is the only API caller allowed to
-- retrieve the S3 credentials. Vault encrypts the value at rest.
create function public.av_storage_credentials()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select decrypted_secret::jsonb
  from vault.decrypted_secrets
  where name = 'antonovium_yc_s3_credentials'
  limit 1
$$;

revoke all on function public.av_storage_credentials() from public, anon, authenticated;
grant execute on function public.av_storage_credentials() to service_role;
