import { describe, expect, it } from 'vitest';
import { serveUpload } from '../controllers/mediaController';

describe('authenticated upload serving', () => {
  it('exports a controller for auth-gated upload downloads', () => {
    expect(typeof serveUpload).toBe('function');
  });
});
