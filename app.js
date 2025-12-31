import { db, auth, f } from "./firebase.js";

const $ = (id) => document.getElementById(id);
const fmtEUR = (n) => new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" }).format(Number(n || 0));
const todayISO = () => new Date().toISOString().slice(0,10);
const round2 = (n) => Math.round((Number(n)||0)*100)/100;

let currentUser = null;
let currentAgent = null;

let agentsCache = [];
let sitesCache = [];
let entriesAllCache = [];     // toutes les entrées agent (pour stats/recap)
let entriesMonthCache = [];   // entrées du mois (table)
let paymentsCache = [];

let activeTab = "hours";
let recapRange = { start:null, end:null };

// UI
const viewHome = $("viewHome");
const viewAgent = $("viewAgent");
const agentsGrid = $("agentsGrid");
const authBanner = $("authBanner");

const btnSignIn = $("btnSignIn");
const btnSignOut = $("btnSignOut");
const btnAddAgent = $("btnAddAgent");

const btnBack = $("btnBack");
const btnRenameAgent = $("btnRenameAgent");
const btnDeleteAgent = $("btnDeleteAgent");
const btnSetDefaultRate = $("btnSetDefaultRate");

const agentTitle = $("agentTitle");
const agentSub = $("agentSub");

const balanceDue = $("balanceDue");
const totalAll = $("totalAll");
const totalHoursAll = $("totalHoursAll");
const totalPaidAll = $("totalPaidAll");
const paymentsCount = $("paymentsCount");

const monthFilter = $("monthFilter");

const entryForm = $("entryForm");
const btnResetForm = $("btnResetForm");
const btnExportCSV = $("btnExportCSV");

const fDate = $("fDate");
const fHours = $("fHours");
const fRate = $("fRate");
const btnUseDefaultRate = $("btnUseDefaultRate");
const fSite = $("fSite");
const btnAddSite = $("btnAddSite");
const fNote = $("fNote");
const entriesTbody = $("entriesTbody");

const tabHours = $("tabHours");
const tabPay = $("tabPay");
const tabHistory = $("tabHistory");
const tabRecap = $("tabRecap");

const payForm = $("payForm");
const pDate = $("pDate");
const pAmount = $("pAmount");
const pNote = $("pNote");
const btnPayMax = $("btnPayMax");

const paymentsTbody = $("paymentsTbody");

const rStart = $("rStart");
const rEnd = $("rEnd");
const btnApplyRange = $("btnApplyRange");
const btnClearRange = $("btnClearRange");
const rTotal = $("rTotal");
const rHours = $("rHours");
const rPaid = $("rPaid");
const rDue = $("rDue");
const recapBySiteTbody = $("recapBySiteTbody");
const recapByMonthTbody = $("recapByMonthTbody");

