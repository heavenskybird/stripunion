import { defineConfig } from 'astro/config';
import publicationDeployment from './scripts/publication-deployment.mjs';

export default defineConfig({
  site: 'https://stripunion.com',
  output: 'static',
  integrations: [publicationDeployment()],
  trailingSlash: 'never'
});
