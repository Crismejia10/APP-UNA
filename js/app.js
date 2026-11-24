const supabase = window.eduSupabase;
const $ = (id) => document.getElementById(id);
let products = [], requests = [], accounts = [], currentUser = null;
let loadingUserId = null;
let pendingPasswordUser = null;

function setLoggedOut(message = '') {
  currentUser = null;
  pendingPasswordUser = null;
  products = [];
  requests = [];
  accounts = [];
  $('app').hidden = true;
  $('passwordSetupScreen').hidden = true;
  $('loginScreen').hidden = false;
  $('password').value = '';
  $('loginError').textContent = message || 'Correo o contraseña incorrectos.';
  $('loginError').hidden = !message;
}

function showPasswordSetup(user, mode = 'invite') {
  pendingPasswordUser = user;
  $('loginScreen').hidden = true;
  $('app').hidden = true;
  $('passwordSetupScreen').hidden = false;
  $('passwordSetupEmail').textContent = user.email || '';
  $('passwordSetupScreen').querySelector('.eyebrow').textContent = mode === 'recovery' ? 'Recuperación de acceso' : 'Primer ingreso';
  $('passwordSetupScreen').querySelector('h1').textContent = mode === 'recovery' ? 'Crea una contraseña nueva' : 'Configura tu contraseña';
  $('passwordSetupScreen').querySelector('.story-copy h2').innerHTML = mode === 'recovery' ? 'Recupera tu acceso<br />al inventario.' : 'Activa tu acceso<br />al inventario.';
  $('passwordSetupScreen').querySelector('.story-copy p:last-child').textContent = mode === 'recovery'
    ? 'Elige una contraseña nueva para continuar.'
    : 'Configura una contraseña personal para continuar.';
  $('passwordSetupForm').reset();
  $('passwordSetupError').hidden = true;
}

function login(user) {
  currentUser = user;
  $('loginScreen').hidden = true;
  $('passwordSetupScreen').hidden = true;
  $('app').hidden = false;
  $('userLabel').textContent = `${user.name} · ${user.role === 'admin' ? 'Administración' : 'Docente'}`;
  $('adminView').hidden = user.role !== 'admin';
  $('teacherView').hidden = user.role !== 'teacher';
}

function mapEquipment(row) {
  return {
    id: row.id,
    name: row.name,
    category: row.category || '',
    model: row.model || '',
    serial: row.serial,
    code: row.code || '',
    location: row.location || '',
    status: row.status,
    quantity: row.status === 'available' ? 1 : 0,
    minimum: 0,
  };
}

function mapRequest(row) {
  return {
    id: row.id,
    productId: row.equipment_id,
    productName: row.equipment_name,
    productSerial: row.equipment_serial,
    reason: row.reason,
    quantity: 1,
    teacher: row.teacher_name,
    email: row.teacher_email,
    requestedAt: row.created_at,
    status: row.status,
    approvedAt: row.status === 'approved' ? row.resolved_at : null,
    deliveredAt: row.delivered_at,
    deliveredBy: row.delivered_by,
    dueAt: row.due_at,
    returnedAt: row.returned_at,
    returnedBy: row.returned_by,
  };
}

async function refreshData() {
  if (!currentUser) return;
  const [equipmentResult, requestResult, profilesResult] = await Promise.all([
    supabase.from('edu_equipment').select('*').order('name').order('serial'),
    supabase.from('edu_requests').select('*').order('created_at'),
    supabase.from('edu_profiles').select('id,email,name,role,active').order('name'),
  ]);
  for (const result of [equipmentResult, requestResult, profilesResult]) {
    if (result.error) throw result.error;
  }
  const ownProfile = (profilesResult.data || []).find((profile) => profile.id === currentUser.id);
  if (!ownProfile?.active || ownProfile.role !== currentUser.role) {
    setLoggedOut('Tu cuenta fue desactivada. Contacta a administración.');
    window.setTimeout(() => supabase.auth.signOut(), 0);
    return;
  }
  currentUser = { ...currentUser, ...ownProfile };
  products = (equipmentResult.data || []).filter((item) => item.status !== 'retired').map(mapEquipment);
  requests = (requestResult.data || []).map(mapRequest);
  accounts = profilesResult.data || [];
  render();
}

