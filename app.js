// Heure Chantier - V1 (local)
// Modèle: agents, sites, entries (heures), payments (paiements)

const STORAGE_KEY = "HC_V1";

const $ = (id) => document.getElementById(id);
const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
const fmtEUR = (n) => new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" }).format(Number(n || 0));
const todayISO = () => new Date().toISOString().slice(0, 10);

const DEFAULT_RATE = 15; // €/h

function uid() {
  return Math.random().toString(16).slice(2) + Date.now().toString(16);
}

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return seed();
    const s = JSON.parse(raw);
    return {
      agents: Array.isArray(s.agents) ? s.agents : [],
      sites: Array.isArray(s.sites) ? s.sites : [],
      entries: Array.isArray(s.entries) ? s.entries : [],
      payments: Array.isArray(s.payments) ? s.payments : [],
    };
  } catch {
    return seed();
  }
}
function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function seed() {
  // démarre vide, mais tu peux pré-remplir si tu veux
  return { agents: [], sites: [], entries: [], payments: [] };
}

let state = loadState();

// Views
const viewHome = $("viewHome");
const viewAddHours = $("viewAddHours");
const viewSites = $("viewSites");
const viewPayments = $("viewPayments");

// Home nav
document.querySelectorAll("[data-go]").forEach((btn) => {
  btn.addEventListener("click", () => go(btn.dataset.go));
});

// Reset all
$("btnResetAll").addEventListener("click", () => {
  const ok = confirm("Tout effacer sur cet appareil ?");
  if (!ok) return;
  localStorage.removeItem(STORAGE_KEY);
  state = seed();
  renderAll();
  go("home");
});

// Add Hours UI
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
let payAgentId = null;

btnClosePay.addEventListener("click", closePayModal);
payModal.addEventListener("click", (e) => {
  if (e.target === payModal) closePayModal();
});

// Init defaults
(function init() {
  workDate.value = todayISO();
  payDate.value = todayISO();
  startTime.value = "08:00";
  endTime.value = "12:00";
  computeDuration();
})();

[startTime, endTime].forEach((el) => el.addEventListener("change", computeDuration));
agentSelect.addEventListener("change", computeDuration);

// Quick add agent/site
btnAddAgentQuick.addEventListener("click", () => {
  const name = prompt("Nom de l'agent :");
  if (!name) return;
  state.agents.push({ id: uid(), name: name.trim(), rate: DEFAULT_RATE });
  saveState();
  renderAll();
  agentSelect.value = state.agents[state.agents.length - 1].id;
  computeDuration();
});

btnAddSiteQuick.addEventListener("click", () => {
  const name = prompt("Nom du chantier :");
  if (!name) return;
  state.sites.push({ id: uid(), name: name.trim() });
  saveState();
  renderAll();
  siteSelect.value = state.sites[state.sites.length - 1].id;
});

btnAddSite.addEventListener("click", () => {
  const name = prompt("Nom du chantier :");
  if (!name) return;
  state.sites.push({ id: uid(), name: name.trim() });
  saveState();
  renderAll();
  sitePick.value = state.sites[state.sites.length - 1].id;
  renderSiteEntries();
});

btnAddAgent.addEventListener("click", () => {
  const name = prompt("Nom de l'agent :");
  if (!name) return;
  state.agents.push({ id: uid(), name: name.trim(), rate: DEFAULT_RATE });
  saveState();
  renderAll();
});

// Add hour submit
hoursForm.addEventListener("submit", (e) => {
  e.preventDefault();

  if (state.agents.length === 0) return alert("Ajoute d'abord un agent.");
  if (state.sites.length === 0) return alert("Ajoute d'abord un chantier.");

  const agentId = agentSelect.value;
  const siteId = siteSelect.value;
  const date = workDate.value;
  const start = startTime.value;
  const end = endTime.value;

  const agent = state.agents.find((a) => a.id === agentId);
  const site = state.sites.find((s) => s.id === siteId);
  if (!agent || !site) return alert("Agent/Chantier invalide.");

  const hours = computeHours(start, end);
  if (!(hours > 0)) return alert("Heures invalides (fin doit être après début).");

  const amount = round2(hours * (agent.rate ?? DEFAULT_RATE));

  state.entries.push({
    id: uid(),
    agentId,
    agentName: agent.name,
    siteId,
    siteName: site.name,
    date,
    start,
    end,
    hours,
    amount
  });

  saveState();
  renderAll();
  alert("Heure enregistrée ✅");
});

// Site pick change
sitePick.addEventListener("change", renderSiteEntries);

// Pay modal submit
payForm.addEventListener("submit", (e) => {
  e.preventDefault();
  if (!payAgentId) return;

  const date = payDate.value || todayISO();
  const amt = Number(payAmount.value);
  if (!(amt > 0)) return alert("Montant invalide.");

  state.payments.push({
    id: uid(),
    agentId: payAgentId,
    date,
    amount: round2(amt),
  });

  saveState();
  closePayModal();
  renderAll();
});

function openPayModal(agentId) {
  payAgentId = agentId;
  const ag = state.agents.find(a => a.id === agentId);
  payModalAgent.textContent = ag ? ag.name : "Agent";
  payDate.value = todayISO();
  payAmount.value = "";
  payModal.classList.remove("hidden");
}
function closePayModal() {
  payAgentId = null;
  payModal.classList.add("hidden");
}

// Navigation
function go(where) {
  [viewHome, viewAddHours, viewSites, viewPayments].forEach(v => v.classList.add("hidden"));
  if (where === "home") viewHome.classList.remove("hidden");
  if (where === "addHours") viewAddHours.classList.remove("hidden");
  if (where === "sites") viewSites.classList.remove("hidden");
  if (where === "payments") viewPayments.classList.remove("hidden");

  // refresh lists on enter
  if (where === "sites") renderSiteEntries();
}

