import 'dotenv/config';
import * as fs from 'fs';
import * as path from 'path';
import { createApp } from './app';

async function bootstrap() {
  // Ensure logs directory exists
  const logsDir = path.join(process.cwd(), 'logs');
  if (!fs.existsSync(logsDir)) fs.mkdirSync(logsDir, { recursive: true });

  const app = await createApp();
  const port = parseInt(process.env.PORT || '3000', 10);

  app.listen(port, () => {
    console.log(`🎬 Movie Reservation API running on port ${port}`);
  });
}

bootstrap().catch((err) => {
  console.error('Failed to start server', err);
  process.exit(1);
});