async function loadAuthenticatedUser(user) {
  if (!user || loadingUserId === user.id) return;
  if (user.user_metadata?.password_setup_required) {
    showPasswordSetup(user);
    return;
  }
  loadingUserId = user.id;
  try {
    const { data: profile, error } = await supabase
      .from('edu_profiles')
      .select('id,email,name,role,active')
      .eq('id', user.id)
      .maybeSingle();
    if (error) throw error;
    if (!profile || !profile.active) {
      setLoggedOut('Tu cuenta aún no está activa. Contacta a administración.');
      window.setTimeout(() => supabase.auth.signOut(), 0);
      return;
    }
    if (!['admin', 'teacher'].includes(profile.role)) {
      setLoggedOut('Esta cuenta no tiene un perfil autorizado para ingresar.');
      window.setTimeout(() => supabase.auth.signOut(), 0);
      return;
    }
    login({ ...profile, email: profile.email || user.email });
    await refreshData();
  } catch (error) {
    setLoggedOut('No se pudo cargar la aplicación desde Supabase: ' + (error.message || 'Error de conexión.'));
  } finally {
    loadingUserId = null;
  }
}

function synchronizeData() {
  if (currentUser) refreshData().catch((error) => toast(error.message || 'No se pudo actualizar la información.'));
}

function withInventoryWrite(role, operation, onError = (error) => toast(error.message || 'No se pudo guardar.')) {
  if (!currentUser || currentUser.role !== role) return;
  Promise.resolve().then(operation).catch(onError);
}
const escapeHtml = (value) =>
  String(value).replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c],
  );
const loanDate = new Intl.DateTimeFormat('es-CR', {
  dateStyle: 'short',
  timeStyle: 'short',
  timeZone: 'America/Costa_Rica',
});

function dateLabel(value) {
  const time = Date.parse(value);
  return Number.isFinite(time) ? loanDate.format(time) : '';
}

function loanStatus(request) {
  const labels = {
    pending: 'Pendiente',
    approved: request.approvedAt ? 'Aprobada · por entregar' : 'Aprobada',
    rejected: 'Rechazada',
    delivered: 'En préstamo',
    returned: 'Devuelta',
    cancelled: 'Reserva cancelada',
  };
  const overdue = request.status === 'delivered' && Date.parse(request.dueAt) < Date.now();
  const badge =
    overdue || request.status === 'rejected'
      ? 'low'
      : ['pending', 'approved'].includes(request.status)
        ? 'waiting'
        : '';
  const dates = [
    ['Entrega', request.deliveredAt],
    ['Devolución prevista', request.dueAt],
    ['Devolución real', request.returnedAt],
  ]
    .map(([name, timestamp]) => {
      const value = dateLabel(timestamp);
      return value ? `<small class="table-secondary">${name}: ${escapeHtml(value)}</small>` : '';
    })
    .join('');
  const label = overdue ? 'Vencida' : labels[request.status] || 'Sin estado';
  return `<span class="badge ${badge}">${label}</span>${dates}`;
}

function loanActions(request) {
  const id = escapeHtml(request.id);
  if (request.status === 'pending') {
    return `<div class="actions">
      <button class="button compact" data-loan-action="approve" data-loan-id="${id}">Aprobar</button>
      <button class="button danger" data-loan-action="reject" data-loan-id="${id}">Rechazar</button>
    </div>`;
  }
  if (request.status === 'approved' && request.approvedAt) {
    return `<div class="actions">
      <button class="button secondary" data-loan-action="deliver" data-loan-id="${id}">Registrar entrega</button>
      <button class="button danger" data-loan-action="cancel" data-loan-id="${id}">Cancelar reserva</button>
    </div>`;
  }
  if (canReturn(request)) {
    return `<button class="button secondary" data-loan-action="return" data-loan-id="${id}">Registrar devolución</button>`;
  }
  return '—';
}

function canReturn(request) {
  // Las aprobaciones antiguas ya descontaban existencias y no tenían paso de entrega.
  return request.status === 'delivered' || (request.status === 'approved' && !request.approvedAt);
}

