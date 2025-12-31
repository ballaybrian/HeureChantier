import { db, auth, f } from "./firebase.js";

const $ = (id) => document.getElementById(id);
const fmtEUR = (n) => new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" }).format(n || 0);

let currentUser = null;
let currentAgent = null;   // { id, ...data }
let currentTab = "unpaid"; // unpaid | paid
let entriesCache = [];     // loaded entries for agent

// UI refs
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

const agentTitle = $("agentTitle");
const monthFilter = $("monthFilter");
const totalUnpaid = $("totalUnpaid");
const totalPaid = $("totalPaid");

const entryForm = $("entryForm");
const btnResetForm = $("btnResetForm");
const entriesTbody = $("entriesTbody");
const listTitle = $("listTitle");
const btnExportCSV = $("btnExportCSV");

const fDate = $("fDate");
const fHours = $("fHours");
const fRate = $("fRate");
const fSite = $("fSite");
const fNote = $("fNote");

// Default month to current month
(function initMonth() {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  monthFilter.value = `${yyyy}-${mm}`;
  fDate.valueAsDate = new Date();
})();

// ---------- AUTH ----------
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
  if (currentUser) {
    await loadAgents();
  } else {
    agentsGrid.innerHTML = "";
    showHome();
  }
});

function renderAuth() {
  if (!currentUser) {
    btnSignIn.classList.remove("hidden");
    btnSignOut.classList.add("hidden");
    authBanner.classList.remove("hidden");
    authBanner.textContent = "Connecte-toi (Google) pour accéder à tes agents et tes heures.";
  } else {
    btnSignIn.classList.add("hidden");
    btnSignOut.classList.remove("hidden");
    authBanner.classList.remove("hidden");
    authBanner.textContent = `Connecté : ${currentUser.email}`;
  }
}

// ---------- NAV ----------
function showHome() {
  currentAgent = null;
  viewHome.classList.remove("hidden");
  viewAgent.classList.add("hidden");
}
function showAgent() {
  viewHome.classList.add("hidden");
  viewAgent.classList.remove("hidden");
}

// ---------- AGENTS ----------
btnAddAgent.addEventListener("click", async () => {
  if (!guardAuth()) return;
  const name = prompt("Nom de l'agent :");
  if (!name) return;

  await f.addDoc(f.collection(db, "agents"), {
    name: name.trim(),
    createdAt: f.serverTimestamp(),
    ownerUid: currentUser.uid
  });

  await loadAgents();
});

async function loadAgents() {
  if (!guardAuth()) return;
  agentsGrid.innerHTML = `<div class="banner">Chargement des agents...</div>`;

  const q = f.query(
    f.collection(db, "agents"),
    f.where("ownerUid", "==", currentUser.uid),
    f.orderBy("createdAt", "desc")
  );
  const snap = await f.getDocs(q);
  const agents = snap.docs.map(d => ({ id: d.id, ...d.data() }));

  agentsGrid.innerHTML = "";
  if (agents.length === 0) {
    agentsGrid.innerHTML = `<div class="banner">Aucun agent. Clique sur “+ Ajouter un agent”.</div>`;
    return;
  }

  for (const a of agents) {
    const btn = document.createElement("button");
    btn.className = "agentBtn";
    btn.innerHTML = `
      <div class="agentName">${escapeHtml(a.name || "Sans nom")}</div>
      <div class="agentMeta">Clique pour ouvrir</div>
    `;
    btn.addEventListener("click", () => openAgent(a));
    agentsGrid.appendChild(btn);
  }
}

async function openAgent(agent) {
  currentAgent = agent;
  agentTitle.textContent = `Agent : ${agent.name}`;
  showAgent();

  // load entries for current month by default
  await loadEntries();
  setTab("unpaid");
  renderTotals();
  renderEntries();
}

btnBack.addEventListener("click", () => {
  showHome();
});

