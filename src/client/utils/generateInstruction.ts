import type { Bug } from '../stores'

// Compare mode info
export interface CompareInfo {
  enabled: boolean
  leftIndex: number
  rightIndex: number
}

// Generate structured Markdown instruction
export function generateInstruction(
  bug: Bug,
  locale: 'zh' | 'en' = 'en',
  compare?: CompareInfo,
  projectName?: string,
): string {
  const isZh = locale === 'zh'
  const lines: string[] = []

  // Title (with project name)
  const projectPrefix = projectName ? `[${projectName}] ` : ''
  lines.push(`# ${projectPrefix}Bug #${String(bug.number).padStart(3, '0')}: ${bug.title || (isZh ? '未命名 Bug' : 'Untitled Bug')}`)
  lines.push('')

  // Bug description
  if (bug.description) {
    const hasHistory = bug.description.includes('## History')
    lines.push(`## ${isZh ? '问题描述' : 'Description'}`)
    lines.push(bug.description)
    lines.push('')
    if (hasHistory) {
      lines.push(isZh
        ? '**注意：** 历史记录按时间排序，最新的评论反映当前需要解决的问题，较早的评论对应的问题可能已修复。请优先关注最新评论。'
        : '**Note:** History is sorted chronologically. The latest comments reflect the current issue to fix — earlier comments may already be resolved. Focus on the most recent entries.')
    } else {
      lines.push(isZh ? '**期望行为：** 请根据截图和描述修复此问题。' : '**Expected behavior:** Please fix this issue based on the screenshots and description.')
    }
    lines.push('')
  }

  // Screenshots
  if (bug.screenshots.length > 0) {
    lines.push(`## ${isZh ? '问题截图' : 'Issue Screenshots'}`)
    lines.push('')

    // Compare mode: annotate current vs expected state
    if (compare?.enabled && bug.screenshots.length >= 2) {
      const safeLeft = Math.max(0, Math.min(compare.leftIndex, bug.screenshots.length - 1))
      const safeRight = Math.max(0, Math.min(compare.rightIndex, bug.screenshots.length - 1))
      const leftSS = bug.screenshots[safeLeft]
      const rightSS = bug.screenshots[safeRight]
      if (leftSS) {
        const leftLabel = leftSS.name || `${isZh ? '截图' : 'Screenshot'} ${compare.leftIndex + 1}`
        lines.push(`### ${isZh ? '当前效果' : 'Current State'}（${leftLabel}）`)
        lines.push(`![${leftLabel}](${leftSS.url})`)
        lines.push('')
      }
      if (rightSS) {
        const rightLabel = rightSS.name || `${isZh ? '截图' : 'Screenshot'} ${compare.rightIndex + 1}`
        lines.push(`### ${isZh ? '期望效果' : 'Expected Result'}（${rightLabel}）`)
        lines.push(`![${rightLabel}](${rightSS.url})`)
        lines.push('')
      }
      // Remaining screenshots as supplementary
      bug.screenshots.forEach((ss, i) => {
        if (i === safeLeft || i === safeRight) return
        const label = ss.name || `${isZh ? '截图' : 'Screenshot'} ${i + 1}`
        lines.push(`### ${label}`)
        lines.push(`![${label}](${ss.url})`)
        lines.push('')
      })
    } else {
      bug.screenshots.forEach((ss, i) => {
        const label = ss.name || `${isZh ? '截图' : 'Screenshot'} ${i + 1}`
        lines.push(`### ${label}`)
        lines.push(`![${label}](${ss.url})`)
        lines.push(isZh ? `_${label} - 请仔细查看标注区域_` : `_${label} - Please examine the annotated areas_`)
        lines.push('')
      })
    }
  }

  // Environment info
  if (bug.pagePath || bug.device || bug.browser) {
    lines.push(`## ${isZh ? '环境信息' : 'Environment Info'}`)
    if (bug.pagePath) lines.push(`- ${isZh ? '页面路径' : 'Page'}: ${bug.pagePath}`)
    if (bug.device) lines.push(`- ${isZh ? '设备' : 'Device'}: ${bug.device}`)
    if (bug.browser) lines.push(`- ${isZh ? '浏览器' : 'Browser'}: ${bug.browser}`)
    lines.push('')
  }

  // Related files
  if (bug.relatedFiles.length > 0) {
    lines.push(`## ${isZh ? '相关文件' : 'Related Files'}`)
    bug.relatedFiles.forEach((f) => lines.push(`- ${f}`))
    lines.push('')
  }

  // Priority
  const priorityMap = {
    high: isZh ? '高' : 'High',
    medium: isZh ? '中' : 'Medium',
    low: isZh ? '低' : 'Low',
  }
  lines.push(`## ${isZh ? '优先级' : 'Priority'}`)
  lines.push(priorityMap[bug.priority])
  lines.push('')

  return lines.join('\n')
}
