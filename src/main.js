import { supabase } from './supabase.js'
import { generatePDF } from './invoice.js'
import './style.css'

// ===== State =====
let clients = []
let tasks = []
let myInfo = {}

// ===== Utilities =====
function fmtPrice(n) {
  return '¥' + Number(n || 0).toLocaleString()
}

function fmtDate(d) {
  if (!d) return ''
  const dt = new Date(d)
  return `${dt.getFullYear()}/${String(dt.getMonth() + 1).padStart(2, '0')}/${String(dt.getDate()).padStart(2, '0')}`
}

function daysDiff(dateStr) {
  if (!dateStr) return null
  const due = new Date(dateStr)
  const now = new Date()
  now.setHours(0, 0, 0, 0)
  due.setHours(0, 0, 0, 0)
  return Math.floor((due - now) / 86400000)
}

function clientName(id) {
  const c = clients.find(c => c.id === id)
  return c ? c.name : ''
}

// ===== Toast =====
let toastContainer = null
function showToast(msg, type = 'default', duration = 3000) {
  if (!toastContainer) {
    toastContainer = document.createElement('div')
    toastContainer.id = 'toast-container'
    document.body.appendChild(toastContainer)
  }
  const el = document.createElement('div')
  el.className = `toast ${type}`
  el.textContent = msg
  toastContainer.appendChild(el)
  setTimeout(() => {
    el.classList.add('fade-out')
    setTimeout(() => el.remove(), 350)
  }, duration)
}

// ===== Navigation =====
function initNav() {
  const btns = document.querySelectorAll('.nav-btn')
  const sections = document.querySelectorAll('.tab-section')
  const hamburger = document.getElementById('hamburger')
  const menu = document.querySelector('.navbar-menu')

  btns.forEach(btn => {
    btn.addEventListener('click', () => {
      btns.forEach(b => b.classList.remove('active'))
      sections.forEach(s => s.classList.remove('active'))
      btn.classList.add('active')
      document.getElementById(`tab-${btn.dataset.tab}`).classList.add('active')
      menu.classList.remove('open')

      if (btn.dataset.tab === 'invoice') populateInvoiceClients()
    })
  })

  hamburger.addEventListener('click', () => menu.classList.toggle('open'))
}

// ===== Alert Banner =====
function checkAlerts() {
  const banner = document.getElementById('alert-banner')
  const unfinished = tasks.filter(t => t.status !== 'done' && t.due)
  const urgent = unfinished.filter(t => {
    const d = daysDiff(t.due)
    return d !== null && d <= 3
  })

  if (urgent.length === 0) {
    banner.classList.add('hidden')
    return
  }

  const overdue = urgent.filter(t => daysDiff(t.due) < 0)
  banner.classList.remove('hidden')
  banner.classList.toggle('danger', overdue.length > 0)

  const lines = urgent.map(t => {
    const d = daysDiff(t.due)
    const label = d < 0 ? `期限切れ (${Math.abs(d)}日超過)` : d === 0 ? '今日が期限' : `あと${d}日`
    return `・${t.name}（${label}）`
  })

  banner.innerHTML = `
    <strong>${overdue.length > 0 ? '期限切れのタスクがあります' : '期限が近いタスクがあります'}</strong><br>
    ${lines.join('<br>')}
    <button class="close-btn" onclick="this.parentElement.classList.add('hidden')">×</button>
  `
}

// ===== Push Notifications =====
function initPushNotify() {
  const btn = document.getElementById('push-notify-btn')
  const status = document.getElementById('notify-status')

  if (!('Notification' in window)) {
    btn.disabled = true
    status.textContent = '（このブラウザは未対応）'
    return
  }

  const updateStatus = () => {
    if (Notification.permission === 'granted') {
      status.textContent = '（許可済み）'
      btn.textContent = '通知をテスト送信'
    } else if (Notification.permission === 'denied') {
      status.textContent = '（拒否されています。ブラウザ設定から変更してください）'
      btn.disabled = true
    }
  }
  updateStatus()

  btn.addEventListener('click', async () => {
    if (Notification.permission === 'granted') {
      new Notification('FL Manager テスト通知', { body: '通知は正常に動作しています！', icon: '/favicon.ico' })
      return
    }
    const perm = await Notification.requestPermission()
    updateStatus()
    if (perm === 'granted') {
      checkAndSendNotifications()
    }
  })
}

function checkAndSendNotifications() {
  if (Notification.permission !== 'granted') return
  const urgent = tasks.filter(t => {
    if (t.status === 'done' || !t.due) return false
    const d = daysDiff(t.due)
    return d !== null && d <= 3
  })
  if (urgent.length > 0) {
    new Notification(`FL Manager: 期限が近いタスクが${urgent.length}件あります`, {
      body: urgent.map(t => t.name).join('\n'),
      icon: '/favicon.ico'
    })
  }
}

