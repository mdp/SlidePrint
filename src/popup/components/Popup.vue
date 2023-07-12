<script setup lang="ts">
import {ref, onMounted, Ref} from 'vue'
import { printMessage } from '../../utils/messageHandling';
import { version } from '../../../package.json'
import { findHandlerFor } from '../../handlers';

const isPrintable: Ref<boolean | undefined> = ref(undefined)

onMounted(async () => {
  await chrome.runtime.sendMessage({event: "popup:opened"})
  const [tab] = await chrome.tabs.query({ active: true });
  if (tab && tab.id && tab.url) {
    isPrintable.value = !!findHandlerFor(tab.url)
  } else {
    isPrintable.value = false
  }
})

const log = () => {
  printMessage()
}

</script>

<template>

  <section class="py-8 px-16 flex items-center min-h-screen justify-center bg-white">
    <div class="mx-auto">
      <div class="text-center">
        <h1 class="mt-3 text-[3.5rem] font-bold tracking-tight text-black">SlidePrint</h1>
        <p class="text-lg font-medium text-indigo-600/95">v{{ version }}</p>
      </div>

      <div class="flex items-center justify-center gap-4">
        <p v-if="isPrintable == false" class="mt-6 flex items-center justify-center gap-4">
          <h1 class="text-md">It doesn't look like SlidePrint works on this site</h1>
        </p>
        <div v-else-if="isPrintable" class="mt-6 flex items-center justify-center gap-4">
          <a href="#" @click="log" class="transform rounded-md bg-indigo-600/95 px-5 py-3 text-lg text-white transition-colors hover:bg-indigo-700">Print Slides!</a>
        </div>
      </div>
      <div class="mt-6 flex items-center justify-center gap-4">
        <p class="mt-3 text-sm leading-relaxed text-slate-400">
          <a href="https://github.com/mdp/SlidePrint">Github</a> | <a href="https://github.com/mdp/SlidePrint/blob/main/PRIVACY.md">Privacy Policy</a>
        </p>
      </div>
    </div>
  </section>
</template>

<style>

</style>../../../manifest