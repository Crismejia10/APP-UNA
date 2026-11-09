"use strict";

const clave = "educologia-inventario-demo-v1";
const docente = "Docente de demostración";
const estados = {
    pendiente: "Pendiente",
    aprobada: "Aprobada",
    rechazada: "Rechazada",
    devuelta: "Devuelta",
    cancelada: "Cancelada",
};

const inicial = {
    equipos: [
        { id: "proyector", placa: "UNA-001", nombre: "Proyector multimedia", categoria: "Audiovisual", ubicacion: "Aula 3", estado: "Disponible" },
        { id: "laptop", placa: "UNA-002", nombre: "Laptop", categoria: "Cómputo", ubicacion: "Oficina administrativa", estado: "Disponible" },
    ],
    solicitudes: [],
};

const buscar = (id) => document.getElementById(id);
const perfil = buscar("perfil");
const esAdmin = () => perfil.value === "admin";
const formularioEquipo = buscar("formulario-equipo");
const formularioSolicitud = buscar("formulario-solicitud");
const dialogoEquipo = buscar("dialogo-equipo");
const dialogoSolicitud = buscar("dialogo-solicitud");
const fechaLocal = new Intl.DateTimeFormat("es-CR", { dateStyle: "short" });

let datos = structuredClone(inicial);
let equipoEnEdicion;
let equipoEnSolicitud;

function leerDatos() {
    const texto = localStorage.getItem(clave);
    if (!texto) return structuredClone(inicial);

    const guardado = JSON.parse(texto);
    if (!Array.isArray(guardado.equipos) || !Array.isArray(guardado.solicitudes)) {
        throw new Error("No se pudo leer el inventario guardado.");
    }
    return guardado;
}

function mostrarMensaje(texto) {
    const mensaje = buscar("mensaje");
    mensaje.textContent = texto;
    mensaje.hidden = !texto;
}

function cambiarDatos(cambio, mensaje, formulario) {
    const guardar = () => {
        try {
            const siguientes = leerDatos();
            cambio(siguientes);
            localStorage.setItem(clave, JSON.stringify(siguientes));
            datos = siguientes;
            if (formulario) formulario.closest("dialog").close();
            renderizar();
            mostrarMensaje(mensaje);
        } catch (error) {
            const texto = error instanceof DOMException
                ? "El navegador no pudo guardar los cambios."
                : error.message;
            if (formulario) formulario.querySelector(".error").textContent = texto;
            else mostrarMensaje(texto);
        }
    };

    // Serializa cambios entre pestañas en navegadores que ofrecen Web Locks.
    if (navigator.locks) {
        navigator.locks.request(clave, guardar).catch(() => {
            mostrarMensaje("No se pudo acceder al inventario guardado.");
        });
    } else {
        guardar();
    }
}

function estadoEquipo(equipo, origen = datos) {
    const prestado = origen.solicitudes.some((solicitud) =>
        solicitud.equipoId === equipo.id && solicitud.estado === "aprobada"
    );
    return prestado ? "Prestado" : equipo.estado;
}

function crear(tag, texto, clase) {
    const elemento = document.createElement(tag);
    if (texto !== undefined) elemento.textContent = texto;
    if (clase) elemento.className = clase;
    return elemento;
}

function boton(texto, alPulsar, clase) {
    const control = crear("button", texto, clase);
    control.type = "button";
    control.addEventListener("click", alPulsar);
    return control;
}

function celda(fila, contenido) {
    const columna = crear("td");
    columna.append(contenido);
    fila.append(columna);
    return columna;
}

function tablaVacia(cuerpo, mensaje, columnas) {
    const fila = crear("tr");
    const columna = celda(fila, mensaje);
    columna.className = "vacio";
    columna.colSpan = columnas;
    cuerpo.append(fila);
}

function indicador(texto, valor) {
    const tarjeta = crear("article", undefined, "indicador");
    tarjeta.append(crear("span", texto), crear("strong", valor));
    return tarjeta;
}

