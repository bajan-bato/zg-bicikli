import { createApp } from './app.js';
import { config } from './config/index.js';
import { GeocodingService } from './services/geocoding/geocodingService.js';
import { InfrastructureService } from './services/infrastructure/infrastructureService.js';
import { OsmNetworkProvider } from './services/routing/osmNetwork.js';
import { RoutingService } from './services/routing/routingService.js';

const infrastructure = new InfrastructureService();
const routing = new RoutingService();
const geocoding = new GeocodingService();
const osm = new OsmNetworkProvider();

const app = createApp({ infrastructure, routing, geocoding }, { serveClient: config.isProduction });

app.listen(config.port, () => {
  console.log(`[server] Zagreb Bike Navigator API: http://localhost:${config.port}/api`);
});

// Podaci se pripremaju u pozadini – API odmah odgovara (s 503 dok podaci nisu spremni).
void (async () => {
  await infrastructure.init();
  infrastructure.onCyclewaysChanged((data) => {
    console.log('[routing] Biciklističke staze osvježene – ponovno povezivanje s mrežom');
    routing.updateCycleways(data);
  });
  await routing.initialize(
    () => osm.load((msg) => console.log(`[osm] ${msg}`)),
    () => infrastructure.cycleways.peek()?.data ?? null,
  );
})();
