import { createElement } from 'react';
import { renderToString } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import {
  GroundingSurfaceProvider,
  useGroundingNode,
  useGroundingSnapshot,
} from './index.js';

function ServerProbe() {
  const binding = useGroundingNode({
    nodeId: 'metric',
    type: 'org.example.metric',
    label: 'Metric',
    authority: 'authoritative',
    anchorIds: [],
  });
  const snapshot = useGroundingSnapshot();
  return createElement('div', {
    ref: binding.ref,
    'data-node-count': snapshot.nodes.length,
  });
}

describe('React server behavior', () => {
  it('renders inert markup without registering nodes or DOM anchors', () => {
    const html = renderToString(
      createElement(
        GroundingSurfaceProvider,
        { surfaceId: 'surface:ssr', surfaceRevision: '1' },
        createElement(ServerProbe),
      ),
    );
    expect(html).toContain('data-node-count="0"');
    expect(html).not.toContain('data-ugp-anchor');
  });
});
