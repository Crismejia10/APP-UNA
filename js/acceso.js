"use strict";

const formulario = document.getElementById("formulario-acceso");
const error = document.getElementById("error-acceso");

// Estas cuentas solo permiten probar el recorrido local.
const cuentas = [
    { usuario: "admin", contrasena: "admin123", perfil: "admin" },
    { usuario: "docente@ejemplo.test", contrasena: "docente123", perfil: "docente" },
];

formulario.addEventListener("submit", (evento) => {
    evento.preventDefault();
    const datos = new FormData(formulario);
    const usuario = datos.get("usuario").trim().toLowerCase();
    const contrasena = datos.get("contrasena");
    const cuenta = cuentas.find((registro) =>
        registro.usuario === usuario && registro.contrasena === contrasena
    );

    if (!cuenta) {
        error.textContent = "El usuario o la contraseña son incorrectos.";
        return;
    }

    try {
        sessionStorage.setItem("educologia-perfil-demo", cuenta.perfil);
        const vista = cuenta.perfil === "admin" ? "administrador" : "docente";
        location.assign(`index.html?vista=${vista}`);
    } catch {
        error.textContent = "Abre login.html con Live Server para iniciar sesión.";
    }
});
