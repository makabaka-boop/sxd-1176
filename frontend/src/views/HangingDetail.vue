<template>
  <div class="page-container">
    <div class="page-header">
      <div style="display:flex; align-items:center; gap:12px;">
        <el-button :icon="ArrowLeft" @click="$router.back()">返回</el-button>
        <span class="page-title">挂牌详情</span>
      </div>
      <div v-if="detail" style="display:flex; gap:8px;">
        <el-button type="primary" :icon="Switch" @click="openSwapDialog" :disabled="!['已挂装','待调换'].includes(detail.status)">调换</el-button>
        <el-button type="danger" v-if="detail.expiry_status === 'overdue' && ['已挂装','待调换','异常观察'].includes(detail.status)" @click="quickRequestRecovery">
          快捷回收
        </el-button>
        <el-button type="warning" :icon="RefreshLeft" @click="requestRecovery" :disabled="!['已挂装','待调换','异常观察'].includes(detail.status)">申请回收</el-button>
        <el-button type="danger" :icon="Warning" @click="reportMissing" :disabled="!['已挂装','异常观察'].includes(detail.status)">缺件上报</el-button>
      </div>
    </div>

    <div v-loading="loading" v-if="detail">
      <el-row :gutter="16" class="mb-16">
        <el-col :span="16">
          <div class="stat-card">
            <div class="detail-section-title">挂牌信息</div>
            <div class="detail-grid">
              <div class="detail-item">
                <span class="detail-label">挂牌编号</span>
                <span class="detail-value"><b>{{ detail.tag_code }}</b></span>
              </div>
              <div class="detail-item">
                <span class="detail-label">RFID编码</span>
                <span class="detail-value">{{ detail.rfid_code || '-' }}</span>
              </div>
              <div class="detail-item">
                <span class="detail-label">挂牌模板</span>
                <span class="detail-value">{{ detail.template_name || '-' }}</span>
              </div>
              <div class="detail-item">
                <span class="detail-label">当前状态</span>
                <span class="detail-value"><el-tag :type="getStatusTagType(detail.status)" size="large">{{ detail.status }}</el-tag></span>
              </div>
              <div class="detail-item">
                <span class="detail-label">挂装单号</span>
                <span class="detail-value">{{ detail.record_no }}</span>
              </div>
              <div class="detail-item">
                <span class="detail-label">挂装时间</span>
                <span class="detail-value">{{ detail.hang_time }}</span>
              </div>
              <div class="detail-item">
                <span class="detail-label">预计下架日期</span>
                <span class="detail-value">{{ detail.expected_off_date || '-' }}</span>
              </div>
              <div class="detail-item">
                <span class="detail-label">到期状态</span>
                <span class="detail-value">
                  <el-tag v-if="detail.expiry_status" :type="getExpiryStatusTagType(detail.expiry_status)" size="small">
                    {{ getExpiryStatusLabel(detail.expiry_status) }}
                  </el-tag>
                  <span v-else style="color:#909399;font-size:12px;">未设置</span>
                </span>
              </div>
              <div class="detail-item">
                <span class="detail-label">剩余天数</span>
                <span class="detail-value" :style="{ color: detail.expiry_status === 'overdue' ? '#f56c6c' : detail.expiry_status === 'expiring' ? '#e6a23c' : '#606266' }">
                  {{ getDaysLeftText(detail.days_left, detail.expiry_status) }}
                </span>
              </div>
              <div class="detail-item">
                <span class="detail-label">操作员</span>
                <span class="detail-value">{{ detail.operator_name || '-' }}</span>
              </div>
              <div class="detail-item">
                <span class="detail-label">调换次数</span>
                <span class="detail-value">
                  <el-tag v-if="detail.swaps?.length >= 3" type="danger" size="small">{{ detail.swaps?.length || 0 }}次（过频警告）</el-tag>
                  <el-tag v-else size="small">{{ detail.swaps?.length || 0 }}次</el-tag>
                </span>
              </div>
            </div>
          </div>
        </el-col>
        <el-col :span="8">
          <div class="stat-card">
            <div class="detail-section-title" style="border-left-color:#67c23a;">陈列位置</div>
            <div style="text-align:center; padding:12px 0;">
              <div style="font-size:18px; font-weight:600; margin-bottom:8px;">{{ detail.area_name }}</div>
              <div style="font-size:14px; color:#606266;">第 {{ detail.layer_no }} 层 · 第 {{ detail.position_no }} 位</div>
              <el-divider />
              <div class="detail-item" style="margin-bottom:8px;">
                <span class="detail-label">区域编码</span>
                <span class="detail-value">{{ detail.area_code }}</span>
              </div>
              <div class="detail-item">
                <span class="detail-label">所在楼层</span>
                <span class="detail-value">{{ detail.floor }}楼</span>
              </div>
            </div>
          </div>
        </el-col>
      </el-row>

      <el-row :gutter="16" class="mb-16">
        <el-col :span="12">
          <div class="stat-card">
            <div class="detail-section-title" style="border-left-color:#409eff;">样衣信息</div>
            <div class="detail-grid">
              <div class="detail-item">
                <span class="detail-label">款号</span>
                <span class="detail-value"><b>{{ detail.garment_code }}</b></span>
              </div>
              <div class="detail-item">
                <span class="detail-label">款名</span>
                <span class="detail-value">{{ detail.garment_name }}</span>
              </div>
              <div class="detail-item">
                <span class="detail-label">分类</span>
                <span class="detail-value">{{ detail.category_name }}</span>
              </div>
              <div class="detail-item">
                <span class="detail-label">季节</span>
                <span class="detail-value">{{ detail.season || '-' }}</span>
              </div>
              <div class="detail-item">
                <span class="detail-label">颜色</span>
                <span class="detail-value">{{ detail.color || '-' }}</span>
              </div>
              <div class="detail-item">
                <span class="detail-label">尺码</span>
                <span class="detail-value">{{ detail.size || '-' }}</span>
              </div>
              <div class="detail-item" style="grid-column: span 2;">
                <span class="detail-label">面料</span>
                <span class="detail-value">{{ detail.fabric || '-' }}</span>
              </div>
              <div class="detail-item" style="grid-column: span 2;">
                <span class="detail-label">备注</span>
                <span class="detail-value">{{ detail.description || '-' }}</span>
              </div>
            </div>
          </div>
        </el-col>
        <el-col :span="12">
          <div class="stat-card">
            <div class="detail-section-title" style="border-left-color:#e6a23c;">责任人</div>
            <div class="detail-grid">
              <div class="detail-item">
                <span class="detail-label">姓名</span>
                <span class="detail-value"><b>{{ detail.person_name }}</b></span>
              </div>
              <div class="detail-item">
                <span class="detail-label">工号</span>
                <span class="detail-value">{{ detail.person_code }}</span>
              </div>
              <div class="detail-item">
                <span class="detail-label">部门</span>
                <span class="detail-value">{{ detail.department }}</span>
              </div>
              <div class="detail-item">
                <span class="detail-label">电话</span>
                <span class="detail-value">{{ detail.phone || '-' }}</span>
              </div>
              <div class="detail-item" style="grid-column: span 2;">
                <span class="detail-label">邮箱</span>
                <span class="detail-value">{{ detail.email || '-' }}</span>
              </div>
              <div class="detail-item" style="grid-column: span 2;">
                <span class="detail-label">挂装备注</span>
                <span class="detail-value">{{ detail.remark || '-' }}</span>
              </div>
            </div>
          </div>
        </el-col>
      </el-row>

      <el-tabs v-model="activeTab">
        <el-tab-pane name="swap" label="调换历史">
          <el-empty v-if="!detail.swaps?.length" description="暂无调换记录" />
          <el-timeline v-else>
            <el-timeline-item
              v-for="s in detail.swaps"
              :key="s.id"
              :timestamp="s.swap_time"
              placement="top"
              :type="s.swap_count >= 3 ? 'danger' : 'primary'"
              size="large"
            >
              <el-card shadow="never" style="margin-bottom:12px;">
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
                  <b>调换单号：{{ s.record_no }}</b>
                  <el-tag size="small">{{ s.operator_name || '系统' }}</el-tag>
                </div>
                <el-descriptions :column="2" size="small" border>
                  <el-descriptions-item label="原样衣">{{ s.original_garment_name }}</el-descriptions-item>
                  <el-descriptions-item label="新样衣"><b>{{ s.new_garment_name }}</b></el-descriptions-item>
                  <el-descriptions-item label="原区域">{{ s.original_area }}</el-descriptions-item>
                  <el-descriptions-item label="新区域">{{ s.new_area || '未变更' }}</el-descriptions-item>
                  <el-descriptions-item label="预计下架日期" :span="2">
                    {{ s.expected_off_date || '未设置' }}
                  </el-descriptions-item>
                </el-descriptions>
                <div style="margin-top:8px; color:#909399; font-size:12px;">
                  <b>原因：</b>{{ s.swap_reason || '未填写' }}
                </div>
              </el-card>
            </el-timeline-item>
          </el-timeline>
        </el-tab-pane>
        <el-tab-pane name="missing" label="缺件/异常记录">
          <div style="margin-bottom:12px;">
            <el-button type="danger" :icon="Plus" size="small" @click="reportMissing">新增缺件上报</el-button>
          </div>
          <el-empty v-if="!detail.missingParts?.length" description="暂无缺件记录" />
          <el-table v-else :data="detail.missingParts" stripe>
            <el-table-column prop="record_no" label="单号" width="200" />
            <el-table-column prop="missing_type" label="类型" width="110">
              <template #default="{ row }"><el-tag type="danger" size="small">{{ row.missing_type }}</el-tag></template>
            </el-table-column>
            <el-table-column prop="missing_description" label="问题描述" min-width="200" show-overflow-tooltip />
            <el-table-column label="上报人" width="100">
              <template #default="{ row }">{{ row.reporter_name || '-' }}</template>
            </el-table-column>
            <el-table-column prop="report_time" label="上报时间" width="170" />
            <el-table-column prop="status" label="状态" width="90">
              <template #default="{ row }"><el-tag :type="getStatusTagType(row.status)" size="small">{{ row.status }}</el-tag></template>
            </el-table-column>
            <el-table-column label="处理人" width="100">
              <template #default="{ row }">{{ row.handler_name || '-' }}</template>
            </el-table-column>
            <el-table-column label="处理结果" min-width="160" show-overflow-tooltip>
              <template #default="{ row }">{{ row.handle_result || '-' }}</template>
            </el-table-column>
            <el-table-column label="操作" width="100" fixed="right">
              <template #default="{ row }">
                <el-button v-if="row.status !== '已处理'" link type="primary" size="small" @click="handleMissing(row)">处理</el-button>
              </template>
            </el-table-column>
          </el-table>
        </el-tab-pane>
      </el-tabs>
    </div>

    <el-dialog v-model="swapDialogVisible" title="调换样衣/位置" width="620px">
      <el-alert type="warning" :closable="false" style="margin-bottom:16px;">
        当前：<b>{{ detail?.garment_name }}</b> @ {{ detail?.area_name }} L{{ detail?.layer_no }}-P{{ detail?.position_no }}
      </el-alert>
      <el-form :model="swapForm" :rules="swapRules" ref="swapFormRef" label-width="100px">
        <el-form-item label="新样衣" prop="newGarmentId">
          <el-select v-model="swapForm.newGarmentId" filterable style="width:100%;">
            <el-option v-for="g in availableGarments" :key="g.id" :label="`${g.garment_code} ${g.garment_name}`" :value="g.id" />
          </el-select>
        </el-form-item>
        <el-row :gutter="12">
          <el-col :span="8">
            <el-form-item label="新区域">
              <el-select v-model="swapForm.newAreaId" placeholder="不变更留空" clearable style="width:100%;">
                <el-option v-for="a in areas" :key="a.id" :label="a.area_name" :value="a.id" />
              </el-select>
            </el-form-item>
          </el-col>
          <el-col :span="8">
            <el-form-item label="新层号">
              <el-input-number v-model="swapForm.newLayerNo" :min="1" :max="10" :controls="false" style="width:100%;" />
            </el-form-item>
          </el-col>
          <el-col :span="8">
            <el-form-item label="新位号">
              <el-input-number v-model="swapForm.newPositionNo" :min="1" :max="50" :controls="false" style="width:100%;" />
            </el-form-item>
          </el-col>
        </el-row>
        <el-form-item label="预计下架日期">
          <el-date-picker
            v-model="swapForm.expectedOffDate"
            type="date"
            placeholder="不修改则留空，沿用原日期"
            value-format="YYYY-MM-DD"
            style="width:100%;"
          />
        </el-form-item>
        <el-form-item label="调换原因" prop="swapReason">
          <el-input v-model="swapForm.swapReason" type="textarea" :rows="2" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="swapDialogVisible=false">取消</el-button>
        <el-button type="primary" :loading="submitLoading" @click="submitSwap">确认调换</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="missingDialogVisible" title="上报缺件/异常" width="520px">
      <el-form :model="missingForm" :rules="missingRules" ref="missingFormRef" label-width="90px">
        <el-form-item label="缺件类型" prop="missingType">
          <el-select v-model="missingForm.missingType" style="width:100%;">
            <el-option v-for="t in missingTypes" :key="t.value" :label="t.label" :value="t.value" />
          </el-select>
        </el-form-item>
        <el-form-item label="问题描述" prop="missingDescription">
          <el-input v-model="missingForm.missingDescription" type="textarea" :rows="4" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="missingDialogVisible=false">取消</el-button>
        <el-button type="danger" :loading="submitLoading" @click="submitMissing">确认上报</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="handleDialogVisible" title="处理缺件" width="520px">
      <el-alert type="info" :closable="false" style="margin-bottom:16px;">
        类型：{{ handleMissingRow?.missing_type }} &nbsp;|&nbsp; 问题：{{ handleMissingRow?.missing_description }}
      </el-alert>
      <el-form label-width="90px">
        <el-form-item label="处理结果">
          <el-input v-model="handleResult" type="textarea" :rows="4" placeholder="请填写处理措施、处理结果等信息" />
        </el-form-item>
        <div style="color:#909399; font-size:12px;">
          <el-icon><InfoFilled /></el-icon>
          处理完成后，若该挂牌所有缺件均已处理，状态将自动从异常观察恢复
        </div>
      </el-form>
      <template #footer>
        <el-button @click="handleDialogVisible=false">取消</el-button>
        <el-button type="primary" :loading="submitLoading" @click="submitHandleMissing">标记已处理</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { ArrowLeft, Switch, RefreshLeft, Warning, Plus, InfoFilled } from '@element-plus/icons-vue'
