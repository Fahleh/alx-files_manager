import { existsSync, readFileSync } from 'fs';

// Sets the specified environment variabls for the session
const loadEnv = () => {
  const env = process.env.npm_lifecycle_event || 'dev';
  // prettier-ignore
  const suffix = (env.includes('test') || env.includes('cover')) ? '.env.test' : '.env';

  if (!existsSync(suffix)) return;

  const config = readFileSync(suffix, 'utf-8').trim().split('\n');

  for (const line of config) {
    const delim = line.indexOf('=');
    const envKey = line.substring(0, delim);
    const envValue = line.substring(delim + 1);
    process.env[envKey] = envValue;
  }
};

export default loadEnv;
