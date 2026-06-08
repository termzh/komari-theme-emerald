import type { MaybeRefOrGetter } from 'vue'
import type { NodePingTaskStats } from '@/composables/useNodePingStats'
import { computed, toValue } from 'vue'
import { useNodePingStats } from '@/composables/useNodePingStats'
import { useAppStore } from '@/stores/app'
import { formatDateTime } from '@/utils/helper'

export type NodePingMetric = 'latency' | 'loss'
export type NodePingQualityStatus = 'excellent' | 'good' | 'high_latency' | 'warning' | 'critical' | 'unknown'

export interface NodePingBar {
  key: string
  className: string
  tooltip: string
}

export interface NodePingQualitySummary {
  availableText: string
  bestTaskText: string
  status: NodePingQualityStatus
  icon: string
  label: string
  shortText: string
  detailText: string
  lostText: string
  latencyText: string
  lossRateText: string
  monitorText: string
  toneClass: string
  textClass: string
}

export interface NodePingTaskQualitySummary {
  basisText: string
  detailText: string
  factText: string
  hourFactText: string
  icon: string
  key: string
  label: string
  latencyText: string
  lossPatternText: string
  lossRateText: string
  lossText: string
  name: string
  recentFactText: string
  recentText: string
  sampleText: string
  score: number
  status: NodePingQualityStatus
  textClass: string
  toneClass: string
  volatilityText: string
}

interface UseNodePingDisplayOptions {
  loadingDisplayText?: string
  emptyDisplayText?: string
  loadingPanelTooltipText?: Partial<Record<NodePingMetric, string>>
  emptyPanelTooltipText?: Partial<Record<NodePingMetric, string>>
  taskNameOverrides?: MaybeRefOrGetter<Map<number, string> | Record<string, string> | undefined>
}

const EMPTY_PING_BAR_COUNT = 20

function getLatencyToneClass(latency: number): string {
  if (latency <= 60)
    return 'bg-emerald-600/90'
  if (latency <= 100)
    return 'bg-green-400/80'
  if (latency <= 160)
    return 'bg-lime-400/80'
  if (latency <= 200)
    return 'bg-yellow-400/80'
  return 'bg-rose-500/80'
}

function getLossToneClass(loss: number): string {
  if (loss <= 1)
    return 'bg-emerald-600/90'
  if (loss <= 3)
    return 'bg-green-400/90'
  if (loss <= 6)
    return 'bg-lime-400/90'
  if (loss <= 9)
    return 'bg-yellow-400/90'
  return 'bg-rose-500/80'
}

function getQualityTone(status: NodePingQualityStatus): Pick<NodePingQualitySummary, 'icon' | 'toneClass' | 'textClass'> {
  switch (status) {
    case 'excellent':
      return {
        icon: 'tabler:shield-check',
        toneClass: 'bg-emerald-600/[0.07] ring-emerald-600/20',
        textClass: 'text-emerald-700 dark:text-emerald-300',
      }
    case 'good':
      return {
        icon: 'tabler:circle-check',
        toneClass: 'bg-sky-500/[0.08] ring-sky-500/20',
        textClass: 'text-sky-700 dark:text-sky-300',
      }
    case 'high_latency':
      return {
        icon: 'tabler:clock',
        toneClass: 'bg-indigo-500/[0.08] ring-indigo-500/20',
        textClass: 'text-indigo-700 dark:text-indigo-300',
      }
    case 'warning':
      return {
        icon: 'tabler:activity',
        toneClass: 'bg-amber-500/[0.09] ring-amber-500/25',
        textClass: 'text-amber-700 dark:text-amber-300',
      }
    case 'critical':
      return {
        icon: 'tabler:alert-triangle',
        toneClass: 'bg-red-500/[0.08] ring-red-500/25',
        textClass: 'text-red-700 dark:text-red-300',
      }
    default:
      return {
        icon: 'tabler:info-circle',
        toneClass: 'bg-slate-500/[0.055] ring-slate-500/15',
        textClass: 'text-muted-foreground',
      }
  }
}

function getQualityLabel(status: NodePingQualityStatus, lang: 'zh-CN' | 'en-US'): string {
  if (lang === 'en-US') {
    const labels: Record<NodePingQualityStatus, string> = {
      excellent: 'Stable',
      good: 'Good',
      high_latency: 'High RTT',
      warning: 'Noisy',
      critical: 'Alert',
      unknown: 'Unknown',
    }
    return labels[status]
  }

  const labels: Record<NodePingQualityStatus, string> = {
    excellent: '稳定',
    good: '良好',
    high_latency: '高延迟',
    warning: '波动',
    critical: '异常',
    unknown: '未知',
  }
  return labels[status]
}

