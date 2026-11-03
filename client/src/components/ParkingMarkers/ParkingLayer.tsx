import L from 'leaflet';
import 'leaflet.markercluster';
import { useEffect } from 'react';
import { useMap } from 'react-leaflet';
import { parkingIcon } from '../Map/mapStyles';
import type { ParkingCollection, ParkingProperties } from '../../types';
import { escapeHtml } from '../../utils/html';

const display = (v: string | number | null): string => (v === null || v === '' ? '–' : escapeHtml(String(v)));

/** Sadržaj informacijskog prozora parkirališta – sva polja iz izvora podataka. */
export function parkingPopupHtml(p: ParkingProperties, coords: [number, number]): string {
  const rows: Array<[string, string | number | null]> = [
    ['Lokacija', p.lokacija],
    ['Vrsta', p.vrsta],
    ['Broj stalaka', p.broj_stalaka],
    ['Kapacitet (bicikala)', p.broj_bicikala],
    ['Godina postavljanja', p.godina_postavljanja],
    ['Gradska četvrt', p.GRADSKA_CETVRT],
    ['Mjesni odbor', p.MJESNI_ODBOR],
    ['Koordinate', `${coords[1].toFixed(5)}, ${coords[0].toFixed(5)}`],
  ];
  return `<div class="info-popup"><h3>${escapeHtml(p.naziv ?? 'Parkiralište za bicikle')}</h3><dl>${rows
    .map(([k, v]) => `<dt>${k}</dt><dd>${display(v)}</dd>`)
    .join('')}</dl></div>`;
}

/** Markeri na stvarnim koordinatama iz GeoJSON-a. */
export function createParkingMarkers(data: ParkingCollection): L.Marker[] {
  return data.features.map((f) => {
    const [lon, lat] = f.geometry.coordinates;
    const marker = L.marker([lat, lon], { icon: parkingIcon, title: f.properties.naziv ?? 'Parkiralište za bicikle', keyboard: true });
    marker.bindPopup(parkingPopupHtml(f.properties, f.geometry.coordinates), { maxWidth: 300 });
    return marker;
  });
}

/** Parkirališta s grupiranjem markera pri udaljenom prikazu (leaflet.markercluster). */
export function ParkingLayer({ data }: { data: ParkingCollection }) {
  const map = useMap();

  useEffect(() => {
    const cluster = L.markerClusterGroup({
      showCoverageOnHover: false,
      maxClusterRadius: 45,
      disableClusteringAtZoom: 16,
      spiderfyOnMaxZoom: true,
      iconCreateFunction: (c) =>
        L.divIcon({
          className: 'parking-cluster',
          html: `<span>${c.getChildCount()}</span>`,
          iconSize: [34, 34],
        }),
    });
    cluster.addLayers(createParkingMarkers(data));
    map.addLayer(cluster);
    return () => {
      map.removeLayer(cluster);
    };
  }, [data, map]);

  return null;
}
