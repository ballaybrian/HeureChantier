import { db, auth, ensureAnon, isAdmin, enableAdminWithCode, disableAdmin } from "./firebase.js";
import {
  collection, addDoc, getDocs, doc, deleteDoc,
  query, orderBy
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

const $ = (id) => document.getElementById(id);
const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
const fmtEUR = (n) => new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" }).format(Number(n || 0));
const todayISO = () => new Date().toISOString().slice(0, 10);

const DEFAULT_RATE = 15;

let AGENTS = [];
let SITES = [];
let ENTRIES = [];
let PAYMENTS = [];
let ADMIN = false;

const syncStatus = $("syncStatus");
const modePill = $("modePill");
const btnAdmin = $("btnAdmin");
const btnAdminOff = $("btnAdminOff");

// Views
const viewHome = $("viewHome");
const viewAddHours = $("viewAddHours");
const viewSites = $("viewSites");
const viewPayments = $("viewPayments");

// Admin modal
const adminModal = $("adminModal");
const adminForm = $("adminForm");
const adminCode = $("adminCode");
const adminMsg = $("adminMsg");
const btnCloseAdmin = $("btnCloseAdmin");

// Add Hours UI
const readonlyAddHours = $("readonlyAddHours");
const hoursForm = $("hoursForm");
const agentSelect = $("agentSelect");
const siteSelect = $("siteSelect");
const btnAddAgentQuick = $("btnAddAgentQuick");
const btnAddSiteQuick = $("btnAddSiteQuick");
const workDate = $("workDate");
const startTime = $("startTime");
const endTime = $("endTime");
const durationOut = $("durationOut");
const amountOut = $("amountOut");

// Sites UI
const btnAddSite = $("btnAddSite");
const sitePick = $("sitePick");
const siteEntriesList = $("siteEntriesList");

// Payments UI
const btnAddAgent = $("btnAddAgent");
const agentPayTable = $("agentPayTable");

// Payment modal
const payModal = $("payModal");
const payModalAgent = $("payModalAgent");
const payForm = $("payForm");
const payDate = $("payDate");
const payAmount = $("payAmount");
const btnClosePay = $("btnClosePay");
const readonlyPay = $("readonlyPay");
let payAgentId = null;

// Navigation
document.querySelectorAll("[data-go]").forEach(btn => btn.addEventListener("click", () => go(btn.dataset.go)));

function showOnly(view){
  [viewHome, viewAddHours, viewSites, viewPayments].forEach(v => v.classList.add("hidden"));
  view.classList.remove("hidden");
}
function go(where){
  if (where === "home") return showOnly(viewHome);
  if (where === "addHours") return showOnly(viewAddHours);
  if (where === "sites") return showOnly(viewSites);
  if (where === "payments") return showOnly(viewPayments);
}

// Admin UI controls
btnAdmin.addEventListener("click", () => openAdminModal());
btnAdminOff.addEventListener("click", async () => {
  syncStatus.textContent = "Sortie admin…";
  await disableAdmin();
  ADMIN = await isAdmin();
  applyAdminUI();
  await refreshAll();
});

btnCloseAdmin.addEventListener("click", closeAdminModal);
adminModal.addEventListener("click", (e)=> { if (e.target === adminModal) closeAdminModal(); });

adminForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  adminMsg.classList.add("hidden");
  try{
    syncStatus.textContent = "Vérification…";
    await enableAdminWithCode(adminCode.value.trim());
    ADMIN = await isAdmin();
    applyAdminUI();
    closeAdminModal();
    await refreshAll();
  } catch (err){
    console.error(err);
    syncStatus.textContent = "Mode: Lecture";
    adminMsg.classList.remove("hidden");
    adminMsg.textContent = "Code invalide ou fonction non déployée.";
  }
});

function openAdminModal(){
  adminCode.value = "";
  adminMsg.classList.add("hidden");
  adminModal.classList.remove("hidden");
}
function closeAdminModal(){
  adminModal.classList.add("hidden");
}

// Payments modal
btnClosePay.addEventListener("click", closePayModal);
payModal.addEventListener("click", (e)=> { if (e.target === payModal) closePayModal(); });

function openPayModal(agentId){
  payAgentId = agentId;
  const ag = AGENTS.find(a=>a.id===agentId);
  payModalAgent.textContent = ag?.name ?? "Agent";
  payDate.value = todayISO();
  payAmount.value = "";
  readonlyPay.classList.toggle("hidden", ADMIN);
  payModal.classList.remove("hidden");
}
function closePayModal(){
  payAgentId = null;
  payModal.classList.add("hidden");
}

// Init defaults
(function initDefaults(){
  workDate.value = todayISO();
  payDate.value = todayISO();
  startTime.value = "08:00";
  endTime.value = "12:00";
  computeDuration();
})();

[startTime, endTime, agentSelect].forEach(el => el.addEventListener("change", computeDuration));

