import { createClient } from "npm:@supabase/supabase-js@2.119.0";

const url = Deno.env.get("SUPABASE_URL")!;
const secret = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const admin = createClient(url, secret, {
    auth: { persistSession: false, autoRefreshToken: false }
});
const allowedOrigins = new Set(
    (Deno.env.get("ALLOWED_ORIGINS") || "https://crismejia10.github.io,http://127.0.0.1:5500,http://localhost:5500,educologia://app")
        .split(",").map(value => value.trim())
);

Deno.serve(async request => {
    const origin = request.headers.get("origin") || "";
    const headers = {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": allowedOrigins.has(origin) ? origin : "",
        "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Vary": "Origin"
    };
    const respond = (status: number, body: unknown) =>
        new Response(JSON.stringify(body), { status, headers });

    if (origin && !allowedOrigins.has(origin)) return respond(403, { error: "Origen no autorizado." });
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers });
    if (request.method !== "POST") return respond(405, { error: "Método no permitido." });

    const token = request.headers.get("Authorization")?.replace(/^Bearer /i, "");
    if (!token) return respond(401, { error: "Inicia sesión." });
    const { data: identity, error: authError } = await admin.auth.getUser(token);
    if (authError || !identity.user) return respond(401, { error: "La sesión no es válida." });
    const { data: profile, error: profileError } = await admin.from("edu_profiles")
        .select("role, active").eq("id", identity.user.id).single();
    if (profileError || profile?.role !== "admin" || !profile.active) {
        return respond(403, { error: "Solo administración puede gestionar cuentas." });
    }

    let input: { action: string; email?: string; name?: string; password?: string; id?: string };
    try {
        input = await request.json();
    } catch {
        return respond(400, { error: "Solicitud inválida." });
    }

    if (input.action === "create") {
        const email = String(input.email || "").trim().toLowerCase();
        const name = String(input.name || "").trim();
        const password = String(input.password || "");
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !name || name.length > 100 || email.length > 254 || password.length < 12) {
            return respond(400, { error: "Completa nombre, correo válido y contraseña temporal de al menos 12 caracteres." });
        }
        const { data, error } = await admin.auth.admin.createUser({
            email, password, email_confirm: true, user_metadata: { name }
        });
        if (error || !data.user) return respond(400, { error: error?.message || "No se pudo crear la cuenta." });
        // El trigger crea un perfil inactivo. Activarlo requiere el rol administrador.
        const caller = createClient(url, Deno.env.get("SUPABASE_ANON_KEY")!, {
            global: { headers: { Authorization: "Bearer " + token } },
            auth: { persistSession: false }
        });
        const { error: activationError } = await caller.rpc("edu_manage_teacher", {
            p_id: data.user.id, p_name: name, p_active: true
        });
        if (activationError) {
            // El fallo deja una cuenta sin acceso. Administración puede activarla desde la lista.
            return respond(409, { error: "La identidad se creó, pero quedó inactiva. Actívala en Cuentas docentes." });
        }
        return respond(200, { id: data.user.id });
    }

    if (input.action === "password") {
        if (!input.id || String(input.password || "").length < 12) {
            return respond(400, { error: "Usa una contraseña temporal de al menos 12 caracteres." });
        }
        const { data: teacher } = await admin.from("edu_profiles").select("role")
            .eq("id", input.id).single();
        if (teacher?.role !== "teacher") return respond(400, { error: "La cuenta docente no existe." });
        const { error } = await admin.auth.admin.updateUserById(input.id, { password: input.password });
        if (error) return respond(400, { error: "No se pudo cambiar la contraseña." });
        await admin.from("edu_audit").insert({
            actor_id: identity.user.id, action: "teacher:temporary_password", record_id: input.id
        });
        return respond(200, { ok: true });
    }
    return respond(400, { error: "Acción no permitida." });
});
