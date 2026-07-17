const EXPENSE_CATEGORIES = [
  "อาหาร", "เดินทาง/น้ำมัน", "ที่พัก/ค่าเช่า", "สาธารณูปโภค", "ช้อปปิ้ง",
  "สุขภาพ", "บันเทิง", "การศึกษา", "ผ่อนชำระ", "อื่นๆ",
];
const INCOME_CATEGORIES = ["เงินเดือน", "โบนัส", "รายได้เสริม", "ดอกเบี้ย/เงินปันผล", "ชำระหนี้คืน", "อื่นๆ"];

const PAYMENT_METHOD_LABEL = { cash: "เงินสด", transfer: "โอนเงิน", credit_card: "บัตรเครดิต" };
const REPAYMENT_TYPE_LABEL = {
  cash: "เงินสด (ก้อนเดียว)",
  monthly_installment: "ผ่อนรายเดือน",
  product_installment: "ผ่อนสินค้า",
};
const INSTANCE_STATUS_LABEL = { pending: "รอชำระ", paid: "จ่ายแล้ว", skipped: "ข้าม" };
const THEME_KEY = "expense-theme-v1";

const state = {
  user: null,
  page: "dashboard",
  creditCards: [],
  categoriesCache: {},
};

function esc(v) {
  if (v === null || v === undefined) return "";
  return String(v)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function fmtMoney(n) {
  return Number(n || 0).toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtDate(d) {
  if (!d) return "-";
  return new Date(d).toLocaleDateString("th-TH", { year: "numeric", month: "short", day: "numeric" });
}

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

// ---------------- Toast ----------------
function toast(message, type = "info") {
  const host = document.getElementById("toastHost");
  const el = document.createElement("div");
  el.className = `toast ${type}`;
  el.textContent = message;
  host.appendChild(el);
  setTimeout(() => el.remove(), 3200);
}

// ---------------- Modal ----------------
function openModal(html) {
  const host = document.getElementById("modalHost");
  host.innerHTML = `<div class="modal-backdrop" id="modalBackdrop"><div class="modal">${html}</div></div>`;
  document.getElementById("modalBackdrop").addEventListener("click", (e) => {
    if (e.target.id === "modalBackdrop") closeModal();
  });
}
function closeModal() {
  document.getElementById("modalHost").innerHTML = "";
}

// ---------------- Theme ----------------
function initTheme() {
  const saved = localStorage.getItem(THEME_KEY) || "dark";
  document.documentElement.setAttribute("data-theme", saved);
}
function toggleTheme() {
  const current = document.documentElement.getAttribute("data-theme") || "dark";
  const next = current === "dark" ? "light" : "dark";
  document.documentElement.setAttribute("data-theme", next);
  localStorage.setItem(THEME_KEY, next);
}

// ---------------- Auth / boot ----------------
async function boot() {
  initTheme();
  document.getElementById("loginForm").addEventListener("submit", onLoginSubmit);
  document.getElementById("logoutBtn").addEventListener("click", onLogout);
  document.getElementById("themeToggleBtn").addEventListener("click", toggleTheme);
  document.getElementById("sideNav").addEventListener("click", (e) => {
    const btn = e.target.closest("button[data-page]");
    if (btn) navigate(btn.dataset.page);
  });

  if (api.getToken()) {
    try {
      state.user = await api.auth.me();
      showApp();
      return;
    } catch (_) {
      // fall through to login
    }
  }
  showLogin();
}

function showLogin() {
  document.getElementById("loginScreen").style.display = "flex";
  document.getElementById("app").classList.remove("visible");
}

async function showApp() {
  document.getElementById("loginScreen").style.display = "none";
  document.getElementById("app").classList.add("visible");
  document.getElementById("currentUserLabel").textContent = `👤 ${state.user.display_name || state.user.username}`;
  try {
    state.creditCards = await api.creditCards.list();
  } catch (_) {
    state.creditCards = [];
  }
  await navigate("dashboard");
}

async function onLoginSubmit(e) {
  e.preventDefault();
  const username = document.getElementById("loginUsername").value.trim();
  const password = document.getElementById("loginPassword").value;
  const errorEl = document.getElementById("loginError");
  errorEl.textContent = "";
  try {
    state.user = await api.auth.login(username, password);
    await showApp();
  } catch (err) {
    errorEl.textContent = err.status === 0 ? "เชื่อมต่อเซิร์ฟเวอร์ไม่ได้" : "ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง";
  }
}

function onLogout() {
  api.auth.logout();
  state.user = null;
  showLogin();
}

// ---------------- Navigation ----------------
async function navigate(page) {
  state.page = page;
  document.querySelectorAll("#sideNav button").forEach((b) => b.classList.toggle("active", b.dataset.page === page));
  const content = document.getElementById("pageContent");
  content.innerHTML = `<div class="empty-state">กำลังโหลด...</div>`;
  try {
    if (page === "dashboard") await renderDashboard();
    else if (page === "transactions") await renderTransactions();
    else if (page === "recurring") await renderRecurring();
    else if (page === "creditCards") await renderCreditCards();
    else if (page === "loans") await renderLoans();
  } catch (err) {
    content.innerHTML = `<div class="empty-state">โหลดข้อมูลไม่สำเร็จ: ${esc(err.message)}</div>`;
  }
}

function creditCardOptions(selectedId) {
  return state.creditCards
    .map((c) => `<option value="${c.id}" ${String(c.id) === String(selectedId) ? "selected" : ""}>${esc(c.name)}</option>`)
    .join("");
}

// ================= Dashboard =================
async function renderDashboard() {
  await api.recurringBills.generate();
  const [summary, pendingInstances] = await Promise.all([
    api.dashboard.summary(),
    api.recurringBills.instances("pending"),
  ]);

  const content = document.getElementById("pageContent");
  content.innerHTML = `
    <div class="main-header"><h2>ภาพรวมเดือน ${esc(summary.period)}</h2></div>
    <div class="kpi-grid">
      <div class="kpi-card"><div class="label">รายรับเดือนนี้</div><div class="value positive">฿${fmtMoney(summary.total_income)}</div></div>
      <div class="kpi-card"><div class="label">รายจ่ายเดือนนี้</div><div class="value negative">฿${fmtMoney(summary.total_expense)}</div></div>
      <div class="kpi-card"><div class="label">คงเหลือ</div><div class="value ${summary.balance >= 0 ? "positive" : "negative"}">฿${fmtMoney(summary.balance)}</div></div>
      <div class="kpi-card"><div class="label">รายจ่ายประจำรอชำระ</div><div class="value warning">${summary.pending_bills_count} รายการ (฿${fmtMoney(summary.pending_bills_amount)})</div></div>
      <div class="kpi-card"><div class="label">ยอดบัตรเครดิตเดือนนี้</div><div class="value">฿${fmtMoney(summary.credit_card_outstanding)}</div></div>
      <div class="kpi-card"><div class="label">ยอดลูกหนี้คงค้าง</div><div class="value">฿${fmtMoney(summary.loans_outstanding)}</div></div>
    </div>

    ${pendingInstances.length ? `
    <div class="panel">
      <h3>⏰ รายจ่ายประจำที่ถึงกำหนด</h3>
      <table>
        <thead><tr><th>รายการ</th><th>ครบกำหนด</th><th>จำนวนเงิน</th><th></th></tr></thead>
        <tbody>
          ${pendingInstances.map((i) => `
            <tr>
              <td>${esc(i.bill_name)}</td>
              <td>${fmtDate(i.due_date)}</td>
              <td class="amount-expense">฿${fmtMoney(i.amount)}</td>
              <td class="actions-cell">
                <button class="small primary" data-action="pay-instance" data-id="${i.id}">จ่ายแล้ว</button>
                <button class="small ghost" data-action="skip-instance" data-id="${i.id}">ข้าม</button>
              </td>
            </tr>`).join("")}
        </tbody>
      </table>
    </div>` : ""}

    <div class="panel">
      <h3>รายการล่าสุด</h3>
      ${renderTxnTable(summary.recent_transactions, false)}
    </div>
  `;

  content.onclick = onDashboardClick;
}

async function onDashboardClick(e) {
  const payBtn = e.target.closest('[data-action="pay-instance"]');
  const skipBtn = e.target.closest('[data-action="skip-instance"]');
  if (payBtn) {
    try {
      await api.recurringBills.pay(payBtn.dataset.id);
      toast("บันทึกการจ่ายเรียบร้อย", "success");
      await navigate("dashboard");
    } catch (err) {
      toast(err.message, "error");
    }
  } else if (skipBtn) {
    try {
      await api.recurringBills.skip(skipBtn.dataset.id);
      toast("ข้ามรายการนี้แล้ว", "info");
      await navigate("dashboard");
    } catch (err) {
      toast(err.message, "error");
    }
  }
}

function renderTxnTable(txns, withActions = true) {
  if (!txns.length) return `<div class="empty-state">ยังไม่มีรายการ</div>`;
  return `
    <table>
      <thead>
        <tr><th>วันที่</th><th>ประเภท</th><th>หมวดหมู่</th><th>รายละเอียด</th><th>ช่องทาง</th><th>จำนวนเงิน</th>${withActions ? "<th></th>" : ""}</tr>
      </thead>
      <tbody>
        ${txns.map((t) => `
          <tr>
            <td>${fmtDate(t.txn_date)}</td>
            <td>${t.type === "income" ? "รายรับ" : "รายจ่าย"}</td>
            <td>${esc(t.category)}</td>
            <td>${esc(t.description) || "-"}</td>
            <td>${esc(PAYMENT_METHOD_LABEL[t.payment_method] || t.payment_method)}</td>
            <td class="${t.type === "income" ? "amount-income" : "amount-expense"}">${t.type === "income" ? "+" : "-"}฿${fmtMoney(t.amount)}</td>
            ${withActions ? `
            <td class="actions-cell">
              <button class="small" data-action="edit-txn" data-id="${t.id}">แก้ไข</button>
              <button class="small danger" data-action="delete-txn" data-id="${t.id}">ลบ</button>
            </td>` : ""}
          </tr>`).join("")}
      </tbody>
    </table>`;
}

// ================= Transactions =================
let txnFilter = { type: "" };

async function renderTransactions() {
  const txns = await api.transactions.list(txnFilter.type ? { type: txnFilter.type } : {});
  const content = document.getElementById("pageContent");
  content.innerHTML = `
    <div class="main-header">
      <h2>รายรับ-รายจ่าย</h2>
      <button class="primary" data-action="add-txn">+ เพิ่มรายการ</button>
    </div>
    <div class="tag-row">
      <button data-filter="" class="${txnFilter.type === "" ? "active" : ""}">ทั้งหมด</button>
      <button data-filter="income" class="${txnFilter.type === "income" ? "active" : ""}">รายรับ</button>
      <button data-filter="expense" class="${txnFilter.type === "expense" ? "active" : ""}">รายจ่าย</button>
    </div>
    <div class="panel">${renderTxnTable(txns, true)}</div>
  `;
  content.onclick = onTransactionsClick;
}

async function onTransactionsClick(e) {
  const filterBtn = e.target.closest("[data-filter]");
  if (filterBtn) {
    txnFilter.type = filterBtn.dataset.filter;
    await renderTransactions();
    return;
  }
  if (e.target.closest('[data-action="add-txn"]')) {
    openTxnModal();
    return;
  }
  const editBtn = e.target.closest('[data-action="edit-txn"]');
  if (editBtn) {
    const txns = await api.transactions.list();
    const txn = txns.find((t) => String(t.id) === editBtn.dataset.id);
    openTxnModal(txn);
    return;
  }
  const delBtn = e.target.closest('[data-action="delete-txn"]');
  if (delBtn) {
    if (!confirm("ลบรายการนี้หรือไม่?")) return;
    try {
      await api.transactions.remove(delBtn.dataset.id);
      toast("ลบรายการแล้ว", "success");
      await renderTransactions();
    } catch (err) {
      toast(err.message, "error");
    }
  }
}

function openTxnModal(txn = null) {
  const isEdit = !!txn;
  const type = txn ? txn.type : "expense";
  openModal(`
    <h3>${isEdit ? "แก้ไขรายการ" : "เพิ่มรายการรายรับ-รายจ่าย"}</h3>
    <form id="txnForm">
      <div class="field">
        <label>ประเภท</label>
        <select id="txnType">
          <option value="expense" ${type === "expense" ? "selected" : ""}>รายจ่าย</option>
          <option value="income" ${type === "income" ? "selected" : ""}>รายรับ</option>
        </select>
      </div>
      <div class="field-row">
        <div class="field">
          <label>จำนวนเงิน</label>
          <input id="txnAmount" type="number" step="0.01" min="0.01" value="${txn ? txn.amount : ""}" required />
        </div>
        <div class="field">
          <label>วันที่</label>
          <input id="txnDate" type="date" value="${txn ? txn.txn_date : todayISO()}" required />
        </div>
      </div>
      <div class="field">
        <label>หมวดหมู่</label>
        <input id="txnCategory" list="categoryOptions" value="${esc(txn ? txn.category : "")}" required />
        <datalist id="categoryOptions">
          ${(type === "income" ? INCOME_CATEGORIES : EXPENSE_CATEGORIES).map((c) => `<option value="${esc(c)}">`).join("")}
        </datalist>
      </div>
      <div class="field">
        <label>ช่องทางการชำระ</label>
        <select id="txnMethod">
          <option value="cash" ${txn?.payment_method === "cash" ? "selected" : ""}>เงินสด</option>
          <option value="transfer" ${txn?.payment_method === "transfer" ? "selected" : ""}>โอนเงิน</option>
          <option value="credit_card" ${txn?.payment_method === "credit_card" ? "selected" : ""}>บัตรเครดิต</option>
        </select>
      </div>
      <div class="field" id="txnCardField" style="display:${txn?.payment_method === "credit_card" ? "block" : "none"}">
        <label>บัตรเครดิต</label>
        <select id="txnCardId">${creditCardOptions(txn ? txn.credit_card_id : null)}</select>
      </div>
      <div class="field">
        <label>รายละเอียด</label>
        <input id="txnDescription" value="${esc(txn ? txn.description : "")}" />
      </div>
      <div class="modal-footer">
        <button type="button" class="ghost" data-action="close-modal">ยกเลิก</button>
        <button type="submit" class="primary">บันทึก</button>
      </div>
    </form>
  `);

  document.getElementById("txnType").addEventListener("change", (e) => {
    const cats = e.target.value === "income" ? INCOME_CATEGORIES : EXPENSE_CATEGORIES;
    document.getElementById("categoryOptions").innerHTML = cats.map((c) => `<option value="${esc(c)}">`).join("");
  });
  document.getElementById("txnMethod").addEventListener("change", (e) => {
    document.getElementById("txnCardField").style.display = e.target.value === "credit_card" ? "block" : "none";
  });
  document.getElementById("modalHost").onclick = (e) => {
    if (e.target.closest('[data-action="close-modal"]')) closeModal();
  };
  document.getElementById("txnForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const payload = {
      type: document.getElementById("txnType").value,
      amount: parseFloat(document.getElementById("txnAmount").value),
      category: document.getElementById("txnCategory").value.trim(),
      payment_method: document.getElementById("txnMethod").value,
      credit_card_id: document.getElementById("txnMethod").value === "credit_card"
        ? parseInt(document.getElementById("txnCardId").value, 10) || null
        : null,
      description: document.getElementById("txnDescription").value.trim(),
      txn_date: document.getElementById("txnDate").value,
    };
    try {
      if (isEdit) await api.transactions.update(txn.id, payload);
      else await api.transactions.create(payload);
      toast("บันทึกสำเร็จ", "success");
      closeModal();
      await navigate(state.page === "dashboard" ? "dashboard" : "transactions");
    } catch (err) {
      toast(err.message, "error");
    }
  });
}

