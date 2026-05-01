const { matchesImportantContact } = require('../utils/contactUtils');
const { getUserSocketRoom } = require('../utils/socketRooms');
const notificationEmitter = require('../utils/eventEmitter');
const { pushEvent } = require('../routes/sse');
const { sendPushNotification } = require('./pushService');

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
    // Send browser push for high priority emails
    sendPushNotification(user.id, {
      title: `Priority: ${email.subject}`,
      body: `From: ${email.senderName || email.sender}\n${email.snippet}`,
      url: `/emails?id=${email.id}`
    });
  });
}

function emitFollowUpNotifications(io, userId, followUps = []) {
  if (!followUps.length) {
    return;
  }

  io.to(getUserSocketRoom(userId)).emit('follow-up-ready', followUps);
  pushEvent(userId, 'follow_up', followUps);

  // Send browser push for follow-ups
  if (followUps.length > 0) {
    const count = followUps.length;
    sendPushNotification(userId, {
      title: `${count} Follow-ups Ready`,
      body: `You have ${count} pending follow-ups that need your attention.`,
      url: '/waiting'
    });
  }
}

module.exports = {
  emitEmailNotifications,
  emitFollowUpNotifications,
  getImportantEmails,
};
