import type { Theme } from 'vitepress';
import DefaultTheme from 'vitepress/theme';
import { h } from 'vue';
import HeroVideo from './HeroVideo.vue';
import './custom.css';

export default {
  extends: DefaultTheme,
  // The motion design in the hero of the home page, instead of the logo.
  Layout: () => h(DefaultTheme.Layout, null, { 'home-hero-image': () => h(HeroVideo) }),
} satisfies Theme;