// ================= Recurring bills =================
async function renderRecurring() {
  await api.recurringBills.generate();
  const [bills, instances] = await Promise.all([
    api.recurringBills.list(),
    api.recurringBills.instances(),
  ]);
  const pending = instances.filter((i) => i.status === "pending");
  const history = instances.filter((i) => i.status !== "pending");

  const content = document.getElementById("pageContent");
  content.innerHTML = `
    <div class="main-header">
      <h2>รายจ่ายประจำเดือน</h2>
      <button class="primary" data-action="add-bill">+ เพิ่มรายการประจำ</button>
    </div>

    ${pending.length ? `
    <div class="panel">
      <h3>⏰ รอชำระ</h3>
      <table>
        <thead><tr><th>รายการ</th><th>งวด</th><th>ครบกำหนด</th><th>จำนวนเงิน</th><th></th></tr></thead>
        <tbody>
          ${pending.map((i) => `
            <tr>
              <td>${esc(i.bill_name)}</td>
              <td>${esc(i.period)}</td>
              <td>${fmtDate(i.due_date)}</td>
              <td class="amount-expense">฿${fmtMoney(i.amount)}</td>
              <td class="actions-cell">
                <button class="small primary" data-action="pay-instance" data-id="${i.id}">จ่ายแล้ว</button>
                <button class="small ghost" data-action="skip-instance" data-id="${i.id}">ข้าม</button>
              </td>
            </tr>`).join("")}
        </tbody>
      </table>
    </div>` : ""}

    <div class="panel">
      <h3>รายการที่ตั้งไว้</h3>
      ${bills.length ? `
      <table>
        <thead><tr><th>ชื่อ</th><th>หมวดหมู่</th><th>จำนวนเงิน</th><th>ทุกวันที่</th><th>ช่องทาง</th><th>สถานะ</th><th></th></tr></thead>
        <tbody>
          ${bills.map((b) => `
            <tr>
              <td>${esc(b.name)}</td>
              <td>${esc(b.category)}</td>
              <td>฿${fmtMoney(b.amount)}</td>
              <td>${b.due_day}</td>
              <td>${esc(PAYMENT_METHOD_LABEL[b.payment_method] || b.payment_method)}</td>
              <td>${b.is_active ? "🟢 ใช้งาน" : "⚪ หยุดใช้งาน"}</td>
              <td class="actions-cell">
                <button class="small" data-action="edit-bill" data-id="${b.id}">แก้ไข</button>
                <button class="small danger" data-action="delete-bill" data-id="${b.id}">ลบ</button>
              </td>
            </tr>`).join("")}
        </tbody>
      </table>` : `<div class="empty-state">ยังไม่มีรายจ่ายประจำ</div>`}
    </div>

    ${history.length ? `
    <div class="panel">
      <h3>ประวัติ</h3>
      <table>
        <thead><tr><th>รายการ</th><th>งวด</th><th>จำนวนเงิน</th><th>สถานะ</th><th>วันที่จ่าย</th></tr></thead>
        <tbody>
          ${history.map((i) => `
            <tr>
              <td>${esc(i.bill_name)}</td>
              <td>${esc(i.period)}</td>
              <td>฿${fmtMoney(i.amount)}</td>
              <td><span class="badge ${i.status}">${INSTANCE_STATUS_LABEL[i.status]}</span></td>
              <td>${fmtDate(i.paid_date)}</td>
            </tr>`).join("")}
        </tbody>
      </table>
    </div>` : ""}
  `;

  content.onclick = onRecurringClick;
}

