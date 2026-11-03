import { act, renderHook } from '@testing-library/react';
import { vi } from 'vitest';
import { DEFAULT_CONFIG } from './useAppData';
import { useNavigation } from './useNavigation';
import { api } from '../services/api';
import { pt, testRoute } from '../test/fixtures';

type Success = (p: GeolocationPosition) => void;
type Failure = (e: GeolocationPositionError) => void;

function mockGeolocation() {
  let success: Success | null = null;
  let failure: Failure | null = null;
  const geo = {
    watchPosition: vi.fn((s: Success, e: Failure, _options?: PositionOptions) => {
      success = s;
      failure = e;
      return 42;
    }),
    clearWatch: vi.fn(),
    getCurrentPosition: vi.fn(),
  };
  Object.defineProperty(navigator, 'geolocation', { value: geo, configurable: true });
  const emit = (x: number, y: number, t: number, accuracy = 8) => {
    const [lon, lat] = pt(x, y);
    success?.({ coords: { latitude: lat, longitude: lon, accuracy, heading: null }, timestamp: t } as unknown as GeolocationPosition);
  };
  const fail = (code: number) => failure?.({ code } as GeolocationPositionError);
  return { geo, emit, fail };
}

describe('useNavigation', () => {
  afterEach(() => vi.restoreAllMocks());

  it('nakon odstupanja ponovno izračunava rutu od trenutne lokacije', async () => {
    const { geo, emit } = mockGeolocation();
    const newRoute = testRoute({ id: 'novo', geometry: { type: 'LineString', coordinates: [pt(300, 150), pt(1550, 150), pt(1550)] } });
    const recalc = vi.spyOn(api, 'recalculate').mockResolvedValue(newRoute);
    const onRouteChange = vi.fn();
    const notify = vi.fn();
    const { result } = renderHook(() => useNavigation({ config: DEFAULT_CONFIG, onRouteChange, notify }));
    const end = { lat: pt(1550)[1], lon: pt(1550)[0] };

    act(() => result.current.start(testRoute(), end, 'cycleways'));
    expect(geo.watchPosition).toHaveBeenCalledOnce();
    expect(geo.watchPosition.mock.calls[0][2]).toMatchObject({ enableHighAccuracy: true });

    act(() => emit(300, 0, 0));
    act(() => emit(300, 120, 1000));
    act(() => emit(300, 130, 3000));
    expect(recalc).not.toHaveBeenCalled(); // nema preračunavanja pri svakom ažuriranju

    await act(async () => emit(300, 140, 5500));
    expect(recalc).toHaveBeenCalledOnce();
    const [current, target, mode] = recalc.mock.calls[0];
    expect(current.lat).toBeCloseTo(pt(300, 140)[1], 6);
    expect(target).toEqual(end);
    expect(mode).toBe('cycleways');
    expect(onRouteChange).toHaveBeenCalledWith(newRoute);
    expect(notify).toHaveBeenCalledWith('warning', expect.stringMatching(/Skrenuli ste s rute/));
  });

  it('odbijeno dopuštenje zaustavlja navigaciju s porukom', () => {
    const { geo, fail } = mockGeolocation();
    const notify = vi.fn();
    const { result } = renderHook(() => useNavigation({ config: DEFAULT_CONFIG, onRouteChange: vi.fn(), notify }));
    act(() => result.current.start(testRoute(), { lat: 45.8, lon: 15.99 }, 'shortest'));
    act(() => fail(1));
    expect(notify).toHaveBeenCalledWith('error', expect.stringMatching(/odbijen/));
    expect(geo.clearWatch).toHaveBeenCalledWith(42);
    expect(result.current.state.active).toBe(false);
  });

  it('nedostupan GPS signal prikazuje poruku i nastavlja praćenje', () => {
    const { geo, fail } = mockGeolocation();
    const { result } = renderHook(() => useNavigation({ config: DEFAULT_CONFIG, onRouteChange: vi.fn(), notify: vi.fn() }));
    act(() => result.current.start(testRoute(), { lat: 45.8, lon: 15.99 }, 'shortest'));
    act(() => fail(2));
    expect(result.current.state.gpsError).toMatch(/GPS signal/);
    expect(result.current.state.active).toBe(true);
    expect(geo.clearWatch).not.toHaveBeenCalled();
  });

  it('završetak navigacije i unmount čiste Geolocation watch', () => {
    const { geo } = mockGeolocation();
    const { result, unmount } = renderHook(() => useNavigation({ config: DEFAULT_CONFIG, onRouteChange: vi.fn(), notify: vi.fn() }));
    act(() => result.current.start(testRoute(), { lat: 45.8, lon: 15.99 }, 'shortest'));
    act(() => result.current.stop());
    expect(geo.clearWatch).toHaveBeenCalledWith(42);
    act(() => result.current.start(testRoute(), { lat: 45.8, lon: 15.99 }, 'shortest'));
    geo.clearWatch.mockClear();
    unmount();
    expect(geo.clearWatch).toHaveBeenCalledWith(42);
  });
});
