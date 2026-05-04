const purgecss = require('@fullhuman/postcss-purgecss');

module.exports = {
  style: {
    postcss: {
      plugins: [
        require('postcss-preset-env')({
          autoprefixer: {
            flexbox: 'no-2009',
          },
          stage: 3,
        }),
        ...(process.env.NODE_ENV === 'production' ? [
          purgecss({
            content: [
              './public/**/*.html',
              './src/**/*.js',
              './src/**/*.jsx',
              './src/**/*.ts',
              './src/**/*.tsx',
            ],
            defaultExtractor: content => content.match(/[\w-/:]+(?<!:)/g) || [],
            // safelist: {
            //   standard: [/^ant-/], // Uncomment and adjust if you use Ant Design or other UI libraries
            //   deep: [/^ant-/],
            // },
          }),
        ] : []),
      ],
    },
  },
};