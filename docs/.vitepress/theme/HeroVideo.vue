<script setup lang="ts">
import { withBase } from 'vitepress';
import { ref } from 'vue';

/**
 * The motion design of clever-visual-cli (scripts/motion/), where the home page
 * of the documentation would show the logo. It waits for the reader: the poster
 * and a play button first, the controls once it plays. Only its metadata loads
 * with the page.
 */
const video = ref<HTMLVideoElement>();
const started = ref(false);

function play(): void {
  started.value = true;
  void video.value?.play();
}
</script>

<template>
  <div class="hero-video">
    <video
      ref="video"
      :src="withBase('/video/clever-visual-cli.mp4')"
      :poster="withBase('/video/poster.jpg')"
      :controls="started"
      playsinline
      preload="metadata"
      aria-label="clever-visual-cli in about 90 seconds: filters and grouping, favourite views, costs, actions on a selection, the logs of several applications merged, application and access logs, the status, signing in with a token"
      @play="started = true"
    ></video>
    <button v-if="!started" type="button" class="hero-video-play" @click="play">
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5.5v13l10.5-6.5z" fill="currentColor" /></svg>
      <span>Watch it in 90 seconds</span>
    </button>
  </div>
</template>
