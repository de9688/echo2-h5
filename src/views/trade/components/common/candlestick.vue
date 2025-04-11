<template>
  <div class="candlestick-container" ref="chartContainer">
    <div class="chart-wrapper" v-show="!isLoading">
      <div id="tv_chart_container" ref="tvChartRef"></div>
    </div>
    <!-- 加载状态显示 -->
    <div v-if="isLoading" class="loading-overlay">
      <van-loading type="spinner" color="#7986CB" size="24px" />
      <span class="loading-text">{{ $t('common.loading') }}</span>
    </div>
    <!-- 错误状态显示 -->
    <div v-if="showError" class="error-overlay">
      <span class="error-text">{{ errorMessage }}</span>
      <van-button size="small" type="primary" @click="initChart">{{ $t('common.retry') }}</van-button>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, onBeforeUnmount, watch, nextTick } from 'vue'
import { useTradeStore } from '@/store/trade'
import { useLangStore } from '@/store/lang'
import { fetchKlineHistory } from '@/api/market'
import { formatDate } from '@/utils/public'
import { debounce } from 'lodash'

// 组件属性定义
const props = defineProps({
  // 交易对名称
  symbol: {
    type: String,
    default: ''
  },
  // K线周期，如1m, 5m, 15m等
  currentKlineKey: {
    type: String,
    default: ''
  }
})

// 组件状态引用
const chartContainer = ref(null) // 图表容器元素
const tvChartRef = ref(null)     // 图表绘制区域元素
const isLoading = ref(true)      // 加载状态
const showError = ref(false)     // 错误状态
const errorMessage = ref('')     // 错误信息

// 状态管理
const tradeStore = useTradeStore() // 交易数据存储
const langStore = useLangStore()   // 语言设置存储

// 内部变量
let tvWidget = null        // TradingView小部件
let chart = null           // 轻量级图表实例
let candleSeries = null    // 蜡烛图系列
let volumeSeries = null    // 成交量系列
let resizeObserver = null  // 尺寸变化观察器
let klineInterval = null   // K线定时更新定时器
let lastUpdateTime = 0     // 最后更新时间戳
let chartLib = null        // 图表库引用

/**
 * 清除页面上已存在的图表库脚本
 * 避免多个版本冲突
 */
const removeExistingChartLibraries = () => {
  console.log('【K线排查】清除已有图表库引用')
  const existingScripts = document.querySelectorAll('script[src*="lightweight-charts"]')
  existingScripts.forEach(script => script.remove())
}

/**
 * 初始化图表
 * 负责加载图表库并创建图表实例
 */
const initChart = async () => {
  console.log('【K线排查】开始初始化图表')
  isLoading.value = true
  showError.value = false
  
  try {
    // 等待DOM更新完成
    await nextTick()
    
    // 确保DOM元素已加载
    if (!tvChartRef.value || !chartContainer.value) {
      console.log('【K线排查】DOM元素未准备好，300ms后重试')
      setTimeout(initChart, 300)
      return
    }
    
    // 清除旧图表
    cleanupChart()
    
    // 加载轻量级图表库 - 使用3.8.0版本
    try {
      console.log('【K线排查】加载轻量级图表库')
      removeExistingChartLibraries()
      
      // 使用固定版本3.8.0，确保API稳定性
      await loadChartLibrary('https://unpkg.com/lightweight-charts@3.8.0/dist/lightweight-charts.standalone.production.js')
      
      // 确认图表库加载成功
      chartLib = window.LightweightCharts
      if (!chartLib) {
        throw new Error('图表库加载失败')
      }
      
      console.log('【K线排查】图表库加载成功，开始创建图表')
      
      // 创建轻量级图表
      await createChart()
      
      // 启动定时更新
      startKlinePolling()
      
      console.log('【K线排查】图表初始化完成')
    } catch (err) {
      console.error('【K线排查】轻量级图表初始化失败，尝试使用TradingView:', err)
      
      // 如果TradingView可用，则使用TradingView
      if (window.TradingView) {
        initTradingViewWidget()
      } else {
        throw err
      }
    }
  } catch (err) {
    console.error('【K线排查】图表初始化失败:', err)
    displayErrorMessage('图表初始化失败: ' + err.message)
  }
}

/**
 * 加载图表库
 * @param {string} url 图表库URL
 * @returns {Promise} 加载结果Promise
 */
