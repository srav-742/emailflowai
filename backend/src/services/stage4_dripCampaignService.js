/**
 * Stage 4: Smart Follow-up Sequences (Drip Campaigns)
 * Isolated module to prevent modifying existing codes.
 */
class DripCampaignService {
  /**
   * Registers a new automated drip sequence for an outgoing email
   */
  static async registerSequence(userId, initialEmailId, sequenceSteps) {
    console.log(`[Stage 4] Registering drip sequence for email: ${initialEmailId}`);
    
    const sequence = {
      id: `seq_${Date.now()}`,
      userId,
      rootEmailId: initialEmailId,
      status: 'active',
      steps: sequenceSteps.map((step, index) => ({
        stepIndex: index + 1,
        delayDays: step.delayDays,
        template: step.template,
        status: 'pending'
      }))
    };
    
    return sequence;
  }

  /**
   * Evaluates if a sequence should continue or pause (e.g. if recipient replied)
   */
  static async evaluateSequence(sequenceId, threadState) {
    console.log(`[Stage 4] Evaluating sequence state: ${sequenceId}`);
    
    if (threadState.hasReply) {
      console.log(`[Stage 4] Reply detected! Pausing sequence ${sequenceId} to prevent automated spam.`);
      return { status: 'paused', reason: 'recipient_replied' };
    }
    
    return { status: 'active', nextAction: 'send_step_2' };
  }
}

module.exports = DripCampaignService;
