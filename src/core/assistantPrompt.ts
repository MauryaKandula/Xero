import type {
  ChatMessage,
  MemoryFact,
  QuickNoteItem,
  ResponseDepth,
  TimerItem,
  TodoItem,
  XeroSettings,
} from './types';

export const ASSISTANT_PROMPT_VERSION = '2.0.0';

export function buildRuntimeSystemPrompt(params: {
  settings: XeroSettings;
  memories: MemoryFact[];
  responseDepth: ResponseDepth;
  forLiveAudio?: boolean;
}): string {
  const { settings, memories, responseDepth, forLiveAudio = false } = params;
  const assistantName = settings.personalization.assistantName?.trim() || 'XERO';
  const userName = settings.personalization.userName?.trim() || 'User';

  const depthRule =
    responseDepth === 'concise'
      ? 'Response depth is CONCISE: answer in 1-2 short, direct sentences unless details are explicitly requested.'
      : responseDepth === 'detailed'
        ? 'Response depth is DETAILED: provide structured, thorough steps and context while keeping spoken lead-ins crisp.'
        : 'Response depth is BALANCED: lead with the direct answer in 1-2 sentences, then add brief essential details only if helpful.';

  const voiceRule = forLiveAudio
    ? 'Audio Delivery: Speak calmly, warmly, and articulately (composed JARVIS clarity). Keep spoken turns crisp and easy to interrupt. For multi-step explanations, speak the 1-2 sentence headline and place full steps in tools/transcript.'
    : 'Delivery: Answer directly and concisely for a compact floating desktop notch.';

  const memoryBlock =
    settings.ai.memoryEnabled && memories.length > 0
      ? `\nSaved local preferences & facts:\n${memories
          .slice(0, 12)
          .map((m) => `- ${m.fact}`)
          .join('\n')}`
      : '';

  const customBlock = settings.ai.systemPrompt?.trim()
    ? `\nUser custom instructions:\n${settings.ai.systemPrompt.trim()}`
    : '';

  return [
    `[Prompt v${ASSISTANT_PROMPT_VERSION}] You are ${assistantName}, a calm, attentive, female-voiced JARVIS-grade voice and workspace companion for ${userName}.`,
    `Tone preset: ${settings.personalization.personalityTone}.`,
    depthRule,
    voiceRule,
    'Language & Mixed-Language: Match the user language automatically and handle seamless mixed-language turns without awkward switching.',
    'Clarification & Confirmation: Ask one short clarifying question when missing details would materially change an action (for example an empty note or missing timer duration). Never fabricate tool success; report completion only after a tool result confirms the action. Ask confirmation before destructive actions (clearing notes, canceling timers, deleting saved preferences) or saving new persistent preferences.',
    memoryBlock,
    customBlock,
  ]
    .filter(Boolean)
    .join('\n');
}

export interface CatchUpSummary {
  decisions: string[];
  openQuestions: string[];
  nextSteps: string[];
  formattedText: string;
  spokenSummary: string;
}

