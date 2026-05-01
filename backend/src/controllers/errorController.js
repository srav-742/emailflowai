const prisma = require('../config/database');

const logClientError = async (req, res) => {
  try {
    const { 
      error_message, 
      error_stack, 
      component_name, 
      page_url, 
      browser_info 
    } = req.body;

    const userId = req.user?.id || null;

    const log = await prisma.clientErrorLog.create({
      data: {
        userId,
        errorMessage: error_message || 'Unknown error',
        errorStack: error_stack,
        componentName: component_name,
        pageUrl: page_url,
        browserInfo: browser_info || {},
      }
    });

    res.status(201).json({ success: true, logId: log.id });
  } catch (error) {
    console.error('[ErrorController] Failed to log client error:', error.message);
    res.status(500).json({ error: 'Failed to log error' });
  }
};

module.exports = { logClientError };
