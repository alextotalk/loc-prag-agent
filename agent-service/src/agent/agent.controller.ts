import {
  Body,
  Controller,
  Get,
  NotFoundException,
  Param,
  Post,
} from '@nestjs/common';
import { AgentService } from './agent.service';
import { SearchRequestDto } from './dto/search-request.dto';
import { RunRepository } from '../persistence/run.repository';

@Controller('agent')
export class AgentController {
  constructor(
    private readonly agent: AgentService,
    private readonly runs: RunRepository,
  ) {}

  /** Run the full agent loop for a natural-language property search. */
  @Post('search')
  async search(@Body() body: SearchRequestDto) {
    return this.agent.run(body.query);
  }

  /** Fetch a persisted run (with full tool trace) by id — observability. */
  @Get('runs/:runId')
  async getRun(@Param('runId') runId: string) {
    const run = await this.runs.findByRunId(runId);
    if (!run) throw new NotFoundException(`run ${runId} not found`);
    return run;
  }

  /** List recent runs. */
  @Get('runs')
  async listRuns() {
    return this.runs.findRecent();
  }
}
