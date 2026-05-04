// src/options.js
var input = document.getElementById("input-apikey");
var btnSave = document.getElementById("btn-save");
var btnClear = document.getElementById("btn-clear");
var statusEl = document.getElementById("status-msg");
function showMsg(text, isError = false) {
  statusEl.textContent = text;
  statusEl.className = isError ? "error" : "";
}
function clearMsg() {
  statusEl.textContent = "";
}
btnSave?.addEventListener("click", async () => {
  const key = input.value.trim();
  if (!key) {
    showMsg("Please enter an API key.", true);
    return;
  }
  btnSave.disabled = true;
  clearMsg();
  try {
    await chrome.runtime.sendMessage({ type: "SET_API_KEY", key });
    showMsg("API key saved.");
    input.value = "";
  } catch (err) {
    showMsg(err.message ?? "Failed to save key.", true);
  } finally {
    btnSave.disabled = false;
  }
});
btnClear?.addEventListener("click", async () => {
  btnClear.disabled = true;
  clearMsg();
  try {
    await chrome.runtime.sendMessage({ type: "CLEAR_API_KEY" });
    showMsg("API key removed.");
  } catch (err) {
    showMsg(err.message ?? "Failed to remove key.", true);
  } finally {
    btnClear.disabled = false;
  }
});