function loanRow(request, isAdmin) {
  const date = dateLabel(request.requestedAt) || request.date || '—';
  const details = [
    request.productSerial ? 'Serie: ' + request.productSerial : 'Serie sin registrar',
    request.reason ? 'Motivo: ' + request.reason : '',
  ].filter(Boolean).join(' · ');
  return `<tr>
    ${isAdmin ? `<td>${escapeHtml(request.teacher)}</td>` : ''}
    <td>
      <span class="table-primary">${escapeHtml(request.productName)}</span>
      <small class="table-secondary">${escapeHtml(details)}</small>
    </td>
    <td>${escapeHtml(request.quantity)}</td>
    <td>${escapeHtml(date)}</td>
    <td>${loanStatus(request)}</td>
    ${isAdmin ? `<td>${loanActions(request)}</td>` : ''}
  </tr>`;
}

function toast(message) {
  $('toast').textContent = message;
  $('toast').classList.add('show');
  setTimeout(() => $('toast').classList.remove('show'), 2400);
}
$('loginForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  $('loginError').hidden = true;
  try {
    const { error } = await supabase.auth.signInWithPassword({
      email: $('email').value.trim().toLowerCase(),
      password: $('password').value,
    });
    if (error) throw error;
  } catch (error) {
    $('loginError').textContent = 'No se pudo iniciar sesión: ' + (error.message || 'revisa el correo y la contraseña.');
    $('loginError').hidden = false;
  }
});
$('forgotPasswordBtn').addEventListener('click', async () => {
  const email = $('email').value.trim().toLowerCase();
  const message = $('resetPasswordMessage');
  message.hidden = true;
  $('loginError').hidden = true;
  if (!email) {
    message.textContent = 'Escribe tu correo institucional para enviarte el enlace de recuperación.';
    message.hidden = false;
    return;
  }
  const recoveryUrl = new URL(window.location.href);
  recoveryUrl.search = '';
  recoveryUrl.hash = '';
  const redirectTo = window.location.protocol === 'file:'
    ? 'http://127.0.0.1:5500/index.html'
    : recoveryUrl.href;
  try {
    const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo });
    if (error) throw error;
    message.textContent = 'Si existe una cuenta con ese correo, recibirás un enlace para crear una contraseña nueva.';
    message.hidden = false;
  } catch (error) {
    message.textContent = 'No se pudo enviar el enlace: ' + (error.message || 'inténtalo de nuevo.');
    message.hidden = false;
  }
});
$('passwordSetupForm').addEventListener('submit', async (event) => {
  event.preventDefault();
  const password = $('newPassword').value;
  if (password !== $('confirmPassword').value) {
    $('passwordSetupError').textContent = 'Las contraseñas no coinciden.';
    $('passwordSetupError').hidden = false;
    return;
  }
  if (!pendingPasswordUser) {
    setLoggedOut('Vuelve a abrir el enlace de invitación desde tu correo.');
    return;
  }
  $('passwordSetupError').hidden = true;
  const { data, error } = await supabase.auth.updateUser({
    password,
    data: { ...pendingPasswordUser.user_metadata, password_setup_required: false },
  });
  if (error) {
    $('passwordSetupError').textContent = error.message || 'No se pudo guardar la contraseña.';
    $('passwordSetupError').hidden = false;
    return;
  }
  pendingPasswordUser = null;
  if (data.user) await loadAuthenticatedUser(data.user);
});
async function logout() {
  await supabase.auth.signOut();
  setLoggedOut();
  document.querySelectorAll('.modal-backdrop').forEach((modal) => modal.classList.remove('open'));
}

