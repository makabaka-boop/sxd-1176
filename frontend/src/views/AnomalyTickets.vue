<template>
  <div class="page-container">
    <div class="page-header">
      <div style="display:flex; align-items:center; gap:12px;">
        <div class="page-title">异常工单</div>
        <div style="display:flex; gap:8px;">
          <el-tag type="danger" size="small" style="cursor:pointer;" @click="quickFilter('status', '待处理')">
            待处理 {{ statusCounts?.pending || 0 }}
          </el-tag>
          <el-tag type="warning" size="small" style="cursor:pointer;" @click="quickFilter('status', '处理中')">
            处理中 {{ statusCounts?.processing || 0 }}
          </el-tag>
          <el-tag type="success" size="small" style="cursor:pointer;" @click="quickFilter('status', '已关闭')">
            已关闭 {{ statusCounts?.closed || 0 }}
          </el-tag>
          <el-tag type="danger" size="small" effect="dark" style="cursor:pointer;" @click="quickFilter('overdue', 'true')">
            已超期 {{ overdueCount || 0 }}
          </el-tag>
        </div>
      </div>
      <el-button type="danger" :icon="Plus" @click="openCreateDialog">登记异常</el-button>
    </div>

    <div class="filter-card">
      <el-form :inline="true" :model="filters" @submit.prevent>
        <el-form-item label="关键词">
          <el-input v-model="filters.keyword" placeholder="工单号/描述/挂牌/款号" clearable style="width:200px;" />
        </el-form-item>
        <el-form-item label="状态">
          <el-select v-model="filters.status" placeholder="全部" clearable style="width:120px;">
            <el-option v-for="s in statusOptions" :key="s.value" :label="s.label" :value="s.value" />
          </el-select>
        </el-form-item>
        <el-form-item label="责任人">
          <el-select v-model="filters.responsibleId" placeholder="全部" clearable filterable style="width:150px;">
            <el-option v-for="p in responsiblePersons" :key="p.id" :label="`${p.person_name}（${p.department}）`" :value="p.id" />
          </el-select>
        </el-form-item>
        <el-form-item label="异常类型">
          <el-select v-model="filters.anomalyType" placeholder="全部" clearable style="width:130px;">
            <el-option v-for="t in typeOptions" :key="t.value" :label="t.label" :value="t.value" />
          </el-select>
        </el-form-item>
        <el-form-item label="挂牌编号">
          <el-input v-model="filters.tagCode" placeholder="挂牌编号" clearable style="width:130px;" />
        </el-form-item>
        <el-form-item label="样衣款号">
          <el-input v-model="filters.garmentCode" placeholder="样衣款号" clearable style="width:130px;" />
        </el-form-item>
        <el-form-item label="登记日期">
          <el-date-picker
            v-model="dateRange"
            type="daterange"
            range-separator="至"
            start-placeholder="开始"
            end-placeholder="结束"
            value-format="YYYY-MM-DD"
            style="width:260px;"
          />
        </el-form-item>
        <el-form-item>
          <el-button type="primary" :icon="Search" @click="loadData(1)">查询</el-button>
          <el-button :icon="Refresh" @click="resetFilters">重置</el-button>
        </el-form-item>
      </el-form>
    </div>

    <div class="table-card">
      <el-table :data="tableData" stripe v-loading="loading">
        <el-table-column prop="ticket_no" label="工单编号" width="200" fixed />
        <el-table-column prop="anomaly_type" label="异常类型" width="110">
          <template #default="{ row }"><el-tag type="danger" size="small">{{ row.anomaly_type }}</el-tag></template>
        </el-table-column>
        <el-table-column label="异常来源" min-width="180">
          <template #default="{ row }">
            <div v-if="row.tag_code" style="font-size:12px;">挂牌：<b>{{ row.tag_code }}</b></div>
            <div v-if="row.garment_code" style="font-size:12px;">样衣：<b>{{ row.garment_code }}</b> {{ row.garment_name || '' }}</div>
            <div v-if="row.hang_record_no" style="font-size:12px;color:#909399;">挂装单：{{ row.hang_record_no }}</div>
          </template>
        </el-table-column>
        <el-table-column label="当前挂装位置" min-width="160">
          <template #default="{ row }">
            <div v-if="row.area_name">
              <b>{{ row.area_name }}</b>
              <span style="color:#909399; font-size:12px; margin-left:6px;">
                {{ row.floor }}F · L{{ row.layer_no }}-P{{ row.position_no }}
              </span>
            </div>
            <span v-else style="color:#909399;">未挂装</span>
          </template>
        </el-table-column>
        <el-table-column prop="description" label="问题描述" min-width="180" show-overflow-tooltip />
        <el-table-column prop="person_name" label="责任人" width="100">
          <template #default="{ row }">{{ row.person_name || '-' }}</template>
        </el-table-column>
        <el-table-column label="处理进度" width="90" align="center">
          <template #default="{ row }">
            <el-tag :type="getAnomalyStatusTagType(row.status)" size="small">{{ row.status }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="超期" width="80" align="center">
          <template #default="{ row }">
            <el-tag v-if="row.is_overdue" type="danger" size="small">
              {{ row.days_left != null ? `超期${Math.abs(row.days_left)}天` : '超期' }}
            </el-tag>
            <span v-else>-</span>
          </template>
        </el-table-column>
        <el-table-column prop="expected_handle_date" label="期望处理" width="110" />
        <el-table-column prop="reporter_name" label="登记人" width="90" />
        <el-table-column prop="report_time" label="登记时间" width="170" />
        <el-table-column prop="handler_name" label="当前处理人" width="100">
          <template #default="{ row }">{{ row.handler_name || '-' }}</template>
        </el-table-column>
        <el-table-column label="操作" width="240" fixed="right">
          <template #default="{ row }">
            <el-button v-if="row.status !== '已关闭'" link type="primary" size="small" @click="openHandleDialog(row)">处理</el-button>
            <el-button v-if="row.status !== '已关闭'" link type="warning" size="small" @click="openHandoverDialog(row)">转交</el-button>
            <el-button v-if="row.status !== '已关闭'" link type="success" size="small" @click="openCloseDialog(row)">关闭</el-button>
            <el-button v-if="row.hang_id" link type="primary" size="small" @click="$router.push(`/hanging/${row.hang_id}`)">挂装详情</el-button>
          </template>
        </el-table-column>
      </el-table>
      <el-pagination
        class="mt-16"
        background
        layout="total, sizes, prev, pager, next, jumper"
        :total="total"
        :page-size="filters.pageSize"
        :page-sizes="[10,20,50,100]"
        :current-page="filters.page"
        @size-change="s => { filters.pageSize = s; loadData(1) }"
        @current-change="p => loadData(p)"
      />
    </div>

    <el-dialog v-model="createDialogVisible" title="登记异常工单" width="560px">
      <el-form :model="createForm" :rules="createRules" ref="createFormRef" label-width="100px">
        <el-form-item label="关联挂装">
          <el-select v-model="createForm.hangId" filterable clearable style="width:100%;" @change="onHangChange" placeholder="选择已挂装记录">
            <el-option v-for="h in hangOptions" :key="h.id" :label="`${h.tag_code} - ${h.garment_name}`" :value="h.id" />
          </el-select>
        </el-form-item>
        <el-row :gutter="12">
          <el-col :span="12">
            <el-form-item label="异常类型" prop="anomalyType">
              <el-select v-model="createForm.anomalyType" style="width:100%;">
                <el-option v-for="t in typeOptions" :key="t.value" :label="t.label" :value="t.value" />
              </el-select>
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="责任人" prop="responsibleId">
              <el-select v-model="createForm.responsibleId" filterable style="width:100%;" placeholder="请选择责任人">
                <el-option v-for="p in responsiblePersons" :key="p.id" :label="`${p.person_name}（${p.department}）`" :value="p.id" />
              </el-select>
            </el-form-item>
          </el-col>
        </el-row>
        <el-form-item label="期望处理日期">
          <el-date-picker
            v-model="createForm.expectedHandleDate"
            type="date"
            placeholder="选择期望处理完成日期"
            value-format="YYYY-MM-DD"
            style="width:100%;"
          />
        </el-form-item>
        <el-form-item label="问题描述" prop="description">
          <el-input v-model="createForm.description" type="textarea" :rows="4" placeholder="请详细描述异常情况" />
        </el-form-item>
        <div style="color:#e6a23c; font-size:12px; padding:8px; background:#fdf6ec; border-radius:4px;">
          <el-icon><WarningFilled /></el-icon>
          &nbsp;登记异常后，关联挂牌和挂装状态将自动变更为"异常观察"
        </div>
      </el-form>
      <template #footer>
        <el-button @click="createDialogVisible=false">取消</el-button>
        <el-button type="danger" :loading="submitLoading" @click="submitCreate">确认登记</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="handleDialogVisible" title="处理异常工单" width="520px">
      <el-alert type="info" :closable="false" style="margin-bottom:16px;">
        工单：{{ handleRow?.ticket_no }} &nbsp;|&nbsp; 类型：{{ handleRow?.anomaly_type }}
      </el-alert>
      <el-descriptions :column="1" size="small" border style="margin-bottom:16px;">
        <el-descriptions-item label="问题描述">{{ handleRow?.description }}</el-descriptions-item>
      </el-descriptions>
      <el-form label-width="90px">
        <el-form-item label="处理进展">
          <el-input v-model="handleResult" type="textarea" :rows="4" placeholder="请填写处理进展、已采取的措施等" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="handleDialogVisible=false">取消</el-button>
        <el-button type="primary" :loading="submitLoading" @click="submitHandle">提交处理</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="handoverDialogVisible" title="转交异常工单" width="520px">
      <el-alert type="warning" :closable="false" style="margin-bottom:16px;">
        工单：{{ handoverRow?.ticket_no }} &nbsp;|&nbsp; 当前处理人：{{ handoverRow?.handler_name || '-' }}
      </el-alert>
      <el-form :model="handoverForm" :rules="handoverRules" ref="handoverFormRef" label-width="100px">
        <el-form-item label="转交接收人" prop="toUserId">
          <el-select v-model="handoverForm.toUserId" filterable style="width:100%;" placeholder="选择接收人">
            <el-option v-for="u in users" :key="u.id" :label="`${u.real_name}（${u.role === 'admin' ? '管理员' : '操作员'}）`" :value="u.id" />
          </el-select>
        </el-form-item>
        <el-form-item label="转交备注">
          <el-input v-model="handoverForm.handoverRemark" type="textarea" :rows="3" placeholder="说明转交原因、注意事项等" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="handoverDialogVisible=false">取消</el-button>
        <el-button type="primary" :loading="submitLoading" @click="submitHandover">确认转交</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="closeDialogVisible" title="关闭异常工单" width="520px">
      <el-alert type="success" :closable="false" style="margin-bottom:16px;">
        工单：{{ closeRow?.ticket_no }} &nbsp;|&nbsp; 类型：{{ closeRow?.anomaly_type }}
      </el-alert>
      <el-descriptions :column="1" size="small" border style="margin-bottom:16px;">
        <el-descriptions-item label="问题描述">{{ closeRow?.description }}</el-descriptions-item>
        <el-descriptions-item label="处理进展">{{ closeRow?.handle_result || '暂无处理记录' }}</el-descriptions-item>
      </el-descriptions>
      <el-form label-width="90px">
        <el-form-item label="关闭备注">
          <el-input v-model="closeRemark" type="textarea" :rows="3" placeholder="说明最终处理结果、验证情况等" />
        </el-form-item>
        <div style="color:#67c23a; font-size:12px; padding:8px; background:#f0f9eb; border-radius:4px;">
          <el-icon><CircleCheckFilled /></el-icon>
          &nbsp;关闭后，系统将根据该挂装是否还存在未处理的缺件说明或待回收记录，自动将挂牌恢复到合理状态
        </div>
      </el-form>
      <template #footer>
        <el-button @click="closeDialogVisible=false">取消</el-button>
        <el-button type="success" :loading="submitLoading" @click="submitClose">确认关闭</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import { ElMessage } from 'element-plus'
import { Plus, Search, Refresh, WarningFilled, CircleCheckFilled } from '@element-plus/icons-vue'
import { ANOMALY_STATUS_OPTIONS, ANOMALY_TYPE_OPTIONS, getAnomalyStatusTagType } from '@/utils/constants'
import {
  getAnomalyTicketsApi, createAnomalyTicketApi, handleAnomalyTicketApi,
  handoverAnomalyTicketApi, closeAnomalyTicketApi,
  getResponsiblePersonsApi, getHangingRecordsApi, getUsersApi
} from '@/api'

const route = useRoute()

const loading = ref(false)
const tableData = ref([])
const total = ref(0)
const dateRange = ref([])
const statusOptions = ANOMALY_STATUS_OPTIONS
const typeOptions = ANOMALY_TYPE_OPTIONS
const responsiblePersons = ref([])
const hangOptions = ref([])
const users = ref([])
const submitLoading = ref(false)
const statusCounts = ref({})
const overdueCount = ref(0)

const filters = reactive({
  page: 1, pageSize: 20, keyword: '', status: '', responsibleId: '',
  anomalyType: '', tagCode: '', garmentCode: '', startDate: '', endDate: '', overdue: ''
})

function quickFilter(field, value) {
  Object.assign(filters, { page: 1, keyword: '', status: '', responsibleId: '', anomalyType: '', tagCode: '', garmentCode: '', overdue: '' })
  dateRange.value = []
  if (field === 'overdue') {
    filters.overdue = 'true'
  } else {
    filters[field] = value
  }
  loadData(1)
}

async function loadData(page) {
  if (page) filters.page = page
  const [sd, ed] = dateRange.value || [null, null]
  filters.startDate = sd || ''
  filters.endDate = ed || ''
  loading.value = true
  try {
    const res = await getAnomalyTicketsApi(filters)
    tableData.value = res.data
    total.value = res.total
    statusCounts.value = res.status_counts || {}
    overdueCount.value = res.overdue_count || 0
  } finally { loading.value = false }
}

function resetFilters() {
  Object.assign(filters, { page: 1, keyword: '', status: '', responsibleId: '', anomalyType: '', tagCode: '', garmentCode: '', overdue: '' })
  dateRange.value = []
  loadData()
}

const createDialogVisible = ref(false)
const createFormRef = ref()
const createForm = reactive({ hangId: '', anomalyType: '', description: '', responsibleId: '', expectedHandleDate: '' })
const createRules = {
  anomalyType: [{ required: true, message: '请选择异常类型', trigger: 'change' }],
  description: [{ required: true, message: '请填写问题描述', trigger: 'blur' }]
}

async function openCreateDialog() {
  Object.assign(createForm, { hangId: '', anomalyType: '', description: '', responsibleId: '', expectedHandleDate: '' })
  try {
    const [rp, h, u] = await Promise.all([
      getResponsiblePersonsApi(),
      getHangingRecordsApi({ pageSize: 200, status: '已挂装' }),
      getUsersApi()
    ])
    responsiblePersons.value = rp.data
    hangOptions.value = h.data
    users.value = u.data
  } catch (e) {}
  createDialogVisible.value = true
}

function onHangChange(id) {
  const h = hangOptions.value.find(x => x.id === id)
  if (h && h.responsible_id) {
    createForm.responsibleId = h.responsible_id
  }
}

async function submitCreate() {
  await createFormRef.value.validate()
  submitLoading.value = true
  try {
    await createAnomalyTicketApi(createForm)
    ElMessage.success('异常工单已登记')
    createDialogVisible.value = false
    loadData()
  } finally { submitLoading.value = false }
}

const handleDialogVisible = ref(false)
const handleRow = ref(null)
const handleResult = ref('')

function openHandleDialog(row) {
  handleRow.value = row
  handleResult.value = row.handle_result || ''
  handleDialogVisible.value = true
}

async function submitHandle() {
  submitLoading.value = true
  try {
    await handleAnomalyTicketApi(handleRow.value.id, { handleResult: handleResult.value })
    ElMessage.success('处理进展已提交，状态更新为处理中')
    handleDialogVisible.value = false
    loadData()
  } finally { submitLoading.value = false }
}

const handoverDialogVisible = ref(false)
const handoverFormRef = ref()
const handoverRow = ref(null)
const handoverForm = reactive({ toUserId: '', handoverRemark: '' })
const handoverRules = {
  toUserId: [{ required: true, message: '请选择接收人', trigger: 'change' }]
}

async function openHandoverDialog(row) {
  handoverRow.value = row
  Object.assign(handoverForm, { toUserId: '', handoverRemark: '' })
  try {
    const res = await getUsersApi()
    users.value = res.data
  } catch (e) {}
  handoverDialogVisible.value = true
}

async function submitHandover() {
  await handoverFormRef.value.validate()
  submitLoading.value = true
  try {
    await handoverAnomalyTicketApi(handoverRow.value.id, handoverForm)
    ElMessage.success('转交成功')
    handoverDialogVisible.value = false
    loadData()
  } finally { submitLoading.value = false }
}

const closeDialogVisible = ref(false)
const closeRow = ref(null)
const closeRemark = ref('')

function openCloseDialog(row) {
  closeRow.value = row
  closeRemark.value = ''
  closeDialogVisible.value = true
}

async function submitClose() {
  submitLoading.value = true
  try {
    await closeAnomalyTicketApi(closeRow.value.id, { closeRemark: closeRemark.value })
    ElMessage.success('异常工单已关闭，关联挂牌状态已根据剩余异常情况自动恢复')
    closeDialogVisible.value = false
    loadData()
  } finally { submitLoading.value = false }
}

onMounted(async () => {
  try {
    const rp = await getResponsiblePersonsApi()
    responsiblePersons.value = rp.data
  } catch (e) {}
  if (route.query.status) filters.status = route.query.status
  if (route.query.anomalyType) filters.anomalyType = route.query.anomalyType
  if (route.query.overdue === 'true') filters.overdue = 'true'
  loadData()
})
</script>