// ===== Fetch Data =====
async function fetchAll() {
  await Promise.all([fetchTasks(), fetchClients(), fetchMyInfo()])
}

async function fetchTasks() {
  const { data, error } = await supabase.from('tasks').select('*').order('created_at', { ascending: false })
  if (error) { console.error('tasks fetch error', error); return }
  tasks = data || []
}

async function fetchClients() {
  const { data, error } = await supabase.from('clients').select('*').order('name')
  if (error) { console.error('clients fetch error', error); return }
  clients = data || []
}

async function fetchMyInfo() {
  const { data, error } = await supabase.from('my_info').select('*').eq('id', 1).maybeSingle()
  if (error) { console.error('my_info fetch error', error); return }
  myInfo = data || {}
}

// ===== Render Kanban =====
function renderKanban() {
  const cols = { todo: [], wip: [], done: [] }
  tasks.forEach(t => { if (cols[t.status]) cols[t.status].push(t) })

  Object.entries(cols).forEach(([status, list]) => {
    const el = document.getElementById(`col-${status}`)
    const count = document.getElementById(`count-${status}`)
    count.textContent = list.length

    if (list.length === 0) {
      el.innerHTML = '<div class="empty-state">タスクなし</div>'
      return
    }

    el.innerHTML = list.map(t => {
      const d = daysDiff(t.due)
      let badge = ''
      if (t.due && status !== 'done') {
        if (d < 0) badge = `<span class="badge badge-danger">期限切れ</span>`
        else if (d <= 3) badge = `<span class="badge badge-warning">あと${d}日</span>`
      }

      return `
        <div class="task-card" data-id="${t.id}">
          <div class="task-card-name">${escHtml(t.name)}</div>
          ${t.client_id ? `<div class="task-card-client">${escHtml(clientName(t.client_id))}</div>` : ''}
          <div class="task-card-meta">
            <span class="task-card-price">${t.price > 0 ? fmtPrice(t.price) : ''}</span>
            <span class="task-card-due">
              ${t.due ? fmtDate(t.due) : ''}
              ${badge}
            </span>
          </div>
        </div>
      `
    }).join('')

    el.querySelectorAll('.task-card').forEach(card => {
      card.addEventListener('click', () => openTaskModal(card.dataset.id))
    })
  })
}

// ===== Task Modal =====
function populateTaskClientSelect(selectedId = '') {
  const sel = document.getElementById('task-client')
  sel.innerHTML = '<option value="">（なし）</option>' +
    clients.map(c => `<option value="${c.id}" ${c.id === selectedId ? 'selected' : ''}>${escHtml(c.name)}</option>`).join('')
}

function openTaskModal(id = null) {
  const modal = document.getElementById('task-modal')
  const title = document.getElementById('task-modal-title')
  const delBtn = document.getElementById('task-modal-delete')

  document.getElementById('task-id').value = ''
  document.getElementById('task-name').value = ''
  document.getElementById('task-detail').value = ''
  document.getElementById('task-price').value = ''
  document.getElementById('task-due').value = ''
  document.getElementById('task-status').value = 'todo'
  populateTaskClientSelect()

  if (id) {
    const t = tasks.find(t => t.id === id)
    if (!t) return
    title.textContent = 'タスク編集'
    document.getElementById('task-id').value = t.id
    document.getElementById('task-name').value = t.name
    document.getElementById('task-detail').value = t.detail || ''
    document.getElementById('task-price').value = t.price || ''
    document.getElementById('task-due').value = t.due || ''
    document.getElementById('task-status').value = t.status
    populateTaskClientSelect(t.client_id)
    delBtn.classList.remove('hidden')
  } else {
    title.textContent = 'タスク追加'
    delBtn.classList.add('hidden')
  }

  modal.classList.remove('hidden')
}

function closeTaskModal() {
  document.getElementById('task-modal').classList.add('hidden')
}

async function saveTask() {
  const id = document.getElementById('task-id').value
  const name = document.getElementById('task-name').value.trim()
  if (!name) { showToast('タスク名を入力してください', 'error'); return }

  const payload = {
    name,
    detail: document.getElementById('task-detail').value.trim(),
    client_id: document.getElementById('task-client').value || null,
    price: parseInt(document.getElementById('task-price').value) || 0,
    due: document.getElementById('task-due').value || null,
    status: document.getElementById('task-status').value,
  }

  let error
  if (id) {
    ;({ error } = await supabase.from('tasks').update(payload).eq('id', id))
  } else {
    ;({ error } = await supabase.from('tasks').insert(payload))
  }

  if (error) { showToast('保存に失敗しました: ' + error.message, 'error'); return }
  showToast('タスクを保存しました', 'success')
  closeTaskModal()
  await fetchTasks()
  renderKanban()
  checkAlerts()
}

