import { describe, expect, it } from 'vitest'
import {
  NameDeduplicator,
  slugifyLayerName,
  toKebabClassName,
  toPascalComponentName,
} from '../../../src/features/codegen/naming'

describe('slugifyLayerName 图层名转文件名', () => {
  it('保留英文大小写与下划线（对齐 shoot-h5 的图片命名）', () => {
    expect(slugifyLayerName('BG1_Bg')).toBe('BG1_Bg')
    expect(slugifyLayerName('Entrance_BiliBili')).toBe('Entrance_BiliBili')
  })

  it('空格压成单个连字符', () => {
    expect(slugifyLayerName('Layer 1 copy')).toBe('Layer-1-copy')
    expect(slugifyLayerName('  spaced   out  ')).toBe('spaced-out')
  })

  it('保留中日韩文字', () => {
    expect(slugifyLayerName('组 7')).toBe('组-7')
    expect(slugifyLayerName('前往按钮')).toBe('前往按钮')
  })

  it('去掉文件系统不安全字符', () => {
    expect(slugifyLayerName('icon<2x>/final?.png')).toBe('icon-2x-final-png')
    expect(slugifyLayerName('50%:视频')).toBe('50-视频')
  })

  it('全不安全字符时回退到 layer', () => {
    expect(slugifyLayerName('???')).toBe('layer')
    expect(slugifyLayerName('')).toBe('layer')
  })
})

describe('toKebabClassName 图层名转类名', () => {
  it('下划线与空格统一为连字符并转小写', () => {
    expect(toKebabClassName('Entrance_BiliBili')).toBe('entrance-bilibili')
    expect(toKebabClassName('BG2_Bg')).toBe('bg2-bg')
    expect(toKebabClassName('Layer 1 copy')).toBe('layer-1-copy')
  })

  it('保留中日韩文字', () => {
    expect(toKebabClassName('组 7')).toBe('组-7')
  })

  it('全不安全字符时回退到 layer', () => {
    expect(toKebabClassName('???')).toBe('layer')
  })
})

describe('toPascalComponentName 页面名转组件名', () => {
  it('kebab-case 转 PascalCase', () => {
    expect(toPascalComponentName('shooting-home')).toBe('ShootingHome')
    expect(toPascalComponentName('a-b-c')).toBe('ABC')
  })

  it('空输入回退到 GeneratedPage', () => {
    expect(toPascalComponentName('---')).toBe('GeneratedPage')
  })
})

describe('NameDeduplicator 同名去重', () => {
  it('首次用原名，后续追加序号', () => {
    const deduplicator = new NameDeduplicator()
    expect(deduplicator.allocate('BG1_Bg.png')).toBe('BG1_Bg.png')
    expect(deduplicator.allocate('BG1_Bg.png')).toBe('BG1_Bg.png-2')
    expect(deduplicator.allocate('BG1_Bg.png')).toBe('BG1_Bg.png-3')
    expect(deduplicator.allocate('other.png')).toBe('other.png')
  })
})
