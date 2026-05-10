export type AttributeValue =
  | string
  | number
  | boolean
  | null
  | readonly string[]
  | readonly number[]
  | readonly boolean[];

export type Attributes = Readonly<Record<string, AttributeValue>>;

export const Attr = {
  GEN_AI_SYSTEM: 'gen_ai.system',
  GEN_AI_REQUEST_MODEL: 'gen_ai.request.model',
  GEN_AI_REQUEST_TEMPERATURE: 'gen_ai.request.temperature',
  GEN_AI_REQUEST_MAX_TOKENS: 'gen_ai.request.max_tokens',
  GEN_AI_REQUEST_TOP_P: 'gen_ai.request.top_p',
  GEN_AI_RESPONSE_FINISH_REASON: 'gen_ai.response.finish_reason',
  GEN_AI_USAGE_INPUT_TOKENS: 'gen_ai.usage.input_tokens',
  GEN_AI_USAGE_OUTPUT_TOKENS: 'gen_ai.usage.output_tokens',
  GEN_AI_USAGE_CACHE_READ_TOKENS: 'gen_ai.usage.cache_read_tokens',
  GEN_AI_USAGE_CACHE_WRITE_TOKENS: 'gen_ai.usage.cache_write_tokens',
  GEN_AI_USAGE_COST_USD: 'gen_ai.usage.cost_usd',

  TOOL_NAME: 'tool.name',
  TOOL_CALL_ID: 'tool.call_id',
  TOOL_DURATION_MS: 'tool.duration_ms',
  TOOL_SAFE_TO_REPLAY: 'tool.safe_to_replay',
  TOOL_ERROR: 'tool.error',

  AGENT_ID: 'agent.id',
  AGENT_VERSION: 'agent.version',
  AGENT_STEP_INDEX: 'agent.step.index',
  AGENT_STEP_LABEL: 'agent.step.label',

  WYRD_SDK_VERSION: 'wyrd.sdk.version',
  WYRD_SCHEMA_VERSION: 'wyrd.schema.version',
} as const;

export type WellKnownAttr = (typeof Attr)[keyof typeof Attr];
