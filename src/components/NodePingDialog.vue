<script setup lang="ts">
import type { NodeData } from '@/stores/nodes'
import { defineAsyncComponent } from 'vue'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'

defineProps<{
  open: boolean
  node: NodeData
}>()

const emit = defineEmits<{
  'update:open': [open: boolean]
}>()

const PingChart = defineAsyncComponent(() => import('@/components/PingChart.vue'))
</script>

<template>
  <Dialog :open="open" @update:open="emit('update:open', $event)">
    <DialogContent class="gap-0 p-0 sm:max-w-5xl">
      <div class="sticky top-0 z-10 border-b bg-background/95 px-4 py-4 pr-14 backdrop-blur sm:px-6">
        <DialogTitle class="truncate text-base sm:text-lg">
          {{ node.name }} - 延迟监控
        </DialogTitle>
        <DialogDescription class="sr-only">
          查看 {{ node.name }} 的延迟监控图表
        </DialogDescription>
      </div>
      <div class="p-4 sm:p-6">
        <PingChart :uuid="node.uuid" />
      </div>
    </DialogContent>
  </Dialog>
</template>
