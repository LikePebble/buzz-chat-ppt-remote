<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue'
import logo from '@renderer/assets/logo.svg'
const versions = reactive({ ...window.electron.process.versions })
const appVersion = ref('')
onMounted(async () => {
  appVersion.value = await window.api.getAppVersion()
})
</script>

<template>
  <a-row justify="center" style="margin-top: 10px">
    <a-col :span="6">
      <img :src="logo" style="width: 86px" />
    </a-col>
    <a-col :span="16">
      <span>本地助手{{ appVersion }}</span>
      <ul class="versions">
        <li>Electron v{{ versions.electron }}</li>
        <li>Chromium v{{ versions.chrome }}</li>
        <li>Node v{{ versions.node }}</li>
        <li>Copyright ©2025 smilexizheng.</li>
      </ul>
    </a-col>
  </a-row>
</template>

<style scoped>
* {
  font-family: 'Menlo', 'Lucida Console', monospace;
}
.versions {
  padding: 15px 0;

  display: grid;
  overflow: hidden;
  align-items: center;
  border-radius: 22px;
  backdrop-filter: blur(24px);
}

.versions li {
  font-size: 12px;
  line-height: 18px;
  opacity: 0.8;
}
</style>