async function onRecurringClick(e) {
  if (e.target.closest('[data-action="add-bill"]')) return openBillModal();

  const editBtn = e.target.closest('[data-action="edit-bill"]');
  if (editBtn) {
    const bills = await api.recurringBills.list();
    return openBillModal(bills.find((b) => String(b.id) === editBtn.dataset.id));
  }

  const delBtn = e.target.closest('[data-action="delete-bill"]');
  if (delBtn) {
    if (!confirm("ลบรายจ่ายประจำนี้หรือไม่? (ประวัติที่บันทึกไว้จะถูกลบด้วย)")) return;
    try {
      await api.recurringBills.remove(delBtn.dataset.id);
      toast("ลบแล้ว", "success");
      await renderRecurring();
    } catch (err) {
      toast(err.message, "error");
    }
    return;
  }

  const payBtn = e.target.closest('[data-action="pay-instance"]');
  if (payBtn) {
    try {
      await api.recurringBills.pay(payBtn.dataset.id);
      toast("บันทึกการจ่ายเรียบร้อย", "success");
      await renderRecurring();
    } catch (err) {
      toast(err.message, "error");
    }
    return;
  }

  const skipBtn = e.target.closest('[data-action="skip-instance"]');
  if (skipBtn) {
    try {
      await api.recurringBills.skip(skipBtn.dataset.id);
      toast("ข้ามรายการนี้แล้ว", "info");
      await renderRecurring();
    } catch (err) {
      toast(err.message, "error");
    }
  }
}

