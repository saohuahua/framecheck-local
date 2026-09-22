import { createRouter, createWebHashHistory } from 'vue-router'
import ConversionPage from '../pages/ConversionPage.vue'
import WorkspacePage from '../pages/WorkspacePage.vue'

export const router = createRouter({
  history: createWebHashHistory(),
  routes: [
    {
      path: '/',
      component: WorkspacePage,
    },
    {
      path: '/conversion',
      component: ConversionPage,
    },
  ],
})
