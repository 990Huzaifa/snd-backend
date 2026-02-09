import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,              // extra fields strip
      forbidNonWhitelisted: true,   // unknown fields → 400
      transform: true,              // payload → DTO instance
    })
  )

  await app.listen(process.env.PORT ?? 3000);
}
bootstrap();
