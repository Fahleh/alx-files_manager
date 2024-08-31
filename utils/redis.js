import { promisify } from 'util';
import { createClient } from 'redis';

class RedisClient {
  // Creates a new RedisClient instance.
  constructor() {
    this.client = createClient();

    this.client
      .on('connect', () => {
        console.log('Redis client connected successfully.');
      })
      .on('error', (err) => {
        // prettier-ignore
        console.error('Redis client failed to connect:', err.message || err.toString());
      });
  }

  // Checks if the Redis client connection is active
  isAlive() {
    return this.client.connected;
  }

  // Retrieves the value of the passed (string)key.
  async get(key) {
    return promisify(this.client.GET).bind(this.client)(key);
  }

  // Sets a (string)key, it's value and duration(expiration time in secs)
  async set(key, value, duration) {
    await promisify(this.client.SETEX).bind(this.client)(key, duration, value);
  }

  // Deletes the value of the given (string)key.
  async del(key) {
    await promisify(this.client.DEL).bind(this.client)(key);
  }
}

const redisClient = new RedisClient();
export default redisClient;