import { getStatusTagType, MISSING_TYPE_OPTIONS, getExpiryStatusTagType, getExpiryStatusLabel, getDaysLeftText } from '@/utils/constants'
import {
  getHangingRecordApi, getAreasApi, getAvailableGarmentsApi,
  createSwapApi, requestRecoveryApi, createMissingPartApi, handleMissingPartApi
} from '@/api'

const route = useRoute()
const loading = ref(false)
const detail = ref(null)
const activeTab = ref('swap')
const areas = ref([])
const availableGarments = ref([])
const missingTypes = MISSING_TYPE_OPTIONS
const submitLoading = ref(false)

const swapDialogVisible = ref(false)
const swapFormRef = ref()
const swapForm = reactive({ originalHangId: '', newGarmentId: '', newAreaId: '', newLayerNo: '', newPositionNo: '', expectedOffDate: '', swapReason: '' })
const swapRules = {
  newGarmentId: [{ required: true, message: '请选择新样衣', trigger: 'change' }],
  swapReason: [{ required: true, message: '请填写调换原因', trigger: 'blur' }]
}

const missingDialogVisible = ref(false)
const missingFormRef = ref()
const missingForm = reactive({ hangId: '', tagId: '', garmentId: '', missingType: '', missingDescription: '' })
const missingRules = {
  missingType: [{ required: true, message: '请选择类型', trigger: 'change' }],
  missingDescription: [{ required: true, message: '请填写描述', trigger: 'blur' }]
}