function openBillModal(bill = null) {
  const isEdit = !!bill;
  openModal(`
    <h3>${isEdit ? "แก้ไขรายจ่ายประจำ" : "เพิ่มรายจ่ายประจำเดือน"}</h3>
    <form id="billForm">
      <div class="field">
        <label>ชื่อรายการ</label>
        <input id="billName" value="${esc(bill ? bill.name : "")}" required placeholder="เช่น ค่าเน็ตบ้าน, ค่าเช่า" />
      </div>
      <div class="field-row">
        <div class="field">
          <label>จำนวนเงิน</label>
          <input id="billAmount" type="number" step="0.01" min="0.01" value="${bill ? bill.amount : ""}" required />
        </div>
        <div class="field">
          <label>ตัดทุกวันที่ (1-31)</label>
          <input id="billDueDay" type="number" min="1" max="31" value="${bill ? bill.due_day : ""}" required />
        </div>
      </div>
      <div class="field">
        <label>หมวดหมู่</label>
        <input id="billCategory" list="billCategoryOptions" value="${esc(bill ? bill.category : "")}" required />
        <datalist id="billCategoryOptions">${EXPENSE_CATEGORIES.map((c) => `<option value="${esc(c)}">`).join("")}</datalist>
      </div>
      <div class="field">
        <label>ช่องทางการชำระ</label>
        <select id="billMethod">
          <option value="cash" ${bill?.payment_method === "cash" ? "selected" : ""}>เงินสด</option>
          <option value="transfer" ${bill?.payment_method === "transfer" ? "selected" : ""}>โอนเงิน</option>
          <option value="credit_card" ${bill?.payment_method === "credit_card" ? "selected" : ""}>บัตรเครดิต</option>
        </select>
      </div>
      <div class="field" id="billCardField" style="display:${bill?.payment_method === "credit_card" ? "block" : "none"}">
        <label>บัตรเครดิต</label>
        <select id="billCardId">${creditCardOptions(bill ? bill.credit_card_id : null)}</select>
      </div>
      ${isEdit ? `
      <div class="field">
        <label><input type="checkbox" id="billActive" style="width:auto" ${bill.is_active ? "checked" : ""} /> ใช้งานอยู่</label>
      </div>` : ""}
      <div class="field">
        <label>หมายเหตุ</label>
        <input id="billNotes" value="${esc(bill ? bill.notes : "")}" />
      </div>
      <div class="modal-footer">
        <button type="button" class="ghost" data-action="close-modal">ยกเลิก</button>
        <button type="submit" class="primary">บันทึก</button>
      </div>
    </form>
  `);

  document.getElementById("billMethod").addEventListener("change", (e) => {
    document.getElementById("billCardField").style.display = e.target.value === "credit_card" ? "block" : "none";
  });
  document.getElementById("modalHost").onclick = (e) => {
    if (e.target.closest('[data-action="close-modal"]')) closeModal();
  };
  document.getElementById("billForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const method = document.getElementById("billMethod").value;
    const payload = {
      name: document.getElementById("billName").value.trim(),
      category: document.getElementById("billCategory").value.trim(),
      amount: parseFloat(document.getElementById("billAmount").value),
      due_day: parseInt(document.getElementById("billDueDay").value, 10),
      payment_method: method,
      credit_card_id: method === "credit_card" ? parseInt(document.getElementById("billCardId").value, 10) || null : null,
      notes: document.getElementById("billNotes").value.trim(),
    };
    if (isEdit) payload.is_active = document.getElementById("billActive").checked;
    try {
      if (isEdit) await api.recurringBills.update(bill.id, payload);
      else await api.recurringBills.create(payload);
      toast("บันทึกสำเร็จ", "success");
      closeModal();
      await renderRecurring();
    } catch (err) {
      toast(err.message, "error");
    }
  });
}

