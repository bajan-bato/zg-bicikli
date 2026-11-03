import type { CyclewayCollection, ParkingCollection } from '../../../../shared/types/index.js';
import type { DatasetSpec } from '../ckan/datasetDiscovery.js';
import { parseCycleways, parseParking } from './geojsonParsers.js';

/**
 * Što tražimo na data.gov.hr. Identifikatori se NE hardkodiraju – utvrđuju se
 * pretraživanjem; pronađene vrijednosti dokumentirane su u README.md.
 */
export const cyclewaySpec: DatasetSpec<CyclewayCollection> = {
  key: 'cycleways',
  label: 'Biciklističke staze (Grad Zagreb)',
  searchQueries: ['biciklističke staze', 'bicikl*'],
  titlePattern: /biciklisti[čc]k\w*\s+staz/i,
  parse: parseCycleways,
};

export const parkingSpec: DatasetSpec<ParkingCollection> = {
  key: 'parking',
  label: 'Parkirališta za bicikle (Grad Zagreb)',
  searchQueries: ['parkirališta za bicikle', 'bicikl*'],
  titlePattern: /parkirali[šs]t\w*\s+za\s+bicikl/i,
  parse: parseParking,
};