async function deleteTask() {
  const id = document.getElementById('task-id').value
  if (!id) return
  if (!confirm('このタスクを削除しますか？')) return
  const { error } = await supabase.from('tasks').delete().eq('id', id)
  if (error) { showToast('削除に失敗しました', 'error'); return }
  showToast('タスクを削除しました')
  closeTaskModal()
  await fetchTasks()
  renderKanban()
  checkAlerts()
}

function initTaskModal() {
  document.getElementById('add-task-btn').addEventListener('click', () => openTaskModal())
  document.getElementById('task-modal-close').addEventListener('click', closeTaskModal)
  document.getElementById('task-modal-cancel').addEventListener('click', closeTaskModal)
  document.getElementById('task-modal-save').addEventListener('click', saveTask)
  document.getElementById('task-modal-delete').addEventListener('click', deleteTask)
  document.querySelector('#task-modal .modal-backdrop').addEventListener('click', closeTaskModal)
}

// ===== Render Clients =====
function renderClients() {
  const el = document.getElementById('client-list')
  if (clients.length === 0) {
    el.innerHTML = '<div class="empty-state">クライアントが登録されていません</div>'
    return
  }

  el.innerHTML = clients.map(c => `
    <div class="client-card" data-id="${c.id}">
      <div class="client-card-name">${escHtml(c.name)}</div>
      ${c.contact ? `<div class="client-card-contact">${escHtml(c.contact)}</div>` : ''}
      <div class="client-card-info">
        ${c.email ? `📧 ${escHtml(c.email)}<br>` : ''}
        ${c.phone ? `📞 ${escHtml(c.phone)}<br>` : ''}
        ${c.address ? `📍 ${escHtml(c.address)}` : ''}
      </div>
    </div>
  `).join('')

  el.querySelectorAll('.client-card').forEach(card => {
    card.addEventListener('click', () => openClientModal(card.dataset.id))
  })
}

// ===== Client Modal =====
function openClientModal(id = null) {
  const modal = document.getElementById('client-modal')
  const title = document.getElementById('client-modal-title')
  const delBtn = document.getElementById('client-modal-delete')

  document.getElementById('client-id').value = ''
  document.getElementById('client-name').value = ''
  document.getElementById('client-contact').value = ''
  document.getElementById('client-address').value = ''
  document.getElementById('client-phone').value = ''
  document.getElementById('client-email').value = ''
  document.getElementById('client-memo').value = ''

  if (id) {
    const c = clients.find(c => c.id === id)
    if (!c) return
    title.textContent = 'クライアント編集'
    document.getElementById('client-id').value = c.id
    document.getElementById('client-name').value = c.name
    document.getElementById('client-contact').value = c.contact || ''
    document.getElementById('client-address').value = c.address || ''
    document.getElementById('client-phone').value = c.phone || ''
    document.getElementById('client-email').value = c.email || ''
    document.getElementById('client-memo').value = c.memo || ''
    delBtn.classList.remove('hidden')
  } else {
    title.textContent = 'クライアント追加'
    delBtn.classList.add('hidden')
  }

  modal.classList.remove('hidden')
}

function closeClientModal() {
  document.getElementById('client-modal').classList.add('hidden')
}

async function saveClient() {
  const id = document.getElementById('client-id').value
  const name = document.getElementById('client-name').value.trim()
  if (!name) { showToast('会社名/氏名を入力してください', 'error'); return }

  const payload = {
    name,
    contact: document.getElementById('client-contact').value.trim(),
    address: document.getElementById('client-address').value.trim(),
    phone: document.getElementById('client-phone').value.trim(),
    email: document.getElementById('client-email').value.trim(),
    memo: document.getElementById('client-memo').value.trim(),
  }

  let error
  if (id) {
    ;({ error } = await supabase.from('clients').update(payload).eq('id', id))
  } else {
    ;({ error } = await supabase.from('clients').insert(payload))
  }

  if (error) { showToast('保存に失敗しました: ' + error.message, 'error'); return }
  showToast('クライアントを保存しました', 'success')
  closeClientModal()
  await fetchClients()
  renderClients()
  populateInvoiceClients()
}

