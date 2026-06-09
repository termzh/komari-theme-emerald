<script setup lang="ts">
import type { ExpireStatus, RenewalDisplayInfo } from '@/utils/tagHelper'
import { Icon } from '@iconify/vue'
import { useIntervalFn } from '@vueuse/core'
import dayjs from 'dayjs'
import { computed, ref } from 'vue'
import NodeEarthGlobe from '@/components/NodeEarthGlobe.vue'
import { CardX } from '@/components/ui/card-x'
import { useAppStore } from '@/stores/app'
import { useNodesStore } from '@/stores/nodes'
import { formatBytesPerSecondSplit, formatBytesSplit } from '@/utils/helper'
import { getRenewalDisplayInfo } from '@/utils/tagHelper'

const appStore = useAppStore()
const nodesStore = useNodesStore()

const now = ref(dayjs())
const weekdays = ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六']
const RENEWAL_STATUS_RANK: Record<ExpireStatus, number> = {
  expired: 0,
  critical: 1,
  warning: 2,
  normal: 3,
  long_term: 4,
}
const RENEWAL_ATTENTION_STATUSES = new Set<ExpireStatus>(['expired', 'critical', 'warning'])
const RENEWAL_REMINDER_LIMIT = 3

interface RenewalReminderItem {
  info: RenewalDisplayInfo
  name: string
  uuid: string
}

useIntervalFn(() => {
  now.value = dayjs()
}, 1000)

const currentDate = computed(() => now.value.format('YYYY-MM-DD'))
const currentTime = computed(() => now.value.format('HH:mm:ss'))
const currentWeekday = computed(() => weekdays[now.value.day()])

const totalSpeed = computed(() => {
  const onlineNodes = nodesStore.nodes.filter(node => node.online)
  const up = onlineNodes.reduce((sum, node) => sum + (node.net_out || 0), 0)
  const down = onlineNodes.reduce((sum, node) => sum + (node.net_in || 0), 0)
  return { up, down }
})

const totalTraffic = computed(() => {
  const up = nodesStore.nodes.reduce((sum, node) => sum + (node.net_total_up || 0), 0)
  const down = nodesStore.nodes.reduce((sum, node) => sum + (node.net_total_down || 0), 0)
  return { up, down }
})

const formattedTrafficUp = computed(() => formatBytesSplit(totalTraffic.value.up, appStore.byteDecimals))
const formattedTrafficDown = computed(() => formatBytesSplit(totalTraffic.value.down, appStore.byteDecimals))
const formattedSpeedUp = computed(() => formatBytesPerSecondSplit(totalSpeed.value.up, appStore.byteDecimals))
const formattedSpeedDown = computed(() => formatBytesPerSecondSplit(totalSpeed.value.down, appStore.byteDecimals))
const topUploadNodes = computed(() => {
  const topNodes = nodesStore.nodes
    .filter(node => node.online)
    .map(node => ({
      uuid: node.uuid,
      name: node.name,
      speed: Math.max(0, node.net_out || 0),
    }))
    .sort((a, b) => b.speed - a.speed)
    .slice(0, 2)

  const maxSpeed = topNodes[0]?.speed ?? 0

  return topNodes.map((node, index) => ({
    ...node,
    rank: index + 1,
    formatted: formatBytesPerSecondSplit(node.speed, appStore.byteDecimals),
    percentage: maxSpeed > 0 ? Math.max(8, node.speed / maxSpeed * 100) : 0,
  }))
})

const renewalItems = computed(() => {
  const items: RenewalReminderItem[] = []

  for (const node of nodesStore.nodes) {
    const info = getRenewalDisplayInfo(node, appStore.lang)
    if (!info)
      continue

    items.push({
      uuid: node.uuid,
      name: node.name,
      info,
    })
  }

  return items.sort((a, b) => {
    const statusDiff = RENEWAL_STATUS_RANK[a.info.status] - RENEWAL_STATUS_RANK[b.info.status]
    if (statusDiff !== 0)
      return statusDiff
    return a.info.days - b.info.days
  })
})

const renewalAttentionCount = computed(() =>
  renewalItems.value.filter(item => RENEWAL_ATTENTION_STATUSES.has(item.info.status)).length,
)

const displayedRenewalItems = computed(() => {
  const attentionItems = renewalItems.value.filter(item => RENEWAL_ATTENTION_STATUSES.has(item.info.status))
  const source = attentionItems.length > 0 ? attentionItems : renewalItems.value
  return source.slice(0, RENEWAL_REMINDER_LIMIT)
})

