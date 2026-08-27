import { describe, expect, it } from 'vitest';

import { UGP_PROTOCOL_VERSION } from './index.js';

describe('@ui-grounding/protocol', () => {
  it('exposes the planned v0.1 protocol line', () => {
    expect(UGP_PROTOCOL_VERSION).toBe('0.1');
  });
});