async function deleteClient() {
  const id = document.getElementById('client-id').value
  if (!id) return
  if (!confirm('このクライアントを削除しますか？関連タスクのクライアント情報も削除されます。')) return
  const { error } = await supabase.from('clients').delete().eq('id', id)
  if (error) { showToast('削除に失敗しました', 'error'); return }
  showToast('クライアントを削除しました')
  closeClientModal()
  await fetchAll()
  renderKanban()
  renderClients()
}

function initClientModal() {
  document.getElementById('add-client-btn').addEventListener('click', () => openClientModal())
  document.getElementById('client-modal-close').addEventListener('click', closeClientModal)
  document.getElementById('client-modal-cancel').addEventListener('click', closeClientModal)
  document.getElementById('client-modal-save').addEventListener('click', saveClient)
  document.getElementById('client-modal-delete').addEventListener('click', deleteClient)
  document.querySelector('#client-modal .modal-backdrop').addEventListener('click', closeClientModal)
}

// ===== My Info =====
function renderMyInfo() {
  document.getElementById('my-name').value = myInfo.name || ''
  document.getElementById('my-address').value = myInfo.address || ''
  document.getElementById('my-phone').value = myInfo.phone || ''
  document.getElementById('my-email').value = myInfo.email || ''
  document.getElementById('my-bank').value = myInfo.bank || ''
}

async function saveMyInfo() {
  const payload = {
    id: 1,
    name: document.getElementById('my-name').value.trim(),
    address: document.getElementById('my-address').value.trim(),
    phone: document.getElementById('my-phone').value.trim(),
    email: document.getElementById('my-email').value.trim(),
    bank: document.getElementById('my-bank').value.trim(),
  }

  const { error } = await supabase.from('my_info').upsert(payload, { onConflict: 'id' })
  if (error) { showToast('保存に失敗しました: ' + error.message, 'error'); return }
  myInfo = payload
  showToast('自分の情報を保存しました', 'success')
}

function initMyInfo() {
  document.getElementById('save-myinfo-btn').addEventListener('click', saveMyInfo)
}

// ===== Invoice =====
function populateInvoiceClients() {
  const sel = document.getElementById('invoice-client')
  sel.innerHTML = '<option value="">クライアントを選択</option>' +
    clients.map(c => `<option value="${c.id}">${escHtml(c.name)}</option>`).join('')
}

function initInvoice() {
  // デフォルト月を今月に
  const now = new Date()
  document.getElementById('invoice-month').value =
    `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`

  // デフォルト支払期限を翌月末に
  const nextMonth = new Date(now.getFullYear(), now.getMonth() + 2, 0)
  document.getElementById('invoice-due').value =
    `${nextMonth.getFullYear()}-${String(nextMonth.getMonth() + 1).padStart(2, '0')}-${String(nextMonth.getDate()).padStart(2, '0')}`

  document.getElementById('preview-invoice-btn').addEventListener('click', previewInvoice)
  document.getElementById('download-pdf-btn').addEventListener('click', downloadPDF)
}

function getInvoiceData() {
  const clientId = document.getElementById('invoice-client').value
  const month = document.getElementById('invoice-month').value
  const invoiceNo = document.getElementById('invoice-number').value.trim()
  const dueDate = document.getElementById('invoice-due').value

  if (!clientId) { showToast('クライアントを選択してください', 'error'); return null }
  if (!month) { showToast('対象月を選択してください', 'error'); return null }

  const client = clients.find(c => c.id === clientId)
  const [year, mon] = month.split('-')
  const monthStart = `${year}-${mon}-01`
  const lastDay = new Date(parseInt(year), parseInt(mon), 0).getDate()
  const monthEnd = `${year}-${mon}-${String(lastDay).padStart(2, '0')}`

  const doneTasks = tasks.filter(t =>
    t.client_id === clientId &&
    t.status === 'done' &&
    t.due &&
    t.due >= monthStart &&
    t.due <= monthEnd
  )

  const total = doneTasks.reduce((sum, t) => sum + (t.price || 0), 0)

  return { client, month, invoiceNo, dueDate, doneTasks, total, year, mon }
}

