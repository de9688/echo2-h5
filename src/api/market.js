import request from '@/utils/request'
import { generateSignature } from '@/utils/signature'

/**
 * 获取K线历史数据
 * @param {Object} params 
 * @param {string} params.symbol 交易对名称
 * @param {string} params.interval K线周期（1m、5m、15m、30m、1h、4h、1d、1w、1M）
 * @param {number} params.from 开始时间戳（毫秒）
 * @param {number} params.to 结束时间戳（毫秒）
 * @param {number} params.limit 获取数量（默认500，最大1000）
 * @returns {Promise} 返回K线数据数组
 */
export function fetchKlineHistory(params) {
  // 记录API调用
  console.log('获取K线历史数据:', params)
  
  // 添加签名
  const timestamp = Date.now()
  const signature = generateSignature({
    ...params,
    timestamp
  })
  
  return request({
    url: '/api/v1/market/kline',
    method: 'get',
    params: {
      ...params,
      timestamp,
      signature
    }
  }).then(res => {
    if (res.code === 200 && Array.isArray(res.data)) {
      return res.data
    } else {
      console.error('K线数据获取失败:', res)
      return []
    }
  }).catch(error => {
    console.error('K线数据请求异常:', error)
    return []
  })
}

/**
 * 获取24小时行情数据
 * @param {string} symbol 交易对名称
 * @returns {Promise} 返回行情数据
 */
export function fetch24hTicker(symbol) {
  const params = { symbol }
  
  // 添加签名
  const timestamp = Date.now()
  const signature = generateSignature({
    ...params,
    timestamp
  })
  
  return request({
    url: '/api/v1/market/ticker',
    method: 'get',
    params: {
      ...params,
      timestamp,
      signature
    }
  }).then(res => {
    if (res.code === 200) {
      return res.data
    } else {
      console.error('24小时行情数据获取失败:', res)
      return null
    }
  }).catch(error => {
    console.error('24小时行情数据请求异常:', error)
    return null
  })
}

/**
 * 获取市场深度数据
 * @param {Object} params
 * @param {string} params.symbol 交易对名称
 * @param {number} params.limit 获取数量（默认100，最大1000）
 * @returns {Promise} 返回深度数据
 */
export function fetchMarketDepth(params) {
  // 添加签名
  const timestamp = Date.now()
  const signature = generateSignature({
    ...params,
    timestamp
  })
  
  return request({
    url: '/api/v1/market/depth',
    method: 'get',
    params: {
      ...params,
      timestamp,
      signature
    }
  }).then(res => {
    if (res.code === 200) {
      return res.data
    } else {
      console.error('市场深度数据获取失败:', res)
      return { asks: [], bids: [] }
    }
  }).catch(error => {
    console.error('市场深度数据请求异常:', error)
    return { asks: [], bids: [] }
  })
}

/**
 * 获取最新成交记录
 * @param {Object} params
 * @param {string} params.symbol 交易对名称
 * @param {number} params.limit 获取数量（默认20，最大100）
 * @returns {Promise} 返回成交记录数组
 */
export function fetchRecentTrades(params) {
  // 添加签名
  const timestamp = Date.now()
  const signature = generateSignature({
    ...params,
    timestamp
  })
  
  return request({
    url: '/api/v1/market/trades',
    method: 'get',
    params: {
      ...params,
      timestamp,
      signature
    }
  }).then(res => {
    if (res.code === 200 && Array.isArray(res.data)) {
      return res.data
    } else {
      console.error('最新成交记录获取失败:', res)
      return []
    }
  }).catch(error => {
    console.error('最新成交记录请求异常:', error)
    return []
  })
}