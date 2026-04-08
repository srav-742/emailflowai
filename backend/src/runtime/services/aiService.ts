import { getState, setState } from '../../data/mockData.js';
import { AppError } from '../errors.js';
import type { DraftResult, EmailThread } from '../../types.js';

function getThreadOrThrow(threadId: string) {
  const state = getState();
  const thread = state.threads.find((item) => item.id === threadId);

  if (!thread) {
    throw new AppError('Thread not found.', 404);
  }

  return { state, thread };
}

function buildDraft(thread: EmailThread, instruction: string) {
  const firstName = thread.senderName.split(' ')[0] ?? thread.senderName;
  const guidance = instruction.trim()
    ? `I also tuned this draft to ${instruction.trim().toLowerCase()}. `
    : '';

  return (
    `Hi ${firstName},\n\n` +
    `${guidance}Thanks for the update on "${thread.subject}". ` +
    `I reviewed the thread and I am aligned on the next step: ${thread.actionItems[0] ?? thread.nextActionLabel}. ` +
    `If helpful, I can send the final materials and lock timing today.\n\n` +
    'Best,\nSravy'
  );
}

export function buildMorningBrief() {
  const state = getState();
  const focusCount = state.threads.filter((thread) => thread.category === 'FOCUS_TODAY').length;
  const waitingReply = state.threads.filter((thread) => thread.category === 'WAITING_REPLY').length;
  const urgentSenders = state.threads
    .filter((thread) => thread.priority === 'HIGH')
    .slice(0, 2)
    .map((thread) => thread.senderName)
    .join(' and ');

  return `Good morning. You have ${focusCount} conversations in Focus Today and ${waitingReply} threads waiting on someone else. The highest leverage email pressure is coming from ${urgentSenders || 'your priority queue'}, so start there, clear the fast approvals, and let the newsletters stay quiet until later.`;
}

export function generateDraft(threadId: string, instruction: string) {
  const { state, thread } = getThreadOrThrow(threadId);
  const draftReply = buildDraft(thread, instruction);

  const nextState = structuredClone(state);
  const nextThread = nextState.threads.find((item) => item.id === threadId);

  if (!nextThread) {
    throw new AppError('Thread not found.', 404);
  }

  nextThread.draftReply = draftReply;
  setState(nextState);

  const result: DraftResult = {
    draftReply,
    recommendedTone: thread.recommendedTone,
  };

  return result;
}
