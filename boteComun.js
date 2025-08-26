document.addEventListener('DOMContentLoaded', () => {
  const STORAGE_KEY = 'botecomun_v2';

  // DOM
  const form = document.getElementById('entry-form');
  const inputName = document.getElementById('input-name');
  const inputPlace = document.getElementById('input-place');
  const inputAmount = document.getElementById('input-amount');
  const inputType = document.getElementById('input-type');
  const btnAdd = document.getElementById('btn-add');
  const btnPay = document.getElementById('btn-pay');
  const btnQuick5 = document.getElementById('btn-quick-5');
  const btnQuick10 = document.getElementById('btn-quick-10');
  const btnReset = document.getElementById('btn-reset');

  const statAdded = document.getElementById('stat-added');
  const statPaid = document.getElementById('stat-paid');
  const statBalance = document.getElementById('stat-balance');
  const txList = document.getElementById('tx-list');

  const toastOverlay = document.getElementById('toast-overlay');
  const toastConfirm = document.getElementById('toast-confirm');
  const toastCancel = document.getElementById('toast-cancel');

  const cOverlay = document.getElementById('center-toast');
  const cTitle = document.getElementById('center-toast-title');
  const cMsg = document.getElementById('center-toast-msg');
  const cBtnCancel = document.getElementById('center-toast-cancel');
  const cBtnAccept = document.getElementById('center-toast-accept');

  const notifyEl = document.getElementById('notify');
  const statusEl = document.getElementById('room-status');

  const registerPanel = document.getElementById('register-panel');
  const panelOverlay = document.getElementById('panel-overlay');

  const boteNameInput = document.getElementById('bote-name');
  const selectBote = document.getElementById('bote-selector');
  const currentBoteNameEl = document.getElementById('current-bote-name');
  const roomUrlEl = document.getElementById('room-url');

  if (!form || !btnAdd || !btnPay) return;

  // Estado
  let state = { transactions: [], totals: { added: 0, paid: 0, balance: 0 } };
  let ROOMS_CACHE = new Map(); // id -> {name}
  let ROOM_ID = getRoomId();
  let CURRENT_ROOM_NAME = null;

  // Firebase
  let hasFirebase = !!(window.__BOTE_FIREBASE && window.__BOTE_FIREBASE.db);
  let db = hasFirebase ? window.__BOTE_FIREBASE.db : null;
  let auth = hasFirebase ? window.__BOTE_FIREBASE.auth : null;
  let isReady = false;
  let unsubTxs = null;
  let unsubRooms = null;

  // UI Control
  function setUIEnabled(enabled) {
    [btnAdd, btnPay, btnQuick5, btnQuick10, btnReset].forEach(b => {
      if (!b) return;
      b.disabled = !enabled;
      b.classList.toggle('disabled', !enabled);
    });
    [inputName, inputPlace, inputAmount].forEach(input => {
      if (!input) return;
      input.disabled = !enabled;
    });
    if (registerPanel) {
      if (enabled) {
        registerPanel.classList.remove('panel-disabled');
        if (panelOverlay) panelOverlay.style.display = 'none';
      } else {
        registerPanel.classList.add('panel-disabled');
        if (panelOverlay) panelOverlay.style.display = 'flex';
      }
    }
  }
  // Bloqueado por defecto
  setUIEnabled(false);

  // Toast
  let toastTimer = null;
  function showToastMini(message, ms=2500) {
    if (!notifyEl) return;
    notifyEl.textContent = message;
    notifyEl.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(()=> notifyEl.classList.remove('show'), ms);
  }

  // Center modal
  let acceptHandler = null, cancelHandler = null;
  function showCenterModal({ title='Aviso', message='', onAccept=null, onCancel=null, acceptText='Aceptar', cancelText='Cancelar' }={}) {
    if (!cOverlay) { alert(message); if (onCancel) onCancel(); return; }
    if (cTitle) cTitle.textContent = title;
    if (cMsg) cMsg.textContent = message;
    if (cBtnAccept) cBtnAccept.textContent = acceptText;
    if (cBtnCancel) cBtnCancel.textContent = cancelText;
    acceptHandler = onAccept; cancelHandler = onCancel;
    cOverlay.classList.add('show'); cOverlay.setAttribute('aria-hidden','false');
    setTimeout(()=> cBtnAccept && cBtnAccept.focus(), 10);
  }
  function hideCenterModal(){
    if (!cOverlay) return;
    cOverlay.classList.remove('show');
    cOverlay.setAttribute('aria-hidden','true');
    acceptHandler = cancelHandler = null;
  }

  // Utils
  function uid(prefix='t'){ return prefix + Date.now().toString(36) + Math.random().toString(36).slice(2,6); }
  function money(n){ return Number(n||0).toFixed(2) + ' €'; }
  function escapeHtml(s){ return String(s||'').replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m])); }
  function getRoomId(){
    const params = new URLSearchParams(location.search);
    const p = params.get('room');
    return p && p.trim() ? p.trim() : null;
  }

  // Cabecera
  function updateHeaderWithRoom() {
    const id = ROOM_ID;
    const name = CURRENT_ROOM_NAME || ROOMS_CACHE.get(id)?.name || id || 'Ninguno';
    if (currentBoteNameEl) currentBoteNameEl.textContent = name || 'Ninguno';
    if (roomUrlEl) {
      if (id) {
        const ru = `${location.origin}${location.pathname}?room=${id}`;
        roomUrlEl.href = ru; roomUrlEl.textContent = ru;
      } else {
        roomUrlEl.href = '#'; roomUrlEl.textContent = 'Sin seleccionar';
      }
    }
    if (selectBote) {
      if (id) selectBote.value = id;
      else selectBote.value = '';
    }
    document.title = id ? `BoteComun — ${name}` : 'BoteComun';
  }

  // Render movimientos y totales
  function render(){
    const txs = state.transactions || [];
    let totalAdded = 0, totalPaid = 0;
    txs.forEach(tx => {
      const amount = Number(tx.amount)||0;
      if (tx.type==='add') totalAdded += amount;
      if (tx.type==='pay') totalPaid += amount;
    });
    state.totals.added = Number(totalAdded.toFixed(2));
    state.totals.paid = Number(totalPaid.toFixed(2));
    state.totals.balance = Number((totalAdded-totalPaid).toFixed(2));

    statAdded.textContent = money(state.totals.added);
    statPaid.textContent = money(state.totals.paid);
    statBalance.textContent = money(state.totals.balance);

    txList.innerHTML = '';
    txs.slice().reverse().forEach(tx => {
      const li = document.createElement('li');
      li.className = 'tx-item';
      const created = tx.createdAt && tx.createdAt.toDate ? tx.createdAt.toDate() :
                      (typeof tx.createdAt === 'number' ? new Date(tx.createdAt) : new Date());
      const place = tx.place && tx.place.trim() ? tx.place.trim() : '—';
      const typeBadge = tx.type==='add' ? '+ Aporte' : '− Pago';
      li.innerHTML = `
        <div class="tx-left">
          <div class="badge ${tx.type==='add'?'add':'pay'}">${tx.type==='add'?'+':'−'}</div>
          <div>
            <div><strong>${escapeHtml(tx.name)}</strong> · ${money(tx.amount)} · <span class="chip">${escapeHtml(typeBadge)}</span></div>
            <div class="muted">Lugar: <em>${escapeHtml(place)}</em> · ${created.toLocaleString()}</div>
          </div>
        </div>
        <div><button class="btn ghost btn-delete" data-id="${tx.id}" type="button">Eliminar</button></div>
      `;
      txList.appendChild(li);
    });
  }

  // Local (fallback)
  function loadLocal(){
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      state = raw ? JSON.parse(raw) : { transactions:[], totals:{added:0,paid:0,balance:0} };
    } catch { state = { transactions:[], totals:{added:0,paid:0,balance:0} }; }
  }
  function saveLocal(){ try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch {} }

  // Firestore helpers
  function subscribeRoomsList(){
    if (!db) return;
    if (unsubRooms) unsubRooms();
    unsubRooms = db.collection('rooms').orderBy('createdAt','desc').onSnapshot(snap=>{
      ROOMS_CACHE.clear();
      if (selectBote) {
        const current = selectBote.value;
        selectBote.innerHTML = `<option value="">— Selecciona un bote —</option>`;
        snap.forEach(doc=>{
          const data = doc.data() || {};
          const id = doc.id;
          ROOMS_CACHE.set(id, { name: data.name || id });
          const opt = document.createElement('option');
          opt.value = id;
          opt.textContent = data.name || id;
          selectBote.appendChild(opt);
        });
        // Mantener selección visible si está
        if (ROOM_ID) selectBote.value = ROOM_ID;
        else selectBote.value = '';
      }
      updateHeaderWithRoom();
    }, err=>{
      console.error('Rooms snapshot error', err);
    });
  }

  function subscribeToRoom(roomId){
    if (!db) return;
    if (unsubTxs) unsubTxs();
    const roomRef = db.collection('rooms').doc(roomId);
    unsubTxs = roomRef.collection('transactions')
      .orderBy('createdAt','asc')
      .onSnapshot(snap => {
        const arr=[]; snap.forEach(d => arr.push(d.data()));
        state.transactions = arr; render();
      }, err => {
        statusEl.textContent = 'Snapshot error: ' + (err.code || err.message);
        console.error('onSnapshot error:', err);
      });
    // Obtener nombre del bote para cabecera
    roomRef.get().then(d=>{
      const data = d.data()||{};
      CURRENT_ROOM_NAME = data.name || roomId;
      ROOMS_CACHE.set(roomId, {name: CURRENT_ROOM_NAME});
      updateHeaderWithRoom();
    }).catch(()=>{ CURRENT_ROOM_NAME = roomId; updateHeaderWithRoom(); });
  }

  async function ensureRoomDoc(roomId, roomName){
    const ref = db.collection('rooms').doc(roomId);
    const snap = await ref.get();
    if (!snap.exists) {
      await ref.set({ name: roomName || roomId, createdAt: firebase.firestore.FieldValue.serverTimestamp() });
    } else if (roomName) {
      // Actualiza nombre si ha cambiado
      const data = snap.data()||{};
      if (data.name !== roomName) await ref.update({ name: roomName });
    }
  }

  async function addTxFirestore(tx){
    const roomRef = db.collection('rooms').doc(ROOM_ID);
    return roomRef.collection('transactions').doc(tx.id).set(tx);
  }
  async function deleteTxFirestore(id){
    const roomRef = db.collection('rooms').doc(ROOM_ID);
    return roomRef.collection('transactions').doc(id).delete();
  }
  async function resetRoomFirestore(){
    const roomRef = db.collection('rooms').doc(ROOM_ID);
    const snap = await roomRef.collection('transactions').get();
    const batch = db.batch(); snap.forEach(d => batch.delete(d.ref)); await batch.commit();
  }
  async function deleteCurrentRoomFirestore(){
    if (!db || !ROOM_ID) return;
    const roomRef = db.collection('rooms').doc(ROOM_ID);
    const snap = await roomRef.collection('transactions').get();
    const batch = db.batch(); snap.forEach(d => batch.delete(d.ref)); await batch.commit();
    await roomRef.delete();
  }

  // Acciones de sala
  function createNewRoom() {
    const name = (boteNameInput?.value || '').trim();
    if (!name) { showToastMini('Introduce un nombre para el bote', 1800); return; }

    showCenterModal({
      title: '¿Crear nuevo bote?',
      message: `Se creará el bote "${name}". Si hay datos actuales se perderán.`,
      acceptText: 'Crear Bote',
      cancelText: 'Cancelar',
      onAccept: async () => {
        try {
          // Si había sala y se desea eliminar datos previos, se purgan transacciones pero no es obligatorio borrarla
          // Aquí no borramos automáticamente, solo cambiamos a una nueva
          const newRoomId = 'room-' + Math.random().toString(36).slice(2,8);
          const newUrl = `${location.origin}${location.pathname}?room=${newRoomId}`;
          window.history.pushState({}, '', newUrl);

          ROOM_ID = newRoomId;
          CURRENT_ROOM_NAME = name;

          // Crear/asegurar doc de sala
          if (hasFirebase && isReady) {
            await ensureRoomDoc(ROOM_ID, name);
            subscribeToRoom(ROOM_ID);
          }

          // Limpiar estado local y UI
          state = { transactions: [], totals: { added: 0, paid: 0, balance: 0 } };
          render();
          setUIEnabled(true);
          updateHeaderWithRoom();
          showToastMini(`Bote creado: ${name}`, 2500);
          if (boteNameInput) boteNameInput.value = '';
        } catch (error) {
          console.error('Error creando nueva sala:', error);
          showToastMini('Error al crear nuevo bote', 2000);
        }
      }
    });
  }

  function deleteCurrentRoom() {
    if (!ROOM_ID) { showToastMini('No hay bote activo para eliminar', 1800); return; }
    showCenterModal({
      title: '⚠️ ¿Eliminar bote actual?',
      message: 'Esta acción eliminará permanentemente todos los datos del bote actual. No se puede deshacer.',
      acceptText: 'Eliminar',
      cancelText: 'Cancelar',
      onAccept: async () => {
        try {
          if (hasFirebase && isReady) {
            await deleteCurrentRoomFirestore();
            showToastMini('Bote eliminado correctamente', 2000);
          } else {
            localStorage.removeItem(STORAGE_KEY);
            showToastMini('Datos locales eliminados', 2000);
          }
          if (unsubTxs) { unsubTxs(); unsubTxs = null; }

          ROOM_ID = null;
          CURRENT_ROOM_NAME = null;
          state = { transactions: [], totals: { added: 0, paid: 0, balance: 0 } };
          render();
          setUIEnabled(false);

          // Quitar room de la URL
          window.history.pushState({}, '', location.pathname);
          updateHeaderWithRoom();
        } catch (error) {
          console.error('Error eliminando sala:', error);
          showToastMini('Error al eliminar bote', 2000);
        }
      }
    });
  }

  // Envío de formulario
  async function submitForm(){
    if (!ROOM_ID) { showToastMini('Primero crea o selecciona un bote', 2000); return; }

    const name = (inputName.value||'Anon').trim();
    const place = (inputPlace.value||'').trim();
    const amount = parseFloat(inputAmount.value);
    const type = inputType.value || 'add';

    if (!name || !amount || amount<=0){
      showCenterModal({ title:'Datos incompletos', message:'Introduce nombre y cantidad válida mayor que 0.' });
      return;
    }
    if (type==='pay'){
      const balance = Number(state.totals.balance||0);
      if (amount>balance){
        const deficit = Number((amount-balance).toFixed(2));
        showCenterModal({
          title:'Saldo insuficiente',
          message:`Faltan ${deficit.toFixed(2)} € para cubrir este pago.`,
          acceptText:'Añadir dinero', cancelText:'Cancelar',
          onAccept: ()=>{ inputType.value='add'; inputAmount.value=deficit.toFixed(2); inputAmount.focus(); inputAmount.select(); }
        });
        return;
      }
    }
    const tx = {
      id: uid(),
      name,
      place: place || '', // se muestra como “—” si está vacío
      amount: Number(amount.toFixed(2)),
      type,
      createdAt: hasFirebase ? firebase.firestore.FieldValue.serverTimestamp() : Date.now()
    };

    if (hasFirebase){
      if (!isReady){ showToastMini('Conectando con Firebase…',1200); return; }
      try { await addTxFirestore(tx); }
      catch(err){ showToastMini('Error guardar: '+(err.code||''),1500); }
      form.reset(); inputType.value='add'; inputName.focus();
      showToastMini(type==='add'?'Aportación enviada':'Pago enviado',1200);
    } else {
      loadLocal(); state.transactions.push(tx); saveLocal(); render();
      form.reset(); inputType.value='add'; inputName.focus();
      showToastMini(type==='add'?'Aportación añadida':'Pago registrado',1200);
    }
  }

  // Eventos
  function setupEventListeners(){
    document.getElementById('copy-room')?.addEventListener('click', ()=>{
      if (!ROOM_ID) { showToastMini('No hay bote activo para copiar', 2000); return; }
      const u = `${location.origin}${location.pathname}?room=${ROOM_ID}`;
      (navigator.clipboard?.writeText(u) || Promise.reject()).then(
        ()=>showToastMini('Enlace copiado',1200),
        ()=>showToastMini('No se pudo copiar',1500)
      );
    });

    document.getElementById('new-room')?.addEventListener('click', createNewRoom);
    document.getElementById('delete-room')?.addEventListener('click', deleteCurrentRoom);

    // Cambiar bote desde el selector
    selectBote?.addEventListener('change', async (e)=>{
      const id = e.target.value || null;
      if (!id){
        ROOM_ID = null; CURRENT_ROOM_NAME = null;
        setUIEnabled(false);
        if (unsubTxs) { unsubTxs(); unsubTxs = null; }
        state = { transactions: [], totals: { added: 0, paid: 0, balance: 0 } };
        render();
        window.history.pushState({}, '', location.pathname);
        updateHeaderWithRoom();
        return;
      }
      ROOM_ID = id;
      CURRENT_ROOM_NAME = ROOMS_CACHE.get(id)?.name || id;
      const newUrl = `${location.origin}${location.pathname}?room=${id}`;
      window.history.pushState({}, '', newUrl);

      if (hasFirebase && isReady){
        await ensureRoomDoc(id, CURRENT_ROOM_NAME); // por si alguien creó a mano
        subscribeToRoom(id);
      } else {
        loadLocal(); render();
      }
      setUIEnabled(true);
      updateHeaderWithRoom();
      showToastMini(`Bote seleccionado: ${CURRENT_ROOM_NAME}`, 1800);
    });

    btnAdd?.addEventListener('click', e=>{ e.preventDefault(); inputType.value='add'; submitForm(); });
    btnPay?.addEventListener('click', e=>{ e.preventDefault(); inputType.value='pay'; submitForm(); });
    btnQuick5?.addEventListener('click', e=>{ e.preventDefault(); const c=parseFloat(inputAmount.value||0)||0; inputAmount.value=(c+5).toFixed(2); inputAmount.focus(); });
    btnQuick10?.addEventListener('click', e=>{ e.preventDefault(); const c=parseFloat(inputAmount.value||0)||0; inputAmount.value=(c+10).toFixed(2); inputAmount.focus(); });

    form?.addEventListener('submit', e=>{ e.preventDefault(); submitForm(); });

    cBtnAccept?.addEventListener('click', ()=>{ if (acceptHandler) acceptHandler(); hideCenterModal(); });
    cBtnCancel?.addEventListener('click', ()=>{ if (cancelHandler) cancelHandler(); hideCenterModal(); });

    txList?.addEventListener('click', async (e)=>{
      const btn = e.target.closest('.btn-delete'); if (!btn) return;
      const id = btn.dataset.id; if (!confirm('¿Eliminar este movimiento?')) return;
      if (hasFirebase && isReady) {
        try { await deleteTxFirestore(id); showToastMini('Movimiento eliminado',1200); }
        catch(err){ showToastMini('Error borrar: '+(err.code||''),1500); }
      } else {
        loadLocal(); const idx = state.transactions.findIndex(t=>t.id===id);
        if (idx>-1){ state.transactions.splice(idx,1); saveLocal(); render(); showToastMini('Movimiento eliminado',1200); }
      }
    });

    btnReset?.addEventListener('click', ()=>{
      if (!ROOM_ID) { showToastMini('Selecciona un bote primero', 1500); return; }
      toastOverlay.classList.add('show'); toastOverlay.setAttribute('aria-hidden','false'); toastConfirm?.focus();
    });
    toastCancel?.addEventListener('click', ()=>{
      toastOverlay.classList.remove('show'); toastOverlay.setAttribute('aria-hidden','true');
    });
    toastConfirm?.addEventListener('click', async ()=>{
      if (hasFirebase && isReady) {
        try { await resetRoomFirestore(); showToastMini('Sala reseteada',1200); }
        catch(err){ showToastMini('Error reset: '+(err.code||''),1500); }
      } else {
        state.transactions=[]; state.totals={added:0,paid:0,balance:0}; saveLocal(); render(); showToastMini('Bote reseteado',1200);
      }
      toastOverlay.classList.remove('show'); toastOverlay.setAttribute('aria-hidden','true');
    });

    window.addEventListener('keydown', e=>{
      if (e.key==='Escape'){ hideCenterModal(); if (toastOverlay.classList.contains('show')){ toastOverlay.classList.remove('show'); toastOverlay.setAttribute('aria-hidden','true'); } }
    });
  }

  // Inicializaciones
  function initLocal(){
    statusEl && (statusEl.textContent='Modo local', statusEl.className='room-status local');
    loadLocal(); render();
    if (ROOM_ID) setUIEnabled(true);
    else setUIEnabled(false);
    updateHeaderWithRoom();
  }

  function initFirebase(){
    statusEl && (statusEl.textContent='Conectando…', statusEl.className='room-status');
    setUIEnabled(false); // bloqueo inicial
    auth.onAuthStateChanged(async (user)=>{
      if (user){
        isReady = true;
        statusEl && (statusEl.textContent='Conectado (Firebase)', statusEl.className='room-status connected');
        subscribeRoomsList(); // pobla el selector
        if (ROOM_ID) {
          subscribeToRoom(ROOM_ID);
          setUIEnabled(true);
          updateHeaderWithRoom();
          showToastMini('Conectado a bote: '+(CURRENT_ROOM_NAME||ROOM_ID),1200);
        }
      } else {
        try { await auth.signInAnonymously(); }
        catch(e){ statusEl.textContent = 'Auth error: '+(e.code||e.message); }
      }
    });
    if (auth.currentUser===null){
      auth.signInAnonymously().catch(e=>{ statusEl.textContent = 'Auth error: '+(e.code||e.message); });
    }
  }

  // Arranque
  setupEventListeners();
  setTimeout(()=>{
    hasFirebase = !!(window.__BOTE_FIREBASE && window.__BOTE_FIREBASE.db);
    db = hasFirebase ? window.__BOTE_FIREBASE.db : null;
    auth = hasFirebase ? window.__BOTE_FIREBASE.auth : null;

    if (hasFirebase) initFirebase();
    else initLocal();
  }, 400);
});