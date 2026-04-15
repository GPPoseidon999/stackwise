// 包名 → 技术栈名称映射表
// key: package.json 中的包名（或包名前缀）
// value: standards-repo 中对应的目录名

export const STACK_MAP = {
  // 框架
  'react': 'react',
  'next': 'nextjs',
  'vue': 'vue',
  'nuxt': 'nuxt',

  // TypeScript
  'typescript': 'typescript',

  // 状态管理
  'zustand': 'zustand',
  'jotai': 'jotai',
  '@reduxjs/toolkit': 'redux-toolkit',
  'recoil': 'recoil',
  'mobx': 'mobx',

  // 数据请求
  '@tanstack/react-query': 'react-query',
  'swr': 'swr',
  'axios': 'axios',
  'ky': 'ky',

  // 组件库
  '@shadcn/ui': 'shadcn',
  'shadcn-ui': 'shadcn',
  '@radix-ui/react-primitive': 'radix',
  '@mui/material': 'mui',
  'antd': 'antd',
  '@ant-design/react': 'antd',

  // 表单
  'react-hook-form': 'react-hook-form',
  'formik': 'formik',

  // 验证
  'zod': 'zod',
  'yup': 'yup',

  // 样式
  'tailwindcss': 'tailwind',
  'styled-components': 'styled-components',

  // 测试
  'vitest': 'vitest',
  'jest': 'jest',
  '@playwright/test': 'playwright',
  'cypress': 'cypress',

  // 构建工具
  'vite': 'vite',
  'turbopack': 'turbopack',

  // 路由
  'react-router-dom': 'react-router',
  'react-router': 'react-router',

  // GraphQL / Apollo
  'graphql': 'graphql',
  'graphql-request': 'graphql',
  'graphql-tag': 'graphql',
  '@apollo/client': 'apollo',
  'apollo-client': 'apollo',
  'apollo-cache-inmemory': 'apollo',
  'apollo-link-http': 'apollo',

  // Web3
  'ethers': 'ethers',
  'web3': 'web3',
  '@web3-react/core': 'web3-react',
  'wagmi': 'wagmi',
  'viem': 'viem',

  // 图表
  'echarts': 'echarts',
  'chart.js': 'chartjs',
  'react-chartjs-2': 'chartjs',
  'd3': 'd3',
  'recharts': 'recharts',

  // 数字精度
  'bignumber.js': 'bignumber',
  'decimal.js': 'bignumber',
  'bn.js': 'bignumber',

  // 工具库
  'date-fns': 'date-fns',
  'dayjs': 'dayjs',
  'lodash': 'lodash',
  'immer': 'immer',

  // 后端框架（Node.js）
  'express': 'express',
  'fastify': 'fastify',
  'koa': 'koa',
  'nestjs': 'nestjs',
  '@nestjs/core': 'nestjs',

  // ORM / 数据库
  'prisma': 'prisma',
  '@prisma/client': 'prisma',
  'drizzle-orm': 'drizzle',
  'typeorm': 'typeorm',
  'mongoose': 'mongoose',

  // 其他前端
  'framer-motion': 'framer-motion',
  '@tanstack/react-table': 'tanstack-table',
  'react-virtualized': 'virtualization',
  '@tanstack/react-virtual': 'virtualization',
};

// 按重要程度排序（展示时的顺序）
export const STACK_PRIORITY = [
  // 框架
  'react', 'nextjs', 'vue', 'nuxt',
  'typescript',
  // 状态管理
  'zustand', 'jotai', 'redux-toolkit', 'recoil', 'mobx',
  // 数据请求
  'react-query', 'swr', 'axios', 'ky',
  // GraphQL
  'graphql', 'apollo',
  // Web3
  'ethers', 'web3', 'web3-react', 'wagmi', 'viem',
  // 组件库
  'shadcn', 'radix', 'mui', 'antd',
  // 表单 & 验证
  'react-hook-form', 'formik', 'zod', 'yup',
  // 样式
  'tailwind', 'styled-components', 'framer-motion',
  // 图表
  'echarts', 'chartjs', 'd3', 'recharts',
  // 数字精度
  'bignumber',
  // 测试
  'vitest', 'jest', 'playwright', 'cypress',
  // 构建 & 路由
  'vite', 'turbopack', 'react-router',
  // 工具库
  'date-fns', 'dayjs', 'lodash', 'immer',
  // 后端
  'express', 'fastify', 'koa', 'nestjs',
  'prisma', 'drizzle', 'typeorm', 'mongoose',
  // 其他
  'tanstack-table', 'virtualization',
];
