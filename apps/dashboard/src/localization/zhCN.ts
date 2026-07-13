/*
 * Copyright 2025 Daytona Platforms Inc.
 * SPDX-License-Identifier: AGPL-3.0
 */

let localizationEnabled = false

const exactTranslations = new Map<string, string>([
  ['Sandboxes', '沙箱'],
  ['Sandbox', '沙箱'],
  ['Snapshots', '快照'],
  ['Snapshot', '快照'],
  ['Registries', '镜像仓库'],
  ['Volumes', '存储卷'],
  ['Volume', '存储卷'],
  ['Audit Logs', '审计日志'],
  ['API Keys', 'API 密钥'],
  ['API Key', 'API 密钥'],
  ['Webhooks', 'Webhook'],
  ['Webhook', 'Webhook'],
  ['Limits', '额度限制'],
  ['Spending', '消费'],
  ['Wallet', '钱包'],
  ['Runners', 'Runner'],
  ['Runner', 'Runner'],
  ['Regions', '区域'],
  ['Region', '区域'],
  ['Members', '成员'],
  ['Member', '成员'],
  ['Roles', '角色'],
  ['Role', '角色'],
  ['Account Settings', '账号设置'],
  ['Settings', '设置'],
  ['Navigation', '导航'],
  ['Help & Support', '帮助与支持'],
  ['Dashboard', '控制台'],
  ['Create', '创建'],
  ['Add', '添加'],
  ['New', '新建'],
  ['Edit', '编辑'],
  ['Update', '更新'],
  ['Save', '保存'],
  ['Cancel', '取消'],
  ['Delete', '删除'],
  ['Remove', '移除'],
  ['Close', '关闭'],
  ['Confirm', '确认'],
  ['Continue', '继续'],
  ['Back', '返回'],
  ['Next', '下一步'],
  ['Done', '完成'],
  ['Copy', '复制'],
  ['Copied', '已复制'],
  ['Refresh', '刷新'],
  ['Search', '搜索'],
  ['Filter', '筛选'],
  ['Clear', '清除'],
  ['Open', '打开'],
  ['Connect', '连接'],
  ['Disconnect', '断开连接'],
  ['Enable', '启用'],
  ['Disable', '禁用'],
  ['Enabled', '已启用'],
  ['Disabled', '已禁用'],
  ['Active', '活跃'],
  ['Inactive', '未激活'],
  ['Status', '状态'],
  ['Actions', '操作'],
  ['Name', '名称'],
  ['Description', '描述'],
  ['Created', '已创建'],
  ['Created At', '创建时间'],
  ['Updated', '已更新'],
  ['Updated At', '更新时间'],
  ['Last Used', '上次使用'],
  ['Usage', '用量'],
  ['Limit', '限制'],
  ['Price', '价格'],
  ['Amount', '金额'],
  ['Total', '总计'],
  ['Date', '日期'],
  ['Time', '时间'],
  ['Type', '类型'],
  ['User', '用户'],
  ['Email', '邮箱'],
  ['Organization', '组织'],
  ['Organizations', '组织'],
  ['Invite', '邀请'],
  ['Invitations', '邀请'],
  ['Pending', '待处理'],
  ['Accepted', '已接受'],
  ['Expired', '已过期'],
  ['Owner', '所有者'],
  ['Admin', '管理员'],
  ['Loading', '加载中'],
  ['Loading...', '加载中...'],
  ['No results found.', '未找到结果。'],
  ['No results found', '未找到结果'],
  ['No data', '暂无数据'],
  ['Error', '错误'],
  ['Success', '成功'],
  ['Failed', '失败'],
  ['Unknown', '未知'],
  ['Unknown error', '未知错误'],
  ['The page you\'re looking for doesn\'t exist or has been moved.', '你访问的页面不存在或已被移动。'],
  ['Back to Dashboard', '返回控制台'],
  ['Sign in', '登录'],
  ['Sign out', '退出登录'],
  ['Log out', '退出登录'],
  ['Profile', '个人资料'],
  ['Billing', '账单'],
  ['Plan', '套餐'],
  ['Usage limits', '用量限制'],
  ['Current usage', '当前用量'],
  ['Default region', '默认区域'],
  ['Set as default', '设为默认'],
  ['Permissions', '权限'],
  ['Permission', '权限'],
  ['Read', '读取'],
  ['Write', '写入'],
  ['Manage', '管理'],
  ['Created by', '创建者'],
  ['Last updated', '最后更新'],
  ['Never', '从未'],
  ['All', '全部'],
  ['None', '无'],
  ['Required', '必填'],
  ['Optional', '可选'],
  ['Submit', '提交'],
  ['Retry', '重试'],
  ['Upload', '上传'],
  ['Download', '下载'],
  ['Import', '导入'],
  ['Export', '导出'],
  ['Endpoint', '端点'],
  ['Endpoints', '端点'],
  ['Messages', '消息'],
  ['Message', '消息'],
  ['Event', '事件'],
  ['Events', '事件'],
  ['Secret', '密钥'],
  ['Token', '令牌'],
  ['Password', '密码'],
  ['Username', '用户名'],
  ['Address', '地址'],
  ['Port', '端口'],
  ['Branch', '分支'],
  ['Repository', '仓库'],
  ['Image', '镜像'],
  ['Images', '镜像'],
  ['Size', '大小'],
  ['CPU', 'CPU'],
  ['Memory', '内存'],
  ['Disk', '磁盘'],
  ['Public', '公开'],
  ['Private', '私有'],
  ['Connected', '已连接'],
  ['Disconnected', '已断开'],
  ['Verified', '已验证'],
  ['Unverified', '未验证'],
])

function translateText(value: string): string {
  const trimmed = value.trim()
  if (!trimmed) {
    return value
  }

  const exact = exactTranslations.get(trimmed)
  if (exact) {
    return value.replace(trimmed, exact)
  }

  return value
}

function translateAttributes(element: Element) {
  for (const attr of ['placeholder', 'title', 'aria-label']) {
    const value = element.getAttribute(attr)
    if (!value) {
      continue
    }

    const translated = translateText(value)
    if (translated !== value) {
      element.setAttribute(attr, translated)
    }
  }
}

function translateNode(node: Node) {
  if (node.nodeType === Node.TEXT_NODE) {
    const translated = translateText(node.textContent ?? '')
    if (translated !== node.textContent) {
      node.textContent = translated
    }
    return
  }

  if (node.nodeType !== Node.ELEMENT_NODE) {
    return
  }

  const element = node as Element
  if (['SCRIPT', 'STYLE', 'CODE', 'PRE'].includes(element.tagName)) {
    return
  }

  translateAttributes(element)
  element.childNodes.forEach(translateNode)
}

export function enableZhCNLocalization() {
  if (localizationEnabled || typeof document === 'undefined') {
    return
  }

  localizationEnabled = true
  translateNode(document.body)

  const observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      if (mutation.type === 'characterData') {
        translateNode(mutation.target)
        continue
      }

      if (mutation.type === 'attributes' && mutation.target instanceof Element) {
        translateAttributes(mutation.target)
        continue
      }

      mutation.addedNodes.forEach(translateNode)
    }
  })

  observer.observe(document.body, {
    attributes: true,
    attributeFilter: ['placeholder', 'title', 'aria-label'],
    characterData: true,
    childList: true,
    subtree: true,
  })
}