const loadChartLibrary = (url) => {
  return new Promise((resolve, reject) => {
    const script = document.createElement('script')
    script.src = url
    script.async = true
    
    script.onload = () => {
      console.log('【K线排查】图表库脚本加载成功')
      resolve()
    }
    
    script.onerror = () => {
      console.error('【K线排查】图表库脚本加载失败')
      reject(new Error('图表库脚本加载失败'))
    }
    
    document.head.appendChild(script)
  })
}

/**
 * 创建轻量级图表
 * 包括图表实例和数据序列的创建
 */
const createChart = async () => {
  try {
    // 创建图表实例
    const { createChart } = chartLib
    
    // 图表配置
    const chartOptions = {
      width: chartContainer.value.clientWidth,
      height: chartContainer.value.clientHeight,
      layout: {
        backgroundColor: '#151924',
        textColor: '#D9D9D9',
      },
      grid: {
        vertLines: { color: '#1E2230' },
        horzLines: { color: '#1E2230' },
      },
      crosshair: {
        mode: 0, // CrosshairMode.Normal
      },
      timeScale: {
        borderColor: '#1E2230',
        timeVisible: true,
        secondsVisible: false,
      },
      rightPriceScale: {
        borderColor: '#1E2230',
      },
      handleScroll: true,
      handleScale: true,
    }
    
    console.log('【K线排查】创建图表实例')
    chart = createChart(tvChartRef.value, chartOptions)
    
    // 创建蜡烛图系列
    console.log('【K线排查】创建蜡烛图系列')
    candleSeries = chart.addCandlestickSeries({
      upColor: '#26A69A',
      downColor: '#EF5350',
      borderUpColor: '#26A69A',
      borderDownColor: '#EF5350',
      wickUpColor: '#26A69A',
      wickDownColor: '#EF5350',
    })
    
    // 创建成交量系列
    console.log('【K线排查】创建成交量系列')
    volumeSeries = chart.addHistogramSeries({
      color: '#26A69A',
      priceFormat: {
        type: 'volume',
      },
      priceScaleId: 'volume',
      scaleMargins: {
        top: 0.8,
        bottom: 0,
      },
    })
    
    // 设置成交量缩放
    chart.priceScale('volume').applyOptions({
      scaleMargins: {
        top: 0.8,
        bottom: 0,
      },
    })
    
    // 设置图表尺寸响应
    setupResizeHandling()
    
    // 加载历史数据
    await loadKlineData()
    
    // 加载完成
    isLoading.value = false
    
    return true
  } catch (error) {
    console.error('【K线排查】创建图表失败:', error)
    throw error
  }
}

/**
 * 设置图表尺寸响应
 * 处理容器大小变化
 */
const setupResizeHandling = () => {
  // 尺寸调整处理函数
  const handleResize = () => {
    if (!chartContainer.value || !chart) return
    
    const width = chartContainer.value.clientWidth
    const height = chartContainer.value.clientHeight
    
    console.log('【K线排查】调整图表尺寸', { width, height })
    chart.resize(width, height)
  }
  
  // 初始调整尺寸
  handleResize()
  
  // 添加尺寸观察器
  if (resizeObserver) {
    resizeObserver.disconnect()
  }
  
  // 使用防抖避免频繁调整
  resizeObserver = new ResizeObserver(debounce(handleResize, 200))
  resizeObserver.observe(chartContainer.value)
}

/**
 * 显示错误信息
 * @param {string} message 错误消息
 */
const displayErrorMessage = (message) => {
  isLoading.value = false
  showError.value = true
  errorMessage.value = message || '加载图表失败，请重试'
  console.error('【K线排查】错误:', message)
}

/**
 * 初始化TradingView图表小部件
 * 当轻量级图表不可用时使用
 */
