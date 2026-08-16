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

function getCurrentMonthValue() {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
}

function getMonthBounds(monthValue) {
  const [year, month] = monthValue.split('-').map(Number)
  const start = `${year}-${String(month).padStart(2, '0')}-01`
  const lastDay = new Date(year, month, 0).getDate()
  const end = `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`
  return { start, end }
}

function formatMonthLabel(monthValue) {
  const [year, month] = monthValue.split('-')
  return `${year}年${Number(month)}月`
}

function isDateInPeriod(orderDate, periodMode, selectedMonth, rangeStart, rangeEnd) {
  if (periodMode === 'all') return true
  if (periodMode === 'month') {
    const { start, end } = getMonthBounds(selectedMonth)
    return orderDate >= start && orderDate <= end
  }
  if (rangeStart && rangeEnd) {
    return orderDate >= rangeStart && orderDate <= rangeEnd
  }
  return true
}

function getDeliveryStatus(order) {
  if (isOrderSettled(order)) {
    return { label: '已结清', tone: 'settled' }
  }
  if (Number(order.balance) > 0 && Number(order.deposit) === 0) {
    return { label: '已欠款', tone: 'debt' }
  }
  const orderTime = new Date(order.orderDate).getTime()
  const daysPassed = Math.floor((Date.now() - orderTime) / (1000 * 60 * 60 * 24))
  if (daysPassed <= 3) {
    return { label: '制作中', tone: 'making' }
  }
  return { label: '待安装', tone: 'install' }
}

function buildMonthOptions(orders) {
  const monthSet = new Set([getCurrentMonthValue()])
  orders.forEach((order) => {
    if (order.orderDate) {
      monthSet.add(order.orderDate.slice(0, 7))
    }
  })
  return Array.from(monthSet).sort((a, b) => b.localeCompare(a))
}

function BrandIcon() {
  return (
    <svg className="brand-svg" viewBox="0 0 48 48" fill="none" aria-hidden="true">
      <rect width="48" height="48" rx="14" fill="url(#brandGradient)" />
      <path
        d="M14 32V16h8.5c3.6 0 6 2.2 6 5.4 0 2.2-1.2 3.8-3.1 4.6l4.1 6H23l-3.6-5.6H18.2V32H14zm4.2-9.2h4c1.5 0 2.4-.8 2.4-2s-.9-2-2.4-2h-4v4z"
        fill="#fff"
      />
      <path d="M30 16h4v16h-4V16z" fill="#fff" fillOpacity="0.92" />
      <defs>
        <linearGradient id="brandGradient" x1="8" y1="8" x2="40" y2="40">
          <stop stopColor="#1e4fbf" />
          <stop offset="1" stopColor="#0f2d6e" />
        </linearGradient>
      </defs>
    </svg>
  )
}

