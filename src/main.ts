import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  const configService = app.get(ConfigService);
  const rawOrigins = configService.get<string>('CORS_ORIGIN');
  const allowedOrigins = rawOrigins
    ?.split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);

  app.enableCors({
    origin: allowedOrigins?.length ? allowedOrigins : [],
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Authorization', 'Content-Type', 'X-Requested-With', 'Accept', 'Origin'],
  });

  console.log('CORS allowed origins:', allowedOrigins?.length ? allowedOrigins : 'none (CORS_ORIGIN not set)');

  const port = process.env.PORT ?? 4000;
  await app.listen(port);
  console.log(`Server running on port ${port}`);
}
bootstrap();
