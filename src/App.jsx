import React, { useState, useEffect } from 'react';
import { supabase } from './supabaseClient';

const AD_MATERIALS = [
  '写真喷绘', '户外车贴', 'KT板展架', '亚克力门牌', 
  'UV发光字', '不锈钢精工字', 'PVC雕刻', '钛金字', 
  '铜牌腐蚀', '条幅横幅', '名片画册', '其他定制'
];

const EXPENSE_CATEGORIES = [
  '原材料进货', '外协加工代工', '人员与安装工费', 
  '房租与水电', '设备维护与耗材', '物流运输与差旅', '日常杂费与运营'
];

const PAYMENT_METHODS = ['微信支付', '支付宝', '对公转账', '现金支付', '其他'];

// 系统访问凭证配置
const DEFAULT_ACCOUNT = {
  username: 'admin',
  password: '888'
};

export default function App() {
  const currentDate = new Date();
  const currentYearStr = currentDate.getFullYear().toString();
  const currentMonthStr = `${currentDate.getFullYear()}-${String(currentDate.getMonth() + 1).padStart(2, '0')}`;

  // 登录与权限状态
  const [isAuthenticated, setIsAuthenticated] = useState(() => {
    return localStorage.getItem('beibei_auth_logged') === 'true';
  });
  const [loginInput, setLoginInput] = useState({ username: '', password: '' });
  const [loginError, setLoginError] = useState('');

  // 金额隐私模式（小眼睛开关）：默认隐蔽 false (不显示明文金额)
  const [showAmount, setShowAmount] = useState(() => {
    const saved = localStorage.getItem('beibei_show_amount');
    return saved !== null ? saved === 'true' : false; // 默认隐蔽
  });

  // 主Tab切换：'income' (收入/订单) | 'expense' (公司支出)
  const [activeTab, setActiveTab] = useState('income');

  // 数据列表状态
  const [orders, setOrders] = useState([]);
  const [expenses, setExpenses] = useState([]);
  const [loading, setLoading] = useState(true);
  
  // 筛选周期：'month' | 'year' | 'all'
  const [periodMode, setPeriodMode] = useState('month'); 
  const [selectedYear, setSelectedYear] = useState(currentYearStr);
  const [selectedMonth, setSelectedMonth] = useState(currentMonthStr);
  
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('全部'); // 收入状态筛选
  const [expenseCatFilter, setExpenseCatFilter] = useState('全部'); // 支出分类筛选

  // 弹窗状态
  const [isOrderModalOpen, setIsOrderModalOpen] = useState(false);
  const [isExpenseModalOpen, setIsExpenseModalOpen] = useState(false);
  const [statementCustomer, setStatementCustomer] = useState(null);

  // 收入订单表单
  const [pricingMode, setPricingMode] = useState('area');
  const [calcData, setCalcData] = useState({ length: '', width: '', quantity: '1', unitPrice: '' });
  const [orderFormData, setOrderFormData] = useState({
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

  // 支出表单
  const [expenseFormData, setExpenseFormData] = useState({
    expense_date: new Date().toISOString().split('T')[0],
    category: '原材料进货',
    amount: '',
    payee: '',
    payment_method: '微信支付',
    notes: ''
  });

  // 切换隐私小眼睛
  const toggleAmountVisibility = () => {
    const nextVal = !showAmount;
    setShowAmount(nextVal);
    localStorage.setItem('beibei_show_amount', String(nextVal));
  };

  // 格式化金额显示（受小眼睛管控）
  const formatMoney = (amount, prefix = '¥') => {
    if (!showAmount) return `${prefix} ****`;
    return `${prefix}${parseFloat(amount || 0).toFixed(2)}`;
  };

  // 获取数据
  const fetchData = async () => {
    setLoading(true);
    const [ordersRes, expensesRes] = await Promise.all([
      supabase.from('orders').select('*').order('order_date', { ascending: false }),
      supabase.from('expenses').select('*').order('expense_date', { ascending: false })
    ]);

    if (ordersRes.data) setOrders(ordersRes.data);
    if (expensesRes.data) setExpenses(expensesRes.data);
    setLoading(false);
  };

  useEffect(() => {
    if (isAuthenticated) {
      fetchData();
    }
  }, [isAuthenticated]);

  // 处理登录
  const handleLogin = (e) => {
    e.preventDefault();
    if (
      loginInput.username.trim() === DEFAULT_ACCOUNT.username &&
      loginInput.password === DEFAULT_ACCOUNT.password
    ) {
      setIsAuthenticated(true);
      localStorage.setItem('beibei_auth_logged', 'true');
      setLoginError('');
    } else {
      setLoginError('账号或管理密码错误，请重新输入');
    }
  };

  // 退出登录
  const handleLogout = () => {
    if (window.confirm('确定要退出当前管理系统吗？')) {
      localStorage.removeItem('beibei_auth_logged');
      setIsAuthenticated(false);
      setLoginInput({ username: '', password: '' });
    }
  };

  // 自动算料
  useEffect(() => {
    if (pricingMode === 'area') {
      const l = parseFloat(calcData.length) || 0;
      const w = parseFloat(calcData.width) || 0;
      const q = parseFloat(calcData.quantity) || 0;
      const p = parseFloat(calcData.unitPrice) || 0;
      
      const area = (l * w * q).toFixed(2);
      const total = (l * w * q * p).toFixed(2);
      
      if (l > 0 && w > 0) {
        setOrderFormData(prev => ({
          ...prev,
          specs: `${l}m × ${w}m × ${q}件 (面积: ${area}㎡)`,
          total_amount: total > 0 ? total : prev.total_amount
        }));
      }
    }
  }, [calcData, pricingMode]);

  // 保存订单
  const handleOrderSubmit = async (e) => {
    e.preventDefault();
    const total = parseFloat(orderFormData.total_amount) || 0;
    const deposit = parseFloat(orderFormData.deposit_amount) || 0;
    const isPaid = deposit >= total && total > 0;

    const payload = {
      ...orderFormData,
      total_amount: total,
      deposit_amount: deposit,
      payment_status: isPaid ? '已结清' : (deposit > 0 ? '部分付款' : '待结清')
    };

    const { error } = await supabase.from('orders').insert([payload]);
    if (error) {
      alert('保存失败: ' + error.message);
    } else {
      setIsOrderModalOpen(false);
      resetOrderForm();
      fetchData();
    }
  };

  // 保存支出
  const handleExpenseSubmit = async (e) => {
    e.preventDefault();
    const amt = parseFloat(expenseFormData.amount) || 0;
    if (amt <= 0) return alert('请输入有效的支出金额！');

    const payload = {
      ...expenseFormData,
      amount: amt
    };

    const { error } = await supabase.from('expenses').insert([payload]);
    if (error) {
      alert('保存支出失败: ' + error.message);
    } else {
      setIsExpenseModalOpen(false);
      resetExpenseForm();
      fetchData();
    }
  };

  // 快捷收尾款
  const handleQuickSettle = async (order) => {
    const unpaid = order.total_amount - order.deposit_amount;
    if (!window.confirm(`确认结清客户【${order.customer_name}】的剩余尾款 ¥${unpaid.toFixed(2)} 吗？`)) return;

    const { error } = await supabase
      .from('orders')
      .update({ deposit_amount: order.total_amount, payment_status: '已结清' })
      .eq('id', order.id);

    if (error) alert('更新失败: ' + error.message);
    else fetchData();
  };

  // 删除订单/支出
  const handleDeleteOrder = async (id) => {
    if (!window.confirm('确定要删除此条订单记录吗？')) return;
    const { error } = await supabase.from('orders').delete().eq('id', id);
    if (error) alert('删除失败: ' + error.message);
    else fetchData();
  };

  const handleDeleteExpense = async (id) => {
    if (!window.confirm('确定要删除此条支出记录吗？')) return;
    const { error } = await supabase.from('expenses').delete().eq('id', id);
    if (error) alert('删除失败: ' + error.message);
    else fetchData();
  };

  const resetOrderForm = () => {
    setOrderFormData({
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

  const resetExpenseForm = () => {
    setExpenseFormData({
      expense_date: new Date().toISOString().split('T')[0],
      category: '原材料进货',
      amount: '',
      payee: '',
      payment_method: '微信支付',
      notes: ''
    });
  };

  // 周期过滤函数
  const isInPeriod = (dateStr) => {
    if (!dateStr) return false;
    if (periodMode === 'year') return dateStr.startsWith(selectedYear);
    if (periodMode === 'month') return dateStr.startsWith(selectedMonth);
    return true;
  };

  const currentPeriodOrders = orders.filter(item => isInPeriod(item.order_date));
  const currentPeriodExpenses = expenses.filter(item => isInPeriod(item.expense_date));

  // 列表过滤
  const filteredOrders = currentPeriodOrders.filter(item => {
    const matchSearch = (item.customer_name || '').includes(searchTerm) || (item.phone || '').includes(searchTerm);
    if (statusFilter === '待结清') return matchSearch && item.payment_status !== '已结清';
    if (statusFilter === '已结清') return matchSearch && item.payment_status === '已结清';
    return matchSearch;
  });

  const filteredExpenses = currentPeriodExpenses.filter(item => {
    const matchSearch = (item.payee || '').includes(searchTerm) || (item.notes || '').includes(searchTerm);
    if (expenseCatFilter !== '全部') return matchSearch && item.category === expenseCatFilter;
    return matchSearch;
  });

  // 综合收支与净利润看板计算
  const stats = {
    totalRevenue: currentPeriodOrders.reduce((acc, curr) => acc + (parseFloat(curr.total_amount) || 0), 0),
    receivedRevenue: currentPeriodOrders.reduce((acc, curr) => acc + (parseFloat(curr.deposit_amount) || 0), 0),
    unpaidRevenue: currentPeriodOrders.reduce((acc, curr) => acc + Math.max(0, (parseFloat(curr.total_amount) || 0) - (parseFloat(curr.deposit_amount) || 0)), 0),
    totalExpense: currentPeriodExpenses.reduce((acc, curr) => acc + (parseFloat(curr.amount) || 0), 0),
    orderCount: currentPeriodOrders.length,
    expenseCount: currentPeriodExpenses.length
  };

  // 真实净利润 = 实收金额 - 总支出
  const netProfit = stats.receivedRevenue - stats.totalExpense;

  const getPeriodLabel = () => {
    if (periodMode === 'month') return `${selectedMonth} 月度`;
    if (periodMode === 'year') return `${selectedYear} 年度`;
    return '全部历史';
  };

  // 导出 Excel
  const exportToExcel = () => {
    let headers = [];
    let rowsHtml = '';
    let sheetName = '';
    let fileName = '';

    if (activeTab === 'income') {
      if (filteredOrders.length === 0) return alert('当前周期无收入数据可导出！');
      headers = ['订单日期', '客户姓名', '联系电话', '品版材质', '规格/算料', '总金额', '已收定金', '待付尾款', '交货状态', '结账状态', '备注'];
      sheetName = '收入订单明细';
      fileName = `蓓蓓广告_${getPeriodLabel()}_收入报表.xls`;
      rowsHtml = filteredOrders.map(o => `
        <tr>
          <td>${o.order_date || ''}</td>
          <td>${o.customer_name || ''}</td>
          <td style="mso-number-format:'\\@';">${o.phone || ''}</td>
          <td>${o.material || ''}</td>
          <td>${o.specs || ''}</td>
          <td style="text-align:right;">${parseFloat(o.total_amount || 0).toFixed(2)}</td>
          <td style="text-align:right;">${parseFloat(o.deposit_amount || 0).toFixed(2)}</td>
          <td style="text-align:right;">${(parseFloat(o.total_amount || 0) - parseFloat(o.deposit_amount || 0)).toFixed(2)}</td>
          <td>${o.delivery_status || ''}</td>
          <td>${o.payment_status || ''}</td>
          <td>${o.notes || ''}</td>
        </tr>
      `).join('');
    } else {
      if (filteredExpenses.length === 0) return alert('当前周期无支出数据可导出！');
      headers = ['支出日期', '支出分类', '支出金额(元)', '收款方/供应商/人员', '支付方式', '备注说明'];
      sheetName = '公司支出明细';
      fileName = `蓓蓓广告_${getPeriodLabel()}_支出报表.xls`;
      rowsHtml = filteredExpenses.map(e => `
        <tr>
          <td>${e.expense_date || ''}</td>
          <td>${e.category || ''}</td>
          <td style="text-align:right;">${parseFloat(e.amount || 0).toFixed(2)}</td>
          <td>${e.payee || ''}</td>
          <td>${e.payment_method || ''}</td>
          <td>${e.notes || ''}</td>
        </tr>
      `).join('');
    }

    const tableHtml = `
      <html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns="http://www.w3.org/TR/REC-html40">
      <head>
        <meta http-equiv="content-type" content="application/vnd.ms-excel; charset=UTF-8">
        <!--[if gte mso 9]>
        <xml>
          <x:ExcelWorkbook>
            <x:ExcelWorksheets>
              <x:ExcelWorksheet>
                <x:Name>${sheetName}</x:Name>
                <x:WorksheetOptions><x:DisplayGridlines/></x:WorksheetOptions>
              </x:ExcelWorksheet>
            </x:ExcelWorksheets>
          </x:ExcelWorkbook>
        </xml>
        <![endif]-->
        <style>
          th { background-color: #2563EB; color: #FFFFFF; font-weight: bold; border: 0.5pt solid #CBD5E1; text-align: center; }
          td { border: 0.5pt solid #E2E8F0; text-align: left; }
        </style>
      </head>
      <body>
        <table>
          <thead><tr>${headers.map(h => `<th>${h}</th>`).join('')}</tr></thead>
          <tbody>${rowsHtml}</tbody>
        </table>
      </body>
      </html>
    `;

    const blob = new Blob([tableHtml], { type: 'application/vnd.ms-excel;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  // 1. 未登录页面
  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center p-4">
        <div className="w-full max-w-md bg-white rounded-3xl p-8 shadow-2xl space-y-6">
          <div className="text-center space-y-2">
            <div className="w-16 h-16 bg-gradient-to-tr from-blue-600 to-indigo-600 rounded-2xl mx-auto flex items-center justify-center text-white text-2xl font-bold shadow-lg shadow-blue-500/30">
              蓓
            </div>
            <h1 className="text-xl font-extrabold text-slate-900 tracking-tight pt-2">
              临汾市尧都区蓓蓓图文广告有限公司
            </h1>
            <p className="text-xs text-slate-500">记账管理系统 · 身份权限验证</p>
          </div>

          <form onSubmit={handleLogin} className="space-y-4">
            {loginError && (
              <div className="p-3 bg-rose-50 border border-rose-200 text-rose-600 text-xs rounded-xl font-medium text-center">
                {loginError}
              </div>
            )}
            <div>
              <label className="text-xs font-bold text-slate-700 mb-1.5 block">管理员账号</label>
              <input 
                required
                type="text" 
                placeholder="请输入管理账号 (默认 admin)"
                value={loginInput.username}
                onChange={(e) => setLoginInput({ ...loginInput, username: e.target.value })}
                className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium focus:ring-2 focus:ring-blue-500 focus:outline-none transition-all"
              />
            </div>
            <div>
              <label className="text-xs font-bold text-slate-700 mb-1.5 block">管理密码</label>
              <input 
                required
                type="password" 
                placeholder="请输入密码"
                value={loginInput.password}
                onChange={(e) => setLoginInput({ ...loginInput, password: e.target.value })}
                className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium focus:ring-2 focus:ring-blue-500 focus:outline-none transition-all"
              />
            </div>
            <button 
              type="submit"
              className="w-full py-3.5 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white font-bold rounded-xl shadow-lg shadow-blue-500/30 active:scale-[0.98] transition-all text-sm mt-2"
            >
              安全登录进入系统
            </button>
          </form>

          <div className="text-center pt-2">
            <span className="text-[11px] text-slate-400">已开启端到端加密保护 · 非授权人员请勿操作</span>
          </div>
        </div>
      </div>
    );
  }

  // 2. 已登录主系统界面
  return (
    <div className="min-h-screen bg-slate-50 text-slate-800 p-3 md:p-8">
      <div className="max-w-7xl mx-auto space-y-5">
        
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
              <p className="text-xs md:text-sm text-slate-500 mt-0.5">收入开单 · 采购支出 · 净利润核算 · 隐私保护</p>
            </div>
          </div>
          
          <div className="flex flex-wrap items-center gap-2.5 w-full md:w-auto">
            {/* 小眼睛金额隐私开关 */}
            <button 
              onClick={toggleAmountVisibility}
              className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-all flex items-center space-x-1.5 border ${
                showAmount 
                  ? 'bg-amber-50 text-amber-700 border-amber-200 shadow-sm' 
                  : 'bg-slate-100 text-slate-600 border-slate-200'
              }`}
              title={showAmount ? '点击隐藏敏感金额' : '点击显示明文金额'}
            >
              <span>{showAmount ? '👁️' : '🙈'}</span>
              <span>{showAmount ? '金额已显示' : '金额已隐蔽'}</span>
            </button>

            {/* 新建订单 */}
            <button 
              onClick={() => { resetOrderForm(); setIsOrderModalOpen(true); }}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 active:scale-95 text-white text-xs md:text-sm font-bold rounded-xl shadow-md shadow-blue-600/20 transition-all flex items-center space-x-1"
            >
              <span>+ 记收入</span>
            </button>

            {/* 新建支出 */}
            <button 
              onClick={() => { resetExpenseForm(); setIsExpenseModalOpen(true); }}
              className="px-4 py-2 bg-rose-600 hover:bg-rose-700 active:scale-95 text-white text-xs md:text-sm font-bold rounded-xl shadow-md shadow-rose-600/20 transition-all flex items-center space-x-1"
            >
              <span>- 记支出</span>
            </button>

            {/* 退出登录 */}
            <button 
              onClick={handleLogout}
              className="px-3 py-2 border border-slate-200 hover:bg-slate-100 text-slate-500 font-medium rounded-xl transition-all text-xs"
              title="退出登录"
            >
              退出
            </button>
          </div>
        </header>

        {/* 周期切换与收支/净利润综合看板 */}
        <section className="bg-white p-5 md:p-6 rounded-2xl shadow-sm border border-slate-100 space-y-5">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 pb-4 border-b border-slate-100">
            <div>
              <h2 className="text-base font-bold text-slate-800">经营看板与周期统计</h2>
              <p className="text-xs text-slate-500">统计维度：<span className="font-semibold text-blue-600">{getPeriodLabel()}</span></p>
            </div>
            
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex bg-slate-100 p-1 rounded-lg text-xs font-semibold">
                <button 
                  onClick={() => setPeriodMode('month')}
                  className={`px-3 py-1.5 rounded-md transition-all ${periodMode === 'month' ? 'bg-white text-blue-600 shadow-sm font-bold' : 'text-slate-600'}`}
                >
                  🗓️ 按单月查看
                </button>
                <button 
                  onClick={() => setPeriodMode('year')}
                  className={`px-3 py-1.5 rounded-md transition-all ${periodMode === 'year' ? 'bg-white text-blue-600 shadow-sm font-bold' : 'text-slate-600'}`}
                >
                  📅 按年汇总(年初到年末)
                </button>
                <button 
                  onClick={() => setPeriodMode('all')}
                  className={`px-3 py-1.5 rounded-md transition-all ${periodMode === 'all' ? 'bg-white text-blue-600 shadow-sm font-bold' : 'text-slate-600'}`}
                >
                  🌐 全部历史
                </button>
              </div>

              {periodMode === 'month' && (
                <input 
                  type="month" 
                  value={selectedMonth} 
                  onChange={(e) => setSelectedMonth(e.target.value)}
                  className="px-3 py-1.5 border border-slate-200 rounded-lg text-sm bg-slate-50 font-bold text-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              )}

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
            </div>
          </div>

          {/* 核心看板卡片（含受保护的净利润与支出） */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {/* 营业总额 / 实收 */}
            <div className="p-4 rounded-xl bg-blue-50/50 border border-blue-100/60">
              <span className="text-xs font-semibold text-blue-600 uppercase tracking-wider">
                {periodMode === 'month' ? '本月营业总额' : '周期营业总额'}
              </span>
              <div className="text-xl md:text-2xl font-black text-slate-900 mt-1">
                {formatMoney(stats.totalRevenue)}
              </div>
              <span className="text-[11px] text-slate-500 mt-1 block">
                实收到账: <strong className="text-emerald-600">{formatMoney(stats.receivedRevenue)}</strong>
              </span>
            </div>
            
            {/* 公司总支出 */}
            <div className="p-4 rounded-xl bg-rose-50/50 border border-rose-100/60">
              <span className="text-xs font-semibold text-rose-600 uppercase tracking-wider">
                {periodMode === 'month' ? '本月总开支' : '周期公司总支出'}
              </span>
              <div className="text-xl md:text-2xl font-black text-rose-600 mt-1">
                {formatMoney(stats.totalExpense)}
              </div>
              <span className="text-[11px] text-slate-500 mt-1 block">
                进货/外协/人工/房租 ({stats.expenseCount} 笔)
              </span>
            </div>

            {/* 真实净利润 */}
            <div className={`p-4 rounded-xl border ${netProfit >= 0 ? 'bg-emerald-50/60 border-emerald-200' : 'bg-amber-50 border-amber-200'}`}>
              <span className={`text-xs font-bold uppercase tracking-wider ${netProfit >= 0 ? 'text-emerald-700' : 'text-amber-700'}`}>
                {periodMode === 'month' ? '本月实际净利润' : '周期实际净利润'}
              </span>
              <div className={`text-xl md:text-2xl font-black mt-1 ${netProfit >= 0 ? 'text-emerald-700' : 'text-amber-700'}`}>
                {formatMoney(netProfit)}
              </div>
              <span className="text-[11px] text-slate-500 mt-1 block">
                计算公式: 实收 - 总支出
              </span>
            </div>

            {/* 客户欠款挂账 */}
            <div className="p-4 rounded-xl bg-amber-50/40 border border-amber-200/60">
              <span className="text-xs font-semibold text-amber-700 uppercase tracking-wider">
                待收客户尾款 (欠款)
              </span>
              <div className="text-xl md:text-2xl font-black text-amber-600 mt-1">
                {formatMoney(stats.unpaidRevenue)}
              </div>
              <span className="text-[11px] text-slate-500 mt-1 block">未收回订单挂账汇总</span>
            </div>
          </div>
        </section>

        {/* 收入与支出主Tab切换区 */}
        <section className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
          {/* Tab 头部 */}
          <div className="p-4 md:p-5 border-b border-slate-100 flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-slate-50/30">
            <div className="flex items-center space-x-2 bg-slate-200/70 p-1 rounded-xl">
              <button 
                onClick={() => { setActiveTab('income'); setSearchTerm(''); }}
                className={`px-4 py-2 rounded-lg text-xs md:text-sm font-bold transition-all flex items-center space-x-1.5 ${
                  activeTab === 'income' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <span>📦 客户订单收入 ({filteredOrders.length})</span>
              </button>
              <button 
                onClick={() => { setActiveTab('expense'); setSearchTerm(''); }}
                className={`px-4 py-2 rounded-lg text-xs md:text-sm font-bold transition-all flex items-center space-x-1.5 ${
                  activeTab === 'expense' ? 'bg-white text-rose-600 shadow-sm' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <span>💸 公司采购与支出 ({filteredExpenses.length})</span>
              </button>
            </div>
            
            <div className="flex flex-wrap items-center gap-2.5 w-full md:w-auto">
              <input 
                type="text" 
                placeholder={activeTab === 'income' ? "搜索客户姓名或手机..." : "搜索收款方、备注..."}
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="px-3 py-1.5 border border-slate-200 rounded-lg text-xs md:text-sm w-full md:w-52 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
              />

              {activeTab === 'income' ? (
                <div className="flex bg-slate-100 p-0.5 rounded-lg text-xs font-medium">
                  {['全部', '待结清', '已结清'].map((st) => (
                    <button 
                      key={st}
                      onClick={() => setStatusFilter(st)}
                      className={`px-2.5 py-1.5 rounded-md transition-all ${statusFilter === st ? 'bg-white text-blue-600 shadow-sm font-bold' : 'text-slate-600'}`}
                    >
                      {st}
                    </button>
                  ))}
                </div>
              ) : (
                <select 
                  value={expenseCatFilter}
                  onChange={(e) => setExpenseCatFilter(e.target.value)}
                  className="px-2.5 py-1.5 border border-slate-200 rounded-lg text-xs font-medium bg-white focus:outline-none"
                >
                  <option value="全部">全部类别</option>
                  {EXPENSE_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              )}

              <button 
                onClick={exportToExcel}
                className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs md:text-sm font-semibold rounded-lg transition-colors flex items-center space-x-1 shadow-sm"
              >
                <span>📊 导出当前 Excel</span>
              </button>
            </div>
          </div>

          {/* 表格区：收入明细表格 */}
          {activeTab === 'income' && (
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
                          <td className="p-4 font-bold text-slate-900 whitespace-nowrap">{formatMoney(order.total_amount)}</td>
                          <td className="p-4 text-emerald-600 font-medium whitespace-nowrap">{formatMoney(order.deposit_amount)}</td>
                          <td className="p-4 whitespace-nowrap">
                            {unpaid > 0 ? (
                              <span className="font-bold text-rose-600">{formatMoney(unpaid)}</span>
                            ) : (
                              <span className="text-slate-400">{formatMoney(0)}</span>
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
                              onClick={() => handleDeleteOrder(order.id)}
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
          )}

          {/* 表格区：支出明细表格 */}
          {activeTab === 'expense' && (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="bg-rose-50/60 text-rose-800 text-xs font-semibold uppercase tracking-wider border-b border-rose-100">
                  <tr>
                    <th className="p-4">支出日期</th>
                    <th className="p-4">支出分类</th>
                    <th className="p-4">支出金额</th>
                    <th className="p-4">收款方 / 供应商 / 人员</th>
                    <th className="p-4">支付方式</th>
                    <th className="p-4">备注说明</th>
                    <th className="p-4 text-center">操作</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {loading ? (
                    <tr><td colSpan="7" className="p-8 text-center text-slate-400">正在同步数据中...</td></tr>
                  ) : filteredExpenses.length === 0 ? (
                    <tr><td colSpan="7" className="p-8 text-center text-slate-400">当前周期暂无支出记录</td></tr>
                  ) : (
                    filteredExpenses.map((exp) => (
                      <tr key={exp.id} className="hover:bg-rose-50/20 transition-colors">
                        <td className="p-4 text-slate-600 whitespace-nowrap">{exp.expense_date}</td>
                        <td className="p-4 whitespace-nowrap">
                          <span className="px-2.5 py-1 bg-rose-50 text-rose-700 rounded-md text-xs font-bold border border-rose-100">
                            {exp.category}
                          </span>
                        </td>
                        <td className="p-4 font-extrabold text-rose-600 whitespace-nowrap text-base">
                          {formatMoney(exp.amount)}
                        </td>
                        <td className="p-4 font-semibold text-slate-800 whitespace-nowrap">{exp.payee || '-'}</td>
                        <td className="p-4 text-slate-600 whitespace-nowrap">
                          <span className="px-2 py-0.5 bg-slate-100 text-slate-600 rounded text-xs">
                            {exp.payment_method || '微信支付'}
                          </span>
                        </td>
                        <td className="p-4 text-slate-600 max-w-sm truncate" title={exp.notes}>{exp.notes || '-'}</td>
                        <td className="p-4 text-center whitespace-nowrap">
                          <button 
                            onClick={() => handleDeleteExpense(exp.id)}
                            className="text-slate-400 hover:text-rose-600 text-xs transition-colors"
                          >
                            删除
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          )}

        </section>

      </div>

      {/* 新建订单弹窗 (Modal) */}
      {isOrderModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm">
          <div className="bg-white w-full max-w-xl rounded-2xl shadow-2xl border border-slate-100 overflow-hidden flex flex-col max-h-[90vh]">
            <div className="p-5 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
              <h3 className="font-bold text-slate-800 text-lg">新建记账订单 (收入)</h3>
              <button onClick={() => setIsOrderModalOpen(false)} className="text-slate-400 hover:text-slate-600 text-xl">✕</button>
            </div>
            
            <form onSubmit={handleOrderSubmit} className="p-6 space-y-4 overflow-y-auto">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-bold text-slate-700 mb-1 block">客户姓名 *</label>
                  <input 
                    required 
                    type="text" 
                    value={orderFormData.customer_name}
                    onChange={(e) => setOrderFormData({...orderFormData, customer_name: e.target.value})}
                    placeholder="请输入客户姓名" 
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="text-xs font-bold text-slate-700 mb-1 block">联系电话</label>
                  <input 
                    type="text" 
                    value={orderFormData.phone}
                    onChange={(e) => setOrderFormData({...orderFormData, phone: e.target.value})}
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
                    value={orderFormData.order_date}
                    onChange={(e) => setOrderFormData({...orderFormData, order_date: e.target.value})}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="text-xs font-bold text-slate-700 mb-1 block">品版材质</label>
                  <select 
                    value={orderFormData.material}
                    onChange={(e) => setOrderFormData({...orderFormData, material: e.target.value})}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none bg-white"
                  >
                    {AD_MATERIALS.map(m => <option key={m} value={m}>{m}</option>)}
                  </select>
                </div>
              </div>

              {/* 算料计算器 */}
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
                  value={orderFormData.specs}
                  onChange={(e) => setOrderFormData({...orderFormData, specs: e.target.value})}
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
                    value={orderFormData.total_amount}
                    onChange={(e) => setOrderFormData({...orderFormData, total_amount: e.target.value})}
                    placeholder="0.00" 
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm font-bold text-slate-900 focus:ring-2 focus:ring-blue-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="text-xs font-bold text-slate-700 mb-1 block">已付定金 (元)</label>
                  <input 
                    type="number" step="0.01"
                    value={orderFormData.deposit_amount}
                    onChange={(e) => setOrderFormData({...orderFormData, deposit_amount: e.target.value})}
                    placeholder="0.00" 
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm text-emerald-600 font-bold focus:ring-2 focus:ring-blue-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="text-xs font-bold text-slate-700 mb-1 block">剩余尾款</label>
                  <div className="w-full px-3 py-2 bg-slate-100 rounded-lg text-sm font-bold text-rose-600">
                    ¥{Math.max(0, (parseFloat(orderFormData.total_amount) || 0) - (parseFloat(orderFormData.deposit_amount) || 0)).toFixed(2)}
                  </div>
                </div>
              </div>

              <div>
                <label className="text-xs font-bold text-slate-700 mb-1 block">订单备注</label>
                <textarea 
                  rows="2"
                  value={orderFormData.notes}
                  onChange={(e) => setOrderFormData({...orderFormData, notes: e.target.value})}
                  placeholder="交货地点、特殊工艺等..." 
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none"
                />
              </div>

              <div className="pt-2 flex justify-end space-x-3">
                <button 
                  type="button" 
                  onClick={() => setIsOrderModalOpen(false)}
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

      {/* 新建支出弹窗 (Modal) */}
      {isExpenseModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm">
          <div className="bg-white w-full max-w-lg rounded-2xl shadow-2xl border border-slate-100 overflow-hidden flex flex-col max-h-[90vh]">
            <div className="p-5 border-b border-slate-100 flex justify-between items-center bg-rose-50/50">
              <h3 className="font-bold text-rose-900 text-lg">记一笔公司支出</h3>
              <button onClick={() => setIsExpenseModalOpen(false)} className="text-slate-400 hover:text-slate-600 text-xl">✕</button>
            </div>
            
            <form onSubmit={handleExpenseSubmit} className="p-6 space-y-4 overflow-y-auto">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-bold text-slate-700 mb-1 block">支出日期 *</label>
                  <input 
                    required 
                    type="date" 
                    value={expenseFormData.expense_date}
                    onChange={(e) => setExpenseFormData({...expenseFormData, expense_date: e.target.value})}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-rose-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="text-xs font-bold text-slate-700 mb-1 block">支出类别 *</label>
                  <select 
                    value={expenseFormData.category}
                    onChange={(e) => setExpenseFormData({...expenseFormData, category: e.target.value})}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-rose-500 focus:outline-none bg-white font-medium"
                  >
                    {EXPENSE_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-bold text-slate-700 mb-1 block">支出金额 (元) *</label>
                  <input 
                    required 
                    type="number" step="0.01"
                    placeholder="0.00"
                    value={expenseFormData.amount}
                    onChange={(e) => setExpenseFormData({...expenseFormData, amount: e.target.value})}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm font-bold text-rose-600 focus:ring-2 focus:ring-rose-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="text-xs font-bold text-slate-700 mb-1 block">支付方式</label>
                  <select 
                    value={expenseFormData.payment_method}
                    onChange={(e) => setExpenseFormData({...expenseFormData, payment_method: e.target.value})}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-rose-500 focus:outline-none bg-white"
                  >
                    {PAYMENT_METHODS.map(m => <option key={m} value={m}>{m}</option>)}
                  </select>
                </div>
              </div>

              <div>
                <label className="text-xs font-bold text-slate-700 mb-1 block">收款方 / 供应商 / 人员</label>
                <input 
                  type="text" 
                  placeholder="如：板材厂、顺丰速运、安装师傅等"
                  value={expenseFormData.payee}
                  onChange={(e) => setExpenseFormData({...expenseFormData, payee: e.target.value})}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-rose-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="text-xs font-bold text-slate-700 mb-1 block">备注说明</label>
                <textarea 
                  rows="2"
                  placeholder="如：采购5卷写真背胶、8月份房租、2台机器维护等..."
                  value={expenseFormData.notes}
                  onChange={(e) => setExpenseFormData({...expenseFormData, notes: e.target.value})}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-rose-500 focus:outline-none"
                />
              </div>

              <div className="pt-2 flex justify-end space-x-3">
                <button 
                  type="button" 
                  onClick={() => setIsExpenseModalOpen(false)}
                  className="px-4 py-2 border border-slate-200 text-slate-600 rounded-xl text-sm font-medium hover:bg-slate-50"
                >
                  取消
                </button>
                <button 
                  type="submit" 
                  className="px-6 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-sm font-medium shadow-md shadow-rose-600/20"
                >
                  保存支出
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
                          <div className="font-bold text-slate-800">{formatMoney(o.total_amount)}</div>
                          <div className="text-rose-600">欠: {formatMoney(o.total_amount - o.deposit_amount)}</div>
                        </div>
                      </div>
                    ))}
                  </div>

                  <div className="p-4 bg-rose-50/60 rounded-xl border border-rose-100 flex justify-between items-center">
                    <span className="text-sm font-bold text-slate-700">累计待付欠款</span>
                    <span className="text-xl font-extrabold text-rose-600">{formatMoney(unpaidSum)}</span>
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