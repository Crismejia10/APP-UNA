-- Ejecutar en el SQL Editor del proyecto. Operación transaccional.
-- Prefijos propios para conservar otras tablas del proyecto.
begin;

create schema if not exists educologia_private;
revoke all on schema educologia_private from public;
grant usage on schema educologia_private to authenticated;

create table if not exists public.edu_profiles (
    id uuid primary key references auth.users(id) on delete restrict,
    email text not null,
    name text not null check (length(trim(name)) between 1 and 100),
    role text not null default 'teacher' check (role in ('admin', 'teacher')),
    active boolean not null default false,
    created_at timestamptz not null default now()
);
create unique index if not exists edu_profiles_email_unique
    on public.edu_profiles (lower(email));

create table if not exists public.edu_equipment (
    id uuid primary key default gen_random_uuid(),
    name text not null check (length(trim(name)) between 1 and 100),
    category text not null default '' check (length(category) <= 80),
    model text not null default '' check (length(model) <= 100),
    serial text not null check (length(trim(serial)) between 1 and 100),
    code text not null default '' check (length(code) <= 80),
    location text not null default '' check (length(location) <= 100),
    status text not null default 'available'
        check (status in ('available', 'reserved', 'loaned', 'maintenance', 'retired')),
    created_at timestamptz not null default now()
);
create unique index if not exists edu_equipment_serial_unique
    on public.edu_equipment (upper(trim(serial)));
create unique index if not exists edu_equipment_code_unique
    on public.edu_equipment (upper(trim(code))) where trim(code) <> '';

create table if not exists public.edu_requests (
    id uuid primary key default gen_random_uuid(),
    equipment_id uuid not null references public.edu_equipment(id) on delete restrict,
    teacher_id uuid not null references public.edu_profiles(id) on delete restrict,
    teacher_name text not null,
    teacher_email text not null,
    equipment_name text not null,
    equipment_serial text not null,
    reason text not null check (length(trim(reason)) between 1 and 500),
    status text not null default 'pending'
        check (status in ('pending', 'approved', 'delivered', 'rejected', 'returned', 'cancelled')),
    created_at timestamptz not null default now(),
    resolved_at timestamptz,
    resolved_by uuid references public.edu_profiles(id),
    delivered_at timestamptz,
    delivered_by uuid references public.edu_profiles(id),
    due_at timestamptz,
    returned_at timestamptz,
    returned_by uuid references public.edu_profiles(id),
    check ((status = 'returned') = (returned_at is not null)),
    check (status not in ('delivered', 'returned') or (delivered_at is not null and due_at > delivered_at))
);
create unique index if not exists edu_one_active_loan
    on public.edu_requests (equipment_id) where status in ('approved', 'delivered');
create unique index if not exists edu_one_pending_request
    on public.edu_requests (equipment_id, teacher_id) where status = 'pending';
create index if not exists edu_requests_teacher_idx on public.edu_requests(teacher_id);
create index if not exists edu_requests_resolved_by_idx on public.edu_requests(resolved_by);
create index if not exists edu_requests_returned_by_idx on public.edu_requests(returned_by);
create index if not exists edu_requests_delivered_by_idx on public.edu_requests(delivered_by);

create table if not exists public.edu_audit (
    id bigint generated always as identity primary key,
    actor_id uuid,
    action text not null,
    record_id uuid not null,
    before_data jsonb,
    after_data jsonb,
    created_at timestamptz not null default now()
);

alter table public.edu_profiles enable row level security;
alter table public.edu_equipment enable row level security;
alter table public.edu_requests enable row level security;
alter table public.edu_audit enable row level security;
revoke all on public.edu_profiles, public.edu_equipment, public.edu_requests, public.edu_audit
    from anon, authenticated;
grant select on public.edu_profiles, public.edu_equipment, public.edu_requests, public.edu_audit
    to authenticated;
grant all on public.edu_profiles, public.edu_equipment, public.edu_requests, public.edu_audit
    to service_role;
grant usage, select on sequence public.edu_audit_id_seq to service_role;

-- Helper privado. Consulta el rol en la tabla, nunca en metadatos editables.
create or replace function educologia_private.actor_role()
returns text language sql stable security definer set search_path = ''
as $$
    select role from public.edu_profiles
    where id = (select auth.uid()) and active;