export function summarizeSessionCatchUp(params: {
  messages: ChatMessage[];
  timers: TimerItem[];
  todos: TodoItem[];
  notes: QuickNoteItem[];
}): CatchUpSummary {
  const { messages, timers, todos, notes } = params;
  const recent = messages.slice(-16);

  const decisions: string[] = [];
  const openQuestions: string[] = [];
  const nextSteps: string[] = [];

  for (const msg of recent) {
    const clean = msg.text.replace(/\s+/g, ' ').trim();
    if (!clean) continue;
    if (msg.actionsApplied && msg.actionsApplied.length > 0) {
      decisions.push(`${msg.actionsApplied.join(', ')}`);
    }
    if (msg.role === 'user' && (clean.endsWith('?') || /^(what|how|why|when|where|which|should|can|could)\b/i.test(clean))) {
      if (!openQuestions.includes(clean)) {
        openQuestions.push(clean);
      }
    }
  }

  for (const t of timers.filter((tm) => tm.running)) {
    const mins = Math.max(1, Math.ceil(t.remainingSec / 60));
    nextSteps.push(`Active timer "${t.label}" (~${mins}m left)`);
  }
  for (const todo of todos.filter((td) => !td.done).slice(0, 4)) {
    nextSteps.push(`Task: ${todo.text}`);
  }
  if (notes.length > 0) {
    nextSteps.push(`Review captured note: "${notes[0].text.slice(0, 60)}${notes[0].text.length > 60 ? '…' : ''}"`);
  }

  const finalDecisions = decisions.length > 0 ? decisions.slice(-4) : ['Session active with local workspace controls ready.'];
  const finalQuestions = openQuestions.length > 0 ? openQuestions.slice(-3) : ['None logged yet in this session.'];
  const finalNext = nextSteps.length > 0 ? nextSteps.slice(0, 4) : ['Ask a question, set a focus timer, or capture a note.'];

  const formattedText = [
    'Session Catch-Up',
    `Decisions:\n${finalDecisions.map((d) => `• ${d}`).join('\n')}`,
    `Open Questions:\n${finalQuestions.map((q) => `• ${q}`).join('\n')}`,
    `Next Steps:\n${finalNext.map((s) => `• ${s}`).join('\n')}`,
  ].join('\n\n');

  const spokenSummary = `Here is your catch-up: ${finalDecisions.length} action or decision item${finalDecisions.length === 1 ? '' : 's'}, ${openQuestions.length} open question${openQuestions.length === 1 ? '' : 's'}, and ${finalNext.length} next step${finalNext.length === 1 ? '' : 's'}. Full breakdown is in the transcript.`;

  return {
    decisions: finalDecisions,
    openQuestions: finalQuestions,
    nextSteps: finalNext,
    formattedText,
    spokenSummary,
  };
}

export function buildCaptureNoteFromMessages(
  messages: ChatMessage[],
  explicitText?: string,
  asChecklist = false
): { noteText: string; markdown: string; checklistItems: string[] } {
  const cleanExplicit = explicitText?.trim();
  const recentSubstantive = messages
    .filter((m) => m.id !== 'msg-welcome' && m.text.trim().length > 0)
    .slice(-4);

  const sourceLines = cleanExplicit
    ? cleanExplicit
        .split(/\n|;|,\s*(?=[A-Z0-9])/)
        .map((s) => s.trim())
        .filter(Boolean)
    : recentSubstantive.map((m) => `${m.role === 'user' ? 'Topic' : 'Insight'}: ${m.text.trim().slice(0, 220)}`);

  const items = sourceLines.length > 0 ? sourceLines : ['Captured session highlight from XERO'];
  const noteText = asChecklist ? items.map((i) => `- [ ] ${i}`).join('\n') : items.join(' · ').slice(0, 320);

  const timestamp = new Date().toISOString();
  const markdown = [
    '# XERO Captured Note',
    `_Captured: ${timestamp}_`,
    '',
    ...(asChecklist ? items.map((i) => `- [ ] ${i}`) : items.map((i) => `- ${i}`)),
    '',
  ].join('\n');

  return { noteText, markdown, checklistItems: items };
}

export function formatNotesAsMarkdown(notes: QuickNoteItem[], todos: TodoItem[]): string {
  const lines: string[] = [
    '# XERO Notes & Checklists',
    `_Exported ${new Date().toLocaleString()}_`,
    '',
  ];
  if (notes.length > 0) {
    lines.push('## Notes');
    for (const n of notes) {
      lines.push(`- ${n.text} _(${new Date(n.updatedAt).toLocaleTimeString()})_`);
    }
    lines.push('');
  }
  if (todos.length > 0) {
    lines.push('## Checklist');
    for (const td of todos) {
      lines.push(`- [${td.done ? 'x' : ' '}] ${td.text}`);
    }
    lines.push('');
  }
  return lines.join('\n');
}
