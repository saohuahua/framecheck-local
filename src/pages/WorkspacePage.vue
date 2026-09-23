<script setup lang="ts">
import { useRouter } from 'vue-router'
import { getDesktopComposition } from '../app/desktop-composition'
import ViewerShell from '../features/viewer/ViewerShell.vue'

const router = useRouter()
const desktop = getDesktopComposition()
</script>

<template>
  <ViewerShell
    :vue-export-port="desktop.vueExport"
    @open-conversion="router.push('/conversion')"
  />
</template>