const handleDialogVisible = ref(false)
const handleMissingRow = ref(null)
const handleResult = ref('')

async function loadDetail() {
  loading.value = true
  try {
    const res = await getHangingRecordApi(route.params.id)
    detail.value = res.data
  } finally {
    loading.value = false
  }
}

async function openSwapDialog() {
  Object.assign(swapForm, { originalHangId: detail.value.id, newGarmentId: '', newAreaId: '', newLayerNo: '', newPositionNo: '', expectedOffDate: '', swapReason: '' })
  try {
    const [a, g] = await Promise.all([getAreasApi(), getAvailableGarmentsApi()])
    areas.value = a.data
    availableGarments.value = g.data
    if (!availableGarments.value.length) return ElMessage.warning('暂无可换的样衣')
    swapDialogVisible.value = true
  } catch (e) {}
}

async function submitSwap() {
  await swapFormRef.value.validate()
  submitLoading.value = true
  try {
    const res = await createSwapApi(swapForm)
    const msg = res.frequentWarning ? `${res.message}（${res.frequentWarning}）` : res.message
    ElMessage({ message: msg, type: res.frequentWarning ? 'warning' : 'success', duration: 5000 })
    swapDialogVisible.value = false
    loadDetail()
  } finally { submitLoading.value = false }
}

