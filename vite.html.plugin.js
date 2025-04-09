import { loadEnv } from 'vite';

const customHtmlPlugin = (mode) => {
  // 加载当前模式下的环境变量
  const envObj = loadEnv(mode, process.cwd());

  return {
    name: 'custom-html-plugin',
    transformIndexHtml(html) {
      // 输出标题，检查是否正确加载
      console.log('Title:', envObj['VITE_APP_META_TITLE']);
      return generateHtml(html, envObj);
    },
  };
};

const generateHtml = (html, envObj) => {
  // 获取环境变量中的标题、关键词和描述
  let title = envObj['VITE_APP_META_TITLE'];
  let keywords = envObj['VITE_APP_META_KEYWORDS'];
  let description = envObj['VITE_APP_META_DESCRIPTION'];
  let platform = "dev"; // 默认平台
  let version = `2.0.${+new Date()}`; // 当前版本

  // 替换 HTML 中的占位符为实际数据
  return html
    .replace(
      '<head>',
      `
      <head>
      <meta name="keywords" content="${keywords}" /> 
      <meta name="description" content="${description}" />
      <title>${title}</title>
      <meta content="/platform/${platform}/logo.png?${version}" itemprop="image">
      `
    )
    .replace(
      '</head>',
      `
      <meta property="og:image" content="/platform/${platform}/logo_144.png?${version}">
      <meta property="og:title" content="${title}">
      <meta property="og:description" content="${description}">

      <link rel="icon" href="./platform/${platform}/favicon.ico?${version}" type="image/x-icon"/>
      <link rel="bookmark" href="./platform/${platform}/favicon.ico?${version}" type="image/x-icon">

      <link rel="apple-touch-icon-precomposed" href="/platform/${platform}/logo_57.png?${version}"/>
      <link rel="apple-touch-icon-precomposed" sizes="72x72" href="/platform/${platform}/logo_72.png?${version}"/>
      <link rel="apple-touch-icon-precomposed" sizes="120x120" href="/platform/${platform}/logo_120.png?${version}"/>
      <link rel="apple-touch-icon-precomposed" sizes="144x144" href="/platform/${platform}/logo_144.png?${version}"/>
      
      </head>

      <script>
        Object.defineProperty(window, '_APP_VERSION', {
          value: '${version}',
          writable: false,
          configurable: false
        });
        function addLink(rel, href) {
          const domLink = document.createElement('link');
          domLink.rel = rel;
          domLink.href = href;
          document.head.appendChild(domLink);
        }
        function addMeta(name, content) {
          const domMeta = document.createElement('meta');
          domMeta.name = name;
          domMeta.content = content;
          document.head.appendChild(domMeta);
        }

        [
          {
            name: 'copyright',
            content: \`© \${new Date().getFullYear()} \${location.host}\`
          },
        ].forEach((elem) => addMeta(elem.name, elem.content));
        
        [
          {
            rel: 'dns-prefetch',
            href: \`//api.\${location.host}\`
          },
          {
            rel: 'preconnect',
            href: \`//api.\${location.host}\`
          }
        ].forEach((elem) => addLink(elem.rel, elem.href));
      </script>
     `.replace(/[\n]+/g, '')
    );
};

export { customHtmlPlugin };