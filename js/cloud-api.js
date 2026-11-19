import { config } from './config.js';

const client = window.supabase.createClient(config.url, config.publishableKey, {
    auth: {
        storage: window.sessionStorage,
        storageKey: 'educologia-cloud-session',
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true
    }
});

function checked(result) {
    if (result.error) {
        const error = result.error;
        if (error.code === '23505') throw new Error('Ya existe esa serie, código o solicitud pendiente.');
        if (error.code === '42501') throw new Error('Tu cuenta no tiene permiso para realizar esta acción.');
        if (error.code === '42P01' || error.code === 'PGRST205') {
            throw new Error('Falta preparar las tablas de Supabase. Ejecuta supabase/schema.sql en el SQL Editor.');
        }
        throw error;
    }
    return result.data;
}

async function allRows(table, order) {
    const rows = [];
    for (let offset = 0; ; offset += 500) {
        const page = checked(await client.from(table).select('*')
            .order(order).range(offset, offset + 499));
        rows.push(...page);
        if (page.length < 500) return rows;
    }
}

export const api = {
    client,
    async signIn(email, password) {
        return checked(await client.auth.signInWithPassword({ email, password }));
    },
    async signOut() {
        checked(await client.auth.signOut({ scope: 'local' }));
    },
    async session() {
        return checked(await client.auth.getSession())?.session;
    },
    async profile() {
        const user = checked(await client.auth.getUser())?.user;
        if (!user) return null;
        const profile = checked(await client.from('edu_profiles').select('*').eq('id', user.id).maybeSingle());
        if (!profile?.active) throw new Error('Tu cuenta está pendiente de autorización o fue desactivada.');
        return profile;
    },
    async snapshot(profile) {
        const [equipment, requests, profiles] = await Promise.all([
            allRows('edu_equipment', 'id'),
            allRows('edu_requests', 'id'),
            profile.role === 'admin' ? allRows('edu_profiles', 'id') : Promise.resolve([profile])
        ]);
        requests.sort((a, b) => a.created_at.localeCompare(b.created_at));
        return { equipment, requests, profiles };
    },
    async rpc(name, args) {
        return checked(await client.rpc(name, args));
    },
    async account(input) {
        const result = await client.functions.invoke('educologia-accounts', { body: input });
        if (result.error) {
            let message = 'No se pudo gestionar la cuenta. Comprueba que la función educologia-accounts esté desplegada.';
            try {
                const body = await result.error.context.json();
                message = body.error || message;
            } catch {}
            throw new Error(message);
        }
        return result.data;
    },
    async changePassword(password) {
        checked(await client.auth.updateUser({ password }));
    },
    async recover(email) {
        const target = location.protocol === 'https:' || location.protocol === 'http:'
            ? new URL('./index.html', location.href).href
            : config.webUrl;
        checked(await client.auth.resetPasswordForEmail(email, { redirectTo: target }));
    }
};
