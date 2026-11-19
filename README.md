# Educología / UNA · Versión con base compartida

Código preparado sobre la versión de escritorio de noviembre de 2026.

## Archivos

- `index.html` y `css/estilos.css` contienen las pantallas y el diseño.
- `assets/` contiene el logo.
- `js/app.js` controla la interfaz.
- `js/cloud-api.js` conecta con Supabase Auth, las tablas y las funciones.
- `js/config.js` contiene la URL y la clave publicable.
- `js/vendor/supabase.js` contiene la biblioteca Supabase JS 2.119.0.
- `supabase/schema.sql` prepara tablas, permisos, auditoría y operaciones transaccionales.
- `supabase/primer-administrador.sql` autoriza la primera cuenta.
- `supabase/functions/educologia-accounts/index.ts` gestiona cuentas desde el servidor.
- `desktop.cjs` es el punto de entrada del ejecutable Electron.

## Puesta en marcha

1. Aplica `supabase/schema.sql` en el proyecto confirmado.
2. Crea la cuenta administradora en Authentication → Users e introduce allí su contraseña.
3. Ejecuta `supabase/primer-administrador.sql` después de revisar el correo configurado.
4. Despliega la función `educologia-accounts` con su configuración de autenticación.
5. Abre `index.html` con Live Server para probar las dos cuentas.

Las cuentas del prototipo local no se convierten automáticamente en cuentas Auth. Antes de incorporar registros locales hay que conciliar equipos, préstamos y usuarios con los identificadores de Supabase.

## Cloudflare Pages

Conecta el repositorio de GitHub en Workers & Pages → Create application → Pages.
Selecciona la rama de la versión conectada, preset None, comando de compilación `node scripts/build-web.mjs` y directorio de salida `dist`. Usa Node 22 o posterior.

Al obtener la dirección final:

1. Incluye su origen exacto en `ALLOWED_ORIGINS` de la función de cuentas.
2. Configura esa URL en Supabase Auth → URL Configuration y autoriza la ruta de recuperación.
3. Ajusta `webUrl` en `js/config.js` para las recuperaciones desde el ejecutable.
4. Prueba acceso, creación de docentes, reserva, entrega y devolución desde dos dispositivos.

El programa de compilación publica únicamente HTML, CSS, imágenes, módulos y cabeceras. El código de servidor y los archivos SQL permanecen fuera de `dist`.

## Verificación pendiente en producción

Los permisos y las transacciones han pasado las pruebas locales. La puesta en producción requiere aplicar el esquema al proyecto real, autorizar las cuentas, desplegar la función y verificar el flujo completo. La recuperación por correo requiere un proveedor de envío configurado y probado.

El ejecutable anterior conserva su código empaquetado. Para distribuir esta versión habrá que reconstruirlo después de verificar la web.