$('logoutBtn').addEventListener('click', logout);
function render() {
  renderAdmin();
  renderTeacher();
}
function renderAdmin() {
  const q = $('adminSearch').value.trim().toLowerCase();
  const filtered = products.filter((p) =>
    `${p.name} ${p.category} ${p.model || ''} ${p.serial || ''} ${p.code || ''} ${p.location || ''}`
      .toLowerCase()
      .includes(q),
  );
  $('productCount').textContent = products.length;
  $('unitCount').textContent = products.reduce((n, p) => n + Number(p.quantity), 0);
  const pending = requests.filter((r) => r.status === 'pending').length;
  $('pendingCount').textContent = pending;
  $('navPendingCount').textContent = pending;
  $('productRows').innerHTML = filtered
    .map(
      (p) =>
        `<tr>
          <td>
          <span class="table-primary">${escapeHtml(p.name)}</span>
          <small class="table-secondary">${escapeHtml(p.category || 'Sin categoría')}</small>
          </td>
          <td>${escapeHtml(p.model || '—')}</td>
          <td>
          <span class="serial-value">${escapeHtml(p.serial || 'Sin serie')}</span>
          </td>
          <td>
          <span class="table-primary">${escapeHtml(p.code || 'Sin código')}</span>
          <small class="table-secondary">${escapeHtml(p.location || 'Sin ubicación')}</small>
          </td>
          <td>
          <span class="badge ${p.status === 'available' ? '' : 'low'}">${escapeHtml({ available: 'Disponible', reserved: 'Reservado', loaned: 'En préstamo', maintenance: 'En mantenimiento' }[p.status] || 'No disponible')}</span>
          </td>
          <td>
          <div class="actions">
          <button class="icon-button" aria-label="Editar ${escapeHtml(p.name)}" title="Editar" data-edit="${p.id}">✎</button>
          ${['available', 'maintenance'].includes(p.status) ? `<button class="icon-button" aria-label="${p.status === 'available' ? 'Enviar a mantenimiento' : 'Marcar disponible'}: ${escapeHtml(p.name)}" title="${p.status === 'available' ? 'Enviar a mantenimiento' : 'Marcar disponible'}" data-set-status="${p.status === 'available' ? 'maintenance' : 'available'}" data-equipment-id="${p.id}">${p.status === 'available' ? '⚒' : '✓'}</button>` : ''}
          <button class="icon-button danger" aria-label="Retirar ${escapeHtml(p.name)}" title="Retirar del inventario" data-delete="${p.id}">⋯</button>
          </div>
          </td>
          </tr>`,
    )
    .join('');
  $('productEmpty').hidden = filtered.length > 0;
  $('productRows').closest('table').hidden = !filtered.length;
  const rows = requests.slice().reverse();
  $('adminRequestRows').innerHTML = rows.map((request) => loanRow(request, true)).join('');
  $('requestEmpty').hidden = rows.length > 0;
  $('adminRequestRows').closest('table').hidden = !rows.length;
  const teachers = accounts.filter((account) => account.role === 'teacher');
  $('teacherAccountRows').innerHTML = teachers
    .map(
      (account) =>
        `<tr>
          <td class="product">${escapeHtml(account.name)}</td>
          <td>${escapeHtml(account.email)}</td>
          <td>Docente</td>
          <td>
          ${account.active ? 'Activa' : 'Pendiente / inactiva'}
          </td>
          <td>
          <button type="button" class="button ${account.active ? 'danger' : 'secondary'}" data-toggle-teacher="${account.id}" aria-label="${account.active ? 'Desactivar' : 'Activar'} cuenta de ${escapeHtml(account.name)}">${account.active ? 'Desactivar' : 'Activar'}</button>
          </td>
          </tr>`,
    )
    .join('');
  $('teacherAccountEmpty').hidden = teachers.length > 0;
  $('teacherAccountRows').closest('table').hidden = !teachers.length;
}
function renderTeacher() {
  const q = $('teacherSearch').value.trim().toLowerCase();
  const filtered = products.filter((p) => p.status === 'available').filter((p) =>
    `${p.name} ${p.category} ${p.model || ''} ${p.serial || ''} ${p.location || ''}`
      .toLowerCase()
      .includes(q),
  );
  $('catalog').innerHTML = filtered
    .map(
      (p) =>
        `<article class="catalog-card">
          <div class="device-art" aria-hidden="true">
          <span>▣</span>
          <small>${escapeHtml(p.category || 'EQUIPO')}</small>
          </div>
          <div class="catalog-info">
          <span class="eyebrow">${escapeHtml(p.category || 'Equipo')}</span>
          <h3>${escapeHtml(p.name)}</h3>
          <p class="catalog-model">${escapeHtml(p.model || 'Modelo no especificado')}</p>
          <p class="catalog-serial">Serie <strong>${escapeHtml(p.serial || 'No registrada')}</strong>
          </p>
          <p class="stock">Disponible · Serie ${escapeHtml(p.serial)}</p>
          </div>
          <button class="button" data-request="${p.id}" ${Number(p.quantity) < 1 ? 'disabled' : ''}>Solicitar</button>
          </article>`,
    )
    .join('');
  $('catalogEmpty').hidden = filtered.length > 0;
  const mine = requests
    .filter((r) => r.email === currentUser?.email)
    .slice()
    .reverse();
  $('teacherRequestRows').innerHTML = mine.map((request) => loanRow(request, false)).join('');
  $('teacherRequestEmpty').hidden = mine.length > 0;
  $('teacherRequestRows').closest('table').hidden = !mine.length;
}
// El formulario registra lotes; el inventario conserva una ficha por dispositivo.
const splitSerials = (text) =>
  text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