function insignia(estado) {
    let clase = "estado";
    if (["Disponible", "Aprobada", "Devuelta"].includes(estado)) clase += " positivo";
    if (["Pendiente", "Prestado", "En mantenimiento"].includes(estado)) clase += " pendiente";
    if (["De baja", "Rechazada"].includes(estado)) clase += " negativo";
    return crear("span", estado, clase);
}

function renderizarEquipos() {
    const cuerpo = buscar("equipos");
    cuerpo.replaceChildren();
    const filtro = buscar("busqueda").value.trim().toLocaleLowerCase("es");
    const equipos = datos.equipos.filter((equipo) => {
        if (!esAdmin() && equipo.estado === "De baja") return false;
        return [equipo.placa, equipo.nombre, equipo.categoria, equipo.ubicacion]
            .some((valor) => valor.toLocaleLowerCase("es").includes(filtro));
    });

    if (!equipos.length) tablaVacia(cuerpo, "No se encontraron equipos.", 5);

    for (const equipo of equipos) {
        const fila = crear("tr");
        const nombre = celda(fila, crear("strong", equipo.nombre));
        nombre.append(crear("small", equipo.placa));
        celda(fila, equipo.categoria);
        celda(fila, equipo.ubicacion);
        const estado = estadoEquipo(equipo);
        celda(fila, insignia(estado));

        const acciones = crear("div", undefined, "acciones");
        if (esAdmin() && estado !== "De baja") {
            acciones.append(boton("Editar", () => abrirEquipo(equipo)));
            if (estado !== "Prestado") {
                acciones.append(boton("Dar de baja", () => darDeBaja(equipo), "peligro"));
            }
        } else if (!esAdmin() && estado === "Disponible") {
            const pendiente = datos.solicitudes.some((solicitud) =>
                solicitud.equipoId === equipo.id && solicitud.docente === docente &&
                solicitud.estado === "pendiente"
            );
            const solicitar = boton(pendiente ? "Ya solicitaste" : "Solicitar", () => abrirSolicitud(equipo));
            solicitar.disabled = pendiente;
            acciones.append(solicitar);
        }
        celda(fila, acciones.childElementCount ? acciones : "—");
        cuerpo.append(fila);
    }
}

function renderizarSolicitudes(solicitudes) {
    const cuerpo = buscar("solicitudes");
    cuerpo.replaceChildren();
    if (!solicitudes.length) tablaVacia(cuerpo, "Todavía no hay solicitudes.", 6);

    for (const solicitud of [...solicitudes].reverse()) {
        const equipo = datos.equipos.find((registro) => registro.id === solicitud.equipoId);
        const fila = crear("tr");
        celda(fila, equipo ? `${equipo.nombre} · ${equipo.placa}` : "Equipo archivado");
        celda(fila, solicitud.docente);
        celda(fila, solicitud.motivo);
        celda(fila, fechaLocal.format(new Date(solicitud.fecha)));
        celda(fila, insignia(estados[solicitud.estado]));

        const acciones = crear("div", undefined, "acciones");
        if (esAdmin() && solicitud.estado === "pendiente") {
            acciones.append(
                boton("Aprobar", () => resolver(solicitud.id, "aprobada"), "primario"),
                boton("Rechazar", () => resolver(solicitud.id, "rechazada"), "peligro")
            );
        } else if (esAdmin() && solicitud.estado === "aprobada") {
            acciones.append(boton("Registrar devolución", () => resolver(solicitud.id, "devuelta")));
        } else if (!esAdmin() && solicitud.estado === "pendiente") {
            acciones.append(boton("Cancelar solicitud", () => resolver(solicitud.id, "cancelada")));
        }
        celda(fila, acciones.childElementCount ? acciones : "—");
        cuerpo.append(fila);
    }
}

