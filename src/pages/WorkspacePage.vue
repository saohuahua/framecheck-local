<script setup lang="ts">
import { useRouter } from 'vue-router'
import ViewerShell from '../features/viewer/ViewerShell.vue'

const router = useRouter()
</script>

<template>
  <ViewerShell @open-conversion="router.push('/conversion')" />
</template>
