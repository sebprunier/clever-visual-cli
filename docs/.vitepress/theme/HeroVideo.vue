<script setup lang="ts">
import { withBase } from 'vitepress';
import { onMounted, ref } from 'vue';

/**
 * The motion design of clever-visual-cli (scripts/motion/), where the home page
 * of the documentation would show the logo. It plays muted and loops, unless
 * the reader asked for less motion; the controls give the sound-free full screen.
 */
const video = ref<HTMLVideoElement>();

onMounted(() => {
  if (!window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    void video.value?.play().catch(() => {
      // Autoplay refused: the poster and the controls stay.
    });
  }
});
</script>

<template>
  <div class="hero-video">
    <video
      ref="video"
      :src="withBase('/video/clever-visual-cli.mp4')"
      :poster="withBase('/video/poster.jpg')"
      muted
      loop
      playsinline
      controls
      preload="metadata"
      aria-label="clever-visual-cli in about 90 seconds: filters and grouping, favourite views, costs, actions on a selection, the logs of several applications merged, application and access logs, the status, signing in with a token"
    ></video>
  </div>
</template>
