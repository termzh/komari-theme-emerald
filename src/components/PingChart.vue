<script setup lang="ts">
import { Icon } from '@iconify/vue'
import dayjs from 'dayjs'
import { computed, onBeforeUnmount, onMounted, ref, shallowRef, watch } from 'vue'
import VChart from 'vue-echarts'
import { Button } from '@/components/ui/button'
import { Empty } from '@/components/ui/empty'
import { Spinner } from '@/components/ui/spinner'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { useAppStore } from '@/stores/app'
import { getSharedRpc } from '@/utils/rpc'
import '@/utils/echarts' // 共享 ECharts 配置

const props = defineProps<{
  uuid: string
}>()

const appStore = useAppStore()
const isDark = computed(() => appStore.isDark)
// 使用共享的 RPC 实例，避免重复创建连接
const rpc = getSharedRpc()

// 图表主题相关颜色
const chartThemeColors = computed(() => ({
  text: isDark.value ? 'rgba(255, 255, 255, 0.85)' : 'rgba(0, 0, 0, 0.85)',
  textSecondary: isDark.value ? 'rgba(255, 255, 255, 0.55)' : 'rgba(0, 0, 0, 0.55)',
  textTertiary: isDark.value ? 'rgba(255, 255, 255, 0.35)' : 'rgba(0, 0, 0, 0.35)',
  borderColor: isDark.value ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.06)',
  splitLineColor: isDark.value ? 'rgba(255, 255, 255, 0.06)' : 'rgba(0, 0, 0, 0.06)',
  tooltipBg: isDark.value ? 'rgba(40, 40, 40, 0.95)' : 'rgba(255, 255, 255, 0.8)',
  tooltipShadow: isDark.value ? 'rgba(0, 0, 0, 0.4)' : 'rgba(0, 0, 0, 0.06)',
  crosshairColor: isDark.value ? 'rgba(255, 255, 255, 0.15)' : 'rgba(0, 0, 0, 0.1)',
}))