// Render
function renderAll() {
  renderSelects();
  renderSitePick();
  renderSiteEntries();
  renderPaymentsTable();
  computeDuration();
}

function renderSelects() {
  // Agents
  agentSelect.innerHTML = "";
  if (state.agents.length === 0) {
    agentSelect.innerHTML = `<option value="">(Aucun agent)</option>`;
  } else {
    for (const a of state.agents) {
      const opt = document.createElement("option");
      opt.value = a.id;
      opt.textContent = a.name;
      agentSelect.appendChild(opt);
    }
  }

  // Sites
  siteSelect.innerHTML = "";
  if (state.sites.length === 0) {
    siteSelect.innerHTML = `<option value="">(Aucun chantier)</option>`;
  } else {
    for (const s of state.sites) {
      const opt = document.createElement("option");
      opt.value = s.id;
      opt.textContent = s.name;
      siteSelect.appendChild(opt);
    }
  }
}

function renderSitePick() {
  sitePick.innerHTML = "";
  if (state.sites.length === 0) {
    sitePick.innerHTML = `<option value="">(Aucun chantier)</option>`;
    return;
  }
  for (const s of state.sites) {
    const opt = document.createElement("option");
    opt.value = s.id;
    opt.textContent = s.name;
    sitePick.appendChild(opt);
  }
  if (!sitePick.value) sitePick.value = state.sites[0].id;
}

function renderSiteEntries() {
  siteEntriesList.innerHTML = "";
  const siteId = sitePick.value;
  if (!siteId) {
    siteEntriesList.innerHTML = `<div class="item"><div class="itemMain">Aucun chantier</div><div class="itemSub">Ajoute un chantier pour commencer.</div></div>`;
    return;
  }

  const list = state.entries
    .filter(e => e.siteId === siteId)
    .slice()
    .sort((a,b) => (b.date||"").localeCompare(a.date||""));

  if (list.length === 0) {
    siteEntriesList.innerHTML = `<div class="item"><div class="itemMain">Aucune heure</div><div class="itemSub">Aucune entrée pour ce chantier.</div></div>`;
    return;
  }

  for (const e of list) {
    const div = document.createElement("div");
    div.className = "item";
    div.innerHTML = `
      <div class="itemTop">
        <div class="itemMain">${escapeHtml(e.agentName)} • ${escapeHtml(e.date)}</div>
        <div class="badge">${round2(e.hours).toFixed(2)} h</div>
      </div>
      <div class="itemSub">${escapeHtml(e.start)} → ${escapeHtml(e.end)} • ${fmtEUR(e.amount)}</div>
    `;
    siteEntriesList.appendChild(div);
  }
}

function renderPaymentsTable() {
  agentPayTable.innerHTML = "";

  // Header row
  const header = document.createElement("div");
  header.className = "tr th";
  header.innerHTML = `
    <div>Agent</div>
    <div>Dû</div>
    <div>Payé</div>
    <div>Reste</div>
    <div></div>
  `;
  agentPayTable.appendChild(header);

  if (state.agents.length === 0) {
    const empty = document.createElement("div");
    empty.className = "tr";
    empty.innerHTML = `
      <div class="cellMuted">Aucun agent</div>
      <div class="cellMuted">—</div>
      <div class="cellMuted">—</div>
      <div class="cellMuted">—</div>
      <div></div>
    `;
    agentPayTable.appendChild(empty);
    return;
  }

  for (const a of state.agents) {
    const due = agentDue(a.id);
    const paid = agentPaid(a.id);
    const rest = Math.max(0, round2(due - paid));

    const row = document.createElement("div");
    row.className = "tr";
    row.innerHTML = `
      <div><b>${escapeHtml(a.name)}</b><div class="cellMuted">${(a.rate ?? DEFAULT_RATE)}€/h</div></div>
      <div>${fmtEUR(due)}</div>
      <div>${fmtEUR(paid)}</div>
      <div><b>${fmtEUR(rest)}</b></div>
      <div><button class="btn">+ Paiement</button></div>
    `;
    row.querySelector("button").addEventListener("click", () => openPayModal(a.id));
    agentPayTable.appendChild(row);
  }
}

function agentDue(agentId) {
  return round2(state.entries.filter(e => e.agentId === agentId).reduce((s,e)=>s+Number(e.amount||0),0));
}
function agentPaid(agentId) {
  return round2(state.payments.filter(p => p.agentId === agentId).reduce((s,p)=>s+Number(p.amount||0),0));
}

// Duration compute
function computeDuration() {
  const agentId = agentSelect.value;
  const agent = state.agents.find(a => a.id === agentId);
  const rate = agent?.rate ?? DEFAULT_RATE;

  const h = computeHours(startTime.value, endTime.value);
  durationOut.textContent = `${Math.max(0, round2(h)).toFixed(2)} h`;
  amountOut.textContent = fmtEUR(Math.max(0, round2(h * rate)));
}

function computeHours(start, end) {
  if (!start || !end) return 0;
  const [sh, sm] = start.split(":").map(Number);
  const [eh, em] = end.split(":").map(Number);
  const s = sh * 60 + sm;
  const e = eh * 60 + em;
  const diff = e - s;
  if (diff <= 0) return 0;
  return diff / 60;
}

function escapeHtml(str){
  return String(str ?? "")
    .replaceAll("&","&amp;")
    .replaceAll("<","&lt;")
    .replaceAll(">","&gt;")
    .replaceAll('"',"&quot;")
    .replaceAll("'","&#039;");
}

// first render
renderAll();
go("home");
