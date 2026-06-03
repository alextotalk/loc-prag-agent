import { Controller, Get } from '@nestjs/common';

@Controller('health')
export class HealthController {
  @Get()
  check() {
    return {
      status: 'ok',
      service: 'agent-service',
      ts: new Date().toISOString(),
    };
  }
}
