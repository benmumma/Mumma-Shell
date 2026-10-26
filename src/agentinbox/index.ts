export {
  createAgentInboxApi, inboxPath,
  type AgentInboxApi, type AgentInboxApiOptions, type AnswerResult, type InboxRef,
} from './api';
export {
  badgeCount, totalBadge, hasNew, whenLabel, undoRemainingMs, answerLine, followThroughLine, blockText,
  progressFraction, scheduleRows, classifyInboxLink, snoozeOptions, statusSummary, agoLabel, historyDays, kindLabel, historyStatus,
  behaviorLine, composerHint, canActNow, awaitingReply, AWAIT_REPLY_MS,
} from './logic';
export {
  useAgentInboxApi, useAgentInboxes, useAgentInbox, INBOX_POLL_MS, AWAIT_POLL_MS,
  type UseAgentInboxesResult, type UseAgentInboxResult, type InboxHistoryState,
} from './hooks';
export { AgentInboxPanel, CardTypePreview, type AgentInboxPanelProps } from './AgentInboxPanel';
export { CARD_TYPES, cardTypeInfo, type CardType, type CardTypeInfo } from './cardTypes';
export { AgentInboxButton, type AgentInboxButtonProps, type AgentInboxTriggerProps } from './AgentInboxButton';
export { AgentInboxDock, DOCK_BREAKPOINT_PX, DOCK_WIDTH, type AgentInboxDockProps } from './AgentInboxDock';
export { aiVar, colorsFrom, useInboxColors, type InboxColors } from './theme';
export type {
  InboxItem, InboxItemKind, InboxBlock, InboxLink, InboxOption, InboxAnswer, InboxMessage, InboxProfile,
  InboxSummary, InboxPage, InboxNote, InboxNotes, InboxResult, FollowThrough, InboxHistoryPage, InboxHistoryKind,
  InboxBehavior,
} from './types';
