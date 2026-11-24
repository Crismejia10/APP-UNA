import { cp, mkdir, readdir, stat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const root = new URL('../', import.meta.url);
const destination = new URL('../dist/', import.meta.url);
await mkdir(destination, { recursive: true });

// Publish only browser assets, keeping SQL, desktop binaries and server code private.
for (const item of ['index.html', 'css', 'js', 'assets', '_headers']) {
  await cp(new URL(item, root), new URL(item, destination), { recursive: true });
}
for (const item of await readdir(destination)) {
  if (!['index.html', 'css', 'js', 'assets', '_headers'].includes(item)) {
    throw new Error(`Archivo inesperado en la carpeta de publicación: ${item}`);
  }
}
await stat(new URL('index.html', destination));
console.log('Versión web preparada en ' + fileURLToPath(destination));