// ================= Credit cards =================
async function renderCreditCards() {
  const cards = await api.creditCards.list();
  state.creditCards = cards;
  const summaries = await Promise.all(cards.map((c) => api.creditCards.summary(c.id).catch(() => null)));

  const content = document.getElementById("pageContent");
  content.innerHTML = `
    <div class="main-header">
      <h2>บัตรเครดิต</h2>
      <button class="primary" data-action="add-card">+ เพิ่มบัตร</button>
    </div>
    ${cards.length ? `<div class="cc-grid">
      ${cards.map((c, idx) => {
        const s = summaries[idx];
        return `
        <div class="cc-tile" style="background: linear-gradient(135deg, ${esc(c.color)}, #0f1115);">
          <div class="cc-actions">
            <button data-action="edit-card" data-id="${c.id}">✎</button>
            <button data-action="delete-card" data-id="${c.id}">🗑</button>
          </div>
          <div>
            <div class="cc-name">${esc(c.name)}</div>
            <div class="cc-bank">${esc(c.bank)}</div>
          </div>
          <div>
            <div class="cc-number">•••• ${esc(c.last4 || "----")}</div>
            <div class="cc-spend">
              รอบนี้ใช้ไป ฿${fmtMoney(s ? s.cycle_spend : 0)}
              ${c.credit_limit ? ` / วงเงิน ฿${fmtMoney(c.credit_limit)}` : ""}
            </div>
          </div>
        </div>`;
      }).join("")}
    </div>` : `<div class="empty-state">ยังไม่มีบัตรเครดิต</div>`}
  `;

  content.onclick = onCreditCardsClick;
}

