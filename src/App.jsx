import { useEffect, useMemo, useState } from 'react'
import { supabase } from './supabaseClient'
import './App.css'

const MATERIAL_OPTIONS = [
  'KT板',
  '喷绘布',
  '写真展板',
  '门头发光字',
  '铜牌/亚克力',
  '发票/印品',
  '其他',
]

const FILTER_TABS = [
  { key: 'all', label: '全部' },
  { key: 'pending', label: '待结清' },
  { key: 'settled', label: '已结清' },
]

const EMPTY_FORM = {
  customerName: '',
  phone: '',
  orderDate: new Date().toISOString().slice(0, 10),
  itemType: MATERIAL_OPTIONS[0],
  spec: '',
  totalAmount: '',
  deposit: '',
  remark: '',
}

function formatMoney(value) {
  return `¥${Number(value).toLocaleString('zh-CN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`
}

function getBalance(totalAmount, deposit) {
  const total = Number(totalAmount) || 0
  const paidDeposit = Number(deposit) || 0
  return Math.max(total - paidDeposit, 0)
}

function isOrderSettled(order) {
  if (order.status === '已结清') return true
  return Number(order.balance) <= 0
}

function isCurrentMonth(dateString) {
  const date = new Date(dateString)
  const now = new Date()
  return (
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth()
  )
}

function mapOrderFromDb(row) {
  return {
    id: row.id,
    customerName: row.customer_name,
    phone: row.phone ?? '',
    orderDate: row.order_date,
    itemType: row.item_type,
    spec: row.spec ?? '',
    totalAmount: Number(row.total_amount),
    deposit: Number(row.deposit),
    balance: Number(row.balance),
    status: row.status,
    remark: row.remark ?? '',
    createdAt: row.created_at,
  }
}

