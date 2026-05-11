/**
 * Built-in, offline, provider-agnostic prompt-injection + data-leak scanner.
 * Pattern-based first pass — fast, deterministic, zero dependencies. Catches
 * the well-known classes documented in OWASP LLM01 (prompt injection) and
 * LLM06 (sensitive information disclosure).
 *
 * Not a substitute for a proper firewall like Inferwall, but always runs.
 */

export type Severity = 1 | 2 | 3 | 4 | 5;
export type Decision = 'allow' | 'flag' | 'block';

export interface GuardSignature {
  id: string;
  category: 'injection' | 'jailbreak' | 'data_leak' | 'secret' | 'malicious_intent';
  description: string;
  severity: Severity;
  pattern: RegExp;
}

export interface GuardMatch {
  signature_id: string;
  matched_text: string;
  severity: Severity;
  confidence: number;
  score: number;
}

export interface GuardVerdict {
  decision: Decision;
  score: number;
  matches: GuardMatch[];
  request_id: string;
}

const INJECTION: GuardSignature[] = [
  {
    id: 'IW.INJ.001',
    category: 'injection',
    description: 'Ignore prior instructions',
    severity: 5,
    pattern: /\bignore\s+(all|any|the|previous|prior|above)\s+(instructions|directions|prompts|rules|context)\b/i,
  },
  {
    id: 'IW.INJ.002',
    category: 'injection',
    description: 'Disregard system prompt',
    severity: 5,
    pattern: /\b(disregard|forget|override)\s+(the\s+)?(system|original|previous)\s+(prompt|instructions|context)\b/i,
  },
  {
    id: 'IW.INJ.003',
    category: 'injection',
    description: 'Reveal system prompt',
    severity: 4,
    pattern: /\b(reveal|show|print|repeat|output|tell\s+me)\s+(your\s+)?(system|original|initial|hidden)\s+(prompt|instructions|message)\b/i,
  },
  {
    id: 'IW.INJ.004',
    category: 'injection',
    description: 'Instruction wrapping ("you are now")',
    severity: 3,
    pattern: /\byou\s+are\s+now\s+(?:a|an|the)?\s*\w{2,40}\b.{0,80}(no\s+restrictions|no\s+rules|no\s+filters|uncensored)/i,
  },
  {
    id: 'IW.INJ.005',
    category: 'injection',
    description: 'Indirect-injection markers',
    severity: 3,
    pattern: /(<\/?system>|<\|im_start\|>|<\|im_end\|>|\[INST\]|<\|system\|>)/i,
  },
  {
    id: 'IW.INJ.006',
    category: 'injection',
    description: 'Suffix-attack delimiter',
    severity: 2,
    pattern: /-{5,}\s*(end\s+of\s+(?:user|prompt|input)|begin\s+(?:new|admin)\s+(?:prompt|instructions))/i,
  },
];

