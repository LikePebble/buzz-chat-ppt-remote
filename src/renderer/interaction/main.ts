import { createApp } from 'vue'
import App from './App.vue'
import { installZoomGuard } from './zoom-guard'
const removeZoomGuard = installZoomGuard()
if (import.meta.hot) import.meta.hot.dispose(removeZoomGuard)
createApp(App).mount('#app')
