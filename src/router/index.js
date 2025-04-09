import { createRouter, createWebHashHistory } from 'vue-router'
import routes from './routes'
import { getAcount } from '@/plugin/chain'
import { signUp } from '@/api/user'
import { useUserStore } from '@/store/user/index'
import { noLoginRouterList } from './whiteList'
import { showToast } from 'vant'
import { DISABLED_NO_WALLET } from '@/config'
import { dispatchCustomEvent } from '@/utils'
/**
 * 路由实例
 */
const router = createRouter({
  history: createWebHashHistory(),
  routes: routes,
  scrollBehavior(to, from, savedPosition) {
    // 始终滚动到顶部
    return { top: 0 }
  }
})

router.beforeEach(async (to, from, next) => {
  // 开启 Progress
  const userStore = useUserStore()
  if (to.path == '/no-wallet') {
    next()
  } else if (userStore.isSign) {
    // 已登录
    userStore.getUserInfo()

    if (to.path.indexOf('/i&') > -1) {
      next({ path: '/', replace: true })
    } else {
      next()
    }
  } else {
    // 未登录
    const acountRes = await getAcount()
    console.log(acountRes)
    if (acountRes == 'no-wallet') {
      // 非钱包
      if (to.path.indexOf('/i&') > -1) {
        let activeCode = to.path.replace('/i&', '')
        next({ path: '/sign-up', query: { invite_code: activeCode }, replace: true })
      } else if (DISABLED_NO_WALLET.includes(__config._APP_ENV)) {
        next('/no-wallet')
      } else {
        if (!noLoginRouterList.includes(to.path)) {
          next('/sign-in')
        } else {
          next()
        }
      }
    } else {
      // 钱包 必登录
      let params = {}
      if (to.path.indexOf('/i&') > -1) {
        let activeCode = to.path.replace('/i&', '')
        params = {
          activeCode: activeCode,
          signType: 0,
          address: acountRes.data.address,
          walletType: acountRes.data.type
        }
      } else {
        params = { signType: 0, address: acountRes.data.address, walletType: acountRes.data.type }
      }
      try {
        const singUpRes = await signUp(params)
        if (singUpRes.code == 200 && singUpRes.data.satoken) {
          // 登录成功
          dispatchCustomEvent('event_toastChange', { name: 'login_success' })
          let token = singUpRes.data.satoken
          userStore.setIsSign(true)
          userStore.setToken(token)
          userStore.getUserInfo()
          next('/')
        } else {
          showToast(singUpRes.msg)
        }
        next()
      } catch (error) {
        console.log(error)
        next()
      }
    }
  }
})

router.afterEach((to) => {
  if (to.meta.title) {
    document.title = to.meta.title
  }
})

export default router