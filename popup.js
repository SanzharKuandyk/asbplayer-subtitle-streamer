const statusEl = document.getElementById('status');
const statusTextEl = document.getElementById('status-text');
const enabledEl = document.getElementById('enabled');
const transportTypeEl = document.getElementById('transportType');
const wsUrlEl = document.getElementById('wsUrl');
const httpUrlEl = document.getElementById('httpUrl');
const nativeHostEl = document.getElementById('nativeHost');
const saveBtn = document.getElementById('saveBtn');
const testBtn = document.getElementById('testBtn');
const noticeEl = document.getElementById('notice');

function formSettings() {
  return {
    enabled: enabledEl.checked,
    transportType: transportTypeEl.value,
    wsUrl: wsUrlEl.value.trim(),
    httpUrl: httpUrlEl.value.trim(),
    nativeHost: nativeHostEl.value.trim()
  };
}

function fillForm(settings) {
  enabledEl.checked = settings.enabled;
  transportTypeEl.value = settings.transportType;
  wsUrlEl.value = settings.wsUrl;
  httpUrlEl.value = settings.httpUrl;
  nativeHostEl.value = settings.nativeHost;
  showConfig();
}

function showConfig() {
  for (const kind of ['websocket', 'http', 'native']) {
    document.getElementById(`config-${kind}`).classList.toggle('active', transportTypeEl.value === kind);
  }
}

function notice(message, isError = false) {
  noticeEl.textContent = message;
  noticeEl.style.color = isError ? '#b3261e' : '#188038';
}

async function status() {
  try {
    const result = await chrome.runtime.sendMessage({ type: 'getStatus' });
    if (result.error) notice(result.error, true);
    else if (result.droppedEvents) notice(`${result.droppedEvents} subtitle event(s) could not be sent.`, true);
    statusEl.className = `status ${result.status}`;
    statusTextEl.textContent = result.status === 'connected' ? 'Connected' :
      result.status === 'connecting' ? 'Connecting...' : 'Disconnected';
  } catch (error) { notice(error.message, true); }
}

async function save() {
  const response = await chrome.runtime.sendMessage({ type: 'updateSettings', settings: formSettings() });
  if (!response?.success) throw new Error(response?.error || 'Could not save settings.');
  notice('Settings saved.');
  await status();
}

async function run(button, action) {
  saveBtn.disabled = testBtn.disabled = true;
  try { await action(); }
  catch (error) { notice(error.message, true); }
  finally { saveBtn.disabled = testBtn.disabled = false; }
}

async function init() {
  try {
    const result = await chrome.runtime.sendMessage({ type: 'getStatus' });
    if (result?.settings) fillForm(result.settings);
    await status();
  } catch (error) { notice(error.message, true); }
  transportTypeEl.addEventListener('change', showConfig);
  enabledEl.addEventListener('change', () => void run(saveBtn, save));
  saveBtn.addEventListener('click', () => void run(saveBtn, save));
  testBtn.addEventListener('click', () => void run(testBtn, async () => {
    await save();
    const result = await chrome.runtime.sendMessage({ type: 'testConnection' });
    if (!result?.success) throw new Error(result?.error || 'Could not connect.');
    notice('Connection confirmed.');
    await status();
  }));
  setInterval(status, 2000);
}

void init();