function getStatusRank(status: NodePingQualityStatus): number {
  switch (status) {
    case 'critical':
      return 5
    case 'warning':
      return 4
    case 'high_latency':
      return 3
    case 'good':
      return 2
    case 'excellent':
      return 1
    default:
      return 0
  }
}

function getTaskQualityStatus(task: NodePingTaskStats): NodePingQualityStatus {
  const evaluation = evaluateTaskQuality(task)
  return evaluation.status
}

function getLatencyPenalty(latency: number): number {
  if (latency >= 300)
    return 16
  if (latency >= 220)
    return 10
  if (latency >= 160)
    return 5
  return 0
}

function getVolatilityPenalty(volatility: number): number {
  if (volatility >= 3)
    return 12
  if (volatility >= 2)
    return 7
  if (volatility >= 1.6)
    return 3
  return 0
}

function evaluateTaskQuality(task: NodePingTaskStats): { score: number, status: NodePingQualityStatus } {
  const latency = task.recentSuccessCount > 0 ? task.recentAvgLatency : task.avgLatency
  const latencyPenalty = task.successCount > 0 ? getLatencyPenalty(latency) : 25
  const hourlyLossPenalty = Math.min(25, task.avgLoss * 4)
  const recentLossPenalty = Math.min(40, task.recentLoss * 1.2)
  const burstPenalty = Math.max(
    task.trailingLostCount >= 3 ? 40 : task.trailingLostCount === 2 ? 22 : 0,
    task.recentMaxConsecutiveLost >= 3 ? 35 : task.recentMaxConsecutiveLost === 2 ? 18 : 0,
    task.recentMaxRollingLostCount >= 3 ? 28 : task.recentMaxRollingLostCount === 2 ? 12 : 0,
    task.maxConsecutiveLost >= 3 ? 20 : task.maxConsecutiveLost === 2 ? 8 : 0,
  )
  const hasLossPressure = task.recentLostCount > 0
    || task.lostCount > 0
    || task.avgLoss > 0
    || burstPenalty > 0
  const score = Math.max(0, Math.round(
    100
    - hourlyLossPenalty
    - recentLossPenalty
    - burstPenalty
    - latencyPenalty
    - getVolatilityPenalty(task.avgVolatility),
  ))

  if (
    task.successCount <= 0
    || task.trailingLostCount >= 3
    || task.recentMaxConsecutiveLost >= 3
    || task.recentLostCount >= 4
    || task.lostCount >= 8
    || task.avgLoss >= 10
    || score < 55
  ) {
    return { score, status: 'critical' }
  }

  if (
    task.trailingLostCount >= 2
    || task.recentMaxConsecutiveLost >= 2
    || task.recentMaxRollingLostCount >= 2
    || task.recentLostCount >= 2
    || task.lostCount >= 3
    || task.avgLoss >= 5
    || task.avgVolatility >= 2
    || (hasLossPressure && score < 78)
  ) {
    return { score, status: 'warning' }
  }

  if (task.successCount > 0 && latency >= 200)
    return { score, status: 'high_latency' }

  if (
    task.lostCount === 0
    && task.recentLostCount === 0
    && task.successCount > 0
    && latency <= 120
    && task.avgVolatility < 1.6
    && score >= 94
  ) {
    return { score, status: 'excellent' }
  }

  return { score, status: 'good' }
}

function compareBestTaskQuality(
  left: { task: NodePingTaskStats, status: NodePingQualityStatus },
  right: { task: NodePingTaskStats, status: NodePingQualityStatus },
): number {
  return getStatusRank(left.status) - getStatusRank(right.status)
    || left.task.avgLoss - right.task.avgLoss
    || left.task.lostCount - right.task.lostCount
    || left.task.avgLatency - right.task.avgLatency
    || left.task.avgVolatility - right.task.avgVolatility
}

function parseDisplayNumber(value: string): number {
  const parsed = Number.parseFloat(value)
  return Number.isFinite(parsed) ? parsed : Number.POSITIVE_INFINITY
}

function compareTopTaskSummary(left: NodePingTaskQualitySummary, right: NodePingTaskQualitySummary): number {
  return getStatusRank(left.status) - getStatusRank(right.status)
    || right.score - left.score
    || parseDisplayNumber(left.lossRateText) - parseDisplayNumber(right.lossRateText)
    || parseDisplayNumber(left.latencyText) - parseDisplayNumber(right.latencyText)
}