$$;
revoke all on function educologia_private.actor_role() from public, anon;
grant execute on function educologia_private.actor_role() to authenticated;

drop policy if exists edu_profiles_read on public.edu_profiles;
create policy edu_profiles_read on public.edu_profiles for select to authenticated
using (id = (select auth.uid()) or (select educologia_private.actor_role()) = 'admin');
drop policy if exists edu_equipment_read on public.edu_equipment;
create policy edu_equipment_read on public.edu_equipment for select to authenticated
using ((select educologia_private.actor_role()) = 'admin'
    or ((select educologia_private.actor_role()) = 'teacher' and status <> 'retired'));
drop policy if exists edu_requests_read on public.edu_requests;
create policy edu_requests_read on public.edu_requests for select to authenticated
using ((select educologia_private.actor_role()) = 'admin'
    or ((select educologia_private.actor_role()) = 'teacher' and teacher_id = (select auth.uid())));
drop policy if exists edu_audit_read on public.edu_audit;
create policy edu_audit_read on public.edu_audit for select to authenticated
using ((select educologia_private.actor_role()) = 'admin');

-- Las nuevas identidades quedan sin acceso hasta que administración las autorice.
create or replace function educologia_private.new_user()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
    insert into public.edu_profiles (id, email, name)
    values (new.id, new.email, left(coalesce(nullif(trim(new.raw_user_meta_data->>'name'), ''), new.email), 100));
    return new;
end;
$$;
revoke all on function educologia_private.new_user() from public, anon, authenticated;
drop trigger if exists educologia_new_user on auth.users;
create trigger educologia_new_user after insert on auth.users
for each row execute function educologia_private.new_user();

-- Mantiene sincronizado el correo después de una verificación de Auth.
create or replace function educologia_private.user_email_changed()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
    update public.edu_profiles set email = new.email where id = new.id;
    return new;
end;
$$;
revoke all on function educologia_private.user_email_changed() from public, anon, authenticated;
drop trigger if exists educologia_email_changed on auth.users;
create trigger educologia_email_changed after update of email on auth.users
for each row execute function educologia_private.user_email_changed();

create or replace function educologia_private.audit_change()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
    insert into public.edu_audit (actor_id, action, record_id, before_data, after_data)
    values (auth.uid(), tg_table_name || ':' || tg_op, new.id,
        case when tg_op = 'UPDATE' then to_jsonb(old) else null end, to_jsonb(new));
    return new;
end;
$$;
revoke all on function educologia_private.audit_change() from public, anon, authenticated;
drop trigger if exists edu_equipment_audit on public.edu_equipment;
create trigger edu_equipment_audit after insert or update on public.edu_equipment
for each row execute function educologia_private.audit_change();
drop trigger if exists edu_requests_audit on public.edu_requests;
create trigger edu_requests_audit after insert or update on public.edu_requests
for each row execute function educologia_private.audit_change();
drop trigger if exists edu_profiles_audit on public.edu_profiles;
create trigger edu_profiles_audit after insert or update on public.edu_profiles
for each row execute function educologia_private.audit_change();

create or replace function public.edu_save_equipment(p_items jsonb)
returns void language plpgsql security definer set search_path = ''
as $$
declare
    item jsonb;
    equipment public.edu_equipment;
    item_id uuid;
    next_status text;