async function onCreditCardsClick(e) {
  if (e.target.closest('[data-action="add-card"]')) return openCardModal();

  const editBtn = e.target.closest('[data-action="edit-card"]');
  if (editBtn) {
    const card = state.creditCards.find((c) => String(c.id) === editBtn.dataset.id);
    return openCardModal(card);
  }

  const delBtn = e.target.closest('[data-action="delete-card"]');
  if (delBtn) {
    if (!confirm("ลบบัตรนี้หรือไม่?")) return;
    try {
      await api.creditCards.remove(delBtn.dataset.id);
      toast("ลบบัตรแล้ว", "success");
      await renderCreditCards();
    } catch (err) {
      toast(err.message, "error");
    }
  }
}

function openCardModal(card = null) {
  const isEdit = !!card;
  openModal(`
    <h3>${isEdit ? "แก้ไขบัตรเครดิต" : "เพิ่มบัตรเครดิต"}</h3>
    <form id="cardForm">
      <div class="field">
        <label>ชื่อบัตร</label>
        <input id="cardName" value="${esc(card ? card.name : "")}" required placeholder="เช่น KBank Platinum" />
      </div>
      <div class="field-row">
        <div class="field">
          <label>ธนาคาร</label>
          <input id="cardBank" value="${esc(card ? card.bank : "")}" />
        </div>
        <div class="field">
          <label>เลข 4 ตัวท้าย</label>
          <input id="cardLast4" maxlength="4" value="${esc(card ? card.last4 : "")}" />
        </div>
      </div>
      <div class="field-row">
        <div class="field">
          <label>วงเงิน</label>
          <input id="cardLimit" type="number" step="0.01" min="0" value="${card && card.credit_limit != null ? card.credit_limit : ""}" />
        </div>
        <div class="field">
          <label>สีบัตร</label>
          <input id="cardColor" type="color" value="${card ? card.color : "#6366f1"}" />
        </div>
      </div>
      <div class="field-row">
        <div class="field">
          <label>วันสรุปยอด (statement day)</label>
          <input id="cardStatementDay" type="number" min="1" max="31" value="${card && card.statement_day != null ? card.statement_day : ""}" />
        </div>
        <div class="field">
          <label>วันครบกำหนดชำระ</label>
          <input id="cardDueDay" type="number" min="1" max="31" value="${card && card.due_day != null ? card.due_day : ""}" />
        </div>
      </div>
      <div class="modal-footer">
        <button type="button" class="ghost" data-action="close-modal">ยกเลิก</button>
        <button type="submit" class="primary">บันทึก</button>
      </div>
    </form>
  `);

  document.getElementById("modalHost").onclick = (e) => {
    if (e.target.closest('[data-action="close-modal"]')) closeModal();
  };
  document.getElementById("cardForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const payload = {
      name: document.getElementById("cardName").value.trim(),
      bank: document.getElementById("cardBank").value.trim(),
      last4: document.getElementById("cardLast4").value.trim(),
      credit_limit: document.getElementById("cardLimit").value ? parseFloat(document.getElementById("cardLimit").value) : null,
      statement_day: document.getElementById("cardStatementDay").value ? parseInt(document.getElementById("cardStatementDay").value, 10) : null,
      due_day: document.getElementById("cardDueDay").value ? parseInt(document.getElementById("cardDueDay").value, 10) : null,
      color: document.getElementById("cardColor").value,
    };
    if (isEdit) payload.is_active = true;
    try {
      if (isEdit) await api.creditCards.update(card.id, payload);
      else await api.creditCards.create(payload);
      toast("บันทึกสำเร็จ", "success");
      closeModal();
      await renderCreditCards();
    } catch (err) {
      toast(err.message, "error");
    }
  });
}

