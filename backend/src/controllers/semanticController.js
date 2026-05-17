const { getSemanticStatus, indexUserEmails, searchEmails } = require('../services/semanticSearchService');

const getStatus = async (req, res) => {
  const status = await getSemanticStatus(req.user.id);
  res.json(status);
};

const runIndex = async (req, res) => {
  const status = await indexUserEmails(req.user.id, req.body || {});
  res.json({
    success: true,
    status,
  });
};

const runSearch = async (req, res) => {
  const query = req.query.q || req.body?.query || '';
  const results = await searchEmails(req.user.id, query, {
    ...req.query,
    ...req.body,
  });

  res.json(results);
};

module.exports = {
  getStatus,
  runIndex,
  runSearch,
};