// INIT
(function init(){
  const d = new Date();
  monthFilter.value = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}`;
  fDate.value = todayISO();
  pDate.value = todayISO();
})();

// AUTH
btnSignIn.addEventListener("click", async () => {
  const provider = new f.GoogleAuthProvider();
  await f.signInWithPopup(auth, provider);
});

btnSignOut.addEventListener("click", async () => {
  await f.signOut(auth);
});

f.onAuthStateChanged(auth, async (user) => {
  currentUser = user || null;
  renderAuth();

  if (!currentUser) {
    agentsGrid.innerHTML = "";
    showHome();
    return;
  }

  await loadBase();
  renderAgents();
});

function renderAuth(){
  authBanner.classList.remove("hidden");
  if (!currentUser){
    btnSignIn.classList.remove("hidden");
    btnSignOut.classList.add("hidden");
    authBanner.textContent = "Connecte-toi (Google) pour accéder à tes données.";
  } else {
    btnSignIn.classList.add("hidden");
    btnSignOut.classList.remove("hidden");
    authBanner.textContent = `Connecté : ${currentUser.email}`;
  }
}

function guardAuth(){
  if (!currentUser){
    alert("Connecte-toi d'abord.");
    return false;
  }
  return true;
}

function showHome(){
  viewHome.classList.remove("hidden");
  viewAgent.classList.add("hidden");
  currentAgent = null;
}

function showAgent(){
  viewHome.classList.add("hidden");
  viewAgent.classList.remove("hidden");
}

// LOAD BASE: agents + sites
async function loadBase(){
  if (!guardAuth()) return;

  const agentsQ = f.query(
    f.collection(db,"agents"),
    f.where("ownerUid","==",currentUser.uid),
    f.orderBy("createdAt","desc")
  );
  const sitesQ = f.query(
    f.collection(db,"sites"),
    f.where("ownerUid","==",currentUser.uid),
    f.orderBy("createdAt","desc")
  );

  const [agentsSnap, sitesSnap] = await Promise.all([f.getDocs(agentsQ), f.getDocs(sitesQ)]);
  agentsCache = agentsSnap.docs.map(d => ({ id:d.id, ...d.data() }));
  sitesCache = sitesSnap.docs.map(d => ({ id:d.id, ...d.data() }));

  renderSitesSelect();
}

function renderAgents(){
  agentsGrid.innerHTML = "";
  if (agentsCache.length === 0){
    agentsGrid.innerHTML = `<div class="banner">Aucun agent. Clique sur “+ Ajouter un agent”.</div>`;
    return;
  }

  for (const a of agentsCache){
    const btn = document.createElement("button");
    btn.className = "agentBtn";
    btn.innerHTML = `
      <div class="agentName">${escapeHtml(a.name || "Sans nom")}</div>
      <div class="agentMeta">Taux défaut : ${escapeHtml(String(a.defaultRate ?? 15))}€/h</div>
    `;
    btn.addEventListener("click", () => openAgent(a.id));
    agentsGrid.appendChild(btn);
  }
}

// Agents actions
btnAddAgent.addEventListener("click", async () => {
  if (!guardAuth()) return;
  const name = prompt("Nom de l'agent :");
  if (!name) return;

  await f.addDoc(f.collection(db,"agents"), {
    ownerUid: currentUser.uid,
    name: name.trim(),
    defaultRate: 15,
    createdAt: f.serverTimestamp()
  });

  await loadBase();
  renderAgents();
});

btnBack.addEventListener("click", () => showHome());

btnRenameAgent.addEventListener("click", async () => {
  if (!guardAuth() || !currentAgent) return;
  const newName = prompt("Nouveau nom :", currentAgent.name || "");
  if (!newName) return;

  await f.updateDoc(f.doc(db,"agents",currentAgent.id), { name: newName.trim() });
  currentAgent.name = newName.trim();
  agentTitle.textContent = `Agent : ${currentAgent.name}`;
  await loadBase();
  renderAgents();
});

btnDeleteAgent.addEventListener("click", async () => {
  if (!guardAuth() || !currentAgent) return;
  const ok = confirm(`Supprimer l'agent "${currentAgent.name}" ?`);
  if (!ok) return;

  await f.deleteDoc(f.doc(db,"agents",currentAgent.id));
  showHome();
  await loadBase();
  renderAgents();
});

btnSetDefaultRate.addEventListener("click", async () => {
  if (!guardAuth() || !currentAgent) return;
  const v = prompt("Taux horaire par défaut (€) :", String(currentAgent.defaultRate ?? 15));
  if (v === null) return;

  const rate = Number(v);
  if (!(rate >= 0)) return alert("Valeur invalide.");

  await f.updateDoc(f.doc(db,"agents",currentAgent.id), { defaultRate: rate });
  currentAgent.defaultRate = rate;
  applyDefaultRateUI();
  await loadBase();
  renderAgents();
});

// Sites
function renderSitesSelect(){
  const keep = fSite.value;
  fSite.innerHTML = `<option value="">—</option>`;
  for (const s of sitesCache){
    const opt = document.createElement("option");
    opt.value = s.id;
    opt.textContent = s.name;
    fSite.appendChild(opt);
  }
  fSite.value = keep;
}

