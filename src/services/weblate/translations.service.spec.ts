import { WeblateTranslationsService } from './translations.service';
import { unitsList, unitsPartialUpdate } from '../../client';
import type { Unit } from '../../client';
import type { WeblateClientService } from '../weblate-client.service';

jest.mock('../../client', () => ({
  unitsList: jest.fn(),
  unitsPartialUpdate: jest.fn(),
  translationsUnitsRetrieve: jest.fn(),
}));

const unitsListMock = unitsList as jest.MockedFunction<typeof unitsList>;
const unitsPartialUpdateMock = unitsPartialUpdate as jest.MockedFunction<
  typeof unitsPartialUpdate
>;

const makeUnit = (id: number, source: string): Unit =>
  ({ id, source: [source], target: [''], context: '' }) as unknown as Unit;

const page = (units: Unit[]) =>
  ({ data: { count: units.length, results: units } }) as unknown as Awaited<
    ReturnType<typeof unitsList>
  >;

const clientServiceStub = {
  getClient: () => ({}),
} as unknown as WeblateClientService;

describe('WeblateTranslationsService key lookup', () => {
  let service: WeblateTranslationsService;

  const queryOf = (call: number): string =>
    (unitsListMock.mock.calls[call][0] as unknown as { query: { q: string } })
      .query.q;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new WeblateTranslationsService(clientServiceStub);
  });

  it('stops at the context probe when it hits', async () => {
    unitsListMock.mockResolvedValueOnce(page([makeUnit(1, '_A')]));

    const unit = await service.getTranslationByKey('shoptet', 'cms-backend', 'cs', '_A');

    expect(unit?.id).toBe(1);
    expect(unitsListMock).toHaveBeenCalledTimes(1);
    expect(queryOf(0)).toContain('context:="_A"');
  });

  it('falls back to an exact source probe and escapes the key', async () => {
    unitsListMock
      .mockResolvedValueOnce(page([]))
      .mockResolvedValueOnce(page([makeUnit(1175891, 'He said "no"')]));

    const unit = await service.getTranslationByKey(
      'shoptet',
      'cms-backend',
      'cs',
      'He said "no"',
    );

    expect(unit?.id).toBe(1175891);
    expect(unitsListMock).toHaveBeenCalledTimes(2);
    expect(queryOf(1)).toContain('source:="He said \\"no\\""');
  });

  it('falls through to the legacy substring probe, then gives up', async () => {
    unitsListMock
      .mockResolvedValueOnce(page([]))
      .mockResolvedValueOnce(page([]))
      .mockResolvedValueOnce(page([]));

    const unit = await service.getTranslationByKey(
      'shoptet',
      'cms-backend',
      'cs',
      '_MISSING',
    );

    expect(unit).toBeNull();
    expect(unitsListMock).toHaveBeenCalledTimes(3);
    expect(queryOf(2)).toContain('context:"_MISSING"');
    expect(queryOf(2)).not.toContain('context:=');
  });

  it('refuses an ambiguous key instead of writing to the first match', async () => {
    unitsListMock
      .mockResolvedValueOnce(page([]))
      .mockResolvedValueOnce(page([makeUnit(1, '_DUP'), makeUnit(2, '_DUP')]));

    await expect(
      service.writeTranslation('shoptet', 'cms-backend', 'de', '_DUP', 'Wert'),
    ).rejects.toThrow(/ambiguous/);

    expect(unitsPartialUpdateMock).not.toHaveBeenCalled();
  });

  it('wraps a failing lookup instead of leaking the raw error', async () => {
    unitsListMock.mockRejectedValue(new Error('boom'));

    await expect(
      service.findTranslationsForKey('shoptet', '_A', 'cms-backend'),
    ).rejects.toThrow(/Failed to find translations for key/);
  });
});
