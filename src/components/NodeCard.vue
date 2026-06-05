<script setup lang="ts">
import type { NodeData } from '@/stores/nodes'
import { Icon } from '@iconify/vue'
import { computed, ref } from 'vue'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { CardX } from '@/components/ui/card-x'
import { DataTooltip } from '@/components/ui/data-tooltip'
import { ProgressThin } from '@/components/ui/progress-thin'
import { useAppStore } from '@/stores/app'
import { formatBytesPerSecondWithConfig, formatBytesSplit, formatBytesWithConfig, formatDateTime, formatUptimeWithFormat, getStatus } from '@/utils/helper'
import { getOSImage, getOSName } from '@/utils/osImageHelper'
import { getRegionCode, getRegionDisplayName } from '@/utils/regionHelper'
import { formatPriceWithCycle, getDaysUntilExpired, getExpireStatus, parseTags } from '@/utils/tagHelper'

const props = defineProps<{ node: NodeData }>()
const emit = defineEmits<{
  click: []
  prefetchPing: []
  showPing: []
}>()
const CPU_TRADEMARK_REGEX = /\((?:R|TM)\)/gi
const CPU_SUFFIX_REGEX = /\s+CPU(?=\s|$)/gi
const PROCESSOR_SUFFIX_REGEX = /\s+Processor$/i
const WHITESPACE_REGEX = /\s+/g

const appStore = useAppStore()
const isExpanded = ref(false)

const formatBytes = (bytes: number) => formatBytesWithConfig(bytes, appStore.byteDecimals)
const formatBytesPerSecond = (bytes: number) => formatBytesPerSecondWithConfig(bytes, appStore.byteDecimals)
const formatUptime = (seconds: number) => formatUptimeWithFormat(seconds, 'hour')
const offlineTime = computed(() => formatDateTime(props.node.time))

const cpuStatus = computed(() => getStatus(props.node.cpu ?? 0))
const cpuNameLabel = computed(() => props.node.cpu_name?.trim() || 'CPU 型号未知')
const cpuDisplayName = computed(() => cpuNameLabel.value
  .replace(CPU_TRADEMARK_REGEX, '')
  .replace(CPU_SUFFIX_REGEX, '')
  .replace(PROCESSOR_SUFFIX_REGEX, '')
  .replace(WHITESPACE_REGEX, ' ')
  .trim())
const cpuLoadAverage = computed(() => [props.node.load, props.node.load5, props.node.load15]
  .map(value => (value ?? 0).toFixed(2))
  .join(' / '))
const memPercentage = computed(() => (props.node.ram ?? 0) / (props.node.mem_total || 1) * 100)
const memStatus = computed(() => getStatus(memPercentage.value))
const diskPercentage = computed(() => (props.node.disk ?? 0) / (props.node.disk_total || 1) * 100)
const diskStatus = computed(() => getStatus(diskPercentage.value))

function formatCompactBytes(bytes: number): string {
  const { value, unit } = formatBytesSplit(bytes, appStore.byteDecimals)
  return `${value}${unit.replace('B', '') || 'B'}`
}

const machineSummary = computed(() => {
  const cpuCores = props.node.cpu_cores > 0 ? props.node.cpu_cores : '?'
  return `${cpuCores}C · ${formatCompactBytes(props.node.mem_total ?? 0)} · ${formatCompactBytes(props.node.disk_total ?? 0)}`
})

const machineDetails = computed(() => [
  `CPU：${props.node.cpu_cores > 0 ? `${props.node.cpu_cores} 核` : '核心数未知'} · ${cpuNameLabel.value}`,
  `内存：${formatBytes(props.node.mem_total ?? 0)}`,
  `硬盘：${formatBytes(props.node.disk_total ?? 0)}`,
].join('；'))

function showTrafficProgress(node: NodeData): boolean {
  return node.traffic_limit > 0
}

const trafficUsedPercentage = computed(() => {
  if (props.node.traffic_limit <= 0)
    return 0
  const { net_total_up = 0, net_total_down = 0, traffic_limit_type } = props.node
  let used = 0
  switch (traffic_limit_type) {
    case 'up': used = net_total_up
      break
    case 'down': used = net_total_down
      break
    case 'min': used = Math.min(net_total_up, net_total_down)
      break
    case 'max': used = Math.max(net_total_up, net_total_down)
      break
    case 'sum':
    default:
      used = net_total_up + net_total_down
      break
  }
  return Math.min((used / props.node.traffic_limit) * 100, 100)
})