function quickRequestRecovery() {
  ElMessageBox.confirm(`该挂装已超期${Math.abs(detail.value.days_left)}天，确认快速申请回收？`, '超期挂装快速回收', {
    confirmButtonText: '确认回收',
    cancelButtonText: '取消',
    type: 'warning'
  }).then(async () => {
    await requestRecoveryApi({ hangId: detail.value.id, remark: `超期自动回收：已超期${Math.abs(detail.value.days_left)}天` })
    ElMessage.success('回收申请已提交')
    loadDetail()
  }).catch(() => {})
}

function requestRecovery() {
  ElMessageBox.prompt('请输入回收备注（可选）', '确认申请回收？', {
    confirmButtonText: '提交', cancelButtonText: '取消',
    inputType: 'textarea', inputPlaceholder: '回收原因/备注...'
  }).then(async ({ value }) => {
    await requestRecoveryApi({ hangId: detail.value.id, remark: value || '' })
    ElMessage.success('回收申请已提交')
    loadDetail()
  }).catch(() => {})
}

function reportMissing() {
  Object.assign(missingForm, { hangId: detail.value.id, tagId: detail.value.tag_id, garmentId: detail.value.garment_id, missingType: '', missingDescription: '' })
  missingDialogVisible.value = true
}

async function submitMissing() {
  await missingFormRef.value.validate()
  submitLoading.value = true
  try {
    await createMissingPartApi(missingForm)
    ElMessage.success('缺件已上报')
    missingDialogVisible.value = false
    loadDetail()
  } finally { submitLoading.value = false }
}

function handleMissing(row) {
  handleMissingRow.value = row
  handleResult.value = ''
  handleDialogVisible.value = true
}

async function submitHandleMissing() {
  if (!handleResult.value.trim()) return ElMessage.warning('请填写处理结果')
  submitLoading.value = true
  try {
    await handleMissingPartApi(handleMissingRow.value.id, { handleResult: handleResult.value })
    ElMessage.success('处理完成，已标记为已处理')
    handleDialogVisible.value = false
    loadDetail()
  } finally { submitLoading.value = false }
}

onMounted(loadDetail)
</script>