// ================= Loans / debtors =================
async function renderLoans() {
  const loans = await api.loans.list();
  const content = document.getElementById("pageContent");
  const activeLoans = loans.filter((l) => l.status === "active");
  const completedLoans = loans.filter((l) => l.status === "completed");
  const totalOutstanding = activeLoans.reduce((sum, l) => sum + l.remaining_balance, 0);

  content.innerHTML = `
    <div class="main-header">
      <h2>ยืมเงิน / ลูกหนี้</h2>
      <button class="primary" data-action="add-loan">+ บันทึกการให้ยืมเงิน</button>
    </div>
    <div class="kpi-grid">
      <div class="kpi-card"><div class="label">ลูกหนี้ที่ยังค้างอยู่</div><div class="value">${activeLoans.length} ราย</div></div>
      <div class="kpi-card"><div class="label">ยอดคงค้างรวม</div><div class="value warning">฿${fmtMoney(totalOutstanding)}</div></div>
    </div>

    <div class="panel">
      <h3>กำลังค้างชำระ</h3>
      ${activeLoans.length ? activeLoans.map(renderLoanCard).join("") : `<div class="empty-state">ไม่มีลูกหนี้ค้างชำระ</div>`}
    </div>

    ${completedLoans.length ? `
    <div class="panel">
      <h3>ชำระครบแล้ว</h3>
      ${completedLoans.map(renderLoanCard).join("")}
    </div>` : ""}
  `;

  content.onclick = onLoansClick;
}

function renderLoanCard(loan) {
  const pct = loan.principal_amount > 0 ? Math.min(100, (loan.paid_total / loan.principal_amount) * 100) : 0;
  return `
    <div class="panel" style="margin-bottom:0.8rem; background: var(--bg-elevated);">
      <div class="main-header" style="margin-bottom:0.5rem;">
        <div>
          <strong>${esc(loan.borrower_name)}</strong>
          <span class="badge ${loan.status}">${loan.status === "active" ? "ค้างชำระ" : "ชำระครบ"}</span>
          <div style="color:var(--text-dim); font-size:0.8rem; margin-top:0.2rem;">
            ${esc(REPAYMENT_TYPE_LABEL[loan.repayment_type])}
            ${loan.item_description ? ` — ${esc(loan.item_description)}` : ""}
            · ให้ยืมเมื่อ ${fmtDate(loan.loan_date)}
            ${loan.installment_amount ? ` · งวดละ ฿${fmtMoney(loan.installment_amount)}${loan.installment_count ? ` (${loan.installment_count} งวด)` : ""}` : ""}
          </div>
        </div>
        <div class="actions-cell">
          ${loan.status === "active" ? `<button class="small primary" data-action="pay-loan" data-id="${loan.id}">รับชำระ</button>` : ""}
          <button class="small" data-action="edit-loan" data-id="${loan.id}">แก้ไข</button>
          <button class="small danger" data-action="delete-loan" data-id="${loan.id}">ลบ</button>
        </div>
      </div>
      <div style="font-size:0.88rem;">
        ให้ยืม ฿${fmtMoney(loan.principal_amount)} · รับคืนแล้ว ฿${fmtMoney(loan.paid_total)} · คงเหลือ <strong>฿${fmtMoney(loan.remaining_balance)}</strong>
      </div>
      <div class="progress-bar"><div style="width:${pct}%"></div></div>
    </div>
  `;
}

async function onLoansClick(e) {
  if (e.target.closest('[data-action="add-loan"]')) return openLoanModal();

  const editBtn = e.target.closest('[data-action="edit-loan"]');
  if (editBtn) {
    const loans = await api.loans.list();
    return openLoanModal(loans.find((l) => String(l.id) === editBtn.dataset.id));
  }

  const delBtn = e.target.closest('[data-action="delete-loan"]');
  if (delBtn) {
    if (!confirm("ลบรายการยืมเงินนี้หรือไม่? (ประวัติการชำระจะถูกลบด้วย)")) return;
    try {
      await api.loans.remove(delBtn.dataset.id);
      toast("ลบแล้ว", "success");
      await renderLoans();
    } catch (err) {
      toast(err.message, "error");
    }
    return;
  }

  const payBtn = e.target.closest('[data-action="pay-loan"]');
  if (payBtn) {
    const loans = await api.loans.list();
    return openLoanPaymentModal(loans.find((l) => String(l.id) === payBtn.dataset.id));
  }
}

