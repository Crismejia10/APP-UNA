-- Primero crea tu usuario en Authentication > Users del proyecto.
-- Sustituye TU_CORREO_AQUI por el correo de esa cuenta antes de ejecutar.
do $$
declare
    target_id uuid;
    target_email text := 'TU_CORREO_AQUI';
begin
    if target_email = 'TU_CORREO_AQUI' then
        raise exception 'Escribe el correo de tu primera cuenta administradora.';
    end if;
    select id into target_id from auth.users where lower(email) = lower(trim(target_email));
    if target_id is null then
        raise exception 'Primero crea esa cuenta en Authentication > Users.';
    end if;
    insert into public.edu_profiles(id, email, name, role, active)
    values (target_id, lower(trim(target_email)), 'Administración de Educología', 'admin', true)
    on conflict (id) do update set role = 'admin', active = true;
end;
$$;