function renderizar() {
    const admin = esAdmin();
    const activos = datos.equipos.filter((equipo) => equipo.estado !== "De baja");
    const disponibles = activos.filter((equipo) => estadoEquipo(equipo) === "Disponible");
    const solicitudes = admin
        ? datos.solicitudes
        : datos.solicitudes.filter((solicitud) => solicitud.docente === docente);
    const pendientes = solicitudes.filter((solicitud) => solicitud.estado === "pendiente");

    buscar("area").textContent = admin ? "ADMINISTRACIÓN" : "PORTAL DOCENTE";
    buscar("titulo").textContent = admin ? "Panel de inventario" : "Catálogo de equipos";
    buscar("subtitulo").textContent = admin
        ? "Gestiona los equipos y los préstamos de Educología."
        : "Consulta los equipos disponibles y solicita un préstamo.";
    buscar("titulo-inventario").textContent = admin ? "Inventario de equipos" : "Equipos del catálogo";
    buscar("titulo-solicitudes").textContent = admin ? "Solicitudes de docentes" : "Mis solicitudes";
    buscar("agregar").hidden = !admin;
    buscar("indicadores").replaceChildren(
        indicador("Equipos activos", activos.length),
        indicador("Equipos disponibles", disponibles.length),
        indicador("Solicitudes pendientes", pendientes.length)
    );
    renderizarEquipos();
    renderizarSolicitudes(solicitudes);
}

function abrirEquipo(equipo) {
    equipoEnEdicion = equipo?.id;
    formularioEquipo.reset();
    formularioEquipo.querySelector(".error").textContent = "";
    buscar("titulo-formulario").textContent = equipo ? "Editar equipo" : "Agregar equipo";
    if (equipo) {
        for (const campo of ["placa", "nombre", "categoria", "ubicacion", "estado"]) {
            formularioEquipo.elements.namedItem(campo).value = equipo[campo];
        }
    }
    dialogoEquipo.showModal();
}

function abrirSolicitud(equipo) {
    equipoEnSolicitud = equipo.id;
    formularioSolicitud.reset();
    formularioSolicitud.querySelector(".error").textContent = "";
    buscar("equipo-solicitado").textContent = `${equipo.nombre} · ${equipo.placa}`;
    dialogoSolicitud.showModal();
}

function leerFormulario(formulario) {
    const campos = new FormData(formulario);
    return Object.fromEntries([...campos].map(([campo, valor]) => [campo, valor.trim()]));
}

formularioEquipo.addEventListener("submit", (evento) => {
    evento.preventDefault();
    const campos = leerFormulario(formularioEquipo);
    const id = equipoEnEdicion;
    cambiarDatos((siguientes) => {
        if (!esAdmin()) throw new Error("Cambia al perfil administrador.");
        if (Object.values(campos).some((valor) => !valor)) throw new Error("Completa todos los campos.");
        const repetida = siguientes.equipos.some((equipo) =>
            equipo.id !== id && equipo.placa.toUpperCase() === campos.placa.toUpperCase()
        );
        if (repetida) throw new Error("Ya existe un equipo con esa placa.");

        if (id) {
            const equipo = siguientes.equipos.find((registro) => registro.id === id);
            if (!equipo || equipo.estado === "De baja") throw new Error("Ese equipo ya no se puede editar.");
            if (estadoEquipo(equipo, siguientes) === "Prestado" && equipo.estado !== campos.estado) {
                throw new Error("Registra la devolución antes de cambiar el estado.");
            }
            Object.assign(equipo, campos);
        } else {
            siguientes.equipos.push({ ...campos, id: crypto.randomUUID() });
        }
    }, "Equipo guardado.", formularioEquipo);
});

formularioSolicitud.addEventListener("submit", (evento) => {
    evento.preventDefault();
    const { motivo } = leerFormulario(formularioSolicitud);
    const id = equipoEnSolicitud;
    cambiarDatos((siguientes) => {
        if (esAdmin()) throw new Error("Cambia al perfil docente.");
        if (!motivo) throw new Error("Escribe el motivo del préstamo.");
        const equipo = siguientes.equipos.find((registro) => registro.id === id);
        if (!equipo || estadoEquipo(equipo, siguientes) !== "Disponible") {
            throw new Error("Ese equipo ya no está disponible.");
        }
        const duplicada = siguientes.solicitudes.some((solicitud) =>
            solicitud.equipoId === id && solicitud.docente === docente && solicitud.estado === "pendiente"
        );
        if (duplicada) throw new Error("Ya tienes una solicitud pendiente para este equipo.");
        siguientes.solicitudes.push({
            id: crypto.randomUUID(),
            equipoId: id,
            docente,
            motivo,
            fecha: new Date().toISOString(),
            estado: "pendiente",
        });
    }, "Solicitud enviada.", formularioSolicitud);
});