const normalizeSerial = (serial) =>
  String(serial || '')
    .trim()
    .toUpperCase();

function productFormError(message) {
  $('productFormError').textContent = message;
  $('productFormError').hidden = false;
  $('productFormError').focus();
}

function updateProductBatchFields() {
  const count = Number($('productQuantity').value);
  const validCount = Number.isSafeInteger(count) && count > 0;
  const entered = splitSerials($('productSerial').value).length;
  const multiple = validCount && count > 1;
  $('productSerialLabel').textContent = multiple
    ? 'Números de serie · uno por equipo'
    : 'Número de serie';
  $('productCodeLabel').textContent = multiple
    ? 'Códigos internos (opcionales)'
    : 'Código interno (opcional)';
  $('productSerial').rows = multiple ? 5 : 2;
  $('productCode').rows = multiple ? 3 : 2;
  $('productSerial').placeholder = multiple ? 'JBL-001\nJBL-002\nJBL-003' : 'Ej. JBL-001';
  $('productSerialCount').textContent = validCount
    ? entered + ' de ' + count + ' series ingresadas'
    : 'Indica una cantidad entera mayor que cero.';
  $('productSerialCount').classList.toggle('complete', validCount && entered === count);
  $('productSaveBtn').textContent = multiple ? 'Guardar ' + count + ' equipos' : 'Guardar equipo';
}

function openProduct(product) {
  $('productForm').reset();
  $('productFormError').hidden = true;
  $('productId').value = product?.id || '';
  const individual = Boolean(product && Number(product.quantity) <= 1);
  $('productModalTitle').textContent = product ? 'Editar ficha del equipo' : 'Registrar equipos';
  $('productQuantityField').hidden = individual;
  $('productQuantity').disabled = Boolean(product);
  $('productQuantity').value = individual ? 1 : product?.quantity || 1;
  $('productAvailabilityField').hidden = !individual;
  $('productAvailability').textContent =
    Number(product?.quantity) > 0 ? 'Disponible' : 'No disponible';
  $('productFormHint').textContent = individual
    ? 'Esta ficha identifica un solo dispositivo. Usa Registrar equipo para agregar más equipos con sus propias series.'
    : product
      ? 'Completa una serie por equipo para separar este registro agrupado en fichas individuales.'
      : 'Registra varios equipos juntos. Cada número de serie creará una ficha individual.';
  if (product) {
    $('productName').value = product.name || '';
    $('productCategory').value = product.category || '';
    $('productModel').value = product.model || '';
    $('productSerial').value = product.serial || '';
    $('productCode').value = product.code || '';
    $('productLocation').value = product.location || '';
  }
  updateProductBatchFields();
  $('productBackdrop').classList.add('open');
}

