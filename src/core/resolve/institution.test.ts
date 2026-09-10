import { describe, expect, it } from 'vitest';
import { resolveInstitution, type InstitutionCandidate } from './institution';

const EXISTING: InstitutionCandidate[] = [
  { id: 'i1', name: 'Hospital DemoCare Pacific', city: 'Ciudad de Panamá', countryIso: 'PA' },
  { id: 'i2', name: 'Clínica Andes Altos', city: 'Lima', countryIso: 'PE' },
];

describe('resolveInstitution', () => {
  it('auto-merges a near-identical name in the same country', () => {
    const result = resolveInstitution({ name: 'DemoCare Pacific Hospital', city: 'Panamá', countryIso: 'PA' }, EXISTING);
    expect(result.kind).toBe('auto_merge');
    if (result.kind === 'auto_merge') expect(result.institution.id).toBe('i1');
  });

  it('asks about a moderately similar name', () => {
    const result = resolveInstitution({ name: 'Hospital DemoCare', city: null, countryIso: 'PA' }, EXISTING);
    expect(result.kind).toBe('ask');
  });

  it('treats an unrelated name as a new institution', () => {
    const result = resolveInstitution({ name: 'Centro Médico del Valle', city: null, countryIso: 'MX' }, EXISTING);
    expect(result.kind).toBe('new');
  });

  it('blocks on country — never auto-merges across countries even with an identical name', () => {
    const result = resolveInstitution({ name: 'Hospital DemoCare Pacific', city: null, countryIso: 'BR' }, EXISTING);
    expect(result.kind).toBe('new');
  });

  it('does not block when the candidate has no known country', () => {
    const result = resolveInstitution({ name: 'Hospital DemoCare Pacific', city: null, countryIso: null }, EXISTING);
    expect(result.kind).toBe('auto_merge');
  });
});