begin
    if educologia_private.actor_role() is distinct from 'admin' then
        raise exception 'Solo administración puede gestionar equipos.' using errcode = '42501';
    end if;
    if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) not between 1 and 100 then
        raise exception 'Envía entre 1 y 100 equipos.';
    end if;
    for item in select value from jsonb_array_elements(p_items) loop
        item_id := nullif(item->>'id', '')::uuid;
        if item_id is null then
            insert into public.edu_equipment (name, category, model, serial, code, location)
            values (trim(item->>'name'), coalesce(trim(item->>'category'), ''),
                coalesce(trim(item->>'model'), ''), trim(item->>'serial'),
                coalesce(trim(item->>'code'), ''), coalesce(trim(item->>'location'), ''));
        else
            select * into equipment from public.edu_equipment where id = item_id for update;
            if not found or equipment.status = 'retired' then raise exception 'El equipo ya no se puede editar.'; end if;
            if exists (select 1 from public.edu_requests where equipment_id = item_id)
                and upper(trim(item->>'serial')) is distinct from upper(trim(equipment.serial)) then
                raise exception 'Conserva la serie del equipo que ya tiene historial.';
            end if;
            next_status := coalesce(item->>'status', equipment.status);
            if equipment.status in ('reserved', 'loaned') then
                if next_status <> equipment.status then raise exception 'Resuelve primero la reserva o el préstamo.'; end if;
            elsif next_status not in ('available', 'maintenance') then
                raise exception 'Condición del equipo no permitida.';
            end if;
            update public.edu_equipment set
                name = trim(item->>'name'), category = coalesce(trim(item->>'category'), ''),
                model = coalesce(trim(item->>'model'), ''), serial = trim(item->>'serial'),
                code = coalesce(trim(item->>'code'), ''), location = coalesce(trim(item->>'location'), ''),
                status = next_status
            where id = item_id;
            if next_status = 'maintenance' then
                update public.edu_requests set status = 'cancelled', resolved_at = now(), resolved_by = auth.uid()
                where equipment_id = item_id and status = 'pending';
            end if;
        end if;
    end loop;
end;
$$;

create or replace function public.edu_set_equipment_status(p_id uuid, p_status text)
returns void language plpgsql security definer set search_path = ''
as $$
declare equipment public.edu_equipment;
begin
    if educologia_private.actor_role() is distinct from 'admin' then
        raise exception 'Solo administración puede cambiar el estado.' using errcode = '42501';
    end if;
    if p_status is null or p_status not in ('available', 'maintenance', 'retired') then
        raise exception 'Estado no permitido.';
    end if;
    select * into equipment from public.edu_equipment where id = p_id for update;
    if not found then raise exception 'El equipo no existe.'; end if;
    if equipment.status in ('reserved', 'loaned') then raise exception 'Resuelve primero la reserva o el préstamo.'; end if;
    update public.edu_equipment set status = p_status where id = p_id;
    if p_status in ('maintenance', 'retired') then
        update public.edu_requests set status = 'cancelled', resolved_at = now(), resolved_by = auth.uid()
        where equipment_id = p_id and status = 'pending';
    end if;
end;
$$;

create or replace function public.edu_request_equipment(p_equipment_id uuid, p_reason text)
returns uuid language plpgsql security definer set search_path = ''
as $$
declare equipment public.edu_equipment; person public.edu_profiles; request_id uuid;
begin
    if educologia_private.actor_role() is distinct from 'teacher' then
        raise exception 'Solo los docentes pueden solicitar equipos.' using errcode = '42501';
    end if;
    select * into equipment from public.edu_equipment where id = p_equipment_id for update;
    if not found or equipment.status <> 'available' then raise exception 'Este equipo ya no está disponible.'; end if;
    select * into person from public.edu_profiles where id = auth.uid();
    insert into public.edu_requests (
        equipment_id, teacher_id, teacher_name, teacher_email, equipment_name, equipment_serial, reason
    ) values (equipment.id, person.id, person.name, person.email, equipment.name, equipment.serial, trim(p_reason))
    returning id into request_id;
    return request_id;
end;
$$;

create or replace function public.edu_resolve_request(p_id uuid, p_action text, p_due_at timestamptz default null)
returns void language plpgsql security definer set search_path = ''
as $$
declare
    request public.edu_requests;
    equipment public.edu_equipment;
    equipment_id uuid;
    actor text;
