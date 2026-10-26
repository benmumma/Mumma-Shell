export {
  createAgentInboxApi, inboxPath,
  type AgentInboxApi, type AgentInboxApiOptions, type AnswerResult, type InboxRef,
} from './api';
export {
  badgeCount, totalBadge, whenLabel, undoRemainingMs, answerLine, followThroughLine, blockText,
  progressFraction, classifyInboxLink, snoozeOptions,
} from './logic';
export {
  useAgentInboxApi, useAgentInboxes, useAgentInbox, INBOX_POLL_MS,
  type UseAgentInboxesResult, type UseAgentInboxResult,
} from './hooks';
export { AgentInboxPanel, type AgentInboxPanelProps } from './AgentInboxPanel';
export { AgentInboxButton, type AgentInboxButtonProps, type AgentInboxTriggerProps } from './AgentInboxButton';
export { aiVar, colorsFrom, useInboxColors, type InboxColors } from './theme';
export type {
  InboxItem, InboxItemKind, InboxBlock, InboxLink, InboxOption, InboxAnswer, InboxMessage, InboxProfile,
  InboxSummary, InboxPage, InboxNote, InboxNotes, InboxResult, FollowThrough,
} from './types';
