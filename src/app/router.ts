import { createRouter, createWebHashHistory } from 'vue-router'
import WorkspacePage from '../pages/WorkspacePage.vue'

export const router = createRouter({
  history: createWebHashHistory(),
  routes: [
    {
      path: '/',
      component: WorkspacePage,
    },
  ],
})
