import { describe, expect, it } from 'vitest';

import { hasContextualRightRail, isPrintableRoute } from './shell-routes';

describe('hasContextualRightRail', () => {
  it('is true on law detail, diff, graph, and chat', () => {
    expect(hasContextualRightRail('/laws/CE-1978')).toBe(true);
    expect(hasContextualRightRail('/laws/CE-1978/diff')).toBe(true);
    expect(hasContextualRightRail('/graph')).toBe(true);
    expect(hasContextualRightRail('/chat')).toBe(true);
    expect(hasContextualRightRail('/chat/eipd')).toBe(true);
  });

  it('is false on rail-less surfaces', () => {
    expect(hasContextualRightRail('/home')).toBe(false);
    expect(hasContextualRightRail('/explorer')).toBe(false);
    expect(hasContextualRightRail('/communities')).toBe(false);
    expect(hasContextualRightRail('/dashboards')).toBe(false);
    expect(hasContextualRightRail('/search')).toBe(false);
    expect(hasContextualRightRail('/settings')).toBe(false);
    expect(hasContextualRightRail('/editor')).toBe(false);
  });
});

describe('isPrintableRoute', () => {
  it('allows document-like pages', () => {
    expect(isPrintableRoute('/home')).toBe(true);
    expect(isPrintableRoute('/explorer')).toBe(true);
    expect(isPrintableRoute('/search')).toBe(true);
    expect(isPrintableRoute('/settings/models')).toBe(true);
    expect(isPrintableRoute('/dashboards/compliance')).toBe(true);
    expect(isPrintableRoute('/editor/draft')).toBe(true);
    expect(isPrintableRoute('/laws/CE-1978')).toBe(true);
    expect(isPrintableRoute('/communities')).toBe(true);
  });

  it('denies canvas and chat', () => {
    expect(isPrintableRoute('/graph')).toBe(false);
    expect(isPrintableRoute('/chat')).toBe(false);
    expect(isPrintableRoute('/chat/eipd')).toBe(false);
  });
});