const hiddenRenewalItemCount = computed(() => {
  const sourceCount = renewalAttentionCount.value > 0 ? renewalAttentionCount.value : renewalItems.value.length
  return Math.max(0, sourceCount - displayedRenewalItems.value.length)
})

const renewalSummaryText = computed(() => {
  if (renewalAttentionCount.value > 0)
    return `需续费 ${renewalAttentionCount.value} 台`
  if (renewalItems.value.length > 0)
    return '暂无临期'
  return '暂无续费项'
})

function getRenewalReminderLabel(status: ExpireStatus): string {
  switch (status) {
    case 'expired': return '已逾期'
    case 'critical': return '7天内'
    case 'warning': return '15天内'
    case 'normal': return '>15天'
    case 'long_term': return '长期'
    default: return ''
  }
}

function getRenewalReminderRowClass(status: ExpireStatus): string {
  switch (status) {
    case 'expired':
    case 'critical': return 'bg-red-500/[0.06] ring-red-500/20'
    case 'warning': return 'bg-amber-500/[0.07] ring-amber-500/20'
    default: return 'bg-slate-500/[0.05] ring-slate-500/10'
  }
}

function getRenewalReminderBadgeClass(status: ExpireStatus): string {
  switch (status) {
    case 'expired':
    case 'critical': return 'bg-red-500/10 text-red-700 ring-red-500/20 dark:text-red-300'
    case 'warning': return 'bg-amber-500/15 text-amber-700 ring-amber-500/25 dark:text-amber-300'
    default: return 'bg-slate-500/10 text-muted-foreground ring-slate-500/15'
  }
}

function getRenewalReminderTextClass(status: ExpireStatus): string {
  switch (status) {
    case 'expired':
    case 'critical': return 'text-red-600 dark:text-red-400'
    case 'warning': return 'text-amber-600 dark:text-amber-400'
    default: return 'text-muted-foreground'
  }
}

function getRenewalReminderActionClass(status: ExpireStatus): string {
  switch (status) {
    case 'expired':
    case 'critical': return 'bg-red-600 text-white shadow-sm shadow-red-600/15'
    case 'warning': return 'bg-amber-500 text-white shadow-sm shadow-amber-500/15'
    default: return 'bg-slate-600 text-white shadow-sm shadow-slate-600/10'
  }
}

const showEarth = computed(() => !appStore.hideEarth)
const wrapperClass = computed(() => showEarth.value
  ? 'p-4 grid grid-cols-12 gap-2 h-auto'
  : 'p-4')
const cardGridClass = computed(() => showEarth.value
  ? 'relative z-9 -mt-40 col-span-12 grid grid-cols-2 items-start gap-2 md:col-span-6 md:row-start-1 md:mt-0 md:self-start'
  : 'grid grid-cols-2 items-start gap-2 lg:grid-cols-4')
</script>

