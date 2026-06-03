export interface AppConfig {
  nodeEnv: string;
  port: number;
  openai: {
    apiKey: string;
    model: string;
  };
  mongodbUri: string;
  redis: {
    host: string;
    port: number;
    password: string;
  };
  agent: {
    maxSteps: number;
    maxListings: number;
    topNDrafts: number;
  };
}

export default (): AppConfig => ({
  nodeEnv: process.env.NODE_ENV ?? 'local',
  port: parseInt(process.env.PORT ?? '3020', 10),
  openai: {
    apiKey: process.env.OPENAI_API_KEY ?? '',
    model: process.env.OPENAI_MODEL ?? 'gpt-4o-mini',
  },
  mongodbUri: process.env.MONGODB_URI ?? '',
  redis: {
    host: process.env.REDIS_HOST ?? '127.0.0.1',
    port: parseInt(process.env.REDIS_PORT ?? '6379', 10),
    password: process.env.REDIS_PASSWORD ?? '',
  },
  agent: {
    maxSteps: parseInt(process.env.AGENT_MAX_STEPS ?? '8', 10),
    maxListings: parseInt(process.env.AGENT_MAX_LISTINGS ?? '40', 10),
    topNDrafts: parseInt(process.env.AGENT_TOP_N_DRAFTS ?? '3', 10),
  },
});
