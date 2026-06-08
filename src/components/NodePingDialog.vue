<script setup lang="ts">
import type { NodeData } from '@/stores/nodes'
import { defineAsyncComponent, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import { Spinner } from '@/components/ui/spinner'

const props = defineProps<{
  open: boolean
  node: NodeData
}>()

const emit = defineEmits<{
  'update:open': [open: boolean]
}>()

const PingChart = defineAsyncComponent(() => import('@/components/PingChart.vue'))
const CHART_RENDER_DELAY_MS = 220
const shouldRenderChart = ref(false)
let chartRenderTimer: ReturnType<typeof setTimeout> | null = null

function clearScheduledChartRender() {
  if (chartRenderTimer !== null) {
    window.clearTimeout(chartRenderTimer)
    chartRenderTimer = null
  }
}

function scheduleChartRender(open: boolean) {
  clearScheduledChartRender()
  shouldRenderChart.value = false

  if (!open)
    return

  void nextTick(() => {
    if (!props.open)
      return

    chartRenderTimer = window.setTimeout(() => {
      chartRenderTimer = null
      if (props.open)
        shouldRenderChart.value = true
    }, CHART_RENDER_DELAY_MS)
  })
}

watch(() => props.open, scheduleChartRender, { immediate: true })

watch(() => props.node.uuid, () => {
  scheduleChartRender(props.open)
})

onBeforeUnmount(() => {
  clearScheduledChartRender()
})
</script>

<template>
  <Dialog :open="open" @update:open="emit('update:open', $event)">
    <DialogContent class="gap-0 p-0 sm:max-w-5xl" @close-auto-focus.prevent>
      <div class="sticky top-0 z-10 border-b bg-background/95 px-4 py-4 pr-14 backdrop-blur sm:px-6">
        <DialogTitle class="truncate text-base sm:text-lg">
          {{ node.name }} - 延迟监控
        </DialogTitle>
        <DialogDescription class="sr-only">
          查看 {{ node.name }} 的延迟监控图表
        </DialogDescription>
      </div>
      <div class="p-4 sm:p-6">
        <PingChart v-if="shouldRenderChart" :uuid="node.uuid" :latest-ping="node.ping" />
        <div v-else class="h-80 rounded-md bg-background/50">
          <Spinner class="h-full" content-class="bg-transparent backdrop-blur-0" />
        </div>
      </div>
    </DialogContent>
  </Dialog>
</template>