// Firestore load
async function loadAll(){
  const [aSnap, sSnap, eSnap, pSnap] = await Promise.all([
    getDocs(query(collection(db,"agents"), orderBy("name","asc"))),
    getDocs(query(collection(db,"sites"), orderBy("name","asc"))),
    getDocs(query(collection(db,"entries"), orderBy("date","desc"))),
    getDocs(query(collection(db,"payments"), orderBy("date","desc"))),
  ]);

  AGENTS = aSnap.docs.map(d => ({ id:d.id, ...d.data() }));
  SITES = sSnap.docs.map(d => ({ id:d.id, ...d.data() }));
  ENTRIES = eSnap.docs.map(d => ({ id:d.id, ...d.data() }));
  PAYMENTS = pSnap.docs.map(d => ({ id:d.id, ...d.data() }));
}

async function refreshAll(){
  syncStatus.textContent = "Sync…";
  await loadAll();
  renderAll();
  syncStatus.textContent = "OK ✅";
}

function applyAdminUI(){
  modePill.textContent = ADMIN ? "Mode: Admin" : "Mode: Lecture";
  btnAdmin.classList.toggle("hidden", ADMIN);
  btnAdminOff.classList.toggle("hidden", !ADMIN);

  // éléments adminOnly
  document.querySelectorAll(".adminOnly").forEach(el => {
    el.disabled = !ADMIN;
    el.style.opacity = ADMIN ? "1" : ".45";
    el.style.pointerEvents = ADMIN ? "auto" : "none";
  });

  readonlyAddHours.classList.toggle("hidden", ADMIN);
}

// Render
function renderAll(){
  renderSelects();
  renderSitePick();
  renderSiteEntries();
  renderPaymentsTable();
  computeDuration();
}

function renderSelects(){
  agentSelect.innerHTML = "";
  if (AGENTS.length === 0){
    agentSelect.innerHTML = `<option value="">(Aucun agent)</option>`;
  } else {
    for (const a of AGENTS){
      const opt = document.createElement("option");
      opt.value = a.id;
      opt.textContent = a.name;
      agentSelect.appendChild(opt);
    }
  }

  siteSelect.innerHTML = "";
  if (SITES.length === 0){
    siteSelect.innerHTML = `<option value="">(Aucun chantier)</option>`;
  } else {
    for (const s of SITES){
      const opt = document.createElement("option");
      opt.value = s.id;
      opt.textContent = s.name;
      siteSelect.appendChild(opt);
    }
  }
}

function renderSitePick(){
  sitePick.innerHTML = "";
  if (SITES.length === 0){
    sitePick.innerHTML = `<option value="">(Aucun chantier)</option>`;
    return;
  }
  for (const s of SITES){
    const opt = document.createElement("option");
    opt.value = s.id;
    opt.textContent = s.name;
    sitePick.appendChild(opt);
  }
  if (!sitePick.value) sitePick.value = SITES[0].id;
}

sitePick.addEventListener("change", renderSiteEntries);

function renderSiteEntries(){
  siteEntriesList.innerHTML = "";
  const siteId = sitePick.value;
  if (!siteId){
    siteEntriesList.innerHTML = `<div class="item"><div class="itemMain">Aucun chantier</div><div class="itemSub">Ajoute un chantier pour commencer.</div></div>`;
    return;
  }

  const list = ENTRIES.filter(e => e.siteId === siteId);

  if (list.length === 0){
    siteEntriesList.innerHTML = `<div class="item"><div class="itemMain">Aucune heure</div><div class="itemSub">Aucune entrée pour ce chantier.</div></div>`;
    return;
  }

  for (const e of list){
    const div = document.createElement("div");
    div.className = "item";
    div.innerHTML = `
      <div class="itemTop">
        <div class="itemMain">${esc(e.agentName)} • ${esc(e.date)}</div>
        <div class="badge">${Number(e.hours||0).toFixed(2)} h</div>
      </div>
      <div class="itemSub">${esc(e.start)} → ${esc(e.end)} • ${fmtEUR(e.amount)}</div>
    `;
    siteEntriesList.appendChild(div);
  }
}

function renderPaymentsTable(){
  agentPayTable.innerHTML = "";

  const header = document.createElement("div");
  header.className = "tr th";
  header.innerHTML = `<div>Agent</div><div>Dû</div><div>Payé</div><div>Reste</div><div></div>`;
  agentPayTable.appendChild(header);

  if (AGENTS.length === 0){
    const empty = document.createElement("div");
    empty.className = "tr";
    empty.innerHTML = `<div class="cellMuted">Aucun agent</div><div class="cellMuted">—</div><div class="cellMuted">—</div><div class="cellMuted">—</div><div></div>`;
    agentPayTable.appendChild(empty);
    return;
  }

  for (const a of AGENTS){
    const due = agentDue(a.id);
    const paid = agentPaid(a.id);
    const rest = Math.max(0, round2(due - paid));

    const row = document.createElement("div");
    row.className = "tr";
    row.innerHTML = `
      <div><b>${esc(a.name)}</b><div class="cellMuted">${a.rate ?? DEFAULT_RATE}€/h</div></div>
      <div>${fmtEUR(due)}</div>
      <div>${fmtEUR(paid)}</div>
      <div><b>${fmtEUR(rest)}</b></div>
      <div><button class="btn adminOnly">+ Paiement</button></div>
    `;
    row.querySelector("button").addEventListener("click", () => openPayModal(a.id));
    agentPayTable.appendChild(row);
  }

  applyAdminUI(); // pour bien griser si lecture
}