function darDeBaja(equipo) {
    if (!confirm(`¿Dar de baja ${equipo.nombre}? Las solicitudes pendientes se cancelarán.`)) return;
    cambiarDatos((siguientes) => {
        if (!esAdmin()) throw new Error("Cambia al perfil administrador.");
        const actual = siguientes.equipos.find((registro) => registro.id === equipo.id);
        if (!actual || actual.estado === "De baja" || estadoEquipo(actual, siguientes) === "Prestado") {
            throw new Error("El equipo ya no se puede dar de baja.");
        }
        actual.estado = "De baja";
        for (const solicitud of siguientes.solicitudes) {
            if (solicitud.equipoId === actual.id && solicitud.estado === "pendiente") {
                solicitud.estado = "cancelada";
            }
        }
    }, "Equipo dado de baja.");
}

function resolver(id, nuevoEstado) {
    cambiarDatos((siguientes) => {
        const solicitud = siguientes.solicitudes.find((registro) => registro.id === id);
        const anterior = nuevoEstado === "devuelta" ? "aprobada" : "pendiente";
        if (!solicitud || solicitud.estado !== anterior) throw new Error("La solicitud ya cambió de estado.");
        if (nuevoEstado === "cancelada") {
            if (esAdmin() || solicitud.docente !== docente) throw new Error("Esta solicitud pertenece al perfil docente.");
        } else if (!esAdmin()) {
            throw new Error("Cambia al perfil administrador.");
        }
        if (nuevoEstado === "aprobada") {
            const equipo = siguientes.equipos.find((registro) => registro.id === solicitud.equipoId);
            if (!equipo || estadoEquipo(equipo, siguientes) !== "Disponible") {
                throw new Error("El equipo no está disponible para préstamo.");
            }
        }
        solicitud.estado = nuevoEstado;
    }, `Solicitud actualizada a «${estados[nuevoEstado]}».`);
}

buscar("busqueda").addEventListener("input", renderizarEquipos);
buscar("agregar").addEventListener("click", () => abrirEquipo());
document.querySelectorAll("[data-cerrar]").forEach((control) => {
    control.addEventListener("click", () => control.closest("dialog").close());
});

function cargar() {
    try {
        datos = leerDatos();
        renderizar();
    } catch {
        renderizar();
        mostrarMensaje("No se pudo leer el inventario guardado en este navegador.");
    }
}

window.addEventListener("storage", (evento) => {
    if (evento.key === clave || evento.key === null) cargar();
});
function iniciarPanel() {
    let sesion;
    try {
        sesion = sessionStorage.getItem("educologia-perfil-demo");
    } catch {
        sesion = null;
    }

    if (!["admin", "docente"].includes(sesion)) {
        location.replace("login.html");
        return;
    }

    const vista = sesion === "admin" ? "administrador" : "docente";
    const parametros = new URLSearchParams(location.search);
    if (parametros.get("vista") !== vista) {
        location.replace(`index.html?vista=${vista}`);
        return;
    }

    perfil.value = sesion;
    document.body.dataset.vista = vista;
    buscar("nombre-perfil").textContent = esAdmin() ? "Administrador" : "Docente";
    document.title = esAdmin() ? "Administración | Educología UNA" : "Portal docente | Educología UNA";
    buscar("salir").addEventListener("click", () => {
        sessionStorage.removeItem("educologia-perfil-demo");
        location.replace("login.html");
    });
    cargar();
}

iniciarPanel();
