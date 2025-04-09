import CryptoJS from 'crypto-js'
import { useUserStore } from '@/store/user'

/**
 * 生成API请求签名
 * @param {Object} params 请求参数
 * @returns {string} 签名字符串
 */
export function generateSignature(params = {}) {
  const userStore = useUserStore()
  // 获取API密钥，如果用户未登录则使用默认的公共密钥
  const apiSecret = userStore.token ? userStore.userInfo.apiSecret : process.env.VUE_APP_PUBLIC_API_SECRET
  
  if (!apiSecret) {
    console.warn('未找到API密钥，将使用未签名请求')
    return ''
  }
  
  // 1. 将所有参数按键名的字母顺序排序
  const sortedParams = {}
  Object.keys(params)
    .sort()
    .forEach(key => {
      // 过滤掉值为null或undefined的参数
      if (params[key] !== null && params[key] !== undefined) {
        sortedParams[key] = params[key]
      }
    })
  
  // 2. 将排序后的参数转换为查询字符串格式
  let queryString = Object.keys(sortedParams)
    .map(key => `${key}=${encodeURIComponent(sortedParams[key])}`)
    .join('&')
  
  // 3. 使用API密钥进行HMAC-SHA256签名
  const signature = CryptoJS.HmacSHA256(queryString, apiSecret).toString(CryptoJS.enc.Hex)
  
  return signature
}

/**
 * 验证服务器返回的签名
 * @param {Object} data 返回的数据对象
 * @param {string} serverSignature 服务器返回的签名
 * @returns {boolean} 签名是否有效
 */
export function verifySignature(data, serverSignature) {
  if (!data || !serverSignature) {
    return false
  }
  
  // 删除签名字段以计算新签名
  const { signature, ...restData } = data
  
  // 使用相同的方法生成签名
  const calculatedSignature = generateSignature(restData)
  
  // 比较两个签名是否一致
  return calculatedSignature === serverSignature
}

/**
 * 为WebSocket消息生成签名
 * @param {Object} message WebSocket消息对象
 * @returns {Object} 添加了签名的消息对象
 */
export function signWebSocketMessage(message) {
  if (!message) {
    return message
  }
  
  // 添加时间戳
  const messageWithTimestamp = {
    ...message,
    timestamp: Date.now()
  }
  
  // 生成签名
  const signature = generateSignature(messageWithTimestamp)
  
  // 添加签名到消息中
  return {
    ...messageWithTimestamp,
    signature
  }
}