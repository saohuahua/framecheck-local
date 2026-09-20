import { describe, expect, it } from 'vitest'
import { getDevelopmentDiagnostics } from '../../src/features/viewer/diagnostics'

describe('开发提示筛选', () => {
  it('只保留错误和警告并按严重程度排序', () => {
    const diagnostics = getDevelopmentDiagnostics([
      { id: 'info', severity: 'info', type: 'unsupported_masks', message: '原始分类' },
      { id: 'warning', severity: 'warning', type: 'missing_font', message: '需要核对字体' },
      { id: 'error', severity: 'error', type: 'export_failed', message: '导出失败' },
    ])

    expect(diagnostics.map((diagnostic) => diagnostic.id)).toEqual(['error', 'warning'])
  })
})
