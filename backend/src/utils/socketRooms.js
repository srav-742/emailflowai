function getUserSocketRoom(userId) {
  return `user:${userId}`;
}

module.exports = { getUserSocketRoom };
