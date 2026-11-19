import { api } from './cloud-api.js';

const $ = id => document.getElementById(id);
const labels = {
    pending: 'Pendiente', approved: 'Aprobada · por entregar', delivered: 'En préstamo', rejected: 'Rechazada',
    returned: 'Devuelta', cancelled: 'Cancelada',
    available: 'Disponible', reserved: 'Reservado', loaned: 'Prestado', maintenance: 'En mantenimiento', retired: 'De baja'
};
const date = new Intl.DateTimeFormat('es-CR', { dateStyle: 'short', timeStyle: 'short' });
let profile = null;
let state = { equipment: [], requests: [], profiles: [] };
let refreshing = false;
let busy = false;
let resetPasswordFor = null;
let recovery = false;

const escape = value => String(value ?? '').replace(/[&<>"']/g, character =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);
const stamp = value => value ? date.format(new Date(value)) : '—';
const badge = status => `<span class="badge ${['pending', 'approved', 'reserved'].includes(status) ? 'waiting' : ['retired', 'rejected', 'maintenance', 'overdue'].includes(status) ? 'low' : ''}">${status === 'overdue' ? 'Vencido' : labels[status] || escape(status)}</span>`;
const action = (name, id, text, style = 'secondary') =>
    `<button type="button" class="button compact ${style}" data-action="${name}" data-id="${escape(id)}">${text}</button>`;

function toast(message) {
    $('toast').textContent = message;
    $('toast').classList.add('show');
    clearTimeout(toast.timer);
    toast.timer = setTimeout(() => $('toast').classList.remove('show'), 6000);
}

function errorText(error) {
    if (error.message === 'Invalid login credentials') return 'El correo o la contraseña son incorrectos.';
    if (error.message === 'Failed to fetch') return 'No hay conexión con el servidor. Comprueba tu conexión a Internet.';
    return error.message || 'No se pudo completar la operación.';
}

function setBusy(value) {
    busy = value;
    document.querySelectorAll('button[type="submit"]').forEach(button => { button.disabled = value; });
}

async function refresh() {
    if (!profile || refreshing) return;
    refreshing = true;
    try {
        const nextProfile = await api.profile();
        if (!nextProfile) throw new Error('Inicia sesión de nuevo.');
        const nextState = await api.snapshot(nextProfile);
        profile = nextProfile;
        state = nextState;
        render();
        $('connectionStatus').textContent = 'Datos compartidos · Actualizado ' + stamp(new Date().toISOString());
    } catch (error) {
        $('connectionStatus').textContent = 'No se pudo actualizar · ' + errorText(error);
        if (/desactivada|autorización|sesión/.test(error.message)) {
            showLogin();
        }
    } finally {
        refreshing = false;
    }
}

function showLogin() {
    profile = null;
    state = { equipment: [], requests: [], profiles: [] };
    document.querySelectorAll('.modal-backdrop').forEach(modal => modal.classList.remove('open'));
    $('app').hidden = true;
    $('loginScreen').hidden = false;
    $('password').value = '';
}

async function enter() {
    profile = await api.profile();
    if (!profile) throw new Error('Inicia sesión para continuar.');
    state = await api.snapshot(profile);
    $('loginScreen').hidden = true;
    $('app').hidden = false;
    render();
    $('connectionStatus').textContent = 'Conectado a la base compartida';
}

function render() {
    if (!profile) return;
    const admin = profile.role === 'admin';
    $('adminView').hidden = !admin;
    $('teacherView').hidden = admin;
    $('userLabel').textContent = `${profile.name} · ${admin ? 'Administración' : 'Docente'}`;
    document.body.dataset.role = profile.role;
    renderEquipment();
    renderRequests();
    if (admin) renderAccounts();
}

function matches(equipment, query) {
    return [equipment.name, equipment.category, equipment.model, equipment.serial, equipment.code, equipment.location]
        .some(value => String(value).toLocaleLowerCase('es').includes(query));
}

function renderEquipment() {
    const adminQuery = $('adminSearch').value.trim().toLocaleLowerCase('es');
    const adminItems = state.equipment.filter(item => matches(item, adminQuery));
    const active = state.equipment.filter(item => item.status !== 'retired');
    $('productCount').textContent = active.length;
    $('unitCount').textContent = active.filter(item => item.status === 'available').length;
    const pending = state.requests.filter(item => item.status === 'pending').length;
    $('pendingCount').textContent = pending;
    $('navPendingCount').textContent = pending;

    $('productRows').innerHTML = adminItems.map(item => `
        <tr>
            <td><span class="table-primary">${escape(item.name)}</span><small class="table-secondary">${escape(item.category)}</small></td>
            <td>${escape(item.model)}</td>
            <td>${escape(item.serial)}</td>
            <td>${escape(item.code)}<small class="table-secondary">${escape(item.location)}</small></td>
            <td>${badge(item.status)}</td>
            <td><div class="actions">
                ${action('edit-equipment', item.id, 'Editar')}
                ${item.status === 'retired' ? action('restore-equipment', item.id, 'Reactivar') : ''}
                ${['available', 'maintenance'].includes(item.status) ? action('retire-equipment', item.id, 'Dar de baja', 'danger') : ''}
            </div></td>
        </tr>`).join('');
    $('productEmpty').hidden = adminItems.length > 0;

    const query = $('teacherSearch').value.trim().toLocaleLowerCase('es');
    const catalog = state.equipment.filter(item => item.status !== 'retired' && matches(item, query));
    $('catalog').innerHTML = catalog.map(item => {
        const pending = state.requests.some(request =>
            request.equipment_id === item.id && request.teacher_id === profile.id && request.status === 'pending');
        return `<article class="catalog-card">
            <div class="device-art" aria-hidden="true"><span>▣</span><small>${escape(item.category)}</small></div>
            <div class="catalog-info">
                <span class="eyebrow">${escape(item.category)}</span>
                <h3>${escape(item.name)}</h3>
                <p>${escape(item.model)}</p>
                <p class="catalog-serial">Serie <strong>${escape(item.serial)}</strong></p>
                <p>${escape(item.location)}</p>
                ${badge(item.status)}
            </div>
            <button class="button" type="button" data-action="request" data-id="${item.id}"
                ${item.status !== 'available' || pending ? 'disabled' : ''}>
                ${pending ? 'Solicitud pendiente' : 'Solicitar'}
            </button>
        </article>`;
    }).join('');
    $('catalogEmpty').hidden = catalog.length > 0;
}

function requestDetails(request) {
    return `<span class="table-primary">${escape(request.equipment_name)}</span>
        <small class="table-secondary">Serie ${escape(request.equipment_serial)}</small>
        <small class="table-secondary">${escape(request.reason)}</small>`;
}

function loanStatus(request) {
    const overdue = request.status === 'delivered' && Date.parse(request.due_at) < Date.now();
    const timestamps = [
        ['Entrega', request.delivered_at], ['Devolución prevista', request.due_at],
        ['Devolución real', request.returned_at]
    ];
    return badge(overdue ? 'overdue' : request.status) + timestamps
        .filter(([, value]) => value)
        .map(([label, value]) => `<small class="table-secondary">${label}: ${stamp(value)}</small>`).join('');
}

function renderRequests() {
    const requests = [...state.requests].reverse();
    $('adminRequestRows').innerHTML = requests.map(request => `
        <tr>
            <td>${escape(request.teacher_name)}<small class="table-secondary">${escape(request.teacher_email)}</small></td>
            <td>${requestDetails(request)}</td>
            <td>1</td>
            <td>${stamp(request.created_at)}</td>
            <td>${loanStatus(request)}</td>
            <td><div class="actions">
                ${request.status === 'pending' ? action('approve', request.id, 'Aprobar', '') + action('reject', request.id, 'Rechazar', 'danger') : ''}
                ${request.status === 'approved' ? action('deliver', request.id, 'Registrar entrega') + action('cancel', request.id, 'Cancelar reserva', 'danger') : ''}
                ${request.status === 'delivered' ? action('return', request.id, 'Registrar devolución') : ''}
            </div></td>
        </tr>`).join('');
    $('requestEmpty').hidden = requests.length > 0;
    const mine = requests.filter(request => request.teacher_id === profile.id);
    $('teacherRequestRows').innerHTML = mine.map(request => `
        <tr>
            <td>${requestDetails(request)}</td><td>1</td><td>${stamp(request.created_at)}</td>
            <td>${loanStatus(request)}
                ${request.status === 'pending' ? action('cancel', request.id, 'Cancelar') : ''}
            </td>
        </tr>`).join('');
    $('teacherRequestEmpty').hidden = mine.length > 0;
}

function renderAccounts() {
    const teachers = state.profiles.filter(account => account.role === 'teacher');
    $('teacherAccountRows').innerHTML = teachers.map(account => `
        <tr><td>${escape(account.name)}</td><td>${escape(account.email)}</td>
            <td>${account.active ? 'Activa' : 'Desactivada'}</td>
            <td><div class="actions">
                ${action('edit-account', account.id, 'Editar')}
                ${action('toggle-account', account.id, account.active ? 'Desactivar' : 'Activar', account.active ? 'danger' : 'secondary')}
                ${action('password-account', account.id, 'Contraseña temporal')}
            </div></td>
        </tr>`).join('');
    $('teacherAccountEmpty').hidden = teachers.length > 0;
}

function closeModal(id) {
    $(id).classList.remove('open');
}

function openEquipment(equipment) {
    $('productForm').reset();
    $('productFormError').hidden = true;
    $('productId').value = equipment?.id || '';
    $('productModalTitle').textContent = equipment ? 'Editar equipo' : 'Registrar equipos';
    $('productQuantityField').hidden = Boolean(equipment);
    $('productQuantity').disabled = Boolean(equipment);
    $('productQuantity').value = 1;
    $('productAvailabilityField').hidden = !equipment;
    $('productAvailability').textContent = equipment ? labels[equipment.status] : '';
    $('equipmentCondition').disabled = !equipment || ['reserved', 'loaned', 'retired'].includes(equipment.status);
    $('equipmentCondition').value = equipment?.status === 'maintenance' ? 'maintenance' : 'available';
    const fields = { productName: 'name', productCategory: 'category', productModel: 'model',
        productLocation: 'location', productSerial: 'serial', productCode: 'code' };
    for (const [id, field] of Object.entries(fields)) $(id).value = equipment?.[field] || '';
    updateBatch();
    $('productBackdrop').classList.add('open');
}

function updateBatch() {
    const count = Number($('productQuantity').value);
    const serials = $('productSerial').value.split(/\r?\n/).map(value => value.trim()).filter(Boolean);
    $('productSerialCount').textContent = `${serials.length} de ${count} series ingresadas`;
    $('productSerial').rows = count > 1 ? 5 : 2;
}

async function submit(form, operation) {
    if (busy) return;
    setBusy(true);
    const error = form.querySelector('[role="alert"]');
    if (error) { error.textContent = ''; error.hidden = true; }
    try {
        await operation();
    } catch (exception) {
        if (error) {
            error.textContent = errorText(exception);
            error.hidden = false;
        } else toast(errorText(exception));
    } finally {
        setBusy(false);
    }
}

$('loginForm').addEventListener('submit', event => {
    event.preventDefault();
    submit(event.currentTarget, async () => {
        await api.signIn($('email').value.trim(), $('password').value);
        await enter();
    });
});
$('logoutBtn').addEventListener('click', async () => {
    try {
        await api.signOut();
        showLogin();
    } catch (error) { toast(errorText(error)); }
});
$('refreshBtn').addEventListener('click', refresh);
$('forgotPassword').addEventListener('click', async () => {
    if (!$('email').reportValidity()) return;
    try {
        await api.recover($('email').value.trim());
        toast('Si la cuenta existe, recibirás instrucciones en tu correo.');
    } catch (error) { toast(errorText(error)); }
});

$('productForm').addEventListener('submit', event => {
    event.preventDefault();
    submit(event.currentTarget, async () => {
        const count = Number($('productQuantity').value);
        const id = $('productId').value;
        const serials = $('productSerial').value.split(/\r?\n/).map(value => value.trim()).filter(Boolean);
        const codes = $('productCode').value.replace(/\r/g, '').split('\n').map(value => value.trim());
        if (!Number.isSafeInteger(count) || count < 1 || count > 100 || serials.length !== count) {
            throw new Error('Indica entre 1 y 100 equipos y una serie por equipo.');
        }
        if (codes.slice(count).some(Boolean)) throw new Error('Hay más códigos que equipos.');
        const existing = state.equipment.find(item => item.id === id);
        const items = serials.map((serial, index) => ({
            id: id || null, serial, code: codes[index] || '',
            name: $('productName').value.trim(), category: $('productCategory').value.trim(),
            model: $('productModel').value.trim(), location: $('productLocation').value.trim(),
            status: ['reserved', 'loaned'].includes(existing?.status) ? existing.status : $('equipmentCondition').value
        }));
        // El lote se valida y guarda en una única transacción en el servidor.
        await api.rpc('edu_save_equipment', { p_items: items });
        closeModal('productBackdrop');
        toast('Equipos guardados.');
        await refresh();
    });
});

$('requestForm').addEventListener('submit', event => {
    event.preventDefault();
    submit(event.currentTarget, async () => {
        await api.rpc('edu_request_equipment', {
            p_equipment_id: $('requestProductId').value,
            p_reason: $('requestReason').value.trim()
        });
        closeModal('requestBackdrop');
        toast('Solicitud enviada a administración.');
        await refresh();
    });
});

$('deliveryForm').addEventListener('submit', event => {
    event.preventDefault();
    submit(event.currentTarget, async () => {
        const due = new Date($('deliveryDueAt').value);
        if (!Number.isFinite(due.getTime()) || due <= new Date()) {
            throw new Error('La devolución prevista debe ser posterior a la entrega.');
        }
        await api.rpc('edu_resolve_request', {
            p_id: $('deliveryRequestId').value, p_action: 'deliver', p_due_at: due.toISOString()
        });
        closeModal('deliveryBackdrop');
        toast('Entrega registrada.');
        await refresh();
    });
});

function openAccount(account) {
    $('teacherForm').reset();
    $('teacherForm').querySelector('[role="alert"]').hidden = true;
    $('teacherId').value = account?.id || '';
    $('teacherModalTitle').textContent = account ? 'Editar docente' : 'Crear cuenta docente';
    $('teacherName').value = account?.name || '';
    $('teacherEmail').value = account?.email || '';
    $('teacherEmail').disabled = Boolean(account);
    $('teacherPassword').required = !account;
    $('teacherPasswordField').hidden = Boolean(account);
    $('teacherBackdrop').classList.add('open');
}

$('teacherForm').addEventListener('submit', event => {
    event.preventDefault();
    submit(event.currentTarget, async () => {
        const id = $('teacherId').value;
        if (id) {
            const account = state.profiles.find(item => item.id === id);
            await api.rpc('edu_manage_teacher', {
                p_id: id, p_name: $('teacherName').value.trim(), p_active: account.active
            });
        } else {
            await api.account({
                action: 'create', name: $('teacherName').value.trim(),
                email: $('teacherEmail').value.trim(), password: $('teacherPassword').value
            });
        }
        $('teacherPassword').value = '';
        closeModal('teacherBackdrop');
        toast('Cuenta guardada.');
        await refresh();
    });
});

function openPassword(account = null) {
    resetPasswordFor = account;
    $('passwordForm').reset();
    $('passwordForm').querySelector('[role="alert"]').hidden = true;
    $('passwordModalTitle').textContent = account ? 'Contraseña temporal del docente' : 'Cambiar mi contraseña';
    $('passwordBackdrop').classList.add('open');
}
$('myPasswordBtn').addEventListener('click', () => openPassword());
$('passwordForm').addEventListener('submit', event => {
    event.preventDefault();
    submit(event.currentTarget, async () => {
        const password = $('newPassword').value;
        if (password !== $('confirmPassword').value) throw new Error('Las contraseñas no coinciden.');
        if (resetPasswordFor) await api.account({ action: 'password', id: resetPasswordFor.id, password });
        else await api.changePassword(password);
        recovery = false;
        closeModal('passwordBackdrop');
        $('passwordForm').reset();
        toast('Contraseña actualizada.');
        if (!profile) await enter();
    });
});

document.addEventListener('click', async event => {
    const button = event.target.closest('[data-action]');
    if (!button || busy || !profile) return;
    const { action: command, id } = button.dataset;
    const equipment = state.equipment.find(item => item.id === id);
    const account = state.profiles.find(item => item.id === id);
    if (command === 'edit-equipment') return openEquipment(equipment);
    if (command === 'edit-account') return openAccount(account);
    if (command === 'password-account') return openPassword(account);
    if (command === 'deliver') {
        const request = state.requests.find(item => item.id === id);
        if (!request || request.status !== 'approved') return;
        $('deliveryForm').reset();
        $('deliveryForm').querySelector('[role="alert"]').hidden = true;
        $('deliveryRequestId').value = id;
        $('deliveryInfo').textContent = `${request.equipment_name} · ${request.teacher_name}`;
        $('deliveryBackdrop').classList.add('open');
        return;
    }
    if (command === 'request') {
        $('requestForm').reset();
        $('requestForm').querySelector('[role="alert"]').hidden = true;
        $('requestProductId').value = id;
        $('requestQuantity').value = 1;
        $('requestProductInfo').textContent = `${equipment.name} · Serie ${equipment.serial}`;
        $('requestBackdrop').classList.add('open');
        return;
    }
    const confirmations = {
        approve: '¿Aprobar el préstamo de este equipo?',
        reject: '¿Rechazar la solicitud?',
        return: '¿Confirmas la recepción del equipo en condiciones de volver a prestarse?',
        cancel: '¿Cancelar tu solicitud?',
        'retire-equipment': '¿Dar de baja el equipo? Se conservará el historial.',
        'restore-equipment': '¿Reactivar el equipo como disponible?',
        'toggle-account': account?.active ? '¿Desactivar la cuenta y cancelar sus solicitudes pendientes?' : '¿Activar esta cuenta?'
    };
    if (!confirm(confirmations[command] || '¿Confirmar la operación?')) return;
    setBusy(true);
    try {
        if (['approve', 'reject', 'return', 'cancel'].includes(command)) {
            await api.rpc('edu_resolve_request', { p_id: id, p_action: command });
        } else if (['retire-equipment', 'restore-equipment'].includes(command)) {
            await api.rpc('edu_set_equipment_status', {
                p_id: id, p_status: command === 'retire-equipment' ? 'retired' : 'available'
            });
        } else if (command === 'toggle-account') {
            await api.rpc('edu_manage_teacher', { p_id: id, p_name: account.name, p_active: !account.active });
        }
        toast('Cambio guardado en la base compartida.');
        await refresh();
    } catch (error) {
        toast(errorText(error));
        await refresh();
    } finally { setBusy(false); }
});

document.querySelectorAll('.add-product-btn').forEach(button => button.addEventListener('click', () => openEquipment()));
$('addTeacherBtn').addEventListener('click', () => openAccount());
document.querySelectorAll('[data-close]').forEach(button => button.addEventListener('click', () => {
    if (!busy && !(recovery && button.dataset.close === 'passwordBackdrop')) closeModal(button.dataset.close);
}));
document.querySelectorAll('.modal-backdrop').forEach(modal => modal.addEventListener('click', event => {
    if (event.target === modal && !busy && !recovery) closeModal(modal.id);
}));
$('productQuantity').addEventListener('input', updateBatch);
$('productSerial').addEventListener('input', updateBatch);
$('adminSearch').addEventListener('input', renderEquipment);
$('teacherSearch').addEventListener('input', renderEquipment);
window.addEventListener('focus', refresh);
setInterval(() => { if (!document.hidden && !busy) refresh(); }, 3000);
api.client.auth.onAuthStateChange(event => {
    if (event === 'SIGNED_OUT') showLogin();
    if (event === 'PASSWORD_RECOVERY') {
        recovery = true;
        openPassword();
    }
});

async function start() {
    try {
        if (await api.session()) {
            if (!recovery) await enter();
        }
    } catch (error) {
        $('loginError').textContent = errorText(error);
        $('loginError').hidden = false;
    }
}
start();