// 优化后的图表配色方案（多任务时使用）
const chartColors = [
  '#FF6B6B', // 珊瑚红
  '#4ECDC4', // 青绿色
  '#A78BFA', // 紫罗兰
  '#60A5FA', // 天蓝色
  '#FFB347', // 琥珀黄
  '#F472B6', // 粉红色
  '#34D399', // 翠绿色
  '#FB923C', // 橙色
]
const packetLossColor = '#FACC15'
const packetLossSeriesName = '丢包率'
const tooltipEscapedCharsRegex = /[&<>"']/g

// 从 publicSettings 获取记录保留时间
const maxPingRecordPreserveTime = computed(() => appStore.publicSettings?.ping_record_preserve_time || 168)

// 视图选项
const presetViews = [
  { label: '1 小时', hours: 1 },
  { label: '6 小时', hours: 6 },
  { label: '12 小时', hours: 12 },
  { label: '1 天', hours: 24 },
]

// 可用视图列表
const availableViews = computed(() => {
  const views: { label: string, hours: number }[] = []
  const maxHours = maxPingRecordPreserveTime.value

  for (const v of presetViews) {
    if (maxHours >= v.hours) {
      views.push(v)
    }
  }

  const maxPreset = presetViews.at(-1)
  if (maxPreset && maxHours > maxPreset.hours) {
    const label = maxHours % 24 === 0
      ? `${Math.floor(maxHours / 24)} 天`
      : `${maxHours} 小时`
    views.push({ label, hours: maxHours })
  }
  else if (maxHours > 1 && !presetViews.some(v => v.hours === maxHours)) {
    const label = maxHours % 24 === 0
      ? `${Math.floor(maxHours / 24)} 天`
      : `${maxHours} 小时`
    views.push({ label, hours: maxHours })
  }

  return views
})

// 当前选中的视图
const selectedView = ref<string>('')
const selectedHours = computed(() => {
  const view = availableViews.value.find(v => v.label === selectedView.value)
  return view?.hours || 1
})

// 初始化默认视图
watch(availableViews, (views) => {
  const firstView = views[0]
  if (firstView && !selectedView.value) {
    selectedView.value = firstView.label
  }
}, { immediate: true })

// ==================== 类型定义 ====================

interface PingRecord {
  client: string
  task_id: number
  time: string
  value: number
}

interface TaskInfo {
  id: number
  name: string
  interval: number
  loss: number
  p99?: number
  p50?: number
  p99_p50_ratio?: number
  min?: number
  max?: number
  avg?: number
  latest?: number
  total?: number
  type?: string
}

interface PingRecordsResponse {
  count: number
  records: PingRecord[]
  tasks?: TaskInfo[]
  from?: string
  to?: string
}

interface RawTaskStats {
  avg?: number
  latest?: number
  loss: number
  max?: number
  min?: number
  p50?: number
  p99?: number
  p99_p50_ratio?: number
  total: number
}

// 数据状态
const remoteData = shallowRef<PingRecord[]>([])
const tasks = shallowRef<TaskInfo[]>([])
const loading = ref(false)
const error = ref<string | null>(null)

// 任务选择
const selectedTaskIds = ref<number[]>([])
const isDefaultAllTasks = ref(true)
const isTouchTooltipMode = ref(false)
const activeTaskTooltipId = ref<number | null>(null)

const chartMargin = { top: 30, right: 58, bottom: 52, left: 56 }
let coarsePointerMediaQuery: MediaQueryList | null = null

function syncTouchTooltipMode() {
  if (typeof window === 'undefined') {
    isTouchTooltipMode.value = false
    return
  }

  const hasCoarsePointer = window.matchMedia('(pointer: coarse)').matches
  const hasTouchPoints = typeof navigator !== 'undefined' && navigator.maxTouchPoints > 0
  isTouchTooltipMode.value = hasCoarsePointer || hasTouchPoints
}

function setTaskTooltipOpen(taskId: number, open: boolean) {
  activeTaskTooltipId.value = open ? taskId : activeTaskTooltipId.value === taskId ? null : activeTaskTooltipId.value
}

function toggleTaskTooltip(taskId: number) {
  if (!isTouchTooltipMode.value)
    return

  activeTaskTooltipId.value = activeTaskTooltipId.value === taskId ? null : taskId
}

// ==================== 数据获取 ====================

async function fetchRecords() {
  if (!props.uuid)
    return

  loading.value = true
  error.value = null

  try {
    const result = await rpc.getClient().call<PingRecordsResponse>('common:getRecords', {
      uuid: props.uuid,
      type: 'ping',
      hours: selectedHours.value,
    })

    const records = result?.records || []
    records.sort((a, b) => dayjs(a.time).valueOf() - dayjs(b.time).valueOf())

    remoteData.value = records
    tasks.value = result?.tasks || []

    if (isDefaultAllTasks.value) {
      selectedTaskIds.value = tasks.value.map(t => t.id)
    }
    else {
      const availableTaskIds = new Set(tasks.value.map(t => t.id))
      selectedTaskIds.value = selectedTaskIds.value.filter(id => availableTaskIds.has(id))
    }
  }
  catch (err) {
    error.value = err instanceof Error ? err.message : '获取数据失败'
    remoteData.value = []
    tasks.value = []
  }
  finally {
    loading.value = false
  }
}

// ==================== 数据处理 ====================

const mergedData = computed(() => {
  const data = remoteData.value
  if (!data.length)
    return []

  const taskList = tasks.value

  const taskIntervals = taskList
    .map(t => t.interval)
    .filter((v): v is number => typeof v === 'number' && v > 0)

  const fallbackIntervalSec = taskIntervals.length ? Math.min(...taskIntervals) : 60
  const toleranceMs = Math.min(
    6000,
    Math.max(800, Math.floor(fallbackIntervalSec * 1000 * 0.25)),
  )

  const grouped: Map<number, Record<string, unknown>> = new Map()
  const anchors: number[] = []

  for (const rec of data) {
    const ts = dayjs(rec.time).valueOf()
    let anchor: number | null = null

    for (const a of anchors) {
      if (Math.abs(a - ts) <= toleranceMs) {
        anchor = a
        break
      }
    }

    const useTs = anchor ?? ts
    if (!grouped.has(useTs)) {
      grouped.set(useTs, { time: dayjs(useTs).toISOString() })
      if (anchor === null) {
        anchors.push(useTs)
      }
    }

    const group = grouped.get(useTs)!
    const isLost = rec.value < 0
    // 丢包只进入右轴峰值；延迟序列必须保留 null，不能伪造延迟值。
    group[rec.task_id] = isLost ? null : rec.value
    group[getPacketLossKey(rec.task_id)] = isLost ? 100 : 0
  }

  const merged = Array.from(grouped.values()).sort(
    (a, b) => dayjs(a.time as string).valueOf() - dayjs(b.time as string).valueOf(),
  )

  const hours = selectedHours.value
  const lastItem = merged.at(-1)
  const lastTs = lastItem ? dayjs(lastItem.time as string).valueOf() : dayjs().valueOf()
  const fromTs = lastTs - hours * 3600_000

  let startIdx = 0
  for (let i = 0; i < merged.length; i++) {
    const item = merged[i]
    if (!item)
      continue
    const ts = dayjs(item.time as string).valueOf()
    if (ts >= fromTs) {
      startIdx = Math.max(0, i - 1)
      break
    }
  }

  return merged.slice(startIdx)
})

// ==================== 工具函数 ====================

function formatTime(time: string, showDate: boolean): string {
  const date = dayjs(time)
  if (showDate) {
    return date.format('M/D HH:mm')
  }
  return date.format('HH:mm')
}

function formatTimeForTooltip(time: string, hours: number): string {
  const date = dayjs(time)
  if (hours < 24) {
    return date.format('HH:mm:ss')
  }
  return date.format('MM/DD HH:mm')
}

function getPacketLossKey(taskId: number): string {
  return `${taskId}:packet-loss`
}

function getPacketLossRate(row: Record<string, unknown>, taskList: TaskInfo[]): number | null {
  let observedCount = 0
  let lostCount = 0

  for (const task of taskList) {
    const loss = row[getPacketLossKey(task.id)]
    if (typeof loss !== 'number')
      continue

    observedCount += 1
    if (loss > 0)
      lostCount += 1
  }

  return observedCount > 0 ? lostCount / observedCount * 100 : null
}

function escapeTooltipText(value: string): string {
  return value.replace(tooltipEscapedCharsRegex, char => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    '\'': '&#39;',
  })[char]!)
}