btnRenameAgent.addEventListener("click", async () => {
  if (!guardAuth() || !currentAgent) return;
  const newName = prompt("Nouveau nom :", currentAgent.name || "");
  if (!newName) return;

  await f.updateDoc(f.doc(db, "agents", currentAgent.id), { name: newName.trim() });
  currentAgent.name = newName.trim();
  agentTitle.textContent = `Agent : ${currentAgent.name}`;
  await loadAgents();
});

btnDeleteAgent.addEventListener("click", async () => {
  if (!guardAuth() || !currentAgent) return;
  const ok = confirm(`Supprimer l'agent "${currentAgent.name}" ? (Les heures restent dans la base tant qu'on ne les supprime pas)`);
  if (!ok) return;

  await f.deleteDoc(f.doc(db, "agents", currentAgent.id));
  // Option : on pourrait aussi supprimer toutes les entries liées, mais c'est une autre logique (à confirmer).
  showHome();
  await loadAgents();
});

// ---------- ENTRIES ----------
monthFilter.addEventListener("change", async () => {
  if (!currentAgent) return;
  await loadEntries();
  renderTotals();
  renderEntries();
});

document.querySelectorAll(".tab").forEach(t => {
  t.addEventListener("click", () => setTab(t.dataset.tab));
});

function setTab(tab) {
  currentTab = tab;
  document.querySelectorAll(".tab").forEach(x => x.classList.toggle("active", x.dataset.tab === tab));
  listTitle.textContent = tab === "unpaid" ? "Heures (à payer)" : "Déjà payé";
  renderEntries();
}

entryForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  if (!guardAuth() || !currentAgent) return;

  const date = fDate.value;
  const hours = Number(fHours.value);
  const rate = Number(fRate.value);
  const site = (fSite.value || "").trim();
  const note = (fNote.value || "").trim();

  if (!date || !(hours >= 0) || !(rate >= 0)) return;

  await f.addDoc(f.collection(db, "entries"), {
    ownerUid: currentUser.uid,
    agentId: currentAgent.id,
    date,
    hours,
    rate,
    site,
    note,
    paid: false,
    paidAt: null,
    createdAt: f.serverTimestamp(),
  });

  entryForm.reset();
  fDate.valueAsDate = new Date();
  await loadEntries();
  renderTotals();
  renderEntries();
});

btnResetForm.addEventListener("click", () => {
  entryForm.reset();
  fDate.valueAsDate = new Date();
});