const initTradingViewWidget = () => {
  if (tvWidget) {
    tvWidget.remove()
    tvWidget = null
  }
  
  console.log('【K线排查】初始化TradingView图表')
  
  const widgetOptions = {
    symbol: props.symbol,
    interval: getTimeFrameValue(),
    container: tvChartRef.value,
    library_path: '/charting_library/',
    locale: langStore.locale === 'zh-CN' ? 'zh' : 'en',
    datafeed: {
      onReady: (callback) => {
        callback({
          supported_resolutions: ['1', '5', '15', '30', '60', '240', '1D', '1W', '1M'],
          supports_time: true,
          supports_marks: false,
          supports_timescale_marks: false,
        })
      },
      resolveSymbol: (symbolName, onSymbolResolvedCallback) => {
        onSymbolResolvedCallback({
          name: symbolName,
          ticker: symbolName,
          description: symbolName,
          type: 'crypto',
          session: '24x7',
          timezone: 'Etc/UTC',
          exchange: '',
          minmov: 1,
          pricescale: 100000,
          has_intraday: true,
          intraday_multipliers: ['1', '5', '15', '30', '60', '240'],
          has_daily: true,
          has_weekly_and_monthly: true,
          supported_resolutions: ['1', '5', '15', '30', '60', '240', '1D', '1W', '1M'],
          volume_precision: 8,
          data_status: 'streaming',
        })
      },
      getBars: async (symbolInfo, resolution, from, to, onHistoryCallback) => {
        try {
          const klines = await fetchKlineHistory({
            symbol: props.symbol,
            interval: resolution,
            from: from * 1000,
            to: to * 1000,
            limit: 1000
          })
          
          if (klines && klines.length > 0) {
            const bars = klines.map(kline => ({
              time: kline[0],
              open: parseFloat(kline[1]),
              high: parseFloat(kline[2]),
              low: parseFloat(kline[3]),
              close: parseFloat(kline[4]),
              volume: parseFloat(kline[5])
            }))
            onHistoryCallback(bars, { noData: false })
          } else {
            onHistoryCallback([], { noData: true })
          }
        } catch (error) {
          console.error('【K线排查】获取K线数据失败:', error)
          onHistoryCallback([], { noData: true })
        }
      },
      subscribeBars: (symbolInfo, resolution, onRealtimeCallback, subscribeUID) => {
        // 在轮询机制中处理实时数据
      },
      unsubscribeBars: () => {
        // 清理订阅
      }
    },
    fullscreen: false,
    autosize: true,
    theme: 'Dark',
  }
  
  tvWidget = new window.TradingView.widget(widgetOptions)
  tvWidget.onChartReady(() => {
    isLoading.value = false
    console.log('【K线排查】TradingView图表准备完成')
  })
}

/**
 * 加载K线历史数据
 * 获取并设置K线和成交量数据
 */
const loadKlineData = async () => {
  if (!props.symbol || !candleSeries) {
    console.log('【K线排查】无法加载K线数据，缺少必要条件', {
      hasSymbol: !!props.symbol,
      hasCandleSeries: !!candleSeries
    })
    return
  }
  
  try {
    console.log('【K线排查】开始加载K线数据')
    const interval = getTimeFrameValue()
    const endTime = Date.now()
    // 获取30天数据
    const startTime = endTime - 30 * 24 * 60 * 60 * 1000
    
    const klines = await fetchKlineHistory({
      symbol: props.symbol,
      interval: interval,
      from: startTime,
      to: endTime,
      limit: 1000
    })
    
    if (!klines || klines.length === 0) {
      console.warn('【K线排查】未获取到K线数据')
      return
    }
    
    console.log('【K线排查】成功获取K线数据', { count: klines.length })
    
    // 转换为图表库需要的格式
    const candleData = klines.map(kline => ({
      // 使用整数时间戳
      time: Math.floor(kline[0] / 1000),
      open: parseFloat(kline[1]),
      high: parseFloat(kline[2]),
      low: parseFloat(kline[3]),
      close: parseFloat(kline[4]),
      volume: parseFloat(kline[5])
    }))
    
    // 转换成交量数据
    const volumeData = klines.map(kline => ({
      time: Math.floor(kline[0] / 1000),
      value: parseFloat(kline[5]),
      // 根据涨跌设置颜色
      color: parseFloat(kline[4]) >= parseFloat(kline[1]) ? '#26A69A' : '#EF5350'
    }))
    
    // 设置蜡烛图数据
    console.log('【K线排查】设置K线数据')
    candleSeries.setData(candleData)
    
    // 设置成交量数据
    console.log('【K线排查】设置成交量数据')
    volumeSeries.setData(volumeData)
    
    // 记录最后更新时间
    if (candleData.length > 0) {
      lastUpdateTime = candleData[candleData.length - 1].time * 1000
    }
    
    console.log('【K线排查】K线数据设置完成')
  } catch (error) {
    console.error('【K线排查】加载K线数据失败:', error)
  }
}

/**
 * 更新K线数据
 * 获取并更新最新的K线和成交量数据
 */
