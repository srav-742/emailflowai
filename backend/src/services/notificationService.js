const { matchesImportantContact } = require('../utils/contactUtils');
const { getUserSocketRoom } = require('../utils/socketRooms');

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
  if (newEmails.length > 0) {
    io.to(room).emit('new-emails', newEmails);
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
}

module.exports = {
  emitEmailNotifications,
  emitFollowUpNotifications,
  getImportantEmails,
};
