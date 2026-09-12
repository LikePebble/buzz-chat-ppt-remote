<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import { io, type Socket } from 'socket.io-client'
import QRCodeStyling from 'qr-code-styling'
import { NAMESPACE, REACTIONS } from '../../interaction/protocol'
import type {
  ClientEvents,
  ClientPayloads,
  ClientResults,
  Identity,
  PowerPointCommand,
  PowerPointStatus,
  Result,
  RoomState,
  ServerEvents,
  SystemStatus
} from '../../interaction/protocol'
import './style.css'

const desktop = window.buzzHost
const path = location.pathname.match(/^\/(r|host)\/([A-Z2-9]{6})$/)
const isHost = path?.[1] === 'host'
const roomId = path?.[2] ?? ''
const state = ref<RoomState | null>(null)
const identity = ref<Identity | null>(null)
const connected = ref(false)
const joining = ref(true)
const error = ref('')
const notice = ref('')
const hasBuzzed = ref(false)
const pressing = ref(false)
const chat = ref('')
const sending = ref(false)
const pptBusy = ref(false)
const ppt = ref<PowerPointStatus | null>(null)
const system = ref<SystemStatus | null>(null)
const selectedUrl = ref('')
const qrElement = ref<HTMLElement | null>(null)
const chatElement = ref<HTMLElement | null>(null)
const reactionBubbles = ref<{ id: number; emoji: string }[]>([])
const timers = new Set<ReturnType<typeof setTimeout>>()
let token = ''
let socket: Socket<ServerEvents, ClientEvents> | undefined
let qr: QRCodeStyling | undefined
let nextReaction = 0
const storageKey = `buzz:identity:${roomId}`
const hostStorageKey = `buzz:host:${roomId}`
const sourceUrl = '/source'
const pptLabels: Record<PowerPointCommand, string> = {
  advance: '다음 / 클릭 →',
  previous: '← 이전',
  blackout: '화면 검정 (B)',
  stop: '슬라이드 쇼 종료',
  startFromBeginning: '처음부터 시작',
  startFromCurrent: '현재부터 시작'
}
const isWinner = computed(
  () => !!identity.value && state.value?.buzz.winner?.participantId === identity.value.participantId
)
const buzzLabel = computed(() =>
  !connected.value
    ? '연결 대기'
    : !state.value?.buzz.enabled
      ? '버저 비활성'
      : isWinner.value
        ? '🏆 내가 1등!'
        : hasBuzzed.value
          ? '참여 완료 · 잠김'
          : pressing.value
            ? '전송 중…'
            : 'BUZZ'
)
const buzzHint = computed(() =>
  !connected.value
    ? '연결되면 참여할 수 있어요'
    : !state.value?.buzz.enabled
      ? '호스트가 버저를 켜면 참여할 수 있어요'
      : hasBuzzed.value
        ? '다음 라운드를 기다려 주세요'
        : state.value?.buzz.winner
          ? '아직 순위에 참여할 수 있어요'
          : '정답을 알면 바로 누르세요'
)
const canBuzz = computed(
  () => connected.value && state.value?.buzz.enabled && !hasBuzzed.value && !pressing.value
)
const connectionText = computed(() =>
  connected.value ? '연결됨' : joining.value ? '연결 중…' : '연결 끊김 · 자동 재접속 중'
)
function later(fn: () => void, ms: number): void {
  const timer = setTimeout(() => {
    timers.delete(timer)
    fn()
  }, ms)
  timers.add(timer)
}
function readStorage(key: string, session = false): string | null {
  try {
    return (session ? sessionStorage : localStorage).getItem(key)
  } catch {
    return null
  }
}
function saveStorage(key: string, value: string, session = false): void {
  try {
    ;(session ? sessionStorage : localStorage).setItem(key, value)
  } catch {
    notice.value = '브라우저 저장소를 사용할 수 없어 새로고침하면 익명 이름이 바뀔 수 있습니다.'
  }
}
async function command<K extends keyof ClientPayloads>(
  event: K,
  payload: ClientPayloads[K]
): Promise<ClientResults[K] | null> {
  if (!socket?.connected) {
    error.value = '서버에 연결되지 않았습니다.'
    return null
  }
  try {
    // EmitWithAck's variadic mapping cannot retain the correlation of generic K.
    const emit = socket.timeout(6000).emitWithAck.bind(socket) as (
      event: K,
      payload: ClientPayloads[K]
    ) => Promise<Result<ClientResults[K]>>
    const result = await emit(event, payload)
    if (!result.ok) {
      if (event === 'buzz:press' && result.error.code === 'ALREADY_BUZZED') hasBuzzed.value = true
      error.value = result.error.message
      return null
    }
    return result.data
  } catch {
    error.value = '서버 응답이 없습니다. 연결을 확인하세요.'
    return null
  }
}
async function joinRoom(): Promise<void> {
  joining.value = true
  error.value = ''
  if (isHost) {
    const result = await command('host:join', { roomId, token })
    if (result) {
      state.value = result.state
      connected.value = true
    }
  } else {
    let stored: Partial<Identity> = {}
    try {
      stored = JSON.parse(readStorage(storageKey) ?? '{}')
    } catch {
      /* Recover from invalid storage. */
    }
    const result = await command('room:join', {
      roomId,
      ...(stored?.participantId && stored?.resumeToken
        ? { participantId: stored.participantId, resumeToken: stored.resumeToken }
        : {})
    })
    if (result) {
      identity.value = result.identity
      state.value = result.state
      hasBuzzed.value = result.hasBuzzed
      saveStorage(storageKey, JSON.stringify(result.identity))
      connected.value = true
    }
  }
  joining.value = false
}
onMounted(async () => {
  if (!roomId) {
    error.value = '호스트 앱에 표시된 QR 코드로 입장해 주세요.'
    joining.value = false
    return
  }
  let serverUrl = location.origin
  if (isHost) {
    if (window.buzzHost) {
      try {
        const data = await window.buzzHost.bootstrap()
        token = data.token
        serverUrl = data.serverUrl
        system.value = data.system
      } catch {
        error.value = '호스트 초기화 실패. 앱을 다시 시작하세요.'
        joining.value = false
        return
      }
    } else {
      token =
        new URLSearchParams(location.hash.slice(1)).get('token') ??
        readStorage(hostStorageKey, true) ??
        ''
      history.replaceState(null, '', location.pathname)
      if (token) saveStorage(hostStorageKey, token, true)
      else {
        error.value = '데스크톱 앱에서 호스트 링크를 복사해 접속하세요.'
        joining.value = false
        return
      }
    }
  }
  socket = io(`${serverUrl}${NAMESPACE}`, {
    autoConnect: false,
    reconnection: true,
    reconnectionDelayMax: 3000
  })
  socket.on('connect', () => {
    void joinRoom()
  })
  socket.on('disconnect', () => {
    connected.value = false
    pressing.value = false
    joining.value = false
  })
  socket.on('connect_error', () => {
    connected.value = false
    joining.value = false
    error.value = '서버 연결 실패. 같은 Wi-Fi와 호스트 앱을 확인하세요.'
  })
  socket.on('room:state', (next) => {
    state.value = next
  })
  socket.on('presence:update', (participants) => {
    if (state.value) state.value.participants = participants
  })
  socket.on('buzz:state', (buzz) => {
    if (!state.value) return
    if (buzz.round !== state.value.buzz.round) {
      hasBuzzed.value = false
      pressing.value = false
      error.value = ''
    }
    if (buzz.ranking.some((entry) => entry.participantId === identity.value?.participantId))
      hasBuzzed.value = true
    state.value.buzz = buzz
  })
  socket.on('chat:message', (message) => {
    if (state.value) {
      state.value.chatHistory.push(message)
      state.value.chatHistory = state.value.chatHistory.slice(-50)
    }
  })
  socket.on('reaction:event', (event) => {
    const id = nextReaction++
    reactionBubbles.value = [...reactionBubbles.value.slice(-19), { id, emoji: event.emoji }]
    later(() => {
      reactionBubbles.value = reactionBubbles.value.filter((b) => b.id !== id)
    }, 2200)
  })
  socket.on('ppt:status', (status) => {
    ppt.value = status
  })
  socket.on('system:status', (status) => {
    system.value = status
  })
  socket.on('app:error', (problem) => {
    error.value = problem.message
  })
  socket.connect()
})
watch(
  () => system.value?.participantUrls,
  (urls) => {
    if (urls?.length && !urls.includes(selectedUrl.value)) selectedUrl.value = urls[0]
  },
  { immediate: true }
)
watch([selectedUrl, qrElement], async () => {
  await nextTick()
  if (!qrElement.value || !selectedUrl.value) return
  if (!qr)
    qr = new QRCodeStyling({
      width: 216,
      height: 216,
      type: 'svg',
      margin: 12,
      dotsOptions: { color: '#14251f', type: 'square' },
      backgroundOptions: { color: '#ffffff' },
      qrOptions: { errorCorrectionLevel: 'M' }
    })
  qr.update({ data: selectedUrl.value })
  qrElement.value.replaceChildren()
  qr.append(qrElement.value)
})
watch(
  () => state.value?.chatHistory.length,
  async () => {
    await nextTick()
    chatElement.value?.scrollTo({ top: chatElement.value.scrollHeight })
  }
)
onUnmounted(() => {
  socket?.disconnect()
  timers.forEach(clearTimeout)
})
async function buzz(): Promise<void> {
  if (!canBuzz.value || !state.value) return
  pressing.value = true
  error.value = ''
  const round = state.value.buzz.round
  const result = await command('buzz:press', { roundId: round })
  if (result && state.value.buzz.round === round) {
    hasBuzzed.value = true
    state.value.buzz = result
  }
  pressing.value = false
}
async function sendChat(): Promise<void> {
  if (!chat.value.trim() || sending.value) return
  sending.value = true
  if (await command('chat:send', { text: chat.value })) chat.value = ''
  sending.value = false
}
async function pptCommand(action: PowerPointCommand): Promise<void> {
  pptBusy.value = true
  error.value = ''
  const result = await command('ppt:command', { command: action })
  if (result) {
    ppt.value = result
    notice.value = `${pptLabels[action]} 명령 전송 완료`
  }
  pptBusy.value = false
}
async function copyLink(host = false): Promise<void> {
  const text = host
    ? selectedUrl.value.replace('/r/', '/host/') + '#token=' + token
    : selectedUrl.value
  if (!text) return
  try {
    if (window.buzzHost) await window.buzzHost.copy(text)
    else if (navigator.clipboard) await navigator.clipboard.writeText(text)
    else {
      const area = document.createElement('textarea')
      area.value = text
      document.body.append(area)
      area.select()
      const copied = document.execCommand('copy')
      area.remove()
      if (!copied) throw new Error('Clipboard unavailable')
    }
    notice.value = host
      ? '호스트 링크 복사됨 · 호스트에게만 공유하세요.'
      : '참가 링크가 복사되었습니다.'
  } catch {
    error.value = '복사할 수 없습니다. 참가 링크를 길게 눌러 복사하세요.'
  }
}
async function permission(): Promise<void> {
  await window.buzzHost?.requestAccessibility()
  await command('ppt:refresh', {})
}
</script>