const updateKlineData = async () => {
  if (!props.symbol || !candleSeries) {
    return
  }
  
  try {
    const interval = getTimeFrameValue()
    const endTime = Date.now()
    const startTime = lastUpdateTime ? lastUpdateTime : endTime - 24 * 60 * 60 * 1000
    
    console.log('【K线排查】更新K线数据', { interval, symbol: props.symbol })
    
    const klines = await fetchKlineHistory({
      symbol: props.symbol,
      interval: interval,
      from: startTime,
      to: endTime,
      limit: 100
    })
    
    if (!klines || klines.length === 0) {
      return
    }
    
    console.log('【K线排查】成功获取更新数据', { count: klines.length })
    
    // 更新每根K线
    for (const kline of klines) {
      const time = Math.floor(kline[0] / 1000)
      const open = parseFloat(kline[1])
      const high = parseFloat(kline[2])
      const low = parseFloat(kline[3])
      const close = parseFloat(kline[4])
      const volume = parseFloat(kline[5])
      
      // 更新蜡烛图
      candleSeries.update({
        time,
        open,
        high,
        low,
        close
      })
      
      // 更新成交量图
      volumeSeries.update({
        time,
        value: volume,
        color: close >= open ? '#26A69A' : '#EF5350'
      })
    }
    
    // 更新最后更新时间
    const lastKline = klines[klines.length - 1]
    lastUpdateTime = lastKline[0]
  } catch (error) {
    console.error('【K线排查】更新K线数据失败:', error)
  }
}

/**
 * 启动K线定时更新
 * 定期获取最新数据
 */
const startKlinePolling = () => {
  if (klineInterval) {
    clearInterval(klineInterval)
  }
  
  console.log('【K线排查】启动K线数据轮询')
  
  // 10秒更新一次
  klineInterval = setInterval(() => {
    updateKlineData()
  }, 10000)
}

/**
 * 清理图表资源
 * 释放内存和取消事件监听
 */
const cleanupChart = () => {
  console.log('【K线排查】清理图表资源')
  
  // 移除定时器
  if (klineInterval) {
    clearInterval(klineInterval)
    klineInterval = null
  }
  
  // 取消大小观察
  if (resizeObserver) {
    resizeObserver.disconnect()
    resizeObserver = null
  }
  
  // 移除图表
  if (chart) {
    try {
      chart.remove()
    } catch (e) {
      console.error('【K线排查】移除图表失败', e)
    }
    chart = null
    candleSeries = null
    volumeSeries = null
  }
  
  // 移除TradingView小部件
  if (tvWidget) {
    try {
      tvWidget.remove()
    } catch (e) {
      console.error('【K线排查】移除TradingView失败', e)
    }
    tvWidget = null
  }
}

/**
 * 获取时间周期值
 * 转换K线周期为API需要的格式
 * @returns {string} 格式化的时间周期值
 */
const getTimeFrameValue = () => {
  const mapping = {
    '1m': '1',
    '5m': '5',
    '15m': '15',
    '30m': '30',
    '1h': '60',
    '4h': '240',
    '1d': '1D',
    '1w': '1W',
    '1M': '1M'
  }
  return mapping[props.currentKlineKey] || '15'
}

// 监听交易对变化
watch(() => props.symbol, () => {
  console.log('【K线排查】交易对变更', { newSymbol: props.symbol })
  initChart()
}, { immediate: false })

// 监听K线周期变化
watch(() => props.currentKlineKey, () => {
  console.log('【K线排查】K线周期变更', { newPeriod: props.currentKlineKey })
  initChart()
}, { immediate: false })

// 组件挂载时初始化
onMounted(() => {
  console.log('【K线排查】组件挂载，开始初始化')
  initChart()
})

// 组件卸载前清理资源
onBeforeUnmount(() => {
  console.log('【K线排查】组件卸载，清理资源')
  cleanupChart()
})
</script>

<style scoped>
.candlestick-container {
  position: relative;
  width: 100%;
  height: 100%;
  overflow: hidden;
  background-color: #151924;
}

.chart-wrapper {
  width: 100%;
  height: 100%;
}

#tv_chart_container {
  height: 100%;
  width: 100%;
}

.loading-overlay, .error-overlay {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  background-color: rgba(21, 25, 36, 0.9);
  z-index: 10;
}

.loading-text, .error-text {
  margin-top: 10px;
  font-size: 14px;
  color: #D9D9D9;
}

.error-text {
  margin-bottom: 10px;
}
</style>