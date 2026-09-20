import type { ViewerDiagnostic } from './types'

export function getDevelopmentDiagnostics(diagnostics: ViewerDiagnostic[]) {
  const weight: Record<ViewerDiagnostic['severity'], number> = { error: 0, warning: 1, info: 2 }
  return diagnostics
    .filter((diagnostic) => diagnostic.severity !== 'info')
    .sort((left, right) => weight[left.severity] - weight[right.severity])
}