function buildProductBatch(draft, inventory, history, makeId) {
  const existing = draft.id ? inventory.find((item) => item.id === draft.id) : null;
  if (draft.id && !existing)
    throw new Error('El registro ya no existe. Cierra el formulario y vuelve a abrirlo.');
  const individual = existing && Number(existing.quantity) <= 1;
  const count = existing ? (individual ? 1 : Number(existing.quantity)) : Number(draft.count);
  if (!Number.isSafeInteger(count) || count < 1)
    throw new Error('Indica una cantidad entera mayor que cero.');
  if (count > 100) throw new Error('Puedes registrar hasta 100 equipos por lote.');
  if (!draft.name.trim()) throw new Error('Escribe el nombre del equipo.');
  const serials = splitSerials(draft.serialText);
  if (serials.length !== count) {
    throw new Error(
      'Para registrar ' +
        count +
        ' equipos necesitas ' +
        count +
        ' series distintas, una por línea. Has ingresado ' +
        serials.length +
        '.',
    );
  }
  const seen = new Set();
  const used = new Set(
    inventory
      .filter((item) => item.id !== draft.id)
      .map((item) => normalizeSerial(item.serial))
      .filter(Boolean),
  );
  for (const serial of serials) {
    if (serial.length > 80)
      throw new Error('Cada número de serie puede tener hasta 80 caracteres.');
    const key = normalizeSerial(serial);
    if (seen.has(key)) throw new Error('La serie ' + serial + ' está repetida en la lista.');
    if (used.has(key))
      throw new Error('La serie ' + serial + ' ya está registrada en el inventario.');
    seen.add(key);
  }
  // Una ficha agrupada con historial requiere conciliar sus equipos antes de dividirla.
  const linked = existing && history.some((request) => request.productId === existing.id);
  if (linked && !individual) {
    throw new Error(
      'Este registro agrupado tiene solicitudes asociadas. Es necesario revisar esas solicitudes antes de separarlo, para conservar su historial.',
    );
  }
  if (
    linked &&
    normalizeSerial(existing.serial) &&
    normalizeSerial(existing.serial) !== normalizeSerial(serials[0])
  ) {
    throw new Error(
      'Este equipo ya tiene solicitudes. Conserva su número de serie para mantener la identificación del préstamo.',
    );
  }
  const codes = draft.codeText
    .replace(/\r/g, '')
    .split('\n')
    .map((line) => line.trim());
  if (codes.slice(count).some(Boolean))
    throw new Error('Hay más códigos internos que equipos. Revisa el orden de las líneas.');
  if (codes.some((code) => code.length > 40))
    throw new Error('Cada código interno puede tener hasta 40 caracteres.');
  const items = serials.map((serial, index) => ({
    ...(index === 0 && existing ? existing : {}),
    id: index === 0 && existing ? existing.id : makeId(),
    name: draft.name.trim(),
    category: draft.category.trim(),
    model: draft.model.trim(),
    serial,
    code: codes[index] || '',
    location: draft.location.trim(),
    quantity: individual ? Number(existing.quantity) : 1,
    minimum: 0,
    status: existing?.status || 'available',
  }));
  const nextProducts = inventory.slice();
  if (existing) {
    const index = nextProducts.findIndex((item) => item.id === existing.id);
    nextProducts.splice(index, 1);
    return {
      items,
      products: nextProducts.slice(0, index).concat(items, nextProducts.slice(index)),
    };
  }
  return { items, products: items.concat(nextProducts) };
}
function closeModal(id) {
  $(id).classList.remove('open');
}
document
  .querySelectorAll('.add-product-btn')
  .forEach((btn) => btn.addEventListener('click', () => openProduct()));
$('addTeacherBtn').addEventListener('click', () => {
  $('teacherForm').reset();
  $('teacherBackdrop').classList.add('open');
});
document
  .querySelectorAll('[data-close]')
  .forEach((btn) => btn.addEventListener('click', () => closeModal(btn.dataset.close)));
document.querySelectorAll('.modal-backdrop').forEach((modal) =>
  modal.addEventListener('click', (e) => {
    if (e.target === modal) closeModal(modal.id);
  }),
);
$('productQuantity').addEventListener('input', updateProductBatchFields);
$('productSerial').addEventListener('input', updateProductBatchFields);
$('productForm').addEventListener('input', () => {
  $('productFormError').hidden = true;
});
$('productForm').addEventListener('submit', (event) => {
  event.preventDefault();
  const draft = {
    id: $('productId').value,
    count: $('productQuantity').value,
    name: $('productName').value,
    category: $('productCategory').value,
    model: $('productModel').value,
    serialText: $('productSerial').value,
    codeText: $('productCode').value,
    location: $('productLocation').value,
  };
  withInventoryWrite('admin', async () => {
    const batch = buildProductBatch(draft, products, requests, () => crypto.randomUUID());
    const items = batch.items.map((item) => {
      const payload = {
        name: item.name,
        category: item.category,
        model: item.model,
        serial: item.serial,
        code: item.code,
        location: item.location,
        status: item.status || 'available',
      };
      if (products.some((product) => product.id === item.id)) payload.id = item.id;
      return payload;
    });
    const { error } = await supabase.rpc('edu_save_equipment', { p_items: items });
    if (error) throw error;
    await refreshData();
    closeModal('productBackdrop');
    toast(items.length > 1 ? `${items.length} equipos guardados, cada uno con su serie.` : 'Equipo guardado.');
  }, (error) => productFormError(error.message || 'No se pudo guardar el lote.'));
});

