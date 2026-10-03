const DEFAULT_SERVER_URL = "http://localhost:3000";

const titleEl = document.getElementById("tab-title");
const urlEl = document.getElementById("tab-url");
const addBtn = document.getElementById("add-btn");
const statusEl = document.getElementById("status");
const serverInput = document.getElementById("server-url");
const saveBtn = document.getElementById("save-btn");

async function getServerUrl() {
  const { serverUrl } = await chrome.storage.local.get("serverUrl");
  return serverUrl || DEFAULT_SERVER_URL;
}

async function getActiveTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab;
}

async function init() {
  const tab = await getActiveTab();
  titleEl.textContent = tab?.title || "(no title)";
  urlEl.textContent = tab?.url || "";
  serverInput.value = await getServerUrl();

  if (!tab?.url || !/^https?:\/\//.test(tab.url)) {
    addBtn.disabled = true;
    statusEl.textContent = "This page can't be added (not http/https).";
  }
}

addBtn.addEventListener("click", async () => {
  addBtn.disabled = true;
  statusEl.textContent = "Adding…";

  try {
    const tab = await getActiveTab();
    const serverUrl = await getServerUrl();
    const res = await fetch(`${serverUrl}/api/items`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: tab.url }),
    });
    const data = await res.json();

    if (res.ok) {
      statusEl.textContent = `Added (${data.item.status}).`;
    } else if (res.status === 409) {
      statusEl.textContent = "Already added.";
    } else {
      statusEl.textContent = `Error: ${data.error}`;
      addBtn.disabled = false;
    }
  } catch {
    statusEl.textContent = `Couldn't reach ${await getServerUrl()} — is the server running?`;
    addBtn.disabled = false;
  }
});

saveBtn.addEventListener("click", async () => {
  await chrome.storage.local.set({ serverUrl: serverInput.value.trim() || DEFAULT_SERVER_URL });
  statusEl.textContent = "Saved.";
});

init();