const trafficUsed = computed(() => {
  const { net_total_up = 0, net_total_down = 0, traffic_limit_type } = props.node
  switch (traffic_limit_type) {
    case 'up': return net_total_up
    case 'down': return net_total_down
    case 'min': return Math.min(net_total_up, net_total_down)
    case 'max': return Math.max(net_total_up, net_total_down)
    case 'sum':
    default: return net_total_up + net_total_down
  }
})

const subscriptionInfo = computed(() => {
  const lang = appStore.lang
  const node = props.node
  if (node.price === 0)
    return null

  const days = getDaysUntilExpired(node.expired_at)
  const status = getExpireStatus(node.expired_at)
  const expireText = status === 'expired'
    ? (lang === 'zh-CN' ? '已过期' : 'Expired')
    : status === 'long_term'
      ? (lang === 'zh-CN' ? '长期有效' : 'Long-term')
      : (lang === 'zh-CN' ? `剩余 ${days} 天` : `${days} days left`)

  return {
    status,
    expireText,
    expireLabel: lang === 'zh-CN' ? '到期' : 'Expires',
    expireDateText: formatDateTime(node.expired_at, 'YYYY-MM-DD'),
    priceText: formatPriceWithCycle(node.price, node.billing_cycle, node.currency, lang),
  }
})

const subscriptionToneClass = computed(() => {
  switch (subscriptionInfo.value?.status) {
    case 'expired':
    case 'critical': return 'bg-red-500/[0.065] ring-red-500/15'
    case 'warning': return 'bg-amber-500/[0.065] ring-amber-500/20'
    case 'normal': return 'bg-green-600/[0.055] ring-green-600/10'
    default: return 'bg-slate-500/[0.055] ring-slate-500/10'
  }
})

const subscriptionStatusClass = computed(() => {
  switch (subscriptionInfo.value?.status) {
    case 'expired':
    case 'critical': return 'text-red-600'
    case 'warning': return 'text-amber-600'
    case 'normal': return 'text-green-600'
    default: return 'text-muted-foreground'
  }
})

const customTags = computed(() => parseTags(props.node.tags).map(t => t.text))

function hasRegion(region: string | null | undefined): boolean {
  return Boolean(region?.trim())
}
</script>