function previewInvoice() {
  const data = getInvoiceData()
  if (!data) return

  const { client, month, invoiceNo, dueDate, doneTasks, total, year, mon } = data
  const preview = document.getElementById('invoice-preview')
  const content = document.getElementById('invoice-content')

  if (doneTasks.length === 0) {
    showToast(`${year}年${mon}月の完了タスクが見つかりません`, 'error')
    return
  }

  const rows = doneTasks.map(t => `
    <tr>
      <td>${escHtml(t.name)}</td>
      <td>${fmtDate(t.due)}</td>
      <td style="text-align:right">${fmtPrice(t.price)}</td>
    </tr>
  `).join('')

  content.innerHTML = `
    <div class="invoice-header">
      <div class="invoice-title-block">
        <h1>INVOICE</h1>
        <div style="font-size:13px;color:var(--gray-500);margin-top:4px">${year}年${mon}月分 請求書</div>
      </div>
      <div class="invoice-meta">
        ${invoiceNo ? `<div>請求番号: <strong>${escHtml(invoiceNo)}</strong></div>` : ''}
        <div>発行日: ${fmtDate(new Date().toISOString().slice(0,10))}</div>
        ${dueDate ? `<div>支払期限: <strong>${fmtDate(dueDate)}</strong></div>` : ''}
      </div>
    </div>

    <div class="invoice-parties">
      <div class="invoice-party">
        <h4>請求先</h4>
        <p>
          <strong>${escHtml(client.name)}</strong><br>
          ${client.contact ? `${escHtml(client.contact)} 様<br>` : ''}
          ${client.address ? `${escHtml(client.address)}<br>` : ''}
          ${client.email ? `${escHtml(client.email)}` : ''}
        </p>
      </div>
      <div class="invoice-party">
        <h4>請求元</h4>
        <p>
          <strong>${escHtml(myInfo.name || '（未設定）')}</strong><br>
          ${myInfo.address ? `${escHtml(myInfo.address)}<br>` : ''}
          ${myInfo.phone ? `${escHtml(myInfo.phone)}<br>` : ''}
          ${myInfo.email ? `${escHtml(myInfo.email)}` : ''}
        </p>
      </div>
    </div>

    <table class="invoice-table">
      <thead>
        <tr>
          <th>Task / Description</th>
          <th>Date</th>
          <th style="text-align:right">Amount (Tax Incl.)</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>

    <div class="invoice-total">
      合計: ${fmtPrice(total)}
    </div>

    ${myInfo.bank ? `
    <div class="invoice-bank">
      <strong>振込先</strong><br>
      ${escHtml(myInfo.bank).replace(/\n/g, '<br>')}
    </div>
    ` : ''}
  `

  preview.classList.remove('hidden')
}

async function downloadPDF() {
  const data = getInvoiceData()
  if (!data) return
  await generatePDF(data, myInfo)
}

// ===== Backup / Restore =====
function initBackup() {
  document.getElementById('backup-btn').addEventListener('click', doBackup)
  document.getElementById('restore-btn').addEventListener('click', doRestore)
}

async function doBackup() {
  const payload = {
    version: 1,
    exported_at: new Date().toISOString(),
    tasks,
    clients,
    my_info: myInfo,
  }
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  const now = new Date()
  const d = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2,'0')}${String(now.getDate()).padStart(2,'0')}`
  a.href = url
  a.download = `fl_backup_${d}.json`
  a.click()
  URL.revokeObjectURL(url)
  showToast('バックアップをダウンロードしました', 'success')
}

async function doRestore() {
  const file = document.getElementById('restore-file').files[0]
  if (!file) { showToast('ファイルを選択してください', 'error'); return }
  if (!confirm('既存データを上書きしてリストアしますか？この操作は取り消せません。')) return

  try {
    const text = await file.text()
    const data = JSON.parse(text)

    const errors = []

    if (data.tasks?.length) {
      const { error } = await supabase.from('tasks').upsert(data.tasks, { onConflict: 'id' })
      if (error) errors.push('tasks: ' + error.message)
    }

    if (data.clients?.length) {
      const { error } = await supabase.from('clients').upsert(data.clients, { onConflict: 'id' })
      if (error) errors.push('clients: ' + error.message)
    }

    if (data.my_info?.id) {
      const { error } = await supabase.from('my_info').upsert(data.my_info, { onConflict: 'id' })
      if (error) errors.push('my_info: ' + error.message)
    }

    if (errors.length > 0) {
      showToast('一部エラー: ' + errors.join(' / '), 'error')
    } else {
      showToast('リストアが完了しました', 'success')
    }

    await fetchAll()
    renderKanban()
    renderClients()
    renderMyInfo()
    checkAlerts()
  } catch (e) {
    showToast('JSONの読み込みに失敗しました: ' + e.message, 'error')
  }
}

// ===== HTML Escape =====
function escHtml(str) {
  if (!str) return ''
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

// ===== Init =====
async function init() {
  initNav()
  initTaskModal()
  initClientModal()
  initMyInfo()
  initInvoice()
  initBackup()
  initPushNotify()

  await fetchAll()

  renderKanban()
  renderClients()
  renderMyInfo()
  checkAlerts()
  checkAndSendNotifications()
}

document.addEventListener('DOMContentLoaded', init)
