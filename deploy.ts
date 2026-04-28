#!/usr/bin/env -S npx tsx

import { config } from 'dotenv';
import { join } from 'node:path';
import { execa } from 'execa';
import { z } from 'zod';

const rootDir = new URL('.', import.meta.url).pathname;
const botDir = join(rootDir, 'bot');

const optionsSchema = z.object({
  'skip-install': z.boolean().default(false),
  'skip-build': z.boolean().default(false),
  'dry-run': z.boolean().default(false),
  'help': z.boolean().default(false),
});

const envSchema = z.object({
  TELEGRAM_TOKEN: z.string().min(1),
  OPENCODE_URL: z.string().url().default('http://127.0.0.1:8888'),
  OPENCODE_MODEL: z.string().default('opencode/minimax-m2.5'),
  OPENCODE_PORT: z.coerce.number().positive().default(8888),
  OPENCODE_HOSTNAME: z.string().default('0.0.0.0'),
  PM2_OPENCODE_NAME: z.string().default('content-assistant-opencode'),
  PM2_BOT_NAME: z.string().default('content-assistant-bot'),
});

const options = optionsSchema.parse(
  Object.fromEntries(process.argv.slice(2).map((arg) => [arg.replace(/^--/, ''), true])),
);

if (options.help) {
  console.log(
    `
Usage: npm run deploys

Options:
  --skip-install    Skip npm ci
  --skip-build    Skip npm run build
  --dry-run       Print commands without executing

Env (bot/.env):
  TELEGRAM_TOKEN      Telegram bot token (required)
  OPENCODE_URL       OpenCode URL for bot (default: http://127.0.0.1:8888)
  OPENCODE_MODEL    Model (default: opencode/minimax-m2.5)
  OPENCODE_PORT     Port (default: 8888)
  `.trim(),
  );
  process.exit(0);
}

function loadEnv() {
  const botEnvPath = join(botDir, '.env');
  let botEnv: Record<string, string> = {};
  try {
    const result = config({ path: botEnvPath });
    if (result.parsed) {
      botEnv = result.parsed;
    }
  } catch {}

  const raw = { ...process.env, ...botEnv };
  const flat = Object.fromEntries(Object.entries(raw).filter(([, v]) => typeof v === 'string'));

  return envSchema.parse(flat);
}

async function run(cmd: string, args: string[], opts?: Parameters<typeof execa>[1]) {
  console.log(`$ ${cmd} ${args.join(' ')}`);
  if (options['dry-run']) return;
  return execa(cmd, args, { ...opts, stdio: 'inherit' });
}

async function main() {
  const env = loadEnv();
  const opencodeUrl = `${env.OPENCODE_URL.replace(/\/+$/, '')}`;

  console.log('Deploy configuration:');
  console.log(`- opencode: ${env.PM2_OPENCODE_NAME}`);
  console.log(`- bot: ${env.PM2_BOT_NAME}`);
  console.log(`- model: ${env.OPENCODE_MODEL}`);
  console.log(`- url: ${opencodeUrl}`);

  if (!options['skip-install']) {
    await run('npm', ['ci', '--include=dev'], { cwd: botDir });
  }

  if (!options['skip-build']) {
    await run('npm', ['run', 'build'], { cwd: botDir });
  }

  const opencodeProcess = {
    name: env.PM2_OPENCODE_NAME,
    cwd: rootDir,
    args: [
      '--model',
      env.OPENCODE_MODEL,
      'serve',
      '--port',
      String(env.OPENCODE_PORT),
      '--hostname',
      env.OPENCODE_HOSTNAME,
    ],
  };

  await execa('pm2', ['delete', opencodeProcess.name], { cwd: rootDir }).catch(() => {});
  await run('pm2', ['start', ...opencodeProcess.args], {
    cwd: opencodeProcess.cwd,
    env: {
      OPENCODE_URL: opencodeUrl,
      OPENCODE_MODEL: env.OPENCODE_MODEL,
    },
  });

  await waitForOpencode(opencodeUrl);

  const botProcess = {
    name: env.PM2_BOT_NAME,
    cwd: botDir,
  };

  await execa('pm2', ['delete', botProcess.name], { cwd: rootDir }).catch(() => {});
  await run('pm2', ['start', 'npm', '--', 'start'], {
    cwd: botProcess.cwd,
    env: {
      OPENCODE_URL: opencodeUrl,
      TELEGRAM_TOKEN: env.TELEGRAM_TOKEN,
    },
  });

  await run('pm2', ['save'], { cwd: rootDir });
  await run('pm2', ['list'], { cwd: rootDir });

  console.log('\nDeploy completed.');
}

async function waitForOpencode(url: string) {
  if (options['dry-run']) return;

  const target = `${url}/session`;
  console.log(`Waiting for opencode: ${target}`);

  const deadline = Date.now() + 30000;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(target);
      if (res.ok) {
        console.log('OpenCode is ready.');
        return;
      }
    } catch {}
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw new Error('OpenCode did not become ready');
}

main().catch((e) => {
  console.error(`Deploy failed: ${e}`);
  process.exit(1);
});
