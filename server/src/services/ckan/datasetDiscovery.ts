import type { DatasetSource } from '../../../../shared/types/index.js';
import { config } from '../../config/index.js';
import { AppError, ErrorCodes, errorMessage } from '../../utils/errors.js';
import { CkanClient, isGeoJsonResource, type CkanPackage, type CkanResource } from './ckanClient.js';

/**
 * Opis skupa podataka koji tražimo na portalu. Ne sadrži CKAN identifikatore:
 * skup i resurs pronalaze se pretraživanjem, a zatim se provjerava struktura.
 */
export interface DatasetSpec<T> {
  key: string;
  label: string;
  searchQueries: string[];
  /** Naslov skupa mora odgovarati ovom izrazu. */
  titlePattern: RegExp;
  /** Validira i pretvara preuzeti GeoJSON; baca AppError(INVALID_GEOJSON) ako struktura ne odgovara. */
  parse: (raw: unknown) => { data: T; skipped: number; featureCount: number };
}

export interface DiscoveredDataset<T> {
  data: T;
  source: DatasetSource;
}

const scorePackage = (pkg: CkanPackage, spec: DatasetSpec<unknown>): number => {
  let score = 0;
  if (spec.titlePattern.test(pkg.title ?? '')) score += 10;
  const org = `${pkg.organization?.title ?? ''} ${pkg.organization?.name ?? ''}`.toLowerCase();
  if (org.includes('zagreb')) score += 5;
  if (/geoportal/i.test(pkg.title ?? '')) score += 1;
  if (pkg.resources?.some(isGeoJsonResource)) score += 3;
  return score;
};

/**
 * 1. pretraži CKAN (package_search) s nekoliko upita,
 * 2. zadrži skupove čiji naslov odgovara i koji imaju GeoJSON resurs,
 * 3. preuzmi resurs i provjeri strukturu – prvi ispravan pobjeđuje.
 */
export async function discoverDataset<T>(client: CkanClient, spec: DatasetSpec<T>): Promise<DiscoveredDataset<T>> {
  const packages = new Map<string, CkanPackage>();
  let lastSearchError: unknown = null;
  for (const query of spec.searchQueries) {
    try {
      for (const pkg of await client.packageSearch(query)) packages.set(pkg.id, pkg);
    } catch (err) {
      lastSearchError = err;
    }
  }
  if (packages.size === 0 && lastSearchError) throw lastSearchError;

  const candidates = [...packages.values()]
    .filter((pkg) => spec.titlePattern.test(pkg.title ?? ''))
    .filter((pkg) => (pkg.resources ?? []).some(isGeoJsonResource))
    .sort((a, b) => scorePackage(b, spec) - scorePackage(a, spec));

  if (candidates.length === 0) {
    throw new AppError(
      502,
      ErrorCodes.CKAN_RESOURCE_NOT_FOUND,
      `Na Portalu otvorenih podataka nije pronađen GeoJSON resurs za skup "${spec.label}".`,
    );
  }

  const problems: string[] = [];
  for (const pkg of candidates) {
    for (const resource of pkg.resources.filter(isGeoJsonResource)) {
      try {
        const raw = await client.downloadJson<unknown>(resource.url);
        const { data, skipped, featureCount } = spec.parse(raw);
        return { data, source: buildSource(pkg, resource, featureCount, skipped) };
      } catch (err) {
        problems.push(`${pkg.name}/${resource.id}: ${errorMessage(err)}`);
        if (err instanceof AppError && err.code === ErrorCodes.CKAN_UNAVAILABLE && candidates.length === 1) throw err;
      }
    }
  }
  const allInvalid = problems.every((p) => p.includes('GeoJSON nije ispravan') || p.includes('nema očekivanu'));
  throw new AppError(
    502,
    allInvalid ? ErrorCodes.INVALID_GEOJSON : ErrorCodes.CKAN_RESOURCE_NOT_FOUND,
    `Nijedan GeoJSON resurs za "${spec.label}" nije upotrebljiv. ${problems.join(' | ')}`,
  );
}

function buildSource(pkg: CkanPackage, resource: CkanResource, featureCount: number, skipped: number): DatasetSource {
  return {
    datasetId: pkg.id,
    datasetName: pkg.name,
    datasetTitle: pkg.title,
    organization: pkg.organization?.title ?? null,
    license: pkg.license_title ?? pkg.license_id ?? null,
    resourceId: resource.id,
    resourceName: resource.name ?? '',
    resourceUrl: resource.url,
    portalUrl: `${config.ckan.portalUrl}/${pkg.name}`,
    fetchedAt: new Date().toISOString(),
    featureCount,
    skippedFeatures: skipped,
  };
}
