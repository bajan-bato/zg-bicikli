import type {
  CyclewayCollection,
  DatasetSource,
  DatasetStatus,
  InfrastructureStatus,
  ParkingCollection,
} from '../../../../shared/types/index.js';
import { config } from '../../config/index.js';
import { AppError, ErrorCodes, errorMessage } from '../../utils/errors.js';
import { FileCache } from '../../utils/fileCache.js';
import { CkanClient } from '../ckan/ckanClient.js';
import { discoverDataset, type DatasetSpec } from '../ckan/datasetDiscovery.js';
import { cyclewaySpec, parkingSpec } from './datasetSpecs.js';

interface CachedDataset<T> {
  data: T;
  source: DatasetSource;
}

/**
 * Jedan skup podataka: memorija + disk. Ako osvježavanje ne uspije, zadržava se
 * posljednja uspješno preuzeta verzija.
 */
export class DatasetStore<T> {
  private current: CachedDataset<T> | null = null;
  private lastError: string | null = null;
  private lastAttemptAt: string | null = null;
  private inFlight: Promise<boolean> | null = null;

  constructor(
    private readonly spec: DatasetSpec<T>,
    private readonly client: CkanClient,
    private readonly cache: FileCache,
    private readonly maxAgeMs: number,
  ) {}

  get key(): string {
    return this.spec.key;
  }

  async loadFromDisk(): Promise<boolean> {
    const cached = await this.cache.read<CachedDataset<T>>(this.spec.key);
    if (cached?.data && cached.source) {
      this.current = cached;
      return true;
    }
    return false;
  }

  /** Vraća true ako je preuzeta nova verzija. Nikad ne baca grešku. */
  refresh(): Promise<boolean> {
    if (!this.inFlight) {
      this.inFlight = this.doRefresh().finally(() => {
        this.inFlight = null;
      });
    }
    return this.inFlight;
  }

  private async doRefresh(): Promise<boolean> {
    this.lastAttemptAt = new Date().toISOString();
    try {
      const result = await discoverDataset(this.client, this.spec);
      this.current = result;
      this.lastError = null;
      await this.cache.write(this.spec.key, result).catch((err) => {
        console.warn(`[infra] Zapis predmemorije za ${this.spec.key} nije uspio: ${errorMessage(err)}`);
      });
      console.log(
        `[infra] ${this.spec.label}: ${result.source.featureCount} objekata (skup ${result.source.datasetName}, resurs ${result.source.resourceId})`,
      );
      return true;
    } catch (err) {
      this.lastError = errorMessage(err);
      console.warn(
        `[infra] Osvježavanje "${this.spec.label}" nije uspjelo${this.current ? ' – koristi se posljednja verzija' : ''}: ${this.lastError}`,
      );
      return false;
    }
  }

  isStale(): boolean {
    if (!this.current) return true;
    return Date.now() - Date.parse(this.current.source.fetchedAt) > this.maxAgeMs;
  }

  get(): CachedDataset<T> {
    if (!this.current) {
      throw new AppError(
        503,
        ErrorCodes.DATA_UNAVAILABLE,
        `Podaci "${this.spec.label}" trenutno nisu dostupni${this.lastError ? `: ${this.lastError}` : ' (preuzimanje je u tijeku)'}`,
      );
    }
    return this.current;
  }

  peek(): CachedDataset<T> | null {
    return this.current;
  }

  status(): DatasetStatus {
    return {
      available: this.current !== null,
      source: this.current?.source ?? null,
      lastError: this.lastError,
      lastAttemptAt: this.lastAttemptAt,
      stale: this.isStale(),
    };
  }
}

type Listener = (cycleways: CyclewayCollection) => void;

export class InfrastructureService {
  readonly cycleways: DatasetStore<CyclewayCollection>;
  readonly parking: DatasetStore<ParkingCollection>;
  private readonly listeners: Listener[] = [];

  constructor(client = new CkanClient(), cache = new FileCache(config.dataDir), maxAgeMs = config.ckan.maxAgeMs) {
    this.cycleways = new DatasetStore(cyclewaySpec, client, cache, maxAgeMs);
    this.parking = new DatasetStore(parkingSpec, client, cache, maxAgeMs);
  }

  /** Učitava predmemoriju s diska; ako je nema ili je zastarjela, preuzima s portala. */
  async init(): Promise<void> {
    await Promise.all([this.cycleways.loadFromDisk(), this.parking.loadFromDisk()]);
    const pending: Promise<unknown>[] = [];
    for (const store of [this.cycleways, this.parking] as DatasetStore<unknown>[]) {
      if (!store.isStale()) continue;
      const job = this.refreshStore(store);
      // Bez lokalne kopije čekamo preuzimanje; inače osvježavamo u pozadini.
      if (!store.peek()) pending.push(job);
    }
    await Promise.all(pending);
  }

  onCyclewaysChanged(listener: Listener): void {
    this.listeners.push(listener);
  }

  private async refreshStore(store: DatasetStore<unknown>): Promise<boolean> {
    const updated = await store.refresh();
    if (updated && store === (this.cycleways as DatasetStore<unknown>)) {
      const data = this.cycleways.peek()?.data;
      if (data) for (const l of this.listeners) l(data);
    }
    return updated;
  }

  async refreshAll(): Promise<{ updated: Record<string, boolean>; status: InfrastructureStatus }> {
    const [c, p] = await Promise.all([
      this.refreshStore(this.cycleways as DatasetStore<unknown>),
      this.refreshStore(this.parking as DatasetStore<unknown>),
    ]);
    return { updated: { cycleways: c, parking: p }, status: this.status() };
  }

  status(): InfrastructureStatus {
    return { cycleways: this.cycleways.status(), parking: this.parking.status() };
  }
}
