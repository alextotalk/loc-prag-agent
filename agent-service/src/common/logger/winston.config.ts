import { WinstonModuleOptions } from 'nest-winston';
import * as winston from 'winston';

const { combine, timestamp, json, colorize, printf, errors } = winston.format;

const devFormat = printf(
  ({ level, message, timestamp: ts, context, ...meta }) => {
    const ctx = context ? `[${context}] ` : '';
    const extra = Object.keys(meta).length ? ` ${JSON.stringify(meta)}` : '';
    return `${ts} ${level} ${ctx}${message}${extra}`;
  },
);

export function buildWinstonOptions(nodeEnv: string): WinstonModuleOptions {
  const isProd = nodeEnv === 'production';
  return {
    level: isProd ? 'info' : 'debug',
    format: isProd
      ? combine(timestamp(), errors({ stack: true }), json())
      : combine(timestamp(), errors({ stack: true }), colorize(), devFormat),
    transports: [new winston.transports.Console()],
  };
}
