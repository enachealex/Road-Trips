// Runs after `expo export --platform web` to make dist/ ready for GitHub Pages.
import { randomBytes } from 'node:crypto';
import { copyFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs';

// Optional argument: the export folder, relative to the project (default dist).
const dist = new URL(`../${process.argv[2] || 'dist'}/`, import.meta.url);
const domain = process.env.SITE_DOMAIN || 'roadtrip.thejumpvault.com';

if (!existsSync(new URL('index.html', dist))) {
  console.error('dist/index.html not found. Run `expo export --platform web` first.');
  process.exit(1);
}

// GitHub Pages has no rewrites. It serves 404.html for unknown paths, so making that the
// app itself lets links like /trip/abc123 open straight into the trip.
copyFileSync(new URL('index.html', dist), new URL('404.html', dist));

// Custom domain, and skip Jekyll processing (it would hide the _expo folder).
writeFileSync(new URL('CNAME', dist), `${domain}\n`);
writeFileSync(new URL('.nojekyll', dist), '');

// Give the service worker a fresh version so phones pick up the new build.
const swPath = new URL('sw.js', dist);
const buildId = `${Date.now().toString(36)}-${randomBytes(3).toString('hex')}`;
writeFileSync(swPath, readFileSync(swPath, 'utf8').replace('__BUILD_ID__', buildId));

console.log(`Prepared ${process.argv[2] || 'dist'}/ for GitHub Pages (${domain}, build ${buildId}).`);
