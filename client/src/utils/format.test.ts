import { formatDistance, formatDuration, formatPercent } from './format';

describe('formatiranje', () => {
  it('udaljenost', () => {
    expect(formatDistance(42)).toBe('42 m');
    expect(formatDistance(347)).toBe('350 m');
    expect(formatDistance(1530)).toBe('1,5 km');
    expect(formatDistance(12_400)).toBe('12 km');
  });

  it('trajanje', () => {
    expect(formatDuration(20)).toBe('1 min');
    expect(formatDuration(38 * 60)).toBe('38 min');
    expect(formatDuration(75 * 60)).toBe('1 h 15 min');
  });

  it('postotak', () => {
    expect(formatPercent(0.836)).toBe('84 %');
  });
});
