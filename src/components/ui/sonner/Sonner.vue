<script lang="ts" setup>
import type { ToasterProps } from 'vue-sonner'

import { Icon } from '@iconify/vue'
import { Toaster as Sonner } from 'vue-sonner'
import { cn } from '@/lib/utils'

const props = defineProps<ToasterProps>()
</script>

<template>
  <Sonner
    :class="cn('toaster group', props.class)" :style="{
      '--normal-bg': 'var(--popover)',
      '--normal-text': 'var(--popover-foreground)',
      '--normal-border': 'var(--border)',
      '--border-radius': 'var(--radius)',
    }" v-bind="props"
  >
    <template #success-icon>
      <Icon icon="tabler:circle-check" class="size-4" />
    </template>
    <template #info-icon>
      <Icon icon="tabler:info-circle" class="size-4" />
    </template>
    <template #warning-icon>
      <Icon icon="tabler:alert-triangle" class="size-4" />
    </template>
    <template #error-icon>
      <Icon icon="tabler:circle-x" class="size-4" />
    </template>
    <template #loading-icon>
      <div>
        <Icon icon="tabler:loader-2" class="size-4 animate-spin" />
      </div>
    </template>
    <template #close-icon>
      <Icon icon="tabler:x" class="size-4" />
    </template>
  </Sonner>
</template>