function getAverage(values: number[]): number | undefined {
  if (!values.length)
    return undefined

  return values.reduce((sum, value) => sum + value, 0) / values.length
}

function getPercentile(values: number[], percentile: number): number | undefined {
  if (!values.length)
    return undefined

  const sorted = [...values].sort((a, b) => a - b)
  const position = Math.min(sorted.length - 1, Math.max(0, (sorted.length - 1) * percentile))
  const lowerIndex = Math.floor(position)
  const upperIndex = Math.ceil(position)
  const lowerValue = sorted[lowerIndex]
  const upperValue = sorted[upperIndex]

  if (lowerValue === undefined || upperValue === undefined)
    return undefined
  if (lowerIndex === upperIndex)
    return lowerValue

  return lowerValue + (upperValue - lowerValue) * (position - lowerIndex)
}

const showDateInAxis = computed(() => selectedHours.value >= 24)

// ==================== 任务选择 ====================

// 获取任务颜色（根据任务在完整列表中的索引）
function getTaskColor(taskId: number): string {
  const taskIndex = tasks.value.findIndex(t => t.id === taskId)
  const safeIndex = Math.max(0, taskIndex % chartColors.length)
  return chartColors[safeIndex]!
}

const rawTaskStats = computed(() => {
  const recordsByTask = new Map<number, PingRecord[]>()

  for (const record of remoteData.value) {
    const records = recordsByTask.get(record.task_id) ?? []
    records.push(record)
    recordsByTask.set(record.task_id, records)
  }

  return new Map(
    tasks.value.map((task) => {
      const records = recordsByTask.get(task.id) ?? []
      const successfulValues = records
        .map(record => record.value)
        .filter(value => value >= 0)
      const p50 = getPercentile(successfulValues, 0.5)
      const p99 = getPercentile(successfulValues, 0.99)

      return [task.id, {
        avg: getAverage(successfulValues),
        latest: records.at(-1)?.value,
        loss: records.length > 0
          ? (records.length - successfulValues.length) / records.length * 100
          : 0,
        max: successfulValues.length ? Math.max(...successfulValues) : undefined,
        min: successfulValues.length ? Math.min(...successfulValues) : undefined,
        p50,
        p99,
        p99_p50_ratio: p50 !== undefined && p99 !== undefined && p50 > 0
          ? p99 / p50
          : undefined,
        total: records.length,
      } satisfies RawTaskStats]
    }),
  )
})

