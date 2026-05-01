const { matchesImportantContact } = require('../utils/contactUtils');
const { getUserSocketRoom } = require('../utils/socketRooms');
const notificationEmitter = require('../utils/eventEmitter');
const { pushEvent } = require('../routes/sse');

function getImportantEmails(newEmails = [], user = {}) {
  const importantContacts = Array.isArray(user.importantContacts) ? user.importantContacts : [];

  return newEmails.filter((email) => {
    if (email.isSent) {
      return false;
    }

    return email.priority === 'high' || matchesImportantContact(email.sender, importantContacts);
  });
}

function emitEmailNotifications(io, user, newEmails = []) {
  const room = getUserSocketRoom(user.id);
  
  // SSE Bridge
  notificationEmitter.emit('new-emails', { userId: user.id, emails: newEmails });

  if (newEmails.length > 0) {
    io.to(room).emit('new-emails', newEmails);
    // Push via SSE
    pushEvent(user.id, 'new_email', newEmails);
  }

  const importantEmails = getImportantEmails(newEmails, user);
  importantEmails.forEach((email) => {
    io.to(room).emit('important-email', email);
  });
}

function emitFollowUpNotifications(io, userId, followUps = []) {
  if (!followUps.length) {
    return;
  }

  io.to(getUserSocketRoom(userId)).emit('follow-up-ready', followUps);
  pushEvent(userId, 'follow_up', followUps);
}

module.exports = {
  emitEmailNotifications,
  emitFollowUpNotifications,
  getImportantEmails,
};
