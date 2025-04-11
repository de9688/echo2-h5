<template>
  <div class="candlestick-container" ref="chartContainer">
    <div class="chart-wrapper" v-show="!isLoading">
      <div id="tv_chart_container" ref="tvChartRef"></div>
    </div>
    <div v-if="isLoading" class="loading-overlay">
      <van-loading type="spinner" color="#7986CB" size="24px" />
      <span class="loading-text">{{ $t('common.loading') }}</span>
    </div>
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

const props = defineProps({
  symbol: {
    type: String,
    default: ''
  },
  currentKlineKey: {
    type: String,
    default: ''
  }
})

const chartContainer = ref(null)
const tvChartRef = ref(null)
const isLoading = ref(true)
const showError = ref(false)
const errorMessage = ref('')
const tradeStore = useTradeStore()
const langStore = useLangStore()

let tvWidget = null
let chart = null
let candleSeries = null
let volumeSeries = null
let resizeObserver = null
let klineInterval = null
let lastUpdateTime = 0
let isLightweightMode = false

// 清除已有的图表库引用
const removeExistingChartLibraries = () => {
  // 移除已有的图表库脚本
  const existingScripts = document.querySelectorAll('script[src*="lightweight-charts"]')
  existingScripts.forEach(script => script.remove())
}

const initChart = async () => {
  console.log('【K线排查】开始初始化图表')
  isLoading.value = true
  showError.value = false
  
  try {
    await nextTick()
    
    // 确保DOM元素已加载
    if (!tvChartRef.value || !chartContainer.value) {
      console.log('【K线排查】DOM元素未准备好，300ms后重试')
      setTimeout(initChart, 300)
      return
    }
    
    // 检查轻量级图表是否可用
    if (window.TradingView) {
      console.log('【K线排查】使用TradingView图表库')
      initTradingViewWidget()
      return
    }
    
    // 加载轻量级图表库
    console.log('【K线排查】准备加载轻量级图表库')
    removeExistingChartLibraries()
    
    // 使用v3.8.0版本，这个版本API比较稳定
    const scriptUrl = 'https://unpkg.com/lightweight-charts@3.8.0/dist/lightweight-charts.standalone.production.js'
    
    // 使用Promise包装脚本加载
    const loadScript = new Promise((resolve, reject) => {
      const script = document.createElement('script')
      script.src = scriptUrl
      script.async = true
      
      script.onload = () => {
        console.log('【K线排查】轻量级图表库加载成功')
        resolve()
      }
      
      script.onerror = () => {
        console.error('【K线排查】轻量级图表库加载失败')
        reject(new Error('图表库加载失败'))
      }
      
      document.head.appendChild(script)
    })
    
    // 等待脚本加载完成
    await loadScript
    
    // 验证图表库是否正确加载
    if (!window.LightweightCharts) {
      throw new Error('轻量级图表库未正确加载')
    }
    
    console.log('【K线排查】开始创建轻量级图表')
    
    // 创建图表
    const { createChart } = window.LightweightCharts
    
    if (chart) {
      chart.remove()
      chart = null
    }
    
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
        vertLine: {
          width: 1,
          color: '#4B5563',
          style: 1, // LineStyle.Dashed
        },
        horzLine: {
          width: 1,
          color: '#4B5563',
          style: 1, // LineStyle.Dashed
        },
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
    
    console.log('【K线排查】图表配置:', chartOptions)
    
    // 创建图表实例
    chart = createChart(tvChartRef.value, chartOptions)
    console.log('【K线排查】图表创建成功')
    
    // 创建蜡烛图系列
    candleSeries = chart.addCandlestickSeries({
      upColor: '#26A69A',
      downColor: '#EF5350',
      borderUpColor: '#26A69A',
      borderDownColor: '#EF5350',
      wickUpColor: '#26A69A',
      wickDownColor: '#EF5350',
    })
    console.log('【K线排查】蜡烛图系列创建成功')
    
    // 创建成交量图系列
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
    console.log('【K线排查】成交量图系列创建成功')
    
    // 设置成交量图的比例
    chart.priceScale('volume').applyOptions({
      scaleMargins: {
        top: 0.8, 
        bottom: 0,
      },
    })
    
    // 设置图表尺寸
    const handleResize = () => {
      if (!chartContainer.value || !chart) return
      
      const width = chartContainer.value.clientWidth
      const height = chartContainer.value.clientHeight
      
      chart.resize(width, height)
      console.log('【K线排查】图表大小已调整', { width, height })
    }
    
    // 初始化大小
    handleResize()
    
    // 添加窗口大小变化监听
    if (resizeObserver) {
      resizeObserver.disconnect()
    }
    
    resizeObserver = new ResizeObserver(debounce(handleResize, 200))
    resizeObserver.observe(chartContainer.value)
    
    // 加载历史K线数据
    await loadKlineData()
    
    // 启动K线轮询更新
    startKlinePolling()
    
    // 图表加载完成
    isLoading.value = false
    isLightweightMode = true
    console.log('【K线排查】轻量级图表初始化完成')
    
  } catch (err) {
    console.error('【K线排查】图表初始化失败:', err)
    displayErrorMessage('初始化图表失败: ' + err.message)
  }
}

