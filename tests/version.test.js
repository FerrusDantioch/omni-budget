import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

describe('Configuration et version unifiee', () => {
  it('injecte __APP_VERSION__ correspondant a package.json (2.0.1)', () => {
    const pkg = JSON.parse(fs.readFileSync(path.resolve('package.json'), 'utf8'));
    expect(pkg.version).toBe('2.0.1');
    expect(typeof __APP_VERSION__).toBe('string');
    expect(__APP_VERSION__).toBe(pkg.version);
  });

  it('fournit public/theme-init.js avec support du theme omni et cle budget-theme', () => {
    const contenu = fs.readFileSync(path.resolve('public/theme-init.js'), 'utf8');
    expect(contenu).toContain('budget-theme');
    expect(contenu).toContain("'omni'");
    expect(contenu).toContain('#0e0d12');
  });
});