btnAddSite.addEventListener("click", async () => {
  if (!guardAuth()) return;
  const name = prompt("Nom du chantier :");
  if (!name) return;

  await f.addDoc(f.collection(db,"sites"), {
    ownerUid: currentUser.uid,
    name: name.trim(),
    createdAt: f.serverTimestamp()
  });

  await loadBase();
});

// Open agent + refresh data
async function openAgent(agentId){
  currentAgent = agentsCache.find(a => a.id === agentId);
  if (!currentAgent) return;

  agentTitle.textContent = `Agent : ${currentAgent.name}`;
  applyDefaultRateUI();

  showAgent();
  setTab("hours");
  await refreshAgentData();
}

function applyDefaultRateUI(){
  const dr = Number(currentAgent?.defaultRate ?? 15);
  agentSub.textContent = `Taux par défaut: ${dr}€/h`;
  btnUseDefaultRate.textContent = `${dr}€/h`;
  fRate.value = String(dr);
}

btnUseDefaultRate.addEventListener("click", () => applyDefaultRateUI());

// Tabs
document.querySelectorAll(".tab").forEach(b => b.addEventListener("click", () => setTab(b.dataset.tab)));

function setTab(tab){
  activeTab = tab;
  document.querySelectorAll(".tab").forEach(x => x.classList.toggle("active", x.dataset.tab === tab));
  tabHours.classList.toggle("hidden", tab !== "hours");
  tabPay.classList.toggle("hidden", tab !== "pay");
  tabHistory.classList.toggle("hidden", tab !== "history");
  tabRecap.classList.toggle("hidden", tab !== "recap");
  if (tab === "recap") renderRecap();
}

// Refresh data
monthFilter.addEventListener("change", () => refreshAgentData());

async function refreshAgentData(){
  if (!guardAuth() || !currentAgent) return;

  const [yyyy, mm] = monthFilter.value.split("-");
  const start = `${yyyy}-${mm}-01`;
  const end = nextMonthStart(yyyy, mm);

  // Month entries
  const monthQ = f.query(
    f.collection(db,"entries"),
    f.where("ownerUid","==",currentUser.uid),
    f.where("agentId","==",currentAgent.id),
    f.where("date",">=", start),
    f.where("date","<", end),
    f.orderBy("date","desc")
  );

  // All entries for recap/stats
  const allQ = f.query(
    f.collection(db,"entries"),
    f.where("ownerUid","==",currentUser.uid),
    f.where("agentId","==",currentAgent.id),
    f.orderBy("date","asc")
  );

  // Payments history
  const payQ = f.query(
    f.collection(db,"payments"),
    f.where("ownerUid","==",currentUser.uid),
    f.where("agentId","==",currentAgent.id),
    f.orderBy("date","desc")
  );

  const [monthSnap, allSnap, paySnap] = await Promise.all([
    f.getDocs(monthQ),
    f.getDocs(allQ),
    f.getDocs(payQ)
  ]);

  entriesMonthCache = monthSnap.docs.map(d => normalizeEntry({ id:d.id, ...d.data() }));
  entriesAllCache = allSnap.docs.map(d => normalizeEntry({ id:d.id, ...d.data() }));
  paymentsCache = paySnap.docs.map(d => ({ id:d.id, ...d.data() }));

  renderMonthTable();
  renderPaymentsHistory();
  renderTopStats();
  if (activeTab === "recap") renderRecap();
}

function normalizeEntry(e){
  const hours = Number(e.hours ?? 0);
  const rate = Number(e.rate ?? 0);
  const amount = Number(e.amount ?? round2(hours * rate));

  // migration si ancien modèle (paid boolean)
  let paidAmount = Number(e.paidAmount ?? 0);
  if (e.paid === true && paidAmount === 0) paidAmount = amount;
  paidAmount = Math.min(paidAmount, amount);

  return { ...e, hours, rate, amount, paidAmount };
}

