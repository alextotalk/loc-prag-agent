import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AgentRun, AgentRunSchema } from './run.schema';
import { RunRepository } from './run.repository';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: AgentRun.name, schema: AgentRunSchema },
    ]),
  ],
  providers: [RunRepository],
  exports: [RunRepository],
})
export class PersistenceModule {}