const JAILBREAK: GuardSignature[] = [
  {
    id: 'IW.JB.001',
    category: 'jailbreak',
    description: 'DAN-style jailbreak',
    severity: 5,
    pattern: /\b(do\s+anything\s+now|DAN|developer\s+mode|jailbroken?|unfiltered\s+mode)\b/i,
  },
  {
    id: 'IW.JB.002',
    category: 'jailbreak',
    description: 'Persona-bypass attempt',
    severity: 4,
    pattern: /\bact\s+as\s+if\s+you\s+(have\s+no|are\s+free\s+of|don['’]?t\s+have)\s+(restrictions|guidelines|rules|filters)\b/i,
  },
  {
    id: 'IW.JB.003',
    category: 'jailbreak',
    description: 'Roleplay bypass',
    severity: 3,
    pattern: /\b(pretend|imagine|let['’]?s?\s+roleplay)\s+(you\s+are|to\s+be)\s+.*\b(unrestricted|uncensored|amoral|evil|no\s+rules)\b/i,
  },
];

const MALICIOUS: GuardSignature[] = [
  {
    id: 'IW.MAL.001',
    category: 'malicious_intent',
    description: 'How to make weapon/explosive',
    severity: 5,
    pattern: /\b(how\s+to\s+(make|build|create|synthesize)|instructions?\s+for)\s+(a\s+)?(bomb|explosive|nerve\s+agent|biological\s+weapon|chemical\s+weapon|firearm|silencer|napalm)\b/i,
  },
  {
    id: 'IW.MAL.002',
    category: 'malicious_intent',
    description: 'Self-harm content request',
    severity: 5,
    pattern: /\b(how\s+to\s+)?(commit\s+suicide|kill\s+myself|end\s+my\s+life|self[-\s]?harm\s+methods)\b/i,
  },
  {
    id: 'IW.MAL.003',
    category: 'malicious_intent',
    description: 'Malware authoring request',
    severity: 4,
    pattern: /\b(write|create|develop|generate)\s+(a\s+)?(ransomware|keylogger|trojan|rootkit|botnet|worm)\b/i,
  },
];

const SECRETS: GuardSignature[] = [
  {
    id: 'IW.SEC.001',
    category: 'secret',
    description: 'OpenAI API key',
    severity: 5,
    pattern: /\bsk-(?:proj-|[A-Za-z0-9])[A-Za-z0-9\-_]{20,}\b/,
  },
  {
    id: 'IW.SEC.002',
    category: 'secret',
    description: 'Anthropic API key',
    severity: 5,
    pattern: /\bsk-ant-(?:api|oat)[A-Za-z0-9_\-]{20,}\b/,
  },
  {
    id: 'IW.SEC.003',
    category: 'secret',
    description: 'AWS access key',
    severity: 5,
    pattern: /\bAKIA[0-9A-Z]{16}\b/,
  },
  {
    id: 'IW.SEC.004',
    category: 'secret',
    description: 'Google API key',
    severity: 5,
    pattern: /\bAIza[0-9A-Za-z_\-]{35}\b/,
  },
  {
    id: 'IW.SEC.005',
    category: 'secret',
    description: 'GitHub token',
    severity: 5,
    pattern: /\bghp_[A-Za-z0-9]{30,}\b/,
  },
  {
    id: 'IW.SEC.006',
    category: 'secret',
    description: 'Stripe live secret',
    severity: 5,
    pattern: /\bsk_live_[A-Za-z0-9]{20,}\b/,
  },
  {
    id: 'IW.SEC.007',
    category: 'secret',
    description: 'Slack token',
    severity: 5,
    pattern: /\bxox[abprs]-[A-Za-z0-9\-]+\b/,
  },
  {
    id: 'IW.SEC.008',
    category: 'secret',
    description: 'JWT bearer token',
    severity: 3,
    pattern: /\beyJ[A-Za-z0-9_\-]+\.[A-Za-z0-9_\-]+\.[A-Za-z0-9_\-]+\b/,
  },
  {
    id: 'IW.SEC.009',
    category: 'secret',
    description: 'Private RSA key header',
    severity: 5,
    pattern: /-----BEGIN\s+(?:RSA\s+|OPENSSH\s+|EC\s+|DSA\s+)?PRIVATE\s+KEY-----/,
  },
];

const DATA_LEAK: GuardSignature[] = [
  {
    id: 'IW.PII.001',
    category: 'data_leak',
    description: 'US SSN',
    severity: 4,
    pattern: /\b(?!000|666)[0-8]\d{2}-(?!00)\d{2}-(?!0000)\d{4}\b/,
  },
  {
    id: 'IW.PII.002',
    category: 'data_leak',
    description: 'Credit card (Luhn-shaped)',
    severity: 4,
    pattern: /\b(?:4\d{3}|5[1-5]\d{2}|6011|3[47]\d{2})[\s\-]?\d{4}[\s\-]?\d{4}[\s\-]?\d{4}\b/,
  },
];

export const ALL_SIGNATURES: GuardSignature[] = [
  ...INJECTION,
  ...JAILBREAK,
  ...MALICIOUS,
  ...SECRETS,
  ...DATA_LEAK,
];

function decisionFor(score: number, kind: 'input' | 'output'): Decision {
  if (kind === 'input') {
    if (score >= 10) return 'block';
    if (score >= 4) return 'flag';
    return 'allow';
  }
  // Outputs are stricter for data leakage.
  if (score >= 7) return 'block';
  if (score >= 3) return 'flag';
  return 'allow';
}

function ulidish(): string {
  return `wg_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

export function scanText(text: string, kind: 'input' | 'output' = 'input'): GuardVerdict {
  const matches: GuardMatch[] = [];
  let score = 0;
  for (const sig of ALL_SIGNATURES) {
    const m = text.match(sig.pattern);
    if (m && m[0]) {
      const confidence = 0.9; // pattern matches are deterministic; small slack.
      const itemScore = confidence * sig.severity;
      score += itemScore;
      matches.push({
        signature_id: sig.id,
        matched_text: m[0].length > 120 ? m[0].slice(0, 117) + '…' : m[0],
        severity: sig.severity,
        confidence,
        score: itemScore,
      });
    }
  }
  return {
    decision: decisionFor(score, kind),
    score,
    matches,
    request_id: ulidish(),
  };
}

export function aggregateGuardDecisions(verdicts: GuardVerdict[]): Decision | 'unknown' {
  if (verdicts.length === 0) return 'unknown';
  if (verdicts.some((v) => v.decision === 'block')) return 'block';
  if (verdicts.some((v) => v.decision === 'flag')) return 'flag';
  return 'allow';
}
