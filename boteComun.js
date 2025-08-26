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

  if (!form || !btnAdd || !btnPay) return;

  // Estado
  let state = { transactions: [], totals: { added: 0, paid: 0, balance: 0 } };

  // Firebase
  let hasFirebase = !!(window.__BOTE_FIREBASE && window.__BOTE_FIREBASE.db);
  let db = hasFirebase ? window.__BOTE_FIREBASE.db : null;
  let auth = hasFirebase ? window.__BOTE_FIREBASE.auth : null;
  let isReady = false;
  let unsubTxs = null;

  // UI
  function setUIEnabled(enabled) {
    [btnAdd, btnPay, btnQuick5, btnQuick10, btnReset].forEach(b => {
      if (!b) return;
      b.disabled = !enabled;
      b.classList.toggle('disabled', !enabled);
    });
  }
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

  // Sala
  function getRoomId(){
    const params = new URLSearchParams(location.search);
    const p = params.get('room');
    if (p && p.trim()) return p.trim();
    const s = localStorage.getItem('bote_room');
    if (s) return s;
    const newR = 'room-'+Math.random().toString(36).slice(2,8);
    localStorage.setItem('bote_room', newR);
    showToastMini(`Sala creada: ${newR}`, 2000);
    return newR;
  }
  const ROOM_ID = getRoomId();
  document.title = `BoteComun — ${ROOM_ID}`;
  setTimeout(() => {
    const ru = `${location.origin}${location.pathname}?room=${ROOM_ID}`;
    const el = document.getElementById('room-url');
    if (el) { el.href = ru; el.textContent = ru; }
  }, 100);

  // Local
  function loadLocal(){
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      state = raw ? JSON.parse(raw) : { transactions:[], totals:{added:0,paid:0,balance:0} };
    } catch { state = { transactions:[], totals:{added:0,paid:0,balance:0} }; }
  }
  function saveLocal(){ try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch {} }

  // Render
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

    if (statAdded) statAdded.textContent = money(state.totals.added);
    if (statPaid) statPaid.textContent = money(state.totals.paid);
    if (statBalance) statBalance.textContent = money(state.totals.balance);

    if (txList) {
      txList.innerHTML = '';
      txs.slice().reverse().forEach(tx => {
        const li = document.createElement('li');
        li.className = 'tx-item';
        const created = tx.createdAt && tx.createdAt.toDate ? tx.createdAt.toDate() :
                        (typeof tx.createdAt === 'number' ? new Date(tx.createdAt) : new Date());
        li.innerHTML = `
          <div class="tx-left">
            <div class="badge ${tx.type==='add'?'add':'pay'}">${tx.type==='add'?'+':'−'}</div>
            <div>
              <div><strong>${escapeHtml(tx.name)}</strong> · ${money(tx.amount)} ${tx.place ? '· '+escapeHtml(tx.place) : ''}</div>
              <div class="muted">${created.toLocaleString()}</div>
            </div>
          </div>
          <div><button class="btn ghost btn-delete" data-id="${tx.id}" type="button">Eliminar</button></div>
        `;
        txList.appendChild(li);
      });
    }
  }

  // Firestore
  function subscribeToRoom(roomId){
    if (!db) return;
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

  // Eventos UI
  function setupEventListeners(){
    const copyBtn = document.getElementById('copy-room');
    copyBtn?.addEventListener('click', ()=>{
      const u = `${location.origin}${location.pathname}?room=${ROOM_ID}`;
      (navigator.clipboard?.writeText(u) || Promise.reject()).then(
        ()=>showToastMini('Enlace copiado',1200),
        ()=>showToastMini('No se pudo copiar',1500)
      );
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
      if (!toastOverlay) return;
      toastOverlay.classList.add('show'); toastOverlay.setAttribute('aria-hidden','false'); toastConfirm?.focus();
    });
    toastCancel?.addEventListener('click', ()=>{
      toastOverlay?.classList.remove('show'); toastOverlay?.setAttribute('aria-hidden','true');
    });
    toastConfirm?.addEventListener('click', async ()=>{
      if (hasFirebase && isReady) {
        try { await resetRoomFirestore(); showToastMini('Sala reseteada',1200); }
        catch(err){ showToastMini('Error reset: '+(err.code||''),1500); }
      } else {
        state.transactions=[]; state.totals={added:0,paid:0,balance:0}; saveLocal(); render(); showToastMini('Bote reseteado',1200);
      }
      toastOverlay?.classList.remove('show'); toastOverlay?.setAttribute('aria-hidden','true');
    });

    window.addEventListener('keydown', e=>{
      if (e.key==='Escape'){ hideCenterModal(); if (toastOverlay?.classList.contains('show')){ toastOverlay.classList.remove('show'); toastOverlay.setAttribute('aria-hidden','true'); } }
    });
  }

  // Submit
  async function submitForm(){
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
      name, place,
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

  // Inicializaciones
  function initLocal(){
    statusEl && (statusEl.textContent='Modo local', statusEl.className='room-status local');
    loadLocal(); render(); setUIEnabled(true);
    window.addEventListener('storage', e=>{ if (e.key===STORAGE_KEY){ loadLocal(); render(); } });
  }
  function initFirebase(){
    statusEl && (statusEl.textContent='Conectando…', statusEl.className='room-status');
    auth.onAuthStateChanged(async (user)=>{
      if (user){
        isReady = true;
        statusEl && (statusEl.textContent='Conectado (Firebase)', statusEl.className='room-status connected');
        setUIEnabled(true);
        if (unsubTxs) unsubTxs();
        subscribeToRoom(ROOM_ID);
        showToastMini('Conectado a sala: '+ROOM_ID,1200);
      } else {
        try { await auth.signInAnonymously(); }
        catch(e){ statusEl.textContent = 'Auth error: '+(e.code||e.message); }
      }
    });
    if (auth.currentUser===null){ auth.signInAnonymously().catch(e=>{ statusEl.textContent = 'Auth error: '+(e.code||e.message); }); }
  }

  // Arranque
  setTimeout(()=>{
    hasFirebase = !!(window.__BOTE_FIREBASE && window.__BOTE_FIREBASE.db);
    db = hasFirebase ? window.__BOTE_FIREBASE.db : null;
    auth = hasFirebase ? window.__BOTE_FIREBASE.auth : null;

    if (hasFirebase) initFirebase();
    else initLocal();
  }, 600);

  setupEventListeners();
});
