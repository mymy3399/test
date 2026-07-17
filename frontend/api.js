const API_BASE = "/api";
const TOKEN_KEY = "expense-token-v1";

let _token = localStorage.getItem(TOKEN_KEY) || null;

class APIError extends Error {
  constructor(message, status) {
    super(message);
    this.status = status;
  }
}

function setToken(token) {
  _token = token;
  if (token) localStorage.setItem(TOKEN_KEY, token);
  else localStorage.removeItem(TOKEN_KEY);
}

function getToken() {
  return _token;
}

async function _call(method, path, body, isForm) {
  const headers = {};
  if (_token) headers["Authorization"] = `Bearer ${_token}`;
  if (body && !isForm) headers["Content-Type"] = "application/json";

  let resp;
  try {
    resp = await fetch(`${API_BASE}${path}`, {
      method,
      headers,
      body: body ? (isForm ? body : JSON.stringify(body)) : undefined,
    });
  } catch (err) {
    throw new APIError("Backend unreachable", 0);
  }

  if (resp.status === 401) {
    setToken(null);
    throw new APIError("Unauthorized", 401);
  }

  if (!resp.ok) {
    let detail = resp.statusText;
    try {
      const data = await resp.json();
      detail = data.detail || detail;
    } catch (_) {}
    throw new APIError(detail, resp.status);
  }

  if (resp.status === 204) return null;
  return resp.json();
}

const auth = {
  async login(username, password) {
    const form = new URLSearchParams();
    form.set("username", username);
    form.set("password", password);
    const data = await _call("POST", "/auth/token", form, true);
    setToken(data.access_token);
    return data.user;
  },
  async me() {
    return _call("GET", "/auth/me");
  },
  logout() {
    setToken(null);
  },
};

const transactions = {
  list: (params = {}) => _call("GET", `/transactions${qs(params)}`),
  create: (payload) => _call("POST", "/transactions", payload),
  update: (id, payload) => _call("PUT", `/transactions/${id}`, payload),
  remove: (id) => _call("DELETE", `/transactions/${id}`),
  summary: (period) => _call("GET", `/transactions/summary${qs({ period })}`),
};

const creditCards = {
  list: () => _call("GET", "/credit-cards"),
  create: (payload) => _call("POST", "/credit-cards", payload),
  update: (id, payload) => _call("PUT", `/credit-cards/${id}`, payload),
  remove: (id) => _call("DELETE", `/credit-cards/${id}`),
  summary: (id) => _call("GET", `/credit-cards/${id}/summary`),
};

const recurringBills = {
  list: () => _call("GET", "/recurring-bills"),
  create: (payload) => _call("POST", "/recurring-bills", payload),
  update: (id, payload) => _call("PUT", `/recurring-bills/${id}`, payload),
  remove: (id) => _call("DELETE", `/recurring-bills/${id}`),
  generate: () => _call("POST", "/recurring-bills/generate"),
  instances: (status) => _call("GET", `/recurring-bills/instances${qs({ status })}`),
  pay: (id) => _call("POST", `/recurring-bills/instances/${id}/pay`),
  skip: (id) => _call("POST", `/recurring-bills/instances/${id}/skip`),
};

const loans = {
  list: (status) => _call("GET", `/loans${qs({ status })}`),
  create: (payload) => _call("POST", "/loans", payload),
  update: (id, payload) => _call("PUT", `/loans/${id}`, payload),
  remove: (id) => _call("DELETE", `/loans/${id}`),
  payments: (id) => _call("GET", `/loans/${id}/payments`),
  addPayment: (id, payload) => _call("POST", `/loans/${id}/payments`, payload),
};

const dashboard = {
  summary: () => _call("GET", "/dashboard/summary"),
};

function qs(params) {
  const entries = Object.entries(params).filter(([, v]) => v !== undefined && v !== null && v !== "");
  if (!entries.length) return "";
  return "?" + new URLSearchParams(entries).toString();
}

async function checkHealth() {
  try {
    const resp = await fetch("/health");
    return resp.ok;
  } catch (_) {
    return false;
  }
}

window.api = {
  auth,
  transactions,
  creditCards,
  recurringBills,
  loans,
  dashboard,
  checkHealth,
  getToken,
  APIError,
};