function App() {
  const [orders, setOrders] = useState([])
  const [form, setForm] = useState(EMPTY_FORM)
  const [searchQuery, setSearchQuery] = useState('')
  const [activeFilter, setActiveFilter] = useState('all')
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [actionId, setActionId] = useState(null)

  const formBalance = useMemo(
    () => getBalance(form.totalAmount, form.deposit),
    [form.totalAmount, form.deposit],
  )

  const fetchOrders = async () => {
    const { data, error } = await supabase
      .from('orders')
      .select('*')
      .order('order_date', { ascending: false })
      .order('created_at', { ascending: false })

    if (error) {
      window.alert(`加载订单失败：${error.message}`)
      return
    }

    setOrders((data ?? []).map(mapOrderFromDb))
  }

  useEffect(() => {
    const loadOrders = async () => {
      setLoading(true)
      await fetchOrders()
      setLoading(false)
    }

    loadOrders()
  }, [])

  const stats = useMemo(() => {
    const monthOrders = orders.filter((order) => isCurrentMonth(order.orderDate))

    const monthRevenue = monthOrders.reduce(
      (sum, order) => sum + Number(order.totalAmount),
      0,
    )

    const receivedAmount = orders.reduce(
      (sum, order) => sum + Number(order.deposit),
      0,
    )

    const pendingBalance = orders.reduce(
      (sum, order) => sum + Number(order.balance),
      0,
    )

    return { monthRevenue, receivedAmount, pendingBalance }
  }, [orders])

  const filteredOrders = useMemo(() => {
    const keyword = searchQuery.trim().toLowerCase()

    return orders.filter((order) => {
      const settled = isOrderSettled(order)
      const matchesFilter =
        activeFilter === 'all' ||
        (activeFilter === 'pending' && !settled) ||
        (activeFilter === 'settled' && settled)
      const matchesSearch =
        keyword === '' ||
        order.customerName.toLowerCase().includes(keyword)

      return matchesFilter && matchesSearch
    })
  }, [orders, searchQuery, activeFilter])

  const handleFormChange = (event) => {
    const { name, value } = event.target
    setForm((prev) => ({ ...prev, [name]: value }))
  }

  const handleSubmit = async (event) => {
    event.preventDefault()

    if (!form.customerName.trim()) {
      window.alert('请填写客户姓名')
      return
    }

    const totalAmount = Number(form.totalAmount)
    const deposit = Number(form.deposit) || 0

    if (!totalAmount || totalAmount <= 0) {
      window.alert('请填写有效的订单总金额')
      return
    }

    if (deposit > totalAmount) {
      window.alert('已付定金不能大于订单总金额')
      return
    }

    const balance = getBalance(totalAmount, deposit)
    const status = balance > 0 ? '待结清' : '已结清'

    setSubmitting(true)

    const { data, error } = await supabase
      .from('orders')
      .insert({
        customer_name: form.customerName.trim(),
        phone: form.phone.trim(),
        order_date: form.orderDate,
        item_type: form.itemType,
        spec: form.spec.trim(),
        total_amount: totalAmount,
        deposit,
        balance,
        status,
        remark: form.remark.trim(),
      })
      .select()
      .single()

    setSubmitting(false)

    if (error) {
      window.alert(`保存失败：${error.message}`)
      return
    }

    setOrders((prev) => [mapOrderFromDb(data), ...prev])
    setForm({
      ...EMPTY_FORM,
      orderDate: new Date().toISOString().slice(0, 10),
    })
  }

  const handleSettle = async (id) => {
    const target = orders.find((order) => order.id === id)
    if (!target) return

    setActionId(id)

    const { data, error } = await supabase
      .from('orders')
      .update({
        status: '已结清',
        balance: 0,
        deposit: target.totalAmount,
      })
      .eq('id', id)
      .select()
      .single()

    setActionId(null)

    if (error) {
      window.alert(`结清失败：${error.message}`)
      return
    }

    const updatedOrder = mapOrderFromDb(data)
    setOrders((prev) =>
      prev.map((order) => (order.id === id ? updatedOrder : order)),
    )
  }

  const handleDelete = async (id) => {
    const target = orders.find((order) => order.id === id)
    if (!target) return

    const confirmed = window.confirm(
      `确定删除客户「${target.customerName}」的订单吗？此操作不可恢复。`,
    )
    if (!confirmed) return

    setActionId(id)

    const { error } = await supabase.from('orders').delete().eq('id', id)

    setActionId(null)

    if (error) {
      window.alert(`删除失败：${error.message}`)
      return
    }

    setOrders((prev) => prev.filter((order) => order.id !== id))
  }

  return (
    <div className="accounting-app">
      <header className="app-header">
        <div className="brand">
          <div className="brand-icon">账</div>
          <div>
            <h1>广告公司记账管理系统</h1>
            <p>客户订单 · 定金尾款 · 云端同步</p>
          </div>
        </div>
      </header>

      <section className="dashboard">
        <article className="stat-card">
          <span className="stat-label">本月总营业额</span>
          <strong className="stat-value">{formatMoney(stats.monthRevenue)}</strong>
          <span className="stat-hint">统计本月订单金额合计</span>
        </article>
        <article className="stat-card">
          <span className="stat-label">已收定金 / 货款</span>
          <strong className="stat-value stat-value--success">
            {formatMoney(stats.receivedAmount)}
          </strong>
          <span className="stat-hint">累计已到账金额</span>
        </article>
        <article className="stat-card stat-card--danger">
          <span className="stat-label">待收尾款总额</span>
          <strong className="stat-value stat-value--danger">
            {formatMoney(stats.pendingBalance)}
          </strong>
          <span className="stat-hint">请及时跟进未结清客户</span>
        </article>
      </section>

      <div className="main-grid">
        <section className="panel form-panel">
          <div className="panel-header">
            <h2>新建记账</h2>
            <p>录入客户订单，保存后自动同步至 Supabase 云端</p>
          </div>

          <form className="order-form" onSubmit={handleSubmit}>
            <div className="form-row">
              <label className="form-field">
                <span>客户姓名 *</span>
                <input
                  type="text"
                  name="customerName"
                  value={form.customerName}
                  onChange={handleFormChange}
                  placeholder="请输入客户姓名"
                  disabled={submitting}
                />
              </label>
              <label className="form-field">
                <span>联系电话</span>
                <input
                  type="tel"
                  name="phone"
                  value={form.phone}
                  onChange={handleFormChange}
                  placeholder="手机号或座机"
                  disabled={submitting}
                />
              </label>
              <label className="form-field">
                <span>订单日期</span>
                <input
                  type="date"
                  name="orderDate"
                  value={form.orderDate}
                  onChange={handleFormChange}
                  disabled={submitting}
                />
              </label>
            </div>

            <div className="form-row">
              <label className="form-field">
                <span>品项材质</span>
                <select
                  name="itemType"
                  value={form.itemType}
                  onChange={handleFormChange}
                  disabled={submitting}
                >
                  {MATERIAL_OPTIONS.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              </label>
              <label className="form-field form-field--wide">
                <span>规格 / 数量</span>
                <input
                  type="text"
                  name="spec"
                  value={form.spec}
                  onChange={handleFormChange}
                  placeholder="例如：3m×2m × 2块"
                  disabled={submitting}
                />
              </label>
            </div>

            <div className="form-row">
              <label className="form-field">
                <span>订单总金额（元）*</span>
                <input
                  type="number"
                  name="totalAmount"
                  value={form.totalAmount}
                  onChange={handleFormChange}
                  min="0"
                  step="0.01"
                  placeholder="0.00"
                  disabled={submitting}
                />
              </label>
              <label className="form-field">
                <span>已付定金（元）</span>
                <input
                  type="number"
                  name="deposit"
                  value={form.deposit}
                  onChange={handleFormChange}
                  min="0"
                  step="0.01"
                  placeholder="0.00"
                  disabled={submitting}
                />
              </label>
              <div className="form-field balance-field">
                <span>剩余尾款（自动计算）</span>
                <div
                  className={`balance-display ${
                    formBalance > 0 ? 'balance-display--pending' : 'balance-display--done'
                  }`}
                >
                  {formatMoney(formBalance)}
                </div>
              </div>
            </div>

            <label className="form-field form-field--full">
              <span>订单备注</span>
              <textarea
                name="remark"
                value={form.remark}
                onChange={handleFormChange}
                rows={3}
                placeholder="安装地址、交付时间、特殊要求等"
                disabled={submitting}
              />
            </label>

            <div className="form-actions">
              <button type="submit" className="btn btn-primary" disabled={submitting}>
                {submitting ? '保存中...' : '保存记账'}
              </button>
            </div>
          </form>
        </section>

        <section className="panel table-panel">
          <div className="panel-header panel-header--table">
            <div>
              <h2>订单管理</h2>
              <p>共 {filteredOrders.length} 条记录</p>
            </div>

            <div className="table-tools">
              <input
                type="search"
                className="search-input"
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                placeholder="按客户姓名搜索..."
              />
              <div className="filter-tabs">
                {FILTER_TABS.map((tab) => (
                  <button
                    key={tab.key}
                    type="button"
                    className={`filter-tab ${
                      activeFilter === tab.key ? 'filter-tab--active' : ''
                    }`}
                    onClick={() => setActiveFilter(tab.key)}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="table-wrapper">
            <table className="orders-table">
              <thead>
                <tr>
                  <th>订单日期</th>
                  <th>客户姓名</th>
                  <th>联系电话</th>
                  <th>品项材质</th>
                  <th>规格/数量</th>
                  <th>订单总额</th>
                  <th>已付定金</th>
                  <th>剩余尾款</th>
                  <th>状态</th>
                  <th>备注</th>
                  <th>操作</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={11} className="empty-cell">
                      正在从云端加载订单...
                    </td>
                  </tr>
                ) : filteredOrders.length === 0 ? (
                  <tr>
                    <td colSpan={11} className="empty-cell">
                      暂无符合条件的订单，请先新建记账
                    </td>
                  </tr>
                ) : (
                  filteredOrders.map((order) => {
                    const settled = isOrderSettled(order)
                    const isBusy = actionId === order.id

                    return (
                      <tr key={order.id}>
                        <td>{order.orderDate}</td>
                        <td className="cell-strong">{order.customerName}</td>
                        <td>{order.phone || '—'}</td>
                        <td>{order.itemType}</td>
                        <td>{order.spec || '—'}</td>
                        <td>{formatMoney(order.totalAmount)}</td>
                        <td>{formatMoney(order.deposit)}</td>
                        <td
                          className={
                            order.balance > 0
                              ? 'cell-balance-pending'
                              : 'cell-balance-done'
                          }
                        >
                          {formatMoney(order.balance)}
                        </td>
                        <td>
                          <span
                            className={`status-badge ${
                              settled ? 'status-badge--settled' : 'status-badge--pending'
                            }`}
                          >
                            {order.status}
                          </span>
                        </td>
                        <td className="cell-notes">{order.remark || '—'}</td>
                        <td>
                          <div className="row-actions">
                            {!settled && (
                              <button
                                type="button"
                                className="btn btn-small btn-settle"
                                onClick={() => handleSettle(order.id)}
                                disabled={isBusy}
                              >
                                {isBusy ? '处理中...' : '结清尾款'}
                              </button>
                            )}
                            <button
                              type="button"
                              className="btn btn-small btn-delete"
                              onClick={() => handleDelete(order.id)}
                              disabled={isBusy}
                            >
                              删除
                            </button>
                          </div>
                        </td>
                      </tr>
                    )
                  })
                )}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </div>
  )
}

export default App