// 使用原始成功/失败记录计算统计值，保持任务颜色顺序
const latestValues = computed(() => {
  if (!tasks.value.length)
    return []

  return tasks.value.map((task, idx) => {
    const safeIdx = Math.max(0, idx % chartColors.length)
    return {
      ...task,
      ...rawTaskStats.value.get(task.id),
      color: chartColors[safeIdx]!,
    }
  })
})

const selectedTasks = computed(() => {
  return tasks.value.filter(t => selectedTaskIds.value.includes(t.id))
})

// 切换任务选中状态
function toggleTask(taskId: number) {
  if (isDefaultAllTasks.value) {
    isDefaultAllTasks.value = false
    selectedTaskIds.value = [taskId]
    return
  }

  if (selectedTaskIds.value.includes(taskId)) {
    const nextTaskIds = selectedTaskIds.value.filter(id => id !== taskId)
    if (nextTaskIds.length === 0) {
      showAllTasks()
      return
    }
    selectedTaskIds.value = nextTaskIds
  }
  else {
    selectedTaskIds.value = [...selectedTaskIds.value, taskId]
  }
}

function showAllTasks() {
  isDefaultAllTasks.value = true
  selectedTaskIds.value = tasks.value.map(t => t.id)
}

function resetTaskSelection() {
  isDefaultAllTasks.value = true
  selectedTaskIds.value = []
}

// ==================== 图表配置 ====================

// 通用 Tooltip 配置
const baseTooltipConfig = computed(() => ({
  trigger: 'axis' as const,
  confine: false,
  backgroundColor: chartThemeColors.value.tooltipBg,
  borderColor: 'transparent',
  borderWidth: 0,
  borderRadius: 6,
  textStyle: {
    color: chartThemeColors.value.text,
    fontSize: 12,
    lineHeight: 20,
  },
  extraCssText: `backdrop-filter: blur(5px);z-index:9;box-shadow:0 0 0 1px ${chartThemeColors.value.tooltipShadow}, 0 0 16px ${chartThemeColors.value.tooltipShadow}`,
  axisPointer: {
    type: 'cross' as const,
    crossStyle: {
      color: chartThemeColors.value.textTertiary,
    },
    lineStyle: {
      color: chartThemeColors.value.crosshairColor,
      width: 1,
      type: 'dashed' as const,
    },
    shadowStyle: {
      color: chartThemeColors.value.crosshairColor,
    },
  },
}))

