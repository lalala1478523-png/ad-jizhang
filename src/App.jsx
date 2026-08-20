import React, { useState, useEffect } from 'react';
import { supabase } from './supabaseClient';

// 基础字典默认值
const DEFAULT_MATERIALS = [
  '背胶', '喷绘', '黑白打印', '彩色打印', 'KT板展架', '亚克力门牌', 
  'UV发光字', '不锈钢精工字', 'PVC雕刻', '钛金字', 
  '铜牌腐蚀', '条幅横幅', '名片画册'
];

const DEFAULT_EXPENSE_CATEGORIES = [
  '原材料进货', '外协加工代工', '人员与安装工费', 
  '房租与水电', '设备维护与耗材', '物流运输与差旅', '日常杂费与运营'
];

const PRINT_SPECS = ['A4', 'A3', 'A4铜板纸', 'A3铜板纸', '卡纸', '普通复印纸', '其他纸张'];
const PAYMENT_METHODS = ['微信支付', '支付宝', '对公转账', '现金支付', '其他'];

export default function App() {
  const currentDate = new Date();
  const currentYearStr = currentDate.getFullYear().toString();
  const currentMonthStr = `${currentDate.getFullYear()}-${String(currentDate.getMonth() + 1).padStart(2, '0')}`;

  // 1. 系统基础与【真·安全登录】状态
  const [authLoading, setAuthLoading] = useState(true); // 用于页面初次加载时检查登录状态
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [loginInput, setLoginInput] = useState({ email: '', password: '' });
  const [loginError, setLoginError] = useState('');
  
  const [showAmount, setShowAmount] = useState(() => localStorage.getItem('beibei_show_amount') === 'true' || false);
  const [activeTab, setActiveTab] = useState('income');

  // 2. 数据列表与筛选状态
  const [orders, setOrders] = useState([]);
  const [expenses, setExpenses] = useState([]);
  const [loading, setLoading] = useState(true);
  
  const [periodMode, setPeriodMode] = useState('month'); 
  const [selectedYear, setSelectedYear] = useState(currentYearStr);
  const [selectedMonth, setSelectedMonth] = useState(currentMonthStr);
  
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('全部');
  const [expenseCatFilter, setExpenseCatFilter] = useState('全部');
  const [customerTypeFilter, setCustomerTypeFilter] = useState('全部');
  const [vipGroupFilter, setVipGroupFilter] = useState('全部');

  // 3. 本地动态字典状态
  const [materials, setMaterials] = useState(() => {
    const saved = localStorage.getItem('beibei_materials');
    return saved ? JSON.parse(saved) : DEFAULT_MATERIALS;
  });
  const [vipGroups, setVipGroups] = useState(() => {
    const saved = localStorage.getItem('beibei_vip_groups');
    return saved ? JSON.parse(saved) : ['政府单位', '同行代工', '企业直客'];
  });
  const [expenseCategories, setExpenseCategories] = useState(() => {
    const saved = localStorage.getItem('beibei_expense_categories');
    return saved ? JSON.parse(saved) : DEFAULT_EXPENSE_CATEGORIES;
  });

  // 4. 弹窗控制状态
  const [isOrderModalOpen, setIsOrderModalOpen] = useState(false);
  const [isExpenseModalOpen, setIsExpenseModalOpen] = useState(false);
  const [statementCustomer, setStatementCustomer] = useState(null);
  
  const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false);
  const [settingsTab, setSettingsTab] = useState('groups'); 
  const [newSettingInput, setNewSettingInput] = useState('');

  // 5. 表单数据状态
  const [pricingMode, setPricingMode] = useState('fixed');
  const [calcData, setCalcData] = useState({ length: '', width: '', quantity: '1', unitPrice: '' });
  
  const [orderFormData, setOrderFormData] = useState({
    customer_type: '普通客户', vip_group: '', customer_name: '', phone: '',
    order_date: new Date().toISOString().split('T')[0],
    material: materials[0] || '黑白打印',
    content: '', specs: 'A4', quantity: '1', unit_price: '',
    total_amount: '', deposit_amount: '0', delivery_status: '制作中', payment_status: '待结清', notes: ''
  });

  const [expenseFormData, setExpenseFormData] = useState({
    expense_date: new Date().toISOString().split('T')[0],
    category: expenseCategories[0] || '原材料进货',
    amount: '', payee: '', payment_method: '微信支付', notes: ''
  });

  // ================= 【核心安全升级：Supabase 真实身份验证】 =================
  useEffect(() => {
    // 初次加载时检查是否已经登录过
    supabase.auth.getSession().then(({ data: { session } }) => {
      setIsAuthenticated(!!session);
      setAuthLoading(false);
    });

    // 监听登录/登出状态的变化
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setIsAuthenticated(!!session);
    });

    return () => subscription.unsubscribe();
  }, []);

  const handleLogin = async (e) => {
    e.preventDefault();
    setLoginError('');
    
    // 调用 Supabase 官方真实登录接口
    const { data, error } = await supabase.auth.signInWithPassword({
      email: loginInput.email,
      password: loginInput.password,
    });

    if (error) {
      setLoginError('邮箱账号或密码错误，请重新核对！');
    } else {
      setLoginInput({ email: '', password: '' });
    }
  };

  const handleLogout = async () => {
    if (window.confirm('确定要安全退出当前系统吗？')) {
      // 销毁云端下发的安全令牌
      await supabase.auth.signOut();
    }
  };
  // =======================================================================

  const toggleAmountVisibility = () => {
    const nextVal = !showAmount;
    setShowAmount(nextVal);
    localStorage.setItem('beibei_show_amount', String(nextVal));
  };

  const formatMoney = (amount, prefix = '¥') => {
    if (!showAmount) return `${prefix} ****`;
    return `${prefix}${parseFloat(amount || 0).toFixed(2)}`;
  };

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

  // 只有在认证成功后，才去拉取数据
  useEffect(() => {
    if (isAuthenticated) fetchData();
  }, [isAuthenticated]);

  // ================= 基础设置管理逻辑 =================
  const handleAddSetting = (e) => {
    e.preventDefault();
    const val = newSettingInput.trim();
    if (!val) return;

    if (settingsTab === 'groups') {
      if (vipGroups.includes(val)) return alert('该分组已存在！');
      const updated = [...vipGroups, val];
      setVipGroups(updated);
      localStorage.setItem('beibei_vip_groups', JSON.stringify(updated));
    } else if (settingsTab === 'materials') {
      if (materials.includes(val)) return alert('该材质已存在！');
      const updated = [...materials, val];
      setMaterials(updated);
      localStorage.setItem('beibei_materials', JSON.stringify(updated));
    } else if (settingsTab === 'expenses') {
      if (expenseCategories.includes(val)) return alert('该支出类别已存在！');
      const updated = [...expenseCategories, val];
      setExpenseCategories(updated);
      localStorage.setItem('beibei_expense_categories', JSON.stringify(updated));
    }
    setNewSettingInput('');
  };

  const handleDeleteSetting = (item, type) => {
    if (!window.confirm(`确定要删除【${item}】吗？(历史记录不受影响)`)) return;
    
    if (type === 'groups') {
      const updated = vipGroups.filter(g => g !== item);
      setVipGroups(updated);
      localStorage.setItem('beibei_vip_groups', JSON.stringify(updated));
      if (orderFormData.vip_group === item) setOrderFormData({ ...orderFormData, vip_group: '' });
    } else if (type === 'materials') {
      const updated = materials.filter(m => m !== item);
      setMaterials(updated);
      localStorage.setItem('beibei_materials', JSON.stringify(updated));
      if (orderFormData.material === item) setOrderFormData({ ...orderFormData, material: updated[0] || '' });
    } else if (type === 'expenses') {
      const updated = expenseCategories.filter(c => c !== item);
      setExpenseCategories(updated);
      localStorage.setItem('beibei_expense_categories', JSON.stringify(updated));
      if (expenseFormData.category === item) setExpenseFormData({ ...expenseFormData, category: updated[0] || '' });
    }
  };

  const handleEditSetting = (oldItem, type) => {
    const newItem = window.prompt(`修改【${oldItem}】的名称为：`, oldItem);
    if (!newItem || newItem.trim() === '' || newItem === oldItem) return;
    const val = newItem.trim();
    
    if (type === 'groups') {
      if (vipGroups.includes(val)) return alert('该名称已存在！');
      const updated = vipGroups.map(g => g === oldItem ? val : g);
      setVipGroups(updated);
      localStorage.setItem('beibei_vip_groups', JSON.stringify(updated));
    } else if (type === 'materials') {
      if (materials.includes(val)) return alert('该名称已存在！');
      const updated = materials.map(m => m === oldItem ? val : m);
      setMaterials(updated);
      localStorage.setItem('beibei_materials', JSON.stringify(updated));
    } else if (type === 'expenses') {
      if (expenseCategories.includes(val)) return alert('该名称已存在！');
      const updated = expenseCategories.map(c => c === oldItem ? val : c);
      setExpenseCategories(updated);
      localStorage.setItem('beibei_expense_categories', JSON.stringify(updated));
    }
  };

  // 自动算价
  useEffect(() => {
    const q = parseFloat(orderFormData.quantity) || 0;
    const p = parseFloat(orderFormData.unit_price) || 0;
    if (pricingMode === 'fixed') {
      if (q > 0 && p > 0) setOrderFormData(prev => ({ ...prev, total_amount: (q * p).toFixed(2) }));
    }
  }, [orderFormData.quantity, orderFormData.unit_price, pricingMode]);

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
          specs: `${l}m × ${w}m`,
          quantity: q.toString(),
          unit_price: p.toString(),
          notes: prev.notes ? prev.notes : `(面积: ${area}㎡)`,
          total_amount: total > 0 ? total : prev.total_amount
        }));
      }
    }
  }, [calcData, pricingMode]);

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
    if (error) alert('保存失败: ' + error.message);
    else {
      setIsOrderModalOpen(false);
      resetOrderForm();
      fetchData();
    }
  };

  const handleExpenseSubmit = async (e) => {
    e.preventDefault();
    const amt = parseFloat(expenseFormData.amount) || 0;
    if (amt <= 0) return alert('请输入有效的支出金额！');
    const { error } = await supabase.from('expenses').insert([{ ...expenseFormData, amount: amt }]);
    if (error) alert('保存支出失败: ' + error.message);
    else {
      setIsExpenseModalOpen(false);
      resetExpenseForm();
      fetchData();
    }
  };

  const handleQuickSettle = async (order) => {
    const unpaid = order.total_amount - order.deposit_amount;
    if (!window.confirm(`确认结清剩余尾款 ¥${unpaid.toFixed(2)} 吗？`)) return;
    const { error } = await supabase.from('orders').update({ deposit_amount: order.total_amount, payment_status: '已结清' }).eq('id', order.id);
    if (error) alert('更新失败: ' + error.message); else fetchData();
  };

  const handleDeleteOrder = async (id) => {
    if (!window.confirm('确定要删除此条订单记录吗？')) return;
    const { error } = await supabase.from('orders').delete().eq('id', id);
    if (error) alert('删除失败: ' + error.message); else fetchData();
  };

  const handleDeleteExpense = async (id) => {
    if (!window.confirm('确定要删除此条支出记录吗？')) return;
    const { error } = await supabase.from('expenses').delete().eq('id', id);
    if (error) alert('删除失败: ' + error.message); else fetchData();
  };

  const resetOrderForm = () => {
    setOrderFormData({
      customer_type: '普通客户', vip_group: '', customer_name: '', phone: '',
      order_date: new Date().toISOString().split('T')[0],
      material: materials[0] || '黑白打印',
      content: '', specs: 'A4', quantity: '1', unit_price: '', total_amount: '',
      deposit_amount: '0', delivery_status: '制作中', payment_status: '待结清', notes: ''
    });
    setCalcData({ length: '', width: '', quantity: '1', unitPrice: '' });
    setPricingMode('fixed');
  };

  const resetExpenseForm = () => {
    setExpenseFormData({
      expense_date: new Date().toISOString().split('T')[0], 
      category: expenseCategories[0] || '原材料进货',
      amount: '', payee: '', payment_method: '微信支付', notes: ''
    });
  };

  const isInPeriod = (dateStr) => {
    if (!dateStr) return false;
    if (periodMode === 'year') return dateStr.startsWith(selectedYear);
    if (periodMode === 'month') return dateStr.startsWith(selectedMonth);
    return true;
  };

  const currentPeriodOrders = orders.filter(item => isInPeriod(item.order_date));
  const currentPeriodExpenses = expenses.filter(item => isInPeriod(item.expense_date));

  const filteredOrders = currentPeriodOrders.filter(item => {
    const matchSearch = (item.customer_name || '').includes(searchTerm) || (item.phone || '').includes(searchTerm) || (item.content || '').includes(searchTerm);
    if (statusFilter === '待结清' && item.payment_status === '已结清') return false;
    if (statusFilter === '已结清' && item.payment_status !== '已结清') return false;
    if (customerTypeFilter !== '全部' && item.customer_type !== customerTypeFilter) {
      if (!(!item.customer_type && customerTypeFilter === '普通客户')) return false; 
    }
    if (customerTypeFilter === '高级客户' && vipGroupFilter !== '全部' && item.vip_group !== vipGroupFilter) return false;
    return matchSearch;
  });

  const filteredExpenses = currentPeriodExpenses.filter(item => {
    const matchSearch = (item.payee || '').includes(searchTerm) || (item.notes || '').includes(searchTerm);
    if (expenseCatFilter !== '全部') return matchSearch && item.category === expenseCatFilter;
    return matchSearch;
  });

  const stats = {
    totalRevenue: currentPeriodOrders.reduce((acc, curr) => acc + (parseFloat(curr.total_amount) || 0), 0),
    receivedRevenue: currentPeriodOrders.reduce((acc, curr) => acc + (parseFloat(curr.deposit_amount) || 0), 0),
    unpaidRevenue: currentPeriodOrders.reduce((acc, curr) => acc + Math.max(0, (parseFloat(curr.total_amount) || 0) - (parseFloat(curr.deposit_amount) || 0)), 0),
    totalExpense: currentPeriodExpenses.reduce((acc, curr) => acc + (parseFloat(curr.amount) || 0), 0),
    orderCount: currentPeriodOrders.length,
    expenseCount: currentPeriodExpenses.length
  };
  const netProfit = stats.receivedRevenue - stats.totalExpense;
  const getPeriodLabel = () => periodMode === 'month' ? `${selectedMonth} 月度` : periodMode === 'year' ? `${selectedYear} 年度` : '全部历史';

  const exportToExcel = () => {
    let htmlStr = '';
    let fileName = '';

    if (activeTab === 'income') {
      if (filteredOrders.length === 0) return alert('当前没有可导出的收入数据！');
      
      let unitName = '';
      if (customerTypeFilter === '高级客户') {
        unitName = vipGroupFilter === '全部' ? '高级客户 (未指定具体分组)' : vipGroupFilter;
      } else if (customerTypeFilter === '普通客户') {
        unitName = '普通客户 (散户)';
      } else {
        unitName = '全部客户 (综合汇总)';
      }

      fileName = `记账单_${unitName}_${getPeriodLabel()}.xls`;
      
      const rowsHtml = filteredOrders.map(o => `
        <tr>
          <td>${o.order_date || ''}</td>
          <td>${o.material || ''}</td>
          <td style="text-align: left;">${o.content || ''}</td>
          <td>${o.specs || ''}</td>
          <td>${o.quantity || ''}</td>
          <td>${o.unit_price || ''}</td>
          <td>${o.total_amount || ''}</td>
          <td>${o.customer_name || ''}</td>
        </tr>
      `).join('');

      htmlStr = `
        <html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns="http://www.w3.org/TR/REC-html40">
        <head><meta charset="utf-8"><style>table { border-collapse: collapse; width: 100%; font-family: 'SimSun', serif; } th, td { border: 1pt solid #000; text-align: center; height: 35px; font-size: 14px; } .title { font-size: 24px; font-weight: bold; letter-spacing: 15px; text-align: center; border: none !important; height: 50px; } .unit-title { border: none !important; text-align: left; font-size: 14px; padding-bottom: 5px; } th { font-weight: normal; }</style></head>
        <body>
          <table>
            <tr><td colspan="8" class="title">记账单</td></tr>
            <tr><td colspan="8" class="unit-title">单位：${unitName}</td></tr>
            <tr><th width="100">时间</th><th width="120">名称</th><th width="250">内容</th><th width="100">规格</th><th width="60">数量</th><th width="80">单价</th><th width="100">金额</th><th width="150">备注</th></tr>
            ${rowsHtml}
          </table>
        </body></html>
      `;
    } else {
      if (filteredExpenses.length === 0) return alert('当前无支出数据！');
      fileName = `公司支出报表_${getPeriodLabel()}.xls`;
      const rowsHtml = filteredExpenses.map(e => `<tr><td>${e.expense_date}</td><td>${e.category}</td><td>${e.amount}</td><td>${e.payee}</td><td>${e.payment_method}</td><td>${e.notes}</td></tr>`).join('');
      htmlStr = `<html><meta charset="utf-8"><table border="1"><tr><th>日期</th><th>分类</th><th>金额</th><th>收款方</th><th>方式</th><th>备注</th></tr>${rowsHtml}</table></html>`;
    }

    const blob = new Blob([htmlStr], { type: 'application/vnd.ms-excel;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  // 防闪烁保护层
  if (authLoading) {
    return <div className="min-h-screen bg-slate-900 flex items-center justify-center text-slate-400 font-bold">正在校验安全环境，请稍候...</div>;
  }

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center p-4">
        <div className="w-full max-w-md bg-white rounded-3xl p-8 shadow-2xl space-y-6">
          <div className="text-center space-y-2">
            <div className="w-16 h-16 bg-gradient-to-tr from-blue-600 to-indigo-600 rounded-2xl mx-auto flex items-center justify-center text-white text-2xl font-bold shadow-lg shadow-blue-500/30">蓓</div>
            <h1 className="text-xl font-extrabold text-slate-900 tracking-tight pt-2">临汾市尧都区蓓蓓图文广告有限公司</h1>
            <p className="text-xs text-slate-500">已开启 Supabase 军工级防篡改保护</p>
          </div>
          <form onSubmit={handleLogin} className="space-y-4">
            {loginError && <div className="p-3 bg-rose-50 border border-rose-200 text-rose-600 text-xs rounded-xl font-medium text-center">{loginError}</div>}
            <div>
              {/* 【UI 更新：提示输入真实邮箱】 */}
              <input required type="email" placeholder="请输入绑定的专属登录邮箱" value={loginInput.email} onChange={(e) => setLoginInput({ ...loginInput, email: e.target.value })} className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium focus:ring-2 focus:ring-blue-500 outline-none" />
            </div>
            <div>
              <input required type="password" placeholder="请输入安全密码" value={loginInput.password} onChange={(e) => setLoginInput({ ...loginInput, password: e.target.value })} className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium focus:ring-2 focus:ring-blue-500 outline-none" />
            </div>
            <button type="submit" className="w-full py-3.5 bg-gradient-to-r from-blue-600 to-indigo-600 text-white font-bold rounded-xl shadow-lg shadow-blue-500/30 text-sm mt-2 hover:opacity-90">授权并解密账本</button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800 p-3 md:p-8">
      <div className="max-w-7xl mx-auto space-y-5">
        
        {/* 顶部标题栏 */}
        <header className="flex flex-col md:flex-row justify-between items-start md:items-center bg-white p-5 rounded-2xl shadow-sm border border-slate-100 gap-4">
          <div className="flex items-center space-x-3">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-tr from-blue-600 to-indigo-500 flex items-center justify-center text-white font-bold text-xl shadow-md">蓓</div>
            <div>
              <h1 className="text-xl md:text-2xl font-bold text-slate-900 tracking-tight">临汾市尧都区蓓蓓图文广告</h1>
              <p className="text-xs md:text-sm text-slate-500 mt-0.5">数据已开启 RLS 高级加密 · 收入开单 · 采购支出</p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2.5 w-full md:w-auto">
            <button onClick={toggleAmountVisibility} className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-all flex items-center space-x-1.5 border ${showAmount ? 'bg-amber-50 text-amber-700 border-amber-200' : 'bg-slate-100 text-slate-600 border-slate-200'}`}>
              <span>{showAmount ? '👁️ 显示金额' : '🙈 隐蔽金额'}</span>
            </button>
            <button onClick={() => { resetOrderForm(); setIsOrderModalOpen(true); }} className="px-4 py-2 bg-blue-600 text-white text-xs md:text-sm font-bold rounded-xl shadow-md flex items-center space-x-1 hover:bg-blue-700">
              <span>+ 记收入</span>
            </button>
            <button onClick={() => { resetExpenseForm(); setIsExpenseModalOpen(true); }} className="px-4 py-2 bg-rose-600 text-white text-xs md:text-sm font-bold rounded-xl shadow-md flex items-center space-x-1 hover:bg-rose-700">
              <span>- 记支出</span>
            </button>
            <button onClick={() => setIsSettingsModalOpen(true)} className="px-4 py-2 bg-slate-700 text-white text-xs md:text-sm font-bold rounded-xl shadow-md flex items-center space-x-1 hover:bg-slate-800">
              <span>⚙️ 基础设置</span>
            </button>
            <button onClick={handleLogout} className="px-3 py-2 border border-slate-200 text-slate-500 font-medium rounded-xl text-xs hover:bg-slate-100">安全退出</button>
          </div>
        </header>

        {/* 周期看板 */}
        <section className="bg-white p-5 md:p-6 rounded-2xl shadow-sm border border-slate-100 space-y-5">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 pb-4 border-b border-slate-100">
            <div>
              <h2 className="text-base font-bold text-slate-800">经营看板与周期统计</h2>
              <p className="text-xs text-slate-500">统计维度：<span className="font-semibold text-blue-600">{getPeriodLabel()}</span></p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex bg-slate-100 p-1 rounded-lg text-xs font-semibold">
                <button onClick={() => setPeriodMode('month')} className={`px-3 py-1.5 rounded-md ${periodMode === 'month' ? 'bg-white text-blue-600 shadow-sm font-bold' : 'text-slate-600'}`}>按单月查看</button>
                <button onClick={() => setPeriodMode('year')} className={`px-3 py-1.5 rounded-md ${periodMode === 'year' ? 'bg-white text-blue-600 shadow-sm font-bold' : 'text-slate-600'}`}>按年汇总</button>
                <button onClick={() => setPeriodMode('all')} className={`px-3 py-1.5 rounded-md ${periodMode === 'all' ? 'bg-white text-blue-600 shadow-sm font-bold' : 'text-slate-600'}`}>全部历史</button>
              </div>
              {periodMode === 'month' && <input type="month" value={selectedMonth} onChange={(e) => setSelectedMonth(e.target.value)} className="px-3 py-1.5 border border-slate-200 rounded-lg text-sm bg-slate-50 font-bold text-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-500" />}
              {periodMode === 'year' && <select value={selectedYear} onChange={(e) => setSelectedYear(e.target.value)} className="px-3 py-1.5 border border-slate-200 rounded-lg text-sm bg-slate-50 font-bold text-blue-600 focus:outline-none"><option value="2024">2024年度</option><option value="2025">2025年度</option><option value="2026">2026年度</option></select>}
            </div>
          </div>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="p-4 rounded-xl bg-blue-50/50 border border-blue-100/60"><span className="text-xs font-semibold text-blue-600 uppercase">营业总额</span><div className="text-xl md:text-2xl font-black text-slate-900 mt-1">{formatMoney(stats.totalRevenue)}</div><span className="text-[11px] text-slate-500 mt-1 block">实收到账: <strong className="text-emerald-600">{formatMoney(stats.receivedRevenue)}</strong></span></div>
            <div className="p-4 rounded-xl bg-rose-50/50 border border-rose-100/60"><span className="text-xs font-semibold text-rose-600 uppercase">公司总支出</span><div className="text-xl md:text-2xl font-black text-rose-600 mt-1">{formatMoney(stats.totalExpense)}</div><span className="text-[11px] text-slate-500 mt-1 block">共计 {stats.expenseCount} 笔</span></div>
            <div className={`p-4 rounded-xl border ${netProfit >= 0 ? 'bg-emerald-50/60 border-emerald-200' : 'bg-amber-50 border-amber-200'}`}><span className={`text-xs font-bold uppercase ${netProfit >= 0 ? 'text-emerald-700' : 'text-amber-700'}`}>实际净利润</span><div className={`text-xl md:text-2xl font-black mt-1 ${netProfit >= 0 ? 'text-emerald-700' : 'text-amber-700'}`}>{formatMoney(netProfit)}</div><span className="text-[11px] text-slate-500 mt-1 block">公式: 实收 - 总支出</span></div>
            <div className="p-4 rounded-xl bg-amber-50/40 border border-amber-200/60"><span className="text-xs font-semibold text-amber-700 uppercase">待收客户尾款</span><div className="text-xl md:text-2xl font-black text-amber-600 mt-1">{formatMoney(stats.unpaidRevenue)}</div><span className="text-[11px] text-slate-500 mt-1 block">未收回订单挂账</span></div>
          </div>
        </section>

        {/* 列表区 */}
        <section className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
          <div className="p-4 md:p-5 border-b border-slate-100 flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-slate-50/30">
            <div className="flex items-center space-x-2 bg-slate-200/70 p-1 rounded-xl">
              <button onClick={() => { setActiveTab('income'); setSearchTerm(''); }} className={`px-4 py-2 rounded-lg text-xs md:text-sm font-bold ${activeTab === 'income' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-600 hover:text-slate-900'}`}>📦 客户订单 ({filteredOrders.length})</button>
              <button onClick={() => { setActiveTab('expense'); setSearchTerm(''); }} className={`px-4 py-2 rounded-lg text-xs md:text-sm font-bold ${activeTab === 'expense' ? 'bg-white text-rose-600 shadow-sm' : 'text-slate-600 hover:text-slate-900'}`}>💸 公司支出 ({filteredExpenses.length})</button>
            </div>
            
            <div className="flex flex-wrap items-center gap-2.5 w-full md:w-auto">
              <input type="text" placeholder="搜索内容/客户..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="px-3 py-1.5 border rounded-lg text-xs md:text-sm w-full md:w-44 focus:ring-2 focus:ring-blue-500 bg-white" />
              {activeTab === 'income' ? (
                <>
                  <select value={customerTypeFilter} onChange={(e) => { setCustomerTypeFilter(e.target.value); setVipGroupFilter('全部'); }} className="px-2 py-1.5 border rounded-lg text-xs font-bold bg-white text-blue-700">
                    <option value="全部">全部层级</option>
                    <option value="普通客户">普通客户</option>
                    <option value="高级客户">高级客户 (指定单位)</option>
                  </select>
                  {customerTypeFilter === '高级客户' && (
                    <select value={vipGroupFilter} onChange={(e) => setVipGroupFilter(e.target.value)} className="px-2 py-1.5 border-amber-200 rounded-lg text-xs font-bold bg-amber-50 text-amber-700">
                      <option value="全部">所有高级单位</option>
                      {vipGroups.map(grp => <option key={grp} value={grp}>{grp}</option>)}
                    </select>
                  )}
                  <div className="flex bg-slate-100 p-0.5 rounded-lg text-xs font-medium">
                    {['全部', '待结清', '已结清'].map((st) => <button key={st} onClick={() => setStatusFilter(st)} className={`px-2.5 py-1.5 rounded-md ${statusFilter === st ? 'bg-white text-blue-600 shadow-sm font-bold' : 'text-slate-600'}`}>{st}</button>)}
                  </div>
                </>
              ) : (
                <select value={expenseCatFilter} onChange={(e) => setExpenseCatFilter(e.target.value)} className="px-2.5 py-1.5 border rounded-lg text-xs font-medium bg-white">
                  <option value="全部">全部类别</option>
                  {expenseCategories.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              )}
              <button onClick={exportToExcel} className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs md:text-sm font-semibold rounded-lg shadow-sm">📊 导出报表</button>
            </div>
          </div>

          {/* 收入表格 */}
          {activeTab === 'income' && (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="bg-slate-50/75 text-slate-500 text-xs font-semibold uppercase border-b border-slate-100">
                  <tr><th className="p-4">时间/类型</th><th className="p-4">名称与内容</th><th className="p-4">规格</th><th className="p-4">单价×数量</th><th className="p-4">总额/欠款</th><th className="p-4">结账状态</th><th className="p-4 text-center">操作</th></tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {loading ? <tr><td colSpan="7" className="p-8 text-center text-slate-400">正在与数据库同步...</td></tr> : filteredOrders.length === 0 ? <tr><td colSpan="7" className="p-8 text-center text-slate-400">暂无订单记录</td></tr> : 
                    filteredOrders.map((order) => {
                      const unpaid = Math.max(0, order.total_amount - order.deposit_amount);
                      return (
                        <tr key={order.id} className="hover:bg-slate-50/60">
                          <td className="p-4 whitespace-nowrap"><div className="font-semibold">{order.order_date}</div><div className="text-xs mt-1">{order.customer_type === '高级客户' ? <span className="text-amber-600 font-bold">[{order.vip_group}]</span> : <span className="text-slate-500">普通客户</span>}</div></td>
                          <td className="p-4"><div className="font-bold text-slate-900">{order.material} {order.customer_name && `(${order.customer_name})`}</div><div className="text-xs text-slate-500 mt-0.5 max-w-[200px] truncate" title={order.content}>{order.content || '-'}</div></td>
                          <td className="p-4 text-slate-600">{order.specs || '-'}</td>
                          <td className="p-4 text-slate-700">¥{order.unit_price || 0} × <span className="font-bold">{order.quantity || 1}</span></td>
                          <td className="p-4 whitespace-nowrap"><div className="font-bold text-slate-900">{formatMoney(order.total_amount)}</div>{unpaid > 0 && <div className="text-xs text-rose-600 mt-1 font-medium">欠: {formatMoney(unpaid)}</div>}</td>
                          <td className="p-4"><span className={`px-2 py-0.5 rounded text-xs font-medium ${order.payment_status === '已结清' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-rose-50 text-rose-700 border-rose-200 border'}`}>{order.payment_status}</span></td>
                          <td className="p-4 text-center whitespace-nowrap space-x-2">
                            {unpaid > 0 && <button onClick={() => handleQuickSettle(order)} className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded text-xs font-medium">收尾款</button>}
                            <button onClick={() => handleDeleteOrder(order.id)} className="text-slate-400 hover:text-rose-600 text-xs">删除</button>
                          </td>
                        </tr>
                      );
                    })
                  }
                </tbody>
              </table>
            </div>
          )}
          
          {/* 支出表格 */}
          {activeTab === 'expense' && (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="bg-rose-50/60 text-rose-800 text-xs font-semibold uppercase border-b border-rose-100">
                  <tr><th className="p-4">支出日期</th><th className="p-4">分类</th><th className="p-4">金额</th><th className="p-4">收款方</th><th className="p-4">备注</th><th className="p-4 text-center">操作</th></tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredExpenses.map(exp => (
                    <tr key={exp.id} className="hover:bg-rose-50/20">
                      <td className="p-4 whitespace-nowrap">{exp.expense_date}</td>
                      <td className="p-4"><span className="px-2 py-1 bg-rose-50 text-rose-700 rounded text-xs font-bold border-rose-100 border">{exp.category}</span></td>
                      <td className="p-4 font-extrabold text-rose-600">{formatMoney(exp.amount)}</td>
                      <td className="p-4 font-semibold">{exp.payee || '-'}</td>
                      <td className="p-4 text-slate-600">{exp.notes || '-'}</td>
                      <td className="p-4 text-center"><button onClick={() => handleDeleteExpense(exp.id)} className="text-slate-400 hover:text-rose-600 text-xs">删除</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>

      {/* ======================= 基础设置面板 ======================= */}
      {isSettingsModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm">
          <div className="bg-white w-full max-w-xl rounded-2xl shadow-2xl border border-slate-100 overflow-hidden flex flex-col max-h-[85vh]">
            <div className="p-5 border-b border-slate-100 flex justify-between items-center bg-slate-800 text-white">
              <h3 className="font-bold text-lg flex items-center space-x-2"><span>⚙️ 基础配置面板</span></h3>
              <button onClick={() => setIsSettingsModalOpen(false)} className="text-slate-300 hover:text-white text-xl">✕</button>
            </div>
            
            <div className="flex border-b border-slate-100 bg-slate-50">
              <button onClick={() => setSettingsTab('groups')} className={`flex-1 py-3 text-sm font-bold ${settingsTab === 'groups' ? 'text-blue-600 bg-white border-b-2 border-blue-600' : 'text-slate-500'}`}>客户分组</button>
              <button onClick={() => setSettingsTab('materials')} className={`flex-1 py-3 text-sm font-bold ${settingsTab === 'materials' ? 'text-blue-600 bg-white border-b-2 border-blue-600' : 'text-slate-500'}`}>品版材质</button>
              <button onClick={() => setSettingsTab('expenses')} className={`flex-1 py-3 text-sm font-bold ${settingsTab === 'expenses' ? 'text-rose-600 bg-white border-b-2 border-rose-600' : 'text-slate-500'}`}>支出类别</button>
            </div>

            <div className="p-5 flex-1 overflow-y-auto bg-slate-50/50">
              <form onSubmit={handleAddSetting} className="flex space-x-2 mb-6">
                <input required type="text" value={newSettingInput} onChange={e => setNewSettingInput(e.target.value)} 
                  placeholder={
                    settingsTab === 'groups' ? '输入新客户单位名称...' : 
                    settingsTab === 'materials' ? '输入新品版材质...' : 
                    '输入新支出类别(如: 快递费)...'
                  } 
                  className="flex-1 px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none" 
                />
                <button type="submit" className={`px-4 py-2 text-white text-sm font-bold rounded-lg ${settingsTab === 'expenses' ? 'bg-rose-600 hover:bg-rose-700' : 'bg-slate-800 hover:bg-slate-900'}`}>添加</button>
              </form>

              <div className="space-y-2">
                <div className="text-xs font-bold text-slate-500 uppercase px-1 mb-2">当前列表 (点击操作)</div>
                {(settingsTab === 'groups' ? vipGroups : settingsTab === 'materials' ? materials : expenseCategories).map(item => (
                  <div key={item} className={`flex justify-between items-center bg-white p-3 border rounded-xl shadow-sm transition-colors ${settingsTab === 'expenses' ? 'hover:border-rose-200' : 'hover:border-blue-200'}`}>
                    <span className="font-semibold text-sm text-slate-800">{item}</span>
                    <div className="space-x-2">
                      <button onClick={() => handleEditSetting(item, settingsTab)} className={`px-2.5 py-1 rounded text-xs font-medium ${settingsTab === 'expenses' ? 'bg-rose-50 text-rose-600 hover:bg-rose-100' : 'bg-blue-50 text-blue-600 hover:bg-blue-100'}`}>改名</button>
                      <button onClick={() => handleDeleteSetting(item, settingsTab)} className="px-2.5 py-1 bg-slate-100 text-slate-600 rounded text-xs font-medium hover:bg-slate-200">删除</button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 记收入弹窗 */}
      {isOrderModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm">
          <div className="bg-white w-full max-w-2xl rounded-2xl shadow-2xl border flex flex-col max-h-[90vh]">
            <div className="p-5 border-b flex justify-between items-center bg-blue-50/50">
              <h3 className="font-bold text-blue-900 text-lg">✏️ 新建记账单 (收入)</h3>
              <button onClick={() => setIsOrderModalOpen(false)} className="text-slate-400 hover:text-slate-600">✕</button>
            </div>
            
            <form onSubmit={handleOrderSubmit} className="p-6 space-y-4 overflow-y-auto">
              <div className="p-4 bg-slate-50 border rounded-xl space-y-3">
                <div className="flex items-center gap-6">
                  <label className="text-sm font-bold text-slate-700">客户归属类别：</label>
                  <div className="flex gap-4">
                    <label className="flex items-center gap-1.5 cursor-pointer">
                      <input type="radio" checked={orderFormData.customer_type === '普通客户'} onChange={() => setOrderFormData({...orderFormData, customer_type: '普通客户', vip_group: ''})} className="w-4 h-4 text-blue-600" />
                      <span className="text-sm font-medium">普通客户 (散户)</span>
                    </label>
                    <label className="flex items-center gap-1.5 cursor-pointer">
                      <input type="radio" checked={orderFormData.customer_type === '高级客户'} onChange={() => setOrderFormData({...orderFormData, customer_type: '高级客户', vip_group: vipGroups[0] || ''})} className="w-4 h-4 text-blue-600" />
                      <span className="text-sm font-bold text-amber-600">高级客户 (对公/单位)</span>
                    </label>
                  </div>
                </div>
                {orderFormData.customer_type === '高级客户' && (
                  <select required value={orderFormData.vip_group} onChange={e => setOrderFormData({...orderFormData, vip_group: e.target.value})} className="w-full p-2 border rounded-lg text-sm bg-white font-bold text-blue-700 outline-none">
                    <option value="">-- 请选择所属高级单位分组 --</option>
                    {vipGroups.map(grp => <option key={grp} value={grp}>{grp}</option>)}
                  </select>
                )}
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div><label className="text-xs font-bold text-slate-700 mb-1 block">订单日期 *</label><input required type="date" value={orderFormData.order_date} onChange={e => setOrderFormData({...orderFormData, order_date: e.target.value})} className="w-full px-3 py-2 border rounded-lg text-sm" /></div>
                <div><label className="text-xs font-bold text-slate-700 mb-1 block">客户姓名 (选填/Excel备注)</label><input type="text" value={orderFormData.customer_name} onChange={e => setOrderFormData({...orderFormData, customer_name: e.target.value})} placeholder="输入姓名..." className="w-full px-3 py-2 border rounded-lg text-sm" /></div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-bold text-slate-700 mb-1 block">名称 (品版材质) *</label>
                  <select value={orderFormData.material} onChange={e => setOrderFormData({...orderFormData, material: e.target.value})} className="w-full px-3 py-2 border rounded-lg text-sm bg-white font-bold outline-none">
                    {materials.map(m => <option key={m} value={m}>{m}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs font-bold text-slate-700 mb-1 block">规格 (尺寸/纸张) *</label>
                  {orderFormData.material.includes('打印') ? (
                    <select value={orderFormData.specs} onChange={e => setOrderFormData({...orderFormData, specs: e.target.value})} className="w-full px-3 py-2 border rounded-lg text-sm bg-white"><option value="">默认</option>{PRINT_SPECS.map(s => <option key={s} value={s}>{s}</option>)}</select>
                  ) : <input type="text" value={orderFormData.specs} onChange={e => setOrderFormData({...orderFormData, specs: e.target.value})} placeholder="如 3m × 2m" className="w-full px-3 py-2 border rounded-lg text-sm" />}
                </div>
              </div>

              <div><label className="text-xs font-bold text-blue-700 mb-1 block">内容 (业务具体说明) (选填)</label><input type="text" value={orderFormData.content} onChange={e => setOrderFormData({...orderFormData, content: e.target.value})} placeholder="例如：农村集体经济组织成员变动表..." className="w-full px-3 py-2 border-2 border-blue-100 rounded-lg text-sm focus:border-blue-500 outline-none" /></div>

              <div className="flex gap-3 bg-slate-100 p-1.5 rounded-lg w-max">
                <button type="button" onClick={() => setPricingMode('fixed')} className={`px-3 py-1 text-xs font-bold rounded ${pricingMode === 'fixed' ? 'bg-white shadow text-blue-600' : 'text-slate-500'}`}>常规填价计算</button>
                <button type="button" onClick={() => setPricingMode('area')} className={`px-3 py-1 text-xs font-bold rounded ${pricingMode === 'area' ? 'bg-white shadow text-blue-600' : 'text-slate-500'}`}>广告面积算料</button>
              </div>

              {pricingMode === 'area' && (
                <div className="grid grid-cols-4 gap-2 bg-blue-50 p-3 rounded-xl border"><input type="number" step="0.01" placeholder="长(米)" value={calcData.length} onChange={e => setCalcData({...calcData, length: e.target.value})} className="p-1.5 border rounded text-xs" /><input type="number" step="0.01" placeholder="宽(米)" value={calcData.width} onChange={e => setCalcData({...calcData, width: e.target.value})} className="p-1.5 border rounded text-xs" /><input type="number" placeholder="数量" value={calcData.quantity} onChange={e => setCalcData({...calcData, quantity: e.target.value})} className="p-1.5 border rounded text-xs" /><input type="number" step="0.1" placeholder="单价(㎡)" value={calcData.unitPrice} onChange={e => setCalcData({...calcData, unitPrice: e.target.value})} className="p-1.5 border rounded text-xs" /></div>
              )}

              <div className="grid grid-cols-3 gap-4 border-t pt-3">
                <div><label className="text-xs font-bold text-slate-700 mb-1 block">数量 *</label><input required type="number" step="0.01" value={orderFormData.quantity} onChange={e => setOrderFormData({...orderFormData, quantity: e.target.value})} className="w-full px-3 py-2 border rounded-lg text-sm font-bold bg-slate-50 outline-none" /></div>
                <div><label className="text-xs font-bold text-slate-700 mb-1 block">单价 (元) *</label><input required type="number" step="0.01" value={orderFormData.unit_price} onChange={e => setOrderFormData({...orderFormData, unit_price: e.target.value})} className="w-full px-3 py-2 border rounded-lg text-sm font-bold bg-slate-50 outline-none" /></div>
                <div><label className="text-xs font-bold text-rose-600 mb-1 block">总金额 (元) *</label><input required type="number" step="0.01" value={orderFormData.total_amount} onChange={e => setOrderFormData({...orderFormData, total_amount: e.target.value})} className="w-full px-3 py-2 border-2 border-rose-200 rounded-lg text-sm font-extrabold text-rose-600 outline-none" /></div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div><label className="text-xs font-bold text-slate-700 mb-1 block">已付定金/全款</label><input type="number" step="0.01" value={orderFormData.deposit_amount} onChange={e => setOrderFormData({...orderFormData, deposit_amount: e.target.value})} className="w-full px-3 py-2 border rounded-lg text-sm text-emerald-600 font-bold outline-none" /></div>
                <div><label className="text-xs font-bold text-slate-700 mb-1 block">备注说明</label><input type="text" value={orderFormData.notes} onChange={e => setOrderFormData({...orderFormData, notes: e.target.value})} className="w-full px-3 py-2 border rounded-lg text-sm outline-none" /></div>
              </div>

              <div className="pt-4 flex justify-end space-x-3 border-t mt-2">
                <button type="button" onClick={() => setIsOrderModalOpen(false)} className="px-5 py-2 border rounded-xl text-sm font-medium hover:bg-slate-50">取消</button>
                <button type="submit" className="px-8 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-sm font-bold shadow-md">保存记录</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 记支出弹窗 */}
      {isExpenseModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm">
          <div className="bg-white w-full max-w-lg rounded-2xl shadow-2xl border flex flex-col max-h-[90vh]">
             <div className="p-5 border-b flex justify-between items-center bg-rose-50/50"><h3 className="font-bold text-rose-900 text-lg">记一笔公司支出</h3><button onClick={() => setIsExpenseModalOpen(false)} className="text-slate-400 hover:text-slate-600">✕</button></div>
             <form onSubmit={handleExpenseSubmit} className="p-6 space-y-4 overflow-y-auto">
                <div className="grid grid-cols-2 gap-4">
                  <div><label className="text-xs font-bold block mb-1">日期 *</label><input required type="date" value={expenseFormData.expense_date} onChange={e => setExpenseFormData({...expenseFormData, expense_date: e.target.value})} className="w-full p-2 border rounded-lg text-sm" /></div>
                  <div>
                    <label className="text-xs font-bold block mb-1">类别 *</label>
                    <select value={expenseFormData.category} onChange={e => setExpenseFormData({...expenseFormData, category: e.target.value})} className="w-full p-2 border rounded-lg text-sm bg-white outline-none">
                      {expenseCategories.map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div><label className="text-xs font-bold block mb-1">金额 (元) *</label><input required type="number" step="0.01" value={expenseFormData.amount} onChange={e => setExpenseFormData({...expenseFormData, amount: e.target.value})} className="w-full p-2 border rounded-lg text-sm text-rose-600 font-bold outline-none" /></div>
                  <div><label className="text-xs font-bold block mb-1">支付方式</label><select value={expenseFormData.payment_method} onChange={e => setExpenseFormData({...expenseFormData, payment_method: e.target.value})} className="w-full p-2 border rounded-lg text-sm bg-white outline-none">{PAYMENT_METHODS.map(m => <option key={m} value={m}>{m}</option>)}</select></div>
                </div>
                <div><label className="text-xs font-bold block mb-1">收款方 / 人员</label><input type="text" value={expenseFormData.payee} onChange={e => setExpenseFormData({...expenseFormData, payee: e.target.value})} className="w-full p-2 border rounded-lg text-sm outline-none" /></div>
                <div><label className="text-xs font-bold block mb-1">备注说明</label><input type="text" value={expenseFormData.notes} onChange={e => setExpenseFormData({...expenseFormData, notes: e.target.value})} className="w-full p-2 border rounded-lg text-sm outline-none" /></div>
                <div className="flex justify-end pt-4 border-t space-x-3"><button type="button" onClick={() => setIsExpenseModalOpen(false)} className="px-4 py-2 border rounded-xl text-sm font-medium hover:bg-slate-50">取消</button><button type="submit" className="px-6 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-sm font-bold shadow-md">保存支出</button></div>
             </form>
          </div>
        </div>
      )}
    </div>
  );
}