const { ConfidentialClientApplication } = require('@azure/msal-node');

const msalConfig = {
  auth: {
    clientId: process.env.AZURE_CLIENT_ID || 'dummy_id',
    clientSecret: process.env.AZURE_CLIENT_SECRET || 'dummy_secret',
    authority: `https://login.microsoftonline.com/common`,
  },
  system: {
    loggerOptions: {
      loggerCallback(loglevel, message, containsPii) {
        if (!containsPii) console.log(message);
      },
      piiLoggingEnabled: false,
      logLevel: 3, // Info
    }
  }
};

const msalClient = new ConfidentialClientApplication(msalConfig);

module.exports = { msalClient };
