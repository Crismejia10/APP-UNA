# Inventario de Educología / UNA

## Publicación de prueba en Cloudflare Pages

Esta rama incorpora el código actualizado de Drive del 24 de noviembre de 2026.
Configuración: rama `conexion-supabase-cloudflare`, preset `None`, comando
`node scripts/build-web.mjs`, carpeta de salida `dist` y Node 22 o posterior.
La biblioteca Supabase JS 2.119.0 se sirve desde `js/vendor/`.

Después de publicar, registra la URL obtenida en Supabase Authentication → URL
Configuration (Site URL y Redirect URLs). Verifica que la función `invite-teacher`
esté desplegada y configura un proveedor de correo antes de probar invitaciones.
Los archivos SQL conservan el esquema preparado previamente; no hace falta
ejecutarlos de nuevo para publicar el sitio. Confirma el esquema real antes de
aplicar cualquier migración.

El sitio publicado utiliza el proyecto Supabase existente. La publicación por sí
sola no crea cuentas, no cambia sus roles ni configura el envío de correo.
La recuperación desde el ejecutable conserva por ahora una dirección local;
se actualizará al confirmar la dirección pública definitiva.

Aplicación de inventario de Educología. Permite registrar equipos por número de serie y gestionar solicitudes, reservas, entregas y devoluciones.

La versión web requiere conexión a internet y utiliza Supabase para autenticación, inventario y solicitudes. Para publicarla, sirve los archivos estáticos por HTTPS en un alojamiento aprobado por la UNA. Configura en Supabase Auth la URL del sitio publicado y su lista de redirecciones para que funcionen las invitaciones y la recuperación de contraseñas por correo.

## Aplicación para Windows

Extrae todo el ZIP `Educologia-Windows-x64.zip` en la carpeta donde quieras conservar la aplicación. Haz doble clic en `Abrir Educologia.cmd`. Esto abre la aplicación y crea el acceso directo **Educologia** en el Escritorio. El acceso directo apunta al ejecutable dentro de la carpeta extraída. Si la mueves, vuelve a ejecutar `Abrir Educologia.cmd` desde la nueva ubicación.

Para generar la versión de Windows x64 desde el código, ejecuta `pwsh -File .\compilar-windows.ps1`. El script usa los binarios de Electron y verifica su suma SHA-256.

## Flujo de préstamo

1. El docente solicita un equipo y la solicitud conserva su número de serie.
2. Administración aprueba y reserva el equipo, o rechaza la solicitud.
3. Al entregar el equipo, administración indica la devolución prevista. La aplicación registra la fecha y hora de entrega.
4. Al recibirlo de vuelta, administración registra la devolución. La aplicación guarda su fecha y hora y restablece la disponibilidad.

Las fechas se muestran en hora de Costa Rica. Las aprobaciones de la versión anterior siguen admitiendo devoluciones.

## Acceso y datos

Las contraseñas no se guardan en el código. Supabase Auth valida el inicio de sesión y las tablas aplican permisos por perfil. El perfil inicial de administración se gestiona desde Supabase; no publiques claves secretas ni contraseñas.

Administración invita a cada docente desde la sección **Cuentas docentes**. Supabase envía un correo para que la persona configure su contraseña; administración debe activar el perfil antes de que pueda entrar. Las solicitudes requieren indicar el motivo y cada equipo se identifica con su número de serie.

Si una persona olvida su contraseña, escribe su correo en la pantalla de inicio y selecciona **¿Olvidaste tu contraseña?**. Supabase enviará un enlace para crear una contraseña nueva. La dirección de la app publicada debe estar incluida en **Authentication → URL Configuration → Redirect URLs**.

La disponibilidad se actualiza al recargar, volver a la pestaña o cada 20 segundos. Para uso institucional, confirma el alojamiento aprobado por la UNA, configura la URL publicada en Supabase Auth y revisa el envío de correo de invitación.

## Archivos

- `index.html` contiene las pantallas y formularios.
- `css/estilos.css` contiene el diseño.
- `js/app.js` contiene las pantallas y las operaciones con Supabase.
- `js/supabase-config.js` contiene la URL del proyecto y su clave publicable (no es una clave secreta).
- `supabase/functions/invite-teacher/index.ts` valida el perfil administrador e invita docentes mediante Supabase Auth.
