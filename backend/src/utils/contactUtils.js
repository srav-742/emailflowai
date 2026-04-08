function extractEmailAddress(value = '') {
  const match = String(value).match(/<([^>]+)>/);
  if (match?.[1]) {
    return match[1].trim().toLowerCase();
  }

  return String(value).trim().toLowerCase();
}

function formatContactLabel(value = '') {
  const normalized = String(value).trim();
  if (!normalized) {
    return 'Unknown contact';
  }

  const match = normalized.match(/^(.*?)\s*<(.+?)>$/);
  if (match?.[1]) {
    return match[1].replace(/["']/g, '').trim();
  }

  return normalized;
}

function matchesImportantContact(sender = '', importantContacts = []) {
  const senderEmail = extractEmailAddress(sender);

  return importantContacts.some((contact) => {
    const normalized = extractEmailAddress(contact);
    return normalized && normalized === senderEmail;
  });
}

module.exports = {
  extractEmailAddress,
  formatContactLabel,
  matchesImportantContact,
};