$('teacherForm').addEventListener('submit', (e) => {
  e.preventDefault();
  const email = $('teacherEmail').value.trim().toLowerCase();
  if (currentUser?.role !== 'admin') return;
  if (accounts.some((account) => account.email.toLowerCase() === email)) {
    toast('Ya existe una cuenta con ese correo.');
    return;
  }
  const name = $('teacherName').value.trim();
  if (!name) {
    toast('Escribe el nombre del docente.');
    return;
  }
  withInventoryWrite('admin', async () => {
    const { data, error } = await supabase.functions.invoke('invite-teacher', { body: { email, name } });
    if (error) throw error;
    if (data?.error) throw new Error(data.error);
    await refreshData();
    closeModal('teacherBackdrop');
    toast('Invitación enviada. La cuenta aparecerá como inactiva hasta que administración la active.');
  });
});
$('teacherAccountRows').addEventListener('click', (event) => {
  const button = event.target.closest('[data-toggle-teacher]');
  if (!button || currentUser?.role !== 'admin') return;

  const account = accounts.find((item) => item.id === button.dataset.toggleTeacher);
  if (!account || account.role !== 'teacher') return;
  const active = !account.active;
  if (!active && !confirm(`¿Desactivar la cuenta de ${account.name}? Las solicitudes pendientes se cancelarán.`)) return;
  withInventoryWrite('admin', async () => {
    const { error } = await supabase.rpc('edu_manage_teacher', {
      p_id: account.id,
      p_name: account.name,
      p_active: active,
    });
    if (error) throw error;
    await refreshData();
    toast(active ? 'Cuenta docente activada.' : 'Cuenta docente desactivada.');
  });
});
$('productRows').addEventListener('click', (event) => {
  if (currentUser?.role !== 'admin') return;
  const edit = event.target.closest('[data-edit]');
  const remove = event.target.closest('[data-delete]');
  const setStatus = event.target.closest('[data-set-status]');
  if (edit) {
    const product = products.find((item) => item.id === edit.dataset.edit);
    if (product) openProduct(product);
  }
  if (setStatus) {
    const product = products.find((item) => item.id === setStatus.dataset.equipmentId);
    if (!product) return;
    const nextStatus = setStatus.dataset.setStatus;
    const hasPendingRequest = requests.some((request) => request.productId === product.id && request.status === 'pending');
    const warning = nextStatus === 'maintenance' && hasPendingRequest
      ? ' Las solicitudes pendientes para este equipo se cancelarán.'
      : '';
    if (!confirm(`${nextStatus === 'maintenance' ? 'Enviar a mantenimiento' : 'Marcar disponible'} ${product.name}?${warning}`)) return;
    withInventoryWrite('admin', async () => {
      const { error } = await supabase.rpc('edu_set_equipment_status', {
        p_id: product.id,
        p_status: nextStatus,
      });
      if (error) throw error;
      await refreshData();
      toast(nextStatus === 'maintenance' ? 'Equipo enviado a mantenimiento.' : 'Equipo marcado como disponible.');
    });
    return;
  }
  if (!remove) return;
  const id = remove.dataset.delete;
  const product = products.find((item) => item.id === id);
  if (!product || !confirm(`¿Retirar ${product.name} del inventario? El historial de solicitudes se conservará.`)) return;
  withInventoryWrite('admin', async () => {
    const active = requests.some(
      (request) =>
        request.productId === id && ['pending', 'approved', 'delivered'].includes(request.status),
    );
    if (active)
      throw new Error(
        'Resuelve las solicitudes y préstamos activos antes de eliminar este equipo.',
      );
    const { error } = await supabase.rpc('edu_set_equipment_status', {
      p_id: id,
      p_status: 'retired',
    });
    if (error) throw error;
    await refreshData();
    toast('Equipo retirado del inventario. Su historial se conserva.');
  });
});

function updateLoan(id, action, dueAt) {
  withInventoryWrite('admin', async () => {
    const request = requests.find((item) => item.id === id);
    if (!request) throw new Error('La solicitud ya no está disponible.');
    const reserved = request.status === 'approved' && request.approvedAt;
    const allowed = {
      approve: request.status === 'pending',
      reject: request.status === 'pending',
      deliver: reserved,
      cancel: reserved,
      return: canReturn(request),
    };
    if (!allowed[action]) throw new Error('Esta solicitud ya fue actualizada.');
    if (action === 'deliver' && (!Number.isFinite(dueAt?.getTime()) || dueAt <= new Date())) {
      throw new Error('La devolución prevista debe ser posterior a la entrega.');
    }
    const { error } = await supabase.rpc('edu_resolve_request', {
      p_id: id,
      p_action: action,
      p_due_at: action === 'deliver' ? dueAt.toISOString() : null,
    });
    if (error) throw error;
    await refreshData();
    if (action === 'deliver') closeModal('deliveryBackdrop');
    toast(
      {
        approve: 'Equipo reservado.',
        reject: 'Solicitud rechazada.',
        deliver: 'Entrega registrada.',
        cancel: 'Reserva cancelada. El equipo vuelve a estar disponible.',
        return: 'Devolución registrada. El equipo vuelve a estar disponible.',
      }[action],
    );
  });
}

