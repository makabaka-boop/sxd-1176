export const TAG_STATUS_OPTIONS = [
  { value: '待挂牌', label: '待挂牌', type: 'warning' },
  { value: '已挂装', label: '已挂装', type: 'success' },
  { value: '待调换', label: '待调换', type: 'primary' },
  { value: '待回收确认', label: '待回收确认', type: 'danger' },
  { value: '已回收', label: '已回收', type: 'info' },
  { value: '异常观察', label: '异常观察', type: 'danger' }
]

export const RECOVERY_STATUS_OPTIONS = [
  { value: '待回收确认', label: '待回收确认', type: 'warning' },
  { value: '已回收', label: '已回收', type: 'success' },
  { value: '已驳回', label: '已驳回', type: 'info' }
]

export const MISSING_STATUS_OPTIONS = [
  { value: '未处理', label: '未处理', type: 'danger' },
  { value: '处理中', label: '处理中', type: 'warning' },
  { value: '已处理', label: '已处理', type: 'success' }
]

export const MISSING_TYPE_OPTIONS = [
  { value: '挂牌丢失', label: '挂牌丢失' },
  { value: '挂牌损坏', label: '挂牌损坏' },
  { value: '样衣破损', label: '样衣破损' },
  { value: '样衣污渍', label: '样衣污渍' },
  { value: '配件缺失', label: '配件缺失' },
  { value: '尺码标缺失', label: '尺码标缺失' },
  { value: '其他', label: '其他' }
]

export function getStatusClass(status) {
  const map = {
    '待挂牌': 'status-pending',
    '已挂装': 'status-hanged',
    '待调换': 'status-swap',
    '待回收确认': 'status-recovery',
    '已回收': 'status-done',
    '已驳回': 'status-done',
    '异常观察': 'status-abnormal',
    '未处理': 'status-recovery',
    '处理中': 'status-pending',
    '已处理': 'status-done'
  }
  return map[status] || 'status-done'
}

export function getStatusTagType(status) {
  const map = {
    '待挂牌': 'warning',
    '已挂装': 'success',
    '待调换': 'primary',
    '待回收确认': 'warning',
    '已回收': 'info',
    '已驳回': 'info',
    '异常观察': 'danger',
    '未处理': 'danger',
    '处理中': 'warning',
    '已处理': 'success'
  }
  return map[status] || 'info'
}