function App() {
  const [orders, setOrders] = useState([])
  const [form, setForm] = useState(EMPTY_FORM)
  const [searchQuery, setSearchQuery] = useState('')
  const [activeFilter, setActiveFilter] = useState('all')
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [actionId, setActionId] = useState(null)
  const [periodMode, setPeriodMode] = useState('month')
  const [selectedMonth, setSelectedMonth] = useState(getCurrentMonthValue())
  const [rangeStart, setRangeStart] = useState('')
  const [rangeEnd, setRangeEnd] = useState('')
  const [formOpen, setFormOpen] = useState(false)

  const formBalance = useMemo(
    () => getBalance(form.totalAmount, form.deposit),
    [form.totalAmount, form.deposit],
  )

  const monthOptions = useMemo(() => buildMonthOptions(orders), [orders])

  const periodOrders = useMemo(
    () =>
      orders.filter((order) =>
        isDateInPeriod(order.orderDate, periodMode, selectedMonth, rangeStart, rangeEnd),
      ),
    [orders, periodMode, selectedMonth, rangeStart, rangeEnd],
  )

  const stats = useMemo(() => {
    const monthRevenue = periodOrders.reduce(
      (sum, order) => sum + Number(order.totalAmount),
      0,
    )

    const receivedAmount = periodOrders.reduce(
      (sum, order) => sum + Number(order.deposit),
      0,
    )

    const pendingBalance = periodOrders.reduce(
      (sum, order) => sum + Number(order.balance),
      0,
    )

    const netProfit = periodOrders
      .filter((order) => isOrderSettled(order))
      .reduce((sum, order) => sum + Number(order.totalAmount), 0)

    return {
      monthRevenue,
      receivedAmount,
      pendingBalance,
      netProfit,
      orderCount: periodOrders.length,
    }
  }, [periodOrders])

  const filteredOrders = useMemo(() => {
    const keyword = searchQuery.trim().toLowerCase()

    return periodOrders.filter((order) => {
      const settled = isOrderSettled(order)
      const matchesFilter =
        activeFilter === 'all' ||
        (activeFilter === 'pending' && !settled) ||
        (activeFilter === 'settled' && settled)
      const matchesSearch =
        keyword === '' || order.customerName.toLowerCase().includes(keyword)

      return matchesFilter && matchesSearch
    })
  }, [periodOrders, searchQuery, activeFilter])

  const periodLabel = useMemo(() => {
    if (periodMode === 'all') return '全部历史'
    if (periodMode === 'range') {
      if (rangeStart && rangeEnd) return `${rangeStart} 至 ${rangeEnd}`
      return '自定义日期范围'
    }
    return formatMonthLabel(selectedMonth)
  }, [periodMode, selectedMonth, rangeStart, rangeEnd])

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
    setFormOpen(false)
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
    setOrders((prev) => prev.map((order) => (order.id === id ? updatedOrder : order)))
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

  const shiftMonth = (offset) => {
    const [year, month] = selectedMonth.split('-').map(Number)
    const date = new Date(year, month - 1 + offset, 1)
    const nextValue = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
    setSelectedMonth(nextValue)
    setPeriodMode('month')
  }

  const renderOrderActions = (order, settled, isBusy) => (
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
  )

  const renderOrderForm = () => (
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
        <button type="button" className="btn btn-ghost mobile-only" onClick={() => setFormOpen(false)}>
          取消
        </button>
        <button type="submit" className="btn btn-primary" disabled={submitting}>
          {submitting ? '保存中...' : '保存记账'}
        </button>
      </div>
    </form>
  )

  return (
    <div className="accounting-app">
      <div className="app-bg" aria-hidden="true" />

      <header className="app-header glass-panel">
        <div className="brand">
          <BrandIcon />
          <div className="brand-copy">
            <p className="brand-tag">蓓蓓图文广告 · 云端财务</p>
            <h1>临汾市尧都区蓓蓓图文广告有限公司记账管理系统</h1>
            <p className="brand-subtitle">专业广告制作 · 订单追踪 · 定金尾款 · 历史账目一目了然</p>
          </div>
        </div>
      </header>

      <section className="period-bar glass-panel">
        <div className="period-bar__intro">
          <h2>账目周期</h2>
          <p>当前查看：{periodLabel}</p>
        </div>

        <div className="period-controls">
          <div className="period-mode-tabs">
            <button
              type="button"
              className={`period-mode-tab ${periodMode === 'month' ? 'period-mode-tab--active' : ''}`}
              onClick={() => setPeriodMode('month')}
            >
              按月份
            </button>
            <button
              type="button"
              className={`period-mode-tab ${periodMode === 'range' ? 'period-mode-tab--active' : ''}`}
              onClick={() => setPeriodMode('range')}
            >
              日期范围
            </button>
            <button
              type="button"
              className={`period-mode-tab ${periodMode === 'all' ? 'period-mode-tab--active' : ''}`}
              onClick={() => setPeriodMode('all')}
            >
              全部历史
            </button>
          </div>

          {periodMode === 'month' && (
            <div className="month-picker">
              <button type="button" className="btn btn-icon" onClick={() => shiftMonth(-1)} aria-label="上一月">
                ‹
              </button>
              <select
                className="month-select"
                value={selectedMonth}
                onChange={(event) => setSelectedMonth(event.target.value)}
              >
                {monthOptions.map((month) => (
                  <option key={month} value={month}>
                    {formatMonthLabel(month)}
                  </option>
                ))}
              </select>
              <button type="button" className="btn btn-icon" onClick={() => shiftMonth(1)} aria-label="下一月">
                ›
              </button>
            </div>
          )}

          {periodMode === 'range' && (
            <div className="range-picker">
              <input
                type="date"
                className="range-input"
                value={rangeStart}
                onChange={(event) => setRangeStart(event.target.value)}
              />
              <span className="range-separator">至</span>
              <input
                type="date"
                className="range-input"
                value={rangeEnd}
                onChange={(event) => setRangeEnd(event.target.value)}
              />
            </div>
          )}
        </div>
      </section>

      <section className="dashboard">
        <article className="stat-card glass-card">
          <span className="stat-icon stat-icon--blue">¥</span>
          <span className="stat-label">总营业额</span>
          <strong className="stat-value">{formatMoney(stats.monthRevenue)}</strong>
          <span className="stat-hint">{periodLabel} 订单金额合计</span>
        </article>
        <article className="stat-card glass-card">
          <span className="stat-icon stat-icon--green">收</span>
          <span className="stat-label">已收定金 / 货款</span>
          <strong className="stat-value stat-value--success">
            {formatMoney(stats.receivedAmount)}
          </strong>
          <span className="stat-hint">当期已到账金额</span>
        </article>
        <article className="stat-card glass-card stat-card--danger">
          <span className="stat-icon stat-icon--orange">!</span>
          <span className="stat-label">待收尾款总额</span>
          <strong className="stat-value stat-value--danger">
            {formatMoney(stats.pendingBalance)}
          </strong>
          <span className="stat-hint">未结清尾款，请重点跟进</span>
        </article>
        <article className="stat-card glass-card">
          <span className="stat-icon stat-icon--purple">净</span>
          <span className="stat-label">净利润（已结清）</span>
          <strong className="stat-value stat-value--purple">
            {formatMoney(stats.netProfit)}
          </strong>
          <span className="stat-hint">当期已结清订单总额</span>
        </article>
        <article className="stat-card glass-card stat-card--wide">
          <span className="stat-icon stat-icon--slate">单</span>
          <span className="stat-label">订单总数</span>
          <strong className="stat-value">{stats.orderCount}</strong>
          <span className="stat-hint">当前筛选周期内的记账笔数</span>
        </article>
      </section>

      <div className="main-grid">
        <section className="panel glass-panel form-panel desktop-only">
          <div className="panel-header">
            <h2>新建记账</h2>
            <p>录入客户订单，保存后自动同步至 Supabase 云端</p>
          </div>
          {renderOrderForm()}
        </section>

        <section className="panel glass-panel table-panel">
          <div className="panel-header panel-header--table">
            <div>
              <h2>订单管理</h2>
              <p>
                {periodLabel} · 共 {filteredOrders.length} 条记录
              </p>
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
                    className={`filter-tab ${activeFilter === tab.key ? 'filter-tab--active' : ''}`}
                    onClick={() => setActiveFilter(tab.key)}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="table-wrapper desktop-table">
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
                  <th>交货状态</th>
                  <th>结款状态</th>
                  <th>备注</th>
                  <th>操作</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={12} className="empty-cell">
                      正在从云端加载订单...
                    </td>
                  </tr>
                ) : filteredOrders.length === 0 ? (
                  <tr>
                    <td colSpan={12} className="empty-cell">
                      当前周期暂无订单，请切换月份或新建记账
                    </td>
                  </tr>
                ) : (
                  filteredOrders.map((order) => {
                    const settled = isOrderSettled(order)
                    const delivery = getDeliveryStatus(order)
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
                            order.balance > 0 ? 'cell-balance-pending' : 'cell-balance-done'
                          }
                        >
                          {formatMoney(order.balance)}
                        </td>
                        <td>
                          <span className={`delivery-badge delivery-badge--${delivery.tone}`}>
                            {delivery.label}
                          </span>
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
                        <td className="cell-notes" title={order.remark}>
                          {order.remark || '—'}
                        </td>
                        <td>{renderOrderActions(order, settled, isBusy)}</td>
                      </tr>
                    )
                  })
                )}
              </tbody>
            </table>
          </div>

          <div className="mobile-cards">
            {loading ? (
              <div className="empty-cell">正在从云端加载订单...</div>
            ) : filteredOrders.length === 0 ? (
              <div className="empty-cell">当前周期暂无订单，请切换月份或新建记账</div>
            ) : (
              filteredOrders.map((order) => {
                const settled = isOrderSettled(order)
                const delivery = getDeliveryStatus(order)
                const isBusy = actionId === order.id

                return (
                  <article key={order.id} className="order-card">
                    <div className="order-card__head">
                      <div>
                        <h3>{order.customerName}</h3>
                        <p>{order.orderDate}</p>
                      </div>
                      <div className="order-card__badges">
                        <span className={`delivery-badge delivery-badge--${delivery.tone}`}>
                          {delivery.label}
                        </span>
                        <span
                          className={`status-badge ${
                            settled ? 'status-badge--settled' : 'status-badge--pending'
                          }`}
                        >
                          {order.status}
                        </span>
                      </div>
                    </div>
                    <div className="order-card__grid">
                      <div>
                        <span>品项</span>
                        <strong>{order.itemType}</strong>
                      </div>
                      <div>
                        <span>规格</span>
                        <strong>{order.spec || '—'}</strong>
                      </div>
                      <div>
                        <span>总额</span>
                        <strong>{formatMoney(order.totalAmount)}</strong>
                      </div>
                      <div>
                        <span>已付</span>
                        <strong>{formatMoney(order.deposit)}</strong>
                      </div>
                      <div className="order-card__balance">
                        <span>尾款</span>
                        <strong className={order.balance > 0 ? 'text-debt' : 'text-settled'}>
                          {formatMoney(order.balance)}
                        </strong>
                      </div>
                      <div>
                        <span>电话</span>
                        <strong>{order.phone || '—'}</strong>
                      </div>
                    </div>
                    {order.remark && <p className="order-card__remark">{order.remark}</p>}
                    {renderOrderActions(order, settled, isBusy)}
                  </article>
                )
              })
            )}
          </div>
        </section>
      </div>

      <button
        type="button"
        className="fab mobile-only"
        onClick={() => setFormOpen(true)}
        aria-label="新建记账"
      >
        +
      </button>

      {formOpen && (
        <div className="modal-overlay" onClick={() => setFormOpen(false)}>
          <div className="modal glass-panel" onClick={(event) => event.stopPropagation()}>
            <div className="panel-header">
              <h2>新建记账</h2>
              <p>快速录入客户订单信息</p>
            </div>
            {renderOrderForm()}
          </div>
        </div>
      )}
    </div>
  )
}

export default App
