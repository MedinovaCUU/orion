alter table public.user_module_permissions
add column if not exists sub_permissions jsonb not null default '{}'::jsonb;