// Stats top
function renderTopStats(){
  const total = entriesAllCache.reduce((a,e)=>a+e.amount,0);
  const hours = entriesAllCache.reduce((a,e)=>a+e.hours,0);
  const paid = paymentsCache.reduce((a,p)=>a+Number(p.amount||0),0);
  const due = Math.max(0, round2(total - paid));

  totalAll.textContent = fmtEUR(total);
  totalHoursAll.textContent = `${round2(hours)} h`;
  totalPaidAll.textContent = fmtEUR(paid);
  paymentsCount.textContent = `${paymentsCache.length} paiements`;
  balanceDue.textContent = fmtEUR(due);

  btnPayMax.disabled = due <= 0.0001;
}

// Add entry
entryForm.addEventListener("submit", async (ev) => {
  ev.preventDefault();
  if (!guardAuth() || !currentAgent) return;

  const date = fDate.value;
  const hours = Number(fHours.value);
  const rate = Number(fRate.value);
  if (!date || !(hours >= 0) || !(rate >= 0)) return;

  const amount = round2(hours * rate);
  const siteId = fSite.value || "";
  const siteName = siteId ? (sitesCache.find(s => s.id === siteId)?.name || "") : "";
  const note = (fNote.value || "").trim();

  await f.addDoc(f.collection(db,"entries"), {
    ownerUid: currentUser.uid,
    agentId: currentAgent.id,
    date,
    hours,
    rate,
    amount,
    paidAmount: 0,
    siteId,
    siteName,
    note,
    createdAt: f.serverTimestamp()
  });

  entryForm.reset();
  fDate.value = todayISO();
  applyDefaultRateUI();
  await refreshAgentData();
});

btnResetForm.addEventListener("click", () => {
  entryForm.reset();
  fDate.value = todayISO();
  applyDefaultRateUI();
});

