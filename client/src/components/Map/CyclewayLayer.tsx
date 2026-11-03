import L from 'leaflet';
import { useEffect } from 'react';
import { useMap } from 'react-leaflet';
import type { CyclewayCollection, CyclewayProperties } from '../../types';
import { escapeHtml } from '../../utils/html';
import { formatDistance } from '../../utils/format';
import { cyclewayStyle } from './mapStyles';

/** Šifra kategorije prikazuje se kako je u izvoru – portal ne objavljuje legendu šifri. */
export function cyclewayPopupHtml(p: CyclewayProperties): string {
  const rows: Array<[string, string | null]> = [
    ['Kategorija (šifra)', p.kategorija_id],
    ['Završni sloj', p.zavrsni_sloj],
    ['Duljina (geometrija)', formatDistance(p.geomLengthM)],
    ['Gradska četvrt', p.GRADSKA_CETVRT],
    ['Mjesni odbor', p.MJESNI_ODBOR],
  ];
  return `<div class="info-popup"><h3>${escapeHtml(p.lokacija ?? 'Biciklistička staza')}</h3><dl>${rows
    .filter(([, v]) => v)
    .map(([k, v]) => `<dt>${k}</dt><dd>${escapeHtml(v!)}</dd>`)
    .join('')}</dl></div>`;
}

/**
 * Sloj biciklističkih staza (GeoJSON s data.gov.hr). Crta se na canvas rendereru
 * radi performansi (~2900 višestrukih linija).
 */
export function CyclewayLayer({ data }: { data: CyclewayCollection }) {
  const map = useMap();
  useEffect(() => {
    // Renderer se stvara po montiranju: Leaflet ga ne može ponovno koristiti nakon uklanjanja.
    const renderer = L.canvas({ padding: 0.5, tolerance: 6, pane: 'cycleways' });
    const layer = L.geoJSON(data as unknown as GeoJSON.GeoJsonObject, {
      pane: 'cycleways',
      style: () => ({ ...cyclewayStyle(), renderer }) as L.PathOptions,
      onEachFeature: (feature, l) => {
        const path = l as L.Path;
        path.bindPopup(cyclewayPopupHtml(feature.properties as CyclewayProperties), { maxWidth: 280 });
        path.on('mouseover', () => path.setStyle(cyclewayStyle(true)));
        path.on('mouseout', () => path.setStyle(cyclewayStyle(false)));
      },
    });
    layer.addTo(map);
    return () => {
      layer.remove();
      renderer.remove();
    };
  }, [data, map]);

  return null;
}