const pingChartOption = computed(() => {
  const taskList = selectedTasks.value
  const data = mergedData.value
  const hours = selectedHours.value

  const packetLossData = data.map(row => getPacketLossRate(row, taskList))
  const delaySeries = taskList.map((task) => {
    const color = getTaskColor(task.id)
    return {
      name: task.name,
      type: 'line' as const,
      data: data.map(d => (d[task.id] as number | null | undefined) ?? null),
      yAxisIndex: 0,
      smooth: false,
      showSymbol: false,
      // 仅由图表跨过 null 做视觉连接，原始失败点仍然没有延迟值。
      connectNulls: true,
      lineStyle: { width: 1.5, color, cap: 'round' as const },
      itemStyle: { color }, // 确保 symbol 颜色一致
      z: 2,
    }
  })
  const packetLossSeries = {
    name: packetLossSeriesName,
    type: 'bar' as const,
    data: packetLossData,
    yAxisIndex: 1,
    barMaxWidth: 8,
    itemStyle: { color: packetLossColor, opacity: 0.55, borderRadius: [2, 2, 0, 0] },
    z: 1,
  }

  return {
    animation: false,
    // 全局颜色设置（用于图例等）
    color: tasks.value.map((_, idx) => {
      const safeIdx = Math.max(0, idx % chartColors.length)
      return chartColors[safeIdx]!
    }),
    tooltip: {
      ...baseTooltipConfig.value,
      formatter: (params: unknown) => {
        const p = params as Array<{ dataIndex: number }>
        if (!p.length)
          return ''
        const firstParam = p[0]
        if (!firstParam)
          return ''
        const rowData = data[firstParam.dataIndex]
        if (!rowData)
          return ''

        const time = rowData.time as string
        const timeStr = formatTimeForTooltip(time, hours)
        let html = `<div style="font-weight:600;margin-bottom:6px;color:${chartThemeColors.value.textSecondary}">${timeStr}</div>`
        html += '<div style="display:flex;flex-direction:column;gap:4px">'

        const packetLoss = getPacketLossRate(rowData, taskList)
        if (packetLoss !== null) {
          const lossDot = `<span style="display:inline-block;width:8px;height:8px;border-radius:2px;background:${packetLossColor};margin-right:8px;flex-shrink:0"></span>`
          html += `<div style="display:flex;align-items:center">${lossDot}<span style="flex:1">丢包率</span><span style="margin-left:16px;font-weight:600;font-variant-numeric:tabular-nums">${packetLoss.toFixed(2)}%</span></div>`
        }

        const taskRows = taskList
          .map((task) => {
            const delay = rowData[task.id]
            return {
              color: getTaskColor(task.id),
              delay: typeof delay === 'number' ? delay : null,
              lost: rowData[getPacketLossKey(task.id)] === 100,
              name: task.name,
            }
          })
          .filter(item => item.lost || item.delay !== null)
          .sort((a, b) => {
            if (a.lost !== b.lost)
              return a.lost ? -1 : 1
            return (a.delay ?? Number.POSITIVE_INFINITY) - (b.delay ?? Number.POSITIVE_INFINITY)
          })

        for (const item of taskRows) {
          const colorDot = `<span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${item.color};margin-right:8px;flex-shrink:0"></span>`
          const value = item.lost
            ? '<span style="color:#EF4444">探测失败 / 丢包</span>'
            : `${Math.round(item.delay as number)} ms`
          html += `<div style="display:flex;align-items:center">${colorDot}<span style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${escapeTooltipText(item.name)}</span><span style="margin-left:16px;font-weight:600;font-variant-numeric:tabular-nums">${value}</span></div>`
        }
        html += '</div>'
        return html
      },
    },
    legend: {
      type: 'scroll',
      bottom: 0,
      itemWidth: 12,
      itemHeight: 12,
      itemGap: 16,
      icon: 'roundRect',
      textStyle: { fontSize: 11, color: chartThemeColors.value.textSecondary },
      data: taskList.map(t => t.name),
    },
    grid: chartMargin,
    xAxis: {
      type: 'category',
      data: data.map(d => formatTime(d.time as string, showDateInAxis.value)),
      axisLabel: {
        fontSize: 11,
        color: chartThemeColors.value.textSecondary,
        margin: 12,
      },
      axisLine: {
        show: true,
        lineStyle: { color: chartThemeColors.value.borderColor, width: 1 },
      },
      axisTick: { show: false },
      boundaryGap: false,
    },
    yAxis: [
      {
        type: 'value',
        name: '延迟 (ms)',
        nameTextStyle: { color: chartThemeColors.value.textSecondary },
        axisLabel: { fontSize: 11, color: chartThemeColors.value.textSecondary, formatter: '{value}' },
        axisLine: { show: false },
        axisTick: { show: false },
        splitLine: {
          lineStyle: {
            color: chartThemeColors.value.splitLineColor,
            type: 'dashed' as const,
          },
        },
      },
      {
        type: 'value',
        name: '丢包率 (%)',
        min: 0,
        max: 100,
        interval: 25,
        position: 'right',
        nameTextStyle: { color: chartThemeColors.value.textSecondary },
        axisLabel: { fontSize: 11, color: chartThemeColors.value.textSecondary, formatter: '{value}%' },
        axisLine: { show: false },
        axisTick: { show: false },
        splitLine: { show: false },
      },
    ],
    series: [packetLossSeries, ...delaySeries],
  }
})