begin
    actor := educologia_private.actor_role();
    if actor is null then raise exception 'Tu cuenta no tiene acceso.' using errcode = '42501'; end if;
    if p_action is null or p_action not in ('approve', 'reject', 'deliver', 'return', 'cancel') then
        raise exception 'Acción no permitida.';
    end if;
    -- Todas las operaciones bloquean primero el equipo para evitar aprobaciones simultáneas.
    select r.equipment_id into equipment_id from public.edu_requests r where id = p_id;
    if equipment_id is null then raise exception 'La solicitud no existe.'; end if;
    select * into equipment from public.edu_equipment where id = equipment_id for update;
    select * into request from public.edu_requests where id = p_id for update;
    if p_action = 'cancel' then
        if not ((actor = 'teacher' and request.teacher_id = auth.uid() and request.status = 'pending')
            or (actor = 'admin' and request.status = 'approved')) then
            raise exception 'No puedes cancelar esta solicitud.' using errcode = '42501';
        end if;
        update public.edu_requests set status = 'cancelled', resolved_at = now(), resolved_by = auth.uid() where id = p_id;
        if request.status = 'approved' then
            update public.edu_equipment set status = 'available' where id = equipment_id;
        end if;
        return;
    end if;
    if actor <> 'admin' then raise exception 'Solo administración puede resolver solicitudes.' using errcode = '42501'; end if;
    if p_action = 'deliver' then
        if request.status <> 'approved' or equipment.status <> 'reserved' then
            raise exception 'Solo se puede entregar una reserva aprobada.';
        end if;
        if p_due_at is null or p_due_at <= now() then raise exception 'La devolución debe ser posterior a la entrega.'; end if;
        update public.edu_requests set status = 'delivered', delivered_at = now(), delivered_by = auth.uid(), due_at = p_due_at
        where id = p_id;
        update public.edu_equipment set status = 'loaned' where id = equipment_id;
    elsif p_action = 'return' then
        if request.status = 'returned' then return; end if;
        if request.status <> 'delivered' then raise exception 'El préstamo no está activo.'; end if;
        update public.edu_requests set status = 'returned', returned_at = now(), returned_by = auth.uid() where id = p_id;
        update public.edu_equipment set status = 'available' where id = equipment_id;
    else
        if request.status <> 'pending' then raise exception 'La solicitud ya fue resuelta.'; end if;
        if p_action = 'approve' then
            if equipment.status <> 'available' then raise exception 'El equipo ya no está disponible.'; end if;
            if not exists (select 1 from public.edu_profiles where id = request.teacher_id and active) then
                raise exception 'La cuenta solicitante está desactivada.';
            end if;
            update public.edu_equipment set status = 'reserved' where id = equipment_id;
        end if;
        update public.edu_requests set
            status = case when p_action = 'approve' then 'approved' else 'rejected' end,
            resolved_at = now(), resolved_by = auth.uid()
        where id = p_id;
    end if;
end;
$$;

create or replace function public.edu_manage_teacher(p_id uuid, p_name text, p_active boolean)
returns void language plpgsql security definer set search_path = ''
as $$
begin
    if educologia_private.actor_role() is distinct from 'admin' then
        raise exception 'Solo administración puede gestionar cuentas.' using errcode = '42501';
    end if;
    if p_active is null or p_name is null then raise exception 'Completa el nombre y el estado.'; end if;
    update public.edu_profiles set name = trim(p_name), active = p_active
    where id = p_id and role = 'teacher';
    if not found then raise exception 'La cuenta docente no existe.'; end if;
    if not p_active then
        update public.edu_requests set status = 'cancelled', resolved_at = now(), resolved_by = auth.uid()
        where teacher_id = p_id and status = 'pending';
    end if;
end;
$$;

revoke all on function public.edu_save_equipment(jsonb) from public, anon;
revoke all on function public.edu_set_equipment_status(uuid, text) from public, anon;
revoke all on function public.edu_request_equipment(uuid, text) from public, anon;
revoke all on function public.edu_resolve_request(uuid, text, timestamptz) from public, anon;
revoke all on function public.edu_manage_teacher(uuid, text, boolean) from public, anon;
grant execute on function public.edu_save_equipment(jsonb) to authenticated;
grant execute on function public.edu_set_equipment_status(uuid, text) to authenticated;
grant execute on function public.edu_request_equipment(uuid, text) to authenticated;
grant execute on function public.edu_resolve_request(uuid, text, timestamptz) to authenticated;
grant execute on function public.edu_manage_teacher(uuid, text, boolean) to authenticated;

-- La primera cuenta administradora se autoriza explícitamente después de crearla en Auth.
notify pgrst, 'reload schema';
commit;
