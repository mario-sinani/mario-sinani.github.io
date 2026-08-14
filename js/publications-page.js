/* Entry point for the publications page: the shared site features plus the
   three that only this page has. */

import { initSite } from './site.js';
import { initPubFilter } from './pub-filter.js';
import { initAbstracts } from './abstract.js';
import { initCite } from './cite.js';

initSite();
initPubFilter();
initAbstracts();
initCite();
