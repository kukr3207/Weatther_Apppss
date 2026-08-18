import { describe, expect, test, vi } from 'vitest';
import {
  backupFileName,
  createWorkspaceBackup,
  downloadTextFile,
  parseWorkspaceBackup,
  readTextFile,
  serializeWorkspaceBackup,
} from './dataTransfer';

describe('workspace data transfer', () => {
  test('creates a versioned portable backup', () => {
    const backup = createWorkspaceBackup({ settings: { theme: 'dark' }, unknown: true }, {
      now: new Date('2024-03-15T12:00:00Z'),
    });
    expect(backup).toMatchObject({
      format: 'weather-workspace-backup',
      version: 1,
      exportedAt: '2024-03-15T12:00:00.000Z',
      sections: { settings: { theme: 'dark' } },
    });
    expect(backup.sections.unknown).toBeUndefined();
  });

  test('serializes and parses recognized sections', () => {
    const text = serializeWorkspaceBackup({ favorites: [{ name: 'Paris' }] });
    expect(parseWorkspaceBackup(text).sections.favorites).toEqual([{ name: 'Paris' }]);
  });

  test('rejects malformed or unrelated files', () => {
    expect(() => parseWorkspaceBackup('{bad')).toThrow('valid JSON');
    expect(() => parseWorkspaceBackup({ format: 'something-else', version: 1, sections: {} })).toThrow('not a Weather Workspace');
    expect(() => parseWorkspaceBackup({ format: 'weather-workspace-backup', version: 2, sections: {} })).toThrow('not supported');
  });

  test('creates a stable dated file name', () => {
    expect(backupFileName(new Date('2024-03-15T12:00:00Z'))).toBe('weather-workspace-2024-03-15.json');
  });

  test('reads browser file text and enforces the size limit', async () => {
    await expect(readTextFile({ size: 5, text: async () => 'hello' })).resolves.toBe('hello');
    await expect(readTextFile({ size: 3_000_000, text: async () => '' })).rejects.toThrow('smaller than 2 MB');
  });

  test('downloads text through an object URL', () => {
    const click = vi.fn();
    const append = vi.fn();
    const anchor = { click, remove: vi.fn(), hidden: false };
    const document = { createElement: vi.fn(() => anchor), body: { append } };
    const urlApi = { createObjectURL: vi.fn(() => 'blob:test'), revokeObjectURL: vi.fn() };
    const result = downloadTextFile('{}', 'backup.json', { document, urlApi, BlobType: Blob });
    expect(result).toBe(true);
    expect(anchor.download).toBe('backup.json');
    expect(click).toHaveBeenCalled();
    expect(urlApi.revokeObjectURL).toHaveBeenCalledWith('blob:test');
  });
});
