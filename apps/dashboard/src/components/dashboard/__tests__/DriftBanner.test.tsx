import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import DriftBanner from '../DriftBanner';

describe('DriftBanner', () => {
  it('renders nothing when count is 0', () => {
    render(<DriftBanner count={0} />);
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('renders banner with count=1 mentioning "1" and "unexpected shape"', () => {
    render(<DriftBanner count={1} />);
    const banner = screen.getByRole('alert');
    expect(banner).toBeDefined();
    expect(banner.textContent).toContain('1');
    expect(banner.textContent).toContain('unexpected shape');
  });

  it('renders banner with count=42 mentioning "42"', () => {
    render(<DriftBanner count={42} />);
    const banner = screen.getByRole('alert');
    expect(banner).toBeDefined();
    expect(banner.textContent).toContain('42');
  });

  it('banner text contains no payload data (only count is rendered)', () => {
    render(<DriftBanner count={7} />);
    const banner = screen.getByRole('alert');
    // Only the count number and static description text should appear — no IDs, keys, or payload values
    expect(banner.textContent).toMatch(/^7 events? with unexpected shape — schema validation failed$/);
  });

  it('banner element has aria-live="polite" when count > 0', () => {
    render(<DriftBanner count={3} />);
    const banner = screen.getByRole('alert');
    expect(banner.getAttribute('aria-live')).toBe('polite');
  });
});
