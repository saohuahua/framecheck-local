import { PsdPocController, type PsdPocRunResult } from '../../src/features/psd-poc/psd-poc-controller'

interface PsdPocHarness {
  cancel: () => void
  getLastResult: () => PsdPocRunResult | undefined
  isRunning: () => boolean
}

declare global {
  interface Window {
    __framecheckPsdPoc?: PsdPocHarness
  }
}

const controller = new PsdPocController()
const fileInput = requiredElement<HTMLInputElement>('psd-file')
const cancelButton = requiredElement<HTMLButtonElement>('cancel')
const status = requiredElement<HTMLElement>('status')
const resultOutput = requiredElement<HTMLOutputElement>('result')
let lastResult: PsdPocRunResult | undefined
let running = false

fileInput.addEventListener('change', () => {
  const file = fileInput.files?.item(0)
  if (!file) {
    return
  }

  const task = start(file)
  // 选择控件不保留 PSD 文件引用
  fileInput.value = ''
  void task
})

cancelButton.addEventListener('click', () => {
  controller.cancel()
})

window.addEventListener('beforeunload', () => {
  controller.dispose()
})

window.__framecheckPsdPoc = {
  cancel: () => controller.cancel(),
  getLastResult: () => lastResult,
  isRunning: () => running,
}

async function start(file: File): Promise<void> {
  running = true
  cancelButton.disabled = false
  setStatus('running', 'queued')
  lastResult = await controller.run(file, (progress) => {
    setStatus('running', progress.stage)
  })
  running = false
  cancelButton.disabled = true
  setStatus(lastResult.status, lastResult.status)
  resultOutput.textContent = lastResult.status === 'completed'
    ? `layers=${lastResult.report.structure.layerCount} preview=${lastResult.report.preview.status}`
    : `failure=${lastResult.failure.code}`
}

function setStatus(outcome: string, text: string): void {
  status.dataset.status = outcome
  status.textContent = text
}

function requiredElement<T extends HTMLElement>(id: string): T {
  const element = document.getElementById(id)
  if (!element) {
    throw new Error(`Missing #${id}`)
  }
  return element as T
}
