import { getLocale } from './core/i18n.js';
import { initTheme } from './core/themes.js';
import './ui/cvc-app.js';

initTheme();

document.documentElement.lang = getLocale();