function agentDue(agentId){
  return round2(ENTRIES.filter(e => e.agentId === agentId).reduce((s,e)=>s+Number(e.amount||0),0));
}
function agentPaid(agentId){
  return round2(PAYMENTS.filter(p => p.agentId === agentId).reduce((s,p)=>s+Number(p.amount||0),0));
}

// Actions admin (CRUD)
$("btnAddAgent").addEventListener("click", async () => {
  if (!ADMIN) return;
  const name = prompt("Nom de l'agent :");
  if (!name) return;
  await addDoc(collection(db,"agents"), { name: name.trim(), rate: DEFAULT_RATE });
  await refreshAll();
});

$("btnAddSite").addEventListener("click", async () => {
  if (!ADMIN) return;
  const name = prompt("Nom du chantier :");
  if (!name) return;
  await addDoc(collection(db,"sites"), { name: name.trim() });
  await refreshAll();
});

$("btnAddAgentQuick").addEventListener("click", async () => {
  if (!ADMIN) return;
  const name = prompt("Nom de l'agent :");
  if (!name) return;
  await addDoc(collection(db,"agents"), { name: name.trim(), rate: DEFAULT_RATE });
  await refreshAll();
});

$("btnAddSiteQuick").addEventListener("click", async () => {
  if (!ADMIN) return;
  const name = prompt("Nom du chantier :");
  if (!name) return;
  await addDoc(collection(db,"sites"), { name: name.trim() });
  await refreshAll();
});

hoursForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  if (!ADMIN) return;

  if (AGENTS.length === 0) return alert("Ajoute d'abord un agent.");
  if (SITES.length === 0) return alert("Ajoute d'abord un chantier.");

  const agentId = agentSelect.value;
  const siteId = siteSelect.value;
  const date = workDate.value;
  const start = startTime.value;
  const end = endTime.value;

  const agent = AGENTS.find(a => a.id === agentId);
  const site = SITES.find(s => s.id === siteId);
  if (!agent || !site) return alert("Agent/Chantier invalide.");

  const hours = computeHours(start, end);
  if (!(hours > 0)) return alert("Heures invalides (fin doit être après début).");

  const rate = Number(agent.rate ?? DEFAULT_RATE);
  const amount = round2(hours * rate);

  await addDoc(collection(db,"entries"), {
    agentId,
    agentName: agent.name,
    siteId,
    siteName: site.name,
    date, start, end,
    hours: round2(hours),
    rate,
    amount
  });

  await refreshAll();
  alert("Heure enregistrée ✅");
});

payForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  if (!ADMIN) return;

  if (!payAgentId) return;
  const amt = Number(payAmount.value);
  if (!(amt > 0)) return alert("Montant invalide.");

  const ag = AGENTS.find(a => a.id === payAgentId);
  await addDoc(collection(db,"payments"), {
    agentId: payAgentId,
    agentName: ag?.name ?? "",
    date: payDate.value || todayISO(),
    amount: round2(amt)
  });

  closePayModal();
  await refreshAll();
});

// Duration compute
function computeDuration(){
  const agentId = agentSelect.value;
  const agent = AGENTS.find(a => a.id === agentId);
  const rate = Number(agent?.rate ?? DEFAULT_RATE);
  const h = computeHours(startTime.value, endTime.value);

  durationOut.textContent = `${Math.max(0, round2(h)).toFixed(2)} h`;
  amountOut.textContent = fmtEUR(Math.max(0, round2(h * rate)));
}

function computeHours(start, end){
  if (!start || !end) return 0;
  const [sh, sm] = start.split(":").map(Number);
  const [eh, em] = end.split(":").map(Number);
  const s = sh * 60 + sm;
  const e = eh * 60 + em;
  const diff = e - s;
  if (diff <= 0) return 0;
  return diff / 60;
}

function esc(str){
  return String(str ?? "")
    .replaceAll("&","&amp;")
    .replaceAll("<","&lt;")
    .replaceAll(">","&gt;")
    .replaceAll('"',"&quot;")
    .replaceAll("'","&#039;");
}

// Boot
(async function boot(){
  try{
    syncStatus.textContent = "Connexion…";
    await ensureAnon();
    ADMIN = await isAdmin();
    applyAdminUI();
    await refreshAll();
    syncStatus.textContent = "OK ✅";
    go("home");
  } catch (e){
    console.error(e);
    syncStatus.textContent = "Erreur Firebase ❌";
    alert("Erreur Firebase. Vérifie: Auth Anonyme ON, Firestore Rules, Functions déployées, domaines autorisés.");
  }
})();
