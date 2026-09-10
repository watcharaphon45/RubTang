import 'reflect-metadata';
import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { Request, Response, NextFunction } from 'express';
import { AppModule } from './app';

async function bootstrap() {
  if (!process.env.DATABASE_URL || !process.env.WEB_ORIGIN) throw new Error('Set DATABASE_URL and WEB_ORIGIN in apps/api/.env');
  const app = await NestFactory.create(AppModule);
  app.setGlobalPrefix('api');
  app.use(helmet());
  app.use(cookieParser());
  app.use((req: Request, res: Response, next: NextFunction) => {
    res.setHeader('Cache-Control', 'no-store');
    if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method) && req.headers.origin !== process.env.WEB_ORIGIN) {
      res.status(403).json({ message: 'Request origin is not allowed' });
      return;
    }
    next();
  });
  app.enableShutdownHooks();
  await app.listen(Number(process.env.PORT ?? 3001), '127.0.0.1');
}
void bootstrap();
