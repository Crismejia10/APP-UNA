import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function json(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

Deno.serve(async (request: Request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (request.method !== 'POST') return json({ error: 'Método no permitido.' }, 405);

  const authorization = request.headers.get('Authorization');
  if (!authorization?.startsWith('Bearer ')) return json({ error: 'Inicia sesión para continuar.' }, 401);

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const publishableKey = Deno.env.get('SUPABASE_ANON_KEY');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!supabaseUrl || !publishableKey || !serviceRoleKey) {
    return json({ error: 'La función no tiene la configuración de Supabase necesaria.' }, 500);
  }

  const actorClient = createClient(supabaseUrl, publishableKey, {
    global: { headers: { Authorization: authorization } },
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data: actorResult, error: actorError } = await actorClient.auth.getUser();
  if (actorError || !actorResult.user) return json({ error: 'La sesión no es válida.' }, 401);

  const { data: profile, error: profileError } = await actorClient
    .from('edu_profiles')
    .select('role,active')
    .eq('id', actorResult.user.id)
    .maybeSingle();
  if (profileError) return json({ error: 'No se pudo validar el perfil.' }, 500);
  if (profile?.role !== 'admin' || !profile.active) {
    return json({ error: 'Solo una cuenta de administración activa puede invitar docentes.' }, 403);
  }

  let body: { email?: unknown; name?: unknown };
  try {
    body = await request.json();
  } catch {
    return json({ error: 'El contenido de la solicitud no es válido.' }, 400);
  }
  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
  const name = typeof body.name === 'string' ? body.name.trim() : '';
  if (!email || email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return json({ error: 'Escribe un correo electrónico válido.' }, 400);
  }
  if (!name || name.length > 100) return json({ error: 'El nombre debe tener entre 1 y 100 caracteres.' }, 400);
  const origin = request.headers.get('origin');
  if (!origin || origin === 'null') {
    return json({ error: 'Abre la versión web publicada para enviar invitaciones.' }, 400);
  }
  let redirectTo: string;
  try {
    const parsedOrigin = new URL(origin);
    if (parsedOrigin.protocol !== 'https:' && parsedOrigin.hostname !== 'localhost') throw new Error();
    redirectTo = parsedOrigin.origin;
  } catch {
    return json({ error: 'La dirección de la aplicación debe usar HTTPS.' }, 400);
  }

  const adminClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { error: inviteError } = await adminClient.auth.admin.inviteUserByEmail(email, {
    data: { name, password_setup_required: true },
    redirectTo,
  });
  if (inviteError) return json({ error: inviteError.message }, 400);
  return json({ invited: true });
});
