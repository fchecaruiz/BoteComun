document.addEventListener('DOMContentLoaded', () => {
  console.log('BoteComun JS cargado');
  
  const STORAGE_KEY = 'botecomun_v2';
  
  // DOM elements
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

  if (!form || !btnAdd || !btnPay) {
    console.error('Elementos críticos no encontrados');
    return;
  }

  let state = { transactions: [], totals: { added: 0, paid: 0, balance: 0 } };

  let hasFirebase = false;
  let db = null;
  let auth = null;
  
  setTimeout(() => {
    hasFirebase = !!(window.__BOTE_FIREBASE && window.__BOTE_FIREBASE.db);
    db = hasFirebase ? window.__BOTE_FIREBASE.db : null;
    auth = hasFirebase ? window.__BOTE_FIREBASE.auth : null;
    
    console.log('Firebase detectado:', hasFirebase);
    
    const statusEl = document.getElementById('room-status');
    if (statusEl) {
      statusEl.textContent = hasFirebase ? 'Conectado (Firebase)' : 'Modo local';
      statusEl.className = hasFirebase ? 'room-status connected' : 'room-status local';
    }
    
    if (hasFirebase) {
      initFirebase();
    } else {
      initLocal();
    }
  }, 1000);

  function getRoomId(){
    const params = new URLSearchParams(location.search);
    const p = params.get('room');
    if (p && p.trim()) return p.trim();
    
    const s = localStorage.getItem('bote_room');
    if (s) return s;
    
    const newR = 'room-'+Math.random().toString(36).slice(2,8);
    localStorage.setItem('bote_room', newR);
    showToastMini(`Sala creada: ${newR}`, 4000);
    console.info('Nueva sala creada:', newR);
    return newR;
  }
  
  const ROOM_ID = getRoomId();
  document.title = `BoteComun — ${ROOM_ID}`;
  
  setTimeout(() => {
    const ru = `${location.origin}${location.pathname}?room=${ROOM_ID}`;
    const el = document.getElementById('room-url');
    if (el) {
      el.href = ru;
      el.textContent = ru;
    }
  }, 100);

  function uid(prefix='t'){ return prefix + Date.now().toString(36) + Math.random().toString(36).slice(2,6); }
  function money(n){ return Number(n||0).toFixed(2) + ' €'; }
  function escapeHtml(s){ return String(s||'').replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m])); }

  let toastTimer = null;
  function showToastMini(message, ms=3000) {
    console.log('Toast:', message);
    if (!notifyEl) return;
    notifyEl.textContent = message;
    notifyEl.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(()=> notifyEl.classList.remove('show'), ms);
  }

  let acceptHandler = null, cancelHandler = null;
  function showCenterModal({ title='Aviso', message='', onAccept=null, onCancel=null, acceptText='Aceptar', cancelText='Cancelar' }={}) {
    if (!cOverlay) { 
      alert(message); 
      if (onCancel) onCancel(); 
      return; 
    }
    
    if (cTitle) cTitle.textContent = title;
    if (cMsg) cMsg.textContent = message;
    if (cBtnAccept) cBtnAccept.textContent = acceptText;
    if (cBtnCancel) cBtnCancel.textContent = cancelText;
    
    acceptHandler = onAccept;
    cancelHandler = onCancel;
    cOverlay.classList.add('show');
    cOverlay.setAttribute('aria-hidden','false');
    
    setTimeout(()=> {
      if (cBtnAccept) cBtnAccept.focus();
    }, 10);
  }
  
  function hideCenterModal(){
    if (!cOverlay) return;
    cOverlay.classList.remove('show');
    cOverlay.setAttribute('aria-hidden','true');
    acceptHandler = cancelHandler = null;
  }

  function render(){
    const transactions = state.transactions || [];
    let totalAdded = 0;
    let totalPaid = 0;
    
    transactions.forEach(tx => {
      const amount = Number(tx.amount) || 0;
      if (tx.type === 'add') {
        totalAdded += amount;
      } else if (tx.type === 'pay') {
        totalPaid += amount;
      }
    });
    
    state.totals.added = Number(totalAdded.toFixed(2));
    state.totals.paid = Number(totalPaid.toFixed(2));
    state.totals.balance = Number((totalAdded - totalPaid).toFixed(2));
    
    if (statAdded) statAdded.textContent = money(state.totals.added);
    if (statPaid) statPaid.textContent = money(state.totals.paid);
    if (statBalance) statBalance.textContent = money(state.totals.balance);

    if (txList) {
      txList.innerHTML = '';
      transactions.slice().reverse().forEach(tx => {
        const li = document.createElement('li');
        li.className = 'tx-item';
        const created = tx.createdAt && tx.createdAt.toDate ? tx.createdAt.toDate() : new Date(tx.createdAt);
        li.innerHTML = `
          <div class="tx-left">
            <div class="badge ${tx.type === 'add' ? 'add' : 'pay'}">${tx.type === 'add' ? '+' : '−'}</div>
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

  function loadLocal(){
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      state = raw ? JSON.parse(raw) : { transactions:[], totals:{added:0,paid:0,balance:0} };
    } catch(e){
      state = { transactions:[], totals:{added:0,paid:0,balance:0} };
    }
  }
  
  function saveLocal(){
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch(e){}
  }

  let unsubTxs = null;
  
  function subscribeToRoom(roomId){
    if (!db) return;
    const roomRef = db.collection('rooms').doc(roomId);
    
    unsubTxs = roomRef.collection('transactions').orderBy('createdAt','asc').onSnapshot(snap => {
      const arr = [];
      snap.forEach(d => arr.push(d.data()));
      state.transactions = arr;
      render();
    }, err => console.error('Transactions snapshot error:', err));
  }

  async function addTxFirestore(tx){
    if (!db) return;
    const roomRef = db.collection('rooms').doc(ROOM_ID);
    const txRef = roomRef.collection('transactions').doc(tx.id);
    
    try {
      await txRef.set(tx);
    } catch(e){
      showToastMini('Error guardando en Firestore', 2500);
    }
  }

  async function deleteTxFirestore(txId){
    if (!db) return;
    const roomRef = db.collection('rooms').doc(ROOM_ID);
    const txRef = roomRef.collection('transactions').doc(txId);
    try {
      await txRef.delete();
    } catch(e){
      showToastMini('Error eliminando de Firestore', 2500);
    }
  }

  async function resetRoomFirestore(){
    if (!db) return;
    const roomRef = db.collection('rooms').doc(ROOM_ID);
    try {
      const snap = await roomRef.collection('transactions').get();
      const batch = db.batch();
      snap.forEach(d => batch.delete(d.ref));
      await batch.commit();
    } catch(e){
      showToastMini('Error reseteando en Firestore', 2500);
    }
  }

  function setupEventListeners() {
    const copyBtn = document.getElementById('copy-room');
    if (copyBtn) {
      copyBtn.addEventListener('click', ()=> {
        const u = `${location.origin}${location.pathname}?room=${ROOM_ID}`;
        if (navigator.clipboard) {
          navigator.clipboard.writeText(u).then(()=>showToastMini('Enlace copiado',1500)).catch(()=>{});
        }
      });
    }

    if (btnAdd) {
      btnAdd.addEventListener('click', (e) => {
        e.preventDefault();
        inputType.value = 'add';
        submitForm();
      });
    }

    if (btnPay) {
      btnPay.addEventListener('click', (e) => {
        e.preventDefault();
        inputType.value = 'pay';
        submitForm();
      });
    }

    if (btnQuick5) {
      btnQuick5.addEventListener('click', (e) => {
        e.preventDefault();
        const current = parseFloat(inputAmount.value || 0) || 0;
        inputAmount.value = (current + 5).toFixed(2);
        inputAmount.focus();
      });
    }

    if (btnQuick10) {
      btnQuick10.addEventListener('click', (e) => {
        e.preventDefault();
        const current = parseFloat(inputAmount.value || 0) || 0;
        inputAmount.value = (current + 10).toFixed(2);
        inputAmount.focus();
      });
    }

    if (form) {
      form.addEventListener('submit', (e) => {
        e.preventDefault();
        submitForm();
      });
    }

    if (cBtnAccept) {
      cBtnAccept.addEventListener('click', ()=> {
        if (acceptHandler) acceptHandler();
        hideCenterModal();
      });
    }
    
    if (cBtnCancel) {
      cBtnCancel.addEventListener('click', ()=> {
        if (cancelHandler) cancelHandler();
        hideCenterModal();
      });
    }

    if (txList) {
      txList.addEventListener('click', async (e) => {
        const btn = e.target.closest('.btn-delete');
        if (!btn) return;
        const id = btn.dataset.id;
        if (!confirm('¿Eliminar este movimiento?')) return;
        if (hasFirebase) {
          await deleteTxFirestore(id);
          showToastMini('Movimiento eliminado', 1400);
        } else {
          loadLocal();
          const idx = state.transactions.findIndex(t => t.id === id);
          if (idx > -1) {
            state.transactions.splice(idx, 1);
            saveLocal();
            render();
            showToastMini('Movimiento eliminado', 1400);
          }
        }
      });
    }

    if (btnReset) {
      btnReset.addEventListener('click', ()=> {
        if (!toastOverlay) return;
        toastOverlay.classList.add('show');
        toastOverlay.setAttribute('aria-hidden','false');
        if (toastConfirm) toastConfirm.focus();
      });
    }

    if (toastCancel) {
      toastCancel.addEventListener('click', ()=> {
        if (!toastOverlay) return;
        toastOverlay.classList.remove('show');
        toastOverlay.setAttribute('aria-hidden','true');
      });
    }

    if (toastConfirm) {
      toastConfirm.addEventListener('click', async ()=> {
        if (hasFirebase) {
          await resetRoomFirestore();
          showToastMini('Sala reseteada', 1500);
        } else {
          state.transactions = [];
          state.totals = {added:0, paid:0, balance:0};
          saveLocal();
          render();
          showToastMini('Bote reseteado', 1500);
        }
        
        if (toastOverlay) {
          toastOverlay.classList.remove('show');
          toastOverlay.setAttribute('aria-hidden','true');
        }
      });
    }

    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        hideCenterModal();
        if (toastOverlay && toastOverlay.classList.contains('show')) {
          toastOverlay.classList.remove('show');
          toastOverlay.setAttribute('aria-hidden','true');
        }
      }
    });
  }

  async function submitForm() {
    const name = (inputName.value || 'Anon').trim();
    const place = (inputPlace.value || '').trim();
    const amount = parseFloat(inputAmount.value);
    const type = inputType.value || 'add';
    
    if (!name || !amount || amount <= 0) {
      showCenterModal({
        title:'Datos incompletos',
        message:'Introduce nombre y cantidad válida mayor que 0.'
      });
      return;
    }
    
    if (type === 'pay') {
      const balance = Number(state.totals.balance || 0);
      if (amount > balance) {
        const deficit = Number((amount - balance).toFixed(2));
        showCenterModal({
          title: 'Saldo insuficiente',
          message: `Faltan ${deficit.toFixed(2)} € para cubrir este pago.`,
          acceptText: 'Añadir dinero',
          cancelText: 'Cancelar',
          onAccept: () => {
            inputType.value = 'add';
            inputAmount.value = deficit.toFixed(2);
            inputAmount.focus();
            inputAmount.select();
          }
        });
        return;
      }
    }
    
    const tx = {
      id: uid(),
      name,
      place,
      amount: Number(amount.toFixed(2)),
      type,
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
    };
    
    if (hasFirebase) {
      await addTxFirestore(tx);
      form.reset();
      inputType.value = 'add';
      inputName.focus();
      showToastMini(type === 'add' ? 'Aportación enviada' : 'Pago enviado', 1600);
    } else {
      loadLocal();
      state.transactions.push({...tx, createdAt: Date.now()});
      saveLocal();
      render();
      form.reset();
      inputType.value = 'add';
      inputName.focus();
      showToastMini(type === 'add' ? 'Aportación añadida' : 'Pago registrado', 1600);
    }
  }

  function initLocal() {
    loadLocal();
    render();
    window.addEventListener('storage', (e) => {
      if (e.key === STORAGE_KEY) {
        loadLocal();
        render();
      }
    });
  }

  function initFirebase() {
    if (auth && auth.currentUser === null) {
      auth.signInAnonymously().catch(err => console.warn('Auth error:', err));
    }
    subscribeToRoom(ROOM_ID);
    showToastMini('Conectado a sala: ' + ROOM_ID, 2000);
  }

  setupEventListeners();
  
  console.log('BoteComun JS inicializado completamente');
});