function formatTaskName(task: NodePingTaskStats, isEnglish: boolean, nameOverride?: string): string {
  const name = nameOverride?.trim() || task.name
  if (!name || name.startsWith('#'))
    return isEnglish ? `Probe ${name || `#${task.taskId}`}` : `监测点${name || `#${task.taskId}`}`
  return name
}

function getLossPatternText(task: NodePingTaskStats, isEnglish: boolean): string {
  if (task.trailingLostCount >= 2)
    return isEnglish ? 'currently consecutive' : '当前连续'
  if (task.recentMaxConsecutiveLost >= 2)
    return isEnglish ? 'recent consecutive' : '近10分连续'
  if (task.recentMaxRollingLostCount >= 2)
    return isEnglish ? 'recent cluster' : '近10分集中'
  if (task.lostCount >= 3)
    return isEnglish ? 'scattered often' : '1h多次'
  if (task.lostCount > 0)
    return isEnglish ? 'scattered' : '零散'
  return isEnglish ? 'clean' : '无丢包'
}

function getTaskBasisText(
  task: NodePingTaskStats,
  status: NodePingQualityStatus,
  latencyText: string,
  volatilityText: string,
  isEnglish: boolean,
): string {
  if (task.successCount <= 0)
    return isEnglish ? 'no successful samples' : '无成功样本'
  if (task.trailingLostCount >= 3)
    return isEnglish ? 'current 3+ consecutive losses' : '当前连续丢包≥3次'
  if (task.recentMaxConsecutiveLost >= 3)
    return isEnglish ? 'recent 3+ consecutive losses' : '近10分连续丢包≥3次'
  if (task.recentLostCount >= 4)
    return isEnglish ? 'recent losses are high' : '近10分丢包偏多'
  if (task.lostCount >= 8 || task.avgLoss >= 10)
    return isEnglish ? '1h loss is high' : '1h丢包偏多'
  if (task.trailingLostCount >= 2)
    return isEnglish ? 'current consecutive loss' : '当前连续丢包'
  if (task.recentMaxConsecutiveLost >= 2)
    return isEnglish ? 'recent consecutive loss' : '近10分连续丢包'
  if (task.recentMaxRollingLostCount >= 2 || task.recentLostCount >= 2)
    return isEnglish ? 'recent concentrated loss' : '近10分丢包集中'
  if (task.lostCount >= 3 || task.avgLoss >= 5)
    return isEnglish ? 'multiple scattered losses in 1h' : '1h零散丢包偏多'
  if (task.avgVolatility >= 2)
    return isEnglish ? `jitter ${volatilityText}` : `延迟抖动 ${volatilityText}`
  if (status === 'high_latency')
    return isEnglish ? `latency ${latencyText}` : `延迟偏高 ${latencyText}`
  if (task.lostCount > 0)
    return isEnglish ? 'minor scattered loss' : '少量零散丢包'
  if (status === 'excellent')
    return isEnglish ? 'no loss, low latency' : '无丢包且延迟低'
  return isEnglish ? 'no recent pressure' : '近期无明显压力'
}

function buildTaskSummary(task: NodePingTaskStats, lang: 'zh-CN' | 'en-US', nameOverride?: string): NodePingTaskQualitySummary {
  const isEnglish = lang === 'en-US'
  const evaluation = evaluateTaskQuality(task)
  const tone = getQualityTone(evaluation.status)
  const name = formatTaskName(task, isEnglish, nameOverride)
  const latency = task.recentSuccessCount > 0 ? task.recentAvgLatency : task.avgLatency
  const latencyText = task.successCount > 0 ? `${Math.round(latency)}ms` : '-'
  const lossText = `${task.lostCount}/${task.sampleCount}`
  const recentText = `${task.recentLostCount}/${task.recentSampleCount}`
  const recentFactText = isEnglish ? `10m ${recentText}` : `近10分 ${recentText}`
  const hourFactText = isEnglish ? `1h ${lossText}` : `1h ${lossText}`
  const factText = `${recentFactText} · ${hourFactText}`
  const lossPatternText = getLossPatternText(task, isEnglish)
  const lossRateText = `${task.avgLoss.toFixed(1)}%`
  const volatilityText = task.avgVolatility > 0 ? `${task.avgVolatility.toFixed(2)}x` : '-'
  const basisText = getTaskBasisText(task, evaluation.status, latencyText, volatilityText, isEnglish)
  const detailText = isEnglish
    ? `${name}: ${basisText}; 10m loss ${recentText}, 1h loss ${lossText} (${lossRateText}), avg ${latencyText}, jitter ${volatilityText}`
    : `${name}：${basisText}；近10分钟丢包 ${recentText}，1小时丢包 ${lossText}（${lossRateText}），平均延迟 ${latencyText}，抖动 ${volatilityText}`

  return {
    basisText,
    detailText,
    factText,
    hourFactText,
    icon: tone.icon,
    key: String(task.taskId),
    label: getQualityLabel(evaluation.status, lang),
    latencyText,
    lossPatternText,
    lossRateText,
    lossText,
    name,
    recentFactText,
    recentText,
    sampleText: `${task.successCount}/${task.sampleCount}`,
    score: evaluation.score,
    status: evaluation.status,
    textClass: tone.textClass,
    toneClass: tone.toneClass,
    volatilityText,
  }
}

