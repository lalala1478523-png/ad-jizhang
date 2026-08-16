import React, { useState, useEffect } from 'react';
import { supabase } from './supabaseClient';

const AD_MATERIALS = [
  '写真喷绘', '户外车贴', 'KT板展架', '亚克力门牌', 
  'UV发光字', '不锈钢精工字', 'PVC雕刻', '钛金字', 
  '铜牌腐蚀', '条幅横幅', '名片画册', '其他定制'
];

export default function App() {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  
  // 筛选与统计周期模式：'month' (按月) | 'year' (按年/年初到年末) | 'all' (全部历史)
  const [periodMode, setPeriodMode] = useState('year'); 
  const [selectedYear, setSelectedYear] = useState('2026');
  const [selectedMonth, setSelectedMonth] = useState('2026-08');
  
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('全部'); // 全部 | 待结清 | 已结清

  // 弹窗状态
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [statementCustomer, setStatementCustomer] = useState(null); // 对账单客户

  // 表单状态
  const [pricingMode, setPricingMode] = useState('area'); // area (按面积) | fixed (固定总价)
  const [calcData, setCalcData] = useState({ length: '', width: '', quantity: '1', unitPrice: '' });
  const [formData, setFormData] = useState({
    customer_name: '',
    phone: '',
    order_date: new Date().toISOString().split('T')[0],
    material: '写真喷绘',
    specs: '',
    total_amount: '',
    deposit_amount: '0',
    delivery_status: '制作中',
    payment_status: '待结清',
    notes: ''
  });

  // 获取数据
  const fetchOrders = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('orders')
      .select('*')
      .order('order_date', { ascending: false });

    if (error) {
      console.error('获取数据失败:', error);
    } else {
      setOrders(data || []);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchOrders();
  }, []);

  // 自动算料计算总价
  useEffect(() => {
    if (pricingMode === 'area') {
      const l = parseFloat(calcData.length) || 0;
      const w = parseFloat(calcData.width) || 0;
      const q = parseFloat(calcData.quantity) || 0;
      const p = parseFloat(calcData.unitPrice) || 0;
      
      const area = (l * w * q).toFixed(2);
      const total = (l * w * q * p).toFixed(2);
      
      if (l > 0 && w > 0) {
        setFormData(prev => ({
          ...prev,
          specs: `${l}m × ${w}m × ${q}件 (总面积: ${area}㎡)`,
          total_amount: total > 0 ? total : prev.total_amount
        }));
      }
    }
  }, [calcData, pricingMode]);

  // 新建/保存订单
  const handleSubmit = async (e) => {
    e.preventDefault();
    const total = parseFloat(formData.total_amount) || 0;
    const deposit = parseFloat(formData.deposit_amount) || 0;
    const isPaid = deposit >= total && total > 0;

    const payload = {
      ...formData,
      total_amount: total,
      deposit_amount: deposit,
      payment_status: isPaid ? '已结清' : (deposit > 0 ? '部分付款' : '待结清')
    };

    const { error } = await supabase.from('orders').insert([payload]);
    if (error) {
      alert('保存失败: ' + error.message);
    } else {
      setIsModalOpen(false);
      resetForm();
      fetchOrders();
    }
  };

  // 快捷收尾款
  const handleQuickSettle = async (order) => {
    const unpaid = order.total_amount - order.deposit_amount;
    if (!window.confirm(`确认结清客户【${order.customer_name}】的剩余尾款 ¥${unpaid.toFixed(2)} 吗？`)) return;

    const { error } = await supabase
      .from('orders')
      .update({
        deposit_amount: order.total_amount,
        payment_status: '已结清'
      })
      .eq('id', order.id);

    if (error) {
      alert('更新失败: ' + error.message);
    } else {
      fetchOrders();
    }
  };

  // 删除订单
  const handleDelete = async (id) => {
    if (!window.confirm('确定要删除此条记录吗？')) return;
    const { error } = await supabase.from('orders').delete().eq('id', id);
    if (error) {
      alert('删除失败: ' + error.message);
    } else {
      fetchOrders();
    }
  };

  const resetForm = () => {
    setFormData({
      customer_name: '',
      phone: '',
      order_date: new Date().toISOString().split('T')[0],
      material: '写真喷绘',
      specs: '',
      total_amount: '',
      deposit_amount: '0',
      delivery_status: '制作中',
      payment_status: '待结清',
      notes: ''
    });
    setCalcData({ length: '', width: '', quantity: '1', unitPrice: '' });
  };

  // 根据周期模式（按年/按月/全部）筛选订单
  const currentPeriodOrders = orders.filter(item => {
    if (!item.order_date) return false;
    if (periodMode === 'year') {
      return item.order_date.startsWith(selectedYear); // 年初到年末（如 2026-01-01 到 2026-12-31）
    }
    if (periodMode === 'month') {
      return item.order_date.startsWith(selectedMonth); // 指定单月
    }
    return true; // 全部历史
  });

  // 列表过滤（搜索词 + 结账状态）
  const filteredOrders = currentPeriodOrders.filter(item => {
    const matchSearch = (item.customer_name || '').includes(searchTerm) || (item.phone || '').includes(searchTerm);
    if (statusFilter === '待结清') return matchSearch && item.payment_status !== '已结清';
    if (statusFilter === '已结清') return matchSearch && item.payment_status === '已结清';
    return matchSearch;
  });

  // 看板核心统计计算
  const stats = currentPeriodOrders.reduce((acc, curr) => {
    const total = parseFloat(curr.total_amount) || 0;
    const deposit = parseFloat(curr.deposit_amount) || 0;
    const unpaid = Math.max(0, total - deposit);

    acc.totalAmount += total;
    acc.receivedAmount += deposit;
    acc.unpaidAmount += unpaid;
    acc.count += 1;
    return acc;
  }, { totalAmount: 0, receivedAmount: 0, unpaidAmount: 0, count: 0 });

  // 周期文案生成
  const getPeriodLabel = () => {
    if (periodMode === 'year') return `${selectedYear}年度（年初至年末）`;
    if (periodMode === 'month') return `${selectedMonth} 单月`;
    return '全部历史累计';
  };

  // 导出 CSV (Excel兼容)
  const exportToCSV = () => {
    if (filteredOrders.length === 0) return alert('当前周期没有可导出的数据！');
    const headers = ['订单日期,客户姓名,联系电话,品版材质,规格数量,总金额,已收金额,待付尾款,交货状态,结账状态,备注'];
    const rows = filteredOrders.map(o => [
      o.order_date,
      o.customer_name,
      o.phone || '',
      o.material,
      `"${(o.specs || '').replace(/"/g, '""')}"`,
      o.total_amount,
      o.deposit_amount,
      (o.total_amount - o.deposit_amount).toFixed(2),
      o.delivery_status,
      o.payment_status,
      `"${(o.notes || '').replace(/"/g, '""')}"`
    ].join(','));

    const csvContent = 'data:text/csv;charset=utf-8,\uFEFF' + [headers, ...rows].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `蓓蓓广告记账_${getPeriodLabel()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800 p-4 md:p-8">
      <div className="max-w-7xl mx-auto space-y-6">
        
        {/* 顶部标题栏 */}
        <header className="flex flex-col md:flex-row justify-between items-start md:items-center bg-white p-5 rounded-2xl shadow-sm border border-slate-100 gap-4">
          <div className="flex items-center space-x-3">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-tr from-blue-600 to-indigo-500 flex items-center justify-center text-white font-bold text-xl shadow-md shadow-blue-500/20">
              蓓
            </div>
            <div>
              <h1 className="text-xl md:text-2xl font-bold text-slate-900 tracking-tight">
                临汾市尧都区蓓蓓图文广告有限公司记账管理系统
              </h1>
              <p className="text-xs md:text-sm text-slate-500 mt-0.5">专业广告制作 · 年度/月度营收汇总 · 资金尾款追踪</p>
            </div>
          </div>
          <button 
            onClick={() => { resetForm(); setIsModalOpen(true); }}
            className="w-full md:w-auto px-5 py-2.5 bg-blue-600 hover:bg-blue-700 active:scale-95 text-white font-medium rounded-xl shadow-md shadow-blue-600/20 transition-all flex items-center justify-center space-x-2"
          >
            <span className="text-lg">+</span>
            <span>新建订单</span>
          </button>
        </header>

        {/* 账目周期切换与年度看板 */}
        <section className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 space-y-5">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 pb-4 border-b border-slate-100">
            <div>
              <h2 className="text-base font-bold text-slate-800">账目周期概览</h2>
              <p className="text-xs text-slate-500">当前统计维度：<span className="font-semibold text-blue-600">{getPeriodLabel()}</span></p>
            </div>
            
            <div className="flex flex-wrap items-center gap-2">
              {/* 模式选择按钮 */}
              <div className="flex bg-slate-100 p-1 rounded-lg text-xs font-semibold">
                <button 
                  onClick={() => setPeriodMode('year')}
                  className={`px-3 py-1.5 rounded-md transition-all ${periodMode === 'year' ? 'bg-white text-blue-600 shadow-sm font-bold' : 'text-slate-600'}`}
                >
                  📅 按年汇总(年初到年末)
                </button>
                <button 
                  onClick={() => setPeriodMode('month')}
                  className={`px-3 py-1.5 rounded-md transition-all ${periodMode === 'month' ? 'bg-white text-blue-600 shadow-sm font-bold' : 'text-slate-600'}`}
                >
                  🗓️ 按单月查看
                </button>
                <button 
                  onClick={() => setPeriodMode('all')}
                  className={`px-3 py-1.5 rounded-md transition-all ${periodMode === 'all' ? 'bg-white text-blue-600 shadow-sm font-bold' : 'text-slate-600'}`}
                >
                  🌐 全部历史
                </button>
              </div>

              {/* 年份选择器 */}
              {periodMode === 'year' && (
                <select 
                  value={selectedYear} 
                  onChange={(e) => setSelectedYear(e.target.value)}
                  className="px-3 py-1.5 border border-slate-200 rounded-lg text-sm bg-slate-50 font-bold text-blue-600 focus:ring-2 focus:ring-blue-500 focus:outline-none"
                >
                  {['2024', '2025', '2026', '2027', '2028'].map(y => (
                    <option key={y} value={y}>{y}年度 (1月-12月)</option>
                  ))}
                </select>
              )}

              {/* 月份选择器 */}
              {periodMode === 'month' && (
                <input 
                  type="month" 
                  value={selectedMonth} 
                  onChange={(e) => setSelectedMonth(e.target.value)}
                  className="px-3 py-1.5 border border-slate-200 rounded-lg text-sm bg-slate-50 font-semibold focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              )}
            </div>
          </div>

          {/* 数据看板卡片 */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="p-4 rounded-xl bg-blue-50/50 border border-blue-100/60">
              <span className="text-xs font-semibold text-blue-600 uppercase tracking-wider">
                {periodMode === 'year' ? `${selectedYear} 全年总营业额` : '总营业额'}
              </span>
              <div className="text-xl md:text-2xl font-bold text-slate-900 mt-1">¥{stats.totalAmount.toFixed(2)}</div>
              <span className="text-xs text-slate-500 mt-1 block">{getPeriodLabel()} 金额合计</span>
            </div>
            
            <div className="p-4 rounded-xl bg-emerald-50/50 border border-emerald-100/60">
              <span className="text-xs font-semibold text-emerald-600 uppercase tracking-wider">
                {periodMode === 'year' ? `${selectedYear} 全年实收款` : '已收金额 / 定金'}
              </span>
              <div className="text-xl md:text-2xl font-bold text-emerald-600 mt-1">¥{stats.receivedAmount.toFixed(2)}</div>
              <span className="text-xs text-slate-500 mt-1 block">实收资金到账汇总</span>
            </div>

            <div className="p-4 rounded-xl bg-rose-50/50 border border-rose-100/60">
              <span className="text-xs font-semibold text-rose-600 uppercase tracking-wider">
                {periodMode === 'year' ? `${selectedYear} 全年累计欠款` : '待收尾款（欠款）'}
              </span>
              <div className="text-xl md:text-2xl font-bold text-rose-600 mt-1">¥{stats.unpaidAmount.toFixed(2)}</div>
              <span className="text-xs text-slate-500 mt-1 block">未结清挂账总计</span>
            </div>

            <div className="p-4 rounded-xl bg-slate-50 border border-slate-200/60">
              <span className="text-xs font-semibold text-slate-600 uppercase tracking-wider">
                {periodMode === 'year' ? `${selectedYear} 全年订单总量` : '订单总数'}
              </span>
              <div className="text-xl md:text-2xl font-bold text-slate-800 mt-1">{stats.count} 笔</div>
              <span className="text-xs text-slate-500 mt-1 block">累计录单总量</span>
            </div>
          </div>
        </section>

        {/* 订单明细管理 */}
        <section className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
          <div className="p-5 border-b border-slate-100 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
            <div>
              <h2 className="text-lg font-bold text-slate-800">订单明细列表</h2>
              <span className="text-xs text-slate-500">{getPeriodLabel()} · 共 {filteredOrders.length} 条记录</span>
            </div>
            
            <div className="flex flex-wrap items-center gap-3 w-full md:w-auto">
              <input 
                type="text" 
                placeholder="搜索客户姓名或手机号..." 
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="px-3 py-1.5 border border-slate-200 rounded-lg text-sm w-full md:w-56 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <div className="flex bg-slate-100 p-0.5 rounded-lg text-xs font-medium">
                {['全部', '待结清', '已结清'].map((st) => (
                  <button 
                    key={st}
                    onClick={() => setStatusFilter(st)}
                    className={`px-3 py-1.5 rounded-md transition-all ${statusFilter === st ? 'bg-white text-blue-600 shadow-sm font-bold' : 'text-slate-600'}`}
                  >
                    {st}
                  </button>
                ))}
              </div>
              <button 
                onClick={exportToCSV}
                className="px-3 py-1.5 border border-slate-200 hover:bg-slate-50 text-slate-700 text-sm font-medium rounded-lg transition-colors flex items-center space-x-1"
              >
                <span>📊 导出当前报表</span>
              </button>
            </div>
          </div>

          {/* 表格 */}
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50/75 text-slate-500 text-xs font-semibold uppercase tracking-wider border-b border-slate-100">
                <tr>
                  <th className="p-4">订单日期</th>
                  <th className="p-4">客户姓名</th>
                  <th className="p-4">联系电话</th>
                  <th className="p-4">品版材质</th>
                  <th className="p-4">规格 / 算料</th>
                  <th className="p-4">总金额</th>
                  <th className="p-4">已付定金</th>
                  <th className="p-4">待付尾款</th>
                  <th className="p-4">交货状态</th>
                  <th className="p-4">结账状态</th>
                  <th className="p-4 text-center">操作</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {loading ? (
                  <tr><td colSpan="11" className="p-8 text-center text-slate-400">正在同步数据中...</td></tr>
                ) : filteredOrders.length === 0 ? (
                  <tr><td colSpan="11" className="p-8 text-center text-slate-400">当前周期暂无订单记录</td></tr>
                ) : (
                  filteredOrders.map((order) => {
                    const unpaid = Math.max(0, order.total_amount - order.deposit_amount);
                    return (
                      <tr key={order.id} className="hover:bg-slate-50/60 transition-colors">
                        <td className="p-4 text-slate-600 whitespace-nowrap">{order.order_date}</td>
                        <td className="p-4 font-semibold text-slate-900 whitespace-nowrap">{order.customer_name}</td>
                        <td className="p-4 text-slate-500 whitespace-nowrap">{order.phone || '-'}</td>
                        <td className="p-4 whitespace-nowrap">
                          <span className="px-2.5 py-1 bg-slate-100 text-slate-700 rounded-md text-xs font-medium">
                            {order.material}
                          </span>
                        </td>
                        <td className="p-4 text-slate-600 max-w-xs truncate" title={order.specs}>{order.specs || '-'}</td>
                        <td className="p-4 font-bold text-slate-900 whitespace-nowrap">¥{parseFloat(order.total_amount).toFixed(2)}</td>
                        <td className="p-4 text-emerald-600 font-medium whitespace-nowrap">¥{parseFloat(order.deposit_amount).toFixed(2)}</td>
                        <td className="p-4 whitespace-nowrap">
                          {unpaid > 0 ? (
                            <span className="font-bold text-rose-600">¥{unpaid.toFixed(2)}</span>
                          ) : (
                            <span className="text-slate-400">¥0.00</span>
                          )}
                        </td>
                        <td className="p-4 whitespace-nowrap">
                          <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                            order.delivery_status === '已交货' || order.delivery_status === '已安装' 
                              ? 'bg-emerald-50 text-emerald-700' 
                              : 'bg-blue-50 text-blue-700'
                          }`}>
                            {order.delivery_status || '制作中'}
                          </span>
                        </td>
                        <td className="p-4 whitespace-nowrap">
                          <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                            order.payment_status === '已结清'
                              ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' 
                              : 'bg-rose-50 text-rose-700 border border-rose-200'
                          }`}>
                            {order.payment_status}
                          </span>
                        </td>
                        <td className="p-4 text-center whitespace-nowrap space-x-2">
                          {unpaid > 0 && (
                            <button 
                              onClick={() => handleQuickSettle(order)}
                              className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded text-xs font-medium transition-colors"
                            >
                              收尾款
                            </button>
                          )}
                          <button 
                            onClick={() => setStatementCustomer(order.customer_name)}
                            className="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded text-xs font-medium transition-colors"
                          >
                            对账
                          </button>
                          <button 
                            onClick={() => handleDelete(order.id)}
                            className="text-slate-400 hover:text-rose-600 text-xs transition-colors"
                          >
                            删除
                          </button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </section>

      </div>

      {/* 新建订单弹窗 (Modal) */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm">
          <div className="bg-white w-full max-w-xl rounded-2xl shadow-2xl border border-slate-100 overflow-hidden flex flex-col max-h-[90vh]">
            <div className="p-5 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
              <h3 className="font-bold text-slate-800 text-lg">新建记账订单</h3>
              <button onClick={() => setIsModalOpen(false)} className="text-slate-400 hover:text-slate-600 text-xl">✕</button>
            </div>
            
            <form onSubmit={handleSubmit} className="p-6 space-y-4 overflow-y-auto">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-bold text-slate-700 mb-1 block">客户姓名 *</label>
                  <input 
                    required 
                    type="text" 
                    value={formData.customer_name}
                    onChange={(e) => setFormData({...formData, customer_name: e.target.value})}
                    placeholder="请输入客户姓名" 
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="text-xs font-bold text-slate-700 mb-1 block">联系电话</label>
                  <input 
                    type="text" 
                    value={formData.phone}
                    onChange={(e) => setFormData({...formData, phone: e.target.value})}
                    placeholder="手机号 (可选)" 
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-bold text-slate-700 mb-1 block">订单日期 *</label>
                  <input 
                    required 
                    type="date" 
                    value={formData.order_date}
                    onChange={(e) => setFormData({...formData, order_date: e.target.value})}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="text-xs font-bold text-slate-700 mb-1 block">品版材质</label>
                  <select 
                    value={formData.material}
                    onChange={(e) => setFormData({...formData, material: e.target.value})}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none bg-white"
                  >
                    {AD_MATERIALS.map(m => <option key={m} value={m}>{m}</option>)}
                  </select>
                </div>
              </div>

              {/* 算料计算器区块 */}
              <div className="p-3.5 bg-blue-50/60 rounded-xl border border-blue-100 space-y-3">
                <div className="flex justify-between items-center">
                  <span className="text-xs font-bold text-blue-900">广告计价与算料模式</span>
                  <div className="text-xs space-x-2">
                    <button 
                      type="button" 
                      onClick={() => setPricingMode('area')}
                      className={`px-2 py-1 rounded ${pricingMode === 'area' ? 'bg-blue-600 text-white font-bold' : 'text-blue-600'}`}
                    >
                      长宽面积计价
                    </button>
                    <button 
                      type="button" 
                      onClick={() => setPricingMode('fixed')}
                      className={`px-2 py-1 rounded ${pricingMode === 'fixed' ? 'bg-blue-600 text-white font-bold' : 'text-blue-600'}`}
                    >
                      直接填总价
                    </button>
                  </div>
                </div>

                {pricingMode === 'area' && (
                  <div className="grid grid-cols-4 gap-2">
                    <div>
                      <span className="text-[10px] text-slate-500 block">长(米)</span>
                      <input 
                        type="number" step="0.01" placeholder="如 3" 
                        value={calcData.length} 
                        onChange={(e) => setCalcData({...calcData, length: e.target.value})}
                        className="w-full p-1.5 border border-slate-200 rounded text-xs bg-white"
                      />
                    </div>
                    <div>
                      <span className="text-[10px] text-slate-500 block">宽(米)</span>
                      <input 
                        type="number" step="0.01" placeholder="如 2" 
                        value={calcData.width} 
                        onChange={(e) => setCalcData({...calcData, width: e.target.value})}
                        className="w-full p-1.5 border border-slate-200 rounded text-xs bg-white"
                      />
                    </div>
                    <div>
                      <span className="text-[10px] text-slate-500 block">数量</span>
                      <input 
                        type="number" min="1" 
                        value={calcData.quantity} 
                        onChange={(e) => setCalcData({...calcData, quantity: e.target.value})}
                        className="w-full p-1.5 border border-slate-200 rounded text-xs bg-white"
                      />
                    </div>
                    <div>
                      <span className="text-[10px] text-slate-500 block">单价(元/㎡)</span>
                      <input 
                        type="number" step="0.1" placeholder="如 25" 
                        value={calcData.unitPrice} 
                        onChange={(e) => setCalcData({...calcData, unitPrice: e.target.value})}
                        className="w-full p-1.5 border border-slate-200 rounded text-xs bg-white"
                      />
                    </div>
                  </div>
                )}
              </div>

              <div>
                <label className="text-xs font-bold text-slate-700 mb-1 block">规格说明</label>
                <input 
                  type="text" 
                  value={formData.specs}
                  onChange={(e) => setFormData({...formData, specs: e.target.value})}
                  placeholder="例如: 3m × 2m = 6㎡, 包边打孔" 
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="text-xs font-bold text-slate-700 mb-1 block">总金额 (元) *</label>
                  <input 
                    required 
                    type="number" step="0.01"
                    value={formData.total_amount}
                    onChange={(e) => setFormData({...formData, total_amount: e.target.value})}
                    placeholder="0.00" 
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm font-bold text-slate-900 focus:ring-2 focus:ring-blue-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="text-xs font-bold text-slate-700 mb-1 block">已付定金 (元)</label>
                  <input 
                    type="number" step="0.01"
                    value={formData.deposit_amount}
                    onChange={(e) => setFormData({...formData, deposit_amount: e.target.value})}
                    placeholder="0.00" 
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm text-emerald-600 font-bold focus:ring-2 focus:ring-blue-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="text-xs font-bold text-slate-700 mb-1 block">剩余尾款</label>
                  <div className="w-full px-3 py-2 bg-slate-100 rounded-lg text-sm font-bold text-rose-600">
                    ¥{Math.max(0, (parseFloat(formData.total_amount) || 0) - (parseFloat(formData.deposit_amount) || 0)).toFixed(2)}
                  </div>
                </div>
              </div>

              <div>
                <label className="text-xs font-bold text-slate-700 mb-1 block">订单备注</label>
                <textarea 
                  rows="2"
                  value={formData.notes}
                  onChange={(e) => setFormData({...formData, notes: e.target.value})}
                  placeholder="交货地点、开票需求、特殊工艺等..." 
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none"
                />
              </div>

              <div className="pt-2 flex justify-end space-x-3">
                <button 
                  type="button" 
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 border border-slate-200 text-slate-600 rounded-xl text-sm font-medium hover:bg-slate-50"
                >
                  取消
                </button>
                <button 
                  type="submit" 
                  className="px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-sm font-medium shadow-md shadow-blue-600/20"
                >
                  保存记录
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 客户对账单弹窗 */}
      {statementCustomer && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm">
          <div className="bg-white w-full max-w-lg rounded-2xl shadow-2xl border border-slate-100 overflow-hidden p-6 space-y-4">
            <div className="flex justify-between items-center pb-3 border-b border-slate-100">
              <h3 className="font-bold text-slate-900 text-lg">客户对账单：{statementCustomer}</h3>
              <button onClick={() => setStatementCustomer(null)} className="text-slate-400 hover:text-slate-600">✕</button>
            </div>

            {(() => {
              const custOrders = orders.filter(o => o.customer_name === statementCustomer);
              const totalSum = custOrders.reduce((sum, o) => sum + (parseFloat(o.total_amount) || 0), 0);
              const paidSum = custOrders.reduce((sum, o) => sum + (parseFloat(o.deposit_amount) || 0), 0);
              const unpaidSum = Math.max(0, totalSum - paidSum);

              const copyText = () => {
                const text = `【蓓蓓图文广告 对账单】\n客户：${statementCustomer}\n------------------\n${custOrders.map(o => `${o.order_date} | ${o.material} (${o.specs || '标准'}) | 总额:¥${o.total_amount} | 已付:¥${o.deposit_amount}`).join('\n')}\n------------------\n合计总额：¥${totalSum.toFixed(2)}\n已付金额：¥${paidSum.toFixed(2)}\n待结清欠款：¥${unpaidSum.toFixed(2)}`;
                navigator.clipboard.writeText(text);
                alert('对账明细已复制到剪贴板，可直接粘贴发送给微信客户！');
              };

              return (
                <div className="space-y-4">
                  <div className="max-h-56 overflow-y-auto space-y-2 pr-1">
                    {custOrders.map((o, idx) => (
                      <div key={idx} className="p-3 bg-slate-50 rounded-lg text-xs flex justify-between items-center">
                        <div>
                          <div className="font-semibold text-slate-800">{o.order_date} · {o.material}</div>
                          <div className="text-slate-500">{o.specs || '无特殊规格'}</div>
                        </div>
                        <div className="text-right">
                          <div className="font-bold text-slate-800">¥{o.total_amount}</div>
                          <div className="text-rose-600">欠: ¥{(o.total_amount - o.deposit_amount).toFixed(2)}</div>
                        </div>
                      </div>
                    ))}
                  </div>

                  <div className="p-4 bg-rose-50/60 rounded-xl border border-rose-100 flex justify-between items-center">
                    <span className="text-sm font-bold text-slate-700">累计待付欠款</span>
                    <span className="text-xl font-extrabold text-rose-600">¥{unpaidSum.toFixed(2)}</span>
                  </div>

                  <div className="flex space-x-3 pt-2">
                    <button 
                      onClick={copyText} 
                      className="flex-1 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-bold rounded-xl shadow-md transition-all"
                    >
                      复制对账文本发微信
                    </button>
                  </div>
                </div>
              );
            })()}
          </div>
        </div>
      )}

    </div>
  );
}