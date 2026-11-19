import { cp, mkdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const root = new URL('../', import.meta.url);
const destination = new URL('../dist/', import.meta.url);
const configText = await readFile(new URL('js/config.js', root), 'utf8');
if (!configText.includes('sb_publishable_')) throw new Error('Falta la clave publicable de Supabase.');

await mkdir(destination, { recursive: true });
for (const item of ['index.html', 'assets', 'css', 'js', '_headers']) {
    await cp(new URL(item, root), new URL(item, destination), { recursive: true });
}
console.log('Web preparada en ' + fileURLToPath(destination));
