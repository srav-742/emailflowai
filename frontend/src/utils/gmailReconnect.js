export const GMAIL_RECONNECT_STORAGE_KEY = 'emailflow.gmailReconnect';
export const GMAIL_RECONNECT_EVENT = 'emailflow:gmailReconnect';

function normalizeReconnectPayload(payload = {}) {
  return {
    required: Boolean(payload.required),
    message: payload.message || 'Google access needs to be reconnected.',
    email: payload.email || null,
    source: payload.source || 'runtime',
    timestamp: payload.timestamp || new Date().toISOString(),
  };
}

export function readStoredReconnectState() {
  try {
    const raw = window.localStorage.getItem(GMAIL_RECONNECT_STORAGE_KEY);
    if (!raw) {
      return { required: false, message: '', email: null, source: null, timestamp: null };
    }

    return normalizeReconnectPayload(JSON.parse(raw));
  } catch (error) {
    console.warn('[GmailReconnect] Failed to read stored reconnect state:', error);
    return { required: false, message: '', email: null, source: null, timestamp: null };
  }
}

function writeStoredReconnectState(payload) {
  try {
    window.localStorage.setItem(GMAIL_RECONNECT_STORAGE_KEY, JSON.stringify(payload));
  } catch (error) {
    console.warn('[GmailReconnect] Failed to persist reconnect state:', error);
  }
}

function dispatchReconnectEvent(payload) {
  window.dispatchEvent(new CustomEvent(GMAIL_RECONNECT_EVENT, { detail: payload }));
}

export function setGmailReconnectState(payload = {}) {
  const nextState = normalizeReconnectPayload({ ...payload, required: true });
  writeStoredReconnectState(nextState);
  dispatchReconnectEvent(nextState);
  return nextState;
}

export function clearGmailReconnectState() {
  const cleared = { required: false, message: '', email: null, source: null, timestamp: null };

  try {
    window.localStorage.removeItem(GMAIL_RECONNECT_STORAGE_KEY);
  } catch (error) {
    console.warn('[GmailReconnect] Failed to clear reconnect state:', error);
  }

  dispatchReconnectEvent(cleared);
  return cleared;
}

export function isGmailReconnectError(error) {
  const values = [
    error?.message,
    error?.response?.data?.error,
    error?.response?.data?.details,
    error?.response?.data?.message,
  ]
    .filter(Boolean)
    .map((entry) => String(entry).toLowerCase());

  return values.some((value) =>
    value.includes('please reconnect gmail') ||
    value.includes('google access has expired or been revoked') ||
    value.includes('no connected gmail account found')
  );
}