function openLoanModal(loan = null) {
  const isEdit = !!loan;
  openModal(`
    <h3>${isEdit ? "แก้ไขรายการยืมเงิน" : "บันทึกการให้ยืมเงิน"}</h3>
    <form id="loanForm">
      <div class="field">
        <label>ชื่อผู้ยืม (ลูกหนี้)</label>
        <input id="loanBorrower" value="${esc(loan ? loan.borrower_name : "")}" required />
      </div>
      <div class="field-row">
        <div class="field">
          <label>จำนวนเงินที่ให้ยืม</label>
          <input id="loanPrincipal" type="number" step="0.01" min="0.01" value="${loan ? loan.principal_amount : ""}" required />
        </div>
        <div class="field">
          <label>วันที่ให้ยืม</label>
          <input id="loanDate" type="date" value="${loan ? loan.loan_date : todayISO()}" required />
        </div>
      </div>
      <div class="field">
        <label>รูปแบบการคืนเงิน</label>
        <select id="loanType">
          <option value="cash" ${loan?.repayment_type === "cash" ? "selected" : ""}>เงินสด (ก้อนเดียว)</option>
          <option value="monthly_installment" ${loan?.repayment_type === "monthly_installment" ? "selected" : ""}>ผ่อนรายเดือน</option>
          <option value="product_installment" ${loan?.repayment_type === "product_installment" ? "selected" : ""}>ผ่อนสินค้า</option>
        </select>
      </div>
      <div class="field" id="loanItemField" style="display:${loan?.repayment_type === "product_installment" ? "block" : "none"}">
        <label>รายละเอียดสินค้า</label>
        <input id="loanItem" value="${esc(loan ? loan.item_description : "")}" placeholder="เช่น มือถือ iPhone" />
      </div>
      <div class="field-row" id="loanInstallmentFields" style="display:${loan && loan.repayment_type !== "cash" ? "flex" : "none"}">
        <div class="field">
          <label>ยอดผ่อนต่องวด</label>
          <input id="loanInstallmentAmount" type="number" step="0.01" min="0" value="${loan && loan.installment_amount != null ? loan.installment_amount : ""}" />
        </div>
        <div class="field">
          <label>จำนวนงวด</label>
          <input id="loanInstallmentCount" type="number" min="1" value="${loan && loan.installment_count != null ? loan.installment_count : ""}" />
        </div>
        <div class="field">
          <label>ครบกำหนดทุกวันที่</label>
          <input id="loanDueDay" type="number" min="1" max="31" value="${loan && loan.due_day != null ? loan.due_day : ""}" />
        </div>
      </div>
      <div class="field">
        <label>หมายเหตุ</label>
        <input id="loanNotes" value="${esc(loan ? loan.notes : "")}" />
      </div>
      <div class="modal-footer">
        <button type="button" class="ghost" data-action="close-modal">ยกเลิก</button>
        <button type="submit" class="primary">บันทึก</button>
      </div>
    </form>
  `);

  document.getElementById("loanType").addEventListener("change", (e) => {
    document.getElementById("loanItemField").style.display = e.target.value === "product_installment" ? "block" : "none";
    document.getElementById("loanInstallmentFields").style.display = e.target.value === "cash" ? "none" : "flex";
  });
  document.getElementById("modalHost").onclick = (e) => {
    if (e.target.closest('[data-action="close-modal"]')) closeModal();
  };
  document.getElementById("loanForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const repaymentType = document.getElementById("loanType").value;
    const payload = {
      borrower_name: document.getElementById("loanBorrower").value.trim(),
      principal_amount: parseFloat(document.getElementById("loanPrincipal").value),
      loan_date: document.getElementById("loanDate").value,
      repayment_type: repaymentType,
      item_description: repaymentType === "product_installment" ? document.getElementById("loanItem").value.trim() : "",
      installment_amount: repaymentType !== "cash" && document.getElementById("loanInstallmentAmount").value
        ? parseFloat(document.getElementById("loanInstallmentAmount").value) : null,
      installment_count: repaymentType !== "cash" && document.getElementById("loanInstallmentCount").value
        ? parseInt(document.getElementById("loanInstallmentCount").value, 10) : null,
      due_day: repaymentType !== "cash" && document.getElementById("loanDueDay").value
        ? parseInt(document.getElementById("loanDueDay").value, 10) : null,
      notes: document.getElementById("loanNotes").value.trim(),
    };
    try {
      if (isEdit) await api.loans.update(loan.id, payload);
      else await api.loans.create(payload);
      toast("บันทึกสำเร็จ", "success");
      closeModal();
      await renderLoans();
    } catch (err) {
      toast(err.message, "error");
    }
  });
}

function openLoanPaymentModal(loan) {
  openModal(`
    <h3>รับชำระจาก ${esc(loan.borrower_name)}</h3>
    <p style="color:var(--text-dim); font-size:0.85rem;">คงเหลือ ฿${fmtMoney(loan.remaining_balance)}</p>
    <form id="loanPaymentForm">
      <div class="field-row">
        <div class="field">
          <label>จำนวนเงินที่รับ</label>
          <input id="paymentAmount" type="number" step="0.01" min="0.01" max="${loan.remaining_balance}" value="${loan.installment_amount || loan.remaining_balance}" required />
        </div>
        <div class="field">
          <label>วันที่รับชำระ</label>
          <input id="paymentDate" type="date" value="${todayISO()}" required />
        </div>
      </div>
      <div class="field">
        <label>หมายเหตุ</label>
        <input id="paymentNotes" placeholder="เช่น งวดที่ 2" />
      </div>
      <div class="modal-footer">
        <button type="button" class="ghost" data-action="close-modal">ยกเลิก</button>
        <button type="submit" class="primary">บันทึกการรับชำระ</button>
      </div>
    </form>
  `);

  document.getElementById("modalHost").onclick = (e) => {
    if (e.target.closest('[data-action="close-modal"]')) closeModal();
  };
  document.getElementById("loanPaymentForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const payload = {
      amount: parseFloat(document.getElementById("paymentAmount").value),
      payment_date: document.getElementById("paymentDate").value,
      notes: document.getElementById("paymentNotes").value.trim(),
    };
    try {
      await api.loans.addPayment(loan.id, payload);
      toast("บันทึกการรับชำระแล้ว", "success");
      closeModal();
      await renderLoans();
    } catch (err) {
      toast(err.message, "error");
    }
  });
}

document.addEventListener("DOMContentLoaded", boot);