async function loadEntries() {
  if (!guardAuth() || !currentAgent) return;

  const [yyyy, mm] = monthFilter.value.split("-");
  const start = `${yyyy}-${mm}-01`;
  const end = nextMonthStart(yyyy, mm); // exclusive

  const q = f.query(
    f.collection(db, "entries"),
    f.where("ownerUid", "==", currentUser.uid),
    f.where("agentId", "==", currentAgent.id),
    f.where("date", ">=", start),
    f.where("date", "<", end),
    f.orderBy("date", "desc")
  );
  const snap = await f.getDocs(q);
  entriesCache = snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

function renderTotals() {
  const unpaid = entriesCache.filter(e => !e.paid);
  const paid = entriesCache.filter(e => e.paid);

  const sumUnpaid = unpaid.reduce((acc, e) => acc + (e.hours * e.rate), 0);
  const sumPaid = paid.reduce((acc, e) => acc + (e.hours * e.rate), 0);

  totalUnpaid.textContent = fmtEUR(sumUnpaid);
  totalPaid.textContent = fmtEUR(sumPaid);
}

function renderEntries() {
  const list = entriesCache
    .filter(e => currentTab === "paid" ? !!e.paid : !e.paid)
    .sort((a,b) => (b.date || "").localeCompare(a.date || ""));

  entriesTbody.innerHTML = "";

  if (list.length === 0) {
    entriesTbody.innerHTML = `
      <tr><td colspan="7" style="color:#9db0d1;">Aucune entrée pour ce filtre.</td></tr>
    `;
    return;
  }

  for (const e of list) {
    const tr = document.createElement("tr");
    const total = (Number(e.hours) || 0) * (Number(e.rate) || 0);

    tr.innerHTML = `
      <td>${escapeHtml(e.date || "")}${e.paid && e.paidAt ? `<div class="badge">Payé</div>` : ""}</td>
      <td>${escapeHtml(String(e.hours ?? ""))}</td>
      <td>${escapeHtml(String(e.rate ?? ""))} €</td>
      <td><b>${fmtEUR(total)}</b></td>
      <td>${escapeHtml(e.site || "")}</td>
      <td>${escapeHtml(e.note || "")}</td>
      <td>
        <div class="row gap" style="flex-wrap:wrap;">
          <button class="btn" data-action="edit">Modifier</button>
          <button class="btn danger" data-action="delete">Suppr.</button>
          ${
            e.paid
              ? `<button class="btn" data-action="unpay">Remettre à payer</button>`
              : `<button class="btn primary" data-action="pay">Marquer payé</button>`
          }
        </div>
      </td>
    `;

    tr.querySelectorAll("button").forEach(btn => {
      btn.addEventListener("click", async () => {
        const action = btn.dataset.action;
        if (action === "edit") return editEntry(e);
        if (action === "delete") return deleteEntry(e);
        if (action === "pay") return markPaid(e, true);
        if (action === "unpay") return markPaid(e, false);
      });
    });

    entriesTbody.appendChild(tr);
  }
}

async function editEntry(e) {
  const date = prompt("Date (YYYY-MM-DD)", e.date || "");
  if (!date) return;

  const hoursStr = prompt("Heures", String(e.hours ?? ""));
  if (hoursStr === null) return;
  const hours = Number(hoursStr);

  const rateStr = prompt("Taux (€)", String(e.rate ?? ""));
  if (rateStr === null) return;
  const rate = Number(rateStr);

  const site = prompt("Chantier", e.site || "");
  if (site === null) return;

  const note = prompt("Note", e.note || "");
  if (note === null) return;

  await f.updateDoc(f.doc(db, "entries", e.id), {
    date,
    hours,
    rate,
    site: site.trim(),
    note: note.trim(),
  });

  await loadEntries();
  renderTotals();
  renderEntries();
}

async function deleteEntry(e) {
  const ok = confirm(`Supprimer l'entrée du ${e.date} ?`);
  if (!ok) return;

  await f.deleteDoc(f.doc(db, "entries", e.id));
  await loadEntries();
  renderTotals();
  renderEntries();
}

async function markPaid(e, paid) {
  const patch = paid
    ? { paid: true, paidAt: new Date() }
    : { paid: false, paidAt: null };

  await f.updateDoc(f.doc(db, "entries", e.id), patch);
  await loadEntries();
  renderTotals();
  renderEntries();
}

// ---------- CSV EXPORT ----------
btnExportCSV.addEventListener("click", () => {
  if (!currentAgent) return;
  const rows = entriesCache.map(e => ({
    date: e.date,
    hours: e.hours,
    rate: e.rate,
    total: (Number(e.hours)||0) * (Number(e.rate)||0),
    site: e.site || "",
    note: e.note || "",
    paid: e.paid ? "yes" : "no"
  }));

  const header = Object.keys(rows[0] || { date:"", hours:"", rate:"", total:"", site:"", note:"", paid:"" });
  const csv = [header.join(";")]
    .concat(rows.map(r => header.map(k => csvCell(r[k])).join(";")))
    .join("\n");

  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${safeFile(currentAgent.name)}_${monthFilter.value}.csv`;
  a.click();
  URL.revokeObjectURL(url);
});

// ---------- Helpers ----------
function guardAuth() {
  if (!currentUser) {
    alert("Connecte-toi d'abord.");
    return false;
  }
  return true;
}

function nextMonthStart(yyyy, mm) {
  const y = Number(yyyy);
  const m = Number(mm);
  const d = new Date(y, m - 1, 1);
  d.setMonth(d.getMonth() + 1);
  const Y = d.getFullYear();
  const M = String(d.getMonth() + 1).padStart(2, "0");
  return `${Y}-${M}-01`;
}

function escapeHtml(str) {
  return String(str)
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
