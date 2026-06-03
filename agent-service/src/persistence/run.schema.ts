import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type AgentRunDocument = HydratedDocument<AgentRun>;

/**
 * One persisted agent run for observability: the raw user query, the parsed
 * criteria, every tool trace, the final results and aggregate token usage.
 */
@Schema({ collection: 'agent_runs', timestamps: true })
export class AgentRun {
  @Prop({ required: true, index: true })
  runId: string;

  @Prop({ required: true })
  query: string;

  @Prop({ required: true, enum: ['completed', 'refused', 'failed'] })
  status: string;

  @Prop({ type: String, default: null })
  refusalReason: string | null;

  @Prop({ type: Object, default: null })
  criteria: Record<string, unknown> | null;

  @Prop({ default: 0 })
  totalFound: number;

  @Prop({ type: [Object], default: [] })
  results: Record<string, unknown>[];

  @Prop({ default: '' })
  summaryMarkdown: string;

  @Prop({ type: [Object], default: [] })
  traces: Record<string, unknown>[];

  @Prop({ type: Object, default: {} })
  usage: Record<string, number>;

  @Prop()
  durationMs: number;
}

export const AgentRunSchema = SchemaFactory.createForClass(AgentRun);