const displayErrorMessage = (message) => {
  isLoading.value = false
  showError.value = true
  errorMessage.value = message || '加载图表失败，请重试'
  console.error('【K线排查】错误:', message)
}

const initTradingViewWidget = () => {
  if (tvWidget) {
    tvWidget.remove()
    tvWidget = null
  }
  
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
  })
}

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
    const startTime = endTime - 30 * 24 * 60 * 60 * 1000 // 30天数据
    
    const klines = await fetchKlineHistory({
      symbol: props.symbol,
      interval: interval,
      from: startTime,
      to: endTime,
      limit: 1000
    })
    
    console.log('【K线排查】K线数据加载结果', {
      success: !!klines,
      count: klines?.length || 0
    })
    
    if (klines && klines.length > 0) {
      // 转换为图表库所需的格式
      const candleData = klines.map(kline => ({
        time: Math.floor(kline[0] / 1000), // 使用整数时间戳
        open: parseFloat(kline[1]),
        high: parseFloat(kline[2]),
        low: parseFloat(kline[3]),
        close: parseFloat(kline[4]),
        volume: parseFloat(kline[5])
      }))
      
      // 转换成交量数据
      const volumeData = klines.map(kline => ({
        time: Math.floor(kline[0] / 1000), // 使用整数时间戳
        value: parseFloat(kline[5]),
        color: parseFloat(kline[4]) >= parseFloat(kline[1]) ? '#26A69A' : '#EF5350'
      }))
      
      // 设置蜡烛图数据
      console.log('【K线排查】设置K线数据', { count: candleData.length })
      candleSeries.setData(candleData)
      
      // 设置成交量数据
      console.log('【K线排查】设置成交量数据', { count: volumeData.length })
      volumeSeries.setData(volumeData)
      
      // 记录最后更新时间
      if (candleData.length > 0) {
        lastUpdateTime = candleData[candleData.length - 1].time * 1000
        console.log('【K线排查】记录最后更新时间', { lastUpdateTime })
      }
      
      console.log('【K线排查】K线数据设置成功')
    } else {
      console.warn('【K线排查】未获取到K线数据')
    }
  } catch (error) {
    console.error('【K线排查】加载K线数据失败:', error)
  }
}

const updateKlineData = async () => {
  if (!props.symbol || !candleSeries || !isLightweightMode) {
    return
  }
  
  try {
    const interval = getTimeFrameValue()
    const endTime = Date.now()
    const startTime = lastUpdateTime ? lastUpdateTime : endTime - 24 * 60 * 60 * 1000
    
    console.log('【K线排查】更新K线数据', { 
      symbol: props.symbol, 
      interval, 
      from: new Date(startTime).toISOString(),
      to: new Date(endTime).toISOString()
    })
    
    const klines = await fetchKlineHistory({
      symbol: props.symbol,
      interval: interval,
      from: startTime,
      to: endTime,
      limit: 100
    })
    
    if (klines && klines.length > 0) {
      console.log('【K线排查】获取到新的K线数据', { count: klines.length })
      
      // 更新每根K线
      for (const kline of klines) {
        const time = Math.floor(kline[0] / 1000) // 使用整数时间戳
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
      lastUpdateTime = Math.floor(lastKline[0])
      
      console.log('【K线排查】K线数据更新成功')
    }
    
    // 更新当前价格线
    if (tradeStore.klineTicker && candleSeries) {
      const currentPrice = parseFloat(tradeStore.klineTicker.close)
      
      if (currentPrice > 0) {
        // 可选：添加当前价格线
        // candleSeries.createPriceLine({
        //   price: currentPrice,
        //   color: '#2196F3',
        //   lineWidth: 1,
        //   lineStyle: 1, // LineStyle.Dashed
        //   axisLabelVisible: true,
        //   title: '当前价格',
        // })
      }
    }
  } catch (error) {
    console.error('【K线排查】更新K线数据失败:', error)
  }
}

const startKlinePolling = () => {
  if (klineInterval) {
    clearInterval(klineInterval)
  }
  
  console.log('【K线排查】启动K线数据轮询')
  
  // 定时更新
  klineInterval = setInterval(() => {
    if (isLightweightMode) {
      updateKlineData()
    }
  }, 10000) // 10秒更新一次
}

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

onMounted(() => {
  console.log('【K线排查】组件挂载，初始化图表')
  initChart()
})

onBeforeUnmount(() => {
  console.log('【K线排查】组件卸载，清理资源')
  
  if (klineInterval) {
    clearInterval(klineInterval)
    klineInterval = null
  }
  
  if (resizeObserver) {
    resizeObserver.disconnect()
    resizeObserver = null
  }
  
  if (chart) {
    try {
      chart.remove()
    } catch (e) {
      console.error('【K线排查】销毁图表失败', e)
    }
    chart = null
  }
  
  if (tvWidget) {
    try {
      tvWidget.remove()
    } catch (e) {
      console.error('【K线排查】销毁TradingView失败', e)
    }
    tvWidget = null
  }
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