// ==================== 生命周期 ====================

watch(selectedView, () => {
  resetTaskSelection()
  fetchRecords()
})

watch(() => props.uuid, () => {
  remoteData.value = []
  tasks.value = []
  resetTaskSelection()
  activeTaskTooltipId.value = null
  fetchRecords()
})

onMounted(() => {
  syncTouchTooltipMode()
  coarsePointerMediaQuery = window.matchMedia('(pointer: coarse)')
  coarsePointerMediaQuery.addEventListener('change', syncTouchTooltipMode)

  const firstView = availableViews.value[0]
  if (firstView && !selectedView.value) {
    selectedView.value = firstView.label
  }
  fetchRecords()
})

onBeforeUnmount(() => {
  coarsePointerMediaQuery?.removeEventListener('change', syncTouchTooltipMode)
})
</script>

<template>
  <div class="flex flex-col gap-4">
    <!-- 时间选择器 -->
    <Tabs v-model="selectedView" class="w-full items-center">
      <div class="min-w-0 flex-1 overflow-x-auto rounded-sm pointer-events-auto">
        <TabsList class="w-max h-8 bg-background/50 backdrop-blur-xl rounded-md">
          <TabsTrigger
            v-for="view in availableViews" :key="view.label" :value="view.label"
            class="h-6.5 flex-none shrink-0 text-xs border-none data-[state=active]:text-green-600 shadow-none rounded-sm"
          >
            {{ view.label }}
          </TabsTrigger>
        </TabsList>
      </div>
      <div class="md:flex-1" />
      <div class="flex gap-2 items-center">
        <Button
          variant="ghost" size="xs" class="h-7 rounded-sm bg-background/50 hover:bg-background border-none"
          :class="selectedTaskIds.length === tasks.length ? 'shadow-[0_0_0_2px] shadow-green-600/10 text-green-600' : ''"
          @click="showAllTasks"
        >
          全选
        </Button>
      </div>
    </Tabs>

    <!-- 内容区域 -->
    <Spinner :show="loading" content-class="flex flex-col gap-4">
      <div v-if="error" class="text-red-500 py-8 text-center">
        {{ error }}
      </div>
      <div v-else-if="tasks.length === 0 && !loading" class="py-8">
        <Empty description="暂无延迟数据" />
      </div>

      <template v-else>
        <!-- 最新值统计卡片（可点击切换选中状态） -->
        <div
          v-if="latestValues.length > 0" class="gap-3 grid"
          style="grid-template-columns: repeat(auto-fit, minmax(180px, 1fr))"
        >
          <div
            v-for="task in latestValues" :key="task.id"
            class="p-2 rounded-md bg-background/50 hover:bg-background hover:shadow-[0_0_0_2px] hover:shadow-primary/10 flex gap-3 cursor-pointer select-none transition-all items-center"
            :class="[!selectedTaskIds.includes(task.id) && 'opacity-30']"
            :onmouseover="(e: MouseEvent) => ((e.currentTarget as HTMLElement).style.borderColor = task.color)"
            :onmouseout="(e: MouseEvent) => ((e.currentTarget as HTMLElement).style.borderColor = '')"
            @click="toggleTask(task.id)"
          >
            <div class="flex-1 min-w-0">
              <TooltipProvider>
                <div class="flex gap-2 items-center">
                  <div class="rounded h-4 w-1" :style="{ backgroundColor: task.color }" />
                  <span class="text-sm font-semibold truncate">{{ task.name }}</span>
                  <div class="flex-1" />
                  <Tooltip
                    :open="isTouchTooltipMode ? activeTaskTooltipId === task.id : undefined"
                    @update:open="(open) => setTaskTooltipOpen(task.id, open)"
                  >
                    <TooltipTrigger as-child>
                      <Button variant="ghost" size="icon-xs" class="text-slate-500" @click.stop="toggleTaskTooltip(task.id)">
                        <Icon icon="carbon:information" :width="14" :height="14" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent class="!rounded p-3">
                      <div class="text-xs gap-x-4 gap-y-1.5 grid grid-cols-4">
                        <template v-if="task.min !== undefined">
                          <span class="text-muted-foreground">最小</span>
                          <span class="font-medium">{{ Math.round(task.min) }} ms</span>
                        </template>
                        <template v-if="task.max !== undefined">
                          <span class="text-muted-foreground">最大</span>
                          <span class="font-medium">{{ Math.round(task.max) }} ms</span>
                        </template>
                        <template v-if="task.avg !== undefined">
                          <span class="text-muted-foreground">平均</span>
                          <span class="font-medium">{{ Math.round(task.avg) }} ms</span>
                        </template>
                        <template v-if="task.latest !== undefined">
                          <span class="text-muted-foreground">最新</span>
                          <span class="font-medium">{{ task.latest >= 0 ? `${Math.round(task.latest)} ms` : '丢包' }}</span>
                        </template>
                        <template v-if="task.p50 !== undefined">
                          <span class="text-muted-foreground">P50</span>
                          <span class="font-medium">{{ Math.round(task.p50) }} ms</span>
                        </template>
                        <template v-if="task.p99 !== undefined">
                          <span class="text-muted-foreground">P99</span>
                          <span class="font-medium">{{ Math.round(task.p99) }} ms</span>
                        </template>
                        <template v-if="task.p99_p50_ratio !== undefined">
                          <span class="text-muted-foreground">波动率</span>
                          <span class="font-medium">{{ task.p99_p50_ratio.toFixed(2) }}</span>
                        </template>
                        <template v-if="task.interval !== undefined">
                          <span class="text-muted-foreground">间隔</span>
                          <span class="font-medium">{{ task.interval }}s</span>
                        </template>
                        <template v-if="task.type">
                          <span class="text-muted-foreground">类型</span>
                          <span class="font-medium">{{ task.type.toUpperCase() }}</span>
                        </template>
                        <template v-if="task.total !== undefined">
                          <span class="text-muted-foreground">总数</span>
                          <span class="font-medium">{{ task.total }}</span>
                        </template>
                      </div>
                    </TooltipContent>
                  </Tooltip>
                </div>
              </TooltipProvider>
              <div class="text-xs mt-1 flex gap-1.5 items-center text-muted-foreground">
                <span class="font-medium" title="平均延迟">
                  {{ task.avg !== undefined ? `${Math.round(task.avg)}ms` : '-' }}
                </span>
                <span class="opacity-60">·</span>
                <span title="丢包率">{{ task.loss.toFixed(2) }}%</span>
                <template v-if="task.p99_p50_ratio !== undefined">
                  <span class="opacity-60">·</span>
                  <span title="波动率">{{ task.p99_p50_ratio.toFixed(2) }}</span>
                </template>
              </div>
            </div>
          </div>
        </div>

        <!-- 图表 -->
        <div class="h-80 bg-background/50 p-4 rounded-md">
          <VChart :option="pingChartOption" autoresize />
        </div>
      </template>
    </Spinner>
  </div>
</template>
