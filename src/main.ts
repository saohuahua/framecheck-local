import { createApp } from 'vue'
import { pinia } from './app/pinia'
import { router } from './app/router'
import './shared/styles/tokens.css'
import './shared/styles/reset.css'
import './shared/styles/workspace.css'
import App from './App.vue'

createApp(App).use(pinia).use(router).mount('#app')
