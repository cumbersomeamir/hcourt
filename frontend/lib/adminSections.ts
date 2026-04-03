export type AdminSectionId = 'overview' | 'data-map' | 'chat-functions';

export type AdminSectionLink = {
  id: AdminSectionId;
  href: string;
  eyebrow: string;
  label: string;
  description: string;
  borderClass: string;
  textClass: string;
};

export type AdminChatFunctionItem = {
  name: string;
  summary: string;
  detail: string;
};

export type AdminChatFunctionSection = {
  id: string;
  label: string;
  description: string;
  items: AdminChatFunctionItem[];
};

export const adminSectionLinks: AdminSectionLink[] = [
  {
    id: 'overview',
    href: '/admin',
    eyebrow: 'Start',
    label: 'Admin Home',
    description: 'Jump to every admin page from one place.',
    borderClass: 'border-slate-600/60',
    textClass: 'text-slate-100',
  },
  {
    id: 'data-map',
    href: '/admin/data-map',
    eyebrow: 'Storage',
    label: 'Data Map',
    description: 'Collections, feature mapping, and lawyer profile setup.',
    borderClass: 'border-cyan-400/20',
    textClass: 'text-cyan-100',
  },
  {
    id: 'chat-functions',
    href: '/admin/chat-functions',
    eyebrow: 'AI',
    label: 'Chat Functions',
    description: 'See the AI chat functions grouped by response category.',
    borderClass: 'border-blue-400/20',
    textClass: 'text-blue-100',
  },
];

export const aiChatFunctionSections: AdminChatFunctionSection[] = [
  {
    id: 'orchestration',
    label: 'Orchestration',
    description: 'Core request routing and response composition inside AI chat.',
    items: [
      {
        name: 'buildPlanner',
        summary: 'Turns the lawyer’s natural-language request into AI tool calls.',
        detail:
          'Uses GPT-5 Nano plus fallback rules to decide whether the request needs status, tracking, cause list, alerts, web diary, or courtroom-transfer handling.',
      },
      {
        name: 'writeFinalAnswer',
        summary: 'Writes the final concise answer from tool results only.',
        detail:
          'Keeps the reply grounded in the retrieved facts and prevents the assistant from inventing court data when a lookup fails or returns partial data.',
      },
    ],
  },
  {
    id: 'tracking',
    label: 'Tracking And Saved Cases',
    description: 'Functions that read or update the lawyer’s saved case context.',
    items: [
      {
        name: 'get_my_cases',
        summary: 'Lists the currently saved schedule-tracked and order-tracked cases.',
        detail:
          'Reads saved case IDs and tracked order cases from the client session, normalizes them, and exposes that saved context back to AI chat.',
      },
      {
        name: 'track_case',
        summary: 'Adds a case to tracking using a case ID or case type / number / year.',
        detail:
          'Updates local tracking immediately and syncs the saved tracking set to the backend account if the user has a synced account.',
      },
    ],
  },
  {
    id: 'status',
    label: 'Status And Orders',
    description: 'Functions that answer case-status and order/judgment questions.',
    items: [
      {
        name: 'get_case_status',
        summary: 'Loads status for one explicit case or for the user’s tracked cases.',
        detail:
          'Handles direct case lookups through the orders/status source and also supports “status of my cases” by using the saved tracked-case context.',
      },
    ],
  },
  {
    id: 'cause-list-and-diary',
    label: 'Cause List And Diary',
    description: 'Functions that answer list-assignment and court-notice questions.',
    items: [
      {
        name: 'check_cause_list_assignments',
        summary: 'Checks whether the lawyer or chamber aliases appear in the cause list.',
        detail:
          'Searches the selected date across benches using the saved lawyer-profile aliases and returns matching rows when available.',
      },
      {
        name: 'get_web_diary',
        summary: 'Loads web diary notices for a requested date.',
        detail:
          'Fetches the court diary items for the date, stores a snapshot, and returns the top notices for AI summarization.',
      },
    ],
  },
  {
    id: 'board-and-alerts',
    label: 'Board Movement And Alerts',
    description: 'Functions for courtroom movement and change-notification questions.',
    items: [
      {
        name: 'check_courtroom_transfer',
        summary: 'Checks if a courtroom appears to have moved away from a serial or case.',
        detail:
          'Uses the latest live board plus stored court history to compare the current courtroom slot against the reference serial or case.',
      },
      {
        name: 'get_alerts',
        summary: 'Loads relevant alerts for the user’s tracked cases and order trackers.',
        detail:
          'Filters saved notifications down to the lawyer’s tracked case IDs and order-tracking keys so AI chat can summarize only relevant updates.',
      },
    ],
  },
];
