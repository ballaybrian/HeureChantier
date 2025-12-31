import { db, ensureAnonAuth } from "./firebase.js";
import {
  collection, addDoc, getDocs, doc, updateDoc, deleteDoc,
  query, orderBy
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

const $ = (id) => document.getElementById(id);
const fmtEUR = (n) => new Intl.NumberFormat("fr-FR",{style:"currency",currency:"EUR"}).format(Number(n||0));
const round2 = (n) => Math.round((Number(n)||0)*100)/100;
const todayISO = () => new Date().toISOString().slice(0,10);
const esc = (str) => String(str ?? "")
  .replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;")
  .replaceAll('"',"&quot;").replaceAll("'","&#039;");

let agents = [];
let sites = [];
let entries = [];
let payments = [];

let currentAgentId = null;
let agentTab = "hours";

// UI
const syncStatus = $("syncStatus");
const viewHome = $("viewHome");
const viewAgents = $("viewAgents");
const viewSites = $("viewSites");
const viewHistory = $("viewHistory");

// Home nav
document.querySelectorAll(".homeBtn").forEach(btn => {
  btn.addEventListener("click", () => go(btn.dataset.go));
});

// Agents UI
const btnBackAgents = $("btnBackAgents");
const btnAddAgent = $("btnAddAgent");
const agentsGrid = $("agentsGrid");

const agentPanel = $("agentPanel");
const agentTitle = $("agentTitle");
const agentMeta = $("agentMeta");
const btnSetRate = $("btnSetRate");
const btnRenameAgent = $("btnRenameAgent");
const btnDeleteAgent = $("btnDeleteAgent");

const statTotal = $("statTotal");
const statHours = $("statHours");
const statPaid = $("statPaid");
const statDue = $("statDue");

const monthFilter = $("monthFilter");
const entryForm = $("entryForm");
const fDate = $("fDate");
const fHours = $("fHours");
const fRate = $("fRate");
const btnUseDefaultRate = $("btnUseDefaultRate");
const fSite = $("fSite");
const fNote = $("fNote");
const btnResetForm = $("btnResetForm");
const entriesTbody = $("entriesTbody");

const tabHours = $("tabHours");
const tabPay = $("tabPay");

document.querySelectorAll(".tab").forEach(t => {
  t.addEventListener("click", () => setAgentTab(t.dataset.tab));
});

const payForm = $("payForm");
const pDate = $("pDate");
const pAmount = $("pAmount");
const pNote = $("pNote");
const btnPayMax = $("btnPayMax");

// Sites UI
const btnBackSites = $("btnBackSites");
const btnAddSite = $("btnAddSite");
const sitesList = $("sitesList");

// History UI
const btnBackHistory = $("btnBackHistory");
const historyAgentFilter = $("historyAgentFilter");
const historyTbody = $("historyTbody");

// Back buttons
btnBackAgents.addEventListener("click", () => go("home"));
btnBackSites.addEventListener("click", () => go("home"));
btnBackHistory.addEventListener("click", () => go("home"));

// Month / dates init
(function initDefaults(){
  const d = new Date();
  monthFilter.value = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}`;
  fDate.value = todayISO();
  pDate.value = todayISO();
})();

// ---------- Boot ----------
(async function boot(){
  try{
    syncStatus.textContent = "Connexion…";
    await ensureAnonAuth();
    syncStatus.textContent = "Chargement…";
    await loadAll();
    renderAll();
    syncStatus.textContent = "OK ✅";
    go("home");
  } catch (e){
    console.error(e);
    syncStatus.textContent = "Erreur Firebase ❌";
    alert("Erreur Firebase. Vérifie: Auth Anonyme activée + Rules Firestore + domaine autorisé.");
  }
})();

// ---------- Navigation ----------
function showOnly(view){
  [viewHome, viewAgents, viewSites, viewHistory].forEach(v => v.classList.add("hidden"));
  view.classList.remove("hidden");
}
function go(where){
  if (where === "home") return showOnly(viewHome);
  if (where === "agents") { showOnly(viewAgents); renderAgents(); return; }
  if (where === "sites") { showOnly(viewSites); renderSites(); return; }
  if (where === "history") { showOnly(viewHistory); renderHistory(); return; }
}

// ---------- Firestore load ----------
async function loadAll(){
  const [aSnap, sSnap, eSnap, pSnap] = await Promise.all([
    getDocs(query(collection(db,"agents"), orderBy("name","asc"))),
    getDocs(query(collection(db,"sites"), orderBy("name","asc"))),
    getDocs(query(collection(db,"entries"), orderBy("date","asc"))),
    getDocs(query(collection(db,"payments"), orderBy("date","desc"))),
  ]);

  agents = aSnap.docs.map(d => ({ id:d.id, ...d.data() }));
  sites = sSnap.docs.map(d => ({ id:d.id, ...d.data() }));
  entries = eSnap.docs.map(d => normalizeEntry({ id:d.id, ...d.data() }));
  payments = pSnap.docs.map(d => ({ id:d.id, ...d.data() }));
}

function normalizeEntry(e){
  const hours = Number(e.hours ?? 0);
  const rate = Number(e.rate ?? 0);
  const amount = Number(e.amount ?? round2(hours*rate));
  const paidAmount = Math.min(Number(e.paidAmount ?? 0), amount);
  return { ...e, hours, rate, amount, paidAmount };
}

async function refresh(){
  syncStatus.textContent = "Sync…";
  await loadAll();
  renderAll();
  syncStatus.textContent = "OK ✅";
}

// ---------- Helpers totals ----------
function agentTotalAmount(agentId){
  return round2(entries.filter(e => e.agentId === agentId).reduce((a,e)=>a+e.amount,0));
}
function agentTotalHours(agentId){
  return round2(entries.filter(e => e.agentId === agentId).reduce((a,e)=>a+e.hours,0));
}
function agentTotalPaid(agentId){
  return round2(payments.filter(p => p.agentId === agentId).reduce((a,p)=>a+Number(p.amount||0),0));
}
function currentAgent(){
  return agents.find(a => a.id === currentAgentId) || null;
}
function nextMonthStart(yyyy, mm){
  const y = Number(yyyy), m = Number(mm);
  const d = new Date(y, m-1, 1);
  d.setMonth(d.getMonth()+1);
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-01`;
}

// ---------- Render all ----------
function renderAll(){
  renderSiteSelect();
  renderAgents();   // safe even if not visible
  renderSites();
  renderHistory();
  if (currentAgentId) renderAgentPanel();
}

// ---------- Agents ----------
btnAddAgent.addEventListener("click", async () => {
  const name = prompt("Nom de l'agent :");
  if (!name) return;
  await addDoc(collection(db,"agents"), { name: name.trim(), defaultRate: 15 });
  await refresh();
  go("agents");
});

function renderAgents(){
  agentsGrid.innerHTML = "";
  agentPanel.classList.add("hidden");
  currentAgentId = null;

  if (agents.length === 0){
    agentsGrid.innerHTML = `<div class="cardSub">Aucun agent. Clique “+ Ajouter agent”.</div>`;
    return;
  }

  for (const a of agents){
    const total = agentTotalAmount(a.id);
    const paid = agentTotalPaid(a.id);
    const due = Math.max(0, round2(total - paid));

    const btn = document.createElement("button");
    btn.className = "agentBtn";
    btn.innerHTML = `
      <div class="agentName">${esc(a.name)}</div>
      <div class="agentMeta">Taux défaut: ${esc(String(a.defaultRate ?? 15))}€/h • Reste: <b>${fmtEUR(due)}</b></div>
    `;
    btn.addEventListener("click", () => openAgent(a.id));
    agentsGrid.appendChild(btn);
  }
}

async function openAgent(id){
  currentAgentId = id;
  agentPanel.classList.remove("hidden");
  setAgentTab("hours");
  renderAgentPanel();
}

btnRenameAgent.addEventListener("click", async () => {
  const a = currentAgent(); if (!a) return;
  const name = prompt("Nouveau nom :", a.name);
  if (!name) return;
  await updateDoc(doc(db,"agents",a.id), { name: name.trim() });
  await refresh();
  openAgent(a.id);
});

btnSetRate.addEventListener("click", async () => {
  const a = currentAgent(); if (!a) return;
  const v = prompt("Taux défaut (€ / h) :", String(a.defaultRate ?? 15));
  if (v === null) return;
  const rate = Number(v);
  if (!(rate >= 0)) return alert("Valeur invalide.");
  await updateDoc(doc(db,"agents",a.id), { defaultRate: rate });
  await refresh();
  openAgent(a.id);
});

btnDeleteAgent.addEventListener("click", async () => {
  const a = currentAgent(); if (!a) return;
  const ok = confirm(`Supprimer "${a.name}" ? (supprime aussi ses heures et paiements)`);
  if (!ok) return;

  // supprime tout ce qui dépend de l’agent
  const eToDel = entries.filter(e => e.agentId === a.id);
  const pToDel = payments.filter(p => p.agentId === a.id);

  await Promise.all([
    deleteDoc(doc(db,"agents",a.id)),
    ...eToDel.map(e => deleteDoc(doc(db,"entries",e.id))),
    ...pToDel.map(p => deleteDoc(doc(db,"payments",p.id))),
  ]);

  await refresh();
  go("agents");
});

// ---------- Agent panel ----------
monthFilter.addEventListener("change", () => renderAgentPanel());

btnUseDefaultRate.addEventListener("click", () => {
  const a = currentAgent(); if (!a) return;
  fRate.value = String(a.defaultRate ?? 15);
});

btnResetForm.addEventListener("click", () => {
  const a = currentAgent();
  fDate.value = todayISO();
  fHours.value = "";
  fNote.value = "";
  fSite.value = "";
  fRate.value = String(a?.defaultRate ?? 15);
});

function renderAgentPanel(){
  const a = currentAgent(); if (!a) return;

  agentTitle.textContent = `Agent : ${a.name}`;
  agentMeta.textContent = `Taux défaut: ${a.defaultRate ?? 15}€/h`;
  btnUseDefaultRate.textContent = `${a.defaultRate ?? 15}€/h`;
  if (!fRate.value) fRate.value = String(a.defaultRate ?? 15);

  const total = agentTotalAmount(a.id);
  const hours = agentTotalHours(a.id);
  const paid = agentTotalPaid(a.id);
  const due = Math.max(0, round2(total - paid));

  statTotal.textContent = fmtEUR(total);
  statHours.textContent = `${round2(hours)} h`;
  statPaid.textContent = fmtEUR(paid);
  statDue.textContent = fmtEUR(due);
  btnPayMax.disabled = due <= 0.0001;

  renderEntriesTable(a.id);
  renderSiteSelect();
}

function setAgentTab(tab){
  agentTab = tab;
  document.querySelectorAll(".tab").forEach(x => x.classList.toggle("active", x.dataset.tab === tab));
  tabHours.classList.toggle("hidden", tab !== "hours");
  tabPay.classList.toggle("hidden", tab !== "pay");
}

// ---------- Entries CRUD ----------
entryForm.addEventListener("submit", async (ev) => {
  ev.preventDefault();
  const a = currentAgent(); if (!a) return;

  const date = fDate.value;
  const hours = Number(fHours.value);
  const rate = Number(fRate.value);
  if (!date || !(hours >= 0) || !(rate >= 0)) return;

  const siteId = fSite.value || "";
  const siteName = siteId ? (sites.find(s => s.id === siteId)?.name || "") : "";
  const note = (fNote.value || "").trim();
  const amount = round2(hours * rate);

  await addDoc(collection(db,"entries"), {
    agentId: a.id, date, hours, rate, amount,
    paidAmount: 0,
    siteId, siteName,
    note
  });

  btnResetForm.click();
  await refresh();
  openAgent(a.id);
});

function renderEntriesTable(agentId){
  const month = monthFilter.value;
  const [yyyy, mm] = month.split("-");
  const start = `${yyyy}-${mm}-01`;
  const end = nextMonthStart(yyyy, mm);

  const list = entries
    .filter(e => e.agentId === agentId && e.date >= start && e.date < end)
    .slice()
    .sort((a,b)=> (b.date||"").localeCompare(a.date||""));

  entriesTbody.innerHTML = "";
  if (list.length === 0){
    entriesTbody.innerHTML = `<tr><td colspan="9" class="muted">Aucune entrée sur ce mois.</td></tr>`;
    return;
  }

  for (const e of list){
    const rest = Math.max(0, round2(e.amount - e.paidAmount));
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${esc(e.date)}</td>
      <td>${esc(String(e.hours))}</td>
      <td>${esc(String(e.rate))} €</td>
      <td><b>${fmtEUR(e.amount)}</b></td>
      <td>${fmtEUR(e.paidAmount)}</td>
      <td>${fmtEUR(rest)}</td>
      <td>${esc(e.siteName || "")}</td>
      <td>${esc(e.note || "")}</td>
      <td>
        <div class="row gap" style="flex-wrap:wrap">
          <button class="btn" data-a="edit">Modifier</button>
          <button class="btn danger" data-a="del">Suppr.</button>
        </div>
      </td>
    `;
    tr.querySelector('[data-a="edit"]').addEventListener("click", () => editEntry(e.id));
    tr.querySelector('[data-a="del"]').addEventListener("click", () => deleteEntryDoc(e.id));
    entriesTbody.appendChild(tr);
  }
}

async function editEntry(entryId){
  const e = entries.find(x => x.id === entryId);
  if (!e) return;

  const date = prompt("Date (YYYY-MM-DD)", e.date);
  if (!date) return;

  const hoursStr = prompt("Heures", String(e.hours));
  if (hoursStr === null) return;

  const rateStr = prompt("Taux (€)", String(e.rate));
  if (rateStr === null) return;

  const note = prompt("Note", e.note || "");
  if (note === null) return;

  const hours = Number(hoursStr);
  const rate = Number(rateStr);
  const amount = round2(hours * rate);
  const paidAmount = Math.min(Number(e.paidAmount||0), amount);

  await updateDoc(doc(db,"entries",e.id), { date, hours, rate, amount, note: note.trim(), paidAmount });
  await refresh();
  openAgent(e.agentId);
}

async function deleteEntryDoc(entryId){
  const ok = confirm("Supprimer cette entrée ?");
  if (!ok) return;
  const e = entries.find(x => x.id === entryId);
  await deleteDoc(doc(db,"entries",entryId));
  await refresh();
  if (e) openAgent(e.agentId);
}

// ---------- Payments ----------
payForm.addEventListener("submit", async (ev) => {
  ev.preventDefault();
  await addPaymentAndAllocate(false);
});
btnPayMax.addEventListener("click", async () => {
  await addPaymentAndAllocate(true);
});

async function addPaymentAndAllocate(payAll){
  const a = currentAgent(); if (!a) return;

  const date = pDate.value || todayISO();
  let amount = Number(pAmount.value);
  const note = (pNote.value || "").trim();

  const total = agentTotalAmount(a.id);
  const paid = agentTotalPaid(a.id);
  const due = Math.max(0, round2(total - paid));

  if (payAll) amount = due;
  if (!(amount > 0)) return alert("Montant invalide.");

  await addDoc(collection(db,"payments"), { agentId: a.id, date, amount: round2(amount), note });

  // FIFO allocation
  let remaining = round2(amount);
  const unpaid = entries
    .filter(e => e.agentId === a.id && e.paidAmount < e.amount)
    .slice()
    .sort((x,y)=> (x.date||"").localeCompare(y.date||""));

  for (const e of unpaid){
    if (remaining <= 0) break;
    const rest = round2(e.amount - e.paidAmount);
    const add = Math.min(rest, remaining);
    remaining = round2(remaining - add);
    await updateDoc(doc(db,"entries",e.id), { paidAmount: round2(e.paidAmount + add) });
  }

  pAmount.value = "";
  pNote.value = "";
  await refresh();
  openAgent(a.id);
}

// ---------- Sites ----------
btnAddSite.addEventListener("click", async () => {
  const name = prompt("Nom du chantier :");
  if (!name) return;
  await addDoc(collection(db,"sites"), { name: name.trim() });
  await refresh();
  go("sites");
});

function renderSites(){
  sitesList.innerHTML = "";
  if (sites.length === 0){
    sitesList.innerHTML = `<div class="cardSub">Aucun chantier. Clique “+ Ajouter chantier”.</div>`;
    return;
  }

  for (const s of sites){
    const used = entries.filter(e => e.siteId === s.id).length;
    const row = document.createElement("div");
    row.className = "listItem";
    row.innerHTML = `
      <div class="listLeft">
        <div class="listTitle">${esc(s.name)}</div>
        <div class="listSub">${used} entrée(s) liée(s)</div>
      </div>
      <div class="row gap">
        <button class="btn" data-a="rename">Renommer</button>
        <button class="btn danger" data-a="del">Suppr.</button>
      </div>
    `;

    row.querySelector('[data-a="rename"]').addEventListener("click", async () => {
      const nn = prompt("Nouveau nom :", s.name);
      if (!nn) return;

      await updateDoc(doc(db,"sites",s.id), { name: nn.trim() });

      // met à jour le snapshot siteName sur les entrées existantes
      const related = entries.filter(e => e.siteId === s.id);
      await Promise.all(related.map(e => updateDoc(doc(db,"entries",e.id), { siteName: nn.trim() })));

      await refresh();
      go("sites");
    });

    row.querySelector('[data-a="del"]').addEventListener("click", async () => {
      const ok = confirm(`Supprimer chantier "${s.name}" ?`);
      if (!ok) return;
      await deleteDoc(doc(db,"sites",s.id));
      await refresh();
      go("sites");
    });

    sitesList.appendChild(row);
  }
}

function renderSiteSelect(){
  const keep = fSite.value;
  fSite.innerHTML = `<option value="">—</option>`;
  for (const s of sites){
    const opt = document.createElement("option");
    opt.value = s.id;
    opt.textContent = s.name;
    fSite.appendChild(opt);
  }
  fSite.value = keep;
}

// ---------- History ----------
historyAgentFilter.addEventListener("change", renderHistory);

function renderHistory(){
  // filtre agents
  const keep = historyAgentFilter.value || "__all__";
  historyAgentFilter.innerHTML = `<option value="__all__">Tous les agents</option>`;
  for (const a of agents){
    const opt = document.createElement("option");
    opt.value = a.id;
    opt.textContent = a.name;
    historyAgentFilter.appendChild(opt);
  }
  historyAgentFilter.value = keep;

  const filter = historyAgentFilter.value || "__all__";
  const list = payments
    .filter(p => filter === "__all__" ? true : p.agentId === filter)
    .slice()
    .sort((a,b)=> (b.date||"").localeCompare(a.date||""));

  historyTbody.innerHTML = "";
  if (list.length === 0){
    historyTbody.innerHTML = `<tr><td colspan="5" class="muted">Aucun paiement.</td></tr>`;
    return;
  }

  for (const p of list){
    const ag = agents.find(x => x.id === p.agentId);
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${esc(p.date || "")}</td>
      <td>${esc(ag?.name || "—")}</td>
      <td><b>${fmtEUR(p.amount)}</b></td>
      <td>${esc(p.note || "")}</td>
      <td><button class="btn danger">Suppr.</button></td>
    `;
    tr.querySelector("button").addEventListener("click", async () => {
      const ok = confirm("Supprimer ce paiement ? (ne recalcul pas l’allocation déjà appliquée)");
      if (!ok) return;
      await deleteDoc(doc(db,"payments",p.id));
      await refresh();
      go("history");
    });
    historyTbody.appendChild(tr);
  }
}
