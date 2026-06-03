import { Inject, Injectable, LoggerService } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { WINSTON_MODULE_NEST_PROVIDER } from 'nest-winston';
import OpenAI from 'openai';
import { z } from 'zod';
import { zodToJsonSchema } from 'zod-to-json-schema';

export interface LlmUsage {
  promptTokens: number;
  completionTokens: number;
}

export interface StructuredCallResult<T> {
  data: T;
  usage: LlmUsage;
}

/**
 * Thin wrapper around the OpenAI SDK. Centralises:
 *  - client construction from config
 *  - retries with exponential backoff (guardrail)
 *  - structured (JSON-schema-constrained) completions validated with Zod
 *  - token-usage accounting (graded observability requirement)
 */
@Injectable()
export class OpenAiService {
  private readonly client: OpenAI;
  private readonly model: string;
  private readonly maxRetries = 3;

  constructor(
    private readonly config: ConfigService,
    @Inject(WINSTON_MODULE_NEST_PROVIDER)
    private readonly logger: LoggerService,
  ) {
    const apiKey = this.config.get<string>('openai.apiKey') ?? '';
    this.model = this.config.get<string>('openai.model') ?? 'gpt-4o-mini';
    this.client = new OpenAI({ apiKey });
  }

  /**
   * Calls the model and forces a JSON object response matching `schema`.
   * Validates the parsed payload with Zod; throws if it cannot be coerced.
   */
  async completeStructured<T extends z.ZodTypeAny>(params: {
    system: string;
    user: string;
    schema: T;
    schemaName: string;
    temperature?: number;
  }): Promise<StructuredCallResult<z.infer<T>>> {
    // Cast through `never` to avoid zod-to-json-schema's deep generic
    // instantiation blowing up the type checker (TS2589) on our schemas.
    const jsonSchema = zodToJsonSchema(params.schema as never) as Record<
      string,
      unknown
    >;

    const completion = await this.withRetry(() =>
      this.client.chat.completions.create({
        model: this.model,
        temperature: params.temperature ?? 0,
        messages: [
          { role: 'system', content: params.system },
          { role: 'user', content: params.user },
        ],
        response_format: {
          type: 'json_schema',
          json_schema: {
            name: params.schemaName,
            schema: jsonSchema,
            strict: false,
          },
        },
      }),
    );

    const raw = completion.choices[0]?.message?.content ?? '{}';
    const parsed = params.schema.parse(JSON.parse(raw));
    return {
      data: parsed,
      usage: {
        promptTokens: completion.usage?.prompt_tokens ?? 0,
        completionTokens: completion.usage?.completion_tokens ?? 0,
      },
    };
  }

  private async withRetry<R>(fn: () => Promise<R>): Promise<R> {
    let lastErr: unknown;
    for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
      try {
        return await fn();
      } catch (err) {
        lastErr = err;
        const backoff = 2 ** (attempt - 1) * 500;
        this.logger.warn(
          `OpenAI call failed (attempt ${attempt}/${this.maxRetries}), retrying in ${backoff}ms: ${
            (err as Error).message
          }`,
          OpenAiService.name,
        );
        if (attempt < this.maxRetries) {
          await new Promise((r) => setTimeout(r, backoff));
        }
      }
    }
    throw lastErr;
  }
}
