type Kind = 'agent.step' | 'llm.call' | 'tool.call' | 'tool.result';

const styles: Record<Kind, { bg: string; text: string; bar: string; label: string }> = {
  'agent.step': { bg: 'bg-kAgentSoft', text: 'text-kAgent', bar: 'bg-kAgent', label: 'Step' },
  'llm.call': { bg: 'bg-kLlmSoft', text: 'text-kLlm', bar: 'bg-kLlm', label: 'LLM' },
  'tool.call': { bg: 'bg-kToolSoft', text: 'text-kTool', bar: 'bg-kTool', label: 'Tool' },
  'tool.result': { bg: 'bg-kToolSoft', text: 'text-kTool', bar: 'bg-kTool', label: 'Result' },
};

export function KindBadge({ kind }: { kind: Kind }) {
  const s = styles[kind];
  return (
    <span
      className={`inline-flex items-center h-5 px-2 rounded-pill text-2xs font-medium ${s.bg} ${s.text}`}
    >
      {s.label}
    </span>
  );
}

export function kindBarClass(kind: Kind): string {
  return styles[kind].bar;
}
