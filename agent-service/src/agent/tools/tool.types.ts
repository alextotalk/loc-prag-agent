import { LlmUsage } from '../llm/openai.service';

/**
 * Uniform contract for every agent tool. The executor wraps each `run` call
 * to record a ToolTrace (args, result/error, duration, token usage).
 */
export interface AgentTool<TArgs, TResult> {
  /** stable, snake_case identifier used in traces and the registry */
  readonly name: string;
  /** human description (also useful when exposing tools to an LLM planner) */
  readonly description: string;
  run(args: TArgs): Promise<ToolRunResult<TResult>>;
}

export interface ToolRunResult<TResult> {
  result: TResult;
  /** token usage if the tool called the LLM; zeros otherwise */
  usage?: LlmUsage;
}

export const ZERO_USAGE: LlmUsage = { promptTokens: 0, completionTokens: 0 };