export function useNodePingDisplay(
  uuid: MaybeRefOrGetter<string>,
  options: UseNodePingDisplayOptions = {},
) {
  const appStore = useAppStore()

  const pingStatsEnabled = computed(() => {
    if (appStore.publicSettings?.record_enabled === false)
      return false
    return appStore.publicSettings?.ping_record_preserve_time !== 0
  })

  const pingStatsHours = computed(() => {
    const preserveTime = appStore.publicSettings?.ping_record_preserve_time
    if (typeof preserveTime === 'number' && preserveTime > 0)
      return Math.min(preserveTime, 1)
    return 1
  })

  const pingStats = useNodePingStats(uuid, {
    hours: pingStatsHours,
    enabled: pingStatsEnabled,
  })

  const taskNameOverrides = computed(() => {
    const source = toValue(options.taskNameOverrides)
    if (!source)
      return new Map<number, string>()
    if (source instanceof Map)
      return source

    const overrides = new Map<number, string>()
    for (const [taskId, name] of Object.entries(source as Record<string, string>)) {
      const numericTaskId = Number(taskId)
      if (Number.isFinite(numericTaskId) && name.trim())
        overrides.set(numericTaskId, name)
    }
    return overrides
  })

  function buildPingBars(metric: NodePingMetric): NodePingBar[] {
    const points = pingStats.history.value
    if (!points.length)
      return []

    return points.map((point, index) => {
      const value = point[metric]

      return {
        key: `${point.time}-${index}`,
        className: value === null
          ? 'bg-muted-foreground/15'
          : metric === 'latency'
            ? getLatencyToneClass(value)
            : getLossToneClass(value),
        tooltip: value === null
          ? `${formatDateTime(point.time, 'HH:mm:ss')} N/A`
          : metric === 'latency'
            ? `${formatDateTime(point.time, 'HH:mm:ss')}\n${Math.round(value)} ms`
            : `${formatDateTime(point.time, 'HH:mm:ss')}\n${value.toFixed(1)}%`,
      }
    })
  }

  function buildEmptyPingBars(metric: NodePingMetric): NodePingBar[] {
    const tooltip = pingStats.loading.value
      ? '加载中'
      : pingStats.error.value
        ? '加载失败'
        : !pingStatsEnabled.value
            ? '未启用记录'
            : metric === 'latency'
              ? 'N/A'
              : 'N/A'

    return Array.from({ length: EMPTY_PING_BAR_COUNT }, (_, index) => ({
      key: `${metric}-empty-${index}`,
      className: 'bg-muted-foreground/10',
      tooltip,
    }))
  }

  const latencyBars = computed(() => buildPingBars('latency'))
  const lossBars = computed(() => buildPingBars('loss'))
  const latencyRenderBars = computed(() => latencyBars.value.length ? latencyBars.value : buildEmptyPingBars('latency'))
  const lossRenderBars = computed(() => lossBars.value.length ? lossBars.value : buildEmptyPingBars('loss'))

  const latencyDisplay = computed(() => {
    if (pingStats.hasData.value && pingStats.successCount.value > 0)
      return `${Math.round(pingStats.avgLatency.value)} ms`
    if (pingStats.hasData.value)
      return '-'
    if (pingStats.loading.value)
      return options.loadingDisplayText ?? '加载中'
    return options.emptyDisplayText ?? '-'
  })

  const lossDisplay = computed(() => {
    if (pingStats.hasData.value)
      return `${pingStats.avgLoss.value.toFixed(1)}%`
    if (pingStats.loading.value)
      return options.loadingDisplayText ?? '加载中'
    return options.emptyDisplayText ?? '-'
  })

  const latencyPanelTooltip = computed(() => {
    if (!pingStats.hasData.value) {
      if (pingStats.loading.value)
        return options.loadingPanelTooltipText?.latency ?? ''
      return options.emptyPanelTooltipText?.latency ?? ''
    }
    if (pingStats.successCount.value <= 0)
      return '近 1 小时全部丢包，暂无成功延迟'
    return `平均延迟 ${Math.round(pingStats.avgLatency.value)} ms`
  })

  const lossPanelTooltip = computed(() => {
    if (!pingStats.hasData.value) {
      if (pingStats.loading.value)
        return options.loadingPanelTooltipText?.loss ?? ''
      return options.emptyPanelTooltipText?.loss ?? ''
    }

    const volatility = pingStats.avgVolatility.value > 0
      ? `，平均波动 ${pingStats.avgVolatility.value.toFixed(2)}`
      : ''
    return `平均丢包 ${pingStats.avgLoss.value.toFixed(1)}%${volatility}`
  })

  const qualitySummary = computed<NodePingQualitySummary>(() => {
    const lang = appStore.lang
    const isEnglish = lang === 'en-US'

    if (!pingStats.hasData.value) {
      const label = pingStats.loading.value
        ? (isEnglish ? 'Loading' : '加载中')
        : pingStats.error.value
          ? (isEnglish ? 'Failed' : '记录失败')
          : !pingStatsEnabled.value
              ? (isEnglish ? 'Disabled' : '未启用')
              : (isEnglish ? 'No records' : '暂无记录')
      const tone = getQualityTone('unknown')

      return {
        availableText: '-',
        bestTaskText: '-',
        status: 'unknown',
        ...tone,
        label,
        shortText: label,
        detailText: isEnglish ? 'No 1h ping quality data yet' : '近 1 小时暂无 Ping 质量数据',
        lostText: '-',
        latencyText: '-',
        lossRateText: '-',
        monitorText: '-',
      }
    }

    const taskResults = pingStats.tasks.value
      .map(task => ({ task, status: getTaskQualityStatus(task) }))
      .sort(compareBestTaskQuality)
    const bestTaskResult = taskResults[0]
    const bestTask = bestTaskResult?.task
    const status = bestTaskResult?.status ?? 'unknown'

    const label = getQualityLabel(status, lang)
    const tone = getQualityTone(status)
    const lostText = bestTask
      ? (isEnglish ? `${bestTask.lostCount} lost` : `${bestTask.lostCount}次丢包`)
      : '-'
    const latencyText = bestTask?.successCount
      ? `${Math.round(bestTask.avgLatency)}ms`
      : '-'
    const lossRateText = bestTask ? `${bestTask.avgLoss.toFixed(1)}%` : '-'
    const availableTaskCount = taskResults.filter(result => getStatusRank(result.status) <= getStatusRank('high_latency')).length
    const taskCount = taskResults.length
    const bestTaskText = bestTask ? formatTaskName(bestTask, isEnglish) : '-'
    const availableText = taskCount > 0
      ? availableTaskCount > 0
        ? (isEnglish ? `${availableTaskCount}/${taskCount} usable` : `可用${availableTaskCount}/${taskCount}点`)
        : (isEnglish ? `0/${taskCount} usable` : `可用0/${taskCount}点`)
      : '-'
    const monitorText = taskCount > 0
      ? (isEnglish ? `${taskCount} probes` : `${taskCount}个监测点`)
      : '-'
    const volatilityText = bestTask?.avgVolatility
      ? (isEnglish ? `, jitter ${bestTask.avgVolatility.toFixed(2)}x` : `，波动 ${bestTask.avgVolatility.toFixed(2)}x`)
      : ''
    const detailText = isEnglish
      ? `Showing best probe: ${bestTaskText}, ${lostText} (${lossRateText}), avg ${latencyText}${volatilityText}; ${availableText}`
      : `按最佳监测点展示：${bestTaskText}，${lostText}（${lossRateText}），平均延迟 ${latencyText}${volatilityText}；${availableText}`

    return {
      availableText,
      bestTaskText,
      status,
      ...tone,
      label,
      shortText: `${label} · ${bestTaskText} · ${latencyText}`,
      detailText,
      lostText,
      latencyText,
      lossRateText,
      monitorText,
    }
  })

  const taskQualitySummaries = computed(() => {
    return pingStats.tasks.value
      .map(task => buildTaskSummary(task, appStore.lang, taskNameOverrides.value.get(task.taskId)))
      .sort(compareTopTaskSummary)
  })

  const topTaskSummaries = computed(() => taskQualitySummaries.value.slice(0, 3))

  return {
    pingStats,
    pingStatsEnabled,
    pingStatsHours,
    latencyRenderBars,
    lossRenderBars,
    latencyDisplay,
    lossDisplay,
    latencyPanelTooltip,
    lossPanelTooltip,
    qualitySummary,
    taskQualitySummaries,
    topTaskSummaries,
  }
}
