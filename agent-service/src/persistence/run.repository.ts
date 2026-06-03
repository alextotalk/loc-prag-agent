import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { AgentResult } from '../agent/schemas/agent-result.schema';
import { AgentRun, AgentRunDocument } from './run.schema';

/** Writes/reads agent runs. The `persist_run` tool delegates here. */
@Injectable()
export class RunRepository {
  constructor(
    @InjectModel(AgentRun.name)
    private readonly model: Model<AgentRunDocument>,
  ) {}

  async save(query: string, result: AgentResult): Promise<void> {
    await this.model.create({
      runId: result.runId,
      query,
      status: result.status,
      refusalReason: result.refusalReason,
      criteria: result.criteria,
      totalFound: result.totalFound,
      results: result.results,
      summaryMarkdown: result.summaryMarkdown,
      traces: result.traces,
      usage: result.usage,
      durationMs: result.durationMs,
    });
  }

  async findByRunId(runId: string): Promise<AgentRunDocument | null> {
    return this.model.findOne({ runId }).lean<AgentRunDocument>().exec();
  }

  async findRecent(limit = 20): Promise<AgentRunDocument[]> {
    return this.model
      .find()
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean<AgentRunDocument[]>()
      .exec();
  }
}
