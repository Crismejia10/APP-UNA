
    const PRODUCTS_KEY='educologia-products-v1', REQUESTS_KEY='educologia-requests-v1', ACCOUNTS_KEY='educologia-accounts-v1';
    const DEFAULT_ACCOUNTS={
      'admin@educologia.test':{password:'admin123',name:'Administración',role:'admin'},
      'docente@educologia.test':{password:'docente123',name:'Docente de demostración',role:'teacher'}
    };
    const $=id=>document.getElementById(id);
    const read=(key,fallback)=>{try{return JSON.parse(localStorage.getItem(key))??fallback}catch{return fallback}};
    let accounts = { ...read(ACCOUNTS_KEY, DEFAULT_ACCOUNTS) };
    let products=read(PRODUCTS_KEY,[
      {id:'p1',name:'Proyector multimedia',category:'Audiovisual',model:'Epson PowerLite E20',serial:'EP-E20-240041',code:'EDU-AV-001',location:'Bodega audiovisual',quantity:1,minimum:0},
      {id:'p2',name:'Computadora portátil',category:'Informática',model:'Dell Latitude 5440',serial:'DL-5440-240118',code:'EDU-TI-014',location:'Laboratorio 2',quantity:1,minimum:0},
      {id:'p3',name:'Parlante portátil',category:'Audio',model:'JBL EON One Compact',serial:'JB-EON-240027',code:'EDU-AU-006',location:'Sala de recursos',quantity:1,minimum:0}
    ]);
    let requests=read(REQUESTS_KEY,[]), currentUser=null;
    const SESSION_KEY = 'educologia-session-v1';
    const INVENTORY_KEY = 'educologia-inventory-v2';
    const savedInventory = read(INVENTORY_KEY, null);
    if (savedInventory) {
      products = savedInventory.products;
      requests = savedInventory.requests;
    }
    const DATA_KEYS = [PRODUCTS_KEY, REQUESTS_KEY, ACCOUNTS_KEY, INVENTORY_KEY];
    let lastStorageSnapshot;

    function storageSnapshot() {
      return JSON.stringify(DATA_KEYS.map(key => localStorage.getItem(key)));
    }

    function save(keys) {
      if (keys.includes(PRODUCTS_KEY) || keys.includes(REQUESTS_KEY)) {
        persistInventory(
          keys.includes(PRODUCTS_KEY) ? products : undefined,
          keys.includes(REQUESTS_KEY) ? requests : undefined
        );
      }
      if (keys.includes(ACCOUNTS_KEY)) localStorage.setItem(ACCOUNTS_KEY, JSON.stringify(accounts));
    }

    // Guarda disponibilidad e historial en una sola escritura.
    function persistInventory(updatedProducts, updatedRequests) {
      const stored = read(INVENTORY_KEY, null);
      const next = {
        products: updatedProducts ?? stored?.products ?? products,
        requests: updatedRequests ?? stored?.requests ?? requests
      };
      localStorage.setItem(INVENTORY_KEY, JSON.stringify(next));
    }

    function synchronizeData() {
      const stored = read(INVENTORY_KEY, null);
      products = stored?.products ?? read(PRODUCTS_KEY, products);
      requests = stored?.requests ?? read(REQUESTS_KEY, []);
      accounts = { ...read(ACCOUNTS_KEY, DEFAULT_ACCOUNTS) };
      lastStorageSnapshot = storageSnapshot();

      if (!currentUser) return;
      const account = accounts[currentUser.email];
      if (!account || account.role !== currentUser.role) {
        logout();
        toast('Tu cuenta cambió. Inicia sesión de nuevo.');
        return;
      }
      currentUser = { ...account, email: currentUser.email };
      render();
    }
    const escapeHtml=value=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
    const statusLabel=status=>({pending:'Pendiente',approved:'Aprobada',rejected:'Rechazada',returned:'Devuelta'}[status]||status);

    function returnDetails(request) {
      if (!request.returnedAt) return '';
      const date = new Intl.DateTimeFormat('es-CR', {
        dateStyle: 'short', timeStyle: 'short'
      }).format(new Date(request.returnedAt));
      return `<small class="table-secondary">Devolución: ${escapeHtml(date)}</small>`;
    }
    function toast(message){$('toast').textContent=message;$('toast').classList.add('show');setTimeout(()=>$('toast').classList.remove('show'),2400)}
    function login(user) {
      currentUser = user;
      try {
        sessionStorage.setItem(SESSION_KEY, user.email);
      } catch {
        toast('El navegador no permite conservar la sesión al recargar.');
      }
      $('loginScreen').hidden = true;
      $('app').hidden = false;
      $('userLabel').textContent = `${user.name} · ${user.role === 'admin' ? 'Administración' : 'Docente'}`;
      $('adminView').hidden = user.role !== 'admin';
      $('teacherView').hidden = user.role !== 'teacher';
      render();
    }
    $('loginForm').addEventListener('submit',e=>{e.preventDefault();const email=$('email').value.trim().toLowerCase(), account=accounts[email];if(!account||account.password!==$('password').value){$('loginError').hidden=false;return}$('loginError').hidden=true;login({...account,email})});
    function logout() {
      currentUser = null;
      try {
        sessionStorage.removeItem(SESSION_KEY);
      } catch {}
      document.querySelectorAll('.modal-backdrop').forEach(modal => modal.classList.remove('open'));
      $('app').hidden = true;
      $('loginScreen').hidden = false;
      $('password').value = '';
    }

    $('logoutBtn').addEventListener('click', logout);
    function render(){renderAdmin();renderTeacher()}
    function renderAdmin(){const q=$('adminSearch').value.trim().toLowerCase();const filtered=products.filter(p=>`${p.name} ${p.category} ${p.model||''} ${p.serial||''} ${p.code||''} ${p.location||''}`.toLowerCase().includes(q));$('productCount').textContent=products.length;$('unitCount').textContent=products.reduce((n,p)=>n+Number(p.quantity),0);const pending=requests.filter(r=>r.status==='pending').length;$('pendingCount').textContent=pending;$('navPendingCount').textContent=pending;$('productRows').innerHTML=filtered.map(p=>`<tr><td><span class="table-primary">${escapeHtml(p.name)}</span><small class="table-secondary">${escapeHtml(p.category||'Sin categoría')}</small></td><td>${escapeHtml(p.model||'—')}</td><td><span class="serial-value">${escapeHtml(p.serial||'Sin serie')}</span></td><td><span class="table-primary">${escapeHtml(p.code||'Sin código')}</span><small class="table-secondary">${escapeHtml(p.location||'Sin ubicación')}</small></td><td><span class="badge ${Number(p.quantity)<=Number(p.minimum)?'low':''}">${Number(p.quantity)<=Number(p.minimum)?'Disponibilidad baja':`${Number(p.quantity)} disponible${Number(p.quantity)===1?'':'s'}`}</span></td><td><div class="actions"><button class="icon-button" aria-label="Editar ${escapeHtml(p.name)}" title="Editar" data-edit="${p.id}">✎</button><button class="icon-button danger" aria-label="Eliminar ${escapeHtml(p.name)}" title="Eliminar" data-delete="${p.id}">⋯</button></div></td></tr>`).join('');$('productEmpty').hidden=filtered.length>0;$('productRows').closest('table').hidden=!filtered.length;
      const rows=requests.slice().reverse();$('adminRequestRows').innerHTML=rows.map(r=>`<tr><td>${escapeHtml(r.teacher)}</td><td><span class="table-primary">${escapeHtml(r.productName)}</span><small class="table-secondary">${r.productSerial?`Serie: ${escapeHtml(r.productSerial)}`:'Serie no registrada en la solicitud'}</small></td><td>${r.quantity}</td><td>${escapeHtml(r.date)}</td><td><span class="badge ${r.status==='pending'?'waiting':r.status==='rejected'?'low':''}">${statusLabel(r.status)}</span>${returnDetails(r)}</td><td>${r.status==='pending'?`<div class="actions"><button class="button compact" data-approve="${r.id}">Aprobar</button><button class="button danger" data-reject="${r.id}">Rechazar</button></div>`:r.status==='approved'?`<button type="button" class="button secondary" data-return="${escapeHtml(r.id)}">Registrar devolución</button>`:'—'}</td></tr>`).join('');$('requestEmpty').hidden=rows.length>0;$('adminRequestRows').closest('table').hidden=!rows.length;
      const teachers=Object.entries(accounts).filter(([,account])=>account.role==='teacher');$('teacherAccountRows').innerHTML=teachers.map(([email,account])=>`<tr><td class="product">${escapeHtml(account.name)}</td><td>${escapeHtml(email)}</td><td>Docente</td><td><button type="button" class="button danger" data-delete-teacher="${escapeHtml(email)}" aria-label="Eliminar cuenta de ${escapeHtml(account.name)}">Eliminar cuenta</button></td></tr>`).join('');$('teacherAccountEmpty').hidden=teachers.length>0;$('teacherAccountRows').closest('table').hidden=!teachers.length}
    function renderTeacher(){const q=$('teacherSearch').value.trim().toLowerCase();const filtered=products.filter(p=>`${p.name} ${p.category} ${p.model||''} ${p.serial||''} ${p.location||''}`.toLowerCase().includes(q));$('catalog').innerHTML=filtered.map(p=>`<article class="catalog-card"><div class="device-art" aria-hidden="true"><span>▣</span><small>${escapeHtml(p.category||'EQUIPO')}</small></div><div class="catalog-info"><span class="eyebrow">${escapeHtml(p.category||'Equipo')}</span><h3>${escapeHtml(p.name)}</h3><p class="catalog-model">${escapeHtml(p.model||'Modelo no especificado')}</p><p class="catalog-serial">Serie <strong>${escapeHtml(p.serial||'No registrada')}</strong></p><p class="stock">${p.quantity} ${Number(p.quantity)===1?'unidad disponible':'unidades disponibles'}</p></div><button class="button" data-request="${p.id}" ${Number(p.quantity)<1?'disabled':''}>Solicitar</button></article>`).join('');$('catalogEmpty').hidden=filtered.length>0;const mine=requests.filter(r=>r.email===currentUser?.email).slice().reverse();$('teacherRequestRows').innerHTML=mine.map(r=>`<tr><td><span class="table-primary">${escapeHtml(r.productName)}</span><small class="table-secondary">${r.productSerial?`Serie: ${escapeHtml(r.productSerial)}`:'Serie no registrada en la solicitud'}</small></td><td>${r.quantity}</td><td>${escapeHtml(r.date)}</td><td><span class="badge ${r.status==='pending'?'waiting':r.status==='rejected'?'low':''}">${statusLabel(r.status)}</span>${returnDetails(r)}</td></tr>`).join('');$('teacherRequestEmpty').hidden=mine.length>0;$('teacherRequestRows').closest('table').hidden=!mine.length}
    // El formulario registra lotes; el inventario conserva una ficha por dispositivo.
    const splitSerials = text => text.split(/\r?\n/).map(line => line.trim()).filter(Boolean);
    const normalizeSerial = serial => String(serial || '').trim().toUpperCase();

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
      $('productSerialLabel').textContent = multiple ? 'Números de serie · uno por equipo' : 'Número de serie';
      $('productCodeLabel').textContent = multiple ? 'Códigos internos (opcionales)' : 'Código interno (opcional)';
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
      $('productQuantity').disabled = individual;
      $('productQuantity').value = individual ? 1 : product?.quantity || 1;
      $('productAvailabilityField').hidden = !individual;
      $('productAvailability').textContent = Number(product?.quantity) > 0 ? 'Disponible' : 'No disponible';
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
      const existing = draft.id ? inventory.find(item => item.id === draft.id) : null;
      if (draft.id && !existing) throw new Error('El registro ya no existe. Cierra el formulario y vuelve a abrirlo.');
      const individual = existing && Number(existing.quantity) <= 1;
      const count = individual ? 1 : Number(draft.count);
      if (!Number.isSafeInteger(count) || count < 1) throw new Error('Indica una cantidad entera mayor que cero.');
      if (!draft.name.trim()) throw new Error('Escribe el nombre del equipo.');
      const serials = splitSerials(draft.serialText);
      if (serials.length !== count) {
        throw new Error('Para registrar ' + count + ' equipos necesitas ' + count + ' series distintas, una por línea. Has ingresado ' + serials.length + '.');
      }
      const seen = new Set();
      const used = new Set(inventory.filter(item => item.id !== draft.id).map(item => normalizeSerial(item.serial)).filter(Boolean));
      for (const serial of serials) {
        if (serial.length > 80) throw new Error('Cada número de serie puede tener hasta 80 caracteres.');
        const key = normalizeSerial(serial);
        if (seen.has(key)) throw new Error('La serie ' + serial + ' está repetida en la lista.');
        if (used.has(key)) throw new Error('La serie ' + serial + ' ya está registrada en el inventario.');
        seen.add(key);
      }
      // Una ficha agrupada con historial requiere conciliar sus equipos antes de dividirla.
      const linked = existing && history.some(request => request.productId === existing.id);
      if (linked && !individual) {
        throw new Error('Este registro agrupado tiene solicitudes asociadas. Es necesario revisar esas solicitudes antes de separarlo, para conservar su historial.');
      }
      if (linked && normalizeSerial(existing.serial) && normalizeSerial(existing.serial) !== normalizeSerial(serials[0])) {
        throw new Error('Este equipo ya tiene solicitudes. Conserva su número de serie para mantener la identificación del préstamo.');
      }
      const codes = draft.codeText.replace(/\r/g, '').split('\n').map(line => line.trim());
      if (codes.slice(count).some(Boolean)) throw new Error('Hay más códigos internos que equipos. Revisa el orden de las líneas.');
      if (codes.some(code => code.length > 40)) throw new Error('Cada código interno puede tener hasta 40 caracteres.');
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
        minimum: 0
      }));
      const nextProducts = inventory.slice();
      if (existing) {
        const index = nextProducts.findIndex(item => item.id === existing.id);
        nextProducts.splice(index, 1);
        return { items, products: nextProducts.slice(0, index).concat(items, nextProducts.slice(index)) };
      }
      return { items, products: items.concat(nextProducts) };
    }
    function closeModal(id){$(id).classList.remove('open')}
    document.querySelectorAll('.add-product-btn').forEach(btn=>btn.addEventListener('click',()=>openProduct()));
    $('addTeacherBtn').addEventListener('click',()=>{$('teacherForm').reset();$('teacherBackdrop').classList.add('open')});
    document.querySelectorAll('[data-close]').forEach(btn=>btn.addEventListener('click',()=>closeModal(btn.dataset.close)));
    document.querySelectorAll('.modal-backdrop').forEach(modal=>modal.addEventListener('click',e=>{if(e.target===modal)closeModal(modal.id)}));
    $('productQuantity').addEventListener('input', updateProductBatchFields);
    $('productSerial').addEventListener('input', updateProductBatchFields);
    $('productForm').addEventListener('input', () => { $('productFormError').hidden = true; });
    $('productForm').addEventListener('submit', e => {
      e.preventDefault();
      let batch;
      try {
        batch = buildProductBatch({
          id: $('productId').value,
          count: $('productQuantity').value,
          name: $('productName').value,
          category: $('productCategory').value,
          model: $('productModel').value,
          serialText: $('productSerial').value,
          codeText: $('productCode').value,
          location: $('productLocation').value
        }, products, requests, () => crypto.randomUUID());
      } catch (error) {
        productFormError(error.message);
        return;
      }
      try {
        // Guarda todo el lote antes de reemplazar el inventario en memoria.
        persistInventory(batch.products, undefined);
      } catch {
        productFormError('No se pudo guardar en este navegador. La información del formulario sigue aquí para que puedas volver a intentarlo.');
        return;
      }
      products = batch.products;
      render();
      closeModal('productBackdrop');
      toast(batch.items.length > 1 ? batch.items.length + ' equipos registrados, cada uno con su serie' : 'Equipo guardado');
    });
    $('teacherForm').addEventListener('submit',e=>{e.preventDefault();const email=$('teacherEmail').value.trim().toLowerCase();if(accounts[email]){toast('Ya existe una cuenta con ese correo');return}accounts[email]={name:$('teacherName').value.trim(),password:$('teacherPassword').value,role:'teacher'};save([ACCOUNTS_KEY]);render();closeModal('teacherBackdrop');toast('Cuenta docente creada')});
    $('teacherAccountRows').addEventListener('click', event => {
      const button = event.target.closest('[data-delete-teacher]');
      if (!button || currentUser?.role !== 'admin') return;

      const email = button.dataset.deleteTeacher;
      const account = accounts[email];
      if (!account || account.role !== 'teacher') return;

      const confirmed = confirm(
        `¿Eliminar la cuenta de ${account.name} (${email})? Su historial de solicitudes se conservará.`
      );
      if (!confirmed) return;

      const remainingAccounts = { ...accounts };
      delete remainingAccounts[email];

      try {
        localStorage.setItem(ACCOUNTS_KEY, JSON.stringify(remainingAccounts));
      } catch {
        toast('No se pudo guardar el cambio. La cuenta sigue activa.');
        return;
      }

      accounts = remainingAccounts;
      render();
      toast('Cuenta docente eliminada');
    });
    $('productRows').addEventListener('click',e=>{const edit=e.target.closest('[data-edit]'),del=e.target.closest('[data-delete]');if(edit)openProduct(products.find(p=>p.id===edit.dataset.edit));if(del){if(requests.some(r=>r.productId===del.dataset.delete&&r.status==='approved')){toast('Registra la devolución antes de eliminar este equipo');return}products=products.filter(p=>p.id!==del.dataset.delete);save([PRODUCTS_KEY]);render();toast('Producto eliminado')}});
    $('adminRequestRows').addEventListener('click',e=>{const approve=e.target.closest('[data-approve]'),reject=e.target.closest('[data-reject]');const req=requests.find(r=>r.id===(approve?.dataset.approve||reject?.dataset.reject));if(!req||req.status!=='pending')return;if(approve){const item=products.find(p=>p.id===req.productId);if(!item||item.quantity<req.quantity){toast('No hay existencias suficientes');return}item.quantity-=req.quantity;req.status='approved'}else req.status='rejected';save([PRODUCTS_KEY,REQUESTS_KEY]);render();toast(approve?'Solicitud aprobada y existencias actualizadas':'Solicitud rechazada')});
    $('catalog').addEventListener('click',e=>{const btn=e.target.closest('[data-request]');if(!btn)return;const item=products.find(p=>p.id===btn.dataset.request);$('requestProductId').value=item.id;$('requestProductInfo').textContent=`${item.name}${item.model?` · ${item.model}`:''}${item.serial?` · Serie ${item.serial}`:''} · ${item.quantity} disponibles`;$('requestQuantity').max=item.quantity;$('requestQuantity').value=1;$('requestBackdrop').classList.add('open')});
    $('requestForm').addEventListener('submit',e=>{e.preventDefault();const item=products.find(p=>p.id===$('requestProductId').value),quantity=Number($('requestQuantity').value);if(!item||quantity<1||quantity>item.quantity){toast('Cantidad no disponible');return}requests.push({id:crypto.randomUUID(),productId:item.id,productName:item.name,productSerial:item.serial||'',quantity,teacher:currentUser.name,email:currentUser.email,date:new Intl.DateTimeFormat('es-CR').format(new Date()),status:'pending'});save([REQUESTS_KEY]);render();closeModal('requestBackdrop');toast('Solicitud enviada a administración')});
    $('adminSearch').addEventListener('input',renderAdmin);$('teacherSearch').addEventListener('input',renderTeacher);
    $('adminRequestRows').addEventListener('click', event => {
      const button = event.target.closest('[data-return]');
      if (!button || currentUser?.role !== 'admin') return;
      const id = button.dataset.return;
      const request = requests.find(item => item.id === id);
      if (!request || request.status !== 'approved') return;
      if (!confirm(`¿Confirmas que recibiste ${request.productName} y que puede volver a prestarse?`)) return;

      const registerReturn = () => {
        synchronizeData();
        if (currentUser?.role !== 'admin') return;
        const latestRequest = requests.find(item => item.id === id);
        if (!latestRequest || latestRequest.status !== 'approved') {
          toast('Esta solicitud ya fue actualizada.');
          return;
        }
        const equipment = products.find(item => item.id === latestRequest.productId);
        if (!equipment) {
          toast('El equipo fue eliminado del inventario. Restáuralo antes de registrar la devolución.');
          return;
        }
        const quantity = Number(latestRequest.quantity);
        const available = Number(equipment.quantity);
        if (!Number.isSafeInteger(quantity) || quantity < 1 || !Number.isSafeInteger(available) || available < 0) {
          toast('Revisa la cantidad del préstamo y del equipo antes de registrar la devolución.');
          return;
        }

        const nextProducts = products.map(item => item.id === equipment.id
          ? { ...item, quantity: available + quantity }
          : item);
        const nextRequests = requests.map(item => item.id === id
          ? { ...item, status: 'returned', returnedAt: new Date().toISOString(), returnedBy: currentUser.email }
          : item);
        try {
          persistInventory(nextProducts, nextRequests);
        } catch {
          toast('No se pudo guardar la devolución. El préstamo sigue activo.');
          return;
        }
        products = nextProducts;
        requests = nextRequests;
        render();
        toast('Devolución registrada. El equipo vuelve a estar disponible.');
      };

      if (navigator.locks) {
        navigator.locks.request('educologia-return', registerReturn).catch(() => {
          toast('No se pudo registrar la devolución. Inténtalo de nuevo.');
        });
      } else {
        registerReturn();
      }
    });
    document.querySelectorAll('.section-nav a').forEach(link=>link.addEventListener('click',()=>{link.closest('.section-nav').querySelectorAll('a').forEach(item=>item.classList.remove('active'));link.classList.add('active')}));
    window.addEventListener('storage', event => {
      if (event.storageArea !== localStorage) return;
      if (event.key === null || DATA_KEYS.includes(event.key)) {
        synchronizeData();
      }
    });

    window.addEventListener('focus', synchronizeData);

    // Algunas aperturas como archivo local no notifican cambios a la otra pestaña.
    // Comparamos el almacenamiento sin redibujar la pantalla cuando sigue igual.
    window.setInterval(() => {
      try {
        if (storageSnapshot() !== lastStorageSnapshot) synchronizeData();
      } catch {
        // Conserva la pantalla actual si el navegador restringe el almacenamiento.
      }
    }, 1000);

    // Cada pestaña conserva su propia sesión para probar ambos perfiles a la vez.
    try {
      lastStorageSnapshot = storageSnapshot();
      const email = sessionStorage.getItem(SESSION_KEY);
      const account = accounts[email];
      if (account) login({ ...account, email });
    } catch {
      toast('Inicia sesión para continuar.');
    }
  