<template>
  <div :class="wrapperClass">
    <NodeEarthGlobe
      v-if="showEarth"
      class="col-span-12 col-start-1 md:col-span-6 md:col-start-7"
    />

    <div :class="cardGridClass">
      <CardX
        hoverable
        class="group relative min-h-24 overflow-hidden border-none bg-background/65 shadow-[0_0_0_1px] shadow-slate-500/5 backdrop-blur-md transition-all hover:bg-background/85"
        content-class="h-full !p-3"
      >
        <div class="flex h-full flex-col justify-between gap-3">
          <div class="flex items-center justify-between gap-2">
            <span class="text-[11px] font-medium tracking-wider text-muted-foreground">当前时间</span>
            <Icon icon="tabler:calendar-time" :width="18" :height="18" class="text-slate-500/35 transition-colors group-hover:text-green-600" />
          </div>
          <div class="min-w-0">
            <div class="text-xl font-bold leading-none tracking-tight tabular-nums md:text-2xl">
              {{ currentTime }}
            </div>
            <div class="mt-1.5 flex items-center gap-1.5 text-[11px] text-muted-foreground">
              <span>{{ currentDate }}</span>
              <span class="size-1 rounded-full bg-green-600/70" />
              <span>{{ currentWeekday }}</span>
            </div>
          </div>
        </div>
      </CardX>

      <CardX
        hoverable
        class="group relative min-h-24 overflow-hidden border-none bg-background/65 shadow-[0_0_0_1px] shadow-slate-500/5 backdrop-blur-md transition-all hover:bg-background/85"
        content-class="h-full !p-3"
      >
        <div class="flex h-full flex-col justify-between gap-3">
          <div class="flex items-center justify-between gap-2">
            <span class="text-[11px] font-medium tracking-wider text-muted-foreground">服务器状态</span>
            <Icon icon="tabler:server-2" :width="18" :height="18" class="text-slate-500/35 transition-colors group-hover:text-green-600" />
          </div>
          <div class="flex items-end justify-between gap-2">
            <div class="flex items-baseline gap-1">
              <span class="text-2xl font-bold leading-none tracking-tight text-green-600 tabular-nums">
                {{ nodesStore.onlineCount }}
              </span>
              <span class="text-sm font-semibold text-muted-foreground tabular-nums">/ {{ nodesStore.totalCount }}</span>
            </div>
            <div class="mb-0.5 flex items-center gap-1 text-[11px] text-muted-foreground">
              <span class="size-1.5 rounded-full bg-green-600 animate-pulse" />
              在线
            </div>
          </div>
        </div>
      </CardX>

      <CardX
        hoverable
        class="group relative min-h-24 overflow-hidden border-none bg-background/65 shadow-[0_0_0_1px] shadow-slate-500/5 backdrop-blur-md transition-all hover:bg-background/85"
        content-class="h-full !p-3"
      >
        <div class="flex h-full flex-col justify-between gap-2">
          <div class="flex items-center justify-between gap-2">
            <span class="text-[11px] font-medium tracking-wider text-muted-foreground">累计流量</span>
            <Icon icon="tabler:arrows-transfer-up-down" :width="18" :height="18" class="text-slate-500/35 transition-colors group-hover:text-green-600" />
          </div>
          <div class="space-y-1.5">
            <div class="flex items-baseline justify-between gap-2">
              <span class="flex items-center gap-1 text-[11px] text-green-600">
                <Icon icon="tabler:arrow-up" :width="12" :height="12" /> 上行
              </span>
              <span class="truncate text-sm font-bold tracking-tight tabular-nums">
                {{ formattedTrafficUp.value }} <span class="text-[10px] font-medium text-muted-foreground">{{ formattedTrafficUp.unit }}</span>
              </span>
            </div>
            <div class="flex items-baseline justify-between gap-2">
              <span class="flex items-center gap-1 text-[11px] text-blue-600">
                <Icon icon="tabler:arrow-down" :width="12" :height="12" /> 下行
              </span>
              <span class="truncate text-sm font-bold tracking-tight tabular-nums">
                {{ formattedTrafficDown.value }} <span class="text-[10px] font-medium text-muted-foreground">{{ formattedTrafficDown.unit }}</span>
              </span>
            </div>
          </div>
        </div>
      </CardX>

      <CardX
        hoverable
        class="group relative min-h-24 overflow-hidden border-none bg-background/65 shadow-[0_0_0_1px] shadow-slate-500/5 backdrop-blur-md transition-all hover:bg-background/85"
        content-class="h-full !p-3"
      >
        <div class="flex h-full flex-col justify-between gap-2">
          <div class="flex items-center justify-between gap-2">
            <span class="text-[11px] font-medium tracking-wider text-muted-foreground">实时速率</span>
            <Icon icon="tabler:activity" :width="18" :height="18" class="text-slate-500/35 transition-colors group-hover:text-green-600" />
          </div>
          <div class="space-y-1.5">
            <div class="flex items-baseline justify-between gap-2">
              <span class="flex items-center gap-1 text-[11px] text-green-600">
                <Icon icon="tabler:arrow-up" :width="12" :height="12" /> 上行
              </span>
              <span class="truncate text-sm font-bold tracking-tight tabular-nums">
                {{ formattedSpeedUp.value }} <span class="text-[10px] font-medium text-muted-foreground">{{ formattedSpeedUp.unit }}</span>
              </span>
            </div>
            <div class="flex items-baseline justify-between gap-2">
              <span class="flex items-center gap-1 text-[11px] text-blue-600">
                <Icon icon="tabler:arrow-down" :width="12" :height="12" /> 下行
              </span>
              <span class="truncate text-sm font-bold tracking-tight tabular-nums">
                {{ formattedSpeedDown.value }} <span class="text-[10px] font-medium text-muted-foreground">{{ formattedSpeedDown.unit }}</span>
              </span>
            </div>
          </div>
        </div>
      </CardX>

      <div class="col-span-2 flex min-w-0 flex-col gap-2 rounded-lg bg-background/60 px-3 py-2 shadow-[0_0_0_1px] shadow-slate-500/8 backdrop-blur-md lg:col-span-4 lg:flex-row lg:items-center">
        <div class="flex shrink-0 items-center gap-1.5 text-[11px] font-medium tracking-wider text-muted-foreground">
          <Icon icon="tabler:chart-arrows-vertical" :width="14" :height="14" class="text-green-600" />
          <span>当前上行最高</span>
        </div>
        <div v-if="topUploadNodes.length" class="grid min-w-0 flex-1 grid-cols-1 gap-1.5 sm:grid-cols-2">
          <div
            v-for="node in topUploadNodes" :key="node.uuid"
            class="relative min-w-0 overflow-hidden rounded-md bg-green-600/[0.045] px-2 py-1.5 ring-1 ring-inset ring-green-600/10"
          >
            <div
              class="absolute inset-y-0 left-0 bg-green-600/10"
              :style="{ width: `${node.percentage}%` }"
            />
            <div class="relative flex min-w-0 items-center gap-2">
              <span class="flex size-5 shrink-0 items-center justify-center rounded bg-green-600/10 text-[10px] font-bold text-green-600 tabular-nums">
                {{ node.rank }}
              </span>
              <span class="min-w-0 flex-1 truncate text-xs font-medium text-foreground/85" :title="node.name">
                {{ node.name }}
              </span>
              <span class="shrink-0 text-xs font-bold tracking-tight tabular-nums">
                {{ node.formatted.value }} <span class="text-[10px] font-medium text-muted-foreground">{{ node.formatted.unit }}</span>
              </span>
            </div>
          </div>
        </div>
        <div v-else class="min-w-0 rounded-md bg-slate-500/[0.05] px-2 py-1.5 text-xs text-muted-foreground">
          暂无在线节点
        </div>
      </div>

      <div class="col-span-2 flex min-w-0 flex-col gap-2 rounded-lg bg-background/60 px-3 py-2 shadow-[0_0_0_1px] shadow-slate-500/8 backdrop-blur-md lg:col-span-4 lg:flex-row lg:items-center">
        <div class="flex min-w-0 items-center justify-between gap-2 lg:w-52 lg:shrink-0">
          <div class="flex min-w-0 items-center gap-1.5 text-[11px] font-medium tracking-wider text-muted-foreground">
            <Icon icon="tabler:calendar-dollar" :width="14" :height="14" class="shrink-0 text-amber-600" />
            <span class="shrink-0">机器到期</span>
            <span class="min-w-0 truncate rounded-sm bg-slate-500/[0.06] px-1.5 py-0.5 text-[10px] font-semibold leading-3 text-foreground/70 ring-1 ring-inset ring-slate-500/10">
              {{ renewalSummaryText }}
            </span>
          </div>
          <span
            v-if="hiddenRenewalItemCount > 0"
            class="shrink-0 text-[10px] font-medium leading-3 text-muted-foreground tabular-nums"
          >
            +{{ hiddenRenewalItemCount }} 台
          </span>
        </div>

        <div v-if="displayedRenewalItems.length" class="grid min-w-0 flex-1 grid-cols-1 gap-1.5 md:grid-cols-2 xl:grid-cols-3">
          <div
            v-for="item in displayedRenewalItems" :key="item.uuid"
            class="flex min-w-0 items-center gap-2 rounded-md px-2 py-1.5 text-xs ring-1 ring-inset"
            :class="getRenewalReminderRowClass(item.info.status)"
            :title="`${item.name} · ${item.info.expireText} · ${item.info.expireLabel} ${item.info.expireDateText} · ${item.info.priceText}`"
          >
            <span
              class="shrink-0 rounded-sm px-1.5 py-0.5 text-[10px] font-semibold leading-3 ring-1 ring-inset"
              :class="getRenewalReminderBadgeClass(item.info.status)"
            >
              {{ getRenewalReminderLabel(item.info.status) }}
            </span>
            <span class="min-w-0 flex-1 truncate font-semibold text-foreground/85" :title="item.name">
              {{ item.name }}
            </span>
            <span class="shrink-0 font-bold tabular-nums" :class="getRenewalReminderTextClass(item.info.status)">
              {{ item.info.expireText }}
            </span>
            <span class="hidden shrink-0 text-[10px] text-muted-foreground tabular-nums sm:inline">
              {{ item.info.expireDateText }}
            </span>
            <a
              v-if="item.info.renewalUrl"
              :href="item.info.renewalUrl"
              target="_blank"
              rel="noopener noreferrer"
              :title="item.info.renewalLinkText"
              class="inline-flex size-5 shrink-0 items-center justify-center rounded-sm"
              :class="getRenewalReminderActionClass(item.info.status)"
              :aria-label="`${item.name} 去官网续费`"
              @click.stop
            >
              <Icon icon="tabler:external-link" :width="11" :height="11" class="shrink-0" />
            </a>
          </div>
        </div>

        <div v-else class="min-w-0 rounded-md bg-slate-500/[0.05] px-2 py-1.5 text-xs text-muted-foreground">
          暂无续费节点
        </div>
      </div>
    </div>
  </div>
</template>