// Month table
function renderMonthTable(){
  entriesTbody.innerHTML = "";
  if (entriesMonthCache.length === 0){
    entriesTbody.innerHTML = `<tr><td colspan="9" class="muted">Aucune entrée sur ce mois.</td></tr>`;
    return;
  }

  for (const e of entriesMonthCache){
    const rest = round2(Math.max(0, e.amount - e.paidAmount));
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${escapeHtml(e.date||"")}</td>
      <td>${escapeHtml(String(e.hours))}</td>
      <td>${escapeHtml(String(e.rate))} €</td>
      <td><b>${fmtEUR(e.amount)}</b></td>
      <td>${fmtEUR(e.paidAmount)}</td>
      <td>${fmtEUR(rest)}</td>
      <td>${escapeHtml(e.siteName || "")}</td>
      <td>${escapeHtml(e.note || "")}</td>
      <td>
        <div class="row gap" style="flex-wrap:wrap">
          <button class="btn" data-a="edit">Modifier</button>
          <button class="btn danger" data-a="del">Suppr.</button>
        </div>
      </td>
    `;
    tr.querySelector('[data-a="edit"]').addEventListener("click", () => editEntry(e));
    tr.querySelector('[data-a="del"]').addEventListener("click", () => deleteEntry(e));
    entriesTbody.appendChild(tr);
  }
}

async function editEntry(e){
  const date = prompt("Date (YYYY-MM-DD)", e.date || "");
  if (!date) return;

  const hoursStr = prompt("Heures", String(e.hours ?? ""));
  if (hoursStr === null) return;
  const hours = Number(hoursStr);

  const rateStr = prompt("Taux (€)", String(e.rate ?? ""));
  if (rateStr === null) return;
  const rate = Number(rateStr);

  const note = prompt("Note", e.note || "");
  if (note === null) return;

  const amount = round2(hours * rate);
  const paidAmount = Math.min(Number(e.paidAmount||0), amount);

  await f.updateDoc(f.doc(db,"entries", e.id), { date, hours, rate, amount, note: note.trim(), paidAmount });
  await refreshAgentData();
}

async function deleteEntry(e){
  const ok = confirm(`Supprimer l'entrée du ${e.date} ?`);
  if (!ok) return;
  await f.deleteDoc(f.doc(db,"entries", e.id));
  await refreshAgentData();
}

// Export CSV
btnExportCSV.addEventListener("click", () => {
  if (!currentAgent) return;

  const rows = entriesMonthCache.map(e => ({
    date: e.date,
    hours: e.hours,
    rate: e.rate,
    total: e.amount,
    paid: e.paidAmount,
    due: Math.max(0, round2(e.amount - e.paidAmount)),
    site: e.siteName || "",
    note: e.note || ""
  }));

  const header = Object.keys(rows[0] || {date:"",hours:"",rate:"",total:"",paid:"",due:"",site:"",note:""});
  const csv = [header.join(";")]
    .concat(rows.map(r => header.map(k => csvCell(r[k])).join(";")))
    .join("\n");

  const blob = new Blob([csv], { type:"text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${safeFile(currentAgent.name)}_${monthFilter.value}.csv`;
  a.click();
  URL.revokeObjectURL(url);
});

// Payments (partial) + allocation FIFO
payForm.addEventListener("submit", async (ev) => {
  ev.preventDefault();
  await addPaymentAndAllocate(false);
});
btnPayMax.addEventListener("click", async () => {
  await addPaymentAndAllocate(true);
});

async function addPaymentAndAllocate(payAll){
  if (!guardAuth() || !currentAgent) return;

  const date = pDate.value || todayISO();
  let amount = Number(pAmount.value);
  const note = (pNote.value || "").trim();

  const total = entriesAllCache.reduce((a,e)=>a+e.amount,0);
  const paid = paymentsCache.reduce((a,p)=>a+Number(p.amount||0),0);
  const due = Math.max(0, round2(total - paid));

  if (payAll) amount = due;
  if (!(amount > 0)) return alert("Montant invalide.");

  await f.addDoc(f.collection(db,"payments"), {
    ownerUid: currentUser.uid,
    agentId: currentAgent.id,
    date,
    amount: round2(amount),
    note,
    createdAt: f.serverTimestamp()
  });

  // FIFO allocation
  let remaining = round2(amount);
  const unpaid = entriesAllCache
    .slice()
    .sort((a,b)=> (a.date||"").localeCompare(b.date||""))
    .filter(e => e.paidAmount < e.amount);

  for (const e of unpaid){
    if (remaining <= 0) break;
    const rest = round2(e.amount - e.paidAmount);
    const add = Math.min(rest, remaining);
    remaining = round2(remaining - add);
    await f.updateDoc(f.doc(db,"entries", e.id), { paidAmount: round2(e.paidAmount + add) });
  }

  payForm.reset();
  pDate.value = todayISO();
  await refreshAgentData();
  setTab("history");
}

// History
function renderPaymentsHistory(){
  paymentsTbody.innerHTML = "";
  if (paymentsCache.length === 0){
    paymentsTbody.innerHTML = `<tr><td colspan="4" class="muted">Aucun paiement enregistré.</td></tr>`;
    return;
  }

  for (const p of paymentsCache){
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${escapeHtml(p.date || "")}</td>
      <td><b>${fmtEUR(p.amount)}</b></td>
      <td>${escapeHtml(p.note || "")}</td>
      <td><button class="btn danger" data-a="del">Suppr.</button></td>
    `;
    tr.querySelector('[data-a="del"]').addEventListener("click", async () => {
      const ok = confirm("Supprimer ce paiement ? (n'annule pas automatiquement l'allocation sur les lignes)");
      if (!ok) return;
      await f.deleteDoc(f.doc(db,"payments", p.id));
      await refreshAgentData();
    });
    paymentsTbody.appendChild(tr);
  }
}

// Recap
btnApplyRange.addEventListener("click", () => {
  recapRange.start = rStart.value || null;
  recapRange.end = rEnd.value || null;
  renderRecap();
});
btnClearRange.addEventListener("click", () => {
  recapRange = { start:null, end:null };
  rStart.value = "";
  rEnd.value = "";
  renderRecap();
});

function renderRecap(){
  if (!currentAgent) return;

  const inRange = (date) => {
    if (!date) return false;
    if (recapRange.start && date < recapRange.start) return false;
    if (recapRange.end && date > recapRange.end) return false;
    return true;
  };

  const entries = (recapRange.start || recapRange.end)
    ? entriesAllCache.filter(e => inRange(e.date))
    : entriesAllCache.slice();

  const pays = (recapRange.start || recapRange.end)
    ? paymentsCache.filter(p => inRange(p.date))
    : paymentsCache.slice();

  const total = entries.reduce((a,e)=>a+e.amount,0);
  const hours = entries.reduce((a,e)=>a+e.hours,0);
  const paid = pays.reduce((a,p)=>a+Number(p.amount||0),0);
  const due = Math.max(0, round2(total - paid));

  rTotal.textContent = fmtEUR(total);
  rHours.textContent = `${round2(hours)} h`;
  rPaid.textContent = fmtEUR(paid);
  rDue.textContent = fmtEUR(due);

  // by site
  const bySite = new Map();
  for (const e of entries){
    const k = e.siteName || "—";
    const cur = bySite.get(k) || { hours:0, total:0 };
    cur.hours += e.hours;
    cur.total += e.amount;
    bySite.set(k, cur);
  }
  recapBySiteTbody.innerHTML = "";
  if (bySite.size === 0){
    recapBySiteTbody.innerHTML = `<tr><td colspan="3" class="muted">Aucune donnée.</td></tr>`;
  } else {
    Array.from(bySite.entries())
      .sort((a,b)=> b[1].total - a[1].total)
      .forEach(([site,v]) => {
        const tr = document.createElement("tr");
        tr.innerHTML = `<td>${escapeHtml(site)}</td><td>${round2(v.hours)} h</td><td><b>${fmtEUR(v.total)}</b></td>`;
        recapBySiteTbody.appendChild(tr);
      });
  }

  // by month
  const byMonth = new Map();
  for (const e of entries){
    const m = (e.date || "").slice(0,7) || "—";
    const cur = byMonth.get(m) || { hours:0, total:0 };
    cur.hours += e.hours;
    cur.total += e.amount;
    byMonth.set(m, cur);
  }
  recapByMonthTbody.innerHTML = "";
  if (byMonth.size === 0){
    recapByMonthTbody.innerHTML = `<tr><td colspan="3" class="muted">Aucune donnée.</td></tr>`;
  } else {
    Array.from(byMonth.entries())
      .sort((a,b)=> a[0].localeCompare(b[0]))
      .forEach(([m,v]) => {
        const tr = document.createElement("tr");
        tr.innerHTML = `<td>${escapeHtml(m)}</td><td>${round2(v.hours)} h</td><td><b>${fmtEUR(v.total)}</b></td>`;
        recapByMonthTbody.appendChild(tr);
      });
  }
}

// Helpers
function nextMonthStart(yyyy, mm){
  const y = Number(yyyy), m = Number(mm);
  const d = new Date(y, m-1, 1);
  d.setMonth(d.getMonth()+1);
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-01`;
}
function escapeHtml(str){
  return String(str ?? "")
    .replaceAll("&","&amp;")
    .replaceAll("<","&lt;")
    .replaceAll(">","&gt;")
    .replaceAll('"',"&quot;")
    .replaceAll("'","&#039;");
}
function csvCell(v){
  const s = String(v ?? "");
  if (s.includes(";") || s.includes('"') || s.includes("\n")) return `"${s.replaceAll('"','""')}"`;
  return s;
}
function safeFile(name){
  return (name || "agent").replaceAll(/[^a-z0-9_\-]/gi, "_");
}