<template>
  <CardX
    hoverable
    size="small"
    :segmented="{ content: true }"
    header-class="bg-slate-500/[0.025]"
    content-class="!p-2.5"
    class="node-card w-full cursor-pointer border-none bg-background/75 shadow-[0_0_0_1px] shadow-slate-500/15 backdrop-blur-md transition-all duration-200 hover:bg-background/95 hover:shadow-[0_0_0_2px] hover:shadow-green-600/15 rounded-md"
    :class="[!props.node.online && '!shadow-red-600/20']" @click="emit('click')"
  >
    <template #header>
      <div class="flex gap-2 min-w-0 items-center">
        <DataTooltip
          placement="right"
          :content="formatUptime(props.node.uptime ?? 0)"
          class="size-2 rounded-full" :class="[props.node.online ? 'bg-green-600' : 'bg-red-600']"
          content-class="whitespace-nowrap"
        >
          <div
            class="animate-ping absolute inset-0 rounded-full opacity-50"
            :class="[props.node.online ? 'bg-green-600' : 'bg-red-600']"
          />
        </DataTooltip>
        <span class="text-md font-bold flex-1 min-w-0 truncate">{{ props.node.name }}</span>
      </div>
    </template>

    <template #header-extra>
      <div class="flex gap-1.5 items-center">
        <Button
          type="button" variant="ghost" size="icon-xs" aria-label="查看延迟图表" title="延迟监控"
          class="size-7 rounded-sm bg-slate-500/8 text-muted-foreground ring-1 ring-inset ring-slate-500/10 hover:bg-green-600/10 hover:text-green-600 hover:ring-green-600/20"
          @focus="emit('prefetchPing')"
          @pointerenter="emit('prefetchPing')"
          @click.stop="emit('showPing')"
        >
          <Icon icon="tabler:chart-line" :width="18" :height="18" />
        </Button>
        <Button
          type="button" variant="ghost" size="icon-xs" :aria-expanded="isExpanded"
          :aria-label="isExpanded ? '收起节点详情' : '展开节点详情'" :title="isExpanded ? '收起详情' : '展开详情'"
          class="size-7 rounded-sm bg-slate-500/8 text-muted-foreground ring-1 ring-inset ring-slate-500/10 hover:bg-green-600/10 hover:text-green-600 hover:ring-green-600/20"
          @click.stop="isExpanded = !isExpanded"
        >
          <Icon
            icon="tabler:chevron-down" :width="18" :height="18"
            class="transition-transform duration-300" :class="isExpanded && 'rotate-180'"
          />
        </Button>
        <img :src="getOSImage(props.node.os)" :alt="getOSName(props.node.os)" class="size-4">
        <img
          v-if="hasRegion(props.node.region)" :src="`/images/flags/${getRegionCode(props.node.region)}.svg`"
          :alt="getRegionDisplayName(props.node.region)" class="size-5 shrink-0"
        >
      </div>
    </template>

    <template #default>
      <div class="flex flex-col">
        <div
          class="rounded-md bg-gradient-to-br from-slate-500/[0.07] via-background/35 to-green-600/[0.045] px-2.5 py-2 ring-1 ring-inset ring-slate-500/10"
          :title="machineDetails"
        >
          <div class="flex min-w-0 items-start justify-between gap-2">
            <div class="min-w-0 flex-1">
              <div class="flex min-w-0 items-center gap-1.5 text-[11px] leading-4">
                <Icon icon="tabler:server-cog" :width="13" :height="13" class="shrink-0 text-green-600" />
                <span class="shrink-0 font-semibold tabular-nums text-foreground/90">{{ machineSummary }}</span>
                <span class="min-w-0 truncate text-muted-foreground">{{ cpuDisplayName }}</span>
              </div>
              <div class="mt-1 flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5 text-[10px] leading-4 text-muted-foreground">
                <span class="inline-flex items-baseline gap-0.5">
                  CPU <strong class="font-semibold text-foreground/80 tabular-nums">{{ (props.node.cpu ?? 0).toFixed(1) }}%</strong>
                </span>
                <span class="inline-flex items-baseline gap-0.5">
                  内存 <strong class="font-semibold text-foreground/80 tabular-nums">{{ memPercentage.toFixed(1) }}%</strong>
                </span>
                <span class="inline-flex items-baseline gap-0.5">
                  硬盘 <strong class="font-semibold text-foreground/80 tabular-nums">{{ diskPercentage.toFixed(1) }}%</strong>
                </span>
                <span
                  v-if="subscriptionInfo"
                  class="inline-flex min-w-0 items-center gap-1 rounded bg-background/45 px-1.5 py-0.5 ring-1 ring-inset ring-slate-500/10"
                  :class="subscriptionStatusClass"
                >
                  <Icon icon="tabler:calendar-event" :width="11" :height="11" class="shrink-0" />
                  <span class="truncate tabular-nums">到期 {{ subscriptionInfo.expireDateText }}</span>
                </span>
              </div>
            </div>
            <div class="shrink-0 text-right text-[10px] leading-4 tabular-nums">
              <template v-if="props.node.online">
                <div class="flex justify-end items-center gap-0.5 text-green-600">
                  <Icon icon="tabler:chevron-up" width="11" height="11" />
                  {{ formatBytesPerSecond(props.node.net_out ?? 0) }}
                </div>
                <div class="flex justify-end items-center gap-0.5 text-blue-600">
                  <Icon icon="tabler:chevron-down" width="11" height="11" />
                  {{ formatBytesPerSecond(props.node.net_in ?? 0) }}
                </div>
              </template>
              <template v-else>
                <div class="font-semibold text-red-600">
                  离线
                </div>
                <div class="max-w-24 truncate text-muted-foreground">
                  {{ offlineTime }}
                </div>
              </template>
            </div>
          </div>
        </div>

        <Transition name="node-card-details">
          <div v-if="isExpanded" class="node-card-details">
            <div class="flex flex-col gap-2.5 border-t border-slate-500/10 mt-2.5 pt-2.5">
              <div class="flex items-center justify-between px-0.5">
                <div class="flex items-center gap-1.5 text-[11px] font-semibold text-foreground/80">
                  <Icon icon="tabler:adjustments-horizontal" :width="14" :height="14" class="text-green-600" />
                  诊断面板
                </div>
                <span class="text-[10px] text-muted-foreground">展开后再看细节</span>
              </div>

              <div class="rounded-md bg-green-600/[0.045] px-2 py-1.5 ring-1 ring-inset ring-green-600/10">
                <div class="flex min-w-0 items-center gap-1.5 text-[11px]">
                  <Icon icon="tabler:cpu" :width="13" :height="13" class="shrink-0 text-green-600" />
                  <span class="shrink-0 font-medium text-muted-foreground">CPU</span>
                  <span class="min-w-0 truncate font-semibold">{{ cpuDisplayName }}</span>
                </div>
                <div class="mt-0.5 flex flex-wrap gap-x-2 gap-y-0.5 pl-5 text-[10px] text-muted-foreground tabular-nums">
                  <span>{{ props.node.cpu_cores > 0 ? `${props.node.cpu_cores} 核` : '核心数未知' }}</span>
                  <span>内存 {{ formatBytes(props.node.mem_total ?? 0) }}</span>
                  <span>硬盘 {{ formatBytes(props.node.disk_total ?? 0) }}</span>
                </div>
              </div>

              <div class="gap-2 grid grid-cols-2">
                <!-- CPU -->
                <div class="flex flex-col gap-1 rounded-md bg-slate-500/[0.055] px-2 py-1.5 ring-1 ring-inset ring-slate-500/10">
                  <div class="w-full text-xs flex flex-row justify-between">
                    <span class="font-medium text-muted-foreground">CPU 占用</span>
                    <span class="font-semibold tabular-nums">{{ (props.node.cpu ?? 0).toFixed(1) }}%</span>
                  </div>
                  <ProgressThin :percentage="props.node.cpu ?? 0" :status="cpuStatus" :height="4" class="bg-slate-500/20 dark:bg-slate-300/20" />
                  <div class="text-[11px] text-muted-foreground truncate tabular-nums" title="1 / 5 / 15 分钟平均负载">
                    负载 {{ cpuLoadAverage }}
                  </div>
                </div>

                <!-- 内存 -->
                <div class="flex flex-col gap-1 rounded-md bg-slate-500/[0.055] px-2 py-1.5 ring-1 ring-inset ring-slate-500/10">
                  <div class="w-full text-xs flex flex-row justify-between">
                    <span class="font-medium text-muted-foreground">内存</span>
                    <span class="font-semibold tabular-nums">{{ memPercentage.toFixed(1) }}%</span>
                  </div>
                  <ProgressThin :percentage="memPercentage" :status="memStatus" :height="4" class="bg-slate-500/20 dark:bg-slate-300/20" />
                  <div class="text-[11px] text-muted-foreground truncate tabular-nums">
                    {{ formatBytes(props.node.ram ?? 0) }} / {{ formatBytes(props.node.mem_total ?? 0) }}
                  </div>
                </div>

                <!-- 硬盘 -->
                <div class="flex flex-col gap-1 rounded-md bg-slate-500/[0.055] px-2 py-1.5 ring-1 ring-inset ring-slate-500/10">
                  <div class="w-full text-xs flex flex-row justify-between">
                    <span class="font-medium text-muted-foreground">硬盘</span>
                    <span class="font-semibold tabular-nums">{{ diskPercentage.toFixed(1) }}%</span>
                  </div>
                  <ProgressThin :percentage="diskPercentage" :status="diskStatus" :height="4" class="bg-slate-500/20 dark:bg-slate-300/20" />
                  <div class="text-[11px] text-muted-foreground truncate tabular-nums">
                    {{ formatBytes(props.node.disk ?? 0) }} / {{ formatBytes(props.node.disk_total ?? 0) }}
                  </div>
                </div>

                <!-- 流量进度条 -->
                <div class="flex flex-col gap-1 rounded-md bg-slate-500/[0.055] px-2 py-1.5 ring-1 ring-inset ring-slate-500/10">
                  <div class="w-full text-xs flex flex-row justify-between">
                    <span class="font-medium text-muted-foreground">流量</span>
                    <span class="font-semibold tabular-nums">{{ trafficUsedPercentage.toFixed(1) }}%</span>
                  </div>
                  <ProgressThin :percentage="trafficUsedPercentage" status="success" :height="4" class="bg-slate-500/20 dark:bg-slate-300/20" />
                  <div class="text-[11px] text-muted-foreground truncate tabular-nums">
                    {{ formatBytes(trafficUsed) }} /
                    <template v-if="showTrafficProgress(node)">
                      {{ formatBytes(props.node.traffic_limit) }}
                    </template>
                    <template v-else>
                      ∞
                    </template>
                  </div>
                </div>
              </div>

              <div class="gap-1.5 grid grid-cols-2 relative">
                <div
                  v-if="!props.node.online"
                  class="absolute inset-0 flex flex-col gap-1 items-center justify-center z-1 text-center" aria-hidden="true"
                >
                  <div class="text-sm font-medium text-destructive">
                    离线
                  </div>
                  <div class="text-xs text-muted-foreground">
                    {{ offlineTime }}
                  </div>
                </div>
                <div
                  class="flex flex-col gap-0.5 rounded-md bg-slate-500/[0.055] px-2 py-1.5 ring-1 ring-inset ring-slate-500/10"
                  :class="[!props.node.online ? 'blur-xs opacity-60' : '']"
                >
                  <div class="text-[10px] font-medium tracking-wide text-muted-foreground">
                    实时速率
                  </div>
                  <div class="text-[11px] flex flex-col tabular-nums">
                    <div class="text-green-600 flex flex-row items-center gap-1">
                      <Icon icon="tabler:chevron-up" width="12" height="12" />
                      {{ formatBytesPerSecond(props.node.net_out ?? 0) }}
                    </div>
                    <div class="text-blue-600 flex flex-row items-center gap-1">
                      <Icon icon="tabler:chevron-down" width="12" height="12" />
                      {{ formatBytesPerSecond(props.node.net_in ?? 0) }}
                    </div>
                  </div>
                </div>
                <div
                  class="flex flex-col gap-0.5 rounded-md bg-slate-500/[0.055] px-2 py-1.5 ring-1 ring-inset ring-slate-500/10"
                  :class="[!props.node.online ? 'blur-xs opacity-60' : '']"
                >
                  <div class="text-[10px] font-medium tracking-wide text-muted-foreground">
                    累计流量
                  </div>
                  <div class="text-[11px] text-muted-foreground flex flex-col tabular-nums">
                    <div class="flex flex-row items-center gap-1">
                      <Icon icon="tabler:upload" width="12" height="12" />
                      {{ formatBytes(props.node.net_total_up ?? 0) }}
                    </div>
                    <div class="flex flex-row items-center gap-1">
                      <Icon icon="tabler:download" width="12" height="12" />
                      {{ formatBytes(props.node.net_total_down ?? 0) }}
                    </div>
                  </div>
                </div>
              </div>

              <div
                v-if="subscriptionInfo"
                class="flex min-w-0 items-center justify-between gap-2 rounded-md px-2 py-1.5 text-[11px] ring-1 ring-inset"
                :class="[subscriptionToneClass, !props.node.online ? 'blur-xs opacity-60' : '']"
                :title="`${subscriptionInfo.expireText} · ${subscriptionInfo.expireLabel} ${subscriptionInfo.expireDateText} · ${subscriptionInfo.priceText}`"
              >
                <div class="flex min-w-0 flex-col gap-0.5">
                  <div class="flex min-w-0 items-center gap-1.5">
                    <Icon icon="tabler:calendar-dollar" :width="14" :height="14" class="shrink-0 text-muted-foreground" />
                    <span class="shrink-0 font-medium text-muted-foreground">订阅</span>
                    <span class="text-muted-foreground">·</span>
                    <span class="truncate font-medium" :class="subscriptionStatusClass">{{ subscriptionInfo.expireText }}</span>
                  </div>
                  <div class="pl-5 text-[10px] text-muted-foreground tabular-nums">
                    {{ subscriptionInfo.expireLabel }} {{ subscriptionInfo.expireDateText }}
                  </div>
                </div>
                <span class="shrink-0 font-semibold tabular-nums">{{ subscriptionInfo.priceText }}</span>
              </div>

              <div v-if="customTags.length > 0" class="flex shrink-0 flex-wrap gap-1 items-center">
                <Badge
                  v-for="(tag, index) in customTags" :key="index" variant="outline"
                  class="!text-[11px] rounded border-muted-foreground/20 bg-background/45 px-1.5 text-muted-foreground"
                >
                  {{ tag }}
                </Badge>
              </div>
            </div>
          </div>
        </Transition>
      </div>
    </template>
  </CardX>
</template>

<style scoped>
.node-card {
  position: relative;
  overflow: hidden;
}

.node-card-details-enter-active,
.node-card-details-leave-active {
  transition:
    opacity 180ms ease,
    transform 180ms ease;
}

.node-card-details-enter-from,
.node-card-details-leave-to {
  opacity: 0;
  transform: translateY(-4px);
}
</style>