<template>
  <div class="app-shell" :class="{ 'host-shell': isHost }">
    <header class="masthead">
      <div>
        <span class="eyebrow">LIVE / {{ isHost ? 'HOST DESK' : 'AUDIENCE' }}</span>
        <h1>{{ isHost ? 'Buzz Chat PPT Remote' : (identity?.nickname ?? '함께 참여해요') }}</h1>
      </div>
      <div class="connection" :class="{ online: connected }">
        <span aria-hidden="true">●</span> {{ connectionText
        }}<small>ROOM {{ roomId || '—' }}</small>
      </div>
    </header>
    <div v-if="error" class="alert" role="alert">
      <span>{{ error }}</span
      ><button aria-label="오류 메시지 닫기" @click="error = ''">×</button>
    </div>
    <p v-if="notice" class="notice" role="status">{{ notice }}</p>
    <p v-if="!state && !error" class="empty">방에 연결하고 있습니다…</p>
    <div v-if="state" :class="isHost ? 'host-grid' : 'participant-stack'">
      <section v-if="isHost" class="panel join-panel">
        <div class="section-heading">
          <h2>참가자 초대</h2>
          <span class="tag">{{ state.id }}</span>
        </div>
        <div v-if="selectedUrl" ref="qrElement" class="qr" aria-label="참가자 입장 QR 코드"></div>
        <p v-else class="alert">
          LAN 주소를 찾을 수 없습니다. Wi-Fi에 연결하고 앱을 다시 시작하세요.
        </p>
        <p class="muted">같은 Wi-Fi에서 카메라로 스캔하세요.</p>
        <label v-if="system && system.participantUrls.length > 1" class="field-label"
          >LAN 주소<select v-model="selectedUrl">
            <option v-for="url in system.participantUrls" :key="url" :value="url">
              {{ url.split('/')[2] }}
            </option>
          </select></label
        >
        <a
          v-if="selectedUrl"
          class="join-link"
          :href="selectedUrl"
          target="_blank"
          rel="noopener"
          >{{ selectedUrl }}</a
        >
        <div class="button-row">
          <button :disabled="!selectedUrl" @click="copyLink()">참가 링크 복사</button
          ><button class="quiet" :disabled="!selectedUrl" @click="copyLink(true)">
            호스트 링크 복사
          </button>
        </div>
        <small class="muted">호스트 링크는 PowerPoint 제어 권한을 포함합니다.</small>
      </section>
      <section class="panel buzz-panel" :class="{ winner: isWinner }">
        <div class="section-heading">
          <h2>{{ isHost ? '버저 진행' : '누가 가장 빠를까요?' }}</h2>
          <span class="tag">ROUND {{ state.buzz.round }}</span>
        </div>
        <template v-if="!isHost"
          ><button
            class="buzz-button"
            :class="{ won: isWinner, pressed: hasBuzzed }"
            :disabled="!canBuzz"
            @click="buzz"
          >
            <span>{{ buzzLabel }}</span
            ><small>{{ buzzHint }}</small>
          </button></template
        >
        <div v-else class="host-winner">
          <span class="eyebrow">{{ state.buzz.enabled ? 'BUZZER OPEN' : 'BUZZER DISABLED' }}</span
          ><strong>{{ state.buzz.winner?.nickname ?? '첫 버저를 기다리는 중' }}</strong>
          <p>{{ state.buzz.acceptedCount }}명 참여 · {{ state.participants.length }}명 연결됨</p>
        </div>
        <p v-if="!isHost" class="winner-line" aria-live="polite">
          {{ state.buzz.winner ? `🏆 1등: ${state.buzz.winner.nickname}` : '아직 우승자가 없어요' }}
        </p>
        <ol v-if="state.buzz.ranking.length" class="ranking">
          <li v-for="(entry, index) in state.buzz.ranking" :key="entry.participantId">
            <span class="rank-number">{{ index + 1 }}</span
            ><span>{{ entry.nickname }}</span
            ><b>{{ index === 0 ? 'FIRST' : `+${Math.round(entry.deltaMs)} ms` }}</b>
          </li>
        </ol>
        <p v-else class="empty">버저를 누르면 여기에 순위가 표시됩니다.</p>
        <div v-if="isHost" class="button-row">
          <button class="primary" :disabled="!connected" @click="command('buzz:reset', {})">
            ↻ 새 라운드</button
          ><button
            :disabled="!connected"
            @click="command('buzz:set-enabled', { enabled: !state.buzz.enabled })"
          >
            {{ state.buzz.enabled ? '버저 끄기' : '버저 켜기' }}
          </button>
        </div>
        <small class="muted"
          >호스트 서버에 도착한 순서입니다. 네트워크 지연의 영향을 받습니다.</small
        >
      </section>
      <section v-if="isHost" class="panel ppt-panel">
        <div class="section-heading">
          <h2>PowerPoint 리모컨</h2>
          <span class="tag">{{ ppt?.mock ? 'MOCK' : 'MAC' }}</span>
        </div>
        <p class="status-line">
          {{
            !ppt
              ? '상태 확인 중…'
              : !ppt.running
                ? 'PowerPoint가 실행되지 않았습니다.'
                : !ppt.accessibilityGranted
                  ? '손쉬운 사용 권한이 필요합니다.'
                  : 'PowerPoint 실행 중 · 제어 준비됨'
          }}
        </p>
        <p v-if="ppt?.lastError" class="alert">{{ ppt.lastError.message }}</p>
        <div class="ppt-controls">
          <button
            v-for="(label, action) in pptLabels"
            :key="action"
            :class="{ primary: action === 'advance' }"
            :disabled="!connected || pptBusy || !ppt?.ready"
            @click="pptCommand(action)"
          >
            {{ label }}
          </button>
        </div>
        <p class="muted">
          ‘다음 / 클릭’은 Space 키로 다음 애니메이션 또는 슬라이드를 진행합니다. 먼저 PowerPoint
          슬라이드 쇼를 열어 주세요.
        </p>
        <label class="toggle"
          ><input
            type="checkbox"
            :checked="state.settings.autoAdvanceOnWinner"
            :disabled="!connected"
            @change="
              command('room:set-settings', {
                autoAdvanceOnWinner: ($event.target as HTMLInputElement).checked
              })
            "
          /><span
            >우승자 결정 후 자동으로 다음 / 클릭<small
              >기본 OFF · 우승 결과를 먼저 전송합니다.</small
            ></span
          ></label
        >
      </section>
      <section class="panel chat-panel">
        <div class="section-heading">
          <h2>라이브 채팅</h2>
          <span class="tag">{{ state.participants.length }}명</span>
        </div>
        <div class="reactions" aria-label="실시간 이모지 반응">
          <button
            v-for="emoji in REACTIONS"
            :key="emoji"
            :disabled="isHost || !connected"
            :aria-label="`${emoji} 반응 보내기`"
            @click="command('reaction:send', { emoji })"
          >
            {{ emoji }}
          </button>
        </div>
        <div class="reaction-stage" aria-hidden="true">
          <span
            v-for="bubble in reactionBubbles"
            :key="bubble.id"
            :style="{ left: `${12 + (bubble.id % 5) * 17}%` }"
            >{{ bubble.emoji }}</span
          >
        </div>
        <div ref="chatElement" class="messages" role="log" aria-live="polite">
          <p v-if="!state.chatHistory.length" class="empty">
            {{
              isHost ? '참가자들의 이야기가 여기에 모입니다.' : '부담 없이 첫 이야기를 남겨 보세요.'
            }}
          </p>
          <article v-for="message in state.chatHistory" :key="message.id">
            <strong>{{ message.nickname }}</strong>
            <p>{{ message.text }}</p>
          </article>
        </div>
        <form v-if="!isHost" class="chat-form" @submit.prevent="sendChat">
          <label class="sr-only" for="message">채팅 메시지</label
          ><input
            id="message"
            v-model="chat"
            maxlength="300"
            placeholder="메시지를 입력하세요"
            autocomplete="off"
            :disabled="!connected"
          /><button class="primary" :disabled="!connected || !chat.trim() || sending">전송</button>
        </form>
        <small v-if="!isHost" class="muted">{{ chat.length }}/300 · 10초에 최대 5개</small>
      </section>
      <section v-if="isHost" class="panel system-panel">
        <div class="section-heading">
          <h2>시스템 상태</h2>
          <button class="quiet" :disabled="!connected" @click="command('ppt:refresh', {})">
            새로고침
          </button>
        </div>
        <dl>
          <div>
            <dt>서버</dt>
            <dd>{{ connected ? '서버 준비 완료' : '연결 확인 필요' }}</dd>
          </div>
          <div>
            <dt>포트 / OS</dt>
            <dd>{{ system?.port }} / macOS</dd>
          </div>
          <div>
            <dt>PowerPoint</dt>
            <dd>{{ ppt?.running ? '실행 중' : '실행 안 됨' }}</dd>
          </div>
          <div>
            <dt>손쉬운 사용</dt>
            <dd>{{ ppt?.accessibilityGranted ? '허용' : '권한 필요' }}</dd>
          </div>
        </dl>
        <div v-if="desktop" class="button-row">
          <button @click="permission">권한 요청</button
          ><button class="quiet" @click="desktop?.openAccessibilitySettings()">
            시스템 설정 열기
          </button>
        </div>
        <p v-else class="muted">권한은 Mac의 호스트 앱에서 설정하세요.</p>
        <details>
          <summary>연결 문제 해결</summary>
          <p>
            휴대폰과 Mac을 같은 Wi-Fi에 연결하세요. 게스트 Wi-Fi의 기기 격리, VPN, macOS 방화벽을
            확인하세요. 주소가 여러 개면 Wi-Fi 주소를 선택하세요. 네트워크를 바꾼 경우 앱을 다시
            시작하세요.
          </p>
        </details>
      </section>
      <section v-if="isHost" class="panel presence-panel">
        <div class="section-heading">
          <h2>함께하는 참가자</h2>
          <span class="tag">{{ state.participants.length }}</span>
        </div>
        <p v-if="!state.participants.length" class="empty">첫 참가자를 기다리고 있어요.</p>
        <ul>
          <li v-for="participant in state.participants" :key="participant.id">
            {{ participant.nickname }}
          </li>
        </ul>
      </section>
    </div>
    <footer>
      Buzz Chat PPT Remote · 같은 공간, 함께하는 발표<br /><a :href="sourceUrl"
        >AGPL-3.0 · 이 버전 소스 다운로드</a
      >
      ·
      <a
        href="https://github.com/smilexizheng/mobile-pc-control-server"
        target="_blank"
        rel="noopener"
        >Upstream: smilexizheng</a
      >
    </footer>
  </div>
</template>
