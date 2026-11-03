import fs from 'node:fs/promises';
import path from 'node:path';

/** Jednostavna JSON predmemorija na disku s atomskim zapisom (tmp + rename). */
export class FileCache {
  constructor(private readonly dir: string) {}

  private file(key: string): string {
    return path.join(this.dir, `${key}.json`);
  }

  async read<T>(key: string): Promise<T | null> {
    try {
      const raw = await fs.readFile(this.file(key), 'utf8');
      return JSON.parse(raw) as T;
    } catch {
      return null;
    }
  }

  async write(key: string, value: unknown): Promise<void> {
    await fs.mkdir(this.dir, { recursive: true });
    const target = this.file(key);
    const tmp = `${target}.${process.pid}.tmp`;
    await fs.writeFile(tmp, JSON.stringify(value));
    await fs.rename(tmp, target);
  }
}