$('catalog').addEventListener('click', (e) => {
  const btn = e.target.closest('[data-request]');
  if (!btn) return;
  const item = products.find((p) => p.id === btn.dataset.request);
  if (!item) return;
  $('requestForm').reset();
  $('requestProductId').value = item.id;
  $('requestProductInfo').textContent =
    `${item.name}${item.model ? ` · ${item.model}` : ''}${item.serial ? ` · Serie ${item.serial}` : ''}`;
  $('requestBackdrop').classList.add('open');
});
$('requestForm').addEventListener('submit', (event) => {
  event.preventDefault();
  const id = $('requestProductId').value;
  const reason = $('requestReason').value.trim();
  withInventoryWrite('teacher', async () => {
    const item = products.find((product) => product.id === id);
    if (!item || item.status !== 'available') throw new Error('Este equipo ya no está disponible.');
    if (!reason) throw new Error('Indica el motivo de la solicitud.');
    const duplicate = requests.some(
      (request) =>
        request.productId === id &&
        request.email === currentUser.email &&
        request.status === 'pending',
    );
    if (duplicate) throw new Error('Ya tienes una solicitud pendiente para este equipo.');
    const { error } = await supabase.rpc('edu_request_equipment', {
      p_equipment_id: item.id,
      p_reason: reason,
    });
    if (error) throw error;
    await refreshData();
    closeModal('requestBackdrop');
    toast('Solicitud enviada a administración.');
  });
});

$('adminSearch').addEventListener('input', renderAdmin);
$('teacherSearch').addEventListener('input', renderTeacher);
$('adminRequestRows').addEventListener('click', (event) => {
  const button = event.target.closest('[data-loan-action]');
  if (!button || currentUser?.role !== 'admin') return;
  const id = button.dataset.loanId;
  const action = button.dataset.loanAction;
  const request = requests.find((item) => item.id === id);
  if (!request) return;
  if (action === 'deliver') {
    $('deliveryForm').reset();
    $('deliveryRequestId').value = id;
    $('deliveryInfo').textContent = [request.productName, request.productSerial, request.teacher]
      .filter(Boolean)
      .join(' · ');
    $('deliveryBackdrop').classList.add('open');
    $('deliveryDueAt').focus();
    return;
  }
  if (action === 'return' && !confirm(`¿Confirmas que recibiste ${request.productName}?`)) return;
  if (action === 'cancel' && !confirm(`¿Cancelar la reserva de ${request.productName}?`)) return;
  updateLoan(id, action);
});

$('deliveryForm').addEventListener('submit', (event) => {
  event.preventDefault();
  const dueAt = new Date($('deliveryDueAt').value + ':00-06:00');
  updateLoan($('deliveryRequestId').value, 'deliver', dueAt);
});

document.querySelectorAll('.section-nav a').forEach((link) =>
  link.addEventListener('click', () => {
    link
      .closest('.section-nav')
      .querySelectorAll('a')
      .forEach((item) => item.classList.remove('active'));
    link.classList.add('active');
  }),
);
supabase.auth.onAuthStateChange((event, session) => {
  if (session?.user) {
    if (event === 'PASSWORD_RECOVERY') {
      window.setTimeout(() => showPasswordSetup(session.user, 'recovery'), 0);
      return;
    }
    window.setTimeout(() => loadAuthenticatedUser(session.user), 0);
  } else if (event === 'SIGNED_OUT' && currentUser) {
    setLoggedOut();
  } else if (event === 'INITIAL_SESSION') {
    setLoggedOut();
  }
});

window.addEventListener('focus', synchronizeData);
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') synchronizeData();
});
window.setInterval(() => {
  if (currentUser) synchronizeData();
}, 20000);
