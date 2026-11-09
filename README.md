# Inventario de Educología · UNA

Abre esta carpeta en VS Code. Haz clic derecho en `login.html` y selecciona **Open with Live Server**. Usa siempre la misma dirección y el mismo navegador para acceder a los registros guardados.

- `index.html` contiene la estructura de la página.
- `css/estilos.css` contiene el diseño.
- `js/app.js` contiene las acciones del inventario, las solicitudes y el guardado local.
- `imagenes/` queda disponible para el logo y otros recursos visuales.

## Probar un préstamo

1. Entra como `docente@ejemplo.test` con `DocenteDemo123` y solicita un equipo disponible.
2. Cierra sesión. Entra como `admin` con `AdminDemo123` y aprueba la solicitud. El equipo pasa a **Prestado**.
3. Pulsa **Registrar devolución** para que vuelva a estar disponible.

El administrador también puede agregar equipos, editarlos, darlos de baja o rechazar solicitudes. El docente puede cancelar sus solicitudes pendientes.

El inicio de sesión es una simulación local. Las cuentas de prueba están en el código y los cambios quedan en el navegador. La autenticación real, la sincronización entre dispositivos y la base de datos quedan pendientes.
