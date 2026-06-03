import { Module } from '@nestjs/common';
import { AgentController } from './agent.controller';
import { AgentService } from './agent.service';
import { PlannerService } from './planner.service';
import { OpenAiService } from './llm/openai.service';
import { SearchBazosTool } from './tools/search-bazos.tool';
import { SearchBezrealitkyTool } from './tools/search-bezrealitky.tool';
import { ClassifyListingTool } from './tools/classify-listing.tool';
import { DraftInquiryTool } from './tools/draft-inquiry.tool';
import { PersistenceModule } from '../persistence/persistence.module';

@Module({
  imports: [PersistenceModule],
  controllers: [AgentController],
  providers: [
    AgentService,
    PlannerService,
    OpenAiService,
    SearchBazosTool,
    SearchBezrealitkyTool,
    ClassifyListingTool,
    DraftInquiryTool,
  ],
})
export class AgentModule {}
