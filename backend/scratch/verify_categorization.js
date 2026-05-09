const { analyzeEmailIntelligence } = require('../src/utils/classifier');
// Mocking requestGroq would be complex, so let's just test the rule-based logic and check the logic flow.

const testEmails = [
  {
    subject: 'Your invoice for May 2026',
    snippet: 'Please find attached the invoice for your subscription.',
    sender: 'billing@service.com',
    expected: 'finance'
  },
  {
    subject: 'Deployment successful: production',
    snippet: 'The latest build has been deployed to the production environment.',
    sender: 'ci@github.com',
    expected: 'developer'
  },
  {
    subject: 'New friend request on LinkedIn',
    snippet: 'Someone wants to connect with you.',
    sender: 'notifications@linkedin.com',
    expected: 'social'
  },
  {
    subject: 'Meeting Invitation: Weekly Sync',
    snippet: 'You are invited to a weekly sync meeting.',
    sender: 'manager@company.com',
    expected: 'meetings'
  }
];

console.log('--- Testing Rule-Based Categorization ---');
testEmails.forEach(email => {
  const result = analyzeEmailIntelligence(email);
  console.log(`Subject: ${email.subject}`);
  console.log(`Detected Category: ${result.category} (Expected: ${email.expected})`);
  console.log(`Is Correct: ${result.category === email.expected}`);
  console.log('---');
});
