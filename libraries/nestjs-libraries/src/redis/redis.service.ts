import { Redis } from 'ioredis';

// Create a mock Redis implementation for testing environments
class MockRedis {
  private data: Map<string, any> = new Map();

  async get(key: string) {
    return this.data.get(key);
  }

  async set(key: string, value: any) {
    this.data.set(key, value);
    return 'OK';
  }

  async del(...keys: string[]) {
    let removed = 0;
    for (const key of keys) {
      if (this.data.delete(key)) {
        removed++;
      }
    }
    return removed;
  }

  async keys(pattern: string) {
    const escaped = pattern
      .replace(/[.+^${}()|[\]\\]/g, '\\$&')
      .replace(/\*/g, '.*')
      .replace(/\?/g, '.');
    const re = new RegExp(`^${escaped}$`);
    return [...this.data.keys()].filter((key) => re.test(key));
  }

  async scan(
    cursor: string | number,
    ...args: Array<string | number>
  ): Promise<[string, string[]]> {
    let match = '*';
    for (let i = 0; i < args.length - 1; i++) {
      if (String(args[i]).toLowerCase() === 'match') {
        match = String(args[i + 1]);
      }
    }
    const matched = await this.keys(match);
    if (String(cursor) === '0') {
      return ['0', matched];
    }
    return ['0', matched];
  }

  // Add other Redis methods as needed for your tests
}

// Use real Redis if REDIS_URL is defined, otherwise use MockRedis
export const ioRedis = process.env.REDIS_URL
  ? new Redis(process.env.REDIS_URL, {
      maxRetriesPerRequest: null,
      connectTimeout: 10000,
    })
  : (new MockRedis() as unknown as Redis); // Type cast to Redis to maintain interface compatibility
