<script setup lang="ts">
import {ref, onMounted, Ref} from 'vue'
import { printMessage } from '../../utils/messageHandling';

const msg = "Print"
const isPrintable: Ref<boolean | undefined> = ref(undefined)

onMounted(async () => {
  const isPrintableResult = await chrome.runtime.sendMessage({event: "popup:opened"})
  console.log(isPrintableResult)
  isPrintable.value = isPrintableResult.result
})

const log = () => {
  printMessage()
}

</script>

<template>
  <div v-if="isPrintable === false">
    <h1>This site isn't printable</h1>
  </div>
  <div v-else-if="isPrintable === true">
    <h1>I can Print</h1>
    <button @click="log">{{ msg }}</button>
  </div>
  <div v-else>
    <h1>Loading...</h1>
  </div>
</template>

<style>

</